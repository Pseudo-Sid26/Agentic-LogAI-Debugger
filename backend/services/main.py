from datetime import datetime, timedelta
from typing import Optional

from fastapi import FastAPI, Query, Body, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import os

from loki_client import LokiClient
from .file_source import (
	query_range as file_query_range,
	get_metrics as file_get_metrics,
	get_label_values as file_get_label_values,
	DEFAULT_LOG_PATH,
	LINE_RE,
	recent_entries as file_recent_entries,
	time_bounds as file_time_bounds,
)


# Load environment variables from a local .env file if present
load_dotenv()

app = FastAPI(title=os.getenv("API_TITLE", "LogAnalytics API"), version=os.getenv("API_VERSION", "0.1.0"))

# CORS for local dev (Vite:5173, CRA:3000) – adjust as needed
origins = [o for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000").split(",") if o]

app.add_middleware(
	CORSMiddleware,
	allow_origins=origins,
	allow_credentials=True,
	allow_methods=["*"],
	allow_headers=["*"],
)


class LogsQuery(BaseModel):
	query: str = os.getenv('DEFAULT_LOKI_QUERY', '{job="simulated_system"}')
	minutes: int = int(os.getenv('DEFAULT_LOOKBACK_MINUTES', str(24 * 60)))
	limit: int = int(os.getenv('DEFAULT_QUERY_LIMIT', '1000'))


# ---------- Helper utilities for resolutions ----------
import os
import json
from glob import glob
from pathlib import Path
import time
import hashlib


def _repo_root() -> Path:
	return Path(__file__).resolve().parents[2]


def _agent_dir() -> Path:
	return _repo_root() / "agent_with_toolkit"


def _latest_analysis_file() -> Path | None:
	files = sorted(
		(Path(_agent_dir())).glob("error_analysis_*.json"),
		key=lambda p: p.name,
		reverse=True,
	)
	return files[0] if files else None


def _resolved_state_path() -> Path:
	return _repo_root() / "data" / "resolved.json"


def _load_resolved() -> set[str]:
	try:
		with open(_resolved_state_path(), "r", encoding="utf-8") as f:
			return set(json.load(f))
	except Exception:
		return set()


def _save_resolved(s: set[str]):
	p = _resolved_state_path()
	p.parent.mkdir(parents=True, exist_ok=True)
	with open(p, "w", encoding="utf-8") as f:
		json.dump(sorted(list(s)), f, indent=2)


def _fingerprint(item: dict) -> str:
	"""Create a stable fingerprint for a resolution item."""
	key = "|".join([
		str(item.get("file_location", "")),
		str(item.get("line_number", "")),
		str(item.get("error_type", "")),
		(item.get("related_code", "") or "")[:200],
	])
	return hashlib.sha256(key.encode("utf-8", errors="ignore")).hexdigest()


# ---------- File source selection & uploads ----------

def _uploads_dir() -> Path:
	p = _repo_root() / "data" / "uploads"
	p.mkdir(parents=True, exist_ok=True)
	return p


def _state_path() -> Path:
	return _uploads_dir() / "state.json"


def _read_state() -> dict:
	try:
		with open(_state_path(), "r", encoding="utf-8") as f:
			return json.load(f)
	except Exception:
		return {}


def _write_state(state: dict) -> None:
	try:
		with open(_state_path(), "w", encoding="utf-8") as f:
			json.dump(state, f, indent=2)
	except Exception:
		pass


def _get_active_file() -> str:
	st = _read_state()
	p = st.get("active_file")
	return p if (p and os.path.isfile(p)) else str(DEFAULT_LOG_PATH)


def _set_active_file(path: str) -> None:
	st = _read_state()
	st["active_file"] = path
	_write_state(st)


def _flatten_analysis_payload(data):
	"""Normalize different analysis JSON shapes to a list of error dicts."""
	if isinstance(data, list):
		return data
	if isinstance(data, dict):
		if "json_object" in data:
			obj = data["json_object"]
			if isinstance(obj, str):
				try:
					obj = json.loads(obj)
				except Exception:
					return []
			data = obj
		# Flatten dict mapping file->list
		if isinstance(data, dict):
			items = []
			for _, v in data.items():
				if isinstance(v, list):
					items.extend(v)
				else:
					items.append(v)
			return items
	return []


@app.get("/api/health")
def health():
	return {"status": "ok", "time": datetime.utcnow().isoformat()}


@app.get("/api/logs")
def get_logs(
	query: str = Query(default='{job="simulated_system"}', description="LogQL query"),
	minutes: int = Query(default=24 * 60, ge=1, le=60 * 24 * 30, description="Lookback minutes"),
	limit: int = Query(default=1000, ge=1, le=5000),
	source: str = Query(default="auto", pattern="^(auto|file|loki)$", description="Data source: auto, file, or loki"),
):
	"""Return logs from Loki for the last N minutes, with a simple level extraction."""
	rows = []
	# In auto mode, prefer user-selected file if one was set via state.json
	prefer_file_first = source == "auto" and bool(_read_state().get("active_file"))
	if source in ("auto", "file") and prefer_file_first:
		end_local = datetime.now()
		start_local = end_local - timedelta(minutes=minutes)
		rows = file_query_range(query=query, start=start_local, end=end_local, limit=limit, path=_get_active_file())
	# Then try Loki if allowed and still empty
	if source in ("auto", "loki") and not rows:
		client = LokiClient()
		end_time = datetime.utcnow()
		start_time = end_time - timedelta(minutes=minutes)
		rows = client.query_range(query=query, start=start_time, end=end_time, limit=limit)
	# Finally fallback to file if allowed and still empty
	if source in ("auto", "file") and not rows:
		# Last resort: recent entries ignoring time window
		rows = file_recent_entries(limit=limit, path=_get_active_file())

	def level_of(msg: str) -> str:
		m = msg.upper()
		if "ERROR" in m:
			return "error"
		if "WARN" in m:
			return "warning"
		return "info"

	data = []
	for r in rows:
		labels = r.get("labels", {})
		message = r.get("log", "")
		lvl = labels.get("level") or level_of(message)
		data.append(
			{
				"timestamp": r.get("timestamp"),
				"message": message,
				"level": lvl,
				"service": labels.get("job") or labels.get("application") or "unknown",
				"labels": labels,
			}
		)
	# FastAPI/Pydantic will ISO-serialize datetimes
	return {"items": data, "count": len(data)}


@app.get("/api/metrics")
def get_metrics(
	minutes: int = Query(default=24 * 60, ge=1, le=60 * 24 * 30),
	interval: str = Query(default="5m"),
	source: str = Query(default="auto", pattern="^(auto|file|loki)$", description="Data source: auto, file, or loki"),
):
	"""Return simple level timeseries computed by Loki using count_over_time."""
	# Choose source with correct precedence and windows
	metrics = {"errors": [], "warnings": [], "info": []}

	def has_points(m: dict) -> bool:
		series = m.get("errors", []) + m.get("warnings", []) + m.get("info", [])
		if not series:
			return False
		# Consider populated only if there are any non-zero values
		return any(v > 0 for _, v in series)

	end_local = datetime.now()
	start_local = end_local - timedelta(minutes=minutes)
	active_file = bool(_read_state().get("active_file"))

	# 1) File path
	if source == "file" or (source == "auto" and active_file):
		metrics = file_get_metrics(start=start_local, end=end_local, interval=interval, path=_get_active_file())

	# 2) Loki path
	if not has_points(metrics) and (source == "loki" or source == "auto"):
		client = LokiClient()
		end_time = datetime.utcnow()
		start_time = end_time - timedelta(minutes=minutes)
		metrics = client.get_metrics(start=start_time, end=end_time, interval=interval)

	# 3) Fallback: full file time-bounds if still empty and file is allowed
	if not has_points(metrics) and (source == "file" or source == "auto"):
		bounds = file_time_bounds(path=_get_active_file())
		if bounds:
			metrics = file_get_metrics(start=bounds[0], end=bounds[1], interval=interval, path=_get_active_file())
	# If we only have a single bucket, pad with surrounding zero buckets for better chart UX
	def parse_delta(s: str):
		try:
			n = int(s[:-1]); u = s[-1]
			return timedelta(minutes=n) if u == 'm' else timedelta(hours=n)
		except Exception:
			return timedelta(minutes=5)

	def pad_single_bucket(m: dict, interval_str: str) -> dict:
		series_lens = [len(m.get(k, [])) for k in ("errors", "warnings", "info")]
		if max(series_lens or [0]) > 1:
			return m
		# Center timestamp: pick the first available ts or now
		ts0 = None
		for k in ("errors", "warnings", "info"):
			if m.get(k):
				ts0 = m[k][0][0]
				break
		if not ts0:
			ts0 = datetime.utcnow()
		delta = parse_delta(interval_str)
		buckets = [ts0 + delta * i for i in (-2, -1, 0, 1, 2)]
		# Sum original single values (if present)
		vals = {k: (m.get(k)[0][1] if m.get(k) else 0) for k in ("errors", "warnings", "info")}
		return {
			"errors": [(t, vals["errors"] if i == 2 else 0) for i, t in enumerate(buckets)],
			"warnings": [(t, vals["warnings"] if i == 2 else 0) for i, t in enumerate(buckets)],
			"info": [(t, vals["info"] if i == 2 else 0) for i, t in enumerate(buckets)],
		}

	metrics = pad_single_bucket(metrics, interval)

	# Ensure timestamps are ISO strings for the frontend
	def serialize(series):
		return [(ts.isoformat() if hasattr(ts, "isoformat") else ts, val) for ts, val in series]

	return {
		"errors": serialize(metrics.get("errors", [])),
		"warnings": serialize(metrics.get("warnings", [])),
		"info": serialize(metrics.get("info", [])),
	}


@app.get("/api/labels/{label}")
def get_label_values(label: str):
	client = LokiClient()
	values = client.get_label_values(label) or file_get_label_values(label, path=_get_active_file())
	return {"label": label, "values": values}


@app.get("/api/loki/status")
def loki_status():
	"""Quick connectivity check for Loki: version & basic health."""
	import requests
	client = LokiClient()
	info = {"url": client.url}
	try:
		r = requests.get(f"{client.url}/ready")
		info["ready"] = r.status_code == 200
	except Exception as e:
		info["ready"] = False
		info["error"] = str(e)
	try:
		r2 = requests.get(f"{client.url}/loki/api/v1/status/buildinfo")
		if r2.ok:
			info["buildinfo"] = r2.json().get("version", "unknown")
	except Exception:
		pass
	return info


@app.get("/api/resolutions")
def get_resolutions():
	"""Return recommended resolutions from the latest analysis JSON produced by the agent toolkit."""
	path = _latest_analysis_file()
	if not path:
		return {"items": [], "count": 0}
	try:
		with open(path, "r", encoding="utf-8") as f:
			data = json.load(f)
		items = _flatten_analysis_payload(data)
		resolved = _load_resolved()
		# Attach fingerprint and filter out resolved ones
		annotated = []
		for it in items:
			fp = _fingerprint(it)
			if fp in resolved:
				continue
			it["_fp"] = fp
			annotated.append(it)
		return {"items": annotated, "count": len(annotated), "source": path.name}
	except Exception:
		return {"items": [], "count": 0}


class FixPayload(BaseModel):
	file_location: str
	related_code: str | None = None
	code_suggestion: str | None = ""
	instruction: str | None = ""
	use_llm: bool = False
	create_backup: bool = True
	fingerprint: str | None = None


@app.post("/api/fix/apply")
def apply_fix(payload: FixPayload):
	"""Apply a suggested fix using the toolkit. Returns success and diff."""
	# Local import to avoid backend hard dependency if toolkit isn’t present
	try:
		from agent_with_toolkit.ToolKit import apply_code_fix  # type: ignore
		# Optional LLM-assisted path
		try:
			from agent_with_toolkit.ToolKit import apply_fix_with_llm, preview_code_fix  # type: ignore
		except Exception:
			apply_fix_with_llm = None  # type: ignore
			preview_code_fix = None  # type: ignore
	except Exception as e:
		return {"success": False, "message": f"Toolkit not available: {e}"}

	# If requested (or no code_suggestion provided), try LLM-assisted suggestion first
	if (payload.use_llm or not payload.code_suggestion) and apply_fix_with_llm is not None:
		try:
			res = apply_fix_with_llm(
				file_path=payload.file_location,
				related_code=payload.related_code or "",
				instruction=payload.instruction or "",
				create_backup=payload.create_backup,
			)
			return json.loads(res)
		except Exception:
			# Fall back to direct apply if LLM path fails for any reason
			pass

	res = apply_code_fix(
		file_path=payload.file_location,
		related_code=payload.related_code or "",
		code_suggestion=payload.code_suggestion or "",
		create_backup=payload.create_backup,
	)
	try:
		result = json.loads(res)
		# On success, record this resolution as resolved (if we can fingerprint it)
		if result.get("success"):
			it = {
				"file_location": payload.file_location,
				"line_number": None,
				"error_type": "",
				"related_code": payload.related_code or "",
			}
			fp = payload.fingerprint or _fingerprint(it)
			s = _load_resolved(); s.add(fp); _save_resolved(s)
		return result
	except Exception:
		return {"success": False, "message": "Invalid tool response"}


class MarkResolvedPayload(BaseModel):
	fingerprint: str


@app.post("/api/resolutions/mark-resolved")
def mark_resolved(payload: MarkResolvedPayload):
	s = _load_resolved(); s.add(payload.fingerprint); _save_resolved(s)
	return {"ok": True}


@app.post("/api/fix/preview")
def preview_fix(payload: FixPayload):
	"""Return a unified diff for the proposed fix without modifying files."""
	try:
		from agent_with_toolkit.ToolKit import preview_code_fix  # type: ignore
	except Exception as e:
		return {"success": False, "message": f"Toolkit not available: {e}"}
	res = preview_code_fix(
		file_path=payload.file_location,
		related_code=payload.related_code or "",
		code_suggestion=payload.code_suggestion or "",
		instruction=payload.instruction or "",
		use_llm=payload.use_llm,
	)
	try:
		return json.loads(res)
	except Exception:
		return {"success": False, "message": "Invalid tool response"}


@app.get("/api/logs/source")
def get_file_source():
	"""Return the current active log file used by the file source, with stats."""
	p = _get_active_file()
	try:
		st = os.stat(p)
		size = st.st_size
		mtime = datetime.fromtimestamp(st.st_mtime).isoformat()
	except Exception:
		size = 0
		mtime = None
	return {"active_file": p, "exists": os.path.isfile(p), "size": size, "mtime": mtime}


class FileSourcePayload(BaseModel):
	path: str


@app.post("/api/logs/source")
def set_file_source(payload: FileSourcePayload):
	"""Set the active log file for the file source."""
	p = payload.path
	if not os.path.isfile(p):
		raise HTTPException(status_code=400, detail="Path does not exist or is not a file")
	_set_active_file(os.path.abspath(p))
	return {"ok": True, "active_file": _get_active_file()}


@app.post("/api/logs/upload")
async def upload_log_file(file: UploadFile = File(...)):
	"""Upload a log file and switch the file source to it."""
	if not file.filename:
		raise HTTPException(status_code=400, detail="Missing filename")
	# Only allow simple text-like extensions
	fname = os.path.basename(file.filename)
	ts = time.strftime("%Y%m%d_%H%M%S")
	safe_name = f"{ts}_{fname}"
	target = _uploads_dir() / safe_name
	content = await file.read()
	try:
		with open(target, "wb") as f:
			f.write(content)
	except Exception as e:
		raise HTTPException(status_code=500, detail=f"Failed to save file: {e}")
	_set_active_file(str(target))
	# Quick parse stats to help frontend UX
	total_lines = 0
	matched = 0
	try:
		with open(target, "r", encoding="utf-8", errors="ignore") as f:
			for i, line in enumerate(f, 1):
				total_lines = i
				if LINE_RE.match(line.rstrip("\n")):
					matched += 1
				if i >= 2000:  # sample first 2k lines
					break
	except Exception:
		pass
	return {
		"ok": True,
		"stored_as": str(target),
		"active_file": _get_active_file(),
		"bytes": len(content),
		"sampled_lines": total_lines,
		"matched_lines": matched,
	}


# Optional: uvicorn entrypoint (not used if launched via uvicorn CLI)
if __name__ == "__main__":
	import uvicorn

	uvicorn.run(app, host="0.0.0.0", port=8000)


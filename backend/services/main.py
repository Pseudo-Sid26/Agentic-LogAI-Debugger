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
	# Choose source
	if source in ("auto", "loki"):
		client = LokiClient()
		end_time = datetime.utcnow()
		start_time = end_time - timedelta(minutes=minutes)
		rows = client.query_range(query=query, start=start_time, end=end_time, limit=limit)
	if source in ("auto", "file") and not rows:
		# File source uses local timestamps
		end_local = datetime.now()
		start_local = end_local - timedelta(minutes=minutes)
		rows = file_query_range(query=query, start=start_local, end=end_local, limit=limit, path=_get_active_file())

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
	# Choose source
	metrics = {"errors": [], "warnings": [], "info": []}
	if source in ("auto", "loki"):
		client = LokiClient()
		end_time = datetime.utcnow()
		start_time = end_time - timedelta(minutes=minutes)
		metrics = client.get_metrics(start=start_time, end=end_time, interval=interval)
	if source in ("auto", "file") and not any(metrics.values()):
		end_local = datetime.now()
		start_local = end_local - timedelta(minutes=minutes)
		metrics = file_get_metrics(start=start_local, end=end_local, interval=interval, path=_get_active_file())
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
		return {"items": items, "count": len(items), "source": path.name}
	except Exception:
		return {"items": [], "count": 0}


class FixPayload(BaseModel):
	file_location: str
	related_code: str | None = None
	code_suggestion: str
	create_backup: bool = True


@app.post("/api/fix/apply")
def apply_fix(payload: FixPayload):
	"""Apply a suggested fix using the toolkit. Returns success and diff."""
	# Local import to avoid backend hard dependency if toolkit isn’t present
	try:
		from agent_with_toolkit.ToolKit import apply_code_fix  # type: ignore
	except Exception as e:
		return {"success": False, "message": f"Toolkit not available: {e}"}

	res = apply_code_fix(
		file_path=payload.file_location,
		related_code=payload.related_code or "",
		code_suggestion=payload.code_suggestion,
		create_backup=payload.create_backup,
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
	return {"ok": True, "stored_as": str(target), "active_file": _get_active_file(), "bytes": len(content)}


# Optional: uvicorn entrypoint (not used if launched via uvicorn CLI)
if __name__ == "__main__":
	import uvicorn

	uvicorn.run(app, host="0.0.0.0", port=8000)


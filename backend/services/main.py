from datetime import datetime, timedelta
from typing import Optional

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from loki_client import LokiClient


app = FastAPI(title="LogAnalytics API", version="0.1.0")

# CORS for local dev (Vite:5173, CRA:3000) – adjust as needed
origins = [
	"http://localhost:5173",
	"http://127.0.0.1:5173",
	"http://localhost:3000",
	"http://127.0.0.1:3000",
]

app.add_middleware(
	CORSMiddleware,
	allow_origins=origins,
	allow_credentials=True,
	allow_methods=["*"],
	allow_headers=["*"],
)


class LogsQuery(BaseModel):
	query: str = '{job="simulated_system"}'
	minutes: int = 24 * 60
	limit: int = 1000


@app.get("/api/health")
def health():
	return {"status": "ok", "time": datetime.utcnow().isoformat()}


@app.get("/api/logs")
def get_logs(
	query: str = Query(default='{job="simulated_system"}', description="LogQL query"),
	minutes: int = Query(default=24 * 60, ge=1, le=60 * 24 * 30, description="Lookback minutes"),
	limit: int = Query(default=1000, ge=1, le=5000),
):
	"""Return logs from Loki for the last N minutes, with a simple level extraction."""
	client = LokiClient()
	end_time = datetime.utcnow()
	start_time = end_time - timedelta(minutes=minutes)
	rows = client.query_range(query=query, start=start_time, end=end_time, limit=limit)

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
		data.append(
			{
				"timestamp": r.get("timestamp"),
				"message": message,
				"level": level_of(message),
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
):
	"""Return simple level timeseries computed by Loki using count_over_time."""
	client = LokiClient()
	end_time = datetime.utcnow()
	start_time = end_time - timedelta(minutes=minutes)
	metrics = client.get_metrics(start=start_time, end=end_time, interval=interval)
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
	values = client.get_label_values(label)
	return {"label": label, "values": values}


# Optional: uvicorn entrypoint (not used if launched via uvicorn CLI)
if __name__ == "__main__":
	import uvicorn

	uvicorn.run(app, host="0.0.0.0", port=8000)


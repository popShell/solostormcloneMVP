"""
Autocross Telemetry MVP - Flask Backend

Alternative to FastAPI for environments where FastAPI isn't available.
Same API structure, different framework.
"""

import json
import logging
import math
from pathlib import Path
from typing import Optional

import numpy as np
from flask import Flask, jsonify, request

from app.models.telemetry import TelemetryRun, RunSummary
from app.services.repository import RunRepository, init_repository, get_repository
from app.services.csv_parser import parse_trackaddict_csv


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


# Create Flask app
app = Flask(__name__)


# Default data folder
DEFAULT_DATA_FOLDER = Path("./data/runs")


def _nan_to_none(value: float) -> Optional[float]:
    """Convert NaN to None for JSON serialization."""
    if value is None:
        return None
    if math.isnan(value):
        return None
    return value


def _clean_array(arr: np.ndarray) -> list:
    """Convert numpy array to list, replacing NaN with None."""
    return [None if (x is None or math.isnan(x)) else float(x) for x in arr]

def _clean_validity(arr: np.ndarray) -> list:
    """Convert numpy bool array to list."""
    return [bool(x) for x in arr]


def _build_channel_info(run: TelemetryRun) -> dict:
    """Build channel metadata dict."""
    result = {}
    for key, info in run.channel_info.items():
        result[key] = {
            "unit": info.unit,
            "provenance": info.provenance.value,
            "frame": info.frame.value if info.frame is not None else None,
        }
    return result

def _build_metadata_dict(run: TelemetryRun) -> dict:
    """Build metadata dict from TelemetryRun."""
    return {
        "id": run.metadata.id,
        "name": run.metadata.name,
        "source_file": str(run.metadata.source_file),
        "recorded_at": run.metadata.recorded_at.isoformat() if run.metadata.recorded_at else None,
        "duration_s": run.metadata.duration_s,
        "sample_count": run.metadata.sample_count,
        "sample_rate_hz": run.metadata.sample_rate_hz,
        "has_gps": run.metadata.has_gps,
        "has_imu": run.metadata.has_imu,
        "has_speed": run.metadata.has_speed,
        "canonical_version": run.metadata.canonical_version,
        "origin": {
            "lat": run.origin.lat,
            "lon": run.origin.lon,
            "alt": run.origin.alt,
            "manual_override": run.origin.manual_override,
        },
        "bounding_box": run.get_bounding_box(),
        "time_range": run.get_time_range(),
    }


# ============================================================================
# Health Endpoints
# ============================================================================

@app.route("/")
def root():
    """Root endpoint - basic health check."""
    return jsonify({
        "name": "Autocross Telemetry MVP",
        "version": "0.1.0",
        "status": "running",
    })


@app.route("/health")
def health_check():
    """Health check endpoint."""
    repo = get_repository()
    return jsonify({
        "status": "healthy",
        "data_folder": str(repo.data_folder) if repo.data_folder else None,
        "run_count": len(repo._index),
    })


# ============================================================================
# Folder Management Endpoints
# ============================================================================

@app.route("/folder", methods=["GET"])
def get_folder_info():
    """Get information about the current data folder."""
    repo = get_repository()
    return jsonify({
        "path": str(repo.data_folder) if repo.data_folder else None,
        "run_count": len(repo._index),
    })


@app.route("/folder", methods=["POST"])
def set_folder():
    """Set the data folder to scan for CSV files."""
    data = request.get_json()
    if not data or "path" not in data:
        return jsonify({"detail": "path is required"}), 400
    
    repo = get_repository()
    path = Path(data["path"])
    
    if not path.exists():
        return jsonify({"detail": f"Folder does not exist: {data['path']}"}), 400
    if not path.is_dir():
        return jsonify({"detail": f"Path is not a directory: {data['path']}"}), 400
    
    count = repo.set_data_folder(path)
    
    return jsonify({
        "path": str(path),
        "run_count": count,
    })


@app.route("/folder/rescan", methods=["POST"])
def rescan_folder():
    """Rescan the current data folder for new CSV files."""
    repo = get_repository()
    
    if repo.data_folder is None:
        return jsonify({"detail": "No data folder set"}), 400
    
    repo.clear_cache()
    count = repo.scan_folder(repo.data_folder)
    
    return jsonify({
        "path": str(repo.data_folder),
        "run_count": count,
    })


# ============================================================================
# Run Endpoints
# ============================================================================

@app.route("/runs", methods=["GET"])
def list_runs():
    """List all available telemetry runs."""
    repo = get_repository()
    summaries = repo.list_runs()
    
    return jsonify([
        {
            "id": s.id,
            "name": s.name,
            "source_file": s.source_file,
            "recorded_at": s.recorded_at,
            "duration_s": s.duration_s,
            "sample_count": s.sample_count,
            "has_gps": s.has_gps,
            "has_imu": s.has_imu,
        }
        for s in summaries
    ])


@app.route("/runs/<run_id>", methods=["GET"])
def get_run_metadata(run_id: str):
    """Get metadata for a specific run."""
    repo = get_repository()
    run = repo.get_run(run_id)
    
    if run is None:
        return jsonify({"detail": f"Run not found: {run_id}"}), 404
    
    return jsonify(_build_metadata_dict(run))


@app.route("/runs/<run_id>/data", methods=["GET"])
def get_run_data(run_id: str):
    """Get full telemetry data for a run."""
    repo = get_repository()
    run = repo.get_run(run_id)
    
    if run is None:
        return jsonify({"detail": f"Run not found: {run_id}"}), 404
    
    return jsonify({
        "metadata": _build_metadata_dict(run),
        "timestamps": run.timestamps.tolist(),
        "x": _clean_array(run.x),
        "y": _clean_array(run.y),
        "speed": _clean_array(run.speed),
        "heading": _clean_array(run.heading),
        "ax": _clean_array(run.ax_body),
        "ay": _clean_array(run.ay_body),
        "yaw_rate": _clean_array(run.yaw_rate),
        "total_g": _clean_array(run.total_g),
        "validity": {k: _clean_validity(v) for k, v in run.validity.items()},
        "channels": _build_channel_info(run),
    })


@app.route("/runs/<run_id>/reload", methods=["POST"])
def reload_run(run_id: str):
    """Reload a run with optional manual origin override."""
    repo = get_repository()
    
    if run_id not in repo._index:
        return jsonify({"detail": f"Run not found: {run_id}"}), 404
    
    data = request.get_json() or {}
    
    run = repo.reload_run(
        run_id,
        origin_lat=data.get("origin_lat"),
        origin_lon=data.get("origin_lon"),
        origin_alt=data.get("origin_alt"),
    )
    
    if run is None:
        return jsonify({"detail": "Failed to reload run"}), 500
    
    return jsonify(_build_metadata_dict(run))


@app.route("/runs/<run_id>/playback", methods=["GET"])
def get_playback_data(run_id: str):
    """Get downsampled playback data for a run."""
    repo = get_repository()
    run = repo.get_run(run_id)
    
    if run is None:
        return jsonify({"detail": f"Run not found: {run_id}"}), 404
    
    # Parse query parameters
    start_time = float(request.args.get("start_time", 0.0))
    end_time = request.args.get("end_time")
    target_rate = float(request.args.get("target_rate", 10.0))
    
    # Validate target_rate
    target_rate = max(1.0, min(100.0, target_rate))
    
    # Determine time range
    run_start, run_end = run.get_time_range()
    start_time = max(start_time, run_start)
    
    if end_time is not None:
        end_time = float(end_time)
        end_time = min(end_time, run_end)
    else:
        end_time = run_end
    
    if start_time >= end_time:
        return jsonify({"detail": "Invalid time range"}), 400
    
    # Calculate sample interval
    duration = end_time - start_time
    sample_interval = 1.0 / target_rate
    n_samples = int(duration / sample_interval) + 1
    
    # Generate sample times
    sample_times = np.linspace(start_time, end_time, n_samples)
    
    # Get interpolated samples
    samples = []
    for t in sample_times:
        sample = run.sample_at_time(t)
        valid = sample.get("valid", {})
        samples.append({
            "time": sample["time"],
            "x": _nan_to_none(sample["x"]) if valid.get("x", False) else 0.0,
            "y": _nan_to_none(sample["y"]) if valid.get("y", False) else 0.0,
            "speed": _nan_to_none(sample["speed"]) if valid.get("speed", False) else 0.0,
            "heading": _nan_to_none(sample["heading"]) if valid.get("heading", False) else 0.0,
            "ax": _nan_to_none(sample["ax"]) if valid.get("ax", False) else 0.0,
            "ay": _nan_to_none(sample["ay"]) if valid.get("ay", False) else 0.0,
            "yaw_rate": _nan_to_none(sample["yaw_rate"]) if valid.get("yaw_rate", False) else 0.0,
            "total_g": _nan_to_none(sample["total_g"]) if valid.get("total_g", False) else 0.0,
            "valid": {k: bool(v) for k, v in valid.items()},
        })
    
    return jsonify({
        "run_id": run_id,
        "duration_s": duration,
        "sample_rate_hz": target_rate,
        "samples": samples,
    })


# ============================================================================
# Startup
# ============================================================================

def create_app(data_folder: Optional[Path] = None) -> Flask:
    """Create and configure the Flask app."""
    if data_folder is None:
        data_folder = DEFAULT_DATA_FOLDER
    
    if data_folder.exists():
        init_repository(data_folder)
        logger.info(f"Initialized repository with folder: {data_folder}")
    else:
        logger.info(f"Default data folder not found: {data_folder}")
        logger.info("Use POST /folder to set data folder")
    
    return app


if __name__ == "__main__":
    import sys
    
    # Allow specifying data folder as argument
    data_folder = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_DATA_FOLDER
    
    create_app(data_folder)
    app.run(host="0.0.0.0", port=8000, debug=True)

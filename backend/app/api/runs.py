"""
API routes for telemetry runs.
"""

import math
from pathlib import Path
from typing import Optional

import numpy as np
from fastapi import APIRouter, HTTPException, Query

from app.api.schemas import (
    RunSummaryResponse,
    RunMetadataResponse,
    RunDataResponse,
    RunReloadRequest,
    OriginResponse,
    SetFolderRequest,
    FolderInfoResponse,
    PlaybackDataResponse,
    PlaybackSampleResponse,
    PlaybackRangeRequest,
)
from app.services.repository import get_repository
from app.models.telemetry import TelemetryRun


router = APIRouter(prefix="/runs", tags=["runs"])


def _nan_to_none(value: float) -> Optional[float]:
    """Convert NaN to None for JSON serialization."""
    if math.isnan(value):
        return None
    return value


def _clean_array(arr: np.ndarray) -> list[float]:
    """Convert numpy array to list, replacing NaN with None."""
    return [None if math.isnan(x) else float(x) for x in arr]

def _clean_validity(arr: np.ndarray) -> list[bool]:
    """Convert numpy bool array to list."""
    return [bool(x) for x in arr]


def _build_channel_info(run: TelemetryRun) -> dict:
    """Build channel metadata response."""
    result = {}
    for key, info in run.channel_info.items():
        result[key] = {
            "unit": info.unit,
            "provenance": info.provenance.value,
            "frame": info.frame.value if info.frame is not None else None,
        }
    return result


def _build_metadata_response(run: TelemetryRun) -> RunMetadataResponse:
    """Build metadata response from TelemetryRun."""
    return RunMetadataResponse(
        id=run.metadata.id,
        name=run.metadata.name,
        source_file=str(run.metadata.source_file),
        recorded_at=run.metadata.recorded_at.isoformat() if run.metadata.recorded_at else None,
        duration_s=run.metadata.duration_s,
        sample_count=run.metadata.sample_count,
        sample_rate_hz=run.metadata.sample_rate_hz,
        has_gps=run.metadata.has_gps,
        has_imu=run.metadata.has_imu,
        has_speed=run.metadata.has_speed,
        canonical_version=run.metadata.canonical_version,
        origin=OriginResponse(
            lat=run.origin.lat,
            lon=run.origin.lon,
            alt=run.origin.alt,
            manual_override=run.origin.manual_override,
        ),
        bounding_box=run.get_bounding_box(),
        time_range=run.get_time_range(),
    )


@router.get("", response_model=list[RunSummaryResponse])
async def list_runs():
    """
    List all available telemetry runs.
    
    Returns summaries sorted by recording date (newest first).
    """
    repo = get_repository()
    summaries = repo.list_runs()
    
    return [
        RunSummaryResponse(
            id=s.id,
            name=s.name,
            source_file=s.source_file,
            recorded_at=s.recorded_at,
            duration_s=s.duration_s,
            sample_count=s.sample_count,
            has_gps=s.has_gps,
            has_imu=s.has_imu,
        )
        for s in summaries
    ]


@router.get("/{run_id}", response_model=RunMetadataResponse)
async def get_run_metadata(run_id: str):
    """
    Get metadata for a specific run.
    """
    repo = get_repository()
    run = repo.get_run(run_id)
    
    if run is None:
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")
    
    return _build_metadata_response(run)


@router.get("/{run_id}/data", response_model=RunDataResponse)
async def get_run_data(run_id: str):
    """
    Get full telemetry data for a run.
    
    Warning: This can be a large response for high-sample-rate runs.
    Consider using /playback endpoint for visualization.
    """
    repo = get_repository()
    run = repo.get_run(run_id)
    
    if run is None:
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")
    
    return RunDataResponse(
        metadata=_build_metadata_response(run),
        timestamps=run.timestamps.tolist(),
        x=_clean_array(run.x),
        y=_clean_array(run.y),
        speed=_clean_array(run.speed),
        heading=_clean_array(run.heading),
        ax=_clean_array(run.ax_body),
        ay=_clean_array(run.ay_body),
        yaw_rate=_clean_array(run.yaw_rate),
        total_g=_clean_array(run.total_g),
        validity={k: _clean_validity(v) for k, v in run.validity.items()},
        channels=_build_channel_info(run),
    )


@router.post("/{run_id}/reload", response_model=RunMetadataResponse)
async def reload_run(run_id: str, request: RunReloadRequest):
    """
    Reload a run with optional manual origin override.
    
    Use this when the automatic origin detection is incorrect
    (e.g., run starts too early).
    """
    repo = get_repository()
    
    if run_id not in repo._index:
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")
    
    run = repo.reload_run(
        run_id,
        origin_lat=request.origin_lat,
        origin_lon=request.origin_lon,
        origin_alt=request.origin_alt,
    )
    
    if run is None:
        raise HTTPException(status_code=500, detail="Failed to reload run")
    
    return _build_metadata_response(run)


@router.get("/{run_id}/playback", response_model=PlaybackDataResponse)
async def get_playback_data(
    run_id: str,
    start_time: float = Query(0.0, description="Start time in seconds"),
    end_time: Optional[float] = Query(None, description="End time in seconds (defaults to run end)"),
    target_rate: float = Query(10.0, ge=1.0, le=100.0, description="Target sample rate for playback"),
):
    """
    Get downsampled playback data for a run.
    
    This endpoint returns data suitable for smooth playback visualization,
    downsampled to the target rate to reduce data transfer.
    """
    repo = get_repository()
    run = repo.get_run(run_id)
    
    if run is None:
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")
    
    # Determine time range
    run_start, run_end = run.get_time_range()
    start_time = max(start_time, run_start)
    if end_time is None:
        end_time = run_end
    else:
        end_time = min(end_time, run_end)
    
    if start_time >= end_time:
        raise HTTPException(status_code=400, detail="Invalid time range")
    
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
        samples.append(PlaybackSampleResponse(
            time=sample['time'],
            x=_nan_to_none(sample['x']) if valid.get("x", False) else 0.0,
            y=_nan_to_none(sample['y']) if valid.get("y", False) else 0.0,
            speed=_nan_to_none(sample['speed']) if valid.get("speed", False) else 0.0,
            heading=_nan_to_none(sample['heading']) if valid.get("heading", False) else 0.0,
            ax=_nan_to_none(sample['ax']) if valid.get("ax", False) else 0.0,
            ay=_nan_to_none(sample['ay']) if valid.get("ay", False) else 0.0,
            yaw_rate=_nan_to_none(sample['yaw_rate']) if valid.get("yaw_rate", False) else 0.0,
            total_g=_nan_to_none(sample['total_g']) if valid.get("total_g", False) else 0.0,
            valid={k: bool(v) for k, v in valid.items()},
        ))
    
    return PlaybackDataResponse(
        run_id=run_id,
        duration_s=duration,
        sample_rate_hz=target_rate,
        samples=samples,
    )


# ============================================================================
# Folder Management Routes
# ============================================================================

folder_router = APIRouter(prefix="/folder", tags=["folder"])


@folder_router.get("", response_model=FolderInfoResponse)
async def get_folder_info():
    """Get information about the current data folder."""
    repo = get_repository()
    
    return FolderInfoResponse(
        path=str(repo.data_folder) if repo.data_folder else None,
        run_count=len(repo._index),
    )


@folder_router.post("", response_model=FolderInfoResponse)
async def set_folder(request: SetFolderRequest):
    """
    Set the data folder to scan for CSV files.
    
    This will clear the current cache and re-scan.
    """
    repo = get_repository()
    
    path = Path(request.path)
    if not path.exists():
        raise HTTPException(status_code=400, detail=f"Folder does not exist: {request.path}")
    if not path.is_dir():
        raise HTTPException(status_code=400, detail=f"Path is not a directory: {request.path}")
    
    count = repo.set_data_folder(path)
    
    return FolderInfoResponse(
        path=str(path),
        run_count=count,
    )


@folder_router.post("/rescan", response_model=FolderInfoResponse)
async def rescan_folder():
    """
    Rescan the current data folder for new CSV files.
    """
    repo = get_repository()
    
    if repo.data_folder is None:
        raise HTTPException(status_code=400, detail="No data folder set")
    
    repo.clear_cache()
    count = repo.scan_folder(repo.data_folder)
    
    return FolderInfoResponse(
        path=str(repo.data_folder),
        run_count=count,
    )

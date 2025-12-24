"""
Canonicalizer for raw telemetry.

Normalizes units, coordinate frames, and validity masks.
"""

from __future__ import annotations

import math
import os
from datetime import datetime
from pathlib import Path
from typing import Optional

import numpy as np
from numpy.typing import NDArray

from app.models.raw import RawTelemetry
from app.models.telemetry import (
    ChannelInfo,
    DataProvenance,
    OriginConfig,
    ReferenceFrame,
    RunMetadata,
    TelemetryRun,
)
from app.utils.coordinates import gps_to_enu, compute_heading_from_positions


MAX_G = 4.5  # hard validation limit (G)
START_G_THRESHOLD = float(os.getenv("AUTOCROSS_START_G", "0.25"))  # g to trim leading idle
ANCHOR_START_XY = os.getenv("AUTOCROSS_ANCHOR_START_XY", "1") not in ("0", "false", "False")


def canonicalize_raw(
    raw: RawTelemetry,
    origin_lat: Optional[float] = None,
    origin_lon: Optional[float] = None,
    origin_alt: Optional[float] = None,
) -> TelemetryRun:
    """
    Convert raw telemetry into canonical TelemetryRun (v1).
    """

    timestamps = _normalize_time(raw.timestamps, raw.time_unit)
    n_samples = len(timestamps)

    # GPS -> ENU (handle missing altitude)
    altitude = raw.altitude
    if altitude is None or np.all(np.isnan(altitude)):
        altitude = np.zeros_like(raw.latitude)

    gps_valid = ~(np.isnan(raw.latitude) | np.isnan(raw.longitude))
    if not np.any(gps_valid):
        enu_east = np.full_like(raw.latitude, np.nan)
        enu_north = np.full_like(raw.latitude, np.nan)
        enu_up = np.full_like(raw.latitude, np.nan)
        origin_latitude = 0.0
        origin_longitude = 0.0
        origin_altitude = 0.0
    else:
        enu = gps_to_enu(raw.latitude, raw.longitude, altitude, origin_lat, origin_lon, origin_alt)
        enu_east = enu.east
        enu_north = enu.north
        enu_up = enu.up
        origin_latitude = enu.origin_lat
        origin_longitude = enu.origin_lon
        origin_altitude = enu.origin_alt

    # Speed
    speed, speed_prov = _normalize_speed(raw, timestamps, enu_east, enu_north)

    # Heading
    heading, heading_prov = _normalize_heading(raw, enu_east, enu_north)

    # Acceleration (body frame, G)
    ax = _safe_array(raw.accel_x, n_samples)
    ay = _safe_array(raw.accel_y, n_samples)
    accel_prov = DataProvenance.MEASURED if not _all_nan(ax, ay) else DataProvenance.DERIVED

    # Apply G validation
    valid_ax = _valid_g(ax)
    valid_ay = _valid_g(ay)
    ax = np.where(valid_ax, ax, np.nan)
    ay = np.where(valid_ay, ay, np.nan)

    # Yaw rate (deg/s canonical)
    yaw_rate, yaw_prov = _normalize_yaw_rate(raw, n_samples)

    # Validity masks
    validity: dict[str, NDArray[np.bool_]] = {
        "x": gps_valid & ~np.isnan(enu_east),
        "y": gps_valid & ~np.isnan(enu_north),
        "speed": _valid_speed(speed),
        "heading": ~np.isnan(heading),
        "ax": valid_ax,
        "ay": valid_ay,
        "yaw_rate": ~np.isnan(yaw_rate),
    }

    # Total G validity and values
    total_g = np.sqrt(ax**2 + ay**2)
    valid_total = validity["ax"] & validity["ay"]
    total_g = np.where(valid_total, total_g, np.nan)
    validity["total_g"] = valid_total

    # Trim leading samples until car starts moving (hits threshold G)
    (
        timestamps,
        enu_east,
        enu_north,
        enu_up,
        speed,
        heading,
        yaw_rate,
        ax,
        ay,
        gps_accuracy,
        gps_update,
        lap_number,
        total_g,
        validity,
    ) = _trim_leading_idle(
        START_G_THRESHOLD,
        timestamps,
        enu_east,
        enu_north,
        enu_up,
        speed,
        heading,
        yaw_rate,
        ax,
        ay,
        _safe_array(raw.gps_accuracy, n_samples),
        _safe_bool_array(raw.gps_update, n_samples),
        raw.lap_number,
        total_g,
        validity,
    )

    n_samples = len(timestamps)
    duration_s = float(timestamps[-1] - timestamps[0]) if n_samples > 1 else 0.0
    sample_rate_hz = n_samples / max(duration_s, 0.001)

    # Anchor start position to (0,0) so different runs overlay at launch line
    enu_east, enu_north, validity = _anchor_start_position(enu_east, enu_north, validity)

    # Channel metadata
    channel_info = {
        "x": ChannelInfo(unit="m", frame=ReferenceFrame.GLOBAL, provenance=DataProvenance.DERIVED),
        "y": ChannelInfo(unit="m", frame=ReferenceFrame.GLOBAL, provenance=DataProvenance.DERIVED),
        "speed": ChannelInfo(unit="m/s", provenance=speed_prov),
        "heading": ChannelInfo(unit="deg", provenance=heading_prov),
        "ax": ChannelInfo(unit="g", frame=ReferenceFrame.BODY, provenance=accel_prov),
        "ay": ChannelInfo(unit="g", frame=ReferenceFrame.BODY, provenance=accel_prov),
        "yaw_rate": ChannelInfo(unit="deg/s", frame=ReferenceFrame.BODY, provenance=yaw_prov),
        "total_g": ChannelInfo(unit="g", frame=ReferenceFrame.BODY, provenance=DataProvenance.DERIVED),
    }

    has_gps = bool(np.any(validity["x"] & validity["y"]))
    has_imu = bool(np.any(validity["ax"] | validity["ay"] | validity["yaw_rate"]))
    has_speed = bool(np.any(validity["speed"]))

    run_id = _generate_id(raw.source_file)

    metadata = RunMetadata(
        id=run_id,
        source_file=raw.source_file,
        name=raw.name,
        recorded_at=raw.recorded_at,
        duration_s=duration_s,
        sample_count=n_samples,
        sample_rate_hz=sample_rate_hz,
        has_gps=has_gps,
        has_imu=has_imu,
        has_speed=has_speed,
    )

    origin = OriginConfig(
        lat=origin_latitude,
        lon=origin_longitude,
        alt=origin_altitude,
        manual_override=(origin_lat is not None or origin_lon is not None or origin_alt is not None),
    )

    return TelemetryRun(
        metadata=metadata,
        origin=origin,
        timestamps=timestamps,
        x=enu_east,
        y=enu_north,
        z=enu_up,
        speed=np.where(validity["speed"], speed, np.nan),
        heading=np.where(validity["heading"], heading, np.nan),
        yaw_rate=np.where(validity["yaw_rate"], yaw_rate, np.nan),
        ax_body=ax,
        ay_body=ay,
        gps_accuracy=gps_accuracy,
        gps_update=gps_update,
        lap_number=lap_number,
        validity=validity,
        channel_info=channel_info,
    )


def _normalize_time(times: NDArray[np.float64], unit: str) -> NDArray[np.float64]:
    times = times.astype(np.float64, copy=True)
    if len(times) == 0:
        return times

    # Convert based on declared unit
    unit = (unit or "s").lower()
    if unit == "ms":
        times = times / 1000.0
    elif unit != "s":
        # Unknown unit; attempt heuristics below
        pass

    # Detect milliseconds or epoch time and normalize to seconds (fallback)
    max_val = float(np.nanmax(times))
    if max_val > 1.0e11:
        times = times / 1000.0  # epoch ms -> s
    elif max_val > 1.0e7:
        # epoch seconds (keep)
        pass
    elif max_val > 1.0e5:
        times = times / 1000.0  # likely ms duration

    # Normalize to start at 0
    times = times - times[0]
    return times


def _normalize_speed(
    raw: RawTelemetry,
    timestamps: NDArray[np.float64],
    x: NDArray[np.float64],
    y: NDArray[np.float64],
) -> tuple[NDArray[np.float64], DataProvenance]:
    speed = _safe_array(raw.speed, len(timestamps))
    unit = (raw.speed_unit or "").lower()

    if not np.all(np.isnan(speed)):
        if unit in ("mph", "mi/h"):
            speed = speed * 0.44704
        elif unit in ("kph", "km/h"):
            speed = speed * 0.277778
        # else assume m/s
        return speed, DataProvenance.MEASURED

    derived = _derive_speed(timestamps, x, y)
    return derived, DataProvenance.DERIVED


def _normalize_heading(
    raw: RawTelemetry,
    x: NDArray[np.float64],
    y: NDArray[np.float64],
) -> tuple[NDArray[np.float64], DataProvenance]:
    heading = _safe_array(raw.heading, len(x))
    if not np.all(np.isnan(heading)):
        heading = np.mod(heading, 360.0)
        return heading, DataProvenance.MEASURED

    derived = compute_heading_from_positions(x, y)
    return derived, DataProvenance.DERIVED


def _normalize_yaw_rate(raw: RawTelemetry, n_samples: int) -> tuple[NDArray[np.float64], DataProvenance]:
    yaw = _safe_array(raw.yaw_rate, n_samples)
    unit = (raw.yaw_rate_unit or "").lower()
    if unit == "rad/s":
        yaw = np.degrees(yaw)
    return yaw, (DataProvenance.MEASURED if not np.all(np.isnan(yaw)) else DataProvenance.DERIVED)


def _anchor_start_position(
    x: NDArray[np.float64],
    y: NDArray[np.float64],
    validity: dict[str, NDArray[np.bool_]],
):
    """
    Shift the trajectory so the first valid GPS sample is at (0,0).
    """
    if not ANCHOR_START_XY:
        return x, y, validity

    valid_pos = validity.get("x", np.zeros_like(x, dtype=bool)) & validity.get("y", np.zeros_like(y, dtype=bool))
    if not np.any(valid_pos):
        return x, y, validity

    first_idx = int(np.argmax(valid_pos))  # first True index
    x0, y0 = x[first_idx], y[first_idx]

    if math.isnan(x0) or math.isnan(y0):
        return x, y, validity

    x_shifted = x - x0
    y_shifted = y - y0

    return x_shifted, y_shifted, validity


def _trim_leading_idle(
    threshold_g: float,
    timestamps: NDArray[np.float64],
    x: NDArray[np.float64],
    y: NDArray[np.float64],
    z: NDArray[np.float64],
    speed: NDArray[np.float64],
    heading: NDArray[np.float64],
    yaw_rate: NDArray[np.float64],
    ax: NDArray[np.float64],
    ay: NDArray[np.float64],
    gps_accuracy: NDArray[np.float64],
    gps_update: NDArray[np.bool_],
    lap_number: Optional[NDArray[np.int32]],
    total_g: NDArray[np.float64],
    validity: dict[str, NDArray[np.bool_]],
):
    """
    Drop leading samples until total G exceeds threshold.
    Keeps alignment across all channels and re-zeroes timestamps.
    """
    if threshold_g <= 0 or len(timestamps) == 0:
        return (
            timestamps,
            x,
            y,
            z,
            speed,
            heading,
            yaw_rate,
            ax,
            ay,
            gps_accuracy,
            gps_update,
            lap_number,
            total_g,
            validity,
        )

    start_idx = None
    for i, g in enumerate(total_g):
        if not math.isnan(g) and g >= threshold_g:
            start_idx = i
            break

    if start_idx is None or start_idx == 0:
        return (
            timestamps,
            x,
            y,
            z,
            speed,
            heading,
            yaw_rate,
            ax,
            ay,
            gps_accuracy,
            gps_update,
            lap_number,
            total_g,
            validity,
        )

    sl = slice(start_idx, None)
    def _trim(arr):
        return arr[sl] if arr is not None else None

    timestamps = timestamps[sl] - timestamps[sl][0]
    x = _trim(x)
    y = _trim(y)
    z = _trim(z)
    speed = _trim(speed)
    heading = _trim(heading)
    yaw_rate = _trim(yaw_rate)
    ax = _trim(ax)
    ay = _trim(ay)
    gps_accuracy = _trim(gps_accuracy)
    gps_update = _trim(gps_update)
    lap_number = _trim(lap_number) if lap_number is not None else None
    total_g = _trim(total_g)
    validity = {k: _trim(v) for k, v in validity.items()}

    return (
        timestamps,
        x,
        y,
        z,
        speed,
        heading,
        yaw_rate,
        ax,
        ay,
        gps_accuracy,
        gps_update,
        lap_number,
        total_g,
        validity,
    )


def _derive_speed(
    timestamps: NDArray[np.float64],
    x: NDArray[np.float64],
    y: NDArray[np.float64],
) -> NDArray[np.float64]:
    dx = np.diff(x, prepend=x[0])
    dy = np.diff(y, prepend=y[0])
    dt = np.diff(timestamps, prepend=timestamps[0])

    dt = np.where(dt == 0, np.nan, dt)
    distance = np.sqrt(dx**2 + dy**2)
    speed = distance / dt

    if len(speed) > 1:
        speed[0] = speed[1]
    return speed


def _valid_g(arr: NDArray[np.float64]) -> NDArray[np.bool_]:
    return (~np.isnan(arr)) & (np.abs(arr) <= MAX_G)


def _valid_speed(arr: NDArray[np.float64]) -> NDArray[np.bool_]:
    return (~np.isnan(arr)) & (arr >= 0)


def _safe_array(arr: Optional[NDArray[np.float64]], n_samples: int) -> NDArray[np.float64]:
    if arr is None:
        return np.full(n_samples, np.nan, dtype=np.float64)
    return arr.astype(np.float64, copy=False)


def _safe_bool_array(arr: Optional[NDArray[np.bool_]], n_samples: int) -> NDArray[np.bool_]:
    if arr is None:
        return np.ones(n_samples, dtype=np.bool_)
    return arr.astype(np.bool_, copy=False)


def _all_nan(*arrays: NDArray[np.float64]) -> bool:
    return all(np.all(np.isnan(a)) for a in arrays if a is not None)


def _generate_id(filepath: Path) -> str:
    import hashlib

    stat = filepath.stat()
    id_string = f"{filepath.name}_{stat.st_size}_{stat.st_mtime}"
    return hashlib.sha256(id_string.encode()).hexdigest()[:16]

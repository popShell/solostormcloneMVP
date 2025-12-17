"""
Canonical telemetry data model (v1).

All incoming telemetry is normalized into this structure with:
- fixed units
- fixed reference frames
- per-sample validity masks
- provenance metadata (measured vs derived)
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Optional

import numpy as np
from numpy.typing import NDArray


CANONICAL_VERSION = "v1"


class DataProvenance(Enum):
    """Provenance for a telemetry channel."""

    MEASURED = "measured"
    DERIVED = "derived"


class ReferenceFrame(Enum):
    """Reference frame for a telemetry channel."""

    BODY = "body"      # Vehicle body frame (X forward, Y left)
    GLOBAL = "global"  # Global ENU frame (X east, Y north)


@dataclass
class RunMetadata:
    """Metadata about a telemetry run."""

    id: str
    source_file: Path
    name: str
    recorded_at: Optional[datetime]
    duration_s: float
    sample_count: int
    sample_rate_hz: float
    has_gps: bool
    has_imu: bool
    has_speed: bool
    canonical_version: str = CANONICAL_VERSION


@dataclass
class OriginConfig:
    """Configuration for coordinate origin."""

    lat: float
    lon: float
    alt: float = 0.0
    manual_override: bool = False


@dataclass
class ChannelInfo:
    """Metadata for a single telemetry channel."""

    unit: str
    provenance: DataProvenance
    frame: Optional[ReferenceFrame] = None


@dataclass
class TelemetryRun:
    """
    Canonical representation of a single telemetry run.

    Coordinate system:
    - Global ENU: X east, Y north, Z up (meters)
    - Vehicle body: X forward, Y left (accel in G)
    """

    metadata: RunMetadata
    origin: OriginConfig

    timestamps: NDArray[np.float64]   # Seconds from run start

    # Position (ENU, meters)
    x: NDArray[np.float64]
    y: NDArray[np.float64]
    z: NDArray[np.float64]

    # Velocity / orientation
    speed: NDArray[np.float64]        # m/s
    heading: NDArray[np.float64]      # degrees, 0=N, 90=E
    yaw_rate: NDArray[np.float64]     # deg/s

    # Acceleration (body frame, G)
    ax_body: NDArray[np.float64]
    ay_body: NDArray[np.float64]

    # GPS metadata
    gps_accuracy: NDArray[np.float64]
    gps_update: NDArray[np.bool_]

    # Lap info (optional)
    lap_number: Optional[NDArray[np.int32]] = None

    # Per-sample validity masks (channel name -> bool array)
    validity: dict[str, NDArray[np.bool_]] = field(default_factory=dict)

    # Channel metadata (channel name -> ChannelInfo)
    channel_info: dict[str, ChannelInfo] = field(default_factory=dict)

    # Cached derived values
    _total_g: Optional[NDArray[np.float64]] = field(default=None, repr=False)

    @property
    def lateral_g(self) -> NDArray[np.float64]:
        return self.ay_body

    @property
    def longitudinal_g(self) -> NDArray[np.float64]:
        return self.ax_body

    @property
    def total_g(self) -> NDArray[np.float64]:
        """Total G-force magnitude (derived)."""
        if self._total_g is None:
            valid_ax = self.validity.get("ax", ~np.isnan(self.ax_body))
            valid_ay = self.validity.get("ay", ~np.isnan(self.ay_body))
            valid_total = valid_ax & valid_ay
            total = np.sqrt(self.ax_body**2 + self.ay_body**2)
            total = np.where(valid_total, total, np.nan)
            self._total_g = total
            if "total_g" not in self.validity:
                self.validity["total_g"] = valid_total
        return self._total_g

    def get_time_range(self) -> tuple[float, float]:
        if len(self.timestamps) == 0:
            return (0.0, 0.0)
        return (float(self.timestamps[0]), float(self.timestamps[-1]))

    def get_bounding_box(self) -> tuple[float, float, float, float]:
        valid_x = self.validity.get("x", ~np.isnan(self.x))
        valid_y = self.validity.get("y", ~np.isnan(self.y))
        valid = valid_x & valid_y
        if not np.any(valid):
            return (0.0, 0.0, 0.0, 0.0)
        return (
            float(np.min(self.x[valid])),
            float(np.min(self.y[valid])),
            float(np.max(self.x[valid])),
            float(np.max(self.y[valid])),
        )

    def sample_at_time(self, t: float) -> dict:
        """
        Get interpolated sample at time t, including validity.
        """
        if len(self.timestamps) == 0:
            return {
                "time": 0.0,
                "x": np.nan,
                "y": np.nan,
                "speed": np.nan,
                "heading": np.nan,
                "ax": np.nan,
                "ay": np.nan,
                "yaw_rate": np.nan,
                "total_g": np.nan,
                "valid": {},
            }

        idx = int(np.searchsorted(self.timestamps, t))
        if idx <= 0:
            return self._sample_at_index(0)
        if idx >= len(self.timestamps):
            return self._sample_at_index(len(self.timestamps) - 1)

        t0, t1 = self.timestamps[idx - 1], self.timestamps[idx]
        alpha = (t - t0) / (t1 - t0) if t1 != t0 else 0.0

        x, valid_x = self._lerp_with_valid(self.x, "x", idx, alpha)
        y, valid_y = self._lerp_with_valid(self.y, "y", idx, alpha)
        speed, valid_speed = self._lerp_with_valid(self.speed, "speed", idx, alpha)
        heading, valid_heading = self._lerp_angle_with_valid(self.heading, "heading", idx, alpha)
        ax, valid_ax = self._lerp_with_valid(self.ax_body, "ax", idx, alpha)
        ay, valid_ay = self._lerp_with_valid(self.ay_body, "ay", idx, alpha)
        yaw_rate, valid_yaw = self._lerp_with_valid(self.yaw_rate, "yaw_rate", idx, alpha)

        total_g = np.sqrt(ax**2 + ay**2) if valid_ax and valid_ay else np.nan
        valid_total = bool(valid_ax and valid_ay)

        return {
            "time": float(t),
            "x": float(x),
            "y": float(y),
            "speed": float(speed),
            "heading": float(heading),
            "ax": float(ax),
            "ay": float(ay),
            "yaw_rate": float(yaw_rate),
            "total_g": float(total_g) if valid_total else np.nan,
            "valid": {
                "x": valid_x,
                "y": valid_y,
                "speed": valid_speed,
                "heading": valid_heading,
                "ax": valid_ax,
                "ay": valid_ay,
                "yaw_rate": valid_yaw,
                "total_g": valid_total,
            },
        }

    def _sample_at_index(self, idx: int) -> dict:
        valid = {
            "x": bool(self.validity.get("x", ~np.isnan(self.x))[idx]),
            "y": bool(self.validity.get("y", ~np.isnan(self.y))[idx]),
            "speed": bool(self.validity.get("speed", ~np.isnan(self.speed))[idx]),
            "heading": bool(self.validity.get("heading", ~np.isnan(self.heading))[idx]),
            "ax": bool(self.validity.get("ax", ~np.isnan(self.ax_body))[idx]),
            "ay": bool(self.validity.get("ay", ~np.isnan(self.ay_body))[idx]),
            "yaw_rate": bool(self.validity.get("yaw_rate", ~np.isnan(self.yaw_rate))[idx]),
        }
        total_g = self.total_g[idx] if valid["ax"] and valid["ay"] else np.nan
        valid["total_g"] = bool(valid["ax"] and valid["ay"])

        return {
            "time": float(self.timestamps[idx]),
            "x": float(self.x[idx]),
            "y": float(self.y[idx]),
            "speed": float(self.speed[idx]),
            "heading": float(self.heading[idx]),
            "ax": float(self.ax_body[idx]),
            "ay": float(self.ay_body[idx]),
            "yaw_rate": float(self.yaw_rate[idx]),
            "total_g": float(total_g) if valid["total_g"] else np.nan,
            "valid": valid,
        }

    def _lerp_with_valid(
        self,
        arr: NDArray[np.float64],
        key: str,
        idx: int,
        alpha: float,
    ) -> tuple[float, bool]:
        v0, v1 = arr[idx - 1], arr[idx]
        valid_arr = self.validity.get(key)
        valid0 = bool(valid_arr[idx - 1]) if valid_arr is not None else not np.isnan(v0)
        valid1 = bool(valid_arr[idx]) if valid_arr is not None else not np.isnan(v1)

        if not valid0 and not valid1:
            return (np.nan, False)
        if valid0 and valid1:
            return (float(v0 + alpha * (v1 - v0)), True)
        if valid1:
            return (float(v1), True)
        return (float(v0), True)

    def _lerp_angle_with_valid(
        self,
        arr: NDArray[np.float64],
        key: str,
        idx: int,
        alpha: float,
    ) -> tuple[float, bool]:
        a0, a1 = arr[idx - 1], arr[idx]
        valid_arr = self.validity.get(key)
        valid0 = bool(valid_arr[idx - 1]) if valid_arr is not None else not np.isnan(a0)
        valid1 = bool(valid_arr[idx]) if valid_arr is not None else not np.isnan(a1)

        if not valid0 and not valid1:
            return (np.nan, False)
        if valid0 and valid1:
            diff = a1 - a0
            if diff > 180:
                diff -= 360
            elif diff < -180:
                diff += 360
            result = a0 + alpha * diff
            return (float(result % 360), True)
        if valid1:
            return (float(a1 % 360), True)
        return (float(a0 % 360), True)


@dataclass
class RunSummary:
    """Lightweight summary of a run for listing."""

    id: str
    name: str
    source_file: str
    recorded_at: Optional[str]
    duration_s: float
    sample_count: int
    has_gps: bool
    has_imu: bool

    @classmethod
    def from_run(cls, run: TelemetryRun) -> "RunSummary":
        return cls(
            id=run.metadata.id,
            name=run.metadata.name,
            source_file=str(run.metadata.source_file),
            recorded_at=run.metadata.recorded_at.isoformat() if run.metadata.recorded_at else None,
            duration_s=run.metadata.duration_s,
            sample_count=run.metadata.sample_count,
            has_gps=run.metadata.has_gps,
            has_imu=run.metadata.has_imu,
        )

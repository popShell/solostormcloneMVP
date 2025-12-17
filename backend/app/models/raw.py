"""
Raw telemetry model (source-format, unnormalized).

Adapters load source files into this structure before canonicalization.
"""

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional

import numpy as np
from numpy.typing import NDArray


@dataclass
class RawTelemetry:
    """Raw telemetry extracted from a source file."""

    source: str
    source_file: Path
    name: str

    timestamps: NDArray[np.float64]  # seconds (or convertible)
    latitude: NDArray[np.float64]
    longitude: NDArray[np.float64]
    altitude: NDArray[np.float64]
    speed: NDArray[np.float64]

    time_unit: str = "s"  # "s" or "ms"
    speed_unit: Optional[str] = None  # "m/s", "mph", "kph"

    accel_x: Optional[NDArray[np.float64]] = None  # G
    accel_y: Optional[NDArray[np.float64]] = None  # G

    yaw_rate: Optional[NDArray[np.float64]] = None
    yaw_rate_unit: Optional[str] = None  # "deg/s" or "rad/s"

    heading: Optional[NDArray[np.float64]] = None  # degrees

    gps_accuracy: Optional[NDArray[np.float64]] = None
    gps_update: Optional[NDArray[np.bool_]] = None

    lap_number: Optional[NDArray[np.int32]] = None
    recorded_at: Optional[datetime] = None

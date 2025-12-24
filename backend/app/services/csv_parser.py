"""
TrackAddict/RaceRender CSV adapter.

Parses CSV files exported from TrackAddict in RaceRender format into RawTelemetry.
Canonicalization happens in app.services.canonicalizer.
"""

import re
import io
from datetime import datetime
from pathlib import Path
from typing import Optional, Protocol

import numpy as np
import pandas as pd
from numpy.typing import NDArray

from app.models.raw import RawTelemetry
from app.services.canonicalizer import canonicalize_raw


class TelemetryAdapter(Protocol):
    """Adapter interface for raw telemetry sources."""

    name: str

    def can_parse(self, filepath: Path, df: Optional[pd.DataFrame] = None) -> bool:
        ...

    def parse(self, filepath: Path) -> RawTelemetry:
        ...


# Column name mappings - TrackAddict uses various naming conventions
COLUMN_MAPPINGS = {
    # Time columns
    "time": ["Time", "time", "TIME", "GPS Time", "gps_time", "Timestamp", "timestamp"],
    # GPS columns
    "latitude": ["Latitude", "latitude", "LATITUDE", "Lat", "lat", "LAT"],
    "longitude": ["Longitude", "longitude", "LONGITUDE", "Lon", "lon", "LON", "Long", "long"],
    "altitude": ["Altitude", "altitude", "ALTITUDE", "Alt", "alt", "Elevation", "elevation"],
    "gps_update": ["GPS_Update", "gps_update", "GPS Update", "GPSUpdate"],
    "gps_accuracy": ["Accuracy", "accuracy", "GPS_Accuracy", "gps_accuracy"],
    # Speed columns
    "speed_mph": ["MPH", "mph", "Speed (MPH)", "speed_mph"],
    "speed_kph": ["KPH", "kph", "Speed (KPH)", "speed_kph", "Speed (km/h)"],
    "speed_ms": ["Speed (m/s)", "speed_ms", "Speed", "speed"],
    # Acceleration columns (G-force)
    "accel_x": [
        "Accel_X",
        "accel_x",
        "AccelX",
        "Accelerometer X",
        "X",
        # RaceChrono exports
        "longitudinal_acc",
        "x_acc",
    ],
    "accel_y": [
        "Accel_Y",
        "accel_y",
        "AccelY",
        "Accelerometer Y",
        "Y",
        # RaceChrono exports
        "lateral_acc",
        "y_acc",
    ],
    # Yaw rate / gyro Z
    "yaw_rate": [
        "YawRate",
        "Yaw Rate",
        "yaw_rate",
        "GyroZ",
        "Gyro Z",
        "Gyro Z (deg/s)",
        "Gyro Z (rad/s)",
        # RaceChrono exports
        "z_rate_of_rotation",
    ],
    # Heading
    "heading": ["Heading", "heading", "HEADING", "Bearing", "bearing"],
    # Lap info
    "lap": ["Lap", "lap", "LAP", "Lap Number", "lap_number"],
}


class TrackAddictParser:
    """Parser for TrackAddict/RaceRender CSV files."""

    def parse_file(self, filepath: Path) -> RawTelemetry:
        df = self._read_csv(filepath)
        col_map = self._map_columns(df.columns.tolist())

        timestamps, time_unit = self._parse_time_column(df, col_map)
        n_samples = len(timestamps)

        lat = self._extract_column(df, col_map, "latitude", n_samples)
        lon = self._extract_column(df, col_map, "longitude", n_samples)
        alt = self._extract_column(df, col_map, "altitude", n_samples)

        speed, speed_unit = self._extract_speed(df, col_map, n_samples)
        ax, ay = self._extract_acceleration(df, col_map, n_samples)
        yaw_rate, yaw_unit = self._extract_yaw_rate(df, col_map, n_samples)
        heading = self._extract_heading(df, col_map, n_samples)

        gps_accuracy = self._extract_column(df, col_map, "gps_accuracy", n_samples)
        gps_update = self._extract_gps_update(df, col_map, n_samples)
        lap = self._extract_lap(df, col_map, n_samples)

        return RawTelemetry(
            source="trackaddict",
            source_file=filepath,
            name=filepath.stem,
            timestamps=timestamps,
            time_unit=time_unit,
            latitude=lat,
            longitude=lon,
            altitude=alt,
            speed=speed,
            speed_unit=speed_unit,
            accel_x=ax,
            accel_y=ay,
            yaw_rate=yaw_rate,
            yaw_rate_unit=yaw_unit,
            heading=heading,
            gps_accuracy=gps_accuracy,
            gps_update=gps_update,
            lap_number=lap,
            recorded_at=self._extract_datetime(filepath, df),
        )

    def _read_csv(self, filepath: Path) -> pd.DataFrame:
        # Read the whole file once so we can detect non-standard headers
        with open(filepath, "r", encoding="utf-8-sig") as f:
            lines = f.read().splitlines()

        if not lines:
            return pd.DataFrame()

        first_line = lines[0].strip()

        # RaceRender export: header lines are comments starting with '#'
        if first_line.startswith("# RaceRender"):
            skip_rows = 0
            for i, line in enumerate(lines):
                if not line.strip().startswith("#"):
                    skip_rows = i
                    break
            df = pd.read_csv(filepath, skiprows=skip_rows)
            df.columns = df.columns.str.strip()
            return df

        # RaceChrono export: metadata block followed by a header row beginning with 'timestamp'
        header_idx = self._find_header_line(lines)
        if header_idx is not None and header_idx > 0:
            data_start = self._find_data_start(lines, header_idx)
            cleaned = "\n".join([lines[header_idx]] + lines[data_start:])
            df = pd.read_csv(io.StringIO(cleaned))
            df.columns = df.columns.str.strip()
            return df

        # Fallback: assume simple CSV with header on first line
        df = pd.read_csv(filepath)
        df.columns = df.columns.str.strip()
        return df

    def _find_header_line(self, lines: list[str]) -> Optional[int]:
        """Locate the line index that contains the actual CSV header."""
        header_candidates = {"timestamp", "time", "gps time", "gps_time", "gpstime"}
        for i, line in enumerate(lines):
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            first_cell = stripped.split(",")[0].strip().lower()
            if first_cell in header_candidates:
                return i
        return None

    def _find_data_start(self, lines: list[str], header_idx: int) -> int:
        """Find the first line after header that looks like numeric data."""
        numeric = re.compile(r"^-?\d+(?:\.\d+)?$")
        for i in range(header_idx + 1, len(lines)):
            first_cell = lines[i].split(",")[0].strip()
            if first_cell and numeric.match(first_cell):
                return i
        return header_idx + 1

    def _map_columns(self, columns: list[str]) -> dict[str, Optional[str]]:
        col_map: dict[str, Optional[str]] = {}
        for std_name, variants in COLUMN_MAPPINGS.items():
            col_map[std_name] = None
            for variant in variants:
                if variant in columns:
                    col_map[std_name] = variant
                    break
        return col_map

    def _parse_time_column(
        self,
        df: pd.DataFrame,
        col_map: dict[str, Optional[str]],
    ) -> tuple[NDArray[np.float64], str]:
        time_col = col_map.get("time")
        if time_col is None or time_col not in df.columns:
            raise ValueError("No time column found in CSV")

        times = df[time_col].values
        unit = "s"
        if isinstance(times[0], str) and ":" in times[0]:
            parsed = []
            for t in times:
                parts = t.split(":")
                if len(parts) == 3:
                    h, m, s = float(parts[0]), float(parts[1]), float(parts[2])
                    parsed.append(h * 3600 + m * 60 + s)
                elif len(parts) == 2:
                    m, s = float(parts[0]), float(parts[1])
                    parsed.append(m * 60 + s)
                else:
                    parsed.append(float(t))
            times = np.array(parsed, dtype=np.float64)
        else:
            times = times.astype(np.float64)

        col_key = time_col.lower().replace(" ", "")
        if col_key in ("gpstime", "gps_time"):
            unit = "ms"
        else:
            max_val = float(np.nanmax(times)) if len(times) > 0 else 0.0
            if max_val > 1.0e5 and max_val < 1.0e9:
                unit = "ms"

        # Normalize to start at 0
        times = times - times[0]
        return times, unit

    def _extract_speed(
        self,
        df: pd.DataFrame,
        col_map: dict[str, Optional[str]],
        n_samples: int,
    ) -> tuple[NDArray[np.float64], Optional[str]]:
        for speed_type, unit in [
            ("speed_ms", "m/s"),
            ("speed_mph", "mph"),
            ("speed_kph", "kph"),
        ]:
            speed = self._extract_column(df, col_map, speed_type, n_samples)
            if not np.all(np.isnan(speed)):
                return speed, unit
        return np.full(n_samples, np.nan, dtype=np.float64), None

    def _extract_acceleration(
        self,
        df: pd.DataFrame,
        col_map: dict[str, Optional[str]],
        n_samples: int,
    ) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
        ax = self._extract_column(df, col_map, "accel_x", n_samples)
        ay = self._extract_column(df, col_map, "accel_y", n_samples)
        return ax, ay

    def _extract_yaw_rate(
        self,
        df: pd.DataFrame,
        col_map: dict[str, Optional[str]],
        n_samples: int,
    ) -> tuple[NDArray[np.float64], Optional[str]]:
        col = col_map.get("yaw_rate")
        if col is None or col not in df.columns:
            return np.full(n_samples, np.nan, dtype=np.float64), None

        unit = "deg/s"
        col_lower = col.lower()
        if "rad" in col_lower:
            unit = "rad/s"

        values = pd.to_numeric(df[col], errors="coerce").values.astype(np.float64)
        return values, unit

    def _extract_heading(
        self,
        df: pd.DataFrame,
        col_map: dict[str, Optional[str]],
        n_samples: int,
    ) -> NDArray[np.float64]:
        heading = self._extract_column(df, col_map, "heading", n_samples)
        return heading

    def _extract_gps_update(
        self,
        df: pd.DataFrame,
        col_map: dict[str, Optional[str]],
        n_samples: int,
    ) -> NDArray[np.bool_]:
        col = col_map.get("gps_update")
        if col is None or col not in df.columns:
            return np.ones(n_samples, dtype=np.bool_)
        values = df[col].values
        return values.astype(np.bool_)

    def _extract_lap(
        self,
        df: pd.DataFrame,
        col_map: dict[str, Optional[str]],
        n_samples: int,
    ) -> Optional[NDArray[np.int32]]:
        col = col_map.get("lap")
        if col is None or col not in df.columns:
            return None

        values = df[col].values
        result = np.zeros(n_samples, dtype=np.int32)
        current_lap = 0
        for i, v in enumerate(values):
            if pd.notna(v) and v != "":
                try:
                    current_lap = int(v)
                except (ValueError, TypeError):
                    pass
            result[i] = current_lap
        return result

    def _extract_column(
        self,
        df: pd.DataFrame,
        col_map: dict[str, Optional[str]],
        std_name: str,
        n_samples: int,
    ) -> NDArray[np.float64]:
        col = col_map.get(std_name)
        if col is None or col not in df.columns:
            return np.full(n_samples, np.nan, dtype=np.float64)
        return pd.to_numeric(df[col], errors="coerce").values.astype(np.float64)

    def _extract_datetime(
        self,
        filepath: Path,
        df: pd.DataFrame,
    ) -> Optional[datetime]:
        patterns = [
            r"(\\d{4})-(\\d{2})-(\\d{2})_(\\d{2})(\\d{2})(\\d{2})",
            r"(\\d{4})(\\d{2})(\\d{2})_(\\d{2})(\\d{2})(\\d{2})",
            r"(\\d{4})-(\\d{2})-(\\d{2})",
            r"(\\d{4})(\\d{2})(\\d{2})",
        ]
        for pattern in patterns:
            match = re.search(pattern, filepath.stem)
            if match:
                groups = match.groups()
                try:
                    if len(groups) >= 6:
                        return datetime(
                            int(groups[0]),
                            int(groups[1]),
                            int(groups[2]),
                            int(groups[3]),
                            int(groups[4]),
                            int(groups[5]),
                        )
                    if len(groups) >= 3:
                        return datetime(int(groups[0]), int(groups[1]), int(groups[2]))
                except ValueError:
                    pass
        return None


class TrackAddictAdapter:
    """Adapter for TrackAddict/RaceRender CSV files."""

    name = "trackaddict"

    def can_parse(self, filepath: Path, df: Optional[pd.DataFrame] = None) -> bool:
        if filepath.suffix.lower() != ".csv":
            return False
        if df is None:
            return True
        columns = {c.strip() for c in df.columns}
        return "Latitude" in columns or "Longitude" in columns or "MPH" in columns

    def parse(self, filepath: Path) -> RawTelemetry:
        return TrackAddictParser().parse_file(filepath)


class GenericCsvAdapter:
    """
    Simple adapter for CSVs with canonical column names.

    Expected columns:
    - time or timestamp (seconds)
    - latitude, longitude, altitude
    - speed_ms, accel_x, accel_y, yaw_rate, heading
    """

    name = "generic_csv"

    def can_parse(self, filepath: Path, df: Optional[pd.DataFrame] = None) -> bool:
        if filepath.suffix.lower() != ".csv":
            return False
        if df is None:
            return True
        columns = {c.strip().lower() for c in df.columns}
        return "timestamp" in columns or "time" in columns

    def parse(self, filepath: Path) -> RawTelemetry:
        df = pd.read_csv(filepath)
        df.columns = df.columns.str.strip()

        def col(name: str, default=np.nan):
            if name in df.columns:
                return pd.to_numeric(df[name], errors="coerce").values.astype(np.float64)
            return np.full(len(df), default, dtype=np.float64)

        timestamps = col("time")
        if np.all(np.isnan(timestamps)):
            timestamps = col("timestamp")

        return RawTelemetry(
            source="generic_csv",
            source_file=filepath,
            name=filepath.stem,
            timestamps=timestamps - timestamps[0],
            time_unit="s",
            latitude=col("latitude"),
            longitude=col("longitude"),
            altitude=col("altitude"),
            speed=col("speed_ms"),
            speed_unit="m/s",
            accel_x=col("accel_x"),
            accel_y=col("accel_y"),
            yaw_rate=col("yaw_rate"),
            yaw_rate_unit="deg/s",
            heading=col("heading"),
            gps_accuracy=col("gps_accuracy"),
            gps_update=np.ones(len(df), dtype=np.bool_),
            lap_number=None,
            recorded_at=None,
        )


ADAPTERS: list[TelemetryAdapter] = [
    TrackAddictAdapter(),
    GenericCsvAdapter(),
]


def _select_adapter(filepath: Path, df: Optional[pd.DataFrame] = None) -> TelemetryAdapter:
    for adapter in ADAPTERS:
        if adapter.can_parse(filepath, df):
            return adapter
    raise ValueError(f"No adapter available for file: {filepath}")

def parse_trackaddict_csv(
    filepath: Path,
    origin_lat: Optional[float] = None,
    origin_lon: Optional[float] = None,
    origin_alt: Optional[float] = None,
):
    """
    Parse TrackAddict CSV and return canonical TelemetryRun.
    """
    raw = TrackAddictAdapter().parse(filepath)
    return canonicalize_raw(raw, origin_lat, origin_lon, origin_alt)


def parse_telemetry_file(
    filepath: Path,
    origin_lat: Optional[float] = None,
    origin_lon: Optional[float] = None,
    origin_alt: Optional[float] = None,
):
    """
    Parse an arbitrary telemetry file via adapter selection.
    """
    adapter = _select_adapter(filepath)
    raw = adapter.parse(filepath)
    return canonicalize_raw(raw, origin_lat, origin_lon, origin_alt)

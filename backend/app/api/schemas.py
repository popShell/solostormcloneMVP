"""
API schemas (Pydantic models) for request/response validation.
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


# ============================================================================
# Run Schemas
# ============================================================================

class RunSummaryResponse(BaseModel):
    """Summary of a telemetry run for listing."""
    id: str
    name: str
    source_file: str
    recorded_at: Optional[str] = None
    duration_s: float
    sample_count: int
    has_gps: bool
    has_imu: bool


class OriginResponse(BaseModel):
    """Coordinate origin information."""
    lat: float
    lon: float
    alt: float
    manual_override: bool


class RunMetadataResponse(BaseModel):
    """Full metadata for a run."""
    id: str
    name: str
    source_file: str
    recorded_at: Optional[str] = None
    duration_s: float
    sample_count: int
    sample_rate_hz: float
    has_gps: bool
    has_imu: bool
    has_speed: bool
    canonical_version: str
    origin: OriginResponse
    bounding_box: tuple[float, float, float, float]  # (min_x, min_y, max_x, max_y)
    time_range: tuple[float, float]  # (start_s, end_s)


class ChannelInfoResponse(BaseModel):
    """Metadata for a telemetry channel."""
    unit: str
    provenance: str
    frame: Optional[str] = None


class RunDataResponse(BaseModel):
    """Full run data including time series."""
    metadata: RunMetadataResponse
    
    # Time series arrays (as lists for JSON serialization)
    timestamps: list[float]
    x: list[Optional[float]]
    y: list[Optional[float]]
    speed: list[Optional[float]]
    heading: list[Optional[float]]
    ax: list[Optional[float]]
    ay: list[Optional[float]]
    yaw_rate: list[Optional[float]]
    total_g: list[Optional[float]]
    validity: dict[str, list[bool]]
    channels: dict[str, ChannelInfoResponse]


class RunReloadRequest(BaseModel):
    """Request to reload a run with manual origin override."""
    origin_lat: Optional[float] = None
    origin_lon: Optional[float] = None
    origin_alt: Optional[float] = None


# ============================================================================
# Playback Schemas
# ============================================================================

class PlaybackSampleResponse(BaseModel):
    """Single sample for playback."""
    time: float
    x: float
    y: float
    speed: float
    heading: float
    ax: float
    ay: float
    yaw_rate: float
    total_g: float
    valid: dict[str, bool]


# ============================================================================
# Channel Metadata
# ============================================================================



class PlaybackDataResponse(BaseModel):
    """Playback data for a run."""
    run_id: str
    duration_s: float
    sample_rate_hz: float
    
    # Downsampled data for efficient playback
    samples: list[PlaybackSampleResponse]


class PlaybackRangeRequest(BaseModel):
    """Request for playback data in a time range."""
    start_time: float = 0.0
    end_time: Optional[float] = None
    target_sample_rate: float = Field(default=10.0, ge=1.0, le=100.0)


# ============================================================================
# Folder Management Schemas
# ============================================================================

class SetFolderRequest(BaseModel):
    """Request to set the data folder."""
    path: str


class FolderInfoResponse(BaseModel):
    """Information about the current data folder."""
    path: Optional[str]
    run_count: int


# ============================================================================
# Track Schemas (for future track editor)
# ============================================================================

class PointSchema(BaseModel):
    """2D point."""
    x: float
    y: float


class TrackElementBase(BaseModel):
    """Base schema for track elements."""
    type: str
    pos: PointSchema


class ConeElement(TrackElementBase):
    """Single cone."""
    type: str = "cone"


class GateElement(TrackElementBase):
    """Gate (pair of cones)."""
    type: str = "gate"
    width: float = 3.5  # meters
    heading: float = 0.0  # degrees


class SlalomElement(TrackElementBase):
    """Slalom (sequence of cones)."""
    type: str = "slalom"
    points: list[PointSchema]


class StartFinishElement(TrackElementBase):
    """Start or finish line."""
    type: str  # "start" or "finish"
    heading: float = 0.0


class TrackSchema(BaseModel):
    """Track definition."""
    name: str
    grid_size_m: float = 5.0
    elements: list[dict]  # Mixed element types
    path: Optional[dict] = None  # Centerline path


class TrackListResponse(BaseModel):
    """List of available tracks."""
    tracks: list[str]  # Track names


# ============================================================================
# Error Schemas
# ============================================================================

class ErrorResponse(BaseModel):
    """Standard error response."""
    detail: str
    code: Optional[str] = None

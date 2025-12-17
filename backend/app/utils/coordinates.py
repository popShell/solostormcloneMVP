"""
Coordinate transformation utilities.

Converts GPS coordinates (WGS84 lat/lon) to local East-North-Up (ENU)
Cartesian coordinates, using the first valid point as origin by default.
"""

import numpy as np
from numpy.typing import NDArray
from dataclasses import dataclass
from typing import Optional

# WGS84 ellipsoid constants
WGS84_A = 6378137.0              # Semi-major axis (meters)
WGS84_F = 1 / 298.257223563      # Flattening
WGS84_B = WGS84_A * (1 - WGS84_F)  # Semi-minor axis
WGS84_E2 = 1 - (WGS84_B**2 / WGS84_A**2)  # First eccentricity squared


@dataclass
class ENUCoordinates:
    """Result of GPS to ENU conversion."""
    east: NDArray[np.float64]    # East (X) in meters
    north: NDArray[np.float64]   # North (Y) in meters  
    up: NDArray[np.float64]      # Up (Z) in meters
    origin_lat: float
    origin_lon: float
    origin_alt: float


def geodetic_to_ecef(
    lat: NDArray[np.float64],
    lon: NDArray[np.float64], 
    alt: NDArray[np.float64]
) -> tuple[NDArray[np.float64], NDArray[np.float64], NDArray[np.float64]]:
    """
    Convert geodetic coordinates (WGS84) to ECEF (Earth-Centered Earth-Fixed).
    
    Args:
        lat: Latitude in degrees
        lon: Longitude in degrees
        alt: Altitude in meters above WGS84 ellipsoid
        
    Returns:
        Tuple of (X, Y, Z) ECEF coordinates in meters
    """
    lat_rad = np.radians(lat)
    lon_rad = np.radians(lon)
    
    # Prime vertical radius of curvature
    N = WGS84_A / np.sqrt(1 - WGS84_E2 * np.sin(lat_rad)**2)
    
    X = (N + alt) * np.cos(lat_rad) * np.cos(lon_rad)
    Y = (N + alt) * np.cos(lat_rad) * np.sin(lon_rad)
    Z = (N * (1 - WGS84_E2) + alt) * np.sin(lat_rad)
    
    return X, Y, Z


def ecef_to_enu(
    X: NDArray[np.float64],
    Y: NDArray[np.float64],
    Z: NDArray[np.float64],
    X0: float,
    Y0: float,
    Z0: float,
    lat0: float,
    lon0: float
) -> tuple[NDArray[np.float64], NDArray[np.float64], NDArray[np.float64]]:
    """
    Convert ECEF coordinates to ENU coordinates relative to origin.
    
    Args:
        X, Y, Z: ECEF coordinates in meters
        X0, Y0, Z0: Origin ECEF coordinates in meters
        lat0, lon0: Origin geodetic coordinates in degrees
        
    Returns:
        Tuple of (East, North, Up) coordinates in meters
    """
    lat0_rad = np.radians(lat0)
    lon0_rad = np.radians(lon0)
    
    # Offset from origin
    dX = X - X0
    dY = Y - Y0
    dZ = Z - Z0
    
    # Rotation matrix from ECEF to ENU
    sin_lat = np.sin(lat0_rad)
    cos_lat = np.cos(lat0_rad)
    sin_lon = np.sin(lon0_rad)
    cos_lon = np.cos(lon0_rad)
    
    east = -sin_lon * dX + cos_lon * dY
    north = -sin_lat * cos_lon * dX - sin_lat * sin_lon * dY + cos_lat * dZ
    up = cos_lat * cos_lon * dX + cos_lat * sin_lon * dY + sin_lat * dZ
    
    return east, north, up


def gps_to_enu(
    lat: NDArray[np.float64],
    lon: NDArray[np.float64],
    alt: Optional[NDArray[np.float64]] = None,
    origin_lat: Optional[float] = None,
    origin_lon: Optional[float] = None,
    origin_alt: Optional[float] = None,
) -> ENUCoordinates:
    """
    Convert GPS coordinates to local ENU (East-North-Up) frame.
    
    Uses first valid point as origin if not specified.
    
    Args:
        lat: Latitude array in degrees (WGS84)
        lon: Longitude array in degrees (WGS84)
        alt: Altitude array in meters (optional, defaults to 0)
        origin_lat: Origin latitude (optional, defaults to first valid point)
        origin_lon: Origin longitude (optional, defaults to first valid point)
        origin_alt: Origin altitude (optional, defaults to 0)
        
    Returns:
        ENUCoordinates with east, north, up arrays and origin info
    """
    # Handle missing altitude
    if alt is None:
        alt = np.zeros_like(lat)
    
    # Find first valid point for origin if not specified
    valid_mask = ~(np.isnan(lat) | np.isnan(lon))
    
    if not np.any(valid_mask):
        # No valid GPS data - return zeros
        return ENUCoordinates(
            east=np.zeros_like(lat),
            north=np.zeros_like(lat),
            up=np.zeros_like(lat),
            origin_lat=0.0,
            origin_lon=0.0,
            origin_alt=0.0,
        )
    
    first_valid_idx = np.argmax(valid_mask)
    
    if origin_lat is None:
        origin_lat = float(lat[first_valid_idx])
    if origin_lon is None:
        origin_lon = float(lon[first_valid_idx])
    if origin_alt is None:
        origin_alt = float(alt[first_valid_idx]) if not np.isnan(alt[first_valid_idx]) else 0.0
    
    # Convert all points to ECEF
    X, Y, Z = geodetic_to_ecef(lat, lon, alt)
    
    # Convert origin to ECEF
    X0, Y0, Z0 = geodetic_to_ecef(
        np.array([origin_lat]),
        np.array([origin_lon]),
        np.array([origin_alt])
    )
    
    # Convert to ENU
    east, north, up = ecef_to_enu(X, Y, Z, X0[0], Y0[0], Z0[0], origin_lat, origin_lon)
    
    # Preserve NaN for invalid points
    east = np.where(valid_mask, east, np.nan)
    north = np.where(valid_mask, north, np.nan)
    up = np.where(valid_mask, up, np.nan)
    
    return ENUCoordinates(
        east=east,
        north=north,
        up=up,
        origin_lat=origin_lat,
        origin_lon=origin_lon,
        origin_alt=origin_alt,
    )


def enu_to_gps(
    east: NDArray[np.float64],
    north: NDArray[np.float64],
    up: NDArray[np.float64],
    origin_lat: float,
    origin_lon: float,
    origin_alt: float = 0.0,
) -> tuple[NDArray[np.float64], NDArray[np.float64], NDArray[np.float64]]:
    """
    Convert ENU coordinates back to GPS (WGS84).
    
    Useful for overlaying track elements onto a map.
    
    Args:
        east, north, up: ENU coordinates in meters
        origin_lat, origin_lon: Origin geodetic coordinates in degrees
        origin_alt: Origin altitude in meters
        
    Returns:
        Tuple of (lat, lon, alt) arrays
    """
    lat0_rad = np.radians(origin_lat)
    lon0_rad = np.radians(origin_lon)
    
    sin_lat = np.sin(lat0_rad)
    cos_lat = np.cos(lat0_rad)
    sin_lon = np.sin(lon0_rad)
    cos_lon = np.cos(lon0_rad)
    
    # Rotation matrix from ENU to ECEF (transpose of the one above)
    dX = -sin_lon * east - sin_lat * cos_lon * north + cos_lat * cos_lon * up
    dY = cos_lon * east - sin_lat * sin_lon * north + cos_lat * sin_lon * up
    dZ = cos_lat * north + sin_lat * up
    
    # Get origin ECEF
    X0, Y0, Z0 = geodetic_to_ecef(
        np.array([origin_lat]),
        np.array([origin_lon]),
        np.array([origin_alt])
    )
    
    # Add offset
    X = dX + X0[0]
    Y = dY + Y0[0]
    Z = dZ + Z0[0]
    
    # Convert ECEF back to geodetic
    # Using iterative method for accuracy
    lon = np.degrees(np.arctan2(Y, X))
    
    # Iterative latitude calculation
    p = np.sqrt(X**2 + Y**2)
    lat = np.arctan2(Z, p * (1 - WGS84_E2))  # Initial estimate
    
    for _ in range(5):  # Usually converges in 2-3 iterations
        N = WGS84_A / np.sqrt(1 - WGS84_E2 * np.sin(lat)**2)
        lat = np.arctan2(Z + WGS84_E2 * N * np.sin(lat), p)
    
    lat = np.degrees(lat)
    
    N = WGS84_A / np.sqrt(1 - WGS84_E2 * np.sin(np.radians(lat))**2)
    alt = p / np.cos(np.radians(lat)) - N
    
    return lat, lon, alt


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate great-circle distance between two points.
    
    Args:
        lat1, lon1: First point coordinates in degrees
        lat2, lon2: Second point coordinates in degrees
        
    Returns:
        Distance in meters
    """
    R = 6371000  # Earth's mean radius in meters
    
    lat1_rad = np.radians(lat1)
    lat2_rad = np.radians(lat2)
    dlat = np.radians(lat2 - lat1)
    dlon = np.radians(lon2 - lon1)
    
    a = np.sin(dlat/2)**2 + np.cos(lat1_rad) * np.cos(lat2_rad) * np.sin(dlon/2)**2
    c = 2 * np.arctan2(np.sqrt(a), np.sqrt(1-a))
    
    return R * c


def compute_heading_from_positions(
    x: NDArray[np.float64],
    y: NDArray[np.float64]
) -> NDArray[np.float64]:
    """
    Compute heading from position changes.
    
    Args:
        x: East position array
        y: North position array
        
    Returns:
        Heading array in degrees (0=North, 90=East)
    """
    dx = np.diff(x, prepend=x[0])
    dy = np.diff(y, prepend=y[0])
    
    # atan2 gives angle from positive X axis (East)
    # Convert to compass heading (from North, clockwise)
    heading = np.degrees(np.arctan2(dx, dy))
    heading = heading % 360
    
    # Handle first point (use second point's heading)
    if len(heading) > 1:
        heading[0] = heading[1]
    
    return heading

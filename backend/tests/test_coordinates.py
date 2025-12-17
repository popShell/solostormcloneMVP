"""
Tests for coordinate transformation utilities.
"""

import numpy as np
import pytest
from numpy.testing import assert_allclose

from app.utils.coordinates import (
    gps_to_enu,
    enu_to_gps,
    geodetic_to_ecef,
    haversine_distance,
    compute_heading_from_positions,
)


class TestGPSToENU:
    """Tests for GPS to ENU conversion."""
    
    def test_origin_at_first_point(self):
        """First point should be at (0, 0, 0) when used as origin."""
        lat = np.array([32.9857, 32.9858, 32.9859])
        lon = np.array([-89.7898, -89.7897, -89.7896])
        
        result = gps_to_enu(lat, lon)
        
        # First point should be origin
        assert result.origin_lat == lat[0]
        assert result.origin_lon == lon[0]
        
        # First point should be at (0, 0)
        assert_allclose(result.east[0], 0.0, atol=1e-6)
        assert_allclose(result.north[0], 0.0, atol=1e-6)
    
    def test_north_movement(self):
        """Moving north should increase Y (north) coordinate."""
        # Two points, second is ~111m north
        lat = np.array([32.0, 32.001])  # ~111m north
        lon = np.array([-89.0, -89.0])  # Same longitude
        
        result = gps_to_enu(lat, lon)
        
        # Second point should be north (positive Y)
        assert result.north[1] > 0
        # Should be roughly 111 meters
        assert_allclose(result.north[1], 111.0, rtol=0.01)
        # East should be near zero
        assert_allclose(result.east[1], 0.0, atol=1.0)
    
    def test_east_movement(self):
        """Moving east should increase X (east) coordinate."""
        lat = np.array([32.0, 32.0])
        lon = np.array([-89.0, -88.999])  # ~94m east at this latitude
        
        result = gps_to_enu(lat, lon)
        
        # Second point should be east (positive X)
        assert result.east[1] > 0
        # North should be near zero
        assert_allclose(result.north[1], 0.0, atol=1.0)
    
    def test_manual_origin_override(self):
        """Manual origin should be respected."""
        lat = np.array([32.0, 32.001])
        lon = np.array([-89.0, -89.0])
        
        # Set origin to a different point
        result = gps_to_enu(lat, lon, origin_lat=32.0005, origin_lon=-89.0)
        
        assert result.origin_lat == 32.0005
        
        # First point should now be south of origin (negative Y)
        assert result.north[0] < 0
    
    def test_handles_nan_values(self):
        """NaN values in input should produce NaN in output."""
        lat = np.array([32.0, np.nan, 32.002])
        lon = np.array([-89.0, -89.0, -89.0])
        
        result = gps_to_enu(lat, lon)
        
        # First and third should be valid
        assert not np.isnan(result.east[0])
        assert not np.isnan(result.east[2])
        
        # Second should be NaN
        assert np.isnan(result.east[1])
        assert np.isnan(result.north[1])
    
    def test_all_nan_returns_zeros(self):
        """All-NaN input should return zeros."""
        lat = np.array([np.nan, np.nan])
        lon = np.array([np.nan, np.nan])
        
        result = gps_to_enu(lat, lon)
        
        assert result.origin_lat == 0.0
        assert result.origin_lon == 0.0


class TestENUToGPS:
    """Tests for ENU to GPS conversion (inverse)."""
    
    def test_round_trip_conversion(self):
        """Converting GPS→ENU→GPS should recover original coordinates."""
        lat_orig = np.array([32.9857, 32.9860, 32.9855])
        lon_orig = np.array([-89.7898, -89.7895, -89.7900])
        alt_orig = np.array([10.0, 12.0, 8.0])
        
        # Forward conversion
        enu = gps_to_enu(lat_orig, lon_orig, alt_orig)
        
        # Inverse conversion
        lat_back, lon_back, alt_back = enu_to_gps(
            enu.east, enu.north, enu.up,
            enu.origin_lat, enu.origin_lon, enu.origin_alt
        )
        
        # Should recover original (within floating point tolerance)
        assert_allclose(lat_back, lat_orig, rtol=1e-6)
        assert_allclose(lon_back, lon_orig, rtol=1e-6)
        assert_allclose(alt_back, alt_orig, rtol=1e-3)


class TestHaversineDistance:
    """Tests for haversine distance calculation."""
    
    def test_same_point_zero_distance(self):
        """Same point should have zero distance."""
        dist = haversine_distance(32.0, -89.0, 32.0, -89.0)
        assert dist == 0.0
    
    def test_one_degree_latitude(self):
        """One degree of latitude should be ~111km."""
        dist = haversine_distance(32.0, -89.0, 33.0, -89.0)
        assert_allclose(dist, 111000, rtol=0.01)
    
    def test_symmetric(self):
        """Distance should be symmetric."""
        d1 = haversine_distance(32.0, -89.0, 33.0, -88.0)
        d2 = haversine_distance(33.0, -88.0, 32.0, -89.0)
        assert_allclose(d1, d2, rtol=1e-10)


class TestHeadingFromPositions:
    """Tests for heading computation from positions."""
    
    def test_north_heading(self):
        """Moving north should give heading ~0."""
        x = np.array([0.0, 0.0, 0.0])
        y = np.array([0.0, 10.0, 20.0])
        
        heading = compute_heading_from_positions(x, y)
        
        # Should be 0 (north)
        assert_allclose(heading[1:], 0.0, atol=0.1)
    
    def test_east_heading(self):
        """Moving east should give heading ~90."""
        x = np.array([0.0, 10.0, 20.0])
        y = np.array([0.0, 0.0, 0.0])
        
        heading = compute_heading_from_positions(x, y)
        
        assert_allclose(heading[1:], 90.0, atol=0.1)
    
    def test_south_heading(self):
        """Moving south should give heading ~180."""
        x = np.array([0.0, 0.0, 0.0])
        y = np.array([20.0, 10.0, 0.0])
        
        heading = compute_heading_from_positions(x, y)
        
        assert_allclose(heading[1:], 180.0, atol=0.1)
    
    def test_west_heading(self):
        """Moving west should give heading ~270."""
        x = np.array([20.0, 10.0, 0.0])
        y = np.array([0.0, 0.0, 0.0])
        
        heading = compute_heading_from_positions(x, y)
        
        assert_allclose(heading[1:], 270.0, atol=0.1)

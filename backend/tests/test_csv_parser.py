"""
Tests for TrackAddict CSV parser.
"""

import tempfile
from pathlib import Path

import numpy as np
import pytest

from app.services.csv_parser import TrackAddictParser, parse_trackaddict_csv


@pytest.fixture
def sample_csv_content():
    """Standard RaceRender format CSV content."""
    return """# RaceRender Data
Time,Latitude,Longitude,Altitude,MPH,Heading,X,Y,GPS_Update,Accuracy
0.000,32.9857000,-89.7898000,10.0,0.0,0.0,0.000,0.000,1,3.0
0.100,32.9857100,-89.7897900,10.0,15.5,45.0,0.100,0.050,1,3.0
0.200,32.9857200,-89.7897800,10.0,25.3,48.0,0.150,0.080,1,3.0
0.300,32.9857300,-89.7897700,10.0,30.1,50.0,0.180,0.100,1,3.0
0.400,32.9857400,-89.7897600,10.0,32.5,52.0,0.200,0.110,1,3.0
"""


@pytest.fixture
def sample_csv_file(sample_csv_content, tmp_path):
    """Create a temporary CSV file."""
    csv_file = tmp_path / "test_run.csv"
    csv_file.write_text(sample_csv_content)
    return csv_file


@pytest.fixture
def simple_csv_content():
    """Simple CSV without RaceRender header."""
    return """Time,Latitude,Longitude,MPH,X,Y
0.0,32.9857,-89.7898,0.0,0.0,0.0
1.0,32.9858,-89.7897,20.0,0.1,0.05
2.0,32.9859,-89.7896,25.0,0.15,0.08
"""


@pytest.fixture
def simple_csv_file(simple_csv_content, tmp_path):
    """Create a simple CSV file."""
    csv_file = tmp_path / "simple_run.csv"
    csv_file.write_text(simple_csv_content)
    return csv_file


class TestTrackAddictParser:
    """Tests for TrackAddictParser."""
    
    def test_parse_standard_format(self, sample_csv_file):
        """Parser should handle standard RaceRender format."""
        parser = TrackAddictParser()
        raw = parser.parse_file(sample_csv_file)

        assert len(raw.timestamps) == 5
        assert not np.all(np.isnan(raw.latitude))
        assert not np.all(np.isnan(raw.speed))
        assert not np.all(np.isnan(raw.accel_x))
    
    def test_parse_simple_format(self, simple_csv_file):
        """Parser should handle CSV without RaceRender header."""
        parser = TrackAddictParser()
        raw = parser.parse_file(simple_csv_file)

        assert len(raw.timestamps) == 3
        assert not np.all(np.isnan(raw.latitude))
    
    def test_timestamps_normalized(self, sample_csv_file):
        """Timestamps should start at 0."""
        parser = TrackAddictParser()
        raw = parser.parse_file(sample_csv_file)

        assert raw.timestamps[0] == 0.0
    
    def test_gps_converted_to_enu(self, sample_csv_file):
        """GPS coordinates should be converted to ENU."""
        run = parse_trackaddict_csv(sample_csv_file)
        
        # First point should be at origin
        assert abs(run.x[0]) < 1e-6
        assert abs(run.y[0]) < 1e-6
        
        # Later points should have moved
        assert run.x[-1] != 0.0 or run.y[-1] != 0.0
    
    def test_speed_converted_to_ms(self, sample_csv_file):
        """Speed should be converted to m/s."""
        run = parse_trackaddict_csv(sample_csv_file)
        
        # MPH values in file: 0, 15.5, 25.3, 30.1, 32.5
        # At index 1: 15.5 MPH ≈ 6.93 m/s
        expected_ms = 15.5 * 0.44704
        assert abs(run.speed[1] - expected_ms) < 0.01
    
    def test_acceleration_extracted(self, sample_csv_file):
        """Acceleration data should be extracted."""
        raw = TrackAddictParser().parse_file(sample_csv_file)
        
        # X and Y columns in sample are acceleration
        assert not np.all(np.isnan(raw.accel_x))
        assert not np.all(np.isnan(raw.accel_y))
    
    def test_manual_origin_override(self, sample_csv_file):
        """Manual origin should override automatic detection."""
        # Parse with default origin
        run1 = parse_trackaddict_csv(sample_csv_file)

        # Parse with manual origin
        run2 = parse_trackaddict_csv(
            sample_csv_file,
            origin_lat=32.98575,  # Shifted origin
            origin_lon=-89.78975,
        )
        
        # Origins should differ
        assert run1.origin.lat != run2.origin.lat
        
        # Manual override flag should be set
        assert not run1.origin.manual_override
        assert run2.origin.manual_override
    
    def test_run_id_generation(self, sample_csv_file):
        """Run ID should be consistent for same file."""
        run1 = parse_trackaddict_csv(sample_csv_file)
        run2 = parse_trackaddict_csv(sample_csv_file)
        
        assert run1.metadata.id == run2.metadata.id
    
    def test_bounding_box(self, sample_csv_file):
        """Bounding box should encompass all points."""
        run = parse_trackaddict_csv(sample_csv_file)
        
        min_x, min_y, max_x, max_y = run.get_bounding_box()
        
        valid_x = run.x[~np.isnan(run.x)]
        valid_y = run.y[~np.isnan(run.y)]
        
        assert min_x <= np.min(valid_x)
        assert max_x >= np.max(valid_x)
        assert min_y <= np.min(valid_y)
        assert max_y >= np.max(valid_y)


class TestParseConvenienceFunction:
    """Tests for parse_trackaddict_csv convenience function."""
    
    def test_convenience_function(self, sample_csv_file):
        """Convenience function should work like parser."""
        run = parse_trackaddict_csv(sample_csv_file)
        
        assert run.metadata.sample_count == 5
        assert run.metadata.source_file == sample_csv_file


class TestTimeFormats:
    """Tests for different time format handling."""
    
    def test_hms_time_format(self, tmp_path):
        """Parser should handle hh:mm:ss.nn time format."""
        content = """Time,Latitude,Longitude,MPH
00:00:00.00,32.9857,-89.7898,0.0
00:00:01.00,32.9858,-89.7897,20.0
00:01:30.50,32.9859,-89.7896,25.0
"""
        csv_file = tmp_path / "hms_time.csv"
        csv_file.write_text(content)
        
        run = parse_trackaddict_csv(csv_file)
        
        # Times should be converted to seconds
        assert run.timestamps[0] == 0.0
        assert run.timestamps[1] == 1.0
        assert run.timestamps[2] == 90.5  # 1:30.5
    
    def test_milliseconds_time_format(self, tmp_path):
        """Parser should handle raw millisecond times."""
        content = """GPS Time,Latitude,Longitude,MPH
0,32.9857,-89.7898,0.0
1000,32.9858,-89.7897,20.0
2500,32.9859,-89.7896,25.0
"""
        csv_file = tmp_path / "ms_time.csv"
        csv_file.write_text(content)
        
        run = parse_trackaddict_csv(csv_file)

        assert run.timestamps[0] == 0.0
        assert run.timestamps[1] == 1.0


class TestMissingData:
    """Tests for handling missing data."""
    
    def test_missing_altitude(self, tmp_path):
        """Parser should handle missing altitude column."""
        content = """Time,Latitude,Longitude,MPH
0.0,32.9857,-89.7898,0.0
1.0,32.9858,-89.7897,20.0
"""
        csv_file = tmp_path / "no_alt.csv"
        csv_file.write_text(content)
        
        run = parse_trackaddict_csv(csv_file)
        
        # Should default altitude to 0 when missing
        assert np.allclose(run.z, 0.0)
    
    def test_missing_acceleration(self, tmp_path):
        """Parser should handle missing acceleration columns."""
        content = """Time,Latitude,Longitude,MPH
0.0,32.9857,-89.7898,0.0
1.0,32.9858,-89.7897,20.0
"""
        csv_file = tmp_path / "no_accel.csv"
        csv_file.write_text(content)
        
        run = parse_trackaddict_csv(csv_file)
        
        assert run.metadata.has_imu == False
        assert np.all(np.isnan(run.ax_body))
    
    def test_missing_speed_derived(self, tmp_path):
        """Speed should be derived from position if missing."""
        content = """Time,Latitude,Longitude
0.0,32.9857,-89.7898
1.0,32.9858,-89.7897
"""
        csv_file = tmp_path / "no_speed.csv"
        csv_file.write_text(content)
        
        run = parse_trackaddict_csv(csv_file)
        
        # Speed should be derived (not all zeros or NaN)
        assert not np.all(run.speed == 0)
        assert not np.all(np.isnan(run.speed))


class TestTelemetryRunMethods:
    """Tests for TelemetryRun methods."""
    
    def test_sample_at_time_interpolation(self, sample_csv_file):
        """sample_at_time should interpolate between samples."""
        run = parse_trackaddict_csv(sample_csv_file)
        
        # Get sample at t=0.15 (between 0.1 and 0.2)
        sample = run.sample_at_time(0.15)
        
        assert sample['time'] == 0.15
        
        # Values should be between neighboring samples
        # (exact interpolation depends on data)
        assert sample["valid"].get("speed", False)
    
    def test_total_g_property(self, sample_csv_file):
        """total_g should be computed from ax and ay."""
        run = parse_trackaddict_csv(sample_csv_file)
        
        total_g = run.total_g
        
        # Should be sqrt(ax^2 + ay^2)
        expected = np.sqrt(run.ax_body**2 + run.ay_body**2)
        np.testing.assert_allclose(total_g, expected, equal_nan=True)
    
    def test_time_range(self, sample_csv_file):
        """get_time_range should return correct bounds."""
        run = parse_trackaddict_csv(sample_csv_file)
        
        start, end = run.get_time_range()
        
        assert start == run.timestamps[0]
        assert end == run.timestamps[-1]

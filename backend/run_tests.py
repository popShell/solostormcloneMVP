#!/usr/bin/env python3
"""
Standalone test runner for autocross-telemetry backend.

Does not require pytest - uses built-in unittest discovery.
"""

import sys
import tempfile
import traceback
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

import numpy as np

# Track test results
passed = 0
failed = 0
errors = []


def test(name):
    """Decorator to mark and run a test function."""
    def decorator(func):
        global passed, failed, errors
        try:
            func()
            print(f"  ✓ {name}")
            passed += 1
        except AssertionError as e:
            print(f"  ✗ {name}")
            print(f"    AssertionError: {e}")
            failed += 1
            errors.append((name, str(e)))
        except Exception as e:
            print(f"  ✗ {name}")
            print(f"    {type(e).__name__}: {e}")
            failed += 1
            errors.append((name, traceback.format_exc()))
        return func
    return decorator


def assert_close(a, b, rtol=1e-5, atol=1e-8, msg=""):
    """Assert two values are close."""
    if not np.allclose(a, b, rtol=rtol, atol=atol):
        raise AssertionError(f"{msg}: {a} != {b} (rtol={rtol}, atol={atol})")


# ============================================================================
# Coordinate Tests
# ============================================================================

print("\n=== Coordinate Transformation Tests ===")

from app.utils.coordinates import (
    gps_to_enu, enu_to_gps, haversine_distance, compute_heading_from_positions
)


@test("GPS to ENU: origin at first point")
def test_gps_enu_origin():
    lat = np.array([32.9857, 32.9858, 32.9859])
    lon = np.array([-89.7898, -89.7897, -89.7896])
    result = gps_to_enu(lat, lon)
    assert result.origin_lat == lat[0], f"Origin lat mismatch"
    assert_close(result.east[0], 0.0, atol=1e-6, msg="First point east")
    assert_close(result.north[0], 0.0, atol=1e-6, msg="First point north")


@test("GPS to ENU: north movement increases Y")
def test_gps_enu_north():
    lat = np.array([32.0, 32.001])  # ~111m north
    lon = np.array([-89.0, -89.0])
    result = gps_to_enu(lat, lon)
    assert result.north[1] > 0, "Should move north"
    assert_close(result.north[1], 111.0, rtol=0.01, msg="Distance")


@test("GPS to ENU: east movement increases X")
def test_gps_enu_east():
    lat = np.array([32.0, 32.0])
    lon = np.array([-89.0, -88.999])
    result = gps_to_enu(lat, lon)
    assert result.east[1] > 0, "Should move east"


@test("GPS to ENU: handles NaN")
def test_gps_enu_nan():
    lat = np.array([32.0, np.nan, 32.002])
    lon = np.array([-89.0, -89.0, -89.0])
    result = gps_to_enu(lat, lon)
    assert not np.isnan(result.east[0]), "First should be valid"
    assert np.isnan(result.east[1]), "Second should be NaN"


@test("ENU to GPS round-trip")
def test_enu_gps_roundtrip():
    lat_orig = np.array([32.9857, 32.9860])
    lon_orig = np.array([-89.7898, -89.7895])
    alt_orig = np.array([10.0, 12.0])
    enu = gps_to_enu(lat_orig, lon_orig, alt_orig)
    lat_back, lon_back, alt_back = enu_to_gps(
        enu.east, enu.north, enu.up,
        enu.origin_lat, enu.origin_lon, enu.origin_alt
    )
    assert_close(lat_back, lat_orig, rtol=1e-6, msg="Latitude roundtrip")
    assert_close(lon_back, lon_orig, rtol=1e-6, msg="Longitude roundtrip")


@test("Haversine: one degree latitude ~111km")
def test_haversine():
    dist = haversine_distance(32.0, -89.0, 33.0, -89.0)
    assert_close(dist, 111000, rtol=0.01, msg="One degree lat")


@test("Heading: north = 0 degrees")
def test_heading_north():
    x = np.array([0.0, 0.0, 0.0])
    y = np.array([0.0, 10.0, 20.0])
    heading = compute_heading_from_positions(x, y)
    assert_close(heading[1:], 0.0, atol=0.1, msg="North heading")


@test("Heading: east = 90 degrees")
def test_heading_east():
    x = np.array([0.0, 10.0, 20.0])
    y = np.array([0.0, 0.0, 0.0])
    heading = compute_heading_from_positions(x, y)
    assert_close(heading[1:], 90.0, atol=0.1, msg="East heading")


# ============================================================================
# CSV Parser Tests
# ============================================================================

print("\n=== CSV Parser Tests ===")

from app.services.csv_parser import TrackAddictParser, parse_trackaddict_csv


def create_sample_csv(tmp_dir: Path, content: str, name: str = "test.csv") -> Path:
    """Create a temporary CSV file."""
    csv_path = tmp_dir / name
    csv_path.write_text(content)
    return csv_path


SAMPLE_CSV = """# RaceRender Data
Time,Latitude,Longitude,Altitude,MPH,Heading,X,Y,GPS_Update,Accuracy
0.000,32.9857000,-89.7898000,10.0,0.0,0.0,0.000,0.000,1,3.0
0.100,32.9857100,-89.7897900,10.0,15.5,45.0,0.100,0.050,1,3.0
0.200,32.9857200,-89.7897800,10.0,25.3,48.0,0.150,0.080,1,3.0
0.300,32.9857300,-89.7897700,10.0,30.1,50.0,0.180,0.100,1,3.0
0.400,32.9857400,-89.7897600,10.0,32.5,52.0,0.200,0.110,1,3.0
"""


@test("Parser: standard RaceRender format")
def test_parser_standard():
    with tempfile.TemporaryDirectory() as tmp:
        csv_path = create_sample_csv(Path(tmp), SAMPLE_CSV)
        run = parse_trackaddict_csv(csv_path)
        assert run.metadata.sample_count == 5
        assert run.metadata.has_gps
        assert run.metadata.has_imu


@test("Parser: timestamps normalized to 0")
def test_parser_timestamps():
    with tempfile.TemporaryDirectory() as tmp:
        csv_path = create_sample_csv(Path(tmp), SAMPLE_CSV)
        run = parse_trackaddict_csv(csv_path)
        assert run.timestamps[0] == 0.0


@test("Parser: GPS converted to ENU")
def test_parser_enu():
    with tempfile.TemporaryDirectory() as tmp:
        csv_path = create_sample_csv(Path(tmp), SAMPLE_CSV)
        run = parse_trackaddict_csv(csv_path)
        assert abs(run.x[0]) < 1e-6
        assert abs(run.y[0]) < 1e-6


@test("Parser: speed converted to m/s")
def test_parser_speed():
    with tempfile.TemporaryDirectory() as tmp:
        csv_path = create_sample_csv(Path(tmp), SAMPLE_CSV)
        run = parse_trackaddict_csv(csv_path)
        expected_ms = 15.5 * 0.44704
        assert_close(run.speed[1], expected_ms, rtol=0.01, msg="Speed conversion")


@test("Parser: manual origin override")
def test_parser_origin_override():
    with tempfile.TemporaryDirectory() as tmp:
        csv_path = create_sample_csv(Path(tmp), SAMPLE_CSV)
        run = parse_trackaddict_csv(csv_path, origin_lat=32.98575, origin_lon=-89.78975)
        assert run.origin.manual_override


@test("Parser: bounding box")
def test_parser_bbox():
    with tempfile.TemporaryDirectory() as tmp:
        csv_path = create_sample_csv(Path(tmp), SAMPLE_CSV)
        run = parse_trackaddict_csv(csv_path)
        min_x, min_y, max_x, max_y = run.get_bounding_box()
        valid_x = run.x[~np.isnan(run.x)]
        valid_y = run.y[~np.isnan(run.y)]
        assert min_x <= np.min(valid_x)
        assert max_x >= np.max(valid_x)


@test("Parser: total_g property")
def test_total_g():
    with tempfile.TemporaryDirectory() as tmp:
        csv_path = create_sample_csv(Path(tmp), SAMPLE_CSV)
        run = parse_trackaddict_csv(csv_path)
        expected = np.sqrt(run.ax_body**2 + run.ay_body**2)
        assert_close(run.total_g, expected, msg="Total G")


# ============================================================================
# Repository Tests
# ============================================================================

print("\n=== Repository Tests ===")

from app.services.repository import RunRepository


@test("Repository: scan folder")
def test_repo_scan():
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        create_sample_csv(tmp_path, SAMPLE_CSV, "run1.csv")
        create_sample_csv(tmp_path, SAMPLE_CSV, "run2.csv")
        
        repo = RunRepository(tmp_path)
        assert len(repo._index) == 2


@test("Repository: list runs")
def test_repo_list():
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        create_sample_csv(tmp_path, SAMPLE_CSV, "run1.csv")
        
        repo = RunRepository(tmp_path)
        summaries = repo.list_runs()
        assert len(summaries) == 1


@test("Repository: get run")
def test_repo_get():
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        create_sample_csv(tmp_path, SAMPLE_CSV, "run1.csv")
        
        repo = RunRepository(tmp_path)
        summaries = repo.list_runs()
        run = repo.get_run(summaries[0].id)
        assert run is not None
        assert run.metadata.sample_count == 5


@test("Repository: cache works")
def test_repo_cache():
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        create_sample_csv(tmp_path, SAMPLE_CSV, "run1.csv")
        
        repo = RunRepository(tmp_path)
        summaries = repo.list_runs()
        run_id = summaries[0].id
        
        # First load
        run1 = repo.get_run(run_id)
        # Second load (from cache)
        run2 = repo.get_run(run_id)
        
        assert run1 is run2  # Same object from cache


# ============================================================================
# Sample Data Generator Tests
# ============================================================================

print("\n=== Sample Data Generator Tests ===")

from app.utils.sample_data import generate_figure_eight_run, generate_slalom_run


@test("Generate figure-8 run")
def test_gen_figure8():
    with tempfile.TemporaryDirectory() as tmp:
        output = Path(tmp) / "figure8.csv"
        result = generate_figure_eight_run(output, duration_s=10.0)
        assert result.exists()
        # Verify it parses
        run = parse_trackaddict_csv(result)
        assert run.metadata.sample_count > 0


@test("Generate slalom run")
def test_gen_slalom():
    with tempfile.TemporaryDirectory() as tmp:
        output = Path(tmp) / "slalom.csv"
        result = generate_slalom_run(output, duration_s=10.0)
        assert result.exists()
        run = parse_trackaddict_csv(result)
        assert run.metadata.sample_count > 0


# ============================================================================
# Flask API Tests (if Flask is available)
# ============================================================================

print("\n=== Flask API Tests ===")

try:
    from app.flask_app import app, create_app
    from app.services.repository import init_repository
    
    @test("API: root endpoint")
    def test_api_root():
        with app.test_client() as client:
            response = client.get("/")
            assert response.status_code == 200
            data = response.get_json()
            assert data["name"] == "Autocross Telemetry MVP"
    
    @test("API: health endpoint")
    def test_api_health():
        with app.test_client() as client:
            response = client.get("/health")
            assert response.status_code == 200
            data = response.get_json()
            assert data["status"] == "healthy"
    
    @test("API: set folder and list runs")
    def test_api_folder_and_list():
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            create_sample_csv(tmp_path, SAMPLE_CSV, "run1.csv")
            
            with app.test_client() as client:
                # Set folder
                response = client.post("/folder", json={"path": str(tmp_path)})
                assert response.status_code == 200
                
                # List runs
                response = client.get("/runs")
                assert response.status_code == 200
                data = response.get_json()
                assert len(data) == 1
    
    @test("API: get run data")
    def test_api_run_data():
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            create_sample_csv(tmp_path, SAMPLE_CSV, "run1.csv")
            init_repository(tmp_path)
            
            with app.test_client() as client:
                # Get runs
                response = client.get("/runs")
                runs = response.get_json()
                run_id = runs[0]["id"]
                
                # Get data
                response = client.get(f"/runs/{run_id}/data")
                assert response.status_code == 200
                data = response.get_json()
                assert len(data["timestamps"]) == 5
    
    @test("API: playback endpoint")
    def test_api_playback():
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            create_sample_csv(tmp_path, SAMPLE_CSV, "run1.csv")
            init_repository(tmp_path)
            
            with app.test_client() as client:
                response = client.get("/runs")
                runs = response.get_json()
                run_id = runs[0]["id"]
                
                response = client.get(f"/runs/{run_id}/playback?target_rate=5")
                assert response.status_code == 200
                data = response.get_json()
                assert data["sample_rate_hz"] == 5.0

except ImportError as e:
    print(f"  ⚠ Flask tests skipped: {e}")


# ============================================================================
# Summary
# ============================================================================

print("\n" + "=" * 50)
print(f"RESULTS: {passed} passed, {failed} failed")
print("=" * 50)

if errors:
    print("\nFailures:")
    for name, error in errors:
        print(f"\n--- {name} ---")
        print(error)

sys.exit(0 if failed == 0 else 1)

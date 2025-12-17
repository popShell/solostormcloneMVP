"""
Tests for API endpoints.
"""

import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.repository import init_repository, get_repository


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
def test_data_folder(sample_csv_content, tmp_path):
    """Create a test data folder with sample CSVs."""
    data_folder = tmp_path / "runs"
    data_folder.mkdir()
    
    # Create multiple test files
    (data_folder / "run_001.csv").write_text(sample_csv_content)
    (data_folder / "run_002.csv").write_text(sample_csv_content)
    
    return data_folder


@pytest.fixture
def client_with_data(test_data_folder):
    """Create test client with initialized repository."""
    # Initialize repository with test data
    init_repository(test_data_folder)
    
    client = TestClient(app)
    yield client


@pytest.fixture
def client():
    """Create test client without initialized repository."""
    return TestClient(app)


class TestHealthEndpoints:
    """Tests for health check endpoints."""
    
    def test_root_endpoint(self, client):
        """Root endpoint should return basic info."""
        response = client.get("/")
        
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Autocross Telemetry MVP"
        assert data["status"] == "running"
    
    def test_health_endpoint(self, client):
        """Health endpoint should return status."""
        response = client.get("/health")
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"


class TestFolderEndpoints:
    """Tests for folder management endpoints."""
    
    def test_get_folder_info_empty(self, client):
        """Should return empty info when no folder set."""
        # Reset repository
        from app.services import repository
        repository._repository = None
        
        response = client.get("/folder")
        
        assert response.status_code == 200
        data = response.json()
        assert data["run_count"] == 0
    
    def test_set_folder(self, client, test_data_folder):
        """Should set folder and scan for CSVs."""
        response = client.post("/folder", json={"path": str(test_data_folder)})
        
        assert response.status_code == 200
        data = response.json()
        assert data["path"] == str(test_data_folder)
        assert data["run_count"] == 2
    
    def test_set_nonexistent_folder(self, client, tmp_path):
        """Should return error for nonexistent folder."""
        bad_path = tmp_path / "nonexistent"
        response = client.post("/folder", json={"path": str(bad_path)})
        
        assert response.status_code == 400
    
    def test_rescan_folder(self, client_with_data, test_data_folder):
        """Should rescan folder for new files."""
        # Add a new file
        (test_data_folder / "run_003.csv").write_text("""Time,Latitude,Longitude
0.0,32.9857,-89.7898
1.0,32.9858,-89.7897
""")
        
        response = client_with_data.post("/folder/rescan")
        
        assert response.status_code == 200
        data = response.json()
        assert data["run_count"] == 3


class TestRunsEndpoints:
    """Tests for run management endpoints."""
    
    def test_list_runs(self, client_with_data):
        """Should list all available runs."""
        response = client_with_data.get("/runs")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        
        # Check structure
        run = data[0]
        assert "id" in run
        assert "name" in run
        assert "duration_s" in run
        assert "sample_count" in run
    
    def test_get_run_metadata(self, client_with_data):
        """Should get metadata for a specific run."""
        # First get list to find an ID
        runs = client_with_data.get("/runs").json()
        run_id = runs[0]["id"]
        
        response = client_with_data.get(f"/runs/{run_id}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == run_id
        assert "origin" in data
        assert "bounding_box" in data
        assert "time_range" in data
    
    def test_get_run_not_found(self, client_with_data):
        """Should return 404 for nonexistent run."""
        response = client_with_data.get("/runs/nonexistent_id")
        
        assert response.status_code == 404
    
    def test_get_run_data(self, client_with_data):
        """Should get full telemetry data."""
        runs = client_with_data.get("/runs").json()
        run_id = runs[0]["id"]
        
        response = client_with_data.get(f"/runs/{run_id}/data")
        
        assert response.status_code == 200
        data = response.json()
        
        # Check data arrays are present
        assert "timestamps" in data
        assert "x" in data
        assert "y" in data
        assert "speed" in data
        
        # Check lengths match
        assert len(data["timestamps"]) == data["metadata"]["sample_count"]
    
    def test_reload_run_with_origin_override(self, client_with_data):
        """Should reload run with new origin."""
        runs = client_with_data.get("/runs").json()
        run_id = runs[0]["id"]
        
        response = client_with_data.post(
            f"/runs/{run_id}/reload",
            json={
                "origin_lat": 32.986,
                "origin_lon": -89.790
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["origin"]["manual_override"] == True
        assert data["origin"]["lat"] == 32.986


class TestPlaybackEndpoints:
    """Tests for playback data endpoints."""
    
    def test_get_playback_data(self, client_with_data):
        """Should get downsampled playback data."""
        runs = client_with_data.get("/runs").json()
        run_id = runs[0]["id"]
        
        response = client_with_data.get(f"/runs/{run_id}/playback")
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["run_id"] == run_id
        assert "samples" in data
        assert len(data["samples"]) > 0
        
        # Check sample structure
        sample = data["samples"][0]
        assert "time" in sample
        assert "x" in sample
        assert "y" in sample
        assert "speed" in sample
    
    def test_playback_with_custom_rate(self, client_with_data):
        """Should respect custom sample rate."""
        runs = client_with_data.get("/runs").json()
        run_id = runs[0]["id"]
        
        # Request 5 Hz playback
        response = client_with_data.get(
            f"/runs/{run_id}/playback",
            params={"target_rate": 5.0}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["sample_rate_hz"] == 5.0
    
    def test_playback_with_time_range(self, client_with_data):
        """Should respect time range parameters."""
        runs = client_with_data.get("/runs").json()
        run_id = runs[0]["id"]
        
        response = client_with_data.get(
            f"/runs/{run_id}/playback",
            params={"start_time": 0.1, "end_time": 0.3}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # All samples should be in range
        for sample in data["samples"]:
            assert sample["time"] >= 0.1
            assert sample["time"] <= 0.3
    
    def test_playback_invalid_range(self, client_with_data):
        """Should return error for invalid time range."""
        runs = client_with_data.get("/runs").json()
        run_id = runs[0]["id"]
        
        response = client_with_data.get(
            f"/runs/{run_id}/playback",
            params={"start_time": 0.5, "end_time": 0.1}  # End before start
        )
        
        assert response.status_code == 400

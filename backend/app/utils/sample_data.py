"""
Sample data generator for testing.

Generates realistic-looking autocross telemetry data in TrackAddict/RaceRender format.
"""

import math
import numpy as np
from pathlib import Path
from datetime import datetime


def generate_figure_eight_run(
    output_path: Path,
    duration_s: float = 60.0,
    sample_rate_hz: float = 10.0,
    center_lat: float = 32.9857,  # Example: New Orleans area
    center_lon: float = -89.7898,
    loop_radius_m: float = 30.0,
    max_speed_mph: float = 45.0,
) -> Path:
    """
    Generate a figure-8 shaped autocross run.
    
    This creates a realistic test file with GPS, speed, and acceleration data.
    """
    n_samples = int(duration_s * sample_rate_hz)
    timestamps = np.linspace(0, duration_s, n_samples)
    
    # Figure-8 parametric curve (lemniscate of Gerono)
    # x = cos(t), y = sin(t)*cos(t)
    t_param = timestamps / duration_s * 4 * np.pi  # Two complete loops
    
    # Scale to meters
    x_local = loop_radius_m * np.cos(t_param)
    y_local = loop_radius_m * np.sin(t_param) * np.cos(t_param)
    
    # Add some noise to make it realistic
    x_local += np.random.normal(0, 0.5, n_samples)
    y_local += np.random.normal(0, 0.5, n_samples)
    
    # Convert local meters to GPS coordinates
    # Approximate conversion at this latitude
    meters_per_deg_lat = 111000
    meters_per_deg_lon = 111000 * np.cos(np.radians(center_lat))
    
    lat = center_lat + y_local / meters_per_deg_lat
    lon = center_lon + x_local / meters_per_deg_lon
    
    # Calculate speed from position changes
    dx = np.diff(x_local, prepend=x_local[0])
    dy = np.diff(y_local, prepend=y_local[0])
    dt = 1.0 / sample_rate_hz
    
    speed_ms = np.sqrt(dx**2 + dy**2) / dt
    speed_ms[0] = speed_ms[1]  # Fix first sample
    
    # Scale to target max speed
    speed_scale = (max_speed_mph * 0.44704) / np.max(speed_ms)
    speed_ms *= speed_scale * 0.8  # Leave some headroom
    speed_mph = speed_ms / 0.44704
    
    # Calculate heading
    heading = np.degrees(np.arctan2(dx, dy)) % 360
    
    # Calculate acceleration
    # Lateral acceleration from curvature: a_lat = v^2 / r
    # Approximate curvature from heading change
    heading_rad = np.radians(heading)
    dheading = np.diff(heading_rad, prepend=heading_rad[0])
    
    # Handle wraparound
    dheading = np.where(dheading > np.pi, dheading - 2*np.pi, dheading)
    dheading = np.where(dheading < -np.pi, dheading + 2*np.pi, dheading)
    
    # Curvature = d(heading)/ds where ds = speed * dt
    ds = speed_ms * dt
    ds = np.where(ds == 0, 0.001, ds)  # Avoid division by zero
    curvature = dheading / ds
    
    # Lateral G = v^2 * curvature / g
    g = 9.81
    lateral_g = speed_ms**2 * curvature / g
    lateral_g = np.clip(lateral_g, -2.0, 2.0)  # Realistic limits
    
    # Longitudinal acceleration from speed change
    dspeed = np.diff(speed_ms, prepend=speed_ms[0])
    long_g = dspeed / dt / g
    long_g = np.clip(long_g, -1.5, 1.5)
    
    # Add noise to accelerations
    lateral_g += np.random.normal(0, 0.05, n_samples)
    long_g += np.random.normal(0, 0.03, n_samples)
    
    # Build CSV content
    lines = ["# RaceRender Data"]
    lines.append("Time,Latitude,Longitude,Altitude,MPH,Heading,X,Y,GPS_Update,Accuracy")
    
    for i in range(n_samples):
        line = (
            f"{timestamps[i]:.3f},"
            f"{lat[i]:.7f},"
            f"{lon[i]:.7f},"
            f"10.0,"  # Constant altitude
            f"{speed_mph[i]:.1f},"
            f"{heading[i]:.1f},"
            f"{long_g[i]:.3f},"
            f"{lateral_g[i]:.3f},"
            f"1,"
            f"3.0"  # GPS accuracy
        )
        lines.append(line)
    
    # Write file
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'w') as f:
        f.write('\n'.join(lines))
    
    return output_path


def generate_slalom_run(
    output_path: Path,
    duration_s: float = 30.0,
    sample_rate_hz: float = 10.0,
    center_lat: float = 32.9857,
    center_lon: float = -89.7898,
    cone_spacing_m: float = 15.0,
    n_cones: int = 8,
    max_speed_mph: float = 35.0,
) -> Path:
    """
    Generate a slalom run through cones.
    """
    n_samples = int(duration_s * sample_rate_hz)
    timestamps = np.linspace(0, duration_s, n_samples)
    
    # Sinusoidal path through cones
    total_length = cone_spacing_m * n_cones
    x_local = timestamps / duration_s * total_length
    
    # Weave amplitude decreases with speed (tighter line at high speed)
    weave_amp = 3.0  # meters
    y_local = weave_amp * np.sin(2 * np.pi * x_local / cone_spacing_m)
    
    # Add realistic noise
    x_local += np.random.normal(0, 0.3, n_samples)
    y_local += np.random.normal(0, 0.3, n_samples)
    
    # Convert to GPS
    meters_per_deg_lat = 111000
    meters_per_deg_lon = 111000 * np.cos(np.radians(center_lat))
    
    lat = center_lat + y_local / meters_per_deg_lat
    lon = center_lon + x_local / meters_per_deg_lon
    
    # Calculate speed
    dx = np.diff(x_local, prepend=x_local[0])
    dy = np.diff(y_local, prepend=y_local[0])
    dt = 1.0 / sample_rate_hz
    
    speed_ms = np.sqrt(dx**2 + dy**2) / dt
    speed_ms[0] = speed_ms[1]
    
    # Scale speed
    target_avg_speed = max_speed_mph * 0.44704 * 0.7
    speed_ms = speed_ms / np.mean(speed_ms) * target_avg_speed
    speed_mph = speed_ms / 0.44704
    
    # Heading
    heading = np.degrees(np.arctan2(dx, dy)) % 360
    
    # Accelerations
    heading_rad = np.radians(heading)
    dheading = np.diff(heading_rad, prepend=heading_rad[0])
    dheading = np.where(dheading > np.pi, dheading - 2*np.pi, dheading)
    dheading = np.where(dheading < -np.pi, dheading + 2*np.pi, dheading)
    
    ds = speed_ms * dt
    ds = np.where(ds == 0, 0.001, ds)
    curvature = dheading / ds
    
    g = 9.81
    lateral_g = speed_ms**2 * curvature / g
    lateral_g = np.clip(lateral_g, -1.5, 1.5)
    
    dspeed = np.diff(speed_ms, prepend=speed_ms[0])
    long_g = dspeed / dt / g
    long_g = np.clip(long_g, -1.0, 1.0)
    
    lateral_g += np.random.normal(0, 0.05, n_samples)
    long_g += np.random.normal(0, 0.03, n_samples)
    
    # Build CSV
    lines = ["# RaceRender Data"]
    lines.append("Time,Latitude,Longitude,Altitude,MPH,Heading,X,Y,GPS_Update,Accuracy")
    
    for i in range(n_samples):
        lines.append(
            f"{timestamps[i]:.3f},"
            f"{lat[i]:.7f},"
            f"{lon[i]:.7f},"
            f"10.0,"
            f"{speed_mph[i]:.1f},"
            f"{heading[i]:.1f},"
            f"{long_g[i]:.3f},"
            f"{lateral_g[i]:.3f},"
            f"1,"
            f"3.0"
        )
    
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'w') as f:
        f.write('\n'.join(lines))
    
    return output_path


def generate_test_data_set(output_folder: Path) -> list[Path]:
    """Generate a set of test data files."""
    output_folder.mkdir(parents=True, exist_ok=True)
    
    files = []
    
    # Figure-8 runs with different characteristics
    files.append(generate_figure_eight_run(
        output_folder / "run_001_figure8_fast.csv",
        duration_s=45.0,
        max_speed_mph=50.0,
        loop_radius_m=35.0,
    ))
    
    files.append(generate_figure_eight_run(
        output_folder / "run_002_figure8_tight.csv",
        duration_s=60.0,
        max_speed_mph=35.0,
        loop_radius_m=20.0,
    ))
    
    # Slalom runs
    files.append(generate_slalom_run(
        output_folder / "run_003_slalom_8cone.csv",
        duration_s=25.0,
        n_cones=8,
        max_speed_mph=40.0,
    ))
    
    files.append(generate_slalom_run(
        output_folder / "run_004_slalom_12cone.csv",
        duration_s=35.0,
        n_cones=12,
        cone_spacing_m=12.0,
        max_speed_mph=35.0,
    ))
    
    return files


if __name__ == "__main__":
    # Generate test data when run directly
    output = Path("./data/runs")
    files = generate_test_data_set(output)
    print(f"Generated {len(files)} test files in {output}")
    for f in files:
        print(f"  - {f.name}")

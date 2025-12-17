# Autocross Telemetry MVP

Desktop-first telemetry analysis application for autocross/motorsports, with web-ready architecture.

## Project Overview

This MVP provides:
- **TrackAddict CSV ingestion** - Parse GPS + IMU telemetry data
- **GPS → ENU coordinate conversion** - Convert lat/lon to local Cartesian coordinates
- **Run visualization** - Canvas-based rendering with speed/G-force heatmaps
- **Playback controls** - Play, pause, scrub, and speed control

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                        │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │ RunList  │  │ TrackCanvas  │  │ VisualizationPanel   │ │
│  │ Sidebar  │  │   (Canvas)   │  │     (Settings)       │ │
│  └──────────┘  └──────────────┘  └───────────────────────┘ │
│                 └──────┬───────┘                            │
│                        │ PlaybackControls                   │
└────────────────────────┼────────────────────────────────────┘
                         │ HTTP/JSON API
┌────────────────────────┼────────────────────────────────────┐
│                     Backend (Flask)                         │
│  ┌─────────────────────┴─────────────────────────────────┐ │
│  │                    API Routes                          │ │
│  │   /runs  /runs/{id}/data  /runs/{id}/playback         │ │
│  └─────────────────────┬─────────────────────────────────┘ │
│  ┌─────────────────────┴─────────────────────────────────┐ │
│  │                  RunRepository                         │ │
│  │   (In-memory cache, CSV folder scanning)               │ │
│  └─────────────────────┬─────────────────────────────────┘ │
│  ┌─────────────────────┴─────────────────────────────────┐ │
│  │               TrackAddictParser                        │ │
│  │   (CSV parsing, GPS→ENU conversion)                    │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Backend

```bash
cd backend

# If you have the dependencies (FastAPI not required - uses Flask):
python run_server.py ./data/runs --port 8000

# Or run tests first:
python run_tests.py
```

The backend includes sample data in `data/runs/` with figure-8 and slalom test runs.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Opens at `http://localhost:3000`, proxies API to backend at port 8000.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/runs` | List all available runs |
| GET | `/runs/{id}` | Get run metadata |
| GET | `/runs/{id}/data` | Get full telemetry data |
| GET | `/runs/{id}/playback` | Get downsampled playback data |
| POST | `/runs/{id}/reload` | Reload with manual origin override |
| GET | `/folder` | Get current data folder info |
| POST | `/folder` | Set data folder path |

## Data Format

Supports TrackAddict/RaceRender CSV format:

```csv
# RaceRender Data
Time,Latitude,Longitude,Altitude,MPH,Heading,X,Y,GPS_Update,Accuracy
0.000,32.9857000,-89.7898000,10.0,0.0,0.0,0.000,0.000,1,3.0
...
```

**Required columns**: `Time`
**GPS columns**: `Latitude`, `Longitude`, `Altitude`
**Speed columns**: `MPH` or `KPH` or `Speed (m/s)`
**Acceleration**: `X` (longitudinal G), `Y` (lateral G)

## Future Roadmap

- [ ] Track editor (grid-based cone/gate placement)
- [ ] WebGL renderer for dense data
- [ ] Multi-run comparison analysis
- [ ] Tauri/Electron desktop wrapper
- [ ] CAN bus data integration
- [ ] Video sync

## Tech Stack

**Backend**: Python 3.11+, Flask, NumPy, Pandas
**Frontend**: React 18, TypeScript, Vite, Canvas 2D

## License

MIT

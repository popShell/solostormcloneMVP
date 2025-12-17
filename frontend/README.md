# Autocross Telemetry - Frontend

React + TypeScript frontend for autocross telemetry visualization.

## Features

- **Run visualization**: Canvas-based track rendering with color-coded paths
- **Playback controls**: Play/pause, scrub timeline, speed control (0.25x - 4x)
- **Multi-run support**: Load and compare multiple runs with visibility toggles
- **Color modes**: Speed heatmap, lateral G, longitudinal G, total G, or solid color
- **Pan & zoom**: Mouse drag to pan, scroll wheel to zoom
- **Acceleration vectors**: Optional visualization of G-force direction

## Setup

```bash
# Install dependencies
npm install

# Start development server (connects to backend on port 8000)
npm run dev

# Build for production
npm run build
```

## Development

The development server runs on `http://localhost:3000` and proxies API requests to `http://localhost:8000`.

### Project Structure

```
src/
├── components/
│   ├── TrackCanvas.tsx       # Main canvas renderer
│   ├── PlaybackControls.tsx  # Play/pause/scrub controls
│   ├── RunList.tsx           # Run selection sidebar
│   └── VisualizationPanel.tsx # Settings panel
├── hooks/
│   └── index.ts              # Custom hooks for data & playback
├── services/
│   └── api.ts                # Backend API client
├── types/
│   └── index.ts              # TypeScript interfaces
├── utils/
│   └── colors.ts             # Color interpolation utilities
├── App.tsx                   # Main app component
├── main.tsx                  # Entry point
└── index.css                 # Global styles
```

### Running with Backend

1. Start the backend server:
   ```bash
   cd ../backend
   python run_server.py ./data/runs --port 8000
   ```

2. Start the frontend:
   ```bash
   npm run dev
   ```

3. Open `http://localhost:3000` in your browser

## Usage

1. **Load runs**: Click the checkbox next to a run in the left sidebar to load and display it
2. **Playback**: Use the bottom controls to play/pause, scrub the timeline, or change speed
3. **Zoom**: Use mouse wheel to zoom in/out (zooms toward cursor position)
4. **Pan**: Click and drag on the canvas to pan the view
5. **Color mode**: Select different visualization modes in the right sidebar
6. **Fit to view**: Click "Fit to Runs" to auto-zoom to show all selected runs

## Keyboard Shortcuts (planned)

- `Space` - Play/pause
- `Left/Right` - Step backward/forward
- `F` - Fit to runs
- `R` - Reset view

## Tech Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool & dev server
- **Canvas 2D** - Rendering (WebGL planned for dense data)

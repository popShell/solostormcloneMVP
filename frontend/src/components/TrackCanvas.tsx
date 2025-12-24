/**
 * TrackCanvas - Main canvas-based telemetry visualization component.
 * This is a stub component - the full implementation should come from GitHub.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type {
  ViewportState,
  VisualizationSettings,
  PlaybackSample,
  RunData,
  MapOverlaySettings,
  MarkerMode,
  TrackMarker,
  SectorMarker,
} from '@/types';
import { RUN_COLORS } from '@/types';

interface RunDisplay {
  id: string;
  data: RunData;
  playback?: any;
  sample?: PlaybackSample;
}

interface TrackCanvasProps {
  runs: RunDisplay[];
  viewport: ViewportState;
  onViewportChange: (viewport: ViewportState) => void;
  settings: VisualizationSettings;
  currentTime?: number;
  mapOverlay?: MapOverlaySettings;
  masterRun?: RunData;
  markerMode?: MarkerMode;
  onWorldClick?: (point: { x: number; y: number }) => void;
  startLine?: TrackMarker | null;
  finishLine?: TrackMarker | null;
  sectors?: SectorMarker[];
  runColors?: string[];
}

interface Point {
  x: number;
  y: number;
}

const CANVAS_THEME = {
  bg: '#111318',
  grid: '#222834',
  gridMajor: '#2f3747',
  text: '#e5e7eb',
  border: '#2b3242',
};

interface MapImage {
  img: HTMLImageElement;
  tileX: number;
  tileY: number;
  centerPx: { x: number; y: number };
  metersPerPixel: number;
}

export const TrackCanvas: React.FC<TrackCanvasProps> = ({
  runs,
  viewport,
  onViewportChange,
  settings,
  mapOverlay,
  masterRun,
  markerMode = 'none',
  onWorldClick,
  startLine,
  finishLine,
  sectors = [],
  runColors,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [mapImages, setMapImages] = useState<MapImage[]>([]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // World to screen conversion
  const worldToScreen = useCallback(
    (worldX: number, worldY: number): Point => {
      const screenX = (worldX - viewport.centerX) * viewport.scale + size.width / 2;
      const screenY = size.height / 2 - (worldY - viewport.centerY) * viewport.scale;
      return { x: screenX, y: screenY };
    },
    [viewport, size]
  );

  const screenToWorld = useCallback(
    (screenX: number, screenY: number): Point => {
      const worldX = (screenX - size.width / 2) / viewport.scale + viewport.centerX;
      const worldY = -(screenY - size.height / 2) / viewport.scale + viewport.centerY;
      return { x: worldX, y: worldY };
    },
    [viewport, size]
  );

  // Load map tiles around master run (3x3)
  useEffect(() => {
    if (!mapOverlay?.enabled || !masterRun) {
      setMapImages([]);
      return;
    }

    const { lat, lon } = masterRun.metadata.origin;
    const zoom = mapOverlay.zoom ?? 17;
    const n = Math.pow(2, zoom);
    const latRad = (lat * Math.PI) / 180;
    const xtile = ((lon + 180) / 360) * n;
    const ytile =
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;

    const centerTileX = Math.floor(xtile);
    const centerTileY = Math.floor(ytile);

    const earthRadius = 6378137;
    const metersPerPixel =
      (Math.cos(latRad) * 2 * Math.PI * earthRadius) / (256 * n);

    const provider = (mapOverlay as any).provider || 'osm';

    const toLoad: MapImage[] = [];
    const centerPx = { x: xtile * 256, y: ytile * 256 };

    const loaders: Promise<void>[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const tileX = centerTileX + dx;
        const tileY = centerTileY + dy;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        const src =
          provider === 'sat'
            ? `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${tileY}/${tileX}`
            : `https://tile.openstreetmap.org/${zoom}/${tileX}/${tileY}.png`;
        const p = new Promise<void>((resolve) => {
          img.onload = () => {
            toLoad.push({
              img,
              tileX,
              tileY,
              centerPx,
              metersPerPixel,
            });
            resolve();
          };
          img.onerror = () => resolve();
        });
        img.src = src;
        loaders.push(p);
      }
    }

    Promise.all(loaders).then(() => setMapImages(toLoad));
  }, [mapOverlay?.enabled, mapOverlay?.zoom, mapOverlay?.provider, masterRun?.metadata.origin]);

  // Render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear
    ctx.fillStyle = CANVAS_THEME.bg;
    ctx.fillRect(0, 0, size.width, size.height);

    // Map overlay (draw first)
    if (mapOverlay?.enabled && masterRun && mapImages.length > 0) {
      ctx.globalAlpha = 0.9;
      mapImages.forEach(({ img, tileX, tileY, centerPx, metersPerPixel }) => {
        const tileOriginPxX = tileX * 256;
        const tileOriginPxY = tileY * 256;
        const dxPx = tileOriginPxX - centerPx.x;
        const dyPx = tileOriginPxY - centerPx.y;
        const worldLeft = dxPx * metersPerPixel;
        const worldTop = -dyPx * metersPerPixel;
        const worldWidth = 256 * metersPerPixel;
        const worldHeight = 256 * metersPerPixel;

        const topLeft = worldToScreen(worldLeft, worldTop);
        const bottomRight = worldToScreen(
          worldLeft + worldWidth,
          worldTop - worldHeight
        );
        const drawW = bottomRight.x - topLeft.x;
        const drawH = bottomRight.y - topLeft.y;

        ctx.drawImage(img, topLeft.x, topLeft.y, drawW, drawH);
      });
      ctx.globalAlpha = 1.0;
    }

    // Draw grid
    const gridAlpha = mapOverlay?.provider === 'sat' ? 0.7 : 1.0;
    const gridSizeMinorPx = 1 * viewport.scale;
    const showMinor = gridSizeMinorPx >= 14;

    // Minor grid (1m)
    if (showMinor) {
      ctx.strokeStyle = `rgba(34, 40, 52, ${gridAlpha})`;
      ctx.lineWidth = 1;
      const gridSize = 1 * viewport.scale;
      const offsetX = (size.width / 2 - viewport.centerX * viewport.scale) % gridSize;
      const offsetY = (size.height / 2 + viewport.centerY * viewport.scale) % gridSize;

      for (let x = offsetX; x < size.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, size.height);
        ctx.stroke();
      }
      for (let y = offsetY; y < size.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(size.width, y);
        ctx.stroke();
      }
    }

    // Major grid (10m)
    ctx.strokeStyle = `rgba(47, 55, 71, ${gridAlpha})`;
    ctx.lineWidth = 1.5;
    const gridSize = 10 * viewport.scale;
    const offsetX = (size.width / 2 - viewport.centerX * viewport.scale) % gridSize;
    const offsetY = (size.height / 2 + viewport.centerY * viewport.scale) % gridSize;
    
    for (let x = offsetX; x < size.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size.height);
      ctx.stroke();
    }
    for (let y = offsetY; y < size.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size.width, y);
      ctx.stroke();
    }

    // Draw runs
    runs.forEach((run, idx) => {
      if (!run.data) return;
      
      const { x, y } = run.data;
      if (!x || !y || x.length < 2) return;

      const palette = runColors && runColors.length > 0 ? runColors : RUN_COLORS;
      ctx.strokeStyle = palette[idx % palette.length];
      ctx.lineWidth = settings.pathWidth || 3;
      ctx.beginPath();

      let started = false;
      for (let i = 0; i < x.length; i++) {
        if (x[i] === null || y[i] === null) continue;
        const p = worldToScreen(x[i]!, y[i]!);
        if (!started) {
          ctx.moveTo(p.x, p.y);
          started = true;
        } else {
          ctx.lineTo(p.x, p.y);
        }
      }
      ctx.stroke();

      // Draw current position marker
      if (run.sample && run.sample.x !== undefined && run.sample.y !== undefined) {
        const pos = worldToScreen(run.sample.x, run.sample.y);
        const palette = runColors && runColors.length > 0 ? runColors : RUN_COLORS;
        ctx.fillStyle = palette[idx % palette.length];
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = CANVAS_THEME.text;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });

    // Draw start/finish lines and sectors
    const drawGate = (pt: TrackMarker | null | undefined, color: string, label: string) => {
      if (!pt) return;
      const gateLengthM = 6.096; // 20 ft
      const angle = ((pt.angleDeg ?? 0) * Math.PI) / 180;
      const dx = Math.cos(angle) * (gateLengthM / 2);
      const dy = Math.sin(angle) * (gateLengthM / 2);
      const p1 = worldToScreen(pt.x - dx, pt.y - dy);
      const p2 = worldToScreen(pt.x + dx, pt.y + dy);

      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.font = '13px sans-serif';
      const center = worldToScreen(pt.x, pt.y);
      ctx.fillText(label, center.x + 10, center.y - 10);
    };

    drawGate(startLine, '#34c759', 'Start');
    drawGate(finishLine, '#ff3b30', 'Finish');

    sectors.forEach((s) => {
      const p = worldToScreen(s.x, s.y);
      const r = 7;
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = '12px sans-serif';
      ctx.fillText(s.label || `S${s.id}`, p.x + 8, p.y - 8);
    });

    // Scale bar
    const scaleMeters = 10;
    const scalePixels = scaleMeters * viewport.scale;
    ctx.strokeStyle = CANVAS_THEME.text;
    ctx.fillStyle = CANVAS_THEME.text;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(20, size.height - 30);
    ctx.lineTo(20 + scalePixels, size.height - 30);
    ctx.stroke();
    ctx.font = '12px monospace';
    ctx.fillText(`${scaleMeters}m`, 20 + scalePixels / 2 - 10, size.height - 40);
  }, [
    runs,
    viewport,
    settings,
    size,
    worldToScreen,
    mapOverlay,
    masterRun,
    startLine,
    finishLine,
    sectors,
    runColors,
  ]);

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !dragStart) return;
    const dx = (e.clientX - dragStart.x) / viewport.scale;
    const dy = -(e.clientY - dragStart.y) / viewport.scale;
    onViewportChange({
      ...viewport,
      centerX: viewport.centerX - dx,
      centerY: viewport.centerY - dy,
    });
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    const start = dragStart;
    setIsDragging(false);
    setDragStart(null);

    if (!onWorldClick || !start || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;
    const startX = start.x - rect.left;
    const startY = start.y - rect.top;

    const dist = Math.hypot(canvasX - startX, canvasY - startY);
    const clickTol = 4; // px
    if (dist < clickTol) {
      const world = screenToWorld(canvasX, canvasY);
      onWorldClick(world);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.5, Math.min(100, viewport.scale * factor));
    onViewportChange({ ...viewport, scale: newScale });
  };

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        width={size.width}
        height={size.height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{
          cursor:
            isDragging ? 'grabbing' : markerMode === 'none' ? 'grab' : 'crosshair',
          display: 'block',
        }}
      />
    </div>
  );
};

export default TrackCanvas;

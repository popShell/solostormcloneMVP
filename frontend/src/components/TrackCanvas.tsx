/**
 * TrackCanvas - Main canvas-based telemetry visualization component.
 * This is a stub component - the full implementation should come from GitHub.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { ViewportState, VisualizationSettings, PlaybackSample, RunData } from '@/types';
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

export const TrackCanvas: React.FC<TrackCanvasProps> = ({
  runs,
  viewport,
  onViewportChange,
  settings,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Point | null>(null);

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

  // Render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear
    ctx.fillStyle = CANVAS_THEME.bg;
    ctx.fillRect(0, 0, size.width, size.height);

    // Draw grid
    const gridSizeMinorPx = 1 * viewport.scale;
    const showMinor = gridSizeMinorPx >= 14;

    // Minor grid (1m)
    if (showMinor) {
      ctx.strokeStyle = CANVAS_THEME.grid;
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
    ctx.strokeStyle = CANVAS_THEME.gridMajor;
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

      ctx.strokeStyle = RUN_COLORS[idx % RUN_COLORS.length];
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
        ctx.fillStyle = RUN_COLORS[idx % RUN_COLORS.length];
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = CANVAS_THEME.text;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
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
  }, [runs, viewport, settings, size, worldToScreen]);

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

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragStart(null);
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
        style={{ cursor: isDragging ? 'grabbing' : 'grab', display: 'block' }}
      />
    </div>
  );
};

export default TrackCanvas;

/**
 * TrackCanvas - Main canvas-based telemetry visualization component.
 * 
 * Renders run paths, vehicle markers, and acceleration data on a 2D canvas.
 * Supports pan, zoom, and multi-run display.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type {
  RunData,
  PlaybackSample,
  ViewportState,
  VisualizationSettings,
  ColorMode,
  DEFAULT_COLOR_SCALES,
} from '@/types';
import { getValueColor, getColorModeValue } from '@/utils/colors';

interface TrackCanvasProps {
  runs: Array<{
    id: string;
    data: RunData;
    color: string;
    visible: boolean;
  }>;
  currentSamples: Map<string, PlaybackSample>; // runId -> current sample
  viewport: ViewportState;
  settings: VisualizationSettings;
  colorScales: Record<ColorMode, { min: number; max: number; colors: string[] }>;
  onViewportChange: (viewport: ViewportState) => void;
  width?: number;
  height?: number;
}

interface Point {
  x: number;
  y: number;
}

export const TrackCanvas: React.FC<TrackCanvasProps> = ({
  runs,
  currentSamples,
  viewport,
  settings,
  colorScales,
  onViewportChange,
  width = 800,
  height = 600,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [dragViewport, setDragViewport] = useState<ViewportState | null>(null);

  // ========================================================================
  // Coordinate Transformations
  // ========================================================================

  const worldToScreen = useCallback(
    (worldX: number, worldY: number): Point => {
      // Apply rotation
      const cos = Math.cos((viewport.rotation * Math.PI) / 180);
      const sin = Math.sin((viewport.rotation * Math.PI) / 180);
      const rx = worldX * cos - worldY * sin;
      const ry = worldX * sin + worldY * cos;

      // Apply scale and offset
      const screenX = (rx - viewport.centerX) * viewport.scale + width / 2;
      const screenY = height / 2 - (ry - viewport.centerY) * viewport.scale; // Flip Y

      return { x: screenX, y: screenY };
    },
    [viewport, width, height]
  );

  const screenToWorld = useCallback(
    (screenX: number, screenY: number): Point => {
      // Reverse the transformation
      const rx = (screenX - width / 2) / viewport.scale + viewport.centerX;
      const ry = (height / 2 - screenY) / viewport.scale + viewport.centerY;

      // Reverse rotation
      const cos = Math.cos((-viewport.rotation * Math.PI) / 180);
      const sin = Math.sin((-viewport.rotation * Math.PI) / 180);
      const worldX = rx * cos - ry * sin;
      const worldY = rx * sin + ry * cos;

      return { x: worldX, y: worldY };
    },
    [viewport, width, height]
  );

  // ========================================================================
  // Rendering
  // ========================================================================

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    drawGrid(ctx);

    // Draw each visible run
    for (const run of runs) {
      if (!run.visible || !run.data) continue;

      // Draw path
      if (settings.showPath) {
        drawRunPath(ctx, run.data, run.color);
      }

      // Draw current position marker
      const currentSample = currentSamples.get(run.id);
      if (currentSample) {
        drawVehicleMarker(ctx, currentSample, run.color);

        // Draw acceleration vector
        if (settings.showAccelVectors) {
          drawAccelVector(ctx, currentSample);
        }
      }
    }

    // Draw scale bar
    drawScaleBar(ctx);
  }, [runs, currentSamples, viewport, settings, colorScales, width, height, worldToScreen]);

  const drawGrid = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      ctx.strokeStyle = '#2a2a4a';
      ctx.lineWidth = 1;

      // Calculate grid spacing based on zoom level
      let gridSpacing = 10; // meters
      if (viewport.scale < 2) gridSpacing = 50;
      else if (viewport.scale < 5) gridSpacing = 20;
      else if (viewport.scale > 20) gridSpacing = 5;
      else if (viewport.scale > 50) gridSpacing = 1;

      // Get visible world bounds
      const topLeft = screenToWorld(0, 0);
      const bottomRight = screenToWorld(width, height);

      const minX = Math.floor(Math.min(topLeft.x, bottomRight.x) / gridSpacing) * gridSpacing;
      const maxX = Math.ceil(Math.max(topLeft.x, bottomRight.x) / gridSpacing) * gridSpacing;
      const minY = Math.floor(Math.min(topLeft.y, bottomRight.y) / gridSpacing) * gridSpacing;
      const maxY = Math.ceil(Math.max(topLeft.y, bottomRight.y) / gridSpacing) * gridSpacing;

      ctx.beginPath();
      
      // Vertical lines
      for (let x = minX; x <= maxX; x += gridSpacing) {
        const start = worldToScreen(x, minY);
        const end = worldToScreen(x, maxY);
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
      }

      // Horizontal lines
      for (let y = minY; y <= maxY; y += gridSpacing) {
        const start = worldToScreen(minX, y);
        const end = worldToScreen(maxX, y);
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
      }

      ctx.stroke();

      // Draw origin marker
      ctx.strokeStyle = '#4a4a6a';
      ctx.lineWidth = 2;
      const origin = worldToScreen(0, 0);
      ctx.beginPath();
      ctx.moveTo(origin.x - 10, origin.y);
      ctx.lineTo(origin.x + 10, origin.y);
      ctx.moveTo(origin.x, origin.y - 10);
      ctx.lineTo(origin.x, origin.y + 10);
      ctx.stroke();
    },
    [viewport, width, height, worldToScreen, screenToWorld]
  );

  const drawRunPath = useCallback(
    (ctx: CanvasRenderingContext2D, data: RunData, defaultColor: string) => {
      const { x, y, speed, ax, ay, total_g, validity } = data;
      const validX = validity?.x;
      const validY = validity?.y;
      const validSpeed = validity?.speed;
      const validAx = validity?.ax;
      const validAy = validity?.ay;
      const validTotal = validity?.total_g;

      if (x.length < 2) return;

      ctx.lineWidth = settings.pathWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Draw path segments with color based on mode
      for (let i = 1; i < x.length; i++) {
        const x1 = x[i - 1];
        const y1 = y[i - 1];
        const x2 = x[i];
        const y2 = y[i];

        const x1Valid = validX ? validX[i - 1] : x1 !== null;
        const y1Valid = validY ? validY[i - 1] : y1 !== null;
        const x2Valid = validX ? validX[i] : x2 !== null;
        const y2Valid = validY ? validY[i] : y2 !== null;

        if (!x1Valid || !y1Valid || !x2Valid || !y2Valid) continue;

        const p1 = worldToScreen(x1, y1);
        const p2 = worldToScreen(x2, y2);

        // Get color based on mode
        let color: string;
        if (settings.colorMode === 'solid') {
          color = defaultColor;
        } else {
          const sample = {
            speed: validSpeed ? (validSpeed[i] ? speed[i] : null) : speed[i],
            ax: validAx ? (validAx[i] ? ax[i] : null) : ax[i],
            ay: validAy ? (validAy[i] ? ay[i] : null) : ay[i],
            total_g: validTotal ? (validTotal[i] ? total_g[i] : null) : total_g[i],
          };
          const value = getColorModeValue(settings.colorMode, sample);
          color = value === null ? defaultColor : getValueColor(value, settings.colorMode, colorScales);
        }

        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    },
    [settings, colorScales, worldToScreen]
  );

  const drawVehicleMarker = useCallback(
    (ctx: CanvasRenderingContext2D, sample: PlaybackSample, color: string) => {
      const valid = sample.valid ?? {
        x: true,
        y: true,
        speed: true,
        heading: true,
        ax: true,
        ay: true,
      };
      if (!valid.x || !valid.y) {
        return;
      }
      const pos = worldToScreen(sample.x, sample.y);
      const size = settings.carSize;

      // Draw directional triangle
      ctx.save();
      ctx.translate(pos.x, pos.y);
      const heading = valid.heading ? sample.heading : 0;
      ctx.rotate((-heading * Math.PI) / 180 + Math.PI / 2); // Adjust for canvas coords

      ctx.fillStyle = color;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.lineTo(-size * 0.7, size * 0.7);
      ctx.lineTo(size * 0.7, size * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.restore();

      // Draw speed label
      const speedMph = (valid.speed ? sample.speed : 0) * 2.237; // m/s to mph
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${speedMph.toFixed(0)} mph`, pos.x, pos.y + size + 15);
    },
    [settings, worldToScreen]
  );

  const drawAccelVector = useCallback(
    (ctx: CanvasRenderingContext2D, sample: PlaybackSample) => {
      const valid = sample.valid ?? {
        x: true,
        y: true,
        speed: true,
        heading: true,
        ax: true,
        ay: true,
      };
      if (!valid.x || !valid.y || !valid.ax || !valid.ay || !valid.heading) {
        return;
      }
      const pos = worldToScreen(sample.x, sample.y);
      const scale = settings.accelVectorScale * viewport.scale;

      // Convert body-frame acceleration to screen coordinates
      // ax = longitudinal (forward/back), ay = lateral (left/right)
      const headingRad = (sample.heading * Math.PI) / 180;

      // Transform to world frame
      const worldAx = sample.ax * Math.sin(headingRad) + sample.ay * Math.cos(headingRad);
      const worldAy = sample.ax * Math.cos(headingRad) - sample.ay * Math.sin(headingRad);

      const endX = pos.x + worldAx * scale;
      const endY = pos.y - worldAy * scale; // Flip Y

      // Draw vector
      ctx.strokeStyle = '#ff6b6b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      // Draw arrowhead
      const angle = Math.atan2(endY - pos.y, endX - pos.x);
      const arrowSize = 8;
      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.lineTo(
        endX - arrowSize * Math.cos(angle - Math.PI / 6),
        endY - arrowSize * Math.sin(angle - Math.PI / 6)
      );
      ctx.moveTo(endX, endY);
      ctx.lineTo(
        endX - arrowSize * Math.cos(angle + Math.PI / 6),
        endY - arrowSize * Math.sin(angle + Math.PI / 6)
      );
      ctx.stroke();
    },
    [settings, viewport, worldToScreen]
  );

  const drawScaleBar = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      // Calculate a nice round scale bar length
      const targetPixels = 100;
      const targetMeters = targetPixels / viewport.scale;
      
      // Round to nice values
      const niceValues = [1, 2, 5, 10, 20, 50, 100, 200, 500];
      let scaleMeters = niceValues[0];
      for (const v of niceValues) {
        if (v <= targetMeters * 1.5) {
          scaleMeters = v;
        }
      }
      
      const scalePixels = scaleMeters * viewport.scale;
      const x = 20;
      const y = height - 30;

      ctx.strokeStyle = '#ffffff';
      ctx.fillStyle = '#ffffff';
      ctx.lineWidth = 2;

      // Draw bar
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + scalePixels, y);
      ctx.moveTo(x, y - 5);
      ctx.lineTo(x, y + 5);
      ctx.moveTo(x + scalePixels, y - 5);
      ctx.lineTo(x + scalePixels, y + 5);
      ctx.stroke();

      // Draw label
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${scaleMeters}m`, x + scalePixels / 2, y - 10);
    },
    [viewport, height]
  );

  // ========================================================================
  // Mouse Interaction
  // ========================================================================

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      setDragViewport({ ...viewport });
    },
    [viewport]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDragging || !dragStart || !dragViewport) return;

      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;

      // Convert screen delta to world delta
      const worldDx = dx / viewport.scale;
      const worldDy = -dy / viewport.scale; // Flip Y

      onViewportChange({
        ...dragViewport,
        centerX: dragViewport.centerX - worldDx,
        centerY: dragViewport.centerY - worldDy,
      });
    },
    [isDragging, dragStart, dragViewport, viewport, onViewportChange]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragStart(null);
    setDragViewport(null);
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();

      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.5, Math.min(100, viewport.scale * zoomFactor));

      // Zoom toward mouse position
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const worldPos = screenToWorld(mouseX, mouseY);

      // Adjust center to keep mouse position fixed
      const newCenterX = worldPos.x - (mouseX - width / 2) / newScale;
      const newCenterY = worldPos.y + (mouseY - height / 2) / newScale;

      onViewportChange({
        ...viewport,
        scale: newScale,
        centerX: newCenterX,
        centerY: newCenterY,
      });
    },
    [viewport, width, height, screenToWorld, onViewportChange]
  );

  // ========================================================================
  // Effects
  // ========================================================================

  useEffect(() => {
    render();
  }, [render]);

  // ========================================================================
  // Render
  // ========================================================================

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      style={{
        cursor: isDragging ? 'grabbing' : 'grab',
        display: 'block',
      }}
    />
  );
};

export default TrackCanvas;

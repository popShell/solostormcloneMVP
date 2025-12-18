/**
 * CourseEditor - Canvas-based autocross course design tool.
 * 
 * Features:
 * - Place and edit course elements (cones, gates, slaloms, etc.)
 * - Define sector boundaries with GPS geofencing
 * - Pan, zoom, and rotate view
 * - Grid snapping
 * - Undo/redo support
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type {
  CourseDefinition,
  CourseElement,
  CourseSector,
  EditorTool,
  EditorViewport,
  Point,
  ElementId,
  ConeElement,
  PointerElement,
  GateElement,
} from '@/types/course';

// ============================================================================
// Types
// ============================================================================

interface CourseEditorProps {
  course: CourseDefinition;
  addElement: (element: CourseElement) => void;
  updateElements: (updates: Array<{ id: string; updates: Partial<CourseElement> }>, actionLabel?: string) => void;
  removeElements: (ids: string[]) => void;
  addSector: (sector: CourseSector) => void;
  width?: number;
  height?: number;
}

type Interaction =
  | { kind: 'none' }
  | { kind: 'pan'; startCanvas: Point; startCenter: Point }
  | {
      kind: 'move';
      startWorld: Point;
      anchorId: ElementId;
      initialPositions: Map<ElementId, Point>;
    }
  | {
      kind: 'rotate';
      startAngleRad: number;
      anchorId: ElementId;
      anchorPos: Point;
      initialRotations: Map<ElementId, number>;
    }
  | { kind: 'marquee'; startWorld: Point; currentWorld: Point; additive: boolean }
  | { kind: 'measure'; startWorld: Point; currentWorld: Point };

// ============================================================================
// Constants
// ============================================================================

const CONE_COLORS: Record<string, string> = {
  orange: '#ff6b00',
  red: '#dc2626',
  yellow: '#eab308',
  blue: '#3b82f6',
  green: '#22c55e',
};

const CANVAS_THEME = {
  bg: '#111318',
  gridMinor: '#222834',
  gridMajor: '#2f3747',
  border: '#2b3242',
  accent: '#4fb3a6',
  text: '#e5e7eb',
  muted: '#9aa3b2',
  selection: '#e5e7eb',
};

const TOOL_CURSORS: Record<EditorTool, string> = {
  select: 'default',
  pan: 'grab',
  cone: 'crosshair',
  pointer: 'crosshair',
  gate: 'crosshair',
  slalom: 'crosshair',
  offset: 'crosshair',
  start: 'crosshair',
  finish: 'crosshair',
  worker: 'crosshair',
  timing: 'crosshair',
  marker: 'crosshair',
  boundary: 'crosshair',
  sector_polygon: 'crosshair',
  sector_gate: 'crosshair',
  measure: 'crosshair',
  erase: 'not-allowed',
};

// ============================================================================
// Helper Functions
// ============================================================================

/** Convert canvas coordinates to world coordinates */
function canvasToWorld(
  canvasX: number,
  canvasY: number,
  viewport: EditorViewport,
  canvasWidth: number,
  canvasHeight: number
): Point {
  const centerCanvasX = canvasWidth / 2;
  const centerCanvasY = canvasHeight / 2;
  
  return {
    x: viewport.centerX + (canvasX - centerCanvasX) / viewport.scale,
    y: viewport.centerY - (canvasY - centerCanvasY) / viewport.scale, // Y is inverted
  };
}

/** Convert world coordinates to canvas coordinates */
function worldToCanvas(
  worldX: number,
  worldY: number,
  viewport: EditorViewport,
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number } {
  const centerCanvasX = canvasWidth / 2;
  const centerCanvasY = canvasHeight / 2;
  
  return {
    x: centerCanvasX + (worldX - viewport.centerX) * viewport.scale,
    y: centerCanvasY - (worldY - viewport.centerY) * viewport.scale, // Y is inverted
  };
}

/** Snap point to grid */
function snapToGrid(point: Point, gridSize: number): Point {
  return {
    x: Math.round(point.x / gridSize) * gridSize,
    y: Math.round(point.y / gridSize) * gridSize,
  };
}

/** Generate unique ID */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/** Check if point is inside element bounds */
function isPointInElement(
  point: Point,
  element: CourseElement,
  scale: number,
  positionOverride?: Point
): boolean {
  const hitRadius = Math.max(14 / scale, 0.75); // Min 0.75m or ~14px
  const pos = positionOverride ?? element.position;
  const dx = point.x - pos.x;
  const dy = point.y - pos.y;
  return Math.sqrt(dx * dx + dy * dy) < hitRadius;
}

// ============================================================================
// Main Component
// ============================================================================

export const CourseEditor: React.FC<CourseEditorProps> = ({
  course,
  addElement,
  updateElements,
  removeElements,
  addSector,
  width,
  height,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  
  // State
  const [viewport, setViewport] = useState<EditorViewport>({
    centerX: 0,
    centerY: 0,
    scale: 10,
    rotation: 0,
    gridVisible: true,
    gridSize: 1,
    snapToGrid: true,
  });
  
  const [activeTool, setActiveTool] = useState<EditorTool>('select');
  const [selectedIds, setSelectedIds] = useState<Set<ElementId>>(new Set());
  const [interaction, setInteraction] = useState<Interaction>({ kind: 'none' });
  const [previewPositions, setPreviewPositions] = useState<Map<ElementId, Point> | null>(null);
  const [previewRotations, setPreviewRotations] = useState<Map<ElementId, number> | null>(null);
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>(() => ({
    width: width ?? 900,
    height: height ?? 600,
  }));
  
  // Tool options
  const [coneColor, setConeColor] = useState<'orange' | 'red' | 'yellow' | 'blue' | 'green'>('orange');
  const [gateWidth] = useState(3);
  
  // Drawing state for sectors
  const [drawingPolygon, setDrawingPolygon] = useState<Point[]>([]);
  const [mousePos, setMousePos] = useState<Point>({ x: 0, y: 0 });

  useEffect(() => {
    // Fixed-size canvas if width/height are provided.
    if (width && height) {
      setCanvasSize({ width, height });
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const toolbarH = toolbarRef.current?.getBoundingClientRect().height ?? 0;
        const nextW = Math.max(1, Math.floor(entry.contentRect.width));
        const nextH = Math.max(1, Math.floor(entry.contentRect.height - toolbarH));
        setCanvasSize({ width: nextW, height: nextH });
      }
    });

    ro.observe(container);
    return () => ro.disconnect();
  }, [width, height]);

  const getCanvasSize = useCallback(() => {
    return {
      w: canvasSize.width,
      h: canvasSize.height,
    };
  }, [canvasSize.height, canvasSize.width]);

  const getCanvasPointFromEvent = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  const getElementPosition = useCallback(
    (el: CourseElement): Point => {
      return previewPositions?.get(el.id) ?? el.position;
    },
    [previewPositions]
  );

  const getElementRotation = useCallback(
    (el: CourseElement): number => {
      return previewRotations?.get(el.id) ?? el.rotation;
    },
    [previewRotations]
  );
  
  // ============================================================================
  // Canvas Rendering
  // ============================================================================
  
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { w, h } = getCanvasSize();
    
    // Clear canvas
    ctx.fillStyle = CANVAS_THEME.bg;
    ctx.fillRect(0, 0, w, h);
    
    // Draw grid
    if (viewport.gridVisible) {
      drawGrid(ctx, viewport, w, h);
    }
    
    // Draw sectors first (behind elements)
    for (const sector of course.sectors) {
      drawSector(ctx, sector, viewport, w, h);
    }
    
    // Draw course elements
    for (const element of course.elements) {
      const isSelected = selectedIds.has(element.id);
      drawElement(ctx, element, viewport, w, h, isSelected, getElementPosition(element), getElementRotation(element));
    }
    
    // Draw polygon being created
    if (drawingPolygon.length > 0 && activeTool === 'sector_polygon') {
      drawDrawingPolygon(ctx, drawingPolygon, mousePos, viewport, w, h);
    }
    
    // Draw measurement if using measure tool
    if (interaction.kind === 'measure') {
      drawMeasurement(ctx, interaction.startWorld, interaction.currentWorld, viewport, w, h);
    }

    // Draw marquee selection rectangle
    if (interaction.kind === 'marquee') {
      drawMarquee(ctx, interaction.startWorld, interaction.currentWorld, viewport, w, h);
    }
    
  }, [
    viewport,
    course,
    selectedIds,
    drawingPolygon,
    mousePos,
    activeTool,
    interaction,
    getCanvasSize,
    getElementPosition,
    getElementRotation,
  ]);
  
  // Re-render on state changes
  useEffect(() => {
    render();
  }, [render]);
  
  // ============================================================================
  // Drawing Functions
  // ============================================================================
  
  function drawGrid(
    ctx: CanvasRenderingContext2D,
    vp: EditorViewport,
    w: number,
    h: number
  ) {
    const majorGridSize = 10; // meters (10x10 "big squares")
    const minorGridSize = vp.gridSize; // meters (placement/snap grid, default 1m)

    const minorPx = minorGridSize * vp.scale;
    const showMinor = minorPx >= 14; // only show 1m grid when zoomed in enough

    const startWorld = canvasToWorld(0, 0, vp, w, h);
    const endWorld = canvasToWorld(w, h, vp, w, h);

    const drawGridLines = (gridSizeM: number, style: { stroke: string; lineWidth: number; alpha: number }) => {
      ctx.save();
      ctx.strokeStyle = style.stroke;
      ctx.lineWidth = style.lineWidth;
      ctx.globalAlpha = style.alpha;

      // Vertical lines
      const startX = Math.floor(startWorld.x / gridSizeM) * gridSizeM;
      const endX = Math.ceil(endWorld.x / gridSizeM) * gridSizeM;
      for (let x = startX; x <= endX; x += gridSizeM) {
        const { x: canvasX } = worldToCanvas(x, 0, vp, w, h);
        ctx.beginPath();
        ctx.moveTo(canvasX, 0);
        ctx.lineTo(canvasX, h);
        ctx.stroke();
      }

      // Horizontal lines
      const startY = Math.floor(endWorld.y / gridSizeM) * gridSizeM;
      const endY = Math.ceil(startWorld.y / gridSizeM) * gridSizeM;
      for (let y = startY; y <= endY; y += gridSizeM) {
        const { y: canvasY } = worldToCanvas(0, y, vp, w, h);
        ctx.beginPath();
        ctx.moveTo(0, canvasY);
        ctx.lineTo(w, canvasY);
        ctx.stroke();
      }

      ctx.restore();
    };

    if (showMinor) {
      drawGridLines(minorGridSize, { stroke: CANVAS_THEME.gridMinor, lineWidth: 1, alpha: 0.7 });
    }

    drawGridLines(majorGridSize, { stroke: CANVAS_THEME.gridMajor, lineWidth: 1.5, alpha: 1 });
    
    // Draw origin crosshair
    const origin = worldToCanvas(0, 0, vp, w, h);
    ctx.strokeStyle = CANVAS_THEME.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(origin.x - 10, origin.y);
    ctx.lineTo(origin.x + 10, origin.y);
    ctx.moveTo(origin.x, origin.y - 10);
    ctx.lineTo(origin.x, origin.y + 10);
    ctx.stroke();
  }
  
  function drawElement(
    ctx: CanvasRenderingContext2D,
    element: CourseElement,
    vp: EditorViewport,
    w: number,
    h: number,
    isSelected: boolean,
    position: Point,
    rotationDeg: number
  ) {
    const pos = worldToCanvas(position.x, position.y, vp, w, h);
    
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate((-rotationDeg * Math.PI) / 180);
    
    switch (element.type) {
      case 'cone':
        drawCone(ctx, element as ConeElement, vp.scale, isSelected);
        break;
      case 'pointer':
        drawPointer(ctx, element as PointerElement, vp.scale, isSelected);
        break;
      case 'gate':
        drawGate(ctx, element as GateElement, vp.scale, isSelected);
        break;
      case 'start':
      case 'finish':
        drawStartFinish(ctx, element, vp.scale, isSelected);
        break;
      case 'worker_station':
        drawWorkerStation(ctx, vp.scale, isSelected);
        break;
      case 'slalom':
        drawSlalom(ctx, element, vp.scale, isSelected);
        break;
      default:
        drawMarker(ctx, vp.scale, isSelected);
    }
    
    ctx.restore();
    
    // Draw label if present
    if (element.label) {
      ctx.fillStyle = CANVAS_THEME.text;
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(element.label, pos.x, pos.y - 15);
    }
  }
  
  function drawCone(
    ctx: CanvasRenderingContext2D,
    element: ConeElement,
    scale: number,
    isSelected: boolean
  ) {
    const size = Math.max(0.3 * scale, 6);
    const color = CONE_COLORS[element.coneColor] || CONE_COLORS.orange;
    
    // Cone triangle
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(-size * 0.7, size * 0.5);
    ctx.lineTo(size * 0.7, size * 0.5);
    ctx.closePath();
    
    ctx.fillStyle = color;
    ctx.fill();
    
    if (isSelected) {
      ctx.strokeStyle = CANVAS_THEME.selection;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
  
  function drawPointer(
    ctx: CanvasRenderingContext2D,
    element: PointerElement,
    scale: number,
    isSelected: boolean
  ) {
    const size = Math.max(0.3 * scale, 6);
    const color = CONE_COLORS[element.coneColor] || CONE_COLORS.orange;

    // Pointer cone (single cone laying down). Rotation controls direction.
    // Tip points "up" in local coordinates; outer transform rotates element.
    ctx.fillStyle = color;
    ctx.strokeStyle = '#111318';
    ctx.lineWidth = Math.max(1, size * 0.12);

    const tip = { x: 0, y: -size * 1.05 };
    const baseLeft = { x: -size * 0.55, y: size * 0.35 };
    const baseRight = { x: size * 0.55, y: size * 0.35 };
    const baseInsetLeft = { x: -size * 0.25, y: size * 0.6 };
    const baseInsetRight = { x: size * 0.25, y: size * 0.6 };

    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(baseLeft.x, baseLeft.y);
    ctx.lineTo(baseInsetLeft.x, baseInsetLeft.y);
    ctx.lineTo(baseInsetRight.x, baseInsetRight.y);
    ctx.lineTo(baseRight.x, baseRight.y);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Small stripe to suggest it's a cone
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.moveTo(tip.x * 0.4, tip.y * 0.4);
    ctx.lineTo(baseLeft.x * 0.55, baseLeft.y * 0.55);
    ctx.lineTo(baseRight.x * 0.55, baseRight.y * 0.55);
    ctx.closePath();
    ctx.fill();
    
    if (isSelected) {
      ctx.strokeStyle = CANVAS_THEME.selection;
      ctx.lineWidth = 2;
      ctx.strokeRect(-size * 0.9, -size * 0.9, size * 1.8, size * 1.8);
    }
  }
  
  function drawGate(
    ctx: CanvasRenderingContext2D,
    element: GateElement,
    scale: number,
    isSelected: boolean
  ) {
    const halfWidth = (element.width / 2) * scale;
    const coneSize = Math.max(0.3 * scale, 6);
    const color = CONE_COLORS[element.coneColor] || CONE_COLORS.orange;
    
    // Left cone
    ctx.save();
    ctx.translate(-halfWidth, 0);
    ctx.beginPath();
    ctx.moveTo(0, -coneSize);
    ctx.lineTo(-coneSize * 0.7, coneSize * 0.5);
    ctx.lineTo(coneSize * 0.7, coneSize * 0.5);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
    
    // Right cone
    ctx.save();
    ctx.translate(halfWidth, 0);
    ctx.beginPath();
    ctx.moveTo(0, -coneSize);
    ctx.lineTo(-coneSize * 0.7, coneSize * 0.5);
    ctx.lineTo(coneSize * 0.7, coneSize * 0.5);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
    
    // Gate line (dashed)
    ctx.strokeStyle = isSelected ? CANVAS_THEME.selection : CANVAS_THEME.muted;
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(-halfWidth, 0);
    ctx.lineTo(halfWidth, 0);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Direction arrow
    ctx.strokeStyle = CANVAS_THEME.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, coneSize);
    ctx.lineTo(0, -coneSize);
    ctx.moveTo(-5, -coneSize + 8);
    ctx.lineTo(0, -coneSize);
    ctx.lineTo(5, -coneSize + 8);
    ctx.stroke();
  }
  
  function drawStartFinish(
    ctx: CanvasRenderingContext2D,
    element: CourseElement,
    scale: number,
    isSelected: boolean
  ) {
    const halfWidth = 2 * scale;
    const isStart = element.type === 'start';
    
    ctx.strokeStyle = isStart ? '#22c55e' : '#ef4444';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-halfWidth, 0);
    ctx.lineTo(halfWidth, 0);
    ctx.stroke();
    
    // Checkered pattern
    const squareSize = 5;
    for (let i = -4; i <= 4; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#000000';
      ctx.fillRect(i * squareSize - squareSize / 2, -3, squareSize, 6);
    }
    
    if (isSelected) {
      ctx.strokeStyle = CANVAS_THEME.selection;
      ctx.lineWidth = 2;
      ctx.strokeRect(-halfWidth, -5, halfWidth * 2, 10);
    }
  }
  
  function drawWorkerStation(
    ctx: CanvasRenderingContext2D,
    scale: number,
    isSelected: boolean
  ) {
    const size = Math.max(0.5 * scale, 10);
    
    // Worker icon (person shape)
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.arc(0, -size * 0.6, size * 0.3, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.beginPath();
    ctx.moveTo(-size * 0.4, 0);
    ctx.lineTo(0, -size * 0.3);
    ctx.lineTo(size * 0.4, 0);
    ctx.lineTo(size * 0.3, size * 0.6);
    ctx.lineTo(-size * 0.3, size * 0.6);
    ctx.closePath();
    ctx.fill();
    
    if (isSelected) {
      ctx.strokeStyle = CANVAS_THEME.selection;
      ctx.lineWidth = 2;
      ctx.strokeRect(-size, -size, size * 2, size * 2);
    }
  }
  
  function drawSlalom(
    ctx: CanvasRenderingContext2D,
    element: CourseElement,
    scale: number,
    isSelected: boolean
  ) {
    const slalom = element as any;
    const spacing = (slalom.spacing || 6) * scale;
    const coneCount = slalom.coneCount || 5;
    const color = CONE_COLORS[slalom.coneColor] || CONE_COLORS.orange;
    const coneSize = Math.max(0.3 * scale, 6);
    
    // Draw cones in a line
    for (let i = 0; i < coneCount; i++) {
      ctx.save();
      ctx.translate(0, i * spacing - (coneCount - 1) * spacing / 2);
      
      ctx.beginPath();
      ctx.moveTo(0, -coneSize);
      ctx.lineTo(-coneSize * 0.7, coneSize * 0.5);
      ctx.lineTo(coneSize * 0.7, coneSize * 0.5);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      
      ctx.restore();
    }
    
    // Draw weave line
    ctx.strokeStyle = CANVAS_THEME.accent;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    
    const entryLeft = slalom.entryDirection === 'left';
    for (let i = 0; i < coneCount; i++) {
      const y = i * spacing - (coneCount - 1) * spacing / 2;
      const x = ((i + (entryLeft ? 0 : 1)) % 2 === 0 ? -1 : 1) * spacing * 0.3;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);
    
    if (isSelected) {
      ctx.strokeStyle = CANVAS_THEME.selection;
      ctx.lineWidth = 2;
      const totalHeight = (coneCount - 1) * spacing;
      ctx.strokeRect(-spacing * 0.5, -totalHeight / 2 - coneSize, spacing, totalHeight + coneSize * 2);
    }
  }
  
  function drawMarker(
    ctx: CanvasRenderingContext2D,
    scale: number,
    isSelected: boolean
  ) {
    const size = Math.max(0.3 * scale, 6);
    
    ctx.fillStyle = '#8b5cf6';
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, Math.PI * 2);
    ctx.fill();
    
    if (isSelected) {
      ctx.strokeStyle = CANVAS_THEME.selection;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
  
  function drawSector(
    ctx: CanvasRenderingContext2D,
    sector: CourseSector,
    vp: EditorViewport,
    w: number,
    h: number
  ) {
    if (!sector.polygon || sector.polygon.vertices.length < 3) return;
    
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = sector.color;
    ctx.beginPath();
    
    const vertices = sector.polygon.vertices;
    const firstPos = worldToCanvas(vertices[0].x, vertices[0].y, vp, w, h);
    ctx.moveTo(firstPos.x, firstPos.y);
    
    for (let i = 1; i < vertices.length; i++) {
      const pos = worldToCanvas(vertices[i].x, vertices[i].y, vp, w, h);
      ctx.lineTo(pos.x, pos.y);
    }
    
    ctx.closePath();
    ctx.fill();
    
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = sector.color;
    ctx.lineWidth = 2;
    ctx.stroke();
    
    ctx.globalAlpha = 1;
    
    // Draw sector label
    const centerX = vertices.reduce((sum, v) => sum + v.x, 0) / vertices.length;
    const centerY = vertices.reduce((sum, v) => sum + v.y, 0) / vertices.length;
    const labelPos = worldToCanvas(centerX, centerY, vp, w, h);
    
    ctx.fillStyle = CANVAS_THEME.text;
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(sector.name, labelPos.x, labelPos.y);
  }
  
  function drawDrawingPolygon(
    ctx: CanvasRenderingContext2D,
    points: Point[],
    mouse: Point,
    vp: EditorViewport,
    w: number,
    h: number
  ) {
    if (points.length === 0) return;
    
    ctx.strokeStyle = CANVAS_THEME.accent;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    
    const firstPos = worldToCanvas(points[0].x, points[0].y, vp, w, h);
    ctx.moveTo(firstPos.x, firstPos.y);
    
    for (let i = 1; i < points.length; i++) {
      const pos = worldToCanvas(points[i].x, points[i].y, vp, w, h);
      ctx.lineTo(pos.x, pos.y);
    }
    
    // Line to current mouse position
    const mouseCanvasPos = worldToCanvas(mouse.x, mouse.y, vp, w, h);
    ctx.lineTo(mouseCanvasPos.x, mouseCanvasPos.y);
    
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Draw vertices
    for (const point of points) {
      const pos = worldToCanvas(point.x, point.y, vp, w, h);
      ctx.fillStyle = CANVAS_THEME.accent;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  
  function drawMeasurement(
    ctx: CanvasRenderingContext2D,
    startWorld: Point,
    endWorld: Point,
    vp: EditorViewport,
    w: number,
    h: number
  ) {
    const startCanvas = worldToCanvas(startWorld.x, startWorld.y, vp, w, h);
    const endCanvas = worldToCanvas(endWorld.x, endWorld.y, vp, w, h);
    
    // Draw line
    ctx.strokeStyle = '#d6b36b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(startCanvas.x, startCanvas.y);
    ctx.lineTo(endCanvas.x, endCanvas.y);
    ctx.stroke();
    
    // Calculate distance
    const dx = endWorld.x - startWorld.x;
    const dy = endWorld.y - startWorld.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Draw distance label
    const midX = (startCanvas.x + endCanvas.x) / 2;
    const midY = (startCanvas.y + endCanvas.y) / 2;
    
    ctx.fillStyle = CANVAS_THEME.bg;
    ctx.fillRect(midX - 30, midY - 10, 60, 20);
    ctx.fillStyle = '#d6b36b';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${distance.toFixed(1)}m`, midX, midY + 4);
  }

  function drawMarquee(
    ctx: CanvasRenderingContext2D,
    startWorld: Point,
    currentWorld: Point,
    vp: EditorViewport,
    w: number,
    h: number
  ) {
    const x0 = Math.min(startWorld.x, currentWorld.x);
    const x1 = Math.max(startWorld.x, currentWorld.x);
    const y0 = Math.min(startWorld.y, currentWorld.y);
    const y1 = Math.max(startWorld.y, currentWorld.y);

    const p0 = worldToCanvas(x0, y0, vp, w, h);
    const p1 = worldToCanvas(x1, y1, vp, w, h);

    const left = Math.min(p0.x, p1.x);
    const top = Math.min(p0.y, p1.y);
    const rectW = Math.abs(p1.x - p0.x);
    const rectH = Math.abs(p1.y - p0.y);

    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = CANVAS_THEME.accent;
    ctx.fillRect(left, top, rectW, rectH);
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = CANVAS_THEME.accent;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(left, top, rectW, rectH);
    ctx.setLineDash([]);
    ctx.restore();
  }
  
  // ============================================================================
  // Event Handlers
  // ============================================================================

  const findHitElement = useCallback(
    (worldPos: Point): CourseElement | null => {
      for (const element of [...course.elements].reverse()) {
        const pos = getElementPosition(element);
        if (isPointInElement(worldPos, element, viewport.scale, pos)) {
          return element;
        }
      }
      return null;
    },
    [course.elements, getElementPosition, viewport.scale]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      canvasRef.current?.focus();

      const canvasPos = getCanvasPointFromEvent(e);
      if (!canvasPos) return;
      const { w, h } = getCanvasSize();

      const worldPos = canvasToWorld(canvasPos.x, canvasPos.y, viewport, w, h);
      const snappedWorldPos = viewport.snapToGrid ? snapToGrid(worldPos, viewport.gridSize) : worldPos;
      setMousePos(snappedWorldPos);

      const isRotateGesture = e.button === 2; // right-click drag

      const isPanGesture = activeTool === 'pan' || e.button === 1 || (e.button === 0 && e.shiftKey);
      if (isPanGesture) {
        setInteraction({
          kind: 'pan',
          startCanvas: { x: canvasPos.x, y: canvasPos.y },
          startCenter: { x: viewport.centerX, y: viewport.centerY },
        });
        return;
      }

      if (activeTool === 'measure') {
        setInteraction({ kind: 'measure', startWorld: worldPos, currentWorld: worldPos });
        return;
      }

      if (activeTool === 'sector_polygon') {
        const pos = snappedWorldPos;

        // Double-click to close polygon
        if (drawingPolygon.length >= 3 && e.detail === 2) {
          const newSector: CourseSector = {
            id: generateId(),
            name: `Sector ${course.sectors.length + 1}`,
            color: ['#d16d6d', '#d6b36b', '#7bbf93', '#4fb3a6', '#b48ead', '#88a1b8'][course.sectors.length % 6],
            order: course.sectors.length + 1,
            polygon: { vertices: drawingPolygon },
            timingEnabled: true,
          };

          addSector(newSector);
          setDrawingPolygon([]);
        } else {
          setDrawingPolygon([...drawingPolygon, pos]);
        }
        return;
      }

      if (activeTool === 'erase') {
        const hit = findHitElement(worldPos);
        if (hit) {
          removeElements([hit.id]);
          setSelectedIds((prev) => {
            const next = new Set(prev);
            next.delete(hit.id);
            return next;
          });
        }
        return;
      }

      // Always allow selecting/moving existing elements (even when tool is "cone"/"gate"/etc.)
      const hit = findHitElement(worldPos);
      if (hit) {
        if (e.ctrlKey || e.metaKey) {
          setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(hit.id)) next.delete(hit.id);
            else next.add(hit.id);
            return next;
          });
          return;
        }

        const workingIds = selectedIds.has(hit.id) ? selectedIds : new Set<ElementId>([hit.id]);
        if (!selectedIds.has(hit.id)) {
          setSelectedIds(new Set([hit.id]));
        }

        const initialPositions = new Map<ElementId, Point>();
        const initialRotations = new Map<ElementId, number>();
        for (const id of workingIds) {
          const el = course.elements.find((e) => e.id === id);
          if (!el) continue;
          initialPositions.set(id, { ...getElementPosition(el) });
          initialRotations.set(id, getElementRotation(el));
        }

        // Alt+drag or Right-drag rotates (pointers and any other elements)
        if (e.altKey || isRotateGesture) {
          e.preventDefault();
          const anchorPos = initialPositions.get(hit.id) ?? getElementPosition(hit);
          const startAngleRad = Math.atan2(worldPos.y - anchorPos.y, worldPos.x - anchorPos.x);

          setPreviewRotations(new Map(initialRotations));
          setInteraction({
            kind: 'rotate',
            startAngleRad,
            anchorId: hit.id,
            anchorPos,
            initialRotations,
          });
          return;
        }

        setPreviewPositions(new Map(initialPositions));
        setInteraction({
          kind: 'move',
          startWorld: worldPos,
          anchorId: hit.id,
          initialPositions,
        });
        return;
      }

      // Box select (marquee) in select tool
      if (activeTool === 'select') {
        setInteraction({
          kind: 'marquee',
          startWorld: worldPos,
          currentWorld: worldPos,
          additive: e.ctrlKey || e.metaKey,
        });
        return;
      }

      // Place element tools
      const pos = snappedWorldPos;
      let newElement: CourseElement | null = null;

      switch (activeTool) {
        case 'cone':
          newElement = {
            id: generateId(),
            type: 'cone',
            position: pos,
            rotation: 0,
            coneColor,
          };
          break;
        case 'pointer':
          newElement = {
            id: generateId(),
            type: 'pointer',
            position: pos,
            rotation: 0,
            coneColor,
          };
          break;
        case 'gate':
          newElement = {
            id: generateId(),
            type: 'gate',
            position: pos,
            rotation: 0,
            width: gateWidth,
            gateType: 'standard',
            coneColor,
          };
          break;
        case 'slalom':
          newElement = {
            id: generateId(),
            type: 'slalom',
            position: pos,
            rotation: 0,
            coneCount: 5,
            spacing: 6,
            coneColor,
            entryDirection: 'left',
          } as any;
          break;
        case 'start':
          newElement = {
            id: generateId(),
            type: 'start',
            position: pos,
            rotation: 0,
            width: 4,
            hasTiming: true,
          };
          break;
        case 'finish':
          newElement = {
            id: generateId(),
            type: 'finish',
            position: pos,
            rotation: 0,
            width: 4,
            hasTiming: true,
          };
          break;
        case 'worker':
          newElement = {
            id: generateId(),
            type: 'worker_station',
            position: pos,
            rotation: 0,
            hasRadio: true,
            hasFlag: true,
          };
          break;
        case 'marker':
          newElement = {
            id: generateId(),
            type: 'marker',
            position: pos,
            rotation: 0,
            markerType: 'reference',
          };
          break;
      }

      if (newElement) {
        addElement(newElement);
        setSelectedIds(new Set([newElement.id]));
      }
    },
    [
      activeTool,
      addElement,
      addSector,
      coneColor,
      course.elements,
      course.sectors.length,
      drawingPolygon,
      findHitElement,
      gateWidth,
      getCanvasPointFromEvent,
      getCanvasSize,
      getElementPosition,
      getElementRotation,
      removeElements,
      selectedIds,
      viewport,
    ]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvasPos = getCanvasPointFromEvent(e);
      if (!canvasPos) return;
      const { w, h } = getCanvasSize();

      const worldPos = canvasToWorld(canvasPos.x, canvasPos.y, viewport, w, h);
      setMousePos(viewport.snapToGrid ? snapToGrid(worldPos, viewport.gridSize) : worldPos);

      if (interaction.kind === 'pan') {
        const dx = (canvasPos.x - interaction.startCanvas.x) / viewport.scale;
        const dy = -(canvasPos.y - interaction.startCanvas.y) / viewport.scale;
        setViewport({
          ...viewport,
          centerX: interaction.startCenter.x - dx,
          centerY: interaction.startCenter.y - dy,
        });
        return;
      }

      if (interaction.kind === 'measure') {
        setInteraction({ ...interaction, currentWorld: worldPos });
        return;
      }

      if (interaction.kind === 'marquee') {
        setInteraction({ ...interaction, currentWorld: worldPos });
        return;
      }

      if (interaction.kind === 'move') {
        const delta = { x: worldPos.x - interaction.startWorld.x, y: worldPos.y - interaction.startWorld.y };

        const anchorOriginal = interaction.initialPositions.get(interaction.anchorId);
        if (!anchorOriginal) return;

        let usedDelta = delta;
        if (viewport.snapToGrid) {
          const anchorNew = { x: anchorOriginal.x + delta.x, y: anchorOriginal.y + delta.y };
          const snappedAnchorNew = snapToGrid(anchorNew, viewport.gridSize);
          usedDelta = { x: snappedAnchorNew.x - anchorOriginal.x, y: snappedAnchorNew.y - anchorOriginal.y };
        }

        const next = new Map<ElementId, Point>();
        for (const [id, startPos] of interaction.initialPositions.entries()) {
          next.set(id, { x: startPos.x + usedDelta.x, y: startPos.y + usedDelta.y });
        }
        setPreviewPositions(next);
        return;
      }

      if (interaction.kind === 'rotate') {
        const currentAngle = Math.atan2(worldPos.y - interaction.anchorPos.y, worldPos.x - interaction.anchorPos.x);
        const deltaRad = currentAngle - interaction.startAngleRad;
        const deltaDeg = (deltaRad * 180) / Math.PI;

        const next = new Map<ElementId, number>();
        for (const [id, startRot] of interaction.initialRotations.entries()) {
          let r = startRot + deltaDeg;
          // normalize to [-180, 180) for easier mental model
          r = ((r + 180) % 360) - 180;
          next.set(id, r);
        }
        setPreviewRotations(next);
      }
    },
    [getCanvasPointFromEvent, getCanvasSize, interaction, viewport]
  );

  const handleMouseUp = useCallback(() => {
    if (interaction.kind === 'move') {
      if (previewPositions && previewPositions.size > 0) {
        const updates = Array.from(previewPositions.entries()).map(([id, pos]) => ({
          id,
          updates: { position: pos },
        }));
        updateElements(updates, previewPositions.size > 1 ? 'Move elements' : 'Move element');
      }
      setPreviewPositions(null);
      setInteraction({ kind: 'none' });
      return;
    }

    if (interaction.kind === 'rotate') {
      if (previewRotations && previewRotations.size > 0) {
        const updates = Array.from(previewRotations.entries()).map(([id, rot]) => ({
          id,
          updates: { rotation: rot },
        }));
        updateElements(updates, previewRotations.size > 1 ? 'Rotate elements' : 'Rotate element');
      }
      setPreviewRotations(null);
      setInteraction({ kind: 'none' });
      return;
    }

    if (interaction.kind === 'marquee') {
      const x0 = Math.min(interaction.startWorld.x, interaction.currentWorld.x);
      const x1 = Math.max(interaction.startWorld.x, interaction.currentWorld.x);
      const y0 = Math.min(interaction.startWorld.y, interaction.currentWorld.y);
      const y1 = Math.max(interaction.startWorld.y, interaction.currentWorld.y);

      const ids = course.elements
        .filter((el) => {
          const p = getElementPosition(el);
          return p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
        })
        .map((el) => el.id);

      setSelectedIds((prev) => {
        if (interaction.additive) {
          const next = new Set(prev);
          ids.forEach((id) => next.add(id));
          return next;
        }
        return new Set(ids);
      });

      setInteraction({ kind: 'none' });
      return;
    }

    if (interaction.kind === 'pan' || interaction.kind === 'measure') {
      setInteraction({ kind: 'none' });
      return;
    }
  }, [course.elements, getElementPosition, interaction, previewPositions, previewRotations, updateElements]);

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const canvasX = (e.clientX - rect.left) * scaleX;
      const canvasY = (e.clientY - rect.top) * scaleY;

      const { w, h } = getCanvasSize();
      const worldBefore = canvasToWorld(canvasX, canvasY, viewport, w, h);

      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(1, Math.min(100, viewport.scale * zoomFactor));

      const newViewport = { ...viewport, scale: newScale };
      const worldAfter = canvasToWorld(canvasX, canvasY, newViewport, w, h);

      setViewport({
        ...newViewport,
        centerX: viewport.centerX + (worldBefore.x - worldAfter.x),
        centerY: viewport.centerY + (worldBefore.y - worldAfter.y),
      });
    },
    [getCanvasSize, viewport]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIds.size > 0) {
          removeElements(Array.from(selectedIds));
          setSelectedIds(new Set());
        }
      } else if (e.key === 'Escape') {
        setSelectedIds(new Set());
        setPreviewPositions(null);
        setPreviewRotations(null);
        setDrawingPolygon([]);
        setInteraction({ kind: 'none' });
        setActiveTool('select');
      } else if (e.key === 'g') {
        setViewport({ ...viewport, gridVisible: !viewport.gridVisible });
      } else if (e.key === 's') {
        setViewport({ ...viewport, snapToGrid: !viewport.snapToGrid });
      }
    },
    [removeElements, selectedIds, viewport]
  );
  
  // ============================================================================
  // Render
  // ============================================================================
  
  return (
    <div ref={containerRef} style={styles.container}>
      {/* Toolbar */}
      <div ref={toolbarRef} style={styles.toolbar}>
        <div style={styles.toolGroup}>
          <ToolButton tool="select" active={activeTool} onClick={setActiveTool} label="Select" />
          <ToolButton tool="pan" active={activeTool} onClick={setActiveTool} label="Pan" />
          <ToolButton tool="measure" active={activeTool} onClick={setActiveTool} label="Measure" />
          <ToolButton tool="erase" active={activeTool} onClick={setActiveTool} label="Erase" />
        </div>
        
        <div style={styles.divider} />
        
        <div style={styles.toolGroup}>
          <ToolButton tool="cone" active={activeTool} onClick={setActiveTool} label="Cone" />
          <ToolButton tool="pointer" active={activeTool} onClick={setActiveTool} label="Pointer" />
          <ToolButton tool="gate" active={activeTool} onClick={setActiveTool} label="Gate" />
          <ToolButton tool="slalom" active={activeTool} onClick={setActiveTool} label="Slalom" />
        </div>
        
        <div style={styles.divider} />
        
        <div style={styles.toolGroup}>
          <ToolButton tool="start" active={activeTool} onClick={setActiveTool} label="Start" />
          <ToolButton tool="finish" active={activeTool} onClick={setActiveTool} label="Finish" />
          <ToolButton tool="worker" active={activeTool} onClick={setActiveTool} label="Worker" />
        </div>
        
        <div style={styles.divider} />
        
        <div style={styles.toolGroup}>
          <ToolButton tool="sector_polygon" active={activeTool} onClick={setActiveTool} label="Sector" />
        </div>
        
        <div style={styles.spacer} />
        
        {/* Cone color selector */}
        {(activeTool === 'cone' || activeTool === 'pointer' || activeTool === 'gate' || activeTool === 'slalom') && (
          <div style={styles.toolGroup}>
            <span style={styles.label}>Color:</span>
            {(['orange', 'red', 'yellow', 'blue', 'green'] as const).map(color => (
              <button
                key={color}
                onClick={() => setConeColor(color)}
                style={{
                  ...styles.colorButton,
                  backgroundColor: CONE_COLORS[color],
                  border: coneColor === color ? '2px solid white' : '2px solid transparent',
                }}
              />
            ))}
          </div>
        )}
        
        {/* Status */}
        <div style={styles.status}>
          <span>{mousePos.x.toFixed(1)}, {mousePos.y.toFixed(1)} m</span>
          <span style={{ marginLeft: 16 }}>Scale: {viewport.scale.toFixed(0)} px/m</span>
          <span style={{ marginLeft: 16 }}>Grid: 10m (zoom for 1m)</span>
        </div>
      </div>
      
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        style={{
          ...styles.canvas,
          cursor:
            interaction.kind === 'pan' || interaction.kind === 'move' || interaction.kind === 'rotate'
              ? 'grabbing'
              : activeTool === 'pan'
                ? 'grab'
                : TOOL_CURSORS[activeTool],
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={(e) => e.preventDefault()}
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
        tabIndex={0}
      />
      
      {/* Info panel */}
      <div style={styles.infoPanel}>
        <div style={styles.infoPanelTitle}>Course Info</div>
        <div>Elements: {course.elements.length}</div>
        <div>Sectors: {course.sectors.length}</div>
        <div>Selected: {selectedIds.size}</div>
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)' }}>
          Scroll: Zoom | Shift+Drag: Pan<br/>
          Drag element: Move (any tool) | Drag empty: Box select (Select tool)<br/>
          Alt+Drag or Right-Drag element: Rotate<br/>
          G: Toggle Grid | S: Toggle Snap<br/>
          Delete: Remove selected
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Sub-components
// ============================================================================

interface ToolButtonProps {
  tool: EditorTool;
  active: EditorTool;
  onClick: (tool: EditorTool) => void;
  label: string;
}

const ToolButton: React.FC<ToolButtonProps> = ({ tool, active, onClick, label }) => (
  <button
    onClick={() => onClick(tool)}
    style={{
      ...styles.toolButton,
      backgroundColor: active === tool ? 'var(--accent)' : 'transparent',
      color: active === tool ? 'var(--bg)' : 'var(--text)',
    }}
    title={label}
  >
    {label}
  </button>
);

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--bg)',
    borderRadius: '8px',
    width: '100%',
    height: '100%',
    minWidth: 0,
    minHeight: 0,
    position: 'relative',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    backgroundColor: 'var(--surface)',
    borderBottom: '1px solid var(--border)',
    flexWrap: 'wrap',
    flexShrink: 0,
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  toolGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  toolButton: {
    padding: '6px 12px',
    borderRadius: '4px',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    cursor: 'pointer',
    fontSize: '12px',
    whiteSpace: 'nowrap',
  },
  divider: {
    width: '1px',
    height: '24px',
    backgroundColor: 'var(--border)',
  },
  spacer: {
    flex: 1,
  },
  label: {
    color: 'var(--muted)',
    fontSize: '12px',
    marginRight: '4px',
  },
  colorButton: {
    width: '20px',
    height: '20px',
    borderRadius: '4px',
    cursor: 'pointer',
    padding: 0,
  },
  status: {
    fontSize: '12px',
    color: 'var(--muted)',
    fontFamily: 'monospace',
  },
  canvas: {
    display: 'block',
    outline: 'none',
    flex: 1,
    width: '100%',
    height: '100%',
  },
  infoPanel: {
    position: 'absolute',
    top: '56px',
    right: '8px',
    backgroundColor: 'rgba(21, 25, 34, 0.92)',
    padding: '12px',
    borderRadius: '8px',
    fontSize: '12px',
    color: 'var(--text)',
    minWidth: '140px',
    border: '1px solid var(--border)',
  },
  infoPanelTitle: {
    fontWeight: 'bold',
    marginBottom: '8px',
    color: 'var(--accent)',
  },
};

export default CourseEditor;

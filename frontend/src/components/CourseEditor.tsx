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
  GateElement,
  DEFAULT_EDITOR_VIEWPORT,
} from '@/types/course';

// ============================================================================
// Types
// ============================================================================

interface CourseEditorProps {
  course: CourseDefinition;
  onCourseChange: (course: CourseDefinition) => void;
  width?: number;
  height?: number;
}

interface DragState {
  isDragging: boolean;
  startX: number;
  startY: number;
  elementId?: ElementId;
  type: 'pan' | 'move' | 'select' | 'draw';
}

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
  scale: number
): boolean {
  const hitRadius = Math.max(10 / scale, 0.5); // Min 0.5 meters or 10 pixels
  const dx = point.x - element.position.x;
  const dy = point.y - element.position.y;
  return Math.sqrt(dx * dx + dy * dy) < hitRadius;
}

// ============================================================================
// Main Component
// ============================================================================

export const CourseEditor: React.FC<CourseEditorProps> = ({
  course,
  onCourseChange,
  width = 800,
  height = 600,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // State
  const [viewport, setViewport] = useState<EditorViewport>({
    centerX: 0,
    centerY: 0,
    scale: 10,
    rotation: 0,
    gridVisible: true,
    gridSize: 5,
    snapToGrid: true,
  });
  
  const [activeTool, setActiveTool] = useState<EditorTool>('select');
  const [selectedIds, setSelectedIds] = useState<Set<ElementId>>(new Set());
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    startX: 0,
    startY: 0,
    type: 'pan',
  });
  
  // Tool options
  const [coneColor, setConeColor] = useState<'orange' | 'red' | 'yellow' | 'blue' | 'green'>('orange');
  const [gateWidth, setGateWidth] = useState(3);
  
  // Drawing state for sectors
  const [drawingPolygon, setDrawingPolygon] = useState<Point[]>([]);
  const [mousePos, setMousePos] = useState<Point>({ x: 0, y: 0 });
  
  // ============================================================================
  // Canvas Rendering
  // ============================================================================
  
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);
    
    // Draw grid
    if (viewport.gridVisible) {
      drawGrid(ctx, viewport, width, height);
    }
    
    // Draw sectors first (behind elements)
    for (const sector of course.sectors) {
      drawSector(ctx, sector, viewport, width, height);
    }
    
    // Draw course elements
    for (const element of course.elements) {
      const isSelected = selectedIds.has(element.id);
      drawElement(ctx, element, viewport, width, height, isSelected);
    }
    
    // Draw polygon being created
    if (drawingPolygon.length > 0 && activeTool === 'sector_polygon') {
      drawDrawingPolygon(ctx, drawingPolygon, mousePos, viewport, width, height);
    }
    
    // Draw measurement if using measure tool
    if (activeTool === 'measure' && dragState.isDragging) {
      drawMeasurement(ctx, dragState, mousePos, viewport, width, height);
    }
    
  }, [viewport, course, selectedIds, drawingPolygon, mousePos, activeTool, dragState, width, height]);
  
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
    ctx.strokeStyle = '#2a2a4a';
    ctx.lineWidth = 1;
    
    const gridSize = vp.gridSize;
    const startWorld = canvasToWorld(0, 0, vp, w, h);
    const endWorld = canvasToWorld(w, h, vp, w, h);
    
    // Vertical lines
    const startX = Math.floor(startWorld.x / gridSize) * gridSize;
    for (let x = startX; x <= endWorld.x; x += gridSize) {
      const { x: canvasX } = worldToCanvas(x, 0, vp, w, h);
      ctx.beginPath();
      ctx.moveTo(canvasX, 0);
      ctx.lineTo(canvasX, h);
      ctx.stroke();
    }
    
    // Horizontal lines
    const startY = Math.floor(endWorld.y / gridSize) * gridSize;
    for (let y = startY; y <= startWorld.y; y += gridSize) {
      const { y: canvasY } = worldToCanvas(0, y, vp, w, h);
      ctx.beginPath();
      ctx.moveTo(0, canvasY);
      ctx.lineTo(w, canvasY);
      ctx.stroke();
    }
    
    // Draw origin crosshair
    const origin = worldToCanvas(0, 0, vp, w, h);
    ctx.strokeStyle = '#3b82f6';
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
    isSelected: boolean
  ) {
    const pos = worldToCanvas(element.position.x, element.position.y, vp, w, h);
    
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate((-element.rotation * Math.PI) / 180);
    
    switch (element.type) {
      case 'cone':
        drawCone(ctx, element as ConeElement, vp.scale, isSelected);
        break;
      case 'pointer':
        drawPointer(ctx, element as ConeElement, vp.scale, isSelected);
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
      ctx.fillStyle = '#ffffff';
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
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
  
  function drawPointer(
    ctx: CanvasRenderingContext2D,
    element: ConeElement,
    scale: number,
    isSelected: boolean
  ) {
    const size = Math.max(0.3 * scale, 6);
    const color = CONE_COLORS[element.coneColor] || CONE_COLORS.orange;
    
    // Pointer (cone on its side)
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(-size * 0.5, -size * 0.5);
    ctx.lineTo(-size * 0.5, size * 0.5);
    ctx.closePath();
    
    ctx.fillStyle = color;
    ctx.fill();
    
    if (isSelected) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
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
    ctx.strokeStyle = isSelected ? '#ffffff' : '#666';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(-halfWidth, 0);
    ctx.lineTo(halfWidth, 0);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Direction arrow
    ctx.strokeStyle = '#3b82f6';
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
      ctx.strokeStyle = '#ffffff';
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
      ctx.strokeStyle = '#ffffff';
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
    ctx.strokeStyle = '#3b82f6';
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
      ctx.strokeStyle = '#ffffff';
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
      ctx.strokeStyle = '#ffffff';
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
    
    ctx.fillStyle = '#ffffff';
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
    
    ctx.strokeStyle = '#22c55e';
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
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  
  function drawMeasurement(
    ctx: CanvasRenderingContext2D,
    drag: DragState,
    mouse: Point,
    vp: EditorViewport,
    w: number,
    h: number
  ) {
    const startWorld = canvasToWorld(drag.startX, drag.startY, vp, w, h);
    const startCanvas = worldToCanvas(startWorld.x, startWorld.y, vp, w, h);
    const endCanvas = worldToCanvas(mouse.x, mouse.y, vp, w, h);
    
    // Draw line
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(startCanvas.x, startCanvas.y);
    ctx.lineTo(endCanvas.x, endCanvas.y);
    ctx.stroke();
    
    // Calculate distance
    const dx = mouse.x - startWorld.x;
    const dy = mouse.y - startWorld.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Draw distance label
    const midX = (startCanvas.x + endCanvas.x) / 2;
    const midY = (startCanvas.y + endCanvas.y) / 2;
    
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(midX - 30, midY - 10, 60, 20);
    ctx.fillStyle = '#eab308';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${distance.toFixed(1)}m`, midX, midY + 4);
  }
  
  // ============================================================================
  // Event Handlers
  // ============================================================================
  
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;
    const worldPos = canvasToWorld(canvasX, canvasY, viewport, width, height);
    
    if (activeTool === 'pan' || e.button === 1 || (e.button === 0 && e.shiftKey)) {
      setDragState({
        isDragging: true,
        startX: canvasX,
        startY: canvasY,
        type: 'pan',
      });
      return;
    }
    
    if (activeTool === 'select') {
      // Check if clicking on an element
      for (const element of [...course.elements].reverse()) {
        if (isPointInElement(worldPos, element, viewport.scale)) {
          if (e.ctrlKey || e.metaKey) {
            // Toggle selection
            const newSelection = new Set(selectedIds);
            if (newSelection.has(element.id)) {
              newSelection.delete(element.id);
            } else {
              newSelection.add(element.id);
            }
            setSelectedIds(newSelection);
          } else {
            setSelectedIds(new Set([element.id]));
            setDragState({
              isDragging: true,
              startX: canvasX,
              startY: canvasY,
              elementId: element.id,
              type: 'move',
            });
          }
          return;
        }
      }
      // Clicked on empty space - clear selection
      setSelectedIds(new Set());
      return;
    }
    
    if (activeTool === 'measure') {
      setDragState({
        isDragging: true,
        startX: canvasX,
        startY: canvasY,
        type: 'draw',
      });
      return;
    }
    
    if (activeTool === 'sector_polygon') {
      const pos = viewport.snapToGrid ? snapToGrid(worldPos, viewport.gridSize) : worldPos;
      
      // Double-click to close polygon
      if (drawingPolygon.length >= 3 && e.detail === 2) {
        // Complete the sector
        const newSector: CourseSector = {
          id: generateId(),
          name: `Sector ${course.sectors.length + 1}`,
          color: ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6'][course.sectors.length % 6],
          order: course.sectors.length + 1,
          polygon: { vertices: drawingPolygon },
          timingEnabled: true,
        };
        
        onCourseChange({
          ...course,
          sectors: [...course.sectors, newSector],
        });
        setDrawingPolygon([]);
      } else {
        setDrawingPolygon([...drawingPolygon, pos]);
      }
      return;
    }
    
    if (activeTool === 'erase') {
      // Find and remove element at click position
      for (const element of [...course.elements].reverse()) {
        if (isPointInElement(worldPos, element, viewport.scale)) {
          onCourseChange({
            ...course,
            elements: course.elements.filter(e => e.id !== element.id),
          });
          return;
        }
      }
      return;
    }
    
    // Place element tools
    const pos = viewport.snapToGrid ? snapToGrid(worldPos, viewport.gridSize) : worldPos;
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
      onCourseChange({
        ...course,
        elements: [...course.elements, newElement],
      });
      setSelectedIds(new Set([newElement.id]));
    }
  }, [activeTool, viewport, course, onCourseChange, selectedIds, drawingPolygon, coneColor, gateWidth, width, height]);
  
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;
    const worldPos = canvasToWorld(canvasX, canvasY, viewport, width, height);
    
    setMousePos(viewport.snapToGrid ? snapToGrid(worldPos, viewport.gridSize) : worldPos);
    
    if (!dragState.isDragging) return;
    
    if (dragState.type === 'pan') {
      const dx = (canvasX - dragState.startX) / viewport.scale;
      const dy = -(canvasY - dragState.startY) / viewport.scale;
      
      setViewport({
        ...viewport,
        centerX: viewport.centerX - dx,
        centerY: viewport.centerY - dy,
      });
      
      setDragState({
        ...dragState,
        startX: canvasX,
        startY: canvasY,
      });
    } else if (dragState.type === 'move' && dragState.elementId) {
      const pos = viewport.snapToGrid ? snapToGrid(worldPos, viewport.gridSize) : worldPos;
      
      onCourseChange({
        ...course,
        elements: course.elements.map(el =>
          el.id === dragState.elementId
            ? { ...el, position: pos }
            : el
        ),
      });
    }
  }, [dragState, viewport, course, onCourseChange, width, height]);
  
  const handleMouseUp = useCallback(() => {
    setDragState({
      isDragging: false,
      startX: 0,
      startY: 0,
      type: 'pan',
    });
  }, []);
  
  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;
    
    // Zoom toward cursor position
    const worldBefore = canvasToWorld(canvasX, canvasY, viewport, width, height);
    
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(1, Math.min(100, viewport.scale * zoomFactor));
    
    const newViewport = { ...viewport, scale: newScale };
    const worldAfter = canvasToWorld(canvasX, canvasY, newViewport, width, height);
    
    setViewport({
      ...newViewport,
      centerX: viewport.centerX + (worldBefore.x - worldAfter.x),
      centerY: viewport.centerY + (worldBefore.y - worldAfter.y),
    });
  }, [viewport, width, height]);
  
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedIds.size > 0) {
        onCourseChange({
          ...course,
          elements: course.elements.filter(el => !selectedIds.has(el.id)),
        });
        setSelectedIds(new Set());
      }
    } else if (e.key === 'Escape') {
      setSelectedIds(new Set());
      setDrawingPolygon([]);
      setActiveTool('select');
    } else if (e.key === 'g') {
      setViewport({ ...viewport, gridVisible: !viewport.gridVisible });
    } else if (e.key === 's') {
      setViewport({ ...viewport, snapToGrid: !viewport.snapToGrid });
    }
  }, [selectedIds, course, onCourseChange, viewport]);
  
  // ============================================================================
  // Render
  // ============================================================================
  
  return (
    <div ref={containerRef} style={styles.container}>
      {/* Toolbar */}
      <div style={styles.toolbar}>
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
        </div>
      </div>
      
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{
          ...styles.canvas,
          cursor: dragState.isDragging && dragState.type === 'pan' 
            ? 'grabbing' 
            : TOOL_CURSORS[activeTool],
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
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
        <div style={{ marginTop: 8, fontSize: 11, color: '#888' }}>
          Scroll: Zoom | Shift+Drag: Pan<br/>
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
      backgroundColor: active === tool ? '#3b82f6' : 'transparent',
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
    backgroundColor: '#0f0f1a',
    borderRadius: '8px',
    overflow: 'hidden',
    position: 'relative',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    backgroundColor: '#1a1a2e',
    borderBottom: '1px solid #2a2a4a',
    flexWrap: 'wrap',
  },
  toolGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  toolButton: {
    padding: '6px 12px',
    borderRadius: '4px',
    border: '1px solid #3a3a5a',
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: '12px',
    whiteSpace: 'nowrap',
  },
  divider: {
    width: '1px',
    height: '24px',
    backgroundColor: '#3a3a5a',
  },
  spacer: {
    flex: 1,
  },
  label: {
    color: '#888',
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
    color: '#888',
    fontFamily: 'monospace',
  },
  canvas: {
    display: 'block',
    outline: 'none',
  },
  infoPanel: {
    position: 'absolute',
    top: '56px',
    right: '8px',
    backgroundColor: 'rgba(26, 26, 46, 0.9)',
    padding: '12px',
    borderRadius: '8px',
    fontSize: '12px',
    color: '#ffffff',
    minWidth: '140px',
  },
  infoPanelTitle: {
    fontWeight: 'bold',
    marginBottom: '8px',
    color: '#3b82f6',
  },
};

export default CourseEditor;

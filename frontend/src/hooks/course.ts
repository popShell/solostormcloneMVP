/**
 * Course Editor Hooks
 * 
 * Provides state management and GPS geofencing logic for:
 * - Course creation and editing
 * - Sector definitions
 * - Real-time sector timing based on GPS position
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type {
  CourseDefinition,
  CourseElement,
  CourseSector,
  SectorPolygon,
  SectorGate,
  SectorTime,
  GeofenceEvent,
  Point,
  GpsCoordinate,
  CourseMetadata,
  EditorHistoryEntry,
} from '@/types/course';

// ============================================================================
// Course State Hook
// ============================================================================

interface UseCourseResult {
  course: CourseDefinition;
  
  // Element operations
  addElement: (element: CourseElement) => void;
  updateElement: (id: string, updates: Partial<CourseElement>) => void;
  removeElement: (id: string) => void;
  removeElements: (ids: string[]) => void;
  
  // Sector operations
  addSector: (sector: CourseSector) => void;
  updateSector: (id: string, updates: Partial<CourseSector>) => void;
  removeSector: (id: string) => void;
  
  // Metadata
  updateMetadata: (updates: Partial<CourseMetadata>) => void;
  
  // History
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  
  // Bulk operations
  setCourse: (course: CourseDefinition) => void;
  clearCourse: () => void;
}

export function useCourse(initialCourse?: CourseDefinition): UseCourseResult {
  const [course, setCourseState] = useState<CourseDefinition>(() => {
    if (initialCourse) return initialCourse;
    
    return createEmptyCourse();
  });
  
  const [history, setHistory] = useState<EditorHistoryEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  // Save state to history
  const saveToHistory = useCallback((action: string) => {
    const entry: EditorHistoryEntry = {
      timestamp: Date.now(),
      action,
      elements: [...course.elements],
      sectors: [...course.sectors],
    };
    
    // Remove any redo history
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(entry);
    
    // Limit history size
    if (newHistory.length > 50) {
      newHistory.shift();
    }
    
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [course, history, historyIndex]);
  
  // Element operations
  const addElement = useCallback((element: CourseElement) => {
    saveToHistory('Add element');
    setCourseState(prev => ({
      ...prev,
      elements: [...prev.elements, element],
      metadata: {
        ...prev.metadata,
        updatedAt: new Date().toISOString(),
      },
    }));
  }, [saveToHistory]);
  
  const updateElement = useCallback((id: string, updates: Partial<CourseElement>) => {
    saveToHistory('Update element');
    setCourseState(prev => ({
      ...prev,
      elements: prev.elements.map(el =>
        el.id === id ? { ...el, ...updates } as CourseElement : el
      ),
      metadata: {
        ...prev.metadata,
        updatedAt: new Date().toISOString(),
      },
    }));
  }, [saveToHistory]);
  
  const removeElement = useCallback((id: string) => {
    saveToHistory('Remove element');
    setCourseState(prev => ({
      ...prev,
      elements: prev.elements.filter(el => el.id !== id),
      metadata: {
        ...prev.metadata,
        updatedAt: new Date().toISOString(),
      },
    }));
  }, [saveToHistory]);
  
  const removeElements = useCallback((ids: string[]) => {
    const idSet = new Set(ids);
    saveToHistory('Remove elements');
    setCourseState(prev => ({
      ...prev,
      elements: prev.elements.filter(el => !idSet.has(el.id)),
      metadata: {
        ...prev.metadata,
        updatedAt: new Date().toISOString(),
      },
    }));
  }, [saveToHistory]);
  
  // Sector operations
  const addSector = useCallback((sector: CourseSector) => {
    saveToHistory('Add sector');
    setCourseState(prev => ({
      ...prev,
      sectors: [...prev.sectors, sector],
      metadata: {
        ...prev.metadata,
        updatedAt: new Date().toISOString(),
      },
    }));
  }, [saveToHistory]);
  
  const updateSector = useCallback((id: string, updates: Partial<CourseSector>) => {
    saveToHistory('Update sector');
    setCourseState(prev => ({
      ...prev,
      sectors: prev.sectors.map(s =>
        s.id === id ? { ...s, ...updates } : s
      ),
      metadata: {
        ...prev.metadata,
        updatedAt: new Date().toISOString(),
      },
    }));
  }, [saveToHistory]);
  
  const removeSector = useCallback((id: string) => {
    saveToHistory('Remove sector');
    setCourseState(prev => ({
      ...prev,
      sectors: prev.sectors.filter(s => s.id !== id),
      metadata: {
        ...prev.metadata,
        updatedAt: new Date().toISOString(),
      },
    }));
  }, [saveToHistory]);
  
  // Metadata
  const updateMetadata = useCallback((updates: Partial<CourseMetadata>) => {
    setCourseState(prev => ({
      ...prev,
      metadata: {
        ...prev.metadata,
        ...updates,
        updatedAt: new Date().toISOString(),
      },
    }));
  }, []);
  
  // History operations
  const undo = useCallback(() => {
    if (historyIndex < 0) return;
    
    const entry = history[historyIndex];
    setCourseState(prev => ({
      ...prev,
      elements: entry.elements,
      sectors: entry.sectors,
    }));
    setHistoryIndex(historyIndex - 1);
  }, [history, historyIndex]);
  
  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    
    const entry = history[historyIndex + 1];
    setCourseState(prev => ({
      ...prev,
      elements: entry.elements,
      sectors: entry.sectors,
    }));
    setHistoryIndex(historyIndex + 1);
  }, [history, historyIndex]);
  
  const canUndo = historyIndex >= 0;
  const canRedo = historyIndex < history.length - 1;
  
  // Bulk operations
  const setCourse = useCallback((newCourse: CourseDefinition) => {
    setCourseState(newCourse);
    setHistory([]);
    setHistoryIndex(-1);
  }, []);
  
  const clearCourse = useCallback(() => {
    setCourseState(createEmptyCourse());
    setHistory([]);
    setHistoryIndex(-1);
  }, []);
  
  return {
    course,
    addElement,
    updateElement,
    removeElement,
    removeElements,
    addSector,
    updateSector,
    removeSector,
    updateMetadata,
    undo,
    redo,
    canUndo,
    canRedo,
    setCourse,
    clearCourse,
  };
}

// ============================================================================
// GPS Geofencing Hook
// ============================================================================

interface UseGeofencingResult {
  // Current state
  activeSectorId: string | null;
  sectorTimes: SectorTime[];
  events: GeofenceEvent[];
  
  // Methods
  updatePosition: (position: Point, timestamp: number) => void;
  updateGpsPosition: (gps: GpsCoordinate, timestamp: number) => void;
  reset: () => void;
  
  // Derived data
  currentSectorTime: number | null;
  totalTime: number;
}

export function useGeofencing(sectors: CourseSector[]): UseGeofencingResult {
  const [activeSectorId, setActiveSectorId] = useState<string | null>(null);
  const [sectorTimes, setSectorTimes] = useState<SectorTime[]>([]);
  const [events, setEvents] = useState<GeofenceEvent[]>([]);
  
  const entryTimeRef = useRef<number | null>(null);
  const previousPositionRef = useRef<Point | null>(null);
  const startTimeRef = useRef<number | null>(null);
  
  // Check if point is inside polygon using ray casting
  const isPointInPolygon = useCallback((point: Point, polygon: SectorPolygon): boolean => {
    const vertices = polygon.vertices;
    if (vertices.length < 3) return false;
    
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const xi = vertices[i].x, yi = vertices[i].y;
      const xj = vertices[j].x, yj = vertices[j].y;
      
      if (((yi > point.y) !== (yj > point.y)) &&
          (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    
    return inside;
  }, []);
  
  // Check if line segment crosses gate
  const doesLineCrossGate = useCallback((
    p1: Point,
    p2: Point,
    gate: SectorGate
  ): boolean => {
    // Gate is represented as a line segment perpendicular to its rotation
    const halfWidth = gate.width / 2;
    const rad = (gate.rotation * Math.PI) / 180;
    
    const g1: Point = {
      x: gate.position.x + Math.cos(rad + Math.PI / 2) * halfWidth,
      y: gate.position.y + Math.sin(rad + Math.PI / 2) * halfWidth,
    };
    const g2: Point = {
      x: gate.position.x - Math.cos(rad + Math.PI / 2) * halfWidth,
      y: gate.position.y - Math.sin(rad + Math.PI / 2) * halfWidth,
    };
    
    // Check if line segments intersect
    return doLineSegmentsIntersect(p1, p2, g1, g2);
  }, []);
  
  // Update position and check geofences
  const updatePosition = useCallback((position: Point, timestamp: number) => {
    if (startTimeRef.current === null) {
      startTimeRef.current = timestamp;
    }
    
    const prevPos = previousPositionRef.current;
    previousPositionRef.current = position;
    
    // Check each sector for entry/exit
    for (const sector of sectors) {
      if (!sector.timingEnabled) continue;
      
      // Check polygon-based geofencing
      if (sector.polygon) {
        const wasInside = prevPos ? isPointInPolygon(prevPos, sector.polygon) : false;
        const isInside = isPointInPolygon(position, sector.polygon);
        
        if (!wasInside && isInside) {
          // Entered sector
          handleSectorEntry(sector.id, timestamp, position);
        } else if (wasInside && !isInside) {
          // Exited sector
          handleSectorExit(sector.id, timestamp, position);
        }
      }
      
      // Check gate-based geofencing
      if (sector.entryGate && prevPos) {
        if (doesLineCrossGate(prevPos, position, sector.entryGate)) {
          handleSectorEntry(sector.id, timestamp, position);
        }
      }
      
      if (sector.exitGate && prevPos) {
        if (doesLineCrossGate(prevPos, position, sector.exitGate)) {
          handleSectorExit(sector.id, timestamp, position);
        }
      }
    }
  }, [sectors, isPointInPolygon, doesLineCrossGate]);
  
  // Handle sector entry
  const handleSectorEntry = useCallback((sectorId: string, timestamp: number, position: Point) => {
    setActiveSectorId(sectorId);
    entryTimeRef.current = timestamp;
    
    const event: GeofenceEvent = {
      sectorId,
      eventType: 'enter',
      timestamp,
      position,
    };
    setEvents(prev => [...prev, event]);
  }, []);
  
  // Handle sector exit
  const handleSectorExit = useCallback((sectorId: string, timestamp: number, position: Point) => {
    const sector = sectors.find(s => s.id === sectorId);
    
    if (entryTimeRef.current !== null && sector) {
      const duration = timestamp - entryTimeRef.current;
      
      const sectorTime: SectorTime = {
        sectorId,
        sectorName: sector.name,
        entryTime: entryTimeRef.current,
        exitTime: timestamp,
        duration,
        deltaFromTarget: sector.targetTime ? duration - sector.targetTime : undefined,
      };
      
      setSectorTimes(prev => [...prev, sectorTime]);
    }
    
    const event: GeofenceEvent = {
      sectorId,
      eventType: 'exit',
      timestamp,
      position,
    };
    setEvents(prev => [...prev, event]);
    
    setActiveSectorId(null);
    entryTimeRef.current = null;
  }, [sectors]);
  
  // Update GPS position (converts to local coordinates using provided origin)
  const updateGpsPosition = useCallback((gps: GpsCoordinate, timestamp: number) => {
    // This would require the course origin to convert GPS to local
    // For now, we assume GPS coordinates map directly (simplified)
    const position: Point = {
      x: gps.lon * 111320 * Math.cos(gps.lat * Math.PI / 180),
      y: gps.lat * 110540,
    };
    updatePosition(position, timestamp);
  }, [updatePosition]);
  
  // Reset state
  const reset = useCallback(() => {
    setActiveSectorId(null);
    setSectorTimes([]);
    setEvents([]);
    entryTimeRef.current = null;
    previousPositionRef.current = null;
    startTimeRef.current = null;
  }, []);
  
  // Calculate current sector time
  const currentSectorTime = useMemo(() => {
    if (activeSectorId === null || entryTimeRef.current === null) return null;
    // This would need to be updated with current time for real-time display
    return null;
  }, [activeSectorId]);
  
  // Calculate total time
  const totalTime = useMemo(() => {
    if (sectorTimes.length === 0) return 0;
    return sectorTimes.reduce((sum, st) => sum + st.duration, 0);
  }, [sectorTimes]);
  
  return {
    activeSectorId,
    sectorTimes,
    events,
    updatePosition,
    updateGpsPosition,
    reset,
    currentSectorTime,
    totalTime,
  };
}

// ============================================================================
// Sector Timing Analysis Hook
// ============================================================================

interface UseSectorAnalysisResult {
  // Per-sector analysis
  getSectorStats: (sectorId: string) => {
    bestTime: number | null;
    averageTime: number | null;
    worstTime: number | null;
    attempts: number;
  };
  
  // Comparison
  compareSectors: (runTimes1: SectorTime[], runTimes2: SectorTime[]) => {
    sectorId: string;
    delta: number;
    run1Time: number;
    run2Time: number;
  }[];
  
  // Best theoretical
  theoreticalBest: number;
}

export function useSectorAnalysis(
  allSectorTimes: SectorTime[][]  // Array of runs, each containing sector times
): UseSectorAnalysisResult {
  // Calculate per-sector statistics
  const getSectorStats = useCallback((sectorId: string) => {
    const sectorTimes = allSectorTimes
      .flat()
      .filter(st => st.sectorId === sectorId)
      .map(st => st.duration);
    
    if (sectorTimes.length === 0) {
      return {
        bestTime: null,
        averageTime: null,
        worstTime: null,
        attempts: 0,
      };
    }
    
    return {
      bestTime: Math.min(...sectorTimes),
      averageTime: sectorTimes.reduce((a, b) => a + b, 0) / sectorTimes.length,
      worstTime: Math.max(...sectorTimes),
      attempts: sectorTimes.length,
    };
  }, [allSectorTimes]);
  
  // Compare two runs sector by sector
  const compareSectors = useCallback((
    runTimes1: SectorTime[],
    runTimes2: SectorTime[]
  ) => {
    const times1Map = new Map(runTimes1.map(st => [st.sectorId, st.duration]));
    const times2Map = new Map(runTimes2.map(st => [st.sectorId, st.duration]));
    
    const allSectorIds = new Set([...times1Map.keys(), ...times2Map.keys()]);
    
    return Array.from(allSectorIds).map(sectorId => ({
      sectorId,
      delta: (times1Map.get(sectorId) ?? 0) - (times2Map.get(sectorId) ?? 0),
      run1Time: times1Map.get(sectorId) ?? 0,
      run2Time: times2Map.get(sectorId) ?? 0,
    }));
  }, []);
  
  // Calculate theoretical best (best of each sector combined)
  const theoreticalBest = useMemo(() => {
    const sectorIds = new Set(allSectorTimes.flat().map(st => st.sectorId));
    
    let total = 0;
    for (const sectorId of sectorIds) {
      const times = allSectorTimes
        .flat()
        .filter(st => st.sectorId === sectorId)
        .map(st => st.duration);
      
      if (times.length > 0) {
        total += Math.min(...times);
      }
    }
    
    return total;
  }, [allSectorTimes]);
  
  return {
    getSectorStats,
    compareSectors,
    theoreticalBest,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function createEmptyCourse(): CourseDefinition {
  const now = new Date().toISOString();
  return {
    metadata: {
      id: `course-${Date.now()}`,
      name: 'Untitled Course',
      createdAt: now,
      updatedAt: now,
      version: 1,
      boundingBox: [-50, -50, 50, 50],
      origin: { type: 'manual' },
    },
    elements: [],
    sectors: [],
  };
}

// Line segment intersection check
function doLineSegmentsIntersect(
  p1: Point,
  p2: Point,
  p3: Point,
  p4: Point
): boolean {
  const d1 = direction(p3, p4, p1);
  const d2 = direction(p3, p4, p2);
  const d3 = direction(p1, p2, p3);
  const d4 = direction(p1, p2, p4);
  
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  
  if (d1 === 0 && onSegment(p3, p4, p1)) return true;
  if (d2 === 0 && onSegment(p3, p4, p2)) return true;
  if (d3 === 0 && onSegment(p1, p2, p3)) return true;
  if (d4 === 0 && onSegment(p1, p2, p4)) return true;
  
  return false;
}

function direction(p1: Point, p2: Point, p3: Point): number {
  return (p3.x - p1.x) * (p2.y - p1.y) - (p2.x - p1.x) * (p3.y - p1.y);
}

function onSegment(p1: Point, p2: Point, p: Point): boolean {
  return (
    Math.min(p1.x, p2.x) <= p.x && p.x <= Math.max(p1.x, p2.x) &&
    Math.min(p1.y, p2.y) <= p.y && p.y <= Math.max(p1.y, p2.y)
  );
}

// ============================================================================
// Export/Import Functions
// ============================================================================

export function exportCourseToJson(course: CourseDefinition): string {
  return JSON.stringify(course, null, 2);
}

export function importCourseFromJson(json: string): CourseDefinition | null {
  try {
    const data = JSON.parse(json);
    // Validate required fields
    if (!data.metadata || !data.elements || !data.sectors) {
      return null;
    }
    return data as CourseDefinition;
  } catch {
    return null;
  }
}

export function exportCourseToGpx(course: CourseDefinition): string {
  // Generate GPX with waypoints for each element
  const waypoints = course.elements.map(el => {
    // This would need GPS coordinates - simplified for now
    return `  <wpt lat="0" lon="0">
    <name>${el.type}-${el.id}</name>
    <desc>${el.label || el.type}</desc>
  </wpt>`;
  }).join('\n');
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Autocross Telemetry">
  <metadata>
    <name>${course.metadata.name}</name>
    <desc>${course.metadata.description || ''}</desc>
    <time>${course.metadata.updatedAt}</time>
  </metadata>
${waypoints}
</gpx>`;
}

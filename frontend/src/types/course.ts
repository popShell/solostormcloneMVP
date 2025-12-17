/**
 * Course Editor Types
 * 
 * Defines types for autocross course design including:
 * - Course elements (cones, gates, slaloms, etc.)
 * - Sector definitions with GPS geofencing
 * - Course metadata and export formats
 */

// ============================================================================
// Base Types
// ============================================================================

/** 2D point in meters (ENU coordinates) */
export interface Point {
  x: number;
  y: number;
}

/** GPS coordinates */
export interface GpsCoordinate {
  lat: number;
  lon: number;
}

/** Unique identifier for course elements */
export type ElementId = string;

// ============================================================================
// Course Element Types
// ============================================================================

/** Types of course elements that can be placed */
export type CourseElementType = 
  | 'cone'           // Standard traffic cone
  | 'pointer'        // Cone on its side indicating direction
  | 'gate'           // Two cones forming a gate to drive through
  | 'slalom'         // Series of cones to weave through
  | 'offset'         // Series of offset gates
  | 'start'          // Start line
  | 'finish'         // Finish line
  | 'worker_station' // Course worker position
  | 'timing_box'     // Timing equipment location
  | 'marker'         // Generic marker/reference point
  | 'boundary';      // Course boundary marker

/** Base interface for all course elements */
interface CourseElementBase {
  id: ElementId;
  type: CourseElementType;
  position: Point;
  rotation: number;  // Degrees, 0 = North/Up
  label?: string;    // Optional label/name
  color?: string;    // Override color
  locked?: boolean;  // Prevent accidental edits
}

/** Standard traffic cone */
export interface ConeElement extends CourseElementBase {
  type: 'cone';
  coneColor: 'orange' | 'red' | 'yellow' | 'blue' | 'green';
}

/** Pointer cone (on its side, indicates direction) */
export interface PointerElement extends CourseElementBase {
  type: 'pointer';
  coneColor: 'orange' | 'red' | 'yellow' | 'blue' | 'green';
  // rotation indicates direction the cone points
}

/** Gate - two cones defining a passthrough */
export interface GateElement extends CourseElementBase {
  type: 'gate';
  width: number;       // Distance between cones in meters
  gateType: 'standard' | 'timing' | 'penalty_zone';
  coneColor: 'orange' | 'red' | 'yellow' | 'blue' | 'green';
}

/** Slalom - series of cones to weave through */
export interface SlalomElement extends CourseElementBase {
  type: 'slalom';
  coneCount: number;   // Number of cones
  spacing: number;     // Distance between cones in meters
  coneColor: 'orange' | 'red' | 'yellow' | 'blue' | 'green';
  entryDirection: 'left' | 'right';  // Which side to enter
}

/** Offset - series of offset gates */
export interface OffsetElement extends CourseElementBase {
  type: 'offset';
  gateCount: number;
  gateWidth: number;   // Width of each gate
  spacing: number;     // Distance between gates
  offsetDistance: number;  // Lateral offset between gates
  coneColor: 'orange' | 'red' | 'yellow' | 'blue' | 'green';
}

/** Start/Finish line */
export interface StartFinishElement extends CourseElementBase {
  type: 'start' | 'finish';
  width: number;       // Line width in meters
  hasTiming: boolean;  // Whether timing equipment is here
}

/** Worker station */
export interface WorkerStationElement extends CourseElementBase {
  type: 'worker_station';
  stationNumber?: number;
  hasRadio: boolean;
  hasFlag: boolean;
}

/** Timing equipment location */
export interface TimingBoxElement extends CourseElementBase {
  type: 'timing_box';
  equipment: string;  // Description of equipment
}

/** Generic marker */
export interface MarkerElement extends CourseElementBase {
  type: 'marker';
  markerType: 'reference' | 'landmark' | 'safety' | 'custom';
}

/** Course boundary marker */
export interface BoundaryElement extends CourseElementBase {
  type: 'boundary';
  boundaryType: 'hard' | 'soft';  // Hard = wall/obstacle, Soft = cone line
}

/** Union type of all course elements */
export type CourseElement = 
  | ConeElement
  | PointerElement
  | GateElement
  | SlalomElement
  | OffsetElement
  | StartFinishElement
  | WorkerStationElement
  | TimingBoxElement
  | MarkerElement
  | BoundaryElement;

// ============================================================================
// Sector and Geofencing Types
// ============================================================================

/** Sector boundary defined by polygon vertices */
export interface SectorPolygon {
  vertices: Point[];      // Polygon vertices in order
  gpsVertices?: GpsCoordinate[];  // Optional GPS coordinates for real-world geofencing
}

/** Sector entry/exit gates for timing */
export interface SectorGate {
  id: string;
  type: 'entry' | 'exit' | 'split';
  position: Point;
  width: number;
  rotation: number;       // Direction perpendicular to gate
  gpsPosition?: GpsCoordinate;
}

/** Course sector definition */
export interface CourseSector {
  id: string;
  name: string;           // e.g., "Sector 1", "Slalom Section", "Final Sweeper"
  color: string;          // Display color for the sector
  order: number;          // Sector order in the course (1, 2, 3...)
  
  // Geofencing options (use one or both)
  polygon?: SectorPolygon;       // Area-based geofencing
  entryGate?: SectorGate;        // Line-crossing geofencing (entry)
  exitGate?: SectorGate;         // Line-crossing geofencing (exit)
  
  // Timing configuration
  timingEnabled: boolean;        // Whether to track times for this sector
  targetTime?: number;           // Optional target/reference time in seconds
  
  // Sector analysis
  expectedElements?: ElementId[];  // Elements that should be in this sector
  notes?: string;                  // Designer notes
}

/** Geofence crossing event */
export interface GeofenceEvent {
  sectorId: string;
  eventType: 'enter' | 'exit';
  timestamp: number;       // Time in seconds from run start
  position: Point;
  gpsPosition?: GpsCoordinate;
}

/** Sector timing result */
export interface SectorTime {
  sectorId: string;
  sectorName: string;
  entryTime: number;
  exitTime: number;
  duration: number;
  deltaFromTarget?: number;
}

// ============================================================================
// Course Definition
// ============================================================================

/** Course origin configuration */
export interface CourseOrigin {
  type: 'gps' | 'manual' | 'first_point';
  gps?: GpsCoordinate;
  description?: string;
}

/** Course metadata */
export interface CourseMetadata {
  id: string;
  name: string;
  description?: string;
  venue?: string;
  designer?: string;
  createdAt: string;       // ISO date
  updatedAt: string;       // ISO date
  version: number;
  
  // Course dimensions
  boundingBox: [number, number, number, number];  // [minX, minY, maxX, maxY] in meters
  surfaceType?: 'asphalt' | 'concrete' | 'dirt' | 'mixed';
  
  // Origin configuration
  origin: CourseOrigin;
  
  // Tags for organization
  tags?: string[];
}

/** Complete course definition */
export interface CourseDefinition {
  metadata: CourseMetadata;
  elements: CourseElement[];
  sectors: CourseSector[];
  
  // Optional layers
  layers?: CourseLayer[];
  
  // Designer notes
  notes?: string;
}

/** Layer for organizing elements */
export interface CourseLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  color?: string;
  elementIds: ElementId[];
}

// ============================================================================
// Editor State Types
// ============================================================================

/** Tools available in the editor */
export type EditorTool = 
  | 'select'
  | 'pan'
  | 'cone'
  | 'pointer'
  | 'gate'
  | 'slalom'
  | 'offset'
  | 'start'
  | 'finish'
  | 'worker'
  | 'timing'
  | 'marker'
  | 'boundary'
  | 'sector_polygon'
  | 'sector_gate'
  | 'measure'
  | 'erase';

/** Editor viewport state */
export interface EditorViewport {
  centerX: number;
  centerY: number;
  scale: number;         // Pixels per meter
  rotation: number;
  gridVisible: boolean;
  gridSize: number;      // Grid cell size in meters
  snapToGrid: boolean;
}

/** Selection state */
export interface EditorSelection {
  elementIds: ElementId[];
  sectorIds: string[];
}

/** Editor history for undo/redo */
export interface EditorHistoryEntry {
  timestamp: number;
  action: string;
  elements: CourseElement[];
  sectors: CourseSector[];
}

/** Complete editor state */
export interface CourseEditorState {
  // Current course
  course: CourseDefinition;
  
  // Tool state
  activeTool: EditorTool;
  toolOptions: Record<string, unknown>;
  
  // View state
  viewport: EditorViewport;
  selection: EditorSelection;
  
  // Editing state
  isModified: boolean;
  
  // History
  history: EditorHistoryEntry[];
  historyIndex: number;
  
  // UI state
  showGrid: boolean;
  showSectors: boolean;
  showLabels: boolean;
  showMeasurements: boolean;
}

// ============================================================================
// Course Analysis Types
// ============================================================================

/** Course statistics */
export interface CourseStats {
  totalCones: number;
  totalGates: number;
  totalElements: number;
  estimatedLength: number;      // Rough course length in meters
  sectorCount: number;
  
  // Element breakdown
  elementCounts: Record<CourseElementType, number>;
  
  // Geometry
  boundingBox: [number, number, number, number];
  courseCenterX: number;
  courseCenterY: number;
}

/** Cone penalty tracking */
export interface ConePenalty {
  coneId: ElementId;
  position: Point;
  timestamp: number;
  penaltyType: 'hit' | 'dnf' | 'off_course';
}

// ============================================================================
// Export/Import Types
// ============================================================================

/** Course export format options */
export type CourseExportFormat = 'json' | 'gpx' | 'kml' | 'svg' | 'png';

/** Export options */
export interface CourseExportOptions {
  format: CourseExportFormat;
  includeGps: boolean;
  includeSectors: boolean;
  includeNotes: boolean;
  imageScale?: number;   // For image exports
}

// ============================================================================
// Default Values
// ============================================================================

export const DEFAULT_CONE_COLORS = {
  standard: 'orange',
  timing: 'red',
  penalty: 'yellow',
  reference: 'blue',
  special: 'green',
} as const;

export const DEFAULT_SECTOR_COLORS = [
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#06b6d4', // Cyan
];

export const DEFAULT_EDITOR_VIEWPORT: EditorViewport = {
  centerX: 0,
  centerY: 0,
  scale: 10,          // 10 pixels per meter
  rotation: 0,
  gridVisible: true,
  gridSize: 5,        // 5 meter grid
  snapToGrid: true,
};

export const DEFAULT_COURSE_METADATA: Omit<CourseMetadata, 'id' | 'createdAt' | 'updatedAt'> = {
  name: 'Untitled Course',
  version: 1,
  boundingBox: [-50, -50, 50, 50],
  origin: { type: 'manual' },
};

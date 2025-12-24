/**
 * TypeScript types for Autocross Telemetry API.
 * Matches backend schema definitions.
 */

// ============================================================================
// Run Types
// ============================================================================

export interface RunSummary {
  id: string;
  name: string;
  source_file: string;
  recorded_at: string | null;
  duration_s: number;
  sample_count: number;
  has_gps: boolean;
  has_imu: boolean;
}

export interface Origin {
  lat: number;
  lon: number;
  alt: number;
  manual_override: boolean;
}

export interface RunMetadata {
  id: string;
  name: string;
  source_file: string;
  recorded_at: string | null;
  duration_s: number;
  sample_count: number;
  sample_rate_hz: number;
  has_gps: boolean;
  has_imu: boolean;
  has_speed: boolean;
  canonical_version: string;
  origin: Origin;
  bounding_box: [number, number, number, number]; // [min_x, min_y, max_x, max_y]
  time_range: [number, number]; // [start_s, end_s]
}

export interface ChannelInfo {
  unit: string;
  provenance: 'measured' | 'derived';
  frame?: string;
}

export interface RunData {
  metadata: RunMetadata;
  timestamps: number[];
  x: (number | null)[];
  y: (number | null)[];
  speed: (number | null)[];
  heading: (number | null)[];
  ax: (number | null)[];
  ay: (number | null)[];
  yaw_rate: (number | null)[];
  total_g: (number | null)[];
  validity: Record<string, boolean[]>;
  channels: Record<string, ChannelInfo>;
}

// ============================================================================
// Playback Types
// ============================================================================

export interface PlaybackSample {
  time: number;
  x: number;
  y: number;
  speed: number;
  heading: number;
  ax: number;
  ay: number;
  yaw_rate: number;
  total_g: number;
  valid: Record<string, boolean>;
}

export interface PlaybackData {
  run_id: string;
  duration_s: number;
  sample_rate_hz: number;
  samples: PlaybackSample[];
}

// ============================================================================
// UI State Types
// ============================================================================

export interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;
  playbackSpeed: number;
  looping: boolean;
}

export interface ViewportState {
  centerX: number;
  centerY: number;
  scale: number; // pixels per meter
  rotation: number; // degrees
}

export type SpeedUnit = 'mph' | 'kph' | 'mps';
export type YawRateUnit = 'deg_s' | 'rad_s';

export interface DisplayUnits {
  speed: SpeedUnit;
  yawRate: YawRateUnit;
}

export interface VisualizationSettings {
  showPositionMarker: boolean;
  trailLength: number; // seconds of trail to show, 0 for full
  pathWidth: number;
  followMode?: 'manual' | 'auto_center';
}

// Map overlay / anchoring
export interface MapOverlaySettings {
  enabled: boolean;
  zoom: number;
  masterRunId?: string;
  provider?: 'osm' | 'sat';
}

// Marker/sector tools
export type MarkerMode = 'none' | 'set_start' | 'set_finish' | 'add_sector';

export interface TrackMarker {
  x: number;
  y: number;
  label?: string;
  angleDeg?: number; // for gate orientation
}

export interface SectorMarker extends TrackMarker {
  id: number;
}

// Color palettes
export const RUN_COLORS = [
  '#4fb3a6',
  '#d16d6d',
  '#7bbf93',
  '#d6b36b',
  '#b48ead',
  '#88a1b8',
  '#8fbcbb',
  '#a3be8c',
];

export const HIGH_CONTRAST_COLORS = [
  '#ff3b30', // red
  '#34c759', // green
  '#007aff', // blue
  '#ffcc00', // yellow
  '#af52de', // purple
  '#ff9f0a', // orange
  '#0dc9f7', // cyan
  '#8e8e93', // gray
  '#ffd60a', // bright yellow
  '#ff375f', // pink
];

export const RUN_COLOR_PALETTES = [
  { id: 'default', name: 'Muted', colors: RUN_COLORS },
  { id: 'high_contrast', name: 'High Contrast', colors: HIGH_CONTRAST_COLORS },
];

// ============================================================================
// API Response Types
// ============================================================================

export interface FolderInfo {
  path: string | null;
  run_count: number;
}

// ============================================================================
// Color Utilities
// ============================================================================

export interface ColorScale {
  min: number;
  max: number;
  colors: string[];
}

export const DEFAULT_COLOR_SCALES = {};

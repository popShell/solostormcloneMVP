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
// Channel Metadata
// ============================================================================

export interface ChannelInfo {
  unit: string;
  provenance: 'measured' | 'derived';
  frame?: string | null;
}

// ============================================================================
// Folder Types
// ============================================================================

export interface FolderInfo {
  path: string | null;
  run_count: number;
}

// ============================================================================
// Visualization Types (Frontend-only)
// ============================================================================

export type ColorMode = 'speed' | 'lateral_g' | 'longitudinal_g' | 'total_g' | 'solid';

export interface VisualizationSettings {
  colorMode: ColorMode;
  showPath: boolean;
  showAccelVectors: boolean;
  accelVectorScale: number;
  pathWidth: number;
  carSize: number;
  trailLength: number; // seconds of trail to show, 0 = full path
}

export interface ViewportState {
  centerX: number;
  centerY: number;
  scale: number; // pixels per meter
  rotation: number; // degrees
}

export interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;
  playbackSpeed: number; // 0.5, 1.0, 2.0, etc.
  looping: boolean;
}

export interface RunDisplayState {
  runId: string;
  visible: boolean;
  color: string;
  data: RunData | null;
  playbackData: PlaybackData | null;
}

// ============================================================================
// Color Utilities
// ============================================================================

export interface ColorScale {
  min: number;
  max: number;
  colors: string[]; // Gradient stops
}

export const DEFAULT_COLOR_SCALES: Record<ColorMode, ColorScale> = {
  speed: {
    min: 0,
    max: 30, // m/s (~67 mph)
    colors: ['#3b82f6', '#22c55e', '#eab308', '#ef4444'], // blue -> green -> yellow -> red
  },
  lateral_g: {
    min: -1.5,
    max: 1.5,
    colors: ['#ef4444', '#fbbf24', '#22c55e', '#fbbf24', '#ef4444'], // red (left) -> green (straight) -> red (right)
  },
  longitudinal_g: {
    min: -1.0,
    max: 1.0,
    colors: ['#ef4444', '#fbbf24', '#22c55e'], // red (braking) -> yellow -> green (accel)
  },
  total_g: {
    min: 0,
    max: 2.0,
    colors: ['#22c55e', '#eab308', '#ef4444'], // green -> yellow -> red
  },
  solid: {
    min: 0,
    max: 1,
    colors: ['#3b82f6'],
  },
};

// ============================================================================
// Default Values
// ============================================================================

export const DEFAULT_VISUALIZATION_SETTINGS: VisualizationSettings = {
  colorMode: 'speed',
  showPath: true,
  showAccelVectors: false,
  accelVectorScale: 10,
  pathWidth: 3,
  carSize: 8,
  trailLength: 0, // Full path
};

export const DEFAULT_VIEWPORT: ViewportState = {
  centerX: 0,
  centerY: 0,
  scale: 5, // 5 pixels per meter
  rotation: 0,
};

export const DEFAULT_PLAYBACK: PlaybackState = {
  isPlaying: false,
  currentTime: 0,
  playbackSpeed: 1.0,
  looping: true,
};

// Run colors for multi-run display
export const RUN_COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#22c55e', // green
  '#f59e0b', // amber
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
];

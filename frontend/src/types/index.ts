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

export type ColorMode = 'speed' | 'lateral_g' | 'longitudinal_g' | 'total_g' | 'solid';

export interface VisualizationSettings {
  colorMode: ColorMode;
  showAccelerationVectors: boolean;
  showPositionMarker: boolean;
  trailLength: number; // seconds of trail to show, 0 for full
  pathWidth: number;
}

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

export const DEFAULT_COLOR_SCALES: Record<ColorMode, ColorScale> = {
  speed: {
    min: 0,
    max: 30,
    colors: ['#3b82f6', '#22c55e', '#eab308', '#ef4444'],
  },
  lateral_g: {
    min: -1.5,
    max: 1.5,
    colors: ['#ef4444', '#fbbf24', '#22c55e', '#fbbf24', '#ef4444'],
  },
  longitudinal_g: {
    min: -1.0,
    max: 1.0,
    colors: ['#ef4444', '#fbbf24', '#22c55e'],
  },
  total_g: {
    min: 0,
    max: 2.0,
    colors: ['#22c55e', '#eab308', '#ef4444'],
  },
  solid: {
    min: 0,
    max: 1,
    colors: ['#3b82f6'],
  },
};

export const RUN_COLORS = [
  '#3b82f6',
  '#ef4444',
  '#22c55e',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
];

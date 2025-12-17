/**
 * API service layer for communicating with the backend.
 */

import type {
  RunSummary,
  RunMetadata,
  RunData,
  PlaybackData,
  FolderInfo,
} from '@/types';

// Base URL - in development, Vite proxies /api to localhost:8000
const API_BASE = '/api';

/**
 * Generic API fetch wrapper with error handling.
 */
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ApiError(
      errorData.detail || `HTTP ${response.status}`,
      response.status
    );
  }

  return response.json();
}

/**
 * Custom error class for API errors.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ============================================================================
// Folder Management
// ============================================================================

/**
 * Get current data folder info.
 */
export async function getFolderInfo(): Promise<FolderInfo> {
  return apiFetch<FolderInfo>('/folder');
}

/**
 * Set the data folder path.
 */
export async function setFolder(path: string): Promise<FolderInfo> {
  return apiFetch<FolderInfo>('/folder', {
    method: 'POST',
    body: JSON.stringify({ path }),
  });
}

/**
 * Rescan the current data folder.
 */
export async function rescanFolder(): Promise<FolderInfo> {
  return apiFetch<FolderInfo>('/folder/rescan', {
    method: 'POST',
  });
}

// ============================================================================
// Run Management
// ============================================================================

/**
 * List all available runs.
 */
export async function listRuns(): Promise<RunSummary[]> {
  return apiFetch<RunSummary[]>('/runs');
}

/**
 * Get metadata for a specific run.
 */
export async function getRunMetadata(runId: string): Promise<RunMetadata> {
  return apiFetch<RunMetadata>(`/runs/${runId}`);
}

/**
 * Get full telemetry data for a run.
 */
export async function getRunData(runId: string): Promise<RunData> {
  return apiFetch<RunData>(`/runs/${runId}/data`);
}

/**
 * Reload a run with optional origin override.
 */
export async function reloadRun(
  runId: string,
  origin?: { lat?: number; lon?: number; alt?: number }
): Promise<RunMetadata> {
  return apiFetch<RunMetadata>(`/runs/${runId}/reload`, {
    method: 'POST',
    body: JSON.stringify({
      origin_lat: origin?.lat,
      origin_lon: origin?.lon,
      origin_alt: origin?.alt,
    }),
  });
}

/**
 * Get playback data for a run.
 */
export async function getPlaybackData(
  runId: string,
  options?: {
    startTime?: number;
    endTime?: number;
    targetRate?: number;
  }
): Promise<PlaybackData> {
  const params = new URLSearchParams();
  
  if (options?.startTime !== undefined) {
    params.set('start_time', options.startTime.toString());
  }
  if (options?.endTime !== undefined) {
    params.set('end_time', options.endTime.toString());
  }
  if (options?.targetRate !== undefined) {
    params.set('target_rate', options.targetRate.toString());
  }
  
  const query = params.toString();
  const endpoint = `/runs/${runId}/playback${query ? `?${query}` : ''}`;
  
  return apiFetch<PlaybackData>(endpoint);
}

// ============================================================================
// Health Check
// ============================================================================

/**
 * Check API health.
 */
export async function checkHealth(): Promise<{
  status: string;
  data_folder: string | null;
  run_count: number;
}> {
  return apiFetch('/health');
}

// ============================================================================
// Convenience Hooks Data Fetchers
// ============================================================================

/**
 * Load a run with both full data and playback data.
 */
export async function loadRunComplete(
  runId: string,
  playbackRate: number = 30
): Promise<{ data: RunData; playback: PlaybackData }> {
  const [data, playback] = await Promise.all([
    getRunData(runId),
    getPlaybackData(runId, { targetRate: playbackRate }),
  ]);
  
  return { data, playback };
}

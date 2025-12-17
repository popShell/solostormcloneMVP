/**
 * Custom hooks for telemetry data management and playback.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  RunSummary,
  RunData,
  PlaybackData,
  PlaybackState,
  PlaybackSample,
  DEFAULT_PLAYBACK,
} from '@/types';
import * as api from '@/services/api';

// ============================================================================
// useRuns - Manage run list and loading
// ============================================================================

interface UseRunsResult {
  runs: RunSummary[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useRuns(): UseRunsResult {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.listRuns();
      setRuns(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load runs');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { runs, isLoading, error, refresh };
}

// ============================================================================
// useRunData - Load and cache run data
// ============================================================================

interface LoadedRun {
  data: RunData;
  playback: PlaybackData;
}

interface UseRunDataResult {
  loadedRuns: Map<string, LoadedRun>;
  loadingRuns: Set<string>;
  loadRun: (runId: string) => Promise<void>;
  unloadRun: (runId: string) => void;
}

export function useRunData(): UseRunDataResult {
  const [loadedRuns, setLoadedRuns] = useState<Map<string, LoadedRun>>(new Map());
  const [loadingRuns, setLoadingRuns] = useState<Set<string>>(new Set());

  const loadRun = useCallback(async (runId: string) => {
    if (loadedRuns.has(runId) || loadingRuns.has(runId)) return;

    setLoadingRuns((prev) => new Set(prev).add(runId));

    try {
      const { data, playback } = await api.loadRunComplete(runId, 30);
      setLoadedRuns((prev) => {
        const next = new Map(prev);
        next.set(runId, { data, playback });
        return next;
      });
    } catch (err) {
      console.error(`Failed to load run ${runId}:`, err);
    } finally {
      setLoadingRuns((prev) => {
        const next = new Set(prev);
        next.delete(runId);
        return next;
      });
    }
  }, [loadedRuns, loadingRuns]);

  const unloadRun = useCallback((runId: string) => {
    setLoadedRuns((prev) => {
      const next = new Map(prev);
      next.delete(runId);
      return next;
    });
  }, []);

  return { loadedRuns, loadingRuns, loadRun, unloadRun };
}

// ============================================================================
// usePlayback - Manage playback state and animation
// ============================================================================

interface UsePlaybackResult {
  state: PlaybackState;
  currentSamples: Map<string, PlaybackSample>;
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  setSpeed: (speed: number) => void;
  toggleLoop: () => void;
  setState: (state: PlaybackState) => void;
}

export function usePlayback(
  loadedRuns: Map<string, LoadedRun>,
  selectedRuns: Set<string>
): UsePlaybackResult {
  const [state, setState] = useState<PlaybackState>({
    isPlaying: false,
    currentTime: 0,
    playbackSpeed: 1.0,
    looping: true,
  });

  const [currentSamples, setCurrentSamples] = useState<Map<string, PlaybackSample>>(
    new Map()
  );

  const lastFrameTime = useRef<number>(0);
  const animationRef = useRef<number | null>(null);

  // Calculate max duration across selected runs
  const maxDuration = Array.from(selectedRuns)
    .map((id) => loadedRuns.get(id)?.data.metadata.duration_s ?? 0)
    .reduce((max, d) => Math.max(max, d), 0);

  // Interpolate sample at time
  const getSampleAtTime = useCallback(
    (playback: PlaybackData, time: number): PlaybackSample => {
      const { samples } = playback;
      if (samples.length === 0) {
        return {
          time: 0,
          x: 0,
          y: 0,
          speed: 0,
          heading: 0,
          ax: 0,
          ay: 0,
          yaw_rate: 0,
          total_g: 0,
          valid: {},
        };
      }

      // Find surrounding samples
      let i = 0;
      while (i < samples.length - 1 && samples[i + 1].time < time) {
        i++;
      }

      if (i >= samples.length - 1) {
        return samples[samples.length - 1];
      }

      const s0 = samples[i];
      const s1 = samples[i + 1];
      const t = (time - s0.time) / (s1.time - s0.time || 1);

      // Linear interpolation with validity
      const x = interpolateValue(s0.x, s1.x, t, s0.valid?.x, s1.valid?.x);
      const y = interpolateValue(s0.y, s1.y, t, s0.valid?.y, s1.valid?.y);
      const speed = interpolateValue(
        s0.speed,
        s1.speed,
        t,
        s0.valid?.speed,
        s1.valid?.speed
      );
      const ax = interpolateValue(s0.ax, s1.ax, t, s0.valid?.ax, s1.valid?.ax);
      const ay = interpolateValue(s0.ay, s1.ay, t, s0.valid?.ay, s1.valid?.ay);
      const yawRate = interpolateValue(
        s0.yaw_rate,
        s1.yaw_rate,
        t,
        s0.valid?.yaw_rate,
        s1.valid?.yaw_rate
      );
      const totalG = interpolateValue(
        s0.total_g,
        s1.total_g,
        t,
        s0.valid?.total_g,
        s1.valid?.total_g
      );
      const heading = interpolateAngle(
        s0.heading,
        s1.heading,
        t,
        s0.valid?.heading,
        s1.valid?.heading
      );

      return {
        time,
        x: x.value,
        y: y.value,
        speed: speed.value,
        heading: heading.value,
        ax: ax.value,
        ay: ay.value,
        yaw_rate: yawRate.value,
        total_g: totalG.value,
        valid: {
          x: x.valid,
          y: y.valid,
          speed: speed.valid,
          heading: heading.valid,
          ax: ax.valid,
          ay: ay.valid,
          yaw_rate: yawRate.valid,
          total_g: totalG.valid,
        },
      };
    },
    []
  );

  // Update current samples when time changes
  useEffect(() => {
    const samples = new Map<string, PlaybackSample>();
    for (const runId of selectedRuns) {
      const loaded = loadedRuns.get(runId);
      if (loaded) {
        samples.set(runId, getSampleAtTime(loaded.playback, state.currentTime));
      }
    }
    setCurrentSamples(samples);
  }, [state.currentTime, loadedRuns, selectedRuns, getSampleAtTime]);

  // Animation loop
  useEffect(() => {
    if (!state.isPlaying) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    const animate = (timestamp: number) => {
      if (lastFrameTime.current === 0) {
        lastFrameTime.current = timestamp;
      }

      const deltaMs = timestamp - lastFrameTime.current;
      lastFrameTime.current = timestamp;

      const deltaS = (deltaMs / 1000) * state.playbackSpeed;
      let newTime = state.currentTime + deltaS;

      // Handle end of playback
      if (newTime >= maxDuration) {
        if (state.looping) {
          newTime = 0;
        } else {
          setState((prev) => ({ ...prev, isPlaying: false, currentTime: maxDuration }));
          return;
        }
      }

      setState((prev) => ({ ...prev, currentTime: newTime }));
      animationRef.current = requestAnimationFrame(animate);
    };

    lastFrameTime.current = 0;
    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [state.isPlaying, state.playbackSpeed, state.looping, maxDuration]);

  const play = useCallback(() => {
    setState((prev) => ({ ...prev, isPlaying: true }));
  }, []);

  const pause = useCallback(() => {
    setState((prev) => ({ ...prev, isPlaying: false }));
  }, []);

  const seek = useCallback((time: number) => {
    setState((prev) => ({ ...prev, currentTime: Math.max(0, time) }));
  }, []);

  const setSpeed = useCallback((speed: number) => {
    setState((prev) => ({ ...prev, playbackSpeed: speed }));
  }, []);

  const toggleLoop = useCallback(() => {
    setState((prev) => ({ ...prev, looping: !prev.looping }));
  }, []);

  return {
    state,
    currentSamples,
    play,
    pause,
    seek,
    setSpeed,
    toggleLoop,
    setState,
  };
}

function interpolateValue(
  v0: number,
  v1: number,
  t: number,
  valid0?: boolean,
  valid1?: boolean
): { value: number; valid: boolean } {
  const v0Valid = valid0 !== undefined ? valid0 : true;
  const v1Valid = valid1 !== undefined ? valid1 : true;

  if (!v0Valid && !v1Valid) {
    return { value: 0, valid: false };
  }
  if (v0Valid && v1Valid) {
    return { value: v0 + (v1 - v0) * t, valid: true };
  }
  if (v1Valid) {
    return { value: v1, valid: true };
  }
  return { value: v0, valid: true };
}

function interpolateAngle(
  a0: number,
  a1: number,
  t: number,
  valid0?: boolean,
  valid1?: boolean
): { value: number; valid: boolean } {
  const a0Valid = valid0 !== undefined ? valid0 : true;
  const a1Valid = valid1 !== undefined ? valid1 : true;

  if (!a0Valid && !a1Valid) {
    return { value: 0, valid: false };
  }
  if (a0Valid && a1Valid) {
    let diff = a1 - a0;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    return { value: (a0 + diff * t + 360) % 360, valid: true };
  }
  if (a1Valid) {
    return { value: (a1 + 360) % 360, valid: true };
  }
  return { value: (a0 + 360) % 360, valid: true };
}

// ============================================================================
// useViewport - Manage viewport state with fit-to-runs
// ============================================================================

import type { ViewportState } from '@/types';

interface UseViewportResult {
  viewport: ViewportState;
  setViewport: (viewport: ViewportState) => void;
  fitToRuns: (runs: RunData[]) => void;
}

export function useViewport(initialViewport: ViewportState): UseViewportResult {
  const [viewport, setViewport] = useState<ViewportState>(initialViewport);

  const fitToRuns = useCallback(
    (runs: RunData[]) => {
      if (runs.length === 0) return;

      // Calculate combined bounding box
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;

      for (const run of runs) {
        const [rMinX, rMinY, rMaxX, rMaxY] = run.metadata.bounding_box;
        minX = Math.min(minX, rMinX);
        minY = Math.min(minY, rMinY);
        maxX = Math.max(maxX, rMaxX);
        maxY = Math.max(maxY, rMaxY);
      }

      // Add padding
      const padding = 20; // meters
      minX -= padding;
      minY -= padding;
      maxX += padding;
      maxY += padding;

      // Calculate center
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;

      // Calculate scale to fit (assuming 800x600 canvas for now)
      const rangeX = maxX - minX;
      const rangeY = maxY - minY;
      const scaleX = 800 / rangeX;
      const scaleY = 600 / rangeY;
      const scale = Math.min(scaleX, scaleY) * 0.9; // 90% to leave margin

      setViewport({
        centerX,
        centerY,
        scale: Math.max(0.5, Math.min(50, scale)),
        rotation: 0,
      });
    },
    []
  );

  return { viewport, setViewport, fitToRuns };
}

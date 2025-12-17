/**
 * Custom hooks for Autocross Telemetry frontend.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import * as api from '@/services/api';
import type {
  RunSummary,
  RunData,
  PlaybackData,
  PlaybackSample,
  PlaybackState,
  ViewportState,
} from '@/types';

// ============================================================================
// useRuns - Fetch and manage run list
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
  setState: (state: PlaybackState | ((prev: PlaybackState) => PlaybackState)) => void;
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
  
  // Use refs to avoid stale closure issues in animation loop
  const playbackSpeedRef = useRef(state.playbackSpeed);
  const loopingRef = useRef(state.looping);
  const isPlayingRef = useRef(state.isPlaying);
  
  // Keep refs in sync with state
  useEffect(() => {
    playbackSpeedRef.current = state.playbackSpeed;
  }, [state.playbackSpeed]);
  
  useEffect(() => {
    loopingRef.current = state.looping;
  }, [state.looping]);
  
  useEffect(() => {
    isPlayingRef.current = state.isPlaying;
  }, [state.isPlaying]);

  // Calculate max duration across selected runs
  const maxDuration = useMemo(() => {
    const durations = Array.from(selectedRuns)
      .map((id) => loadedRuns.get(id)?.data.metadata.duration_s ?? 0);
    return Math.max(...durations, 0.1);
  }, [loadedRuns, selectedRuns]);
  
  // Use ref for maxDuration in animation loop
  const maxDurationRef = useRef(maxDuration);
  useEffect(() => {
    maxDurationRef.current = maxDuration;
  }, [maxDuration]);

  // Get sample at specific time with interpolation
  const getSampleAtTime = useCallback(
    (playback: PlaybackData, time: number): PlaybackSample => {
      const samples = playback.samples;
      if (samples.length === 0) {
        return {
          time,
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

      // Find bracketing samples
      let i0 = 0;
      let i1 = samples.length - 1;

      for (let i = 0; i < samples.length - 1; i++) {
        if (samples[i].time <= time && samples[i + 1].time >= time) {
          i0 = i;
          i1 = i + 1;
          break;
        }
      }

      const s0 = samples[i0];
      const s1 = samples[i1];

      // Clamp to bounds
      if (time <= s0.time) return s0;
      if (time >= s1.time) return s1;

      // Interpolate
      const t = (time - s0.time) / (s1.time - s0.time);

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

  // Animation loop - FIXED: removed redundant ref check, proper first-frame handling
  useEffect(() => {
    if (!state.isPlaying) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    // Animation is starting - initialize frame time
    lastFrameTime.current = 0;
    
    const animate = (timestamp: number) => {
      // First frame: just record the time, don't advance yet
      if (lastFrameTime.current === 0) {
        lastFrameTime.current = timestamp;
        // Schedule next frame immediately
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      const deltaMs = timestamp - lastFrameTime.current;
      lastFrameTime.current = timestamp;

      // Skip if no meaningful time has passed (shouldn't happen after first frame)
      if (deltaMs <= 0) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      // Use functional setState to get current state and avoid stale closure
      setState((prev) => {
        // If somehow not playing anymore, don't update
        if (!prev.isPlaying) {
          return prev;
        }
        
        // Read current values from refs (which are kept in sync)
        const speed = playbackSpeedRef.current;
        const looping = loopingRef.current;
        const duration = maxDurationRef.current;
        
        const deltaS = (deltaMs / 1000) * speed;
        let newTime = prev.currentTime + deltaS;

        // Handle end of playback
        if (newTime >= duration) {
          if (looping) {
            newTime = newTime % duration; // Wrap around smoothly
          } else {
            // Stop at end
            isPlayingRef.current = false;
            return { ...prev, isPlaying: false, currentTime: duration };
          }
        }

        return { ...prev, currentTime: newTime };
      });

      // Continue animation loop
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [state.isPlaying]); // Only depend on isPlaying - other values accessed via refs

  const play = useCallback(() => {
    isPlayingRef.current = true;
    setState((prev) => ({ ...prev, isPlaying: true }));
  }, []);

  const pause = useCallback(() => {
    isPlayingRef.current = false;
    setState((prev) => ({ ...prev, isPlaying: false }));
  }, []);

  const seek = useCallback((time: number) => {
    setState((prev) => ({ ...prev, currentTime: Math.max(0, time) }));
  }, []);

  const setSpeed = useCallback((speed: number) => {
    playbackSpeedRef.current = speed;
    setState((prev) => ({ ...prev, playbackSpeed: speed }));
  }, []);

  const toggleLoop = useCallback(() => {
    setState((prev) => {
      loopingRef.current = !prev.looping;
      return { ...prev, looping: !prev.looping };
    });
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

// ============================================================================
// useViewport - Manage canvas viewport (pan/zoom)
// ============================================================================

interface UseViewportResult {
  viewport: ViewportState;
  setViewport: (viewport: ViewportState) => void;
  fitToRuns: (runs: RunData[]) => void;
}

export function useViewport(initialViewport: ViewportState): UseViewportResult {
  const [viewport, setViewport] = useState<ViewportState>(initialViewport);

  const fitToRuns = useCallback((runs: RunData[]) => {
    if (runs.length === 0) return;

    // Calculate bounding box across all runs
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const run of runs) {
      const [runMinX, runMinY, runMaxX, runMaxY] = run.metadata.bounding_box;
      minX = Math.min(minX, runMinX);
      minY = Math.min(minY, runMinY);
      maxX = Math.max(maxX, runMaxX);
      maxY = Math.max(maxY, runMaxY);
    }

    // Add padding
    const padding = 20;
    const width = maxX - minX || 100;
    const height = maxY - minY || 100;

    // Assume a reasonable canvas size (will be adjusted by canvas component)
    const canvasWidth = 800;
    const canvasHeight = 600;

    // Calculate scale to fit
    const scaleX = (canvasWidth - padding * 2) / width;
    const scaleY = (canvasHeight - padding * 2) / height;
    const scale = Math.min(scaleX, scaleY, 50); // Cap at 50 px/m

    setViewport({
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
      scale,
      rotation: 0,
    });
  }, []);

  return { viewport, setViewport, fitToRuns };
}

// ============================================================================
// Helper functions
// ============================================================================

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
  if (!a0Valid) {
    return { value: a1, valid: true };
  }
  if (!a1Valid) {
    return { value: a0, valid: true };
  }

  // Handle angle wraparound
  let diff = a1 - a0;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;

  let result = a0 + diff * t;
  if (result < 0) result += 360;
  if (result >= 360) result -= 360;

  return { value: result, valid: true };
}

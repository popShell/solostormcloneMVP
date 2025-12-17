/**
 * App - Main application component.
 * 
 * Layout:
 * - Left sidebar: Run list
 * - Center: Track canvas with playback controls
 * - Right sidebar: Visualization settings
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { TrackCanvas } from '@/components/TrackCanvas';
import { PlaybackControls } from '@/components/PlaybackControls';
import { RunList } from '@/components/RunList';
import { VisualizationPanel } from '@/components/VisualizationPanel';
import { useRuns, useRunData, usePlayback, useViewport } from '@/hooks';
import {
  DEFAULT_VISUALIZATION_SETTINGS,
  DEFAULT_VIEWPORT,
  DEFAULT_COLOR_SCALES,
  RUN_COLORS,
} from '@/types';
import type { RunData, VisualizationSettings } from '@/types';

export const App: React.FC = () => {
  // Data hooks
  const { runs, isLoading: runsLoading, error: runsError, refresh } = useRuns();
  const { loadedRuns, loadingRuns, loadRun, unloadRun } = useRunData();

  // Selection state
  const [selectedRuns, setSelectedRuns] = useState<Set<string>>(new Set());

  // Visualization state
  const [settings, setSettings] = useState<VisualizationSettings>(
    DEFAULT_VISUALIZATION_SETTINGS
  );
  const { viewport, setViewport, fitToRuns } = useViewport(DEFAULT_VIEWPORT);

  // Playback
  const { state: playbackState, currentSamples, setState: setPlaybackState } =
    usePlayback(loadedRuns, selectedRuns);

  // Calculate max duration for playback controls
  const maxDuration = useMemo(() => {
    return Array.from(selectedRuns)
      .map((id) => loadedRuns.get(id)?.data.metadata.duration_s ?? 0)
      .reduce((max, d) => Math.max(max, d), 0);
  }, [selectedRuns, loadedRuns]);

  // Canvas size (responsive would be nice, but keeping simple for now)
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const updateSize = () => {
      const container = document.getElementById('canvas-container');
      if (container) {
        setCanvasSize({
          width: container.clientWidth,
          height: container.clientHeight,
        });
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Handlers
  const handleToggleRun = useCallback(
    (runId: string) => {
      setSelectedRuns((prev) => {
        const next = new Set(prev);
        if (next.has(runId)) {
          next.delete(runId);
        } else {
          next.add(runId);
        }
        return next;
      });
    },
    []
  );

  const handleLoadRun = useCallback(
    async (runId: string) => {
      await loadRun(runId);
      setSelectedRuns((prev) => new Set(prev).add(runId));
    },
    [loadRun]
  );

  const handleFitToRuns = useCallback(() => {
    const runsData = Array.from(selectedRuns)
      .map((id) => loadedRuns.get(id)?.data)
      .filter((d): d is RunData => d !== undefined);
    fitToRuns(runsData);
  }, [selectedRuns, loadedRuns, fitToRuns]);

  // Auto-fit when first run is loaded
  useEffect(() => {
    if (selectedRuns.size === 1) {
      const runId = Array.from(selectedRuns)[0];
      const run = loadedRuns.get(runId);
      if (run) {
        fitToRuns([run.data]);
      }
    }
  }, [selectedRuns, loadedRuns, fitToRuns]);

  // Prepare runs for canvas
  const canvasRuns = useMemo(() => {
    return runs
      .filter((r) => loadedRuns.has(r.id))
      .map((r, index) => ({
        id: r.id,
        data: loadedRuns.get(r.id)!.data,
        color: RUN_COLORS[index % RUN_COLORS.length],
        visible: selectedRuns.has(r.id),
      }));
  }, [runs, loadedRuns, selectedRuns]);

  return (
    <div style={styles.container}>
      {/* Left Sidebar - Run List */}
      <div style={styles.leftSidebar}>
        <RunList
          runs={runs}
          selectedRuns={selectedRuns}
          loadingRuns={loadingRuns}
          onToggleRun={handleToggleRun}
          onLoadRun={handleLoadRun}
          isLoading={runsLoading}
          error={runsError}
          onRefresh={refresh}
        />
      </div>

      {/* Main Content */}
      <div style={styles.main}>
        {/* Canvas Container */}
        <div id="canvas-container" style={styles.canvasContainer}>
          <TrackCanvas
            runs={canvasRuns}
            currentSamples={currentSamples}
            viewport={viewport}
            settings={settings}
            colorScales={DEFAULT_COLOR_SCALES}
            onViewportChange={setViewport}
            width={canvasSize.width}
            height={canvasSize.height}
          />
        </div>

        {/* Playback Controls */}
        <div style={styles.playbackContainer}>
          <PlaybackControls
            state={playbackState}
            duration={maxDuration || 1}
            onChange={setPlaybackState}
          />
        </div>
      </div>

      {/* Right Sidebar - Settings */}
      <div style={styles.rightSidebar}>
        <VisualizationPanel
          settings={settings}
          viewport={viewport}
          onSettingsChange={setSettings}
          onViewportChange={setViewport}
          onFitToRuns={handleFitToRuns}
        />
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    height: '100vh',
    backgroundColor: '#0a0a14',
    color: '#ffffff',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  leftSidebar: {
    width: '280px',
    flexShrink: 0,
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  canvasContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  playbackContainer: {
    padding: '12px',
    borderTop: '1px solid #2a2a4a',
  },
  rightSidebar: {
    width: '260px',
    flexShrink: 0,
  },
};

export default App;

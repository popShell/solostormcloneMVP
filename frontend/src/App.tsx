/**
 * App.tsx - Main application component for Autocross Telemetry
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { RunList } from '@/components/RunList';
import { TrackCanvas } from '@/components/TrackCanvas';
import { PlaybackControls } from '@/components/PlaybackControls';
import { VisualizationPanel } from '@/components/VisualizationPanel';
import CourseEditorPage from '@/components/CourseEditorPage';
import { useRuns, useRunData, usePlayback, useViewport } from '@/hooks';
import type { ColorMode, VisualizationSettings, ViewportState } from '@/types';

type AppView = 'telemetry' | 'course-editor';

const INITIAL_VIEWPORT: ViewportState = {
  centerX: 0,
  centerY: 0,
  scale: 5,
  rotation: 0,
};

const INITIAL_VIS_SETTINGS: VisualizationSettings = {
  colorMode: 'speed',
  showAccelerationVectors: false,
  showPositionMarker: true,
  trailLength: 0, // 0 = show full path
  pathWidth: 3,
};

export const App: React.FC = () => {
  // Current view
  const [currentView, setCurrentView] = useState<AppView>('telemetry');

  // Run management
  const { runs, isLoading, error, refresh } = useRuns();
  const { loadedRuns, loadingRuns, loadRun, unloadRun } = useRunData();
  const [selectedRuns, setSelectedRuns] = useState<Set<string>>(new Set());
  const [visibleRuns, setVisibleRuns] = useState<Set<string>>(new Set());

  // Playback
  const { state: playbackState, currentSamples, play, pause, seek, setSpeed, toggleLoop, setState: setPlaybackState } = usePlayback(
    loadedRuns,
    selectedRuns
  );

  // Viewport
  const { viewport, setViewport, fitToRuns } = useViewport(INITIAL_VIEWPORT);

  // Visualization settings
  const [visSettings, setVisSettings] = useState<VisualizationSettings>(INITIAL_VIS_SETTINGS);

  // Calculate max duration from loaded runs
  const maxDuration = useMemo(() => {
    const durations = Array.from(selectedRuns)
      .map((id) => loadedRuns.get(id)?.data.metadata.duration_s ?? 0);
    return Math.max(...durations, 0.1);
  }, [loadedRuns, selectedRuns]);

  // Handle run selection toggle
  const handleRunToggle = useCallback(
    async (runId: string, selected: boolean) => {
      if (selected) {
        // Load and select
        await loadRun(runId);
        setSelectedRuns((prev) => new Set(prev).add(runId));
        setVisibleRuns((prev) => new Set(prev).add(runId));
      } else {
        // Unselect (keep loaded for quick re-select)
        setSelectedRuns((prev) => {
          const next = new Set(prev);
          next.delete(runId);
          return next;
        });
        setVisibleRuns((prev) => {
          const next = new Set(prev);
          next.delete(runId);
          return next;
        });
      }
    },
    [loadRun]
  );

  // Handle visibility toggle (different from selection)
  const handleVisibilityToggle = useCallback((runId: string, visible: boolean) => {
    setVisibleRuns((prev) => {
      const next = new Set(prev);
      if (visible) {
        next.add(runId);
      } else {
        next.delete(runId);
      }
      return next;
    });
  }, []);

  // Fit to selected runs when selection changes
  useEffect(() => {
    const runsToFit = Array.from(selectedRuns)
      .map((id) => loadedRuns.get(id)?.data)
      .filter((d): d is NonNullable<typeof d> => d !== undefined);

    if (runsToFit.length > 0) {
      fitToRuns(runsToFit);
    }
  }, [selectedRuns, loadedRuns, fitToRuns]);

  // Get visible run data for rendering
  const visibleRunData = useMemo(() => {
    return Array.from(visibleRuns)
      .map((id) => {
        const loaded = loadedRuns.get(id);
        if (!loaded) return null;
        return {
          id,
          data: loaded.data,
          playback: loaded.playback,
          sample: currentSamples.get(id),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
  }, [visibleRuns, loadedRuns, currentSamples]);

  // Handle color mode change
  const handleColorModeChange = useCallback((mode: ColorMode) => {
    setVisSettings((prev) => ({ ...prev, colorMode: mode }));
  }, []);

  // Handle fit to runs button
  const handleFitToRuns = useCallback(() => {
    const runsToFit = Array.from(selectedRuns)
      .map((id) => loadedRuns.get(id)?.data)
      .filter((d): d is NonNullable<typeof d> => d !== undefined);
    
    if (runsToFit.length > 0) {
      fitToRuns(runsToFit);
    }
  }, [selectedRuns, loadedRuns, fitToRuns]);

  // Render telemetry view
  const renderTelemetryView = () => (
    <div style={styles.appContent}>
      {/* Left Sidebar - Run List */}
      <div style={styles.sidebar}>
        <RunList
          runs={runs}
          selectedRuns={selectedRuns}
          visibleRuns={visibleRuns}
          loadingRuns={loadingRuns}
          isLoading={isLoading}
          error={error}
          onRunToggle={handleRunToggle}
          onVisibilityToggle={handleVisibilityToggle}
          onRefresh={refresh}
        />
      </div>

      {/* Main Content */}
      <div style={styles.main}>
        {/* Canvas */}
        <div style={styles.canvasContainer}>
          <TrackCanvas
            runs={visibleRunData}
            viewport={viewport}
            onViewportChange={setViewport}
            settings={visSettings}
            currentTime={playbackState.currentTime}
          />
        </div>

        {/* Playback Controls */}
        <div style={styles.controls}>
          <PlaybackControls
            state={playbackState}
            duration={maxDuration}
            onChange={setPlaybackState}
          />
        </div>
      </div>

      {/* Right Sidebar - Visualization Settings */}
      <div style={styles.rightSidebar}>
        <VisualizationPanel
          settings={visSettings}
          onSettingsChange={setVisSettings}
          onFitToRuns={handleFitToRuns}
          hasRuns={selectedRuns.size > 0}
        />
      </div>
    </div>
  );

  return (
    <div style={styles.container}>
      {/* Navigation Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.logo}>🏎️</span>
          <h1 style={styles.title}>Autocross Telemetry</h1>
        </div>
        <nav style={styles.nav}>
          <button
            style={{
              ...styles.navButton,
              ...(currentView === 'telemetry' ? styles.navButtonActive : {}),
            }}
            onClick={() => setCurrentView('telemetry')}
          >
            📊 Telemetry
          </button>
          <button
            style={{
              ...styles.navButton,
              ...(currentView === 'course-editor' ? styles.navButtonActive : {}),
            }}
            onClick={() => setCurrentView('course-editor')}
          >
            🚧 Course Editor
          </button>
        </nav>
      </header>

      {/* View Content */}
      {currentView === 'telemetry' ? renderTelemetryView() : <CourseEditorPage />}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    backgroundColor: '#0a0a1a',
    color: '#ffffff',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px',
    height: '56px',
    backgroundColor: '#12122a',
    borderBottom: '1px solid #2a2a4a',
    flexShrink: 0,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  logo: {
    fontSize: '24px',
  },
  title: {
    fontSize: '18px',
    fontWeight: 600,
    margin: 0,
  },
  nav: {
    display: 'flex',
    gap: '8px',
  },
  navButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#aaa',
    backgroundColor: 'transparent',
    border: '1px solid transparent',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  navButtonActive: {
    color: '#fff',
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  appContent: {
    display: 'flex',
    flex: 1,
    minHeight: 0,
  },
  sidebar: {
    width: '280px',
    backgroundColor: '#12122a',
    borderRight: '1px solid #2a2a4a',
    overflow: 'auto',
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  canvasContainer: {
    flex: 1,
    position: 'relative',
    minHeight: 0,
  },
  controls: {
    padding: '12px',
    backgroundColor: '#0a0a1a',
    borderTop: '1px solid #2a2a4a',
  },
  rightSidebar: {
    width: '240px',
    backgroundColor: '#12122a',
    borderLeft: '1px solid #2a2a4a',
    overflow: 'auto',
  },
};

export default App;

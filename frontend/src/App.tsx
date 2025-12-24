/**
 * App.tsx - Main application component for Autocross Telemetry
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { RunList } from '@/components/RunList';
import { TrackCanvas } from '@/components/TrackCanvas';
import { PlaybackControls } from '@/components/PlaybackControls';
import { VisualizationPanel } from '@/components/VisualizationPanel';
import CourseEditorPage from '@/components/CourseEditorPage';
import { PlaybackTelemetryInspector } from '@/components/PlaybackTelemetryInspector';
import { SectorInspector } from '@/components/SectorInspector';
import { useRuns, useRunData, usePlayback, useViewport } from '@/hooks';
import type {
  DisplayUnits,
  VisualizationSettings,
  ViewportState,
  MapOverlaySettings,
  MarkerMode,
  TrackMarker,
  SectorMarker,
} from '@/types';
import { RUN_COLOR_PALETTES } from '@/types';

type AppView = 'telemetry' | 'course-editor';

const THEME_VARS: React.CSSProperties = {
  ['--bg' as any]: '#0f1115',
  ['--surface' as any]: '#151922',
  ['--surface2' as any]: '#1b2230',
  ['--border' as any]: '#2b3242',
  ['--text' as any]: '#e5e7eb',
  ['--muted' as any]: '#9aa3b2',
  ['--accent' as any]: '#4fb3a6',
  ['--accent2' as any]: '#d6b36b',
  ['--danger' as any]: '#d16d6d',
} as React.CSSProperties;

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

const INITIAL_DISPLAY_UNITS: DisplayUnits = {
  speed: 'mph',
  yawRate: 'deg_s',
};

const INITIAL_MAP_SETTINGS: MapOverlaySettings = {
  enabled: false,
  zoom: 17,
  masterRunId: undefined,
  provider: 'sat',
};

export const App: React.FC = () => {
  // Current view
  const [currentView, setCurrentView] = useState<AppView>('telemetry');

  // Run management
  const { runs, isLoading, error, refresh } = useRuns();
  const { loadedRuns, loadingRuns, loadRun } = useRunData();
  const [selectedRuns, setSelectedRuns] = useState<Set<string>>(new Set());
  const [visibleRuns, setVisibleRuns] = useState<Set<string>>(new Set());

  // Playback
  const { state: playbackState, currentSamples, setState: setPlaybackState } = usePlayback(
    loadedRuns,
    selectedRuns
  );

  // Viewport
  const { viewport, setViewport, fitToRuns } = useViewport(INITIAL_VIEWPORT);

  // Visualization settings
  const [visSettings, setVisSettings] = useState<VisualizationSettings>(INITIAL_VIS_SETTINGS);
  const [displayUnits, setDisplayUnits] = useState<DisplayUnits>(INITIAL_DISPLAY_UNITS);
  const [mapSettings, setMapSettings] = useState<MapOverlaySettings>(INITIAL_MAP_SETTINGS);
  const [markerMode, setMarkerMode] = useState<MarkerMode>('none');
  const [startMarker, setStartMarker] = useState<TrackMarker | null>(null);
  const [finishMarker, setFinishMarker] = useState<TrackMarker | null>(null);
  const [sectors, setSectors] = useState<SectorMarker[]>([]);
  const [colorPaletteId, setColorPaletteId] = useState<string>('high_contrast');
  const [startAngleDeg, setStartAngleDeg] = useState<number>(0);
  const [finishAngleDeg, setFinishAngleDeg] = useState<number>(0);
  const [displayNames, setDisplayNames] = useState<Record<string, string>>({});

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

  // Determine master run for anchoring/map overlay
  const masterRunData = useMemo(() => {
    if (mapSettings.masterRunId) {
      const loaded = loadedRuns.get(mapSettings.masterRunId);
      if (loaded) return loaded.data;
    }
    const fallbackId = Array.from(selectedRuns)[0];
    return fallbackId ? loadedRuns.get(fallbackId)?.data : undefined;
  }, [mapSettings.masterRunId, loadedRuns, selectedRuns]);

  const currentPalette =
    RUN_COLOR_PALETTES.find((p) => p.id === colorPaletteId)?.colors ||
    RUN_COLOR_PALETTES[0].colors;

  // Handle marker placement clicks
  const handleWorldClick = useCallback(
    (pt: { x: number; y: number }) => {
      if (markerMode === 'set_start') {
        setStartMarker({ x: pt.x, y: pt.y, label: 'Start', angleDeg: startAngleDeg });
        setMarkerMode('none');
      } else if (markerMode === 'set_finish') {
        setFinishMarker({ x: pt.x, y: pt.y, label: 'Finish', angleDeg: finishAngleDeg });
        setMarkerMode('none');
      } else if (markerMode === 'add_sector') {
        setSectors((prev) => [
          ...prev,
          { id: prev.length + 1, x: pt.x, y: pt.y, label: `S${prev.length + 1}` },
        ]);
        setMarkerMode('none');
      }
    },
    [markerMode]
  );

  const clearMarkers = useCallback(() => {
    setStartMarker(null);
    setFinishMarker(null);
    setStartAngleDeg(0);
    setFinishAngleDeg(0);
    setSectors([]);
  }, []);

  const clearSectors = useCallback(() => setSectors([]), []);

  // keep marker angles in sync with sliders
  useEffect(() => {
    setStartMarker((prev) => (prev ? { ...prev, angleDeg: startAngleDeg } : prev));
  }, [startAngleDeg]);
  useEffect(() => {
    setFinishMarker((prev) => (prev ? { ...prev, angleDeg: finishAngleDeg } : prev));
  }, [finishAngleDeg]);

  // Compute rough sector times using playback samples (nearest point to marker order)
  const sectorResults = useMemo(() => {
    const markers: TrackMarker[] = [];
    if (startMarker) markers.push(startMarker);
    markers.push(...sectors);
    if (finishMarker) markers.push(finishMarker);
    if (markers.length < 2) return [];

    const results: {
      runId: string;
      name: string;
      splits: (number | null)[];
      total: number | null;
    }[] = [];

    visibleRunData.forEach((run, idx) => {
      const samples = run.playback?.samples || [];
      if (!samples.length) return;
      const times: number[] = [];
      markers.forEach((m) => {
        let bestDist = Number.POSITIVE_INFINITY;
        let bestTime = NaN;
        for (const s of samples) {
          const dx = s.x - m.x;
          const dy = s.y - m.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < bestDist) {
            bestDist = d2;
            bestTime = s.time;
          }
        }
        times.push(Number.isFinite(bestTime) ? bestTime : NaN);
      });

      const splits = times.map((t, i) =>
        i === 0 || !Number.isFinite(t) || !Number.isFinite(times[i - 1])
          ? null
          : t - times[i - 1]
      );

      results.push({
        runId: run.id,
        name: displayNames[run.id] || run.data.metadata.name,
        splits,
        total:
          Number.isFinite(times[0]) && Number.isFinite(times[times.length - 1])
            ? times[times.length - 1] - times[0]
            : null,
      });
    });

    return results;
  }, [visibleRunData, startMarker, finishMarker, sectors, displayNames]);

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
          displayNames={displayNames}
          onRename={(id, name) =>
            setDisplayNames((prev) => ({ ...prev, [id]: name || runs.find((r) => r.id === id)?.name || id }))
          }
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
            mapOverlay={mapSettings}
            masterRun={masterRunData}
            markerMode={markerMode}
            onWorldClick={handleWorldClick}
            startLine={startMarker}
            finishLine={finishMarker}
            sectors={sectors}
            runColors={currentPalette}
          />
          <PlaybackTelemetryInspector
            runs={visibleRunData.map((r, idx) => ({
              id: r.id,
              color: currentPalette[idx % currentPalette.length],
              data: r.data,
              sample: r.sample,
              nameOverride: displayNames[r.id],
            }))}
            units={displayUnits}
          />
          <SectorInspector
            results={sectorResults}
            sectors={sectors}
            runColors={currentPalette}
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
          units={displayUnits}
          onUnitsChange={setDisplayUnits}
          runs={runs}
          loadedRuns={loadedRuns}
          selectedRuns={selectedRuns}
          mapSettings={mapSettings}
          onMapSettingsChange={setMapSettings}
          markerMode={markerMode}
          onMarkerModeChange={setMarkerMode}
          startMarker={startMarker}
          finishMarker={finishMarker}
          sectors={sectors}
          onClearMarkers={clearMarkers}
          onClearSectors={clearSectors}
          colorPaletteId={colorPaletteId}
          onColorPaletteChange={setColorPaletteId}
          startAngleDeg={startAngleDeg}
          finishAngleDeg={finishAngleDeg}
          onStartAngleChange={setStartAngleDeg}
          onFinishAngleChange={setFinishAngleDeg}
        />
      </div>
    </div>
  );

  return (
    <div style={{ ...THEME_VARS, ...styles.container }}>
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
    backgroundColor: 'var(--bg)',
    color: 'var(--text)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px',
    height: '56px',
    backgroundColor: 'var(--surface)',
    borderBottom: '1px solid var(--border)',
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
    color: 'var(--muted)',
    backgroundColor: 'transparent',
    border: '1px solid transparent',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  navButtonActive: {
    color: 'var(--bg)',
    backgroundColor: 'var(--accent)',
    borderColor: 'var(--accent)',
  },
  appContent: {
    display: 'flex',
    flex: 1,
    minHeight: 0,
  },
  sidebar: {
    width: '280px',
    backgroundColor: 'var(--surface)',
    borderRight: '1px solid var(--border)',
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
    backgroundColor: 'var(--bg)',
    borderTop: '1px solid var(--border)',
  },
  rightSidebar: {
    width: '240px',
    backgroundColor: 'var(--surface)',
    borderLeft: '1px solid var(--border)',
    overflow: 'auto',
  },
};

export default App;

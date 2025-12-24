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
  showPositionMarker: true,
  trailLength: 0, // 0 = show full path
  pathWidth: 3,
  followMode: 'manual',
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
  const PERSIST_KEY = 'telemetry_ui_state_v1';

  // Load persisted UI state
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PERSIST_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.mapSettings) setMapSettings(saved.mapSettings);
      if (saved.startMarker) setStartMarker(saved.startMarker);
      if (saved.finishMarker) setFinishMarker(saved.finishMarker);
      if (saved.sectors) setSectors(saved.sectors);
      if (saved.colorPaletteId) setColorPaletteId(saved.colorPaletteId);
      if (typeof saved.startAngleDeg === 'number') setStartAngleDeg(saved.startAngleDeg);
      if (typeof saved.finishAngleDeg === 'number') setFinishAngleDeg(saved.finishAngleDeg);
      if (saved.displayNames) setDisplayNames(saved.displayNames);
    } catch (e) {
      console.warn('Failed to load persisted UI state', e);
    }
  }, []);

  // Persist UI state when key pieces change
  useEffect(() => {
    const payload = {
      mapSettings,
      startMarker,
      finishMarker,
      sectors,
      colorPaletteId,
      startAngleDeg,
      finishAngleDeg,
      displayNames,
    };
    localStorage.setItem(PERSIST_KEY, JSON.stringify(payload));
  }, [
    mapSettings,
    startMarker,
    finishMarker,
    sectors,
    colorPaletteId,
    startAngleDeg,
    finishAngleDeg,
    displayNames,
  ]);

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

  // Fit to selected runs when selection changes
  useEffect(() => {
    const runsToFit = Array.from(selectedRuns)
      .map((id) => loadedRuns.get(id)?.data)
      .filter((d): d is NonNullable<typeof d> => d !== undefined);

    if (runsToFit.length > 0 && visSettings.followMode === 'manual') {
      fitToRuns(runsToFit);
    }
  }, [selectedRuns, loadedRuns, fitToRuns, visSettings.followMode]);

  // Auto-center camera on mean position excluding outliers (2 std dev)
  useEffect(() => {
    if (visSettings.followMode !== 'auto_center') return;
    const points: { x: number; y: number }[] = [];
    visibleRunData.forEach((r) => {
      if (!r.sample) return;
      points.push({ x: r.sample.x, y: r.sample.y });
    });
    if (points.length === 0) return;
    const meanX = points.reduce((s, p) => s + p.x, 0) / points.length;
    const meanY = points.reduce((s, p) => s + p.y, 0) / points.length;
    const dists = points.map((p) => Math.hypot(p.x - meanX, p.y - meanY));
    const meanD = dists.reduce((s, d) => s + d, 0) / dists.length;
    const stdD = Math.sqrt(dists.reduce((s, d) => s + (d - meanD) ** 2, 0) / dists.length);
    const filtered = points.filter((p, i) => dists[i] <= meanD + 2 * stdD);
    const fx =
      filtered.reduce((s, p) => s + p.x, 0) / (filtered.length || 1);
    const fy =
      filtered.reduce((s, p) => s + p.y, 0) / (filtered.length || 1);
    setViewport((v) => ({ ...v, centerX: fx, centerY: fy }));
  }, [visibleRunData, visSettings.followMode, setViewport]);

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

  // Keyboard shortcuts for quick marker placement
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 's') {
        setMarkerMode((m) => (m === 'set_start' ? 'none' : 'set_start'));
      } else if (e.key.toLowerCase() === 'f') {
        setMarkerMode((m) => (m === 'set_finish' ? 'none' : 'set_finish'));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

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
      markers.forEach((m, idxMarker) => {
        const prev = idxMarker === 0 ? null : markers[idxMarker - 1];
        const tCross = getCrossingTime(samples, m, prev);
        times.push(tCross ?? NaN);
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

  // Fastest split display per run (using total time)
  const fastestTotal = useMemo(() => {
    const totals = sectorResults.map((r) => r.total).filter((t): t is number => Number.isFinite(t));
    if (!totals.length) return null;
    return Math.min(...totals);
  }, [sectorResults]);

// Utility: precise gate crossing using line intersection
function getCrossingTime(samples: any[], marker: TrackMarker, prev: TrackMarker | null): number | null {
  if (!samples.length) return null;
  const gateLen = 6.096; // 20 ft
  const angle = ((marker.angleDeg ?? 0) * Math.PI) / 180;
  const dx = Math.cos(angle) * (gateLen / 2);
  const dy = Math.sin(angle) * (gateLen / 2);
  const g1 = { x: marker.x - dx, y: marker.y - dy };
  const g2 = { x: marker.x + dx, y: marker.y + dy };

  for (let i = 0; i < samples.length - 1; i++) {
    const s0 = samples[i];
    const s1 = samples[i + 1];
    if (!Number.isFinite(s0.x) || !Number.isFinite(s0.y) || !Number.isFinite(s1.x) || !Number.isFinite(s1.y)) {
      continue;
    }
    const inter = segmentIntersection(
      { x: s0.x, y: s0.y },
      { x: s1.x, y: s1.y },
      g1,
      g2
    );
    if (inter) {
      const segDx = s1.x - s0.x;
      const segDy = s1.y - s0.y;
      const len2 = segDx * segDx + segDy * segDy || 1;
      const t = ((inter.x - s0.x) * segDx + (inter.y - s0.y) * segDy) / len2;
      const time = s0.time + t * (s1.time - s0.time);
      return time;
    }
  }
  // fallback: closest point
  let best = Number.POSITIVE_INFINITY;
  let bestTime = null;
  for (const s of samples) {
    const dist2 = pointSegDist2({ x: s.x, y: s.y }, g1, g2);
    if (dist2 < best) {
      best = dist2;
      bestTime = s.time;
    }
  }
  return bestTime;
}

function segmentIntersection(p1: any, p2: any, p3: any, p4: any) {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-9) return null;
  const ua = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / d;
  const ub = ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / d;
  if (ua < 0 || ua > 1 || ub < 0 || ub > 1) return null;
  return {
    x: p1.x + ua * (p2.x - p1.x),
    y: p1.y + ua * (p2.y - p1.y),
  };
}

function pointSegDist2(p: any, a: any, b: any) {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const wx = p.x - a.x;
  const wy = p.y - a.y;
  const c1 = vx * wx + vy * wy;
  if (c1 <= 0) return (p.x - a.x) ** 2 + (p.y - a.y) ** 2;
  const c2 = vx * vx + vy * vy;
  if (c2 <= c1) return (p.x - b.x) ** 2 + (p.y - b.y) ** 2;
  const t = c1 / c2;
  const projx = a.x + t * vx;
  const projy = a.y + t * vy;
  return (p.x - projx) ** 2 + (p.y - projy) ** 2;
}

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
              splitDisplay:
                sectorResults.find((sr) => sr.runId === r.id)?.total != null
                  ? `${sectorResults.find((sr) => sr.runId === r.id)!.total!.toFixed(2)} s`
                  : undefined,
              isFastest:
                fastestTotal != null &&
                sectorResults.find((sr) => sr.runId === r.id)?.total === fastestTotal,
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
          <div style={styles.logo} />
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
            Telemetry
          </button>
          <button
            style={{
              ...styles.navButton,
              ...(currentView === 'course-editor' ? styles.navButtonActive : {}),
            }}
            onClick={() => setCurrentView('course-editor')}
          >
            Course Editor
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

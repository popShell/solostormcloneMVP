/**
 * VisualizationPanel - Settings panel for visualization options.
 * This is a stub component - the full implementation should come from GitHub.
 */

import React, { useState } from 'react';
import type {
  VisualizationSettings,
  ColorMode,
  DisplayUnits,
  SpeedUnit,
  YawRateUnit,
  MapOverlaySettings,
  RunSummary,
  RunData,
  MarkerMode,
  TrackMarker,
  SectorMarker,
} from '@/types';
import { RUN_COLOR_PALETTES } from '@/types';

interface VisualizationPanelProps {
  settings: VisualizationSettings;
  onSettingsChange: (settings: VisualizationSettings) => void;
  onFitToRuns: () => void;
  hasRuns: boolean;
  units: DisplayUnits;
  onUnitsChange: (units: DisplayUnits) => void;
  runs: RunSummary[];
  loadedRuns: Map<string, { data: RunData }>;
  selectedRuns: Set<string>;
  mapSettings: MapOverlaySettings;
  onMapSettingsChange: (settings: MapOverlaySettings) => void;
  markerMode: MarkerMode;
  onMarkerModeChange: (mode: MarkerMode) => void;
  startMarker: TrackMarker | null;
  finishMarker: TrackMarker | null;
  sectors: SectorMarker[];
  onClearMarkers: () => void;
  onClearSectors: () => void;
  colorPaletteId: string;
  onColorPaletteChange: (id: string) => void;
  startAngleDeg: number;
  finishAngleDeg: number;
  onStartAngleChange: (deg: number) => void;
  onFinishAngleChange: (deg: number) => void;
}

const COLOR_MODES: { value: ColorMode; label: string }[] = [
  { value: 'speed', label: 'Speed' },
  { value: 'lateral_g', label: 'Lateral G' },
  { value: 'longitudinal_g', label: 'Long. G' },
  { value: 'total_g', label: 'Total G' },
  { value: 'solid', label: 'Solid' },
];

export const VisualizationPanel: React.FC<VisualizationPanelProps> = ({
  settings,
  onSettingsChange,
  onFitToRuns,
  hasRuns,
  units,
  onUnitsChange,
  runs,
  loadedRuns,
  selectedRuns,
  mapSettings,
  onMapSettingsChange,
  markerMode,
  onMarkerModeChange,
  startMarker,
  finishMarker,
  sectors,
  onClearMarkers,
  onClearSectors,
  colorPaletteId,
  onColorPaletteChange,
  startAngleDeg,
  finishAngleDeg,
  onStartAngleChange,
  onFinishAngleChange,
}) => {
  const [tab, setTab] = useState<'viz' | 'settings'>('viz');

  const handleColorModeChange = (mode: ColorMode) => {
    onSettingsChange({ ...settings, colorMode: mode });
  };

  return (
    <div style={styles.container}>
      <div style={styles.tabRow}>
        <button
          onClick={() => setTab('viz')}
          style={{
            ...styles.tabButton,
            ...(tab === 'viz' ? styles.tabButtonActive : {}),
          }}
        >
          Visualization
        </button>
        <button
          onClick={() => setTab('settings')}
          style={{
            ...styles.tabButton,
            ...(tab === 'settings' ? styles.tabButtonActive : {}),
          }}
        >
          Settings
        </button>
      </div>

      {tab === 'viz' ? (
        <>
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Color Mode</h3>
            <div style={styles.buttonGroup}>
              {COLOR_MODES.map((mode) => (
                <button
                  key={mode.value}
                  onClick={() => handleColorModeChange(mode.value)}
                  style={{
                    ...styles.modeButton,
                    backgroundColor: settings.colorMode === mode.value ? 'var(--accent)' : 'var(--surface2)',
                    color: settings.colorMode === mode.value ? 'var(--bg)' : 'var(--text)',
                  }}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Display</h3>
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={settings.showAccelerationVectors}
                onChange={() =>
                  onSettingsChange({
                    ...settings,
                    showAccelerationVectors: !settings.showAccelerationVectors,
                  })
                }
              />
              Show Accel Vectors
            </label>

            <div style={styles.sliderRow}>
              <span>Path Width</span>
              <input
                type="range"
                min={1}
                max={10}
                value={settings.pathWidth}
                onChange={(e) =>
                  onSettingsChange({ ...settings, pathWidth: parseInt(e.target.value) })
                }
              />
              <input
                type="number"
                min={1}
                max={10}
                value={settings.pathWidth}
                onChange={(e) =>
                  onSettingsChange({
                    ...settings,
                    pathWidth: Math.max(1, Math.min(10, parseInt(e.target.value || '1', 10))),
                  })
                }
                style={styles.numberInput}
              />
            </div>
          </div>

          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>View</h3>
            <button onClick={onFitToRuns} style={styles.fitButton} disabled={!hasRuns}>
              Fit to Runs
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Units</h3>

            <div style={styles.settingsGroup}>
              <div style={styles.settingsLabel}>Speed</div>
              <div style={styles.inlineButtons}>
                {(['mph', 'kph', 'mps'] as SpeedUnit[]).map((u) => (
                  <button
                    key={u}
                    onClick={() => onUnitsChange({ ...units, speed: u })}
                    style={{
                      ...styles.smallButton,
                      backgroundColor: units.speed === u ? 'var(--accent)' : 'var(--surface2)',
                      color: units.speed === u ? 'var(--bg)' : 'var(--text)',
                    }}
                  >
                    {u.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div style={styles.settingsGroup}>
              <div style={styles.settingsLabel}>Yaw Rate</div>
              <div style={styles.inlineButtons}>
                {(
                  [
                    { value: 'deg_s', label: 'deg/s' },
                    { value: 'rad_s', label: 'rad/s' },
                  ] as Array<{ value: YawRateUnit; label: string }>
                ).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => onUnitsChange({ ...units, yawRate: opt.value })}
                    style={{
                      ...styles.smallButton,
                      backgroundColor: units.yawRate === opt.value ? 'var(--accent)' : 'var(--surface2)',
                      color: units.yawRate === opt.value ? 'var(--bg)' : 'var(--text)',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Map Overlay</h3>
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={mapSettings.enabled}
                onChange={() =>
                  onMapSettingsChange({
                    ...mapSettings,
                    enabled: !mapSettings.enabled,
                  })
                }
              />
              Show satellite / map background (OSM tile)
            </label>

            <div style={styles.settingsGroup}>
              <div style={styles.settingsLabel}>Provider</div>
              <select
                value={mapSettings.provider || 'sat'}
                onChange={(e) =>
                  onMapSettingsChange({
                    ...mapSettings,
                    provider: e.target.value as 'osm' | 'sat',
                  })
                }
                style={styles.select}
              >
                <option value="sat">Satellite</option>
                <option value="osm">Street Map</option>
              </select>
            </div>

            <div style={styles.settingsGroup}>
              <div style={styles.settingsLabel}>Master Run (anchor)</div>
              <select
                value={mapSettings.masterRunId || ''}
                onChange={(e) =>
                  onMapSettingsChange({
                    ...mapSettings,
                    masterRunId: e.target.value || undefined,
                  })
                }
                style={styles.select}
              >
                <option value="">First selected</option>
                {Array.from(selectedRuns).map((id) => {
                  const meta = loadedRuns.get(id)?.data?.metadata;
                  const label =
                    runs.find((r) => r.id === id)?.name || meta?.name || id;
                  return (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </div>

            <div style={{ ...styles.sliderRow, marginTop: 8 }}>
              <span>Zoom</span>
              <input
                type="range"
                min={15}
                max={19}
                value={mapSettings.zoom}
                onChange={(e) =>
                  onMapSettingsChange({
                    ...mapSettings,
                    zoom: parseInt(e.target.value, 10),
                  })
                }
              />
              <input
                type="number"
                min={15}
                max={19}
                value={mapSettings.zoom}
                onChange={(e) =>
                  onMapSettingsChange({
                    ...mapSettings,
                    zoom: Math.max(15, Math.min(19, parseInt(e.target.value || '15', 10))),
                  })
                }
                style={styles.numberInput}
              />
            </div>
          </div>

          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Markers & Sectors</h3>
            <div style={styles.inlineButtons}>
              <button
                style={{
                  ...styles.smallButton,
                  backgroundColor: markerMode === 'set_start' ? 'var(--accent)' : 'var(--surface2)',
                }}
                onClick={() => onMarkerModeChange(markerMode === 'set_start' ? 'none' : 'set_start')}
              >
                Set Start
              </button>
              <button
                style={{
                  ...styles.smallButton,
                  backgroundColor: markerMode === 'set_finish' ? 'var(--accent)' : 'var(--surface2)',
                }}
                onClick={() => onMarkerModeChange(markerMode === 'set_finish' ? 'none' : 'set_finish')}
              >
                Set Finish
              </button>
              <button
                style={{
                  ...styles.smallButton,
                  backgroundColor: markerMode === 'add_sector' ? 'var(--accent)' : 'var(--surface2)',
                }}
                onClick={() => onMarkerModeChange(markerMode === 'add_sector' ? 'none' : 'add_sector')}
              >
                Add Sector
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button style={styles.smallButton} onClick={onClearMarkers}>Clear Start/Finish</button>
              <button style={styles.smallButton} onClick={onClearSectors}>Clear Sectors</button>
            </div>

            <div style={styles.sliderRow}>
              <span>Start Angle</span>
              <input
                type="range"
                min={-180}
                max={180}
                step={1}
                value={startAngleDeg}
                onChange={(e) => onStartAngleChange(parseInt(e.target.value, 10))}
              />
              <input
                type="number"
                min={-180}
                max={180}
                step={1}
                value={startAngleDeg}
                onChange={(e) =>
                  onStartAngleChange(
                    Math.max(-180, Math.min(180, parseInt(e.target.value || '0', 10)))
                  )
                }
                style={styles.numberInput}
              />
            </div>

            <div style={styles.sliderRow}>
              <span>Finish Angle</span>
              <input
                type="range"
                min={-180}
                max={180}
                step={1}
                value={finishAngleDeg}
                onChange={(e) => onFinishAngleChange(parseInt(e.target.value, 10))}
              />
              <input
                type="number"
                min={-180}
                max={180}
                step={1}
                value={finishAngleDeg}
                onChange={(e) =>
                  onFinishAngleChange(
                    Math.max(-180, Math.min(180, parseInt(e.target.value || '0', 10)))
                  )
                }
                style={styles.numberInput}
              />
            </div>

            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
              Click on the track to place markers. Start is the timing zero; sectors split relative to the previous marker.
            </div>

            {sectors.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text)' }}>
                Sectors: {sectors.map((s) => s.label || s.id).join(', ')}
              </div>
            )}
          </div>

          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Run Colors</h3>
            <div style={styles.buttonGroup}>
              {RUN_COLOR_PALETTES.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onColorPaletteChange(p.id)}
                  style={{
                    ...styles.modeButton,
                    backgroundColor: colorPaletteId === p.id ? 'var(--accent)' : 'var(--surface2)',
                    color: colorPaletteId === p.id ? 'var(--bg)' : 'var(--text)',
                  }}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '16px',
    height: '100%',
    overflowY: 'auto',
    overflowX: 'hidden',
  },
  tabRow: {
    display: 'flex',
    gap: 8,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    padding: '10px 12px',
    fontSize: '13px',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    backgroundColor: 'transparent',
    color: 'var(--muted)',
    cursor: 'pointer',
  },
  tabButtonActive: {
    backgroundColor: 'var(--accent)',
    borderColor: 'var(--accent)',
    color: 'var(--bg)',
  },
  section: {
    marginBottom: '24px',
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--muted)',
    marginBottom: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  buttonGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  modeButton: {
    padding: '8px 12px',
    fontSize: '13px',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    cursor: 'pointer',
    textAlign: 'left',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    marginBottom: '8px',
    cursor: 'pointer',
  },
  sliderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    marginBottom: '8px',
    flexWrap: 'wrap',
  },
  fitButton: {
    width: '100%',
    padding: '10px',
    fontSize: '14px',
    fontWeight: 500,
    backgroundColor: 'var(--accent)',
    color: 'var(--bg)',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  settingsGroup: {
    marginTop: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  settingsLabel: {
    fontSize: 12,
    color: '#9ca3af',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inlineButtons: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  smallButton: {
    padding: '8px 10px',
    fontSize: 12,
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
  },
  select: {
    width: '100%',
    padding: '8px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    backgroundColor: 'var(--surface2)',
    color: 'var(--text)',
  },
  numberInput: {
    width: 68,
    padding: '6px 8px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    backgroundColor: 'var(--surface2)',
    color: 'var(--text)',
  },
};

export default VisualizationPanel;

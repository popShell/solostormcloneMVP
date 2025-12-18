/**
 * VisualizationPanel - Settings panel for visualization options.
 * This is a stub component - the full implementation should come from GitHub.
 */

import React, { useState } from 'react';
import type { VisualizationSettings, ColorMode, DisplayUnits, SpeedUnit, YawRateUnit } from '@/types';

interface VisualizationPanelProps {
  settings: VisualizationSettings;
  onSettingsChange: (settings: VisualizationSettings) => void;
  onFitToRuns: () => void;
  hasRuns: boolean;
  units: DisplayUnits;
  onUnitsChange: (units: DisplayUnits) => void;
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
              <span>{settings.pathWidth}px</span>
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
};

export default VisualizationPanel;

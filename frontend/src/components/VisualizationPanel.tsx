/**
 * VisualizationPanel - Settings panel for visualization options.
 * This is a stub component - the full implementation should come from GitHub.
 */

import React from 'react';
import type { VisualizationSettings, ColorMode } from '@/types';

interface VisualizationPanelProps {
  settings: VisualizationSettings;
  onSettingsChange: (settings: VisualizationSettings) => void;
  onFitToRuns: () => void;
  hasRuns: boolean;
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
}) => {
  const handleColorModeChange = (mode: ColorMode) => {
    onSettingsChange({ ...settings, colorMode: mode });
  };

  return (
    <div style={styles.container}>
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Color Mode</h3>
        <div style={styles.buttonGroup}>
          {COLOR_MODES.map((mode) => (
            <button
              key={mode.value}
              onClick={() => handleColorModeChange(mode.value)}
              style={{
                ...styles.modeButton,
                backgroundColor: settings.colorMode === mode.value ? '#3b82f6' : '#2a2a4a',
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
        <button
          onClick={onFitToRuns}
          style={styles.fitButton}
          disabled={!hasRuns}
        >
          Fit to Runs
        </button>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '16px',
    height: '100%',
    overflowY: 'auto',
  },
  section: {
    marginBottom: '24px',
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#888',
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
    border: 'none',
    borderRadius: '4px',
    color: '#ffffff',
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
    backgroundColor: '#3b82f6',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
};

export default VisualizationPanel;

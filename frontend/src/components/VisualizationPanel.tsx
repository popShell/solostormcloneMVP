/**
 * VisualizationPanel - Settings panel for visualization options.
 */

import React from 'react';
import type { VisualizationSettings, ColorMode, ViewportState } from '@/types';
import { DEFAULT_COLOR_SCALES } from '@/types';
import { createGradientCSS, generateLegendStops } from '@/utils/colors';

interface VisualizationPanelProps {
  settings: VisualizationSettings;
  viewport: ViewportState;
  onSettingsChange: (settings: VisualizationSettings) => void;
  onViewportChange: (viewport: ViewportState) => void;
  onFitToRuns: () => void;
}

const COLOR_MODE_OPTIONS: { value: ColorMode; label: string }[] = [
  { value: 'speed', label: 'Speed' },
  { value: 'lateral_g', label: 'Lateral G' },
  { value: 'longitudinal_g', label: 'Long. G' },
  { value: 'total_g', label: 'Total G' },
  { value: 'solid', label: 'Solid Color' },
];

export const VisualizationPanel: React.FC<VisualizationPanelProps> = ({
  settings,
  viewport,
  onSettingsChange,
  onViewportChange,
  onFitToRuns,
}) => {
  const handleColorModeChange = (mode: ColorMode) => {
    onSettingsChange({ ...settings, colorMode: mode });
  };

  const handleToggle = (key: keyof VisualizationSettings) => {
    onSettingsChange({
      ...settings,
      [key]: !settings[key as keyof typeof settings],
    });
  };

  const handleSlider = (key: keyof VisualizationSettings, value: number) => {
    onSettingsChange({
      ...settings,
      [key]: value,
    });
  };

  const legendStops = generateLegendStops(settings.colorMode, DEFAULT_COLOR_SCALES);

  return (
    <div style={styles.container}>
      {/* Color Mode Section */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Color Mode</h3>
        <div style={styles.buttonGroup}>
          {COLOR_MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => handleColorModeChange(option.value)}
              style={{
                ...styles.modeButton,
                backgroundColor:
                  settings.colorMode === option.value ? '#3b82f6' : '#2a2a4a',
              }}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* Color Legend */}
        {settings.colorMode !== 'solid' && (
          <div style={styles.legend}>
            <div
              style={{
                ...styles.legendGradient,
                background: createGradientCSS(settings.colorMode, DEFAULT_COLOR_SCALES),
              }}
            />
            <div style={styles.legendLabels}>
              <span>{legendStops[0].label}</span>
              <span>{legendStops[legendStops.length - 1].label}</span>
            </div>
          </div>
        )}
      </div>

      {/* Display Options */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Display</h3>
        
        <label style={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={settings.showPath}
            onChange={() => handleToggle('showPath')}
          />
          Show Path
        </label>

        <label style={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={settings.showAccelVectors}
            onChange={() => handleToggle('showAccelVectors')}
          />
          Show Accel Vectors
        </label>

        {settings.showAccelVectors && (
          <div style={styles.sliderRow}>
            <span style={styles.sliderLabel}>Vector Scale</span>
            <input
              type="range"
              min={1}
              max={30}
              value={settings.accelVectorScale}
              onChange={(e) => handleSlider('accelVectorScale', parseFloat(e.target.value))}
              style={styles.slider}
            />
            <span style={styles.sliderValue}>{settings.accelVectorScale}</span>
          </div>
        )}

        <div style={styles.sliderRow}>
          <span style={styles.sliderLabel}>Path Width</span>
          <input
            type="range"
            min={1}
            max={10}
            value={settings.pathWidth}
            onChange={(e) => handleSlider('pathWidth', parseFloat(e.target.value))}
            style={styles.slider}
          />
          <span style={styles.sliderValue}>{settings.pathWidth}px</span>
        </div>

        <div style={styles.sliderRow}>
          <span style={styles.sliderLabel}>Car Size</span>
          <input
            type="range"
            min={4}
            max={20}
            value={settings.carSize}
            onChange={(e) => handleSlider('carSize', parseFloat(e.target.value))}
            style={styles.slider}
          />
          <span style={styles.sliderValue}>{settings.carSize}px</span>
        </div>
      </div>

      {/* Viewport Controls */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>View</h3>
        
        <div style={styles.sliderRow}>
          <span style={styles.sliderLabel}>Zoom</span>
          <input
            type="range"
            min={0.5}
            max={50}
            step={0.5}
            value={viewport.scale}
            onChange={(e) =>
              onViewportChange({ ...viewport, scale: parseFloat(e.target.value) })
            }
            style={styles.slider}
          />
          <span style={styles.sliderValue}>{viewport.scale.toFixed(1)}x</span>
        </div>

        <div style={styles.sliderRow}>
          <span style={styles.sliderLabel}>Rotation</span>
          <input
            type="range"
            min={0}
            max={360}
            value={viewport.rotation}
            onChange={(e) =>
              onViewportChange({ ...viewport, rotation: parseFloat(e.target.value) })
            }
            style={styles.slider}
          />
          <span style={styles.sliderValue}>{viewport.rotation}°</span>
        </div>

        <button onClick={onFitToRuns} style={styles.fitButton}>
          Fit to Runs
        </button>
      </div>

      {/* Telemetry Display (current sample info) */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Telemetry</h3>
        <div style={styles.telemetryPlaceholder}>
          Select a run to view telemetry data
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: '#0f0f1a',
    height: '100%',
    overflowY: 'auto',
    borderLeft: '1px solid #2a2a4a',
    padding: '16px',
  },
  section: {
    marginBottom: '24px',
  },
  sectionTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '12px',
  },
  buttonGroup: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  modeButton: {
    padding: '6px 12px',
    borderRadius: '4px',
    border: '1px solid #3a3a5a',
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: '12px',
  },
  legend: {
    marginTop: '12px',
  },
  legendGradient: {
    height: '12px',
    borderRadius: '4px',
    marginBottom: '4px',
  },
  legendLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '10px',
    color: '#888',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: '#ffffff',
    fontSize: '13px',
    marginBottom: '8px',
    cursor: 'pointer',
  },
  sliderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  },
  sliderLabel: {
    fontSize: '12px',
    color: '#888',
    width: '80px',
    flexShrink: 0,
  },
  slider: {
    flex: 1,
    accentColor: '#3b82f6',
  },
  sliderValue: {
    fontSize: '11px',
    color: '#666',
    width: '40px',
    textAlign: 'right',
  },
  fitButton: {
    width: '100%',
    padding: '8px 16px',
    borderRadius: '6px',
    border: '1px solid #3a3a5a',
    backgroundColor: '#2a2a4a',
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: '13px',
    marginTop: '8px',
  },
  telemetryPlaceholder: {
    padding: '16px',
    backgroundColor: '#1a1a2e',
    borderRadius: '6px',
    color: '#666',
    fontSize: '12px',
    textAlign: 'center',
  },
};

export default VisualizationPanel;

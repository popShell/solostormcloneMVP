/**
 * RunList - Sidebar for selecting and managing telemetry runs.
 */

import React from 'react';
import type { RunSummary } from '@/types';
import { RUN_COLORS } from '@/types';

interface RunListProps {
  runs: RunSummary[];
  selectedRuns: Set<string>;
  loadingRuns: Set<string>;
  onToggleRun: (runId: string) => void;
  onLoadRun: (runId: string) => void;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
}

export const RunList: React.FC<RunListProps> = ({
  runs,
  selectedRuns,
  loadingRuns,
  onToggleRun,
  onLoadRun,
  isLoading,
  error,
  onRefresh,
}) => {
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (isoString: string | null): string => {
    if (!isoString) return 'Unknown date';
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString();
    } catch {
      return 'Unknown date';
    }
  };

  const getRunColor = (runId: string): string => {
    const index = runs.findIndex((r) => r.id === runId);
    return RUN_COLORS[index % RUN_COLORS.length];
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>Runs</h2>
        <button
          onClick={onRefresh}
          style={styles.refreshButton}
          disabled={isLoading}
          title="Refresh run list"
        >
          {isLoading ? '⏳' : '🔄'}
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div style={styles.error}>
          {error}
        </div>
      )}

      {/* Run List */}
      <div style={styles.list}>
        {runs.length === 0 && !isLoading ? (
          <div style={styles.empty}>
            No runs found. Set a data folder to load CSV files.
          </div>
        ) : (
          runs.map((run) => {
            const isSelected = selectedRuns.has(run.id);
            const isLoadingRun = loadingRuns.has(run.id);
            const color = getRunColor(run.id);

            return (
              <div
                key={run.id}
                style={{
                  ...styles.runCard,
                  borderLeftColor: isSelected ? color : 'transparent',
                  backgroundColor: isSelected ? '#2a2a4a' : '#1a1a2e',
                }}
              >
                {/* Checkbox/Loading indicator */}
                <div style={styles.checkbox}>
                  {isLoadingRun ? (
                    <span style={styles.spinner}>⏳</span>
                  ) : (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {
                        if (isSelected) {
                          onToggleRun(run.id);
                        } else {
                          onLoadRun(run.id);
                        }
                      }}
                      style={{ accentColor: color }}
                    />
                  )}
                </div>

                {/* Run Info */}
                <div style={styles.runInfo}>
                  <div style={styles.runName}>{run.name}</div>
                  <div style={styles.runMeta}>
                    <span>{formatDuration(run.duration_s)}</span>
                    <span style={styles.metaSeparator}>•</span>
                    <span>{run.sample_count} samples</span>
                  </div>
                  <div style={styles.runDate}>{formatDate(run.recorded_at)}</div>
                </div>

                {/* Color indicator */}
                {isSelected && (
                  <div
                    style={{
                      ...styles.colorDot,
                      backgroundColor: color,
                    }}
                  />
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Stats */}
      {runs.length > 0 && (
        <div style={styles.stats}>
          {selectedRuns.size} of {runs.length} runs selected
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: '#0f0f1a',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    borderRight: '1px solid #2a2a4a',
  },
  header: {
    padding: '16px',
    borderBottom: '1px solid #2a2a4a',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 600,
    color: '#ffffff',
  },
  refreshButton: {
    width: '32px',
    height: '32px',
    borderRadius: '6px',
    border: '1px solid #3a3a5a',
    backgroundColor: 'transparent',
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: '14px',
  },
  error: {
    margin: '8px 16px',
    padding: '8px 12px',
    backgroundColor: '#3b1a1a',
    border: '1px solid #ef4444',
    borderRadius: '4px',
    color: '#ef4444',
    fontSize: '12px',
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px',
  },
  empty: {
    padding: '24px 16px',
    textAlign: 'center',
    color: '#666',
    fontSize: '14px',
  },
  runCard: {
    padding: '12px',
    marginBottom: '8px',
    borderRadius: '6px',
    borderLeft: '3px solid transparent',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  checkbox: {
    paddingTop: '2px',
  },
  spinner: {
    display: 'inline-block',
    animation: 'spin 1s linear infinite',
  },
  runInfo: {
    flex: 1,
    minWidth: 0,
  },
  runName: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#ffffff',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  runMeta: {
    fontSize: '12px',
    color: '#888',
    marginTop: '4px',
  },
  metaSeparator: {
    margin: '0 6px',
  },
  runDate: {
    fontSize: '11px',
    color: '#666',
    marginTop: '2px',
  },
  colorDot: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  stats: {
    padding: '12px 16px',
    borderTop: '1px solid #2a2a4a',
    fontSize: '12px',
    color: '#666',
    textAlign: 'center',
  },
};

export default RunList;

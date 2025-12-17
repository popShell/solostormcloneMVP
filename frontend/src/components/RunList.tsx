/**
 * RunList - Sidebar for selecting and managing telemetry runs.
 * This is a stub component - the full implementation should come from GitHub.
 */

import React from 'react';
import type { RunSummary } from '@/types';

interface RunListProps {
  runs: RunSummary[];
  selectedRuns: Set<string>;
  visibleRuns?: Set<string>;
  loadingRuns: Set<string>;
  isLoading: boolean;
  error: string | null;
  onRunToggle: (runId: string, selected: boolean) => void;
  onVisibilityToggle?: (runId: string, visible: boolean) => void;
  onRefresh: () => void;
}

export const RunList: React.FC<RunListProps> = ({
  runs,
  selectedRuns,
  loadingRuns,
  isLoading,
  error,
  onRunToggle,
  onRefresh,
}) => {
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Runs</h2>
        <button
          onClick={onRefresh}
          style={styles.refreshButton}
          disabled={isLoading}
        >
          {isLoading ? '⏳' : '🔄'}
        </button>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.list}>
        {runs.length === 0 && !isLoading ? (
          <div style={styles.empty}>No runs found</div>
        ) : (
          runs.map((run) => {
            const isSelected = selectedRuns.has(run.id);
            const isLoadingRun = loadingRuns.has(run.id);

            return (
              <div
                key={run.id}
                style={{
                  ...styles.runCard,
                  backgroundColor: isSelected ? '#2a2a4a' : '#1a1a2e',
                }}
                onClick={() => onRunToggle(run.id, !isSelected)}
              >
                <div style={styles.checkbox}>
                  {isLoadingRun ? '⏳' : (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      readOnly
                    />
                  )}
                </div>
                <div style={styles.runInfo}>
                  <div style={styles.runName}>{run.name}</div>
                  <div style={styles.runMeta}>
                    {formatDuration(run.duration_s)} • {run.sample_count} samples
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: '#0f0f1a',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
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
  },
  refreshButton: {
    padding: '8px',
    borderRadius: '6px',
    border: '1px solid #3a3a5a',
    backgroundColor: 'transparent',
    color: '#ffffff',
    cursor: 'pointer',
  },
  error: {
    margin: '8px 16px',
    padding: '8px',
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
  },
  runCard: {
    padding: '12px',
    marginBottom: '8px',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    cursor: 'pointer',
  },
  checkbox: {
    paddingTop: '2px',
  },
  runInfo: {
    flex: 1,
  },
  runName: {
    fontSize: '14px',
    fontWeight: 500,
  },
  runMeta: {
    fontSize: '12px',
    color: '#888',
    marginTop: '4px',
  },
};

export default RunList;

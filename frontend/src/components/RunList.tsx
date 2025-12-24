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
  displayNames?: Record<string, string>;
  onRename?: (runId: string, name: string) => void;
}

export const RunList: React.FC<RunListProps> = ({
  runs,
  selectedRuns,
  loadingRuns,
  isLoading,
  error,
  onRunToggle,
  onRefresh,
  displayNames = {},
  onRename,
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

            const displayName = displayNames[run.id] || run.name;
            const truncated =
              displayName.length > 20 ? `${displayName.slice(0, 20)}…` : displayName;
            return (
              <div
                key={run.id}
                style={{
                  ...styles.runCard,
                  backgroundColor: isSelected ? 'var(--surface2)' : 'var(--surface)',
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
                  <div style={styles.runName} title={displayName}>
                    {truncated}
                    {onRename && (
                      <button
                        style={styles.renameBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          const next = window.prompt('Rename run display', displayName) || '';
                          if (next.trim()) onRename(run.id, next.trim());
                        }}
                        title="Rename"
                      >
                        ✎
                      </button>
                    )}
                  </div>
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
    backgroundColor: 'var(--bg)',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    padding: '16px',
    borderBottom: '1px solid var(--border)',
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
    border: '1px solid var(--border)',
    backgroundColor: 'transparent',
    color: 'var(--text)',
    cursor: 'pointer',
  },
  error: {
    margin: '8px 16px',
    padding: '8px',
    backgroundColor: 'rgba(209, 109, 109, 0.15)',
    border: '1px solid var(--danger)',
    borderRadius: '4px',
    color: 'var(--danger)',
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
    color: 'var(--muted)',
  },
  runCard: {
    padding: '12px',
    marginBottom: '8px',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    cursor: 'pointer',
    border: '1px solid var(--border)',
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
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  renameBtn: {
    border: 'none',
    background: 'transparent',
    color: 'var(--muted)',
    cursor: 'pointer',
    padding: '0 4px',
  },
  runMeta: {
    fontSize: '12px',
    color: 'var(--muted)',
    marginTop: '4px',
  },
};

export default RunList;

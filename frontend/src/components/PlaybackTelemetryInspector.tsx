import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { DisplayUnits, PlaybackSample, RunData } from '@/types';

const G = 9.80665;

interface InspectorRun {
  id: string;
  color: string;
  data: RunData;
  sample?: PlaybackSample;
  nameOverride?: string;
  splitDisplay?: string;
  isFastest?: boolean;
}

interface PlaybackTelemetryInspectorProps {
  runs: InspectorRun[];
  units: DisplayUnits;
}

function formatSpeedMps(speedMps: number, units: DisplayUnits['speed']): string {
  if (!Number.isFinite(speedMps)) return '--';
  switch (units) {
    case 'mph':
      return `${(speedMps * 2.2369362920544).toFixed(1)} mph`;
    case 'kph':
      return `${(speedMps * 3.6).toFixed(1)} km/h`;
    case 'mps':
      return `${speedMps.toFixed(2)} m/s`;
  }
}

function formatYawRate(yawRate: number, units: DisplayUnits['yawRate']): string {
  if (!Number.isFinite(yawRate)) return '--';
  switch (units) {
    case 'deg_s':
      return `${(yawRate * (180 / Math.PI)).toFixed(1)} °/s`;
    case 'rad_s':
      return `${yawRate.toFixed(3)} rad/s`;
  }
}

function formatG(accelMps2: number): string {
  if (!Number.isFinite(accelMps2)) return '--';
  return `${(accelMps2 / G).toFixed(2)} g`;
}

function formatDeg(rad: number): string {
  if (!Number.isFinite(rad)) return '--';
  const deg = (rad * 180) / Math.PI;
  return `${deg.toFixed(0)}°`;
}

function Field({
  label,
  value,
  valid = true,
}: {
  label: string;
  value: string;
  valid?: boolean;
}) {
  return (
    <div style={styles.fieldRow}>
      <span style={styles.fieldLabel}>{label}</span>
      <span style={{ ...styles.fieldValue, opacity: valid ? 1 : 0.45 }}>{value}</span>
    </div>
  );
}

export function PlaybackTelemetryInspector({ runs, units }: PlaybackTelemetryInspectorProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [pos, setPos] = useState({ x: 16, y: 16 });
  const [dragging, setDragging] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const parentRectRef = useRef<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!dragging) return;

    const onMove = (ev: MouseEvent) => {
      const parentRect = parentRectRef.current;
      if (!parentRect) return;
      setPos({
        x: Math.max(0, ev.clientX - parentRect.left - dragOffsetRef.current.x),
        y: Math.max(0, ev.clientY - parentRect.top - dragOffsetRef.current.y),
      });
    };

    const onUp = () => setDragging(false);

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging]);

  const visibleRuns = useMemo(() => runs.filter((r) => r.sample), [runs]);

  return (
    <div
      ref={rootRef}
      style={{
        ...styles.container,
        left: pos.x,
        top: pos.y,
        width: collapsed ? 260 : 360,
      }}
    >
      <div
        style={styles.header}
        onMouseDown={(e) => {
          setDragging(true);
          const parent = rootRef.current?.offsetParent as HTMLElement | null;
          const parentRect = parent?.getBoundingClientRect();
          parentRectRef.current = parentRect ? { left: parentRect.left, top: parentRect.top } : { left: 0, top: 0 };

          dragOffsetRef.current = {
            x: e.clientX - (parentRectRef.current.left + pos.x),
            y: e.clientY - (parentRectRef.current.top + pos.y),
          };
        }}
      >
        <div style={styles.headerTitle}>Telemetry Inspector</div>
        <div style={styles.headerActions}>
          <button
            style={styles.headerButton}
            onClick={(e) => {
              e.stopPropagation();
              setCollapsed((v) => !v);
            }}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? '+' : '–'}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div style={styles.content}>
          {runs.length === 0 ? (
            <div style={styles.empty}>No runs visible</div>
          ) : visibleRuns.length === 0 ? (
            <div style={styles.empty}>Load runs and press play (or scrub) to see live values.</div>
          ) : (
            visibleRuns.map((run) => {
              const s = run.sample!;
              const valid = s.valid ?? {};
              const runName = run.nameOverride || run.data.metadata.name;
              const borderColorValue = run.isFastest ? 'var(--accent)' : 'var(--border)';
              return (
                <div
                  key={run.id}
                  style={{ ...styles.runCard, border: `1px solid ${borderColorValue}` }}
                >
                  <div style={styles.runHeader}>
                    <span style={{ ...styles.runColorDot, backgroundColor: run.color }} />
                    <div style={styles.runTitle}>{runName}</div>
                    <div style={styles.runTime}>{run.splitDisplay ?? `${s.time.toFixed(3)} s`}</div>
                  </div>

                  <div style={styles.grid}>
                    <Field label="Speed" value={formatSpeedMps(s.speed, units.speed)} valid={valid.speed ?? true} />
                    <Field label="Heading" value={formatDeg(s.heading)} valid={valid.heading ?? true} />
                    <Field label="Yaw Rate" value={formatYawRate(s.yaw_rate, units.yawRate)} valid={valid.yaw_rate ?? true} />

                    <Field label="Long G" value={formatG(s.ax)} valid={valid.ax ?? true} />
                    <Field label="Lat G" value={formatG(s.ay)} valid={valid.ay ?? true} />
                    <Field label="Total G" value={`${s.total_g.toFixed(2)} g`} valid={valid.total_g ?? true} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {collapsed && <div style={styles.collapsedHint}>{visibleRuns.length} run(s)</div>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    zIndex: 50,
    backgroundColor: 'rgba(21, 25, 34, 0.92)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    color: 'var(--text)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
    userSelect: 'none',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    cursor: 'grab',
    borderBottom: '1px solid var(--border)',
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 0.2,
  },
  headerActions: {
    display: 'flex',
    gap: 6,
  },
  headerButton: {
    width: 26,
    height: 26,
    borderRadius: 6,
    border: '1px solid var(--border)',
    backgroundColor: 'transparent',
    color: 'var(--text)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
    lineHeight: 1,
  },
  content: {
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  empty: {
    padding: 10,
    fontSize: 12,
    color: '#aaa',
    lineHeight: 1.4,
  },
  runCard: {
    backgroundColor: 'rgba(27, 34, 48, 0.7)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: 10,
  },
  runHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  runColorDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  runTitle: {
    fontSize: 13,
    fontWeight: 600,
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  runTime: {
    fontSize: 12,
    color: 'var(--muted)',
    fontFamily: 'monospace',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    columnGap: 12,
    rowGap: 6,
    userSelect: 'text',
  },
  fieldRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 10,
    fontSize: 12,
    fontFamily: 'monospace',
  },
  fieldLabel: {
    color: 'var(--muted)',
  },
  fieldValue: {
    color: 'var(--text)',
    textAlign: 'right',
  },
  collapsedHint: {
    padding: '10px 12px',
    fontSize: 12,
    color: 'var(--muted)',
    fontFamily: 'monospace',
  },
};

export default PlaybackTelemetryInspector;

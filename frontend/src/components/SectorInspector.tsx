import React, { useState } from 'react';
import type { SectorMarker } from '@/types';

interface SectorResult {
  runId: string;
  name: string;
  splits: (number | null)[];
  total: number | null;
}

interface SectorInspectorProps {
  results: SectorResult[];
  sectors: SectorMarker[];
  runColors: string[];
}

export const SectorInspector: React.FC<SectorInspectorProps> = ({
  results,
  sectors,
  runColors,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  if (!results.length || sectors.length === 0) return null;

  // Determine best (min) per sector and total
  const numCols = sectors.length + 1; // sectors + total
  const bestPerCol: (number | null)[] = Array(numCols).fill(null);
  results.forEach((r) => {
    const sectorSplits = r.splits.slice(1, 1 + sectors.length);
    sectorSplits.forEach((v, i) => {
      if (v == null) return;
      if (bestPerCol[i] == null || v < (bestPerCol[i] as number)) bestPerCol[i] = v;
    });
    const totalIdx = numCols - 1;
    if (r.total != null && (bestPerCol[totalIdx] == null || r.total < (bestPerCol[totalIdx] as number))) {
      bestPerCol[totalIdx] = r.total;
    }
  });

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span>Sector Times</span>
        <button style={styles.headerBtn} onClick={() => setCollapsed((c) => !c)}>
          {collapsed ? '+' : '–'}
        </button>
      </div>
      {!collapsed && (
        <div style={styles.body}>
          <div style={styles.row}>
            <div style={{ ...styles.cell, fontWeight: 700, width: 140 }}>Run</div>
            {sectors.map((s, idx) => (
              <div key={s.id} style={{ ...styles.cell, fontWeight: 700 }}>
                S{idx + 1}
              </div>
            ))}
            <div style={{ ...styles.cell, fontWeight: 700 }}>Finish</div>
          </div>
          {results.map((r, rowIdx) => (
            <div key={r.runId} style={styles.row}>
              <div
                style={{
                  ...styles.cell,
                  width: 140,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  whiteSpace: 'nowrap',
                }}
                title={r.name}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: runColors[rowIdx % runColors.length],
                    border: '1px solid #111',
                  }}
                />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.name}
                </span>
              </div>
              {r.splits.slice(1, 1 + sectors.length).map((v, i) => {
                const isBest = v != null && bestPerCol[i] != null && v === bestPerCol[i];
                return (
                  <div
                    key={i}
                    style={{
                      ...styles.cell,
                      backgroundColor: isBest ? 'rgba(79,179,166,0.25)' : 'transparent',
                      fontWeight: isBest ? 700 : 400,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {v != null ? v.toFixed(2) : '--'}
                  </div>
                );
              })}
              <div
                style={{
                  ...styles.cell,
                  backgroundColor:
                    r.total != null && bestPerCol[numCols - 1] === r.total
                      ? 'rgba(79,179,166,0.25)'
                      : 'transparent',
                  fontWeight:
                    r.total != null && bestPerCol[numCols - 1] === r.total ? 700 : 400,
                  whiteSpace: 'nowrap',
                }}
              >
                {r.total != null ? r.total.toFixed(2) : '--'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    right: 16,
    top: 16,
    zIndex: 45,
    background: 'rgba(21,25,34,0.92)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '10px 12px',
    color: 'var(--text)',
    fontSize: 12,
  },
  header: {
    fontWeight: 700,
    marginBottom: 8,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerBtn: {
    border: '1px solid var(--border)',
    borderRadius: 6,
    background: 'var(--surface2)',
    color: 'var(--text)',
    padding: '2px 8px',
    cursor: 'pointer',
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    whiteSpace: 'nowrap',
  },
  row: {
    display: 'flex',
    gap: 4,
    alignItems: 'center',
  },
  cell: {
    width: 70,
    textAlign: 'right',
    padding: '4px 6px',
    borderRadius: 6,
    background: 'rgba(255,255,255,0.02)',
  },
};

export default SectorInspector;

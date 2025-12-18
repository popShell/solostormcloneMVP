/**
 * PlaybackControls - Controls for telemetry playback.
 * 
 * Provides play/pause, scrubbing, speed control, and time display.
 */

import React, { useCallback } from 'react';
import type { PlaybackState } from '@/types';

interface PlaybackControlsProps {
  state: PlaybackState;
  duration: number;
  onChange: (state: PlaybackState | ((prev: PlaybackState) => PlaybackState)) => void;
}

const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 4];

export const PlaybackControls: React.FC<PlaybackControlsProps> = ({
  state,
  duration,
  onChange,
}) => {
  // Use functional updates to avoid stale closure issues
  const handlePlayPause = useCallback(() => {
    onChange((prev) => ({
      ...prev,
      isPlaying: !prev.isPlaying,
    }));
  }, [onChange]);

  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newTime = parseFloat(e.target.value);
      onChange((prev) => ({
        ...prev,
        currentTime: newTime,
        isPlaying: false, // Pause when scrubbing
      }));
    },
    [onChange]
  );

  const handleSpeedChange = useCallback(
    (speed: number) => {
      onChange((prev) => ({
        ...prev,
        playbackSpeed: speed,
      }));
    },
    [onChange]
  );

  const handleLoopToggle = useCallback(() => {
    onChange((prev) => ({
      ...prev,
      looping: !prev.looping,
    }));
  }, [onChange]);

  const handleReset = useCallback(() => {
    onChange((prev) => ({
      ...prev,
      currentTime: 0,
      isPlaying: false,
    }));
  }, [onChange]);

  const handleStepBack = useCallback(() => {
    onChange((prev) => ({
      ...prev,
      currentTime: Math.max(0, prev.currentTime - 0.1),
    }));
  }, [onChange]);

  const handleStepForward = useCallback(() => {
    onChange((prev) => ({
      ...prev,
      currentTime: Math.min(duration, prev.currentTime + 0.1),
    }));
  }, [onChange, duration]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(1);
    return `${mins}:${secs.padStart(4, '0')}`;
  };

  return (
    <div style={styles.container}>
      {/* Main Controls Row */}
      <div style={styles.mainRow}>
        {/* Reset Button */}
        <button
          onClick={handleReset}
          style={styles.iconButton}
          title="Reset to start"
        >
          ⏮
        </button>

        {/* Step Back Button */}
        <button
          onClick={handleStepBack}
          style={styles.iconButton}
          title="Step back 0.1s"
        >
          ⏪
        </button>

        {/* Play/Pause Button */}
        <button
          onClick={handlePlayPause}
          style={styles.playButton}
          title={state.isPlaying ? 'Pause' : 'Play'}
        >
          {state.isPlaying ? '⏸' : '▶'}
        </button>

        {/* Step Forward Button */}
        <button
          onClick={handleStepForward}
          style={styles.iconButton}
          title="Step forward 0.1s"
        >
          ⏩
        </button>

        {/* Time Display */}
        <div style={styles.timeDisplay}>
          <span style={styles.currentTime}>{formatTime(state.currentTime)}</span>
          <span style={styles.timeSeparator}>/</span>
          <span style={styles.duration}>{formatTime(duration)}</span>
        </div>

        {/* Loop Toggle */}
        <button
          onClick={handleLoopToggle}
          style={{
            ...styles.iconButton,
            backgroundColor: state.looping ? 'var(--accent)' : 'transparent',
            color: state.looping ? 'var(--bg)' : 'var(--text)',
          }}
          title={state.looping ? 'Loop enabled' : 'Loop disabled'}
        >
          🔁
        </button>
      </div>

      {/* Timeline Slider */}
      <div style={styles.timelineRow}>
        <input
          type="range"
          min={0}
          max={duration}
          step={0.01}
          value={state.currentTime}
          onChange={handleSeek}
          style={styles.slider}
        />
      </div>

      {/* Speed Controls */}
      <div style={styles.speedRow}>
        <span style={styles.speedLabel}>Speed:</span>
        {SPEED_OPTIONS.map((speed) => (
          <button
            key={speed}
            onClick={() => handleSpeedChange(speed)}
            style={{
              ...styles.speedButton,
              backgroundColor:
                state.playbackSpeed === speed ? 'var(--accent)' : 'var(--surface2)',
              color: state.playbackSpeed === speed ? 'var(--bg)' : 'var(--text)',
            }}
          >
            {speed}×
          </button>
        ))}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: 'var(--surface)',
    padding: '12px 16px',
    borderRadius: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    border: '1px solid var(--border)',
  },
  mainRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  iconButton: {
    width: '36px',
    height: '36px',
    borderRadius: '6px',
    border: '1px solid var(--border)',
    backgroundColor: 'transparent',
    color: 'var(--text)',
    cursor: 'pointer',
    fontSize: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    border: 'none',
    backgroundColor: 'var(--accent)',
    color: 'var(--bg)',
    cursor: 'pointer',
    fontSize: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeDisplay: {
    fontFamily: 'monospace',
    fontSize: '14px',
    color: 'var(--text)',
    marginLeft: 'auto',
  },
  currentTime: {
    color: 'var(--accent)',
    fontWeight: 'bold',
  },
  timeSeparator: {
    color: 'var(--muted)',
    margin: '0 4px',
  },
  duration: {
    color: 'var(--muted)',
  },
  timelineRow: {
    width: '100%',
  },
  slider: {
    width: '100%',
    height: '8px',
    borderRadius: '4px',
    cursor: 'pointer',
    accentColor: 'var(--accent)',
  },
  speedRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  speedLabel: {
    color: 'var(--muted)',
    fontSize: '12px',
    marginRight: '4px',
  },
  speedButton: {
    padding: '4px 12px',
    borderRadius: '4px',
    border: '1px solid var(--border)',
    cursor: 'pointer',
    fontSize: '12px',
  },
};

export default PlaybackControls;

/**
 * CourseEditorPage - Full-page course design interface.
 * 
 * Integrates the course editor canvas with:
 * - Sector list and management
 * - Course metadata editing
 * - Import/export functionality
 * - Live sector timing display (when connected to telemetry)
 */

import React, { useState, useCallback } from 'react';
import CourseEditor from './CourseEditor';
import { useCourse, useGeofencing, exportCourseToJson, importCourseFromJson } from '@/hooks/course';

interface CourseEditorPageProps {
  onBack?: () => void;
}

export const CourseEditorPage: React.FC<CourseEditorPageProps> = ({ onBack }) => {
  const {
    course,
    addElement,
    updateElements,
    removeElements,
    addSector,
    updateSector,
    removeSector,
    updateMetadata,
    undo,
    redo,
    canUndo,
    canRedo,
    setCourse,
    clearCourse,
  } = useCourse();
  
  const { sectorTimes, reset: resetTiming } = useGeofencing(course.sectors);
  
  const [showSectorPanel, setShowSectorPanel] = useState(true);
  const [editingCourseInfo, setEditingCourseInfo] = useState(false);
  
  // Export course
  const handleExport = useCallback(() => {
    const json = exportCourseToJson(course);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${course.metadata.name.replace(/\s+/g, '_')}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
  }, [course]);
  
  // Import course
  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = (event) => {
        const json = event.target?.result as string;
        const imported = importCourseFromJson(json);
        if (imported) {
          setCourse(imported, { resetHistory: true });
        } else {
          alert('Invalid course file');
        }
      };
      reader.readAsText(file);
    };
    
    input.click();
  }, [setCourse]);
  
  // Sector editing
  const handleSectorNameChange = useCallback((sectorId: string, name: string) => {
    updateSector(sectorId, { name });
  }, [updateSector]);
  
  const handleSectorColorChange = useCallback((sectorId: string, color: string) => {
    updateSector(sectorId, { color });
  }, [updateSector]);
  
  const handleSectorTimingToggle = useCallback((sectorId: string) => {
    const sector = course.sectors.find(s => s.id === sectorId);
    if (sector) {
      updateSector(sectorId, { timingEnabled: !sector.timingEnabled });
    }
  }, [course.sectors, updateSector]);
  
  const handleDeleteSector = useCallback((sectorId: string) => {
    if (confirm('Delete this sector?')) {
      removeSector(sectorId);
    }
  }, [removeSector]);
  
  // Format time for display
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(3);
    return mins > 0 ? `${mins}:${secs.padStart(6, '0')}` : `${secs}s`;
  };
  
  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          {onBack && (
            <button onClick={onBack} style={styles.backButton}>
              ← Back
            </button>
          )}
          
          {editingCourseInfo ? (
            <input
              type="text"
              value={course.metadata.name}
              onChange={(e) => updateMetadata({ name: e.target.value })}
              onBlur={() => setEditingCourseInfo(false)}
              onKeyDown={(e) => e.key === 'Enter' && setEditingCourseInfo(false)}
              style={styles.titleInput}
              autoFocus
            />
          ) : (
            <h1 
              style={styles.title}
              onClick={() => setEditingCourseInfo(true)}
              title="Click to edit"
            >
              {course.metadata.name}
            </h1>
          )}
        </div>
        
        <div style={styles.headerRight}>
          <button
            onClick={undo}
            disabled={!canUndo}
            style={styles.headerButton}
            title="Undo"
          >
            ↩
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            style={styles.headerButton}
            title="Redo"
          >
            ↪
          </button>
          
          <div style={styles.headerDivider} />
          
          <button onClick={handleImport} style={styles.headerButton}>
            Import
          </button>
          <button onClick={handleExport} style={styles.headerButton}>
            Export
          </button>
          
          <div style={styles.headerDivider} />
          
          <button 
            onClick={() => {
              if (confirm('Create new course? Unsaved changes will be lost.')) {
                clearCourse();
              }
            }}
            style={styles.headerButton}
          >
            New
          </button>
        </div>
      </div>
      
      {/* Main Content */}
      <div style={styles.main}>
        {/* Editor Canvas */}
        <div style={styles.editorContainer}>
          <CourseEditor
            course={course}
            addElement={addElement}
            updateElements={updateElements}
            removeElements={removeElements}
            addSector={addSector}
          />
        </div>
        
        {/* Right Panel - Sectors */}
        {showSectorPanel && (
          <div style={styles.sectorPanel}>
            <div style={styles.panelHeader}>
              <h2 style={styles.panelTitle}>Sectors</h2>
              <button
                onClick={() => setShowSectorPanel(false)}
                style={styles.closeButton}
              >
                ×
              </button>
            </div>
            
            {/* Sector List */}
            <div style={styles.sectorList}>
              {course.sectors.length === 0 ? (
                <div style={styles.emptyState}>
                  No sectors defined.
                  <br /><br />
                  Use the <strong>Sector</strong> tool to draw
                  sector boundaries on the course.
                  <br /><br />
                  Double-click to complete a sector polygon.
                </div>
              ) : (
                course.sectors.map((sector) => (
                  <div key={sector.id} style={styles.sectorItem}>
                    <div style={styles.sectorHeader}>
                      <div
                        style={{
                          ...styles.sectorColorDot,
                          backgroundColor: sector.color,
                        }}
                      />
                      <input
                        type="text"
                        value={sector.name}
                        onChange={(e) => handleSectorNameChange(sector.id, e.target.value)}
                        style={styles.sectorNameInput}
                      />
                      <button
                        onClick={() => handleDeleteSector(sector.id)}
                        style={styles.deleteButton}
                        title="Delete sector"
                      >
                        ×
                      </button>
                    </div>
                    
                    <div style={styles.sectorDetails}>
                      <label style={styles.checkboxLabel}>
                        <input
                          type="checkbox"
                          checked={sector.timingEnabled}
                          onChange={() => handleSectorTimingToggle(sector.id)}
                        />
                        Enable timing
                      </label>
                      
                      <div style={styles.colorPicker}>
                        <span style={styles.colorLabel}>Color:</span>
                        {['#d16d6d', '#d6b36b', '#7bbf93', '#4fb3a6', '#b48ead', '#88a1b8'].map(color => (
                          <button
                            key={color}
                            onClick={() => handleSectorColorChange(sector.id, color)}
                            style={{
                              ...styles.colorOption,
                              backgroundColor: color,
                              border: sector.color === color ? '2px solid white' : '2px solid transparent',
                            }}
                          />
                        ))}
                      </div>
                      
                      {sector.polygon && (
                        <div style={styles.sectorInfo}>
                          {sector.polygon.vertices.length} vertices
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            
            {/* Sector Timing Results */}
            {sectorTimes.length > 0 && (
              <>
                <div style={styles.panelDivider} />
                <div style={styles.timingSection}>
                  <h3 style={styles.timingSectionTitle}>Sector Times</h3>
                  {sectorTimes.map((st, index) => (
                    <div key={index} style={styles.sectorTimeRow}>
                      <span style={styles.sectorTimeName}>{st.sectorName}</span>
                      <span style={styles.sectorTimeValue}>{formatTime(st.duration)}</span>
                      {st.deltaFromTarget !== undefined && (
                        <span style={{
                          ...styles.sectorTimeDelta,
                          color: st.deltaFromTarget > 0 ? 'var(--danger)' : '#7bbf93',
                        }}>
                          {st.deltaFromTarget > 0 ? '+' : ''}{st.deltaFromTarget.toFixed(3)}
                        </span>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={resetTiming}
                    style={styles.resetButton}
                  >
                    Reset Times
                  </button>
                </div>
              </>
            )}
            
            {/* Help Section */}
            <div style={styles.helpSection}>
              <h4 style={styles.helpTitle}>Quick Tips</h4>
              <ul style={styles.helpList}>
                <li>Click tool → Click canvas to place</li>
                <li>Drag elements to move them</li>
                <li>Delete key removes selected</li>
                <li>Scroll to zoom, Shift+drag to pan</li>
                <li>Double-click to finish sector polygon</li>
              </ul>
            </div>
          </div>
        )}
        
        {!showSectorPanel && (
          <button
            onClick={() => setShowSectorPanel(true)}
            style={styles.showPanelButton}
          >
            Sectors →
          </button>
        )}
      </div>
      
      {/* Footer Stats */}
      <div style={styles.footer}>
        <span>Elements: {course.elements.length}</span>
        <span>Sectors: {course.sectors.length}</span>
        <span>Last saved: {new Date(course.metadata.updatedAt).toLocaleTimeString()}</span>
      </div>
    </div>
  );
};

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    backgroundColor: 'var(--bg)',
    color: 'var(--text)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 20px',
    backgroundColor: 'var(--surface)',
    borderBottom: '1px solid var(--border)',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  backButton: {
    padding: '8px 16px',
    borderRadius: '6px',
    border: '1px solid var(--border)',
    backgroundColor: 'transparent',
    color: 'var(--text)',
    cursor: 'pointer',
    fontSize: '14px',
  },
  title: {
    margin: 0,
    fontSize: '20px',
    cursor: 'pointer',
  },
  titleInput: {
    fontSize: '20px',
    fontWeight: 'bold',
    backgroundColor: 'transparent',
    border: '1px solid var(--accent)',
    borderRadius: '4px',
    color: 'var(--text)',
    padding: '4px 8px',
    outline: 'none',
  },
  headerButton: {
    padding: '8px 16px',
    borderRadius: '6px',
    border: '1px solid var(--border)',
    backgroundColor: 'transparent',
    color: 'var(--text)',
    cursor: 'pointer',
    fontSize: '13px',
  },
  headerDivider: {
    width: '1px',
    height: '24px',
    backgroundColor: 'var(--border)',
    margin: '0 8px',
  },
  main: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  editorContainer: {
    flex: 1,
    padding: '16px',
    overflow: 'hidden',
    minWidth: 0,
    minHeight: 0,
  },
  sectorPanel: {
    width: '280px',
    backgroundColor: 'var(--surface)',
    borderLeft: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid var(--border)',
  },
  panelTitle: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 'bold',
  },
  closeButton: {
    width: '24px',
    height: '24px',
    borderRadius: '4px',
    border: 'none',
    backgroundColor: 'transparent',
    color: 'var(--muted)',
    cursor: 'pointer',
    fontSize: '18px',
  },
  sectorList: {
    flex: 1,
    overflow: 'auto',
    padding: '8px',
  },
  emptyState: {
    padding: '20px',
    textAlign: 'center',
    color: 'var(--muted)',
    fontSize: '13px',
    lineHeight: '1.5',
  },
  sectorItem: {
    backgroundColor: 'var(--surface2)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '8px',
  },
  sectorHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  sectorColorDot: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
  },
  sectorNameInput: {
    flex: 1,
    backgroundColor: 'transparent',
    border: '1px solid transparent',
    borderRadius: '4px',
    color: 'var(--text)',
    padding: '4px 8px',
    fontSize: '14px',
    outline: 'none',
  },
  deleteButton: {
    width: '24px',
    height: '24px',
    borderRadius: '4px',
    border: 'none',
    backgroundColor: 'transparent',
    color: 'var(--danger)',
    cursor: 'pointer',
    fontSize: '18px',
  },
  sectorDetails: {
    marginTop: '8px',
    paddingTop: '8px',
    borderTop: '1px solid var(--border)',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
    color: 'var(--muted)',
    cursor: 'pointer',
  },
  colorPicker: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    marginTop: '8px',
  },
  colorLabel: {
    fontSize: '12px',
    color: 'var(--muted)',
    marginRight: '4px',
  },
  colorOption: {
    width: '18px',
    height: '18px',
    borderRadius: '4px',
    cursor: 'pointer',
    padding: 0,
  },
  sectorInfo: {
    fontSize: '11px',
    color: 'var(--muted)',
    marginTop: '8px',
  },
  panelDivider: {
    height: '1px',
    backgroundColor: 'var(--border)',
    margin: '8px 0',
  },
  timingSection: {
    padding: '12px 16px',
  },
  timingSectionTitle: {
    margin: '0 0 12px 0',
    fontSize: '14px',
    color: 'var(--muted)',
  },
  sectorTimeRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 0',
    borderBottom: '1px solid var(--border)',
  },
  sectorTimeName: {
    flex: 1,
    fontSize: '13px',
  },
  sectorTimeValue: {
    fontFamily: 'monospace',
    fontSize: '13px',
    fontWeight: 'bold',
  },
  sectorTimeDelta: {
    fontFamily: 'monospace',
    fontSize: '12px',
    marginLeft: '8px',
  },
  resetButton: {
    width: '100%',
    padding: '8px',
    marginTop: '12px',
    borderRadius: '6px',
    border: '1px solid var(--border)',
    backgroundColor: 'transparent',
    color: 'var(--muted)',
    cursor: 'pointer',
    fontSize: '12px',
  },
  helpSection: {
    padding: '12px 16px',
    borderTop: '1px solid var(--border)',
    marginTop: 'auto',
  },
  helpTitle: {
    margin: '0 0 8px 0',
    fontSize: '12px',
    color: 'var(--muted)',
  },
  helpList: {
    margin: 0,
    padding: '0 0 0 16px',
    fontSize: '11px',
    color: 'var(--muted)',
    lineHeight: '1.6',
  },
  showPanelButton: {
    position: 'absolute',
    right: '0',
    top: '50%',
    transform: 'translateY(-50%)',
    padding: '12px 8px',
    backgroundColor: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRight: 'none',
    borderRadius: '8px 0 0 8px',
    color: 'var(--muted)',
    cursor: 'pointer',
    fontSize: '12px',
  },
  footer: {
    display: 'flex',
    gap: '24px',
    padding: '8px 20px',
    backgroundColor: 'var(--surface)',
    borderTop: '1px solid var(--border)',
    fontSize: '12px',
    color: 'var(--muted)',
  },
};

export default CourseEditorPage;

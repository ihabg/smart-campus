import React, { useEffect } from 'react';
import './RoomPopup.css';

// ─── Status configuration ────────────────────────────────────
const STATUS = {
  occupied:  { color:'#dc2626', bg:'#fde8e8', border:'#f4a4a4', label:'Occupied',  icon:'🔴', dot:'#dc2626' },
  reserved:  { color:'#d97706', bg:'#fef3c7', border:'#fcd34d', label:'Reserved',  icon:'🟡', dot:'#d97706' },
  available: { color:'#0d7a4a', bg:'#e3f7ee', border:'#7dd3b0', label:'Available', icon:'🟢', dot:'#0d7a4a' },
};

const TYPE_LABELS = {
  lecture_hall:     'Lecture Hall',
  lab:              'Lab',
  office:           'Office',
  amphitheater:     'Amphitheater',
  bathroom:         'Bathroom',
  professor_lounge: 'Professor Lounge',
  storage:          'Storage Room',
};

const TYPE_ICONS = {
  lecture_hall:     '🎓',
  lab:              '🔬',
  office:           '💼',
  amphitheater:     '🎭',
  bathroom:         '🚻',
  professor_lounge: '☕',
  storage:          '📦',
};

export default function RoomPopup({ roomData, onClose, onNavigate }) {
  // Close on Escape key
  useEffect(() => {
    if (!roomData) return;
    const handler = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [roomData, onClose]);

  if (!roomData) return null;

  const status = STATUS[roomData.status] || STATUS.available;

  return (
    <>
      {/* Backdrop */}
      <div className="rp-backdrop" onClick={onClose}/>

      {/* Modal */}
      <div className="rp-modal" role="dialog" aria-modal="true">
        {/* Header */}
        <div className="rp-header" style={{ background: status.color }}>
          <div className="rp-header-content">
            <div className="rp-room-num">{roomData.number}</div>
            <div className="rp-room-name">{roomData.name}</div>
          </div>
          <button className="rp-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Live status badge */}
        <div className="rp-status-bar" style={{ background: status.bg, borderColor: status.border }}>
          <div className="rp-status-dot" style={{ background: status.dot }}/>
          <div className="rp-status-info">
            <div className="rp-status-label" style={{ color: status.color }}>
              {status.icon} {status.label} Now
            </div>
            <div className="rp-status-time">
              {new Date().toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' })}
            </div>
          </div>
          <span className="rp-live-badge">LIVE</span>
        </div>

        {/* Body */}
        <div className="rp-body">

          {/* Current lecture (if occupied/reserved) */}
          {roomData.current && (
            <div className="rp-current-lecture" style={{ borderLeft: `3px solid ${status.color}` }}>
              <div className="rp-section-title">
                {roomData.status === 'reserved' ? '📌 Reserved Now' : '📚 Current Lecture'}
              </div>
              <div className="rp-lecture-name">{roomData.current.course}</div>
              <div className="rp-lecture-meta">
                <div className="rp-meta-row">
                  <span className="rp-meta-label">👨‍🏫 Lecturer</span>
                  <span className="rp-meta-value">{roomData.current.instructor}</span>
                </div>
                <div className="rp-meta-row">
                  <span className="rp-meta-label">⏰ Time</span>
                  <span className="rp-meta-value rp-meta-time">
                    {roomData.current.startTime} – {roomData.current.endTime}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Next lecture (if available) */}
          {!roomData.current && roomData.next && (
            <div className="rp-next-lecture">
              <div className="rp-section-title">⏭ Next Lecture</div>
              <div className="rp-lecture-name">{roomData.next.course}</div>
              <div className="rp-lecture-meta">
                <div className="rp-meta-row">
                  <span className="rp-meta-label">👨‍🏫</span>
                  <span className="rp-meta-value">{roomData.next.instructor}</span>
                </div>
                <div className="rp-meta-row">
                  <span className="rp-meta-label">⏰</span>
                  <span className="rp-meta-value rp-meta-time">
                    Starts at {roomData.next.startTime}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!roomData.current && !roomData.next && (
            <div className="rp-empty-state">
              <div className="rp-empty-icon">✨</div>
              <div className="rp-empty-text">No classes scheduled today</div>
              <div className="rp-empty-sub">This room is free all day</div>
            </div>
          )}

          {/* Room Info Grid */}
          <div className="rp-info-grid">
            <div className="rp-info-item">
              <div className="rp-info-label">Type</div>
              <div className="rp-info-value">
                {TYPE_ICONS[roomData.type] || '🏢'} {TYPE_LABELS[roomData.type] || roomData.type}
              </div>
            </div>
            <div className="rp-info-item">
              <div className="rp-info-label">Floor</div>
              <div className="rp-info-value">📐 {roomData.floor}</div>
            </div>
            {roomData.capacity && (
              <div className="rp-info-item">
                <div className="rp-info-label">Capacity</div>
                <div className="rp-info-value">👥 {roomData.capacity} seats</div>
              </div>
            )}
            <div className="rp-info-item">
              <div className="rp-info-label">Building</div>
              <div className="rp-info-value">🏛️ Engineering</div>
            </div>
          </div>

          {/* Today's full schedule */}
          {roomData.todaySchedule && roomData.todaySchedule.length > 0 && (
            <div className="rp-schedule">
              <div className="rp-section-title">📅 Today's Schedule</div>
              {roomData.todaySchedule.map((s, i) => {
                const itemStatus = STATUS[s.status] || STATUS.occupied;
                const isCurrent  = s === roomData.current;
                return (
                  <div key={i} className={`rp-schedule-item ${isCurrent ? 'rp-schedule-item--current' : ''}`}>
                    <div className="rp-schedule-dot" style={{ background: itemStatus.dot }}/>
                    <div className="rp-schedule-info">
                      <div className="rp-schedule-time">{s.startTime} – {s.endTime}</div>
                      <div className="rp-schedule-course">{s.course}</div>
                      <div className="rp-schedule-instructor">{s.instructor}</div>
                    </div>
                    {isCurrent && <span className="rp-schedule-now">NOW</span>}
                  </div>
                );
              })}
            </div>
          )}

          {/* Action buttons */}
          <div className="rp-actions">
            {onNavigate && (
              <button className="rp-btn rp-btn--primary" onClick={() => onNavigate(roomData)}>
                ↗ Navigate to this Room
              </button>
            )}
            <button className="rp-btn rp-btn--secondary" onClick={onClose}>Close</button>
          </div>

        </div>
      </div>
    </>
  );
}

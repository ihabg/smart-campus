import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMySchedule } from '../hooks/index';
import { Spinner, Badge } from '../components/ui/index';
import { formatTime, daysArrayToString, dayName, roomTypeBadgeClass, semesterLabel } from '../utils/helpers';
import './SchedulePage.css';

const DAYS = [0, 1, 2, 3, 4, 5]; // Sun–Fri (Palestinian academic week)

export default function SchedulePage() {
  const [view,     setView]     = useState('week'); // 'week' | 'list'
  const [semester, setSemester] = useState('spring');
  const [year,     setYear]     = useState('2025/2026');

  const { schedule, loading, error } = useMySchedule({ semester, academic_year: year });
  const { sections, by_day } = schedule;

  if (loading) return <Spinner center />;
  if (error)   return <div className="empty-state"><p>{error}</p></div>;

  return (
    <div className="schedule-page">
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title">My Schedule</h1>
          <p className="page-sub">{sections.length} section{sections.length !== 1 ? 's' : ''} enrolled</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="form-input" value={semester} onChange={e => setSemester(e.target.value)} style={{ width: 'auto' }}>
            <option value="fall">Fall</option>
            <option value="spring">Spring</option>
            <option value="summer">Summer</option>
          </select>
          <select className="form-input" value={year} onChange={e => setYear(e.target.value)} style={{ width: 'auto' }}>
            <option value="2025/2026">2025/2026</option>
            <option value="2024/2025">2024/2025</option>
          </select>
          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            {['week', 'list'].map(v => (
              <button
                key={v}
                className={`btn btn--sm ${view === v ? 'btn--primary' : 'btn--ghost'}`}
                style={{ borderRadius: 0, border: 'none' }}
                onClick={() => setView(v)}
              >
                {v === 'week' ? 'Week View' : 'List View'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {sections.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state__icon">📅</div>
            <p className="empty-state__title">No sections enrolled</p>
            <p className="empty-state__sub">You are not enrolled in any sections for {semesterLabel(semester)} {year}.</p>
          </div>
        </div>
      ) : view === 'week' ? (
        <WeekView byDay={by_day} />
      ) : (
        <ListView sections={sections} />
      )}
    </div>
  );
}

// ─── Week view ────────────────────────────────────────────────
function WeekView({ byDay }) {
  const today = new Date().getDay();

  return (
    <div className="week-view">
      {DAYS.map(day => (
        <div key={day} className={`week-day ${day === today ? 'week-day--today' : ''}`}>
          <div className="week-day__header">
            <span className="week-day__name">{dayName(day)}</span>
            {day === today && <Badge variant="green">Today</Badge>}
          </div>
          <div className="week-day__classes">
            {(byDay[day] || []).length === 0 ? (
              <div className="week-day__empty">Free</div>
            ) : (
              (byDay[day] || []).map(sec => (
                <ClassCard key={sec.section_id} sec={sec} />
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── List view ────────────────────────────────────────────────
function ListView({ sections }) {
  return (
    <div className="card card--no-pad">
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Course</th>
              <th>Section</th>
              <th>Days</th>
              <th>Time</th>
              <th>Room</th>
              <th>Instructor</th>
              <th>Credits</th>
            </tr>
          </thead>
          <tbody>
            {sections.map(sec => (
              <tr key={sec.section_id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{sec.course_code}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sec.course_name}</div>
                </td>
                <td style={{ fontFamily: 'monospace' }}>{sec.section_number}</td>
                <td>{daysArrayToString(sec.day_of_week)}</td>
                <td style={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                  {formatTime(sec.start_time)} – {formatTime(sec.end_time)}
                </td>
                <td>
                  {sec.room_number ? (
                    <Link to="/map" state={{ roomId: sec.room_id }}>
                      <Badge variant="gray">Room {sec.room_number}</Badge>
                    </Link>
                  ) : '—'}
                </td>
                <td style={{ fontSize: 12 }}>{sec.instructor_name || '—'}</td>
                <td style={{ textAlign: 'center' }}>{sec.credit_hours || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ClassCard({ sec }) {
  const now = new Date().toTimeString().slice(0, 5);
  const isNow = sec.start_time <= now && sec.end_time > now;

  return (
    <div className={`class-card ${isNow ? 'class-card--active' : ''}`}>
      <div className="class-card__time">
        {formatTime(sec.start_time)} – {formatTime(sec.end_time)}
      </div>
      <div className="class-card__code">{sec.course_code}</div>
      <div className="class-card__name">{sec.course_name}</div>
      {sec.room_number && (
        <Link to="/map" state={{ roomId: sec.room_id }} className="class-card__room">
          📍 {sec.room_number} · {sec.building_code}
        </Link>
      )}
      {sec.instructor_name && (
        <div className="class-card__instructor">{sec.instructor_name}</div>
      )}
      {isNow && <div className="class-card__now-badge">NOW</div>}
    </div>
  );
}

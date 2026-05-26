import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { scheduleAPI } from '../api/index';
import { useAuth } from '../context/AuthContext';
import { Spinner } from '../components/ui/index';
import './RegistrationSummaryPage.css';

// ─── Constants ───────────────────────────────────────────────

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ─── Helpers ─────────────────────────────────────────────────

function fmtTime(t) {
  return t ? String(t).slice(0, 5) : '—';
}

function fmtDaysList(meetings) {
  if (!meetings?.length) return '—';
  const days = [...new Set(meetings.map(m => Number(m.day_of_week)))].sort((a, b) => a - b);
  return days.map(d => DAYS[d]?.slice(0, 3) ?? String(d)).join(', ');
}

function fmtTimeRange(meetings) {
  if (!meetings?.length) return '—';
  const m = meetings[0];
  return `${fmtTime(m.start_time)}–${fmtTime(m.end_time)}`;
}

function firstRoom(meetings) {
  return meetings?.[0]?.room_number || '—';
}

function buildTermLabel(t) {
  if (!t) return '';
  return t.label || `${t.semester.charAt(0).toUpperCase() + t.semester.slice(1)} ${t.academic_year}`;
}

// ─── Page ────────────────────────────────────────────────────

export default function RegistrationSummaryPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [semesters,    setSemesters]    = useState([]);
  const [selectedTerm, setSelectedTerm] = useState(null);
  const [sections,     setSections]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [genDate]                       = useState(() => new Date().toLocaleString());

  // Load published semesters; pre-select from URL params
  useEffect(() => {
    scheduleAPI.getPublishedSemesters()
      .then(res => {
        const sems = res.data?.data?.semesters || [];
        setSemesters(sems);
        const urlSem = searchParams.get('semester');
        const urlAy  = searchParams.get('academic_year');
        const match  = urlSem && urlAy
          ? sems.find(s => s.semester === urlSem && s.academic_year === urlAy)
          : null;
        setSelectedTerm(match || sems[0] || null);
      })
      .catch(() => { setSemesters([]); setLoading(false); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload sections whenever selected term changes
  const loadSections = useCallback(async (term) => {
    if (!term) { setSections([]); setLoading(false); return; }
    setLoading(true);
    try {
      const res = await scheduleAPI.getMy({ semester: term.semester, academic_year: term.academic_year });
      setSections(res.data?.data?.sections || []);
    } catch {
      setSections([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedTerm !== null) loadSections(selectedTerm);
  }, [selectedTerm, loadSections]);

  const handleTermChange = (term) => {
    setSelectedTerm(term);
    if (term) setSearchParams({ semester: term.semester, academic_year: term.academic_year }, { replace: true });
  };

  // ── Derived values ────────────────────────────────────────

  const totalCredits = useMemo(
    () => sections.reduce((s, sec) => s + (Number(sec.credit_hours) || 0), 0),
    [sections]
  );

  const dayGroups = useMemo(() => {
    const g = {};
    for (const sec of sections) {
      for (const m of (sec.meetings || [])) {
        const d = Number(m.day_of_week);
        if (!g[d]) g[d] = [];
        g[d].push({
          start_time:  m.start_time,
          end_time:    m.end_time,
          course_code: sec.course_code,
          course_name: sec.course_name,
          room_number: m.room_number || '—',
        });
      }
    }
    for (const d of Object.keys(g)) {
      g[d].sort((a, b) => (a.start_time > b.start_time ? 1 : -1));
    }
    return g;
  }, [sections]);

  const activeDays = [0, 1, 2, 3, 4, 5, 6].filter(d => dayGroups[d]?.length);
  const label      = buildTermLabel(selectedTerm);

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="rsr-page">

      {/* ── Print-only header ───────────────────────────────── */}
      <div className="rsr-print-header">
        <div className="rsr-print-header__title">Smart Campus — Registration Summary</div>
        <div className="rsr-print-header__inst">An-Najah National University</div>
      </div>

      {/* ── Screen action bar ───────────────────────────────── */}
      <div className="rsr-actions rsr-no-print">
        <Link to="/course-registration" className="rsr-back">
          ← Course Registration
        </Link>
        <button className="rsr-btn rsr-btn--print" onClick={() => window.print()}>
          Print Summary
        </button>
      </div>

      {/* ── Page title + term selector ──────────────────────── */}
      <div className="rsr-page-header">
        <div className="rsr-page-header__left">
          <h1 className="rsr-page-title">Registration Summary</h1>
          {label && <p className="rsr-page-sub">{label}</p>}
        </div>
        <div className="rsr-page-header__right rsr-no-print">
          <label className="rsr-term-label" htmlFor="rsr-term-sel">Term</label>
          <select
            id="rsr-term-sel"
            className="rsr-term-select"
            value={selectedTerm ? `${selectedTerm.semester}||${selectedTerm.academic_year}` : ''}
            onChange={e => {
              const [sem, ay] = e.target.value.split('||');
              handleTermChange(semesters.find(s => s.semester === sem && s.academic_year === ay) || null);
            }}
          >
            {semesters.map(s => (
              <option
                key={`${s.semester}||${s.academic_year}`}
                value={`${s.semester}||${s.academic_year}`}
              >
                {buildTermLabel(s)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Student + semester info ──────────────────────────── */}
      <div className="rsr-info-card">
        <div className="rsr-info-grid">
          <div className="rsr-info-item">
            <span className="rsr-info-label">Student Name</span>
            <span className="rsr-info-value">{user?.first_name} {user?.last_name}</span>
          </div>
          <div className="rsr-info-item">
            <span className="rsr-info-label">Student ID</span>
            <span className="rsr-info-value">{user?.student_id || '—'}</span>
          </div>
          <div className="rsr-info-item">
            <span className="rsr-info-label">Department</span>
            <span className="rsr-info-value">{user?.department || '—'}</span>
          </div>
          <div className="rsr-info-item">
            <span className="rsr-info-label">Year of Study</span>
            <span className="rsr-info-value">{user?.year_of_study ? `Year ${user.year_of_study}` : '—'}</span>
          </div>
          <div className="rsr-info-item">
            <span className="rsr-info-label">Semester</span>
            <span className="rsr-info-value">{label || '—'}</span>
          </div>
          <div className="rsr-info-item">
            <span className="rsr-info-label">Generated</span>
            <span className="rsr-info-value rsr-info-value--sm">{genDate}</span>
          </div>
        </div>
      </div>

      {/* ── Stats strip ─────────────────────────────────────── */}
      <div className="rsr-stats">
        <div className="rsr-stat-card rsr-stat-card--blue">
          <span className="rsr-stat-val">{loading ? '—' : sections.length}</span>
          <span className="rsr-stat-label">Registered Courses</span>
        </div>
        <div className="rsr-stat-card rsr-stat-card--green">
          <span className="rsr-stat-val">{loading ? '—' : totalCredits}</span>
          <span className="rsr-stat-label">Total Credit Hours</span>
        </div>
      </div>

      {/* ── Main content ────────────────────────────────────── */}
      {loading ? (
        <div className="rsr-loading"><Spinner /></div>
      ) : sections.length === 0 ? (
        <div className="rsr-empty">
          <div className="rsr-empty__icon">📋</div>
          <p className="rsr-empty__title">No registrations yet</p>
          <p className="rsr-empty__sub">
            You are not registered in any courses for {label || 'this semester'} yet.
          </p>
          <Link to="/course-registration" className="rsr-btn rsr-btn--primary">
            Go to Course Registration
          </Link>
        </div>
      ) : (
        <>
          {/* ── Registered courses ──────────────────────────── */}
          <div className="rsr-section-header">Registered Courses</div>
          <div className="rsr-table-wrap">
            <table className="rsr-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Course Name</th>
                  <th>Cr</th>
                  <th>Sec</th>
                  <th>Instructor</th>
                  <th>Days / Time</th>
                  <th>Room</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sections.map(sec => (
                  <tr key={sec.section_id}>
                    <td data-label="Code" className="rsr-td--code">{sec.course_code}</td>
                    <td data-label="Course">
                      <div className="rsr-td-name">{sec.course_name}</div>
                      {sec.course_name_ar && (
                        <div className="rsr-td-name-ar">{sec.course_name_ar}</div>
                      )}
                    </td>
                    <td data-label="Cr">{sec.credit_hours}</td>
                    <td data-label="Sec">{String(sec.section_number).padStart(2, '0')}</td>
                    <td data-label="Instructor">{sec.instructor_name || '—'}</td>
                    <td data-label="Days/Time">
                      <span className="rsr-td-days">{fmtDaysList(sec.meetings)}</span>
                      <span className="rsr-td-time">{fmtTimeRange(sec.meetings)}</span>
                    </td>
                    <td data-label="Room">{firstRoom(sec.meetings)}</td>
                    <td data-label="Status">
                      <span className="rsr-status-badge">Registered</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="rsr-table__totals">
                  <td colSpan="2">Total</td>
                  <td>{totalCredits} cr</td>
                  <td colSpan="5" />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* ── Weekly schedule ─────────────────────────────── */}
          {activeDays.length > 0 && (
            <>
              <div className="rsr-section-header">Weekly Schedule</div>
              <div className="rsr-schedule">
                {activeDays.map(dayIdx => (
                  <div key={dayIdx} className="rsr-day-group">
                    <div className="rsr-day-label">{DAYS[dayIdx]}</div>
                    <div className="rsr-day-meetings">
                      {dayGroups[dayIdx].map((m, i) => (
                        <div key={i} className="rsr-meeting">
                          <span className="rsr-meeting__time">
                            {fmtTime(m.start_time)}–{fmtTime(m.end_time)}
                          </span>
                          <span className="rsr-meeting__code">{m.course_code}</span>
                          <span className="rsr-meeting__name">{m.course_name}</span>
                          <span className="rsr-meeting__room">{m.room_number}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

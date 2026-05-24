import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { studentAPI } from '../api/index';
import { Spinner, Badge } from '../components/ui/index';
import { getErrorMessage } from '../utils/helpers';
import './StudyPlanPage.css';

// ─── Helpers ──────────────────────────────────────────────────

const SEMESTER_LABELS = { fall: 'Fall', spring: 'Spring', summer: 'Summer' };

function semesterLabel(semester, academicYear) {
  return `${SEMESTER_LABELS[semester] || semester} ${academicYear}`;
}

const STATUS_META = {
  completed:   { label: 'Completed',      css: 'sp-badge--completed'   },
  in_progress: { label: 'In Progress',    css: 'sp-badge--in_progress' },
  failed:      { label: 'Needs Repeat',   css: 'sp-badge--failed'      },
  dropped:     { label: 'Dropped',        css: 'sp-badge--dropped'     },
};

const FILTERS = [
  { key: 'all',         label: 'All' },
  { key: 'completed',   label: 'Completed' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'failed',      label: 'Needs Repeat' },
  { key: 'dropped',     label: 'Dropped' },
];

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || { label: status, css: 'sp-badge--dropped' };
  return <span className={`sp-badge ${meta.css}`}>{meta.label}</span>;
}

// Group a flat list of enrollments into semester buckets.
// Order is preserved from the server (most recent first).
function groupBySemester(enrollments) {
  const groups = [];
  const seenKeys = new Map();
  for (const e of enrollments) {
    const key = `${e.academic_year}||${e.semester}`;
    if (!seenKeys.has(key)) {
      const g = { key, semester: e.semester, academic_year: e.academic_year, courses: [] };
      seenKeys.set(key, g);
      groups.push(g);
    }
    seenKeys.get(key).courses.push(e);
  }
  return groups;
}

// ─── Study Plan Page ──────────────────────────────────────────

export default function StudyPlanPage() {
  const { user } = useAuth();

  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [data,        setData]        = useState(null);   // full API response
  const [search,      setSearch]      = useState('');
  const [activeFilter, setFilter]     = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await studentAPI.getStudyPlan();
      setData(res.data?.data || null);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Loading ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="sp-page">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', gap: 12, color: 'var(--text-muted)', fontSize: 13 }}>
          <Spinner />
          <span>Loading academic progress…</span>
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="sp-page">
        <div className="page-header"><h1 className="page-title">Study Plan</h1></div>
        <div className="card" style={{ textAlign: 'center', padding: '40px 24px' }}>
          <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 16 }}>{error}</div>
          <button onClick={load} style={{ padding: '8px 22px', background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { student, summary, enrollments, has_official_plan } = data;

  // ── Filter + search ──────────────────────────────────────────
  const q = search.trim().toLowerCase();

  const filtered = enrollments.filter(e => {
    if (activeFilter !== 'all' && e.computed_status !== activeFilter) return false;
    if (q) {
      const match =
        (e.course_code || '').toLowerCase().includes(q) ||
        (e.course_name || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const groups = groupBySemester(filtered);

  const initials =
    `${student?.first_name?.[0] || ''}${student?.last_name?.[0] || ''}`.toUpperCase();

  return (
    <div className="sp-page">

      {/* ── Page title ── */}
      <div className="page-header">
        <h1 className="page-title">Study Plan</h1>
      </div>

      {/* ── Student identity bar ── */}
      <div className="sp-student-bar card">
        <div className="sp-student-bar__avatar">
          {user?.avatar_url
            ? <img src={user.avatar_url} alt="" />
            : initials
          }
        </div>
        <div className="sp-student-bar__info">
          <div className="sp-student-bar__name">
            {student.first_name} {student.last_name}
          </div>
          <div className="sp-student-bar__meta">
            <Badge variant="blue">Student</Badge>
            {student.registration_number && (
              <Badge variant="gray">{student.registration_number}</Badge>
            )}
            {student.department && (
              <Badge variant="gray">{student.department}</Badge>
            )}
            {student.year_of_study && (
              <Badge variant="gray">Year {student.year_of_study}</Badge>
            )}
            {student.registration_year && (
              <Badge variant="gray">Batch {student.registration_year}</Badge>
            )}
          </div>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="sp-summary">
        <div className="sp-stat">
          <div className="sp-stat__label">Completed Hours</div>
          <div className={`sp-stat__value ${summary.completed_credit_hours > 0 ? 'sp-stat__value--green' : ''}`}>
            {summary.completed_credit_hours}
          </div>
        </div>
        <div className="sp-stat">
          <div className="sp-stat__label">In Progress Hours</div>
          <div className={`sp-stat__value ${summary.in_progress_credit_hours > 0 ? 'sp-stat__value--blue' : ''}`}>
            {summary.in_progress_credit_hours}
          </div>
        </div>
        <div className="sp-stat">
          <div className="sp-stat__label">Courses Passed</div>
          <div className={`sp-stat__value ${summary.completed_courses > 0 ? 'sp-stat__value--green' : ''}`}>
            {summary.completed_courses}
          </div>
        </div>
        <div className="sp-stat">
          <div className="sp-stat__label">Needs Repeat</div>
          <div className={`sp-stat__value ${summary.failed_courses > 0 ? 'sp-stat__value--red' : ''}`}>
            {summary.failed_courses}
          </div>
        </div>
      </div>

      {/* ── Pending official plan notice ──
          Always shown in Phase 1 (has_official_plan === false).
          In Phase 2 this card is hidden once the admin imports the plan. */}
      {!has_official_plan && (
        <div className="sp-pending">
          <span className="sp-pending__icon">📋</span>
          <div>
            <div className="sp-pending__title">Official Study Plan Not Configured Yet</div>
            <p className="sp-pending__desc">
              Your course history is shown below based on your enrollment records and grades.
              Required courses, &ldquo;Not Taken&rdquo; courses, and prerequisite chains will appear here
              once your department&apos;s study plan is imported by the university administrator.
            </p>
          </div>
        </div>
      )}

      {/* ── No enrollments at all ── */}
      {enrollments.length === 0 && (
        <div className="card sp-empty">
          <div className="sp-empty__icon">📚</div>
          <div>No enrollment records found.</div>
          <div style={{ marginTop: 6, fontSize: 12 }}>
            Enroll in courses via{' '}
            <Link to="/schedule" style={{ color: 'var(--navy)', fontWeight: 600 }}>My Schedule</Link>.
          </div>
        </div>
      )}

      {enrollments.length > 0 && (
        <>
          {/* ── Controls ── */}
          <div className="sp-controls">
            <input
              className="sp-search"
              placeholder="Search by code or course name…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <div className="sp-filters">
              {FILTERS.map(f => (
                <button
                  key={f.key}
                  className={`sp-filter-btn${activeFilter === f.key ? ' sp-filter-btn--active' : ''}`}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── No results after filter/search ── */}
          {filtered.length === 0 && (
            <div className="card sp-empty">
              <div className="sp-empty__icon">🔍</div>
              <div>No courses match your current filter.</div>
            </div>
          )}

          {/* ── Semester groups ── */}
          {groups.map(group => (
            <div key={group.key} className="sp-group">

              <div className="sp-group-head">
                <span className="sp-group-head__label">
                  {semesterLabel(group.semester, group.academic_year)}
                </span>
                <span className="sp-group-head__count">
                  {group.courses.length} course{group.courses.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Desktop table */}
              <div className="sp-table-wrap">
                <table className="sp-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Course</th>
                      <th style={{ textAlign: 'center' }}>Hours</th>
                      <th style={{ textAlign: 'center' }}>Grade</th>
                      <th style={{ textAlign: 'right' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.courses.map(e => (
                      <tr key={e.enrollment_id}>
                        <td>
                          <span className="sp-table__code">{e.course_code}</span>
                        </td>
                        <td>
                          <div className="sp-table__name">{e.course_name}</div>
                          {e.course_name_ar && (
                            <div className="sp-table__name-ar">{e.course_name_ar}</div>
                          )}
                        </td>
                        <td className="sp-table__hours">{e.credit_hours}</td>
                        <td>
                          <span
                            className="sp-table__grade"
                            style={{
                              color: e.letter_grade === 'E'
                                ? '#dc2626'
                                : e.letter_grade
                                  ? '#16a34a'
                                  : 'var(--text-muted)',
                            }}
                          >
                            {e.letter_grade || '—'}
                          </span>
                        </td>
                        <td>
                          <StatusBadge status={e.computed_status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile card list */}
              <div className="sp-card-list">
                {group.courses.map(e => (
                  <div key={e.enrollment_id} className="sp-course-card">
                    <div className="sp-course-card__top">
                      <div>
                        <div className="sp-course-card__code">{e.course_code}</div>
                        <div className="sp-course-card__name">{e.course_name}</div>
                        {e.course_name_ar && (
                          <div className="sp-course-card__name-ar">{e.course_name_ar}</div>
                        )}
                      </div>
                      <StatusBadge status={e.computed_status} />
                    </div>
                    <div className="sp-course-card__footer">
                      <span>{e.credit_hours} credit hour{e.credit_hours !== 1 ? 's' : ''}</span>
                      {e.letter_grade ? (
                        <span
                          className="sp-course-card__grade"
                          style={{ color: e.letter_grade === 'E' ? '#dc2626' : '#16a34a' }}
                        >
                          Grade: {e.letter_grade}
                          {e.total_grade != null ? ` (${Math.round(e.total_grade)})` : ''}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>No grade recorded</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

            </div>
          ))}
        </>
      )}
    </div>
  );
}

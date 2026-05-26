import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { studentAPI } from '../api/index';
import { Spinner, Badge } from '../components/ui/index';
import { getErrorMessage } from '../utils/helpers';
import { publicUrl } from '../utils/publicUrl';
import './StudyPlanPage.css';

// ─── Helpers ──────────────────────────────────────────────────

const SEMESTER_LABELS = { fall: 'Fall', spring: 'Spring', summer: 'Summer' };

// Maps internal category keys → display labels (EN + AR).
// Includes legacy keys as fallbacks in case any cached data still uses them.
const CAT_LABEL = {
  major_required:      'Major Required',      // إجباري تخصص
  university_required: 'University Required', // إجباري جامعة
  major_elective:      'Major Elective',      // اختياري تخصص
  free_elective:       'Free Elective',       // مساق حر
  // legacy fallbacks
  required:            'Required',
  elective:            'Elective',
  general:             'General',
};

const CAT_CSS = {
  major_required:      'sp-cat-tag--major-req',
  university_required: 'sp-cat-tag--univ-req',
  major_elective:      'sp-cat-tag--major-elec',
  free_elective:       'sp-cat-tag--free-elec',
};

function semesterLabel(semester, academicYear) {
  return `${SEMESTER_LABELS[semester] || semester} ${academicYear}`;
}

const STATUS_META = {
  completed:   { label: 'Completed',    css: 'sp-badge--completed'   },
  in_progress: { label: 'In Progress',  css: 'sp-badge--in_progress' },
  failed:      { label: 'Needs Repeat', css: 'sp-badge--failed'      },
  dropped:     { label: 'Dropped',      css: 'sp-badge--dropped'     },
  not_taken:   { label: 'Not Taken',    css: 'sp-badge--not_taken'   },
};

const FILTERS = [
  { key: 'all',         label: 'All'          },
  { key: 'completed',   label: 'Completed'    },
  { key: 'in_progress', label: 'In Progress'  },
  { key: 'failed',      label: 'Needs Repeat' },
  { key: 'dropped',     label: 'Dropped'      },
  { key: 'not_taken',   label: 'Not Taken'    },
];

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || { label: status, css: 'sp-badge--dropped' };
  return <span className={`sp-badge ${meta.css}`}>{meta.label}</span>;
}

function groupBySemester(enrollments) {
  const groups   = [];
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

function groupByYear(planCourses) {
  const yearMap = new Map();
  for (const c of planCourses) {
    const key = c.recommended_year ?? 0;
    if (!yearMap.has(key)) yearMap.set(key, []);
    yearMap.get(key).push(c);
  }
  const keys = [...yearMap.keys()].sort((a, b) => a === 0 ? 1 : b === 0 ? -1 : a - b);
  return keys.map(k => ({ year: k, courses: yearMap.get(k) }));
}

// ─── Study Plan Page ──────────────────────────────────────────

export default function StudyPlanPage() {
  const { user } = useAuth();

  const [loading,      setLoading]   = useState(true);
  const [error,        setError]     = useState(null);
  const [data,         setData]      = useState(null);
  const [search,       setSearch]    = useState('');
  const [activeFilter, setFilter]    = useState('all');
  const [activeTab,    setActiveTab] = useState('plan');

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
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'80px 24px', gap:12, color:'var(--text-muted)', fontSize:13 }}>
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
        <div className="card" style={{ textAlign:'center', padding:'40px 24px' }}>
          <div style={{ color:'#dc2626', fontSize:13, marginBottom:16 }}>{error}</div>
          <button onClick={load} style={{ padding:'8px 22px', background:'var(--navy)', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:600 }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { student, summary, gpa_summary = {}, enrollments, has_official_plan, plan_meta, plan_courses = [] } = data;

  const semGpaMap = new Map(
    (gpa_summary.semester_gpa || []).map(g => [`${g.academic_year}||${g.semester}`, g.gpa])
  );

  const FAILING = new Set(['D-', 'E']);
  function gradeColor(letter) {
    if (!letter) return 'var(--text-muted)';
    return FAILING.has(letter) ? '#dc2626' : '#16a34a';
  }

  // The effective tab: force 'history' when no official plan exists
  const tab = has_official_plan ? activeTab : 'history';

  // Switch tab and reset search/filter so state doesn't bleed across tabs
  function switchTab(t) {
    setActiveTab(t);
    setSearch('');
    setFilter('all');
  }

  const q = search.trim().toLowerCase();

  // ── Filtered datasets per tab ────────────────────────────────

  const planFiltered = plan_courses.filter(c => {
    if (activeFilter !== 'all' && c.computed_status !== activeFilter) return false;
    if (q) return (
      (c.course_code || '').toLowerCase().includes(q) ||
      (c.course_name || '').toLowerCase().includes(q)
    );
    return true;
  });
  const planGroups = groupByYear(planFiltered);

  const histFiltered = enrollments.filter(e => {
    if (activeFilter !== 'all' && e.computed_status !== activeFilter) return false;
    if (q) return (
      (e.course_code || '').toLowerCase().includes(q) ||
      (e.course_name || '').toLowerCase().includes(q)
    );
    return true;
  });
  const histGroups = groupBySemester(histFiltered);

  // ── Plan progress stats (always based on unfiltered list) ────
  const requiredTotal     = plan_courses.filter(c => c.is_required).length;
  const requiredCompleted = plan_courses.filter(c => c.is_required && c.computed_status === 'completed').length;

  const initials =
    `${student?.first_name?.[0] || ''}${student?.last_name?.[0] || ''}`.toUpperCase();

  // Show search/filter only when the active tab has something to search
  const showControls = tab === 'plan' ? plan_courses.length > 0 : enrollments.length > 0;

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
            ? <img src={publicUrl(user.avatar_url)} alt="" />
            : initials
          }
        </div>
        <div className="sp-student-bar__info">
          <div className="sp-student-bar__name">
            {student.first_name} {student.last_name}
          </div>
          <div className="sp-student-bar__meta">
            <Badge variant="blue">Student</Badge>
            {student.registration_number && <Badge variant="gray">{student.registration_number}</Badge>}
            {student.department         && <Badge variant="gray">{student.department}</Badge>}
            {student.year_of_study      && <Badge variant="gray">Year {student.year_of_study}</Badge>}
            {student.registration_year  && <Badge variant="gray">Batch {student.registration_year}</Badge>}
          </div>
        </div>
      </div>

      {/* ── Summary stat cards ── */}
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
        <div className="sp-stat">
          <div className="sp-stat__label">Cumulative GPA</div>
          {gpa_summary.cumulative_gpa !== null && gpa_summary.cumulative_gpa !== undefined ? (
            <div className={`sp-stat__value ${
              gpa_summary.cumulative_gpa >= 3.0 ? 'sp-stat__value--green' :
              gpa_summary.cumulative_gpa >= 2.0 ? 'sp-stat__value--blue'  :
              'sp-stat__value--red'
            }`}>
              {gpa_summary.cumulative_gpa.toFixed(2)}
            </div>
          ) : (
            <>
              <div className="sp-stat__value">—</div>
              <div className="sp-stat__sub">Not available yet</div>
            </>
          )}
        </div>
      </div>

      {/* ── Pending banner: shown when no official plan (Phase 1) ── */}
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

      {/* ── Tab strip: only when official plan exists ── */}
      {has_official_plan && (
        <div className="sp-tabs">
          <button
            className={`sp-tab${tab === 'plan' ? ' sp-tab--active' : ''}`}
            onClick={() => switchTab('plan')}
          >
            Official Study Plan
          </button>
          <button
            className={`sp-tab${tab === 'history' ? ' sp-tab--active' : ''}`}
            onClick={() => switchTab('history')}
          >
            Enrollment History
            {enrollments.length > 0 && (
              <span className="sp-tab__count">{enrollments.length}</span>
            )}
          </button>
        </div>
      )}

      {/* ── Search / filter (applies to the active tab) ── */}
      {showControls && (
        <div className="sp-controls">
          <input
            className="sp-search"
            placeholder={tab === 'plan' ? 'Search plan courses by code or name…' : 'Search by code or course name…'}
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
      )}

      {/* ════════════════════════════════════════════════════════
          OFFICIAL STUDY PLAN TAB
          ════════════════════════════════════════════════════════ */}
      {tab === 'plan' && (
        <>
          {/* Plan header card */}
          {has_official_plan && plan_meta && (
            <div className="sp-official-plan__head">
              <div>
                <div className="sp-official-plan__title">Official Study Plan</div>
                <div className="sp-official-plan__meta">
                  {plan_meta.department_name} &middot; Batch {plan_meta.plan_year}
                  {plan_meta.label && ` · ${plan_meta.label}`}
                </div>
              </div>
              {requiredTotal > 0 && (
                <div className="sp-official-plan__progress">
                  <span className="sp-official-plan__progress-val">{requiredCompleted}</span>
                  <span className="sp-official-plan__progress-sep"> / {requiredTotal}</span>
                  <span className="sp-official-plan__progress-label"> required completed</span>
                </div>
              )}
            </div>
          )}

          {/* No courses in plan */}
          {plan_courses.length === 0 && (
            <div className="card sp-empty">
              <div className="sp-empty__icon">📋</div>
              <div>No courses have been added to this study plan yet.</div>
            </div>
          )}

          {/* No results after filter/search */}
          {plan_courses.length > 0 && planFiltered.length === 0 && (
            <div className="card sp-empty">
              <div className="sp-empty__icon">🔍</div>
              <div>No plan courses match your current filter.</div>
            </div>
          )}

          {/* Year-grouped plan courses */}
          {planGroups.map(({ year, courses }) => (
            <div key={year} className="sp-group">
              <div className="sp-group-head">
                <span className="sp-group-head__label">
                  {year === 0 ? 'Other Courses' : `Year ${year}`}
                </span>
                <span className="sp-group-head__count">
                  {courses.length} course{courses.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Desktop table */}
              <div className="sp-table-wrap">
                <table className="sp-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Course</th>
                      <th style={{ textAlign:'center' }}>Hours</th>
                      <th style={{ textAlign:'center' }}>Category</th>
                      <th style={{ textAlign:'center' }}>Grade</th>
                      <th style={{ textAlign:'right'  }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {courses.map(c => (
                      <tr key={c.plan_course_id}>
                        <td><span className="sp-table__code">{c.course_code}</span></td>
                        <td>
                          <div className="sp-table__name">{c.course_name}</div>
                          {c.course_name_ar && (
                            <div className="sp-table__name-ar">{c.course_name_ar}</div>
                          )}
                        </td>
                        <td className="sp-table__hours">{c.credit_hours}</td>
                        <td style={{ textAlign:'center' }}>
                          <span className={`sp-cat-tag ${CAT_CSS[c.category] || ''}`}>
                            {CAT_LABEL[c.category] || c.category}
                          </span>
                        </td>
                        <td>
                          <span
                            className="sp-table__grade"
                            style={{ color: gradeColor(c.letter_grade) }}
                          >
                            {c.letter_grade || '—'}
                          </span>
                        </td>
                        <td style={{ textAlign:'right' }}>
                          <StatusBadge status={c.computed_status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="sp-card-list">
                {courses.map(c => (
                  <div key={c.plan_course_id} className="sp-course-card">
                    <div className="sp-course-card__top">
                      <div>
                        <div className="sp-course-card__code">{c.course_code}</div>
                        <div className="sp-course-card__name">{c.course_name}</div>
                        {c.course_name_ar && (
                          <div className="sp-course-card__name-ar">{c.course_name_ar}</div>
                        )}
                      </div>
                      <StatusBadge status={c.computed_status} />
                    </div>
                    <div className="sp-course-card__footer">
                      <span>{c.credit_hours} credit hour{c.credit_hours !== 1 ? 's' : ''}</span>
                      <span className="sp-cat-tag">
                        {c.category.charAt(0).toUpperCase() + c.category.slice(1)}
                      </span>
                      {c.letter_grade ? (
                        <span
                          className="sp-course-card__grade"
                          style={{ color: gradeColor(c.letter_grade) }}
                        >
                          Grade: {c.letter_grade}
                          {c.total_grade != null ? ` (${Math.round(c.total_grade)})` : ''}
                        </span>
                      ) : (
                        <span style={{ color:'var(--text-muted)', fontSize:12 }}>No grade yet</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {/* ════════════════════════════════════════════════════════
          ENROLLMENT HISTORY TAB
          ════════════════════════════════════════════════════════ */}
      {tab === 'history' && (
        <>
          {/* No enrollment records at all */}
          {enrollments.length === 0 && (
            <div className="card sp-empty">
              <div className="sp-empty__icon">📚</div>
              <div>No enrollment records found.</div>
              <div style={{ marginTop:6, fontSize:12 }}>
                Enroll in courses via{' '}
                <Link to="/schedule" style={{ color:'var(--navy)', fontWeight:600 }}>My Schedule</Link>.
              </div>
            </div>
          )}

          {/* No results after filter/search */}
          {enrollments.length > 0 && histFiltered.length === 0 && (
            <div className="card sp-empty">
              <div className="sp-empty__icon">🔍</div>
              <div>No courses match your current filter.</div>
            </div>
          )}

          {/* Semester-grouped enrollment rows */}
          {histGroups.map(group => {
            const semGpa = semGpaMap.get(`${group.academic_year}||${group.semester}`);
            return (
            <div key={group.key} className="sp-group">
              <div className="sp-group-head">
                <span className="sp-group-head__label">
                  {semesterLabel(group.semester, group.academic_year)}
                </span>
                <span className="sp-group-head__count">
                  {group.courses.length} course{group.courses.length !== 1 ? 's' : ''}
                  {semGpa !== undefined && (
                    <span className="sp-group-head__gpa"> · GPA {semGpa.toFixed(2)}</span>
                  )}
                </span>
              </div>

              {/* Desktop table */}
              <div className="sp-table-wrap">
                <table className="sp-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Course</th>
                      <th style={{ textAlign:'center' }}>Hours</th>
                      <th style={{ textAlign:'center' }}>Grade</th>
                      <th style={{ textAlign:'right'  }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.courses.map(e => (
                      <tr key={e.enrollment_id}>
                        <td><span className="sp-table__code">{e.course_code}</span></td>
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
                            style={{ color: gradeColor(e.letter_grade) }}
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

              {/* Mobile cards */}
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
                          style={{ color: gradeColor(e.letter_grade) }}
                        >
                          Grade: {e.letter_grade}
                          {e.total_grade != null ? ` (${Math.round(e.total_grade)})` : ''}
                        </span>
                      ) : (
                        <span style={{ color:'var(--text-muted)', fontSize:12 }}>No grade recorded</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            );
          })}
        </>
      )}

    </div>
  );
}

import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { studentAPI } from '../api/index';
import { Spinner, Badge } from '../components/ui/index';
import { getErrorMessage } from '../utils/helpers';
import './StudyPlanPage.css';

// ─── Constants ────────────────────────────────────────────────

const SEMESTER_LABELS = { fall: 'Fall', spring: 'Spring', summer: 'Summer' };

const CAT_LABEL = {
  major_required:      'Major Required',
  university_required: 'University Required',
  major_elective:      'Major Elective',
  free_elective:       'Free Elective',
  // legacy fallbacks
  required: 'Required', elective: 'Elective', general: 'General',
};

const CAT_AR = {
  major_required:      'إجباري تخصص',
  university_required: 'إجباري جامعة',
  major_elective:      'اختياري تخصص',
  free_elective:       'مساق حر',
};

const CAT_CSS = {
  major_required:      'sp-cat-tag--major-req',
  university_required: 'sp-cat-tag--univ-req',
  major_elective:      'sp-cat-tag--major-elec',
  free_elective:       'sp-cat-tag--free-elec',
};

const CAT_ACCENT = {
  major_required:      'major-req',
  university_required: 'univ-req',
  major_elective:      'major-elec',
  free_elective:       'free-elec',
};

const CAT_ORDER     = ['major_required', 'university_required', 'major_elective', 'free_elective'];
const ELECTIVE_CATS = new Set(['major_elective', 'free_elective']);
const FAILING       = new Set(['D-', 'E']);
const SEM_RANK      = { fall: 1, spring: 2, summer: 3 };

function gradeColor(letter) {
  if (!letter) return 'var(--text-muted)';
  return FAILING.has(letter) ? '#dc2626' : '#16a34a';
}

const STATUS_META = {
  completed:        { label: 'Completed',       css: 'sp-badge--completed'        },
  in_progress:      { label: 'In Progress',      css: 'sp-badge--in_progress'      },
  failed:           { label: 'Needs Repeat',     css: 'sp-badge--failed'           },
  dropped:          { label: 'Dropped',          css: 'sp-badge--dropped'          },
  not_taken:        { label: 'Not Taken',        css: 'sp-badge--not_taken'        },
  available_option: { label: 'Available Option', css: 'sp-badge--available_option' },
};

// Plan-tab filter buttons — includes Available Option
const PLAN_FILTERS = [
  { key: 'all',              label: 'All'              },
  { key: 'completed',        label: 'Completed'        },
  { key: 'in_progress',      label: 'In Progress'      },
  { key: 'failed',           label: 'Needs Repeat'     },
  { key: 'not_taken',        label: 'Not Taken'        },
  { key: 'available_option', label: 'Available Option' },
];

// History-tab filter buttons — no Available Option
const HISTORY_FILTERS = [
  { key: 'all',         label: 'All'          },
  { key: 'completed',   label: 'Completed'    },
  { key: 'in_progress', label: 'In Progress'  },
  { key: 'failed',      label: 'Needs Repeat' },
  { key: 'dropped',     label: 'Dropped'      },
];

// ─── Helpers ──────────────────────────────────────────────────

function semesterLabel(semester, academicYear) {
  return `${SEMESTER_LABELS[semester] || semester} ${academicYear}`;
}

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

// Returns display status for a plan course.
// Elective/free not_taken → 'available_option' (student doesn't have to take every option).
function displayStatus(course, catKey) {
  if (course.computed_status !== 'not_taken') return course.computed_status;
  return ELECTIVE_CATS.has(catKey) ? 'available_option' : 'not_taken';
}

// Groups plan courses by category in the canonical order.
// Within each group sorted by: recommended_year, recommended_semester, sort_order, course_code.
function groupByCategory(planCourses) {
  const map = {};
  for (const cat of CAT_ORDER) map[cat] = [];
  for (const c of planCourses) {
    const cat = CAT_ORDER.includes(c.category) ? c.category : 'major_required';
    map[cat].push(c);
  }
  for (const cat of CAT_ORDER) {
    map[cat].sort((a, b) => {
      const yr = (a.recommended_year ?? 99) - (b.recommended_year ?? 99);
      if (yr !== 0) return yr;
      const sr = (SEM_RANK[a.recommended_semester] ?? 0) - (SEM_RANK[b.recommended_semester] ?? 0);
      if (sr !== 0) return sr;
      const so = (a.sort_order ?? 0) - (b.sort_order ?? 0);
      if (so !== 0) return so;
      return (a.course_code || '').localeCompare(b.course_code || '');
    });
  }
  return CAT_ORDER.map(cat => ({ category: cat, courses: map[cat] }));
}

// Computes progress stats for one category.
function computeCatProgress(catKey, courses, reqs) {
  const req          = (reqs || []).find(r => r.category === catKey);
  const requiredHours = req ? Number(req.required_hours) : 0;

  if (ELECTIVE_CATS.has(catKey)) {
    const completedHours   = courses
      .filter(c => c.computed_status === 'completed')
      .reduce((s, c) => s + Number(c.credit_hours || 0), 0);
    const totalListedHours = courses.reduce((s, c) => s + Number(c.credit_hours || 0), 0);
    const isConfigured     = requiredHours > 0;
    const isSatisfied      = isConfigured && completedHours >= requiredHours;
    return {
      type: 'elective',
      completedHours,
      requiredHours,
      totalListedHours,
      totalOptions: courses.length,
      isConfigured,
      isSatisfied,
    };
  }

  // Required categories: count courses where is_required !== false
  const reqCourses     = courses.filter(c => c.is_required !== false);
  const completedReq   = reqCourses.filter(c => c.computed_status === 'completed').length;
  const completedHours = reqCourses
    .filter(c => c.computed_status === 'completed')
    .reduce((s, c) => s + Number(c.credit_hours || 0), 0);
  const totalHours     = reqCourses.reduce((s, c) => s + Number(c.credit_hours || 0), 0);
  return {
    type: 'required',
    completedCourses: completedReq,
    totalCourses:     reqCourses.length,
    completedHours,
    totalHours,
    requiredHours,
    isSatisfied: reqCourses.length > 0 && completedReq === reqCourses.length,
  };
}

// Aggregates per-category progress into a single plan-level hours summary.
// Required cats: prefer required_hours from config; fallback to sum of listed course hours.
// Elective/free cats: use required_hours only; cap completed at required_hours.
function computePlanProgress(categoryGroups, reqs) {
  let totalPlanHours     = 0;
  let completedPlanHours = 0;
  let hasUnconfigured    = false;

  for (const { category: catKey, courses } of categoryGroups) {
    if (courses.length === 0) continue;
    const prog = computeCatProgress(catKey, courses, reqs);

    if (prog.type === 'required') {
      const catTotal = prog.requiredHours > 0 ? prog.requiredHours : prog.totalHours;
      totalPlanHours     += catTotal;
      completedPlanHours += prog.completedHours;
    } else {
      if (!prog.isConfigured) {
        hasUnconfigured = true;
        // count 0 toward total; completed in unconfigured category not added
      } else {
        totalPlanHours     += prog.requiredHours;
        completedPlanHours += Math.min(prog.completedHours, prog.requiredHours);
      }
    }
  }

  return { totalPlanHours, completedPlanHours, hasUnconfigured };
}

// ─── Category Section ─────────────────────────────────────────

function CategorySection({ catKey, filteredCourses, progress }) {
  const catName = CAT_LABEL[catKey] || catKey;
  const catAr   = CAT_AR[catKey]    || '';
  const accent  = CAT_ACCENT[catKey] || '';

  let statusLabel, statusCls;
  if (progress.type === 'required') {
    if (progress.isSatisfied) { statusLabel = 'Complete';    statusCls = 'sp-cat-status--complete'; }
    else                      { statusLabel = 'In Progress'; statusCls = 'sp-cat-status--progress'; }
  } else {
    if (!progress.isConfigured)     { statusLabel = 'Not Configured';       statusCls = 'sp-cat-status--muted';    }
    else if (progress.isSatisfied)  { statusLabel = 'Requirement Complete'; statusCls = 'sp-cat-status--complete'; }
    else                            { statusLabel = 'Still Needed';         statusCls = 'sp-cat-status--needed';   }
  }

  const showBar = progress.type === 'required'
    ? progress.totalCourses > 0
    : progress.isConfigured;

  let barPct = 0;
  if (showBar) {
    barPct = progress.type === 'required'
      ? Math.min(100, Math.round(progress.completedCourses / progress.totalCourses * 100))
      : Math.min(100, Math.round(progress.completedHours   / progress.requiredHours   * 100));
  }

  return (
    <div className="sp-cat-section">

      {/* Category header card */}
      <div className={`sp-cat-header sp-cat-header--${accent}`}>
        <div className="sp-cat-header__left">
          <div className="sp-cat-header__names">
            <span className="sp-cat-name">{catName}</span>
            {catAr && <span className="sp-cat-name-ar">{catAr}</span>}
          </div>

          {progress.type === 'required' ? (
            <div className="sp-cat-stats">
              <span className="sp-cat-stats__main">
                {progress.completedCourses} / {progress.totalCourses} courses completed
              </span>
              {progress.totalHours > 0 && (
                <span className="sp-cat-stats__sub">
                  {progress.completedHours} / {progress.totalHours} hours
                  {progress.requiredHours > 0 && progress.requiredHours !== progress.totalHours && (
                    <> &middot; {progress.requiredHours}h required</>
                  )}
                </span>
              )}
            </div>
          ) : (
            <div className="sp-cat-stats">
              {progress.isConfigured ? (
                <span className="sp-cat-stats__main">
                  {progress.completedHours} / {progress.requiredHours} hours completed
                  {!progress.isSatisfied && progress.requiredHours > progress.completedHours && (
                    <span className="sp-cat-stats__needed">
                      {' '}&middot; {progress.requiredHours - progress.completedHours}h still needed
                    </span>
                  )}
                </span>
              ) : (
                <span className="sp-cat-stats__muted">Required hours not configured yet</span>
              )}
              <span className="sp-cat-stats__sub">
                {progress.totalOptions} option{progress.totalOptions !== 1 ? 's' : ''} listed
                {progress.totalListedHours > 0 && (
                  <> &middot; {progress.totalListedHours}h available</>
                )}
              </span>
            </div>
          )}
        </div>

        <div className="sp-cat-header__right">
          {showBar && (
            <div className="sp-cat-progress-wrap">
              <div className="sp-cat-progress-bar">
                <div
                  className={`sp-cat-progress-bar__fill sp-cat-progress-bar__fill--${progress.isSatisfied ? 'complete' : 'progress'}`}
                  style={{ width: `${barPct}%` }}
                />
              </div>
              <span className="sp-cat-progress-pct">{barPct}%</span>
            </div>
          )}
          <span className={`sp-cat-status ${statusCls}`}>{statusLabel}</span>
        </div>
      </div>

      {/* Course rows */}
      {filteredCourses.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="sp-table-wrap">
            <table className="sp-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Course</th>
                  <th style={{ textAlign: 'center' }}>Hours</th>
                  <th style={{ textAlign: 'center' }}>Grade</th>
                  <th style={{ textAlign: 'right'  }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredCourses.map(c => (
                  <tr key={c.plan_course_id}>
                    <td><span className="sp-table__code">{c.course_code}</span></td>
                    <td>
                      <div className="sp-table__name">{c.course_name}</div>
                      {c.course_name_ar && <div className="sp-table__name-ar">{c.course_name_ar}</div>}
                    </td>
                    <td className="sp-table__hours">{c.credit_hours}</td>
                    <td>
                      <span className="sp-table__grade" style={{ color: gradeColor(c.letter_grade) }}>
                        {c.letter_grade || '—'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <StatusBadge status={displayStatus(c, catKey)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sp-card-list">
            {filteredCourses.map(c => (
              <div key={c.plan_course_id} className="sp-course-card">
                <div className="sp-course-card__top">
                  <div>
                    <div className="sp-course-card__code">{c.course_code}</div>
                    <div className="sp-course-card__name">{c.course_name}</div>
                    {c.course_name_ar && <div className="sp-course-card__name-ar">{c.course_name_ar}</div>}
                  </div>
                  <StatusBadge status={displayStatus(c, catKey)} />
                </div>
                <div className="sp-course-card__footer">
                  <span>{c.credit_hours} credit hour{c.credit_hours !== 1 ? 's' : ''}</span>
                  <span className={`sp-cat-tag ${CAT_CSS[c.category] || ''}`}>
                    {CAT_LABEL[c.category] || c.category}
                  </span>
                  {c.letter_grade ? (
                    <span className="sp-course-card__grade" style={{ color: gradeColor(c.letter_grade) }}>
                      Grade: {c.letter_grade}{c.total_grade != null ? ` (${Math.round(c.total_grade)})` : ''}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>No grade yet</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
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

  const {
    student,
    summary,
    gpa_summary = {},
    enrollments,
    has_official_plan,
    plan_meta,
    plan_courses          = [],
    category_requirements = [],
  } = data;

  const semGpaMap = new Map(
    (gpa_summary.semester_gpa || []).map(g => [`${g.academic_year}||${g.semester}`, g.gpa])
  );

  const tab = has_official_plan ? activeTab : 'history';

  function switchTab(t) {
    setActiveTab(t);
    setSearch('');
    setFilter('all');
  }

  const q = search.trim().toLowerCase();

  // ── Plan tab: filter + category grouping ─────────────────────

  // Filter uses displayStatus so 'available_option' and 'not_taken' filters work correctly
  const planFiltered = plan_courses.filter(c => {
    const ds = displayStatus(c, c.category);
    if (activeFilter !== 'all' && ds !== activeFilter) return false;
    if (q) return (
      (c.course_code || '').toLowerCase().includes(q) ||
      (c.course_name || '').toLowerCase().includes(q)
    );
    return true;
  });

  const categoryGroups = groupByCategory(plan_courses);
  const filteredIds    = new Set(planFiltered.map(c => c.plan_course_id));

  // Plan header — course count subtext (required categories only, is_required !== false)
  const allRequiredCourses = plan_courses.filter(c => !ELECTIVE_CATS.has(c.category) && c.is_required !== false);
  const requiredTotal      = allRequiredCourses.length;
  const requiredCompleted  = allRequiredCourses.filter(c => c.computed_status === 'completed').length;

  // Plan header — total hours progress (aggregated across all 4 categories)
  const planProgress = computePlanProgress(categoryGroups, category_requirements);
  const planBarPct   = planProgress.totalPlanHours > 0
    ? Math.min(100, Math.round(planProgress.completedPlanHours / planProgress.totalPlanHours * 100))
    : 0;

  // ── History tab filter ───────────────────────────────────────

  const histFiltered = enrollments.filter(e => {
    if (activeFilter !== 'all' && e.computed_status !== activeFilter) return false;
    if (q) return (
      (e.course_code || '').toLowerCase().includes(q) ||
      (e.course_name || '').toLowerCase().includes(q)
    );
    return true;
  });
  const histGroups = groupBySemester(histFiltered);

  const initials      = `${student?.first_name?.[0] || ''}${student?.last_name?.[0] || ''}`.toUpperCase();
  const showControls  = tab === 'plan' ? plan_courses.length > 0 : enrollments.length > 0;
  const activeFilters = tab === 'plan' ? PLAN_FILTERS : HISTORY_FILTERS;

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

      {/* ── Pending banner ── */}
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

      {/* ── Tab strip ── */}
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

      {/* ── Search / filter ── */}
      {showControls && (
        <div className="sp-controls">
          <input
            className="sp-search"
            placeholder={tab === 'plan' ? 'Search plan courses by code or name…' : 'Search by code or course name…'}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="sp-filters">
            {activeFilters.map(f => (
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
              <div className="sp-official-plan__info">
                <div className="sp-official-plan__title">Official Study Plan</div>
                <div className="sp-official-plan__meta">
                  {plan_meta.department_name} &middot; Batch {plan_meta.plan_year}
                  {plan_meta.label && ` · ${plan_meta.label}`}
                </div>
              </div>

              <div className="sp-plan-progress">
                {planProgress.totalPlanHours > 0 ? (
                  <>
                    <div className="sp-plan-progress__hours">
                      <span className="sp-plan-progress__val">{planProgress.completedPlanHours}</span>
                      <span className="sp-plan-progress__sep"> / {planProgress.totalPlanHours}</span>
                      <span className="sp-plan-progress__label"> hours completed</span>
                    </div>
                    <div className="sp-plan-progress-bar">
                      <div
                        className={`sp-plan-progress-bar__fill${planBarPct >= 100 ? ' sp-plan-progress-bar__fill--done' : ''}`}
                        style={{ width: `${planBarPct}%` }}
                      />
                    </div>
                    {requiredTotal > 0 && (
                      <div className="sp-plan-progress__courses">
                        {requiredCompleted} / {requiredTotal} required courses completed
                      </div>
                    )}
                    {planProgress.hasUnconfigured && (
                      <div className="sp-plan-progress__warn">
                        Some category hour requirements are not configured
                      </div>
                    )}
                  </>
                ) : (
                  <div className="sp-plan-progress__unconfigured">
                    Plan hours not configured yet
                  </div>
                )}
              </div>
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

          {/* Category-grouped plan courses */}
          {plan_courses.length > 0 && planFiltered.length > 0 && categoryGroups.map(({ category: catKey, courses: allCourses }) => {
            if (allCourses.length === 0) return null;
            const filteredCourses = allCourses.filter(c => filteredIds.has(c.plan_course_id));
            if (filteredCourses.length === 0) return null;
            return (
              <CategorySection
                key={catKey}
                catKey={catKey}
                filteredCourses={filteredCourses}
                progress={computeCatProgress(catKey, allCourses, category_requirements)}
              />
            );
          })}
        </>
      )}

      {/* ════════════════════════════════════════════════════════
          ENROLLMENT HISTORY TAB
          ════════════════════════════════════════════════════════ */}
      {tab === 'history' && (
        <>
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

          {enrollments.length > 0 && histFiltered.length === 0 && (
            <div className="card sp-empty">
              <div className="sp-empty__icon">🔍</div>
              <div>No courses match your current filter.</div>
            </div>
          )}

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
                            <span className="sp-table__grade" style={{ color: gradeColor(e.letter_grade) }}>
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
                          <span className="sp-course-card__grade" style={{ color: gradeColor(e.letter_grade) }}>
                            Grade: {e.letter_grade}{e.total_grade != null ? ` (${Math.round(e.total_grade)})` : ''}
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

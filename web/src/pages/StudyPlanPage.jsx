import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { studentAPI } from '../api/index';
import { Spinner, Badge } from '../components/ui/index';
import { getErrorMessage } from '../utils/helpers';
import { publicUrl } from '../utils/publicUrl';
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

function semesterOrder(semester) {
  const s = String(semester || '').toLowerCase();
  if (s === 'fall' || s === 'first') return 1;
  if (s === 'spring' || s === 'second') return 2;
  if (s === 'summer') return 3;
  return 9;
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

function advisorStatusClass(status) {
  if (status === 'excellent') return 'sp-advisor-status--excellent';
  if (status === 'good') return 'sp-advisor-status--good';
  if (status === 'blocked') return 'sp-advisor-status--blocked';
  if (status === 'needs_improvement') return 'sp-advisor-status--warning';
  return 'sp-advisor-status--idle';
}

function courseTitle(course) {
  return course?.course_name || course?.name || course?.display_name || course?.course_code || 'Course';
}

function courseCode(course) {
  return course?.course_code || course?.code || '';
}

function courseCategoryLabel(course) {
  const raw = String(course?.category || '').replace(/_/g, ' ').trim();
  if (!raw) return course?.is_required ? 'Required' : 'Elective';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function semesterName(value) {
  return SEMESTER_LABELS[value] || (value ? String(value).charAt(0).toUpperCase() + String(value).slice(1) : 'Suggested');
}

function advisorCourseKind(course) {
  const text = `${course?.course_name || ''} ${course?.course_name_ar || ''} ${course?.category || ''}`.toLowerCase();
  if (/lab|practical|مختبر|عملي/.test(text)) return 'lab';
  if (/elective|اختياري/.test(text)) return 'elective';
  return 'required';
}

function findCourseInPlan(allCourses, ref) {
  if (!ref) return null;
  const refId = String(ref.course_id || ref.prerequisite_id || '').trim();
  const refCode = String(ref.course_code || ref.prerequisite_code || '').trim().toUpperCase();

  return (allCourses || []).find(course => {
    const id = String(course.course_id || '').trim();
    const code = String(course.course_code || '').trim().toUpperCase();
    return (refId && id === refId) || (refCode && code === refCode);
  }) || null;
}

function uniqueCourses(courses) {
  const seen = new Set();
  const out = [];
  for (const course of courses || []) {
    const key = String(course?.course_id || course?.course_code || '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(course);
  }
  return out;
}

function sortFlowCourses(courses) {
  return [...(courses || [])].sort((a, b) => {
    const yearA = Number(a.recommended_year || 99);
    const yearB = Number(b.recommended_year || 99);
    if (yearA !== yearB) return yearA - yearB;
    const sem = semesterOrder(a.recommended_semester) - semesterOrder(b.recommended_semester);
    if (sem !== 0) return sem;
    return String(a.course_code || '').localeCompare(String(b.course_code || ''));
  });
}

function buildAdvisorScheduleFlow(selectedCourses, allCourses = []) {
  const selected = uniqueCourses(selectedCourses);
  const selectedIds = new Set(selected.map(c => String(c.course_id)));
  const selectedCodes = new Set(selected.map(c => String(c.course_code || '').toUpperCase()));

  const prerequisiteCourses = [];
  for (const course of selected) {
    for (const prereq of course.prerequisites || []) {
      const resolved = findCourseInPlan(allCourses, prereq) || {
        course_id: prereq.course_id || prereq.prerequisite_id || prereq.prerequisite_code,
        course_code: prereq.course_code || prereq.prerequisite_code,
        course_name: prereq.course_name || prereq.prerequisite_name,
        credit_hours: prereq.credit_hours || prereq.prerequisite_credit_hours || 0,
        category: 'prerequisite',
        computed_status: 'not_taken',
      };
      const keyId = String(resolved.course_id || '');
      const keyCode = String(resolved.course_code || '').toUpperCase();
      if (!selectedIds.has(keyId) && !selectedCodes.has(keyCode)) prerequisiteCourses.push(resolved);
    }
  }

  const unlockedLater = (allCourses || []).filter(course => {
    if (!course?.course_id || selectedIds.has(String(course.course_id))) return false;
    if (['completed', 'in_progress'].includes(course.computed_status)) return false;
    return (course.prerequisites || []).some(prereq =>
      selectedIds.has(String(prereq.prerequisite_id || prereq.course_id)) ||
      selectedCodes.has(String(prereq.prerequisite_code || prereq.course_code || '').toUpperCase())
    );
  });

  return [
    {
      key: 'before',
      number: '01',
      title: 'Already required before this plan',
      note: 'Courses that unlock the suggested plan.',
      courses: sortFlowCourses(uniqueCourses(prerequisiteCourses)).slice(0, 6),
    },
    {
      key: 'next',
      number: '02',
      title: 'Suggested next-semester schedule',
      note: 'These are the courses the assistant recommends now.',
      courses: sortFlowCourses(selected),
      featured: true,
    },
    {
      key: 'after',
      number: '03',
      title: 'Unlocked after this semester',
      note: 'Possible courses that become easier after passing this plan.',
      courses: sortFlowCourses(uniqueCourses(unlockedLater)).slice(0, 6),
    },
  ];
}


function groupAdvisorCatalog(courses) {
  const sorted = [...(courses || [])].sort((a, b) => {
    const yearA = Number(a.recommended_year || 99);
    const yearB = Number(b.recommended_year || 99);
    if (yearA !== yearB) return yearA - yearB;
    const sem = semesterOrder(a.recommended_semester) - semesterOrder(b.recommended_semester);
    if (sem !== 0) return sem;
    return String(a.course_code || '').localeCompare(String(b.course_code || ''));
  });

  const groups = [];
  const map = new Map();

  for (const course of sorted) {
    const year = course.recommended_year || 'Other';
    const sem = course.recommended_semester || 'general';
    const key = `${year}||${sem}`;
    if (!map.has(key)) {
      const group = {
        key,
        year,
        semester: sem,
        courses: [],
      };
      map.set(key, group);
      groups.push(group);
    }
    map.get(key).courses.push(course);
  }

  return groups;
}

function AdvisorCourseChip({ course, onRemove }) {
  return (
    <span className="sp-advisor-chip">
      <span className="sp-advisor-chip__name">{courseTitle(course)}</span>
      <span className="sp-advisor-chip__meta">{courseCode(course)} · {course.credit_hours || 0}h</span>
      {onRemove && (
        <button type="button" onClick={() => onRemove(course.course_id)} aria-label={`Remove ${courseTitle(course)}`}>×</button>
      )}
    </span>
  );
}

function AdvisorPlanMap({ courses, allCourses = [] }) {
  if (!courses || courses.length === 0) return null;
  const groups = buildAdvisorScheduleFlow(courses, allCourses);

  return (
    <div className="sp-advisor-flow">
      <div className="sp-advisor-flow__header">
        <div>
          <strong>Recommended schedule map</strong>
          <span>Course names are shown like the official study-plan picture, with prerequisite flow around the suggestion.</span>
        </div>
      </div>

      <div className="sp-advisor-flow__board">
        {groups.map((group, index) => (
          <div key={group.key} className={`sp-advisor-flow__stage${group.featured ? ' sp-advisor-flow__stage--featured' : ''}`}>
            <div className="sp-advisor-flow__stage-title">
              <span>{group.number}</span>
              <div>
                <strong>{group.title}</strong>
                <small>{group.note}</small>
              </div>
            </div>

            {group.courses.length === 0 ? (
              <div className="sp-advisor-flow__empty">
                {group.key === 'before'
                  ? 'No missing prerequisite courses were found for this suggestion.'
                  : group.key === 'after'
                    ? 'No direct unlocked courses were detected yet.'
                    : 'No courses selected.'}
              </div>
            ) : (
              <div className="sp-advisor-flow__cards">
                {group.courses.map(course => (
                  <div
                    key={`${group.key}-${course.course_id || course.course_code}`}
                    className={`sp-advisor-flow-card sp-advisor-flow-card--${advisorCourseKind(course)} sp-advisor-flow-card--${course.computed_status || 'not_taken'}`}
                  >
                    <div className="sp-advisor-flow-card__name">{courseTitle(course)}</div>
                    <div className="sp-advisor-flow-card__meta">
                      <span>{courseCode(course)}</span>
                      <span>{course.credit_hours || 0}h</span>
                      <span>{courseCategoryLabel(course)}</span>
                    </div>
                    {(course.prerequisites || []).length > 0 && group.key !== 'before' && (
                      <div className="sp-advisor-flow-card__prereq">
                        Needs: {(course.prerequisites || []).map(p => p.course_name || p.prerequisite_name || p.course_code || p.prerequisite_code).join(', ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {index < groups.length - 1 && <div className="sp-advisor-flow__arrow" aria-hidden="true">↓</div>}
          </div>
        ))}
      </div>

      <div className="sp-advisor-flow__legend">
        <span><i className="sp-advisor-dot sp-advisor-dot--required" /> Required/Core</span>
        <span><i className="sp-advisor-dot sp-advisor-dot--lab" /> Lab/Practical</span>
        <span><i className="sp-advisor-dot sp-advisor-dot--elective" /> Elective</span>
        <span><i className="sp-advisor-dot sp-advisor-dot--completed" /> Already completed</span>
      </div>
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

  const [advisorLoading,  setAdvisorLoading]  = useState(false);
  const [advisorError,    setAdvisorError]    = useState(null);
  const [advisorText,     setAdvisorText]     = useState('Choose an option and I will help you build a better next-semester plan.');
  const [advisorResult,   setAdvisorResult]   = useState(null);
  const [advisorCourseIds,setAdvisorCourseIds]= useState([]);

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

  const advisorPlanCatalogCourses = (plan_courses || [])
    .filter(c => c.course_id)
    .sort((a, b) => {
      const yearA = Number(a.recommended_year || 99);
      const yearB = Number(b.recommended_year || 99);
      if (yearA !== yearB) return yearA - yearB;
      const sem = semesterOrder(a.recommended_semester) - semesterOrder(b.recommended_semester);
      if (sem !== 0) return sem;
      return String(a.course_code || '').localeCompare(String(b.course_code || ''));
    });

  const advisorCatalogGroups = groupAdvisorCatalog(advisorPlanCatalogCourses);
  const advisorSelectedIds = new Set(advisorCourseIds.map(String));
  const advisorSelectedCourses = advisorPlanCatalogCourses.filter(c => advisorSelectedIds.has(String(c.course_id)));

  const advisorHours = advisorSelectedCourses.reduce((sum, c) => sum + Number(c.credit_hours || 0), 0);

  function setAdvisorFromResponse(payload) {
    const data = payload?.data?.data || payload?.data || payload || {};
    const recommended = data.recommended_courses || data.evaluation?.selected_courses || [];
    if (recommended.length > 0) {
      setAdvisorCourseIds(recommended.map(c => c.course_id).filter(Boolean));
    }
    setAdvisorResult(data.evaluation || null);
    setAdvisorText(data.advisor_text || data.evaluation?.summary || 'I checked your plan.');
  }

  async function runAdvisorRecommend(mode = 'balanced') {
    setAdvisorLoading(true);
    setAdvisorError(null);
    try {
      const res = await studentAPI.recommendStudyPlan({ mode });
      setAdvisorFromResponse(res);
    } catch (err) {
      setAdvisorError(getErrorMessage(err));
    } finally {
      setAdvisorLoading(false);
    }
  }

  async function runAdvisorEvaluate() {
    setAdvisorLoading(true);
    setAdvisorError(null);
    try {
      const res = await studentAPI.evaluateStudyPlan({ planned_course_ids: advisorCourseIds });
      setAdvisorFromResponse(res);
    } catch (err) {
      setAdvisorError(getErrorMessage(err));
    } finally {
      setAdvisorLoading(false);
    }
  }

  function toggleAdvisorCourse(courseId) {
    setAdvisorCourseIds(prev => {
      const id = String(courseId);
      return prev.map(String).includes(id)
        ? prev.filter(x => String(x) !== id)
        : [...prev, courseId];
    });
  }

  function removeAdvisorCourse(courseId) {
    setAdvisorCourseIds(prev => prev.filter(x => String(x) !== String(courseId)));
  }

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

      {/* ── Study Plan Advisor ───────────────────────────────────── */}
      <div className="sp-advisor card">
        <div className="sp-advisor__head">
          <div>
            <div className="sp-advisor__eyebrow">Smart Study Plan Assistant</div>
            <h2 className="sp-advisor__title">Plan your next semester</h2>
            <p className="sp-advisor__desc">
              Choose courses, ask for a suggestion, then review the recommended next-semester schedule as a visual study-plan flow.
            </p>
          </div>
          <div className={`sp-advisor-status ${advisorStatusClass(advisorResult?.status)}`}>
            <span>{advisorResult?.label || 'Ready'}</span>
            {advisorResult?.score !== undefined && <strong>{advisorResult.score}%</strong>}
          </div>
        </div>

        <div className="sp-advisor-actions">
          <button type="button" onClick={() => runAdvisorRecommend('balanced')} disabled={advisorLoading}>
            ✨ Suggest next-semester schedule
          </button>
          <button type="button" onClick={runAdvisorEvaluate} disabled={advisorLoading || advisorCourseIds.length === 0}>
            ✅ Check my selected plan
          </button>
          <button type="button" onClick={() => runAdvisorRecommend('lighter')} disabled={advisorLoading}>
            🪶 Make it lighter
          </button>
          <button type="button" onClick={() => runAdvisorRecommend('stronger')} disabled={advisorLoading}>
            🚀 Make it stronger
          </button>
        </div>

        <div className="sp-advisor-grid">
          <div className="sp-advisor-box">
            <div className="sp-advisor-box__top">
              <span>Selected next-semester courses</span>
              <strong>{advisorSelectedCourses.length} courses · {advisorHours} hours</strong>
            </div>
            {advisorSelectedCourses.length === 0 ? (
              <p className="sp-advisor-muted">No courses selected yet. Use the suggestion button or select courses manually.</p>
            ) : (
              <div className="sp-advisor-chips">
                {advisorSelectedCourses.map(course => (
                  <AdvisorCourseChip key={course.course_id} course={course} onRemove={removeAdvisorCourse} />
                ))}
              </div>
            )}

            <div className="sp-advisor-message">
              <span className="sp-advisor-message__icon">🤖</span>
              <p>{advisorLoading ? 'Checking your plan…' : advisorText}</p>
            </div>
            {advisorError && <div className="sp-advisor-error">{advisorError}</div>}
            <AdvisorPlanMap courses={advisorSelectedCourses} allCourses={plan_courses} />
          </div>

          <div className="sp-advisor-box">
            <div className="sp-advisor-box__top">
              <span>All courses in your official plan</span>
              <button type="button" className="sp-advisor-clear" onClick={() => { setAdvisorCourseIds([]); setAdvisorResult(null); setAdvisorText('Selection cleared. Choose courses and I will evaluate them.'); }}>Clear</button>
            </div>
            <p className="sp-advisor-muted sp-advisor-catalog-note">
              This list shows the full study-plan catalog for your department, including required courses, labs/practical courses, university requirements, and electives. Select any courses to test a next-semester plan.
            </p>
            {advisorPlanCatalogCourses.length === 0 ? (
              <p className="sp-advisor-muted">No courses were found in your official study plan yet.</p>
            ) : (
              <div className="sp-advisor-picker sp-advisor-picker--catalog">
                {advisorCatalogGroups.map(group => (
                  <div key={group.key} className="sp-advisor-catalog-group">
                    <div className="sp-advisor-catalog-group__title">
                      <span>{group.year === 'Other' ? 'Other courses' : `Year ${group.year}`}</span>
                      <small>{group.semester === 'general' ? 'General' : semesterName(group.semester)}</small>
                    </div>
                    {group.courses.map(course => {
                      const checked = advisorCourseIds.map(String).includes(String(course.course_id));
                      return (
                        <label key={course.course_id} className={`sp-advisor-pick sp-advisor-pick--${course.computed_status || 'not_taken'}${checked ? ' sp-advisor-pick--selected' : ''}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleAdvisorCourse(course.course_id)}
                          />
                          <span>
                            <strong>{courseTitle(course)}</strong>
                            <small>
                              {courseCode(course)} · {courseCategoryLabel(course)} · {course.computed_status === 'completed' ? 'Completed' : course.computed_status === 'in_progress' ? 'In progress' : course.computed_status === 'failed' ? 'Needs repeat' : 'Not taken'}
                            </small>
                          </span>
                          <em>{course.credit_hours || 0}h</em>
                        </label>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {advisorResult && (
          <div className="sp-advisor-result">
            <div className="sp-advisor-result__summary">
              <strong>{advisorResult.summary}</strong>
              <span>{advisorResult.course_count} course{advisorResult.course_count !== 1 ? 's' : ''} · {advisorResult.credit_hours} credit hours</span>
            </div>

            <div className="sp-advisor-result__cols">
              <div>
                <h4>Strengths</h4>
                {(advisorResult.strengths || []).length === 0 ? (
                  <p className="sp-advisor-muted">No strengths detected yet.</p>
                ) : (
                  <ul>{advisorResult.strengths.map((item, idx) => <li key={idx}>{item}</li>)}</ul>
                )}
              </div>
              <div>
                <h4>Warnings</h4>
                {([...(advisorResult.blocking_issues || []), ...(advisorResult.warnings || [])]).length === 0 ? (
                  <p className="sp-advisor-muted">No warnings. This plan looks safe.</p>
                ) : (
                  <ul>{[...(advisorResult.blocking_issues || []), ...(advisorResult.warnings || [])].map((item, idx) => <li key={idx}>{item}</li>)}</ul>
                )}
              </div>
              <div>
                <h4>Suggestions</h4>
                {(advisorResult.suggestions || []).length === 0 ? (
                  <p className="sp-advisor-muted">No extra changes needed.</p>
                ) : (
                  <ul>{advisorResult.suggestions.map((item, idx) => <li key={idx}>{item}</li>)}</ul>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

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
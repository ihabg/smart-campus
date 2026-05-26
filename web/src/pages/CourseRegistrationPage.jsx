import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { scheduleAPI, studentAPI } from '../api/index';
import { Spinner } from '../components/ui/index';
import { getErrorMessage } from '../utils/helpers';
import toast from 'react-hot-toast';
import './CourseRegistrationPage.css';

// ─── Constants ───────────────────────────────────────────────

const CAT_ORDER = ['major_required', 'university_required', 'major_elective', 'free_elective'];
const ELECTIVE_CATS = new Set(['major_elective', 'free_elective']);

const CAT_META = {
  major_required:      { en: 'Major Required',      ar: 'إجباري تخصص',   accent: 'blue'   },
  university_required: { en: 'University Required', ar: 'إجباري جامعة',  accent: 'purple' },
  major_elective:      { en: 'Major Elective',       ar: 'اختياري تخصص',  accent: 'teal'   },
  free_elective:       { en: 'Free Elective',        ar: 'مساق حر',        accent: 'orange' },
};

const COURSE_STATUS_META = {
  completed:        { label: 'Completed',        css: 'cr-cs--completed'    },
  in_progress:      { label: 'In Progress',      css: 'cr-cs--in-progress'  },
  needs_repeat:     { label: 'Needs Repeat',     css: 'cr-cs--needs-repeat' },
  not_taken:        { label: 'Not Taken',        css: 'cr-cs--not-taken'    },
  available_option: { label: 'Available Option', css: 'cr-cs--available'    },
};

const SEC_STATUS_META = {
  available:          { label: 'Available',            css: 'cr-ss--available',  canEnroll: true  },
  full:               { label: 'Full',                 css: 'cr-ss--full',       canEnroll: false },
  time_conflict:      { label: 'Time Conflict',        css: 'cr-ss--conflict',   canEnroll: false },
  prereq_missing:     { label: 'Prerequisite Missing', css: 'cr-ss--prereq',     canEnroll: false },
  already_registered: { label: 'Registered',           css: 'cr-ss--registered', canEnroll: false },
  course_registered:  { label: 'Other Section',        css: 'cr-ss--other',      canEnroll: false },
};

const FILTER_OPTS = [
  { key: 'all',                 label: 'All'                   },
  { key: 'major_required',      label: 'Major Required'        },
  { key: 'university_required', label: 'University Required'   },
  { key: 'major_elective',      label: 'Major Elective'        },
  { key: 'free_elective',       label: 'Free Elective'         },
  { key: 'in_progress',         label: 'In Progress'           },
  { key: 'needs_repeat',        label: 'Needs Repeat'          },
  { key: 'not_taken',           label: 'Not Taken'             },
  { key: 'completed',           label: 'Completed'             },
  { key: 'available_this_term', label: 'Available This Term'   },
  { key: 'no_section_this_term',label: 'No Section This Term'  },
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─── Helpers ─────────────────────────────────────────────────

function fmtTime(t) {
  return t ? String(t).slice(0, 5) : '—';
}

function fmtDays(days) {
  if (!Array.isArray(days) || !days.length) return '—';
  return [...new Set(days)].sort((a, b) => a - b).map(d => DAY_NAMES[d] ?? d).join(', ');
}

function fmtMeetingDays(meetings) {
  if (!meetings?.length) return '—';
  const days = [...new Set(meetings.map(m => Number(m.day_of_week)))].sort((a, b) => a - b);
  return days.map(d => DAY_NAMES[d] ?? d).join(', ');
}

function fmtMeetingTime(meetings) {
  if (!meetings?.length) return '—';
  return `${fmtTime(meetings[0].start_time)} – ${fmtTime(meetings[0].end_time)}`;
}

function fmtMeetingRoom(meetings) {
  return meetings?.[0]?.room_number || null;
}

function detectConflict(section, myEnrolled) {
  const days = Array.isArray(section.day_of_week) ? section.day_of_week.map(Number) : [];
  if (!days.length || !section.start_time || !section.end_time) return null;
  for (const en of myEnrolled) {
    if (en.section_id === section.id) continue;
    for (const mt of (en.meetings || [])) {
      if (days.includes(Number(mt.day_of_week))) {
        if (section.start_time < mt.end_time && section.end_time > mt.start_time) {
          return en;
        }
      }
    }
  }
  return null;
}

function getCourseStatus(planCourse, enrolledByCourseId) {
  if (planCourse.computed_status === 'completed') return 'completed';
  if (enrolledByCourseId[planCourse.course_id]) return 'in_progress';
  if (planCourse.computed_status === 'failed') return 'needs_repeat';
  if (ELECTIVE_CATS.has(planCourse.category)) return 'available_option';
  return 'not_taken';
}

// prereqOk = false means at least one prerequisite is unmet for this course
function getSectionStatus(section, enrolledBySectionId, enrolledByCourseId, myEnrolled, prereqOk = true) {
  if (enrolledBySectionId[section.id]) return 'already_registered';
  if (enrolledByCourseId[section.course_id]) return 'course_registered';
  if (!prereqOk) return 'prereq_missing';
  if (detectConflict(section, myEnrolled)) return 'time_conflict';
  if (section.max_capacity && section.enrolled >= section.max_capacity) return 'full';
  return 'available';
}

// Returns { ok, missing[] } — missing prereqs for this plan course given the currently enrolled
// courses this term. Concurrent prereqs are satisfied if the student is enrolled in them this term.
function getPrereqStatus(planCourse, enrolledByCourseId) {
  const prereqs = planCourse.prerequisites || [];
  if (!prereqs.length) return { ok: true, missing: [] };
  const missing = prereqs
    .filter(p => {
      if (p.passed) return false;
      if (p.is_concurrent && enrolledByCourseId[p.course_id]) return false;
      return true;
    })
    .map(p => ({
      ...p,
      reason: p.is_concurrent ? 'not_currently_enrolled' : 'not_completed',
    }));
  return { ok: missing.length === 0, missing };
}

function matchesFilter(planCourse, courseStatus, sectionCount, filter) {
  switch (filter) {
    case 'major_required':       return planCourse.category === 'major_required';
    case 'university_required':  return planCourse.category === 'university_required';
    case 'major_elective':       return planCourse.category === 'major_elective';
    case 'free_elective':        return planCourse.category === 'free_elective';
    case 'completed':            return courseStatus === 'completed';
    case 'in_progress':          return courseStatus === 'in_progress';
    case 'needs_repeat':         return courseStatus === 'needs_repeat';
    case 'not_taken':            return courseStatus === 'not_taken' || courseStatus === 'available_option';
    case 'available_this_term':  return sectionCount > 0 && courseStatus !== 'completed';
    case 'no_section_this_term': return sectionCount === 0 && courseStatus !== 'completed';
    default:                     return true;
  }
}

// ─── DropConfirmModal ────────────────────────────────────────

function DropConfirmModal({ target, dropping, onConfirm, onCancel }) {
  const [accepted, setAccepted] = useState(false);

  useEffect(() => { setAccepted(false); }, [target]);

  if (!target) return null;
  const { planCourse, section } = target;
  const secNum = String(section.section_number).padStart(2, '0');
  const isRequired = planCourse.is_required !== false;

  return (
    <div className="cr-backdrop" onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="cr-modal" role="dialog" aria-modal="true" aria-labelledby="cr-modal-title">
        <div className="cr-modal__head">
          <h2 className="cr-modal__title" id="cr-modal-title">Drop Course?</h2>
          <button className="cr-modal__close" onClick={onCancel} aria-label="Close">×</button>
        </div>

        <div className="cr-modal__course">
          <span className="cr-modal__code">{planCourse.course_code}</span>
          <span className="cr-modal__cname">{planCourse.course_name}</span>
          <span className="cr-modal__csec">Section {secNum}</span>
        </div>

        <div className="cr-modal__warnings">
          <p className="cr-modal__warn-intro">Please read carefully before dropping this course:</p>
          <ul className="cr-modal__warn-list">
            <li>Dropping this course may affect your academic progress and credit hour count.</li>
            <li>You may lose paid fees according to university policy and registration deadlines.</li>
            <li>Your schedule and study plan progress will be updated immediately upon dropping.</li>
            {isRequired && (
              <li>
                This is a <strong>required course</strong> — dropping it may delay completing
                your study plan or graduation requirements.
              </li>
            )}
          </ul>
        </div>

        <label className="cr-modal__check-label">
          <input
            type="checkbox"
            className="cr-modal__checkbox"
            checked={accepted}
            onChange={e => setAccepted(e.target.checked)}
          />
          <span>I understand the consequences of dropping this course.</span>
        </label>

        <div className="cr-modal__footer">
          <button className="cr-btn cr-btn--ghost" onClick={onCancel} disabled={dropping}>
            Cancel
          </button>
          <button
            className="cr-btn cr-btn--drop"
            disabled={!accepted || dropping}
            onClick={onConfirm}
          >
            {dropping ? <Spinner size="sm" /> : 'Confirm Drop'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── SectionRow ──────────────────────────────────────────────

function SectionRow({ section, secStatus, onEnroll, onOpenDrop, isEnrolling, missingPrereqs }) {
  const meta = SEC_STATUS_META[secStatus] || SEC_STATUS_META.available;
  const pct = section.max_capacity
    ? Math.min(100, Math.round((section.enrolled / section.max_capacity) * 100))
    : null;

  return (
    <div className={`cr-sec-row cr-sec-row--${secStatus}`}>
      <div className="cr-sec-row__info">
        <span className="cr-sec-row__num">
          Sec {String(section.section_number).padStart(2, '0')}
        </span>
        {section.instructor_name && (
          <span className="cr-sec-row__instr">{section.instructor_name}</span>
        )}
        <span className="cr-sec-row__sched">
          <span className="cr-sec-row__days">{fmtDays(section.day_of_week)}</span>
          <span className="cr-sec-row__time">{fmtTime(section.start_time)}–{fmtTime(section.end_time)}</span>
        </span>
        {section.room_number && (
          <span className="cr-sec-row__room">{section.room_number}</span>
        )}
        <span className="cr-sec-row__cap">
          <span className="cr-sec-row__cap-txt">
            {section.enrolled ?? 0}{section.max_capacity ? `/${section.max_capacity}` : ''}
          </span>
          {pct !== null && (
            <span className="cr-mini-bar" role="progressbar" aria-valuenow={pct}>
              <span
                className={`cr-mini-bar__fill${pct >= 100 ? ' cr-mini-bar__fill--full' : pct >= 80 ? ' cr-mini-bar__fill--warn' : ''}`}
                style={{ width: `${pct}%` }}
              />
            </span>
          )}
        </span>
      </div>

      <div className="cr-sec-row__right">
        <span className={`cr-sec-badge ${meta.css}`}>{meta.label}</span>
        {secStatus === 'already_registered' ? (
          <button className="cr-btn cr-btn--drop cr-btn--sm" onClick={onOpenDrop}>
            Drop
          </button>
        ) : meta.canEnroll ? (
          <button
            className="cr-btn cr-btn--enroll cr-btn--sm"
            disabled={isEnrolling}
            onClick={() => onEnroll(section.id)}
          >
            {isEnrolling ? <Spinner size="sm" /> : 'Register'}
          </button>
        ) : (
          <button className="cr-btn cr-btn--ghost cr-btn--sm" disabled>
            {secStatus === 'full'             ? 'Full'
              : secStatus === 'time_conflict'    ? 'Conflict'
              : secStatus === 'prereq_missing'   ? 'Locked'
              : secStatus === 'course_registered'? 'Other Sec'
              : '—'}
          </button>
        )}
      </div>

      {secStatus === 'prereq_missing' && missingPrereqs?.length > 0 && (
        <div className="cr-sec-row__prereq-hint">
          {missingPrereqs.map(p => (
            <span key={p.course_id} className="cr-prereq-hint">
              Requires: <strong>{p.code}</strong> {p.name}
              {p.is_concurrent
                ? ' — complete it or register concurrently this term'
                : ' — must be completed first'}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── CourseRow ───────────────────────────────────────────────

function CourseRow({
  planCourse, sections, enrolledSection, courseStatus,
  myEnrolled, enrolledBySectionId, enrolledByCourseId,
  onEnroll, onOpenDrop, enrolling, expanded, onToggle,
}) {
  const csMeta      = COURSE_STATUS_META[courseStatus] || COURSE_STATUS_META.not_taken;
  const hasSecs     = sections.length > 0;
  const isCompleted = courseStatus === 'completed';
  const canExpand   = !isCompleted && (hasSecs || courseStatus === 'in_progress');
  const noSection   = !hasSecs && !isCompleted && courseStatus !== 'in_progress';
  const prereqStatus = getPrereqStatus(planCourse, enrolledByCourseId);

  function handleKeyDown(e) {
    if (canExpand && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onToggle();
    }
  }

  return (
    <div className={[
      'cr-course',
      `cr-course--${courseStatus}`,
      noSection     ? 'cr-course--no-sec'  : '',
      expanded      ? 'cr-course--expanded' : '',
    ].filter(Boolean).join(' ')}>

      {/* ── Course header row ────────────────────────────── */}
      <div
        className={`cr-course__head${canExpand ? ' cr-course__head--clickable' : ''}`}
        onClick={canExpand ? onToggle : undefined}
        role={canExpand ? 'button' : undefined}
        tabIndex={canExpand ? 0 : undefined}
        onKeyDown={handleKeyDown}
        aria-expanded={canExpand ? expanded : undefined}
      >
        <div className="cr-course__left">
          <div className="cr-course__top">
            <span className="cr-course__code">{planCourse.course_code}</span>
            {planCourse.credit_hours != null && (
              <span className="cr-course__ch">{planCourse.credit_hours} cr</span>
            )}
          </div>
          <div className="cr-course__names">
            <span className="cr-course__name">{planCourse.course_name}</span>
            {planCourse.course_name_ar && (
              <span className="cr-course__name-ar">{planCourse.course_name_ar}</span>
            )}
          </div>

          {prereqStatus.missing.length > 0 && !isCompleted && (
            <div className="cr-course__prereq-line">
              Requires: {prereqStatus.missing.map(p => p.code).join(', ')}
            </div>
          )}
        </div>

        <div className="cr-course__right">
          <span className={`cr-course-badge ${csMeta.css}`}>{csMeta.label}</span>

          {planCourse.letter_grade && (
            <span className={`cr-course__grade${planCourse.computed_status === 'failed' ? ' cr-course__grade--fail' : ' cr-course__grade--pass'}`}>
              {planCourse.letter_grade}
            </span>
          )}

          {!isCompleted && (
            <span className={`cr-course__avail${noSection ? ' cr-course__avail--none' : ''}`}>
              {noSection
                ? 'No section'
                : `${sections.length} section${sections.length !== 1 ? 's' : ''}`}
            </span>
          )}

          {canExpand && (
            <span className={`cr-chevron${expanded ? ' cr-chevron--open' : ''}`} aria-hidden="true">›</span>
          )}
        </div>
      </div>

      {/* ── Inline enrolled summary (collapsed in-progress) ── */}
      {courseStatus === 'in_progress' && enrolledSection && !expanded && (
        <div className="cr-course__enrolled-bar">
          <span className="cr-course__enrolled-label">Registered:</span>
          <span>Sec {String(enrolledSection.section_number).padStart(2, '0')}</span>
          {enrolledSection.instructor_name && <span>· {enrolledSection.instructor_name}</span>}
          <span>· {fmtMeetingDays(enrolledSection.meetings)} {fmtMeetingTime(enrolledSection.meetings)}</span>
          {fmtMeetingRoom(enrolledSection.meetings) && (
            <span>· Room {fmtMeetingRoom(enrolledSection.meetings)}</span>
          )}
          <button
            className="cr-btn cr-btn--drop cr-btn--xs"
            onClick={() => onOpenDrop({ section: enrolledSection, planCourse })}
          >
            Drop
          </button>
        </div>
      )}

      {/* ── Expanded panel ───────────────────────────────── */}
      {expanded && (
        <div className="cr-course__panel">

          {/* Currently registered banner */}
          {courseStatus === 'in_progress' && enrolledSection && (
            <div className="cr-registered-banner">
              <div className="cr-registered-banner__info">
                <span className="cr-registered-banner__label">Currently Registered</span>
                <span>Section {String(enrolledSection.section_number).padStart(2, '0')}</span>
                {enrolledSection.instructor_name && <span>· {enrolledSection.instructor_name}</span>}
                <span>· {fmtMeetingDays(enrolledSection.meetings)} {fmtMeetingTime(enrolledSection.meetings)}</span>
                {fmtMeetingRoom(enrolledSection.meetings) && (
                  <span>· Room {fmtMeetingRoom(enrolledSection.meetings)}</span>
                )}
              </div>
              <button
                className="cr-btn cr-btn--drop cr-btn--sm"
                onClick={() => onOpenDrop({ section: enrolledSection, planCourse })}
              >
                Drop
              </button>
            </div>
          )}

          {sections.length > 0 ? (
            <div className="cr-sec-list">
              <div className="cr-sec-list__header">
                <span>Sec</span>
                <span>Instructor</span>
                <span>Schedule</span>
                <span>Room</span>
                <span>Capacity</span>
                <span>Status</span>
                <span></span>
              </div>
              {sections.map(sec => {
                const ss = getSectionStatus(sec, enrolledBySectionId, enrolledByCourseId, myEnrolled, prereqStatus.ok);
                return (
                  <SectionRow
                    key={sec.id}
                    section={sec}
                    secStatus={ss}
                    onEnroll={onEnroll}
                    onOpenDrop={() => onOpenDrop({
                      section: enrolledBySectionId[sec.id] || enrolledSection,
                      planCourse,
                    })}
                    isEnrolling={enrolling.has(sec.id)}
                    missingPrereqs={ss === 'prereq_missing' ? prereqStatus.missing : null}
                  />
                );
              })}
            </div>
          ) : courseStatus === 'in_progress' ? null : (
            <div className="cr-no-sections">
              <span>No sections are scheduled for this course this term.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── CategoryGroup ───────────────────────────────────────────

function CategoryGroup({
  category, filteredCourses, sectionsByCourseId,
  enrolledByCourseId, enrolledBySectionId, myEnrolled,
  onEnroll, onOpenDrop, enrolling, expandedCourses, toggleCourse,
}) {
  const catMeta = CAT_META[category] || { en: category, ar: '', accent: 'blue' };
  if (!filteredCourses.length) return null;

  return (
    <div className={`cr-cat-group cr-cat-group--${catMeta.accent}`}>
      <div className="cr-cat-header">
        <div className="cr-cat-header__labels">
          <span className="cr-cat-header__en">{catMeta.en}</span>
          {catMeta.ar && <span className="cr-cat-header__ar">{catMeta.ar}</span>}
        </div>
        <span className="cr-cat-header__count">
          {filteredCourses.length} course{filteredCourses.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="cr-cat-courses">
        {filteredCourses.map(pc => {
          const sections     = sectionsByCourseId[pc.course_id] || [];
          const enrolledSec  = enrolledByCourseId[pc.course_id] || null;
          const courseStatus = getCourseStatus(pc, enrolledByCourseId);
          const isExpanded   = expandedCourses.has(pc.course_id);

          return (
            <CourseRow
              key={pc.course_id}
              planCourse={pc}
              sections={sections}
              enrolledSection={enrolledSec}
              courseStatus={courseStatus}
              myEnrolled={myEnrolled}
              enrolledBySectionId={enrolledBySectionId}
              enrolledByCourseId={enrolledByCourseId}
              onEnroll={onEnroll}
              onOpenDrop={onOpenDrop}
              enrolling={enrolling}
              expanded={isExpanded}
              onToggle={() => toggleCourse(pc.course_id)}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────

export default function CourseRegistrationPage() {
  const [semesters,       setSemesters]       = useState([]);
  const [selectedTerm,    setSelectedTerm]    = useState(null);
  const [allSections,     setAllSections]     = useState([]);
  const [myEnrolled,      setMyEnrolled]      = useState([]);
  const [planData,        setPlanData]        = useState(null);
  const [loadingInit,     setLoadingInit]     = useState(true);
  const [loadingTerm,     setLoadingTerm]     = useState(false);
  const [expandedCourses, setExpandedCourses] = useState(new Set());
  const [enrolling,       setEnrolling]       = useState(new Set());
  const [dropTarget,      setDropTarget]      = useState(null);
  const [dropping,        setDropping]        = useState(false);
  const [search,          setSearch]          = useState('');
  const [activeFilter,    setActiveFilter]    = useState('all');

  // ── Initial load ─────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      scheduleAPI.getPublishedSemesters(),
      studentAPI.getStudyPlan(),
    ]).then(([semRes, planRes]) => {
      const sems = semRes.data?.data?.semesters || [];
      setSemesters(sems);
      if (sems.length) setSelectedTerm(sems[0]);
      setPlanData(planRes.data?.data || null);
    }).catch(() => {
      toast.error('Failed to load page data.');
    }).finally(() => {
      setLoadingInit(false);
    });
  }, []);

  // ── Load term sections ────────────────────────────────────
  const loadTerm = useCallback(async (term) => {
    if (!term) return;
    setLoadingTerm(true);
    try {
      const [secRes, myRes] = await Promise.all([
        scheduleAPI.getAll({ semester: term.semester, academic_year: term.academic_year, limit: 500 }),
        scheduleAPI.getMy({ semester: term.semester, academic_year: term.academic_year })
          .catch(() => ({ data: { data: { sections: [] } } })),
      ]);
      setAllSections(secRes.data?.data?.sections || []);
      setMyEnrolled(myRes.data?.data?.sections || []);
    } catch {
      setAllSections([]);
      setMyEnrolled([]);
    } finally {
      setLoadingTerm(false);
    }
  }, []);

  useEffect(() => {
    loadTerm(selectedTerm);
  }, [selectedTerm, loadTerm]);

  // ── Derived maps ─────────────────────────────────────────
  const { sectionsByCourseId, enrolledBySectionId, enrolledByCourseId } = useMemo(() => {
    const byCourse = {};
    for (const sec of allSections) {
      if (!byCourse[sec.course_id]) byCourse[sec.course_id] = [];
      byCourse[sec.course_id].push(sec);
    }
    const bySecId = {};
    const byCoId  = {};
    for (const sec of myEnrolled) {
      bySecId[sec.section_id] = sec;
      if (!byCoId[sec.course_id]) byCoId[sec.course_id] = sec;
    }
    return { sectionsByCourseId: byCourse, enrolledBySectionId: bySecId, enrolledByCourseId: byCoId };
  }, [allSections, myEnrolled]);

  // ── Summary stats ─────────────────────────────────────────
  const summary = useMemo(() => {
    const planCourses = planData?.plan_courses || [];
    let registered = myEnrolled.length;
    let totalCredits = myEnrolled.reduce((s, e) => s + (e.credit_hours || 0), 0);
    let available = 0, noSection = 0;

    for (const pc of planCourses) {
      const cs   = getCourseStatus(pc, enrolledByCourseId);
      if (cs === 'completed') continue;
      const secs = sectionsByCourseId[pc.course_id] || [];
      if (secs.length > 0) available++;
      else noSection++;
    }

    let conflicts = 0;
    for (let i = 0; i < myEnrolled.length; i++) {
      for (let j = i + 1; j < myEnrolled.length; j++) {
        const a = myEnrolled[i], b = myEnrolled[j];
        let found = false;
        outer: for (const ma of (a.meetings || [])) {
          for (const mb of (b.meetings || [])) {
            if (
              ma.day_of_week === mb.day_of_week &&
              ma.start_time < mb.end_time &&
              ma.end_time > mb.start_time
            ) { found = true; break outer; }
          }
        }
        if (found) conflicts++;
      }
    }

    return { registered, totalCredits, available, noSection, conflicts };
  }, [planData, sectionsByCourseId, enrolledByCourseId, myEnrolled]);

  // ── Filtered + grouped courses ───────────────────────────
  const groupedCourses = useMemo(() => {
    const planCourses = planData?.plan_courses || [];
    const q = search.trim().toLowerCase();

    const filtered = planCourses.filter(pc => {
      if (q) {
        const hay = [pc.course_code, pc.course_name, pc.course_name_ar]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const secs        = sectionsByCourseId[pc.course_id] || [];
      const courseStatus = getCourseStatus(pc, enrolledByCourseId);
      return matchesFilter(pc, courseStatus, secs.length, activeFilter);
    });

    const groups = {};
    for (const cat of CAT_ORDER) groups[cat] = [];
    for (const pc of filtered) {
      const cat = pc.category || 'major_required';
      if (groups[cat]) groups[cat].push(pc);
    }
    return groups;
  }, [planData, sectionsByCourseId, enrolledByCourseId, search, activeFilter]);

  // ── Actions ───────────────────────────────────────────────
  const handleEnroll = useCallback(async (sectionId) => {
    setEnrolling(prev => new Set(prev).add(sectionId));
    try {
      await scheduleAPI.enroll(sectionId);
      toast.success('Registered successfully.');
      await loadTerm(selectedTerm);
    } catch (err) {
      const data = err.response?.data;
      if (data?.prerequisite_failed) {
        const names = (data.missing || []).map(m => m.code).join(', ');
        toast.error(names ? `Missing prerequisites: ${names}` : (data.message || 'Missing prerequisites.'));
      } else if (data?.conflict) {
        toast.error(data.message || 'Schedule conflict.');
      } else {
        toast.error(getErrorMessage(err) || 'Could not register.');
      }
    } finally {
      setEnrolling(prev => { const s = new Set(prev); s.delete(sectionId); return s; });
    }
  }, [selectedTerm, loadTerm]);

  const handleOpenDrop = useCallback(({ section, planCourse }) => {
    setDropTarget({ section, planCourse });
  }, []);

  const handleConfirmDrop = useCallback(async () => {
    if (!dropTarget) return;
    setDropping(true);
    try {
      const sectionId = dropTarget.section.section_id ?? dropTarget.section.id;
      await scheduleAPI.drop(sectionId);
      toast.success('Course dropped.');
      setDropTarget(null);
      await loadTerm(selectedTerm);
    } catch (err) {
      toast.error(getErrorMessage(err) || 'Could not drop course.');
    } finally {
      setDropping(false);
    }
  }, [dropTarget, selectedTerm, loadTerm]);

  const toggleCourse = useCallback((courseId) => {
    setExpandedCourses(prev => {
      const next = new Set(prev);
      if (next.has(courseId)) next.delete(courseId); else next.add(courseId);
      return next;
    });
  }, []);

  // ─────────────────────────────────────────────────────────

  if (loadingInit) {
    return <div className="cr-page"><div className="cr-loading"><Spinner size="lg" /></div></div>;
  }

  if (!semesters.length) {
    return (
      <div className="cr-page">
        <div className="cr-empty-state">
          <div className="cr-empty-state__icon">📅</div>
          <div className="cr-empty-state__title">No Registration Period Open</div>
          <div className="cr-empty-state__sub">
            No semester is currently published for registration.
            Please check back later or contact the registrar's office.
          </div>
        </div>
      </div>
    );
  }

  const termLabel = selectedTerm
    ? (selectedTerm.label || `${selectedTerm.semester.charAt(0).toUpperCase() + selectedTerm.semester.slice(1)} ${selectedTerm.academic_year}`)
    : '';
  const totalFiltered = Object.values(groupedCourses).reduce((s, arr) => s + arr.length, 0);
  const totalPlan     = planData?.plan_courses?.length || 0;

  return (
    <div className="cr-page">

      {/* ── Page header ──────────────────────────────────── */}
      <div className="cr-page-header">
        <div className="cr-page-header__left">
          <h1 className="cr-page-title">Course Registration</h1>
          {planData?.plan_meta?.department_name && (
            <p className="cr-page-sub">
              {planData.plan_meta.department_name}
              {planData.plan_meta.plan_year && ` · Plan ${planData.plan_meta.plan_year}`}
            </p>
          )}
        </div>
        <div className="cr-page-header__right">
          <label className="cr-term-label" htmlFor="cr-term-sel">Term</label>
          <select
            id="cr-term-sel"
            className="cr-term-select"
            value={selectedTerm ? `${selectedTerm.semester}||${selectedTerm.academic_year}` : ''}
            onChange={e => {
              const [sem, ay] = e.target.value.split('||');
              setSelectedTerm(semesters.find(s => s.semester === sem && s.academic_year === ay) || null);
            }}
          >
            {semesters.map(s => (
              <option key={`${s.semester}||${s.academic_year}`} value={`${s.semester}||${s.academic_year}`}>
                {s.label || `${s.semester.charAt(0).toUpperCase() + s.semester.slice(1)} ${s.academic_year}`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── No official plan ─────────────────────────────── */}
      {!planData?.has_official_plan ? (
        <div className="cr-empty-state cr-empty-state--plan">
          <div className="cr-empty-state__icon">🎓</div>
          <div className="cr-empty-state__title">No Official Study Plan</div>
          <div className="cr-empty-state__sub">
            Course registration requires an official study plan assigned to your account.
            Please contact the registrar or your academic advisor to have your plan configured.
          </div>
        </div>
      ) : (
        <>
          {/* ── Summary cards ──────────────────────────────── */}
          <div className="cr-summary">
            <div className="cr-summary-card cr-summary-card--blue">
              <span className="cr-summary-card__val">{summary.registered}</span>
              <span className="cr-summary-card__label">
                Registered{summary.totalCredits > 0 ? ` · ${summary.totalCredits} cr` : ''}
              </span>
            </div>
            <div className="cr-summary-card cr-summary-card--green">
              <span className="cr-summary-card__val">{summary.available}</span>
              <span className="cr-summary-card__label">Available This Term</span>
            </div>
            <div className="cr-summary-card cr-summary-card--gray">
              <span className="cr-summary-card__val">{summary.noSection}</span>
              <span className="cr-summary-card__label">No Section This Term</span>
            </div>
            {summary.conflicts > 0 && (
              <div className="cr-summary-card cr-summary-card--red">
                <span className="cr-summary-card__val">{summary.conflicts}</span>
                <span className="cr-summary-card__label">
                  Schedule Conflict{summary.conflicts !== 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>

          {/* ── Search + filters ───────────────────────────── */}
          <div className="cr-controls">
            <div className="cr-search-wrap">
              <span className="cr-search-icon">🔍</span>
              <input
                className="cr-search"
                type="text"
                placeholder="Search by code, name, or Arabic name…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button className="cr-search-clear" onClick={() => setSearch('')} title="Clear">×</button>
              )}
            </div>
            <div className="cr-chips-wrap">
              <div className="cr-chips">
                {FILTER_OPTS.map(opt => (
                  <button
                    key={opt.key}
                    className={`cr-chip${activeFilter === opt.key ? ' cr-chip--active' : ''}`}
                    onClick={() => setActiveFilter(opt.key)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Results bar ────────────────────────────────── */}
          <div className="cr-results-bar">
            <span className="cr-results-count">
              {totalFiltered} of {totalPlan} plan course{totalPlan !== 1 ? 's' : ''}
              {selectedTerm && ` · ${termLabel}`}
            </span>
            {(search || activeFilter !== 'all') && (
              <button
                className="cr-clear-link"
                onClick={() => { setSearch(''); setActiveFilter('all'); }}
              >
                Clear filters
              </button>
            )}
          </div>

          {/* ── Course list ────────────────────────────────── */}
          {loadingTerm ? (
            <div className="cr-loading"><Spinner /></div>
          ) : totalFiltered === 0 ? (
            <div className="cr-empty-state cr-empty-state--sm">
              <div className="cr-empty-state__icon">🔍</div>
              <div className="cr-empty-state__title">No courses match your filters</div>
              <div className="cr-empty-state__sub">Try adjusting your search or filter selection.</div>
            </div>
          ) : (
            <div className="cr-course-list">
              {CAT_ORDER.map(cat => (
                <CategoryGroup
                  key={cat}
                  category={cat}
                  filteredCourses={groupedCourses[cat] || []}
                  sectionsByCourseId={sectionsByCourseId}
                  enrolledByCourseId={enrolledByCourseId}
                  enrolledBySectionId={enrolledBySectionId}
                  myEnrolled={myEnrolled}
                  onEnroll={handleEnroll}
                  onOpenDrop={handleOpenDrop}
                  enrolling={enrolling}
                  expandedCourses={expandedCourses}
                  toggleCourse={toggleCourse}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Drop confirmation modal ───────────────────────── */}
      {dropTarget && (
        <DropConfirmModal
          target={dropTarget}
          dropping={dropping}
          onConfirm={handleConfirmDrop}
          onCancel={() => !dropping && setDropTarget(null)}
        />
      )}
    </div>
  );
}

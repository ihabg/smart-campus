import React, { useState, useEffect, useCallback } from 'react';
import { semesterAPI, scheduleAPI, roomAPI } from '../../api';
import { SectionFormModal } from './AdminPages';
import { ConfirmDialog } from '../../components/ui/index';
import { useCourses, useInstructors } from '../../hooks/index';
import { daysArrayToString, formatTime, getErrorMessage } from '../../utils/helpers';
import toast from 'react-hot-toast';

const SEMESTERS = [
  { value: 'fall',   label: 'Fall'   },
  { value: 'spring', label: 'Spring' },
  { value: 'summer', label: 'Summer' },
];
const NOW = new Date().getFullYear();
const YEAR_MIN = 2020;
const YEAR_MAX = 2035;
const TABS = ['Sections', 'Timetable', 'Enrollments', 'Doctors', 'Rooms', 'Validation'];

// Faculty filter: show only Engineering departments (case-insensitive contains match).
// Mathematics, Physics, Chemistry, Statistics, Geology, etc. are excluded automatically.
const DEPT_FILTER = 'Engineering';

const DAY_MAP = {
  0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat',
  sunday: 'Sun', monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed',
  thursday: 'Thu', friday: 'Fri', saturday: 'Sat',
};

function dayLabel(d) {
  if (d == null) return '—';
  return DAY_MAP[typeof d === 'number' ? d : d.toLowerCase()] || d;
}

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

// ─── Stat card skeleton ───────────────────────────────────────
function SkeletonCard() {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      <div style={{ height: 10, background: '#e2e8f0', borderRadius: 4, marginBottom: 10, width: '65%' }} />
      <div style={{ height: 26, background: '#e2e8f0', borderRadius: 4, width: '40%' }} />
    </div>
  );
}

// ─── Timetable tab ────────────────────────────────────────────
const MEETING_COLORS = {
  lecture: { bg: 'rgba(59,130,246,0.15)', color: '#60a5fa' },
  lab:     { bg: 'rgba(16,185,129,0.15)', color: '#34d399' },
  tutorial:{ bg: 'rgba(245,158,11,0.15)', color: '#fbbf24' },
};

function MeetingTypeBadge({ type }) {
  const t = (type || 'lecture').toLowerCase();
  const { bg, color } = MEETING_COLORS[t] || MEETING_COLORS.lecture;
  return (
    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: bg, color }}>
      {cap(t)}
    </span>
  );
}

function TimetableTab({ meetings, loading }) {
  if (loading) {
    return <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>Loading timetable…</div>;
  }
  if (!meetings.length) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8', border: '2px dashed #e2e8f0', borderRadius: 12 }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>📅</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 4 }}>No meetings found</div>
        <div style={{ fontSize: 13 }}>Try a different semester or academic year.</div>
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 10 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#f1f5f9' }}>
            {['Course', 'Section', 'Day', 'Time', 'Room', 'Doctor', 'Enrolled / Cap', 'Type'].map(h => (
              <th key={h} style={{
                padding: '10px 12px', textAlign: 'left', color: '#64748b',
                fontWeight: 600, fontSize: 11, textTransform: 'uppercase',
                whiteSpace: 'nowrap', borderBottom: '1px solid #e2e8f0',
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {meetings.map((m, i) => (
            <tr key={m.meeting_id} style={{
              background: i % 2 === 0 ? '#fff' : '#f8fafc',
              borderBottom: '1px solid #e2e8f0',
            }}>
              <td style={{ padding: '9px 12px' }}>
                <div style={{ fontWeight: 600, color: '#111827' }}>{m.course_code}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{m.course_name}</div>
              </td>
              <td style={{ padding: '9px 12px', color: '#374151' }}>{m.section_number}</td>
              <td style={{ padding: '9px 12px', color: '#374151' }}>{dayLabel(m.day_of_week)}</td>
              <td style={{ padding: '9px 12px', color: '#374151', whiteSpace: 'nowrap' }}>
                {m.start_time?.slice(0, 5)} – {m.end_time?.slice(0, 5)}
              </td>
              <td style={{ padding: '9px 12px', color: '#374151' }}>
                {m.room_number
                  ? <>{m.room_number}{m.floor_label ? <span style={{ color: '#94a3b8' }}> · {m.floor_label}</span> : ''}</>
                  : <span style={{ color: '#94a3b8' }}>—</span>}
              </td>
              <td style={{ padding: '9px 12px', color: '#374151' }}>
                {m.instructor_name || <span style={{ color: '#94a3b8' }}>—</span>}
              </td>
              <td style={{ padding: '9px 12px' }}>
                <span style={{ color: m.enrolled >= m.max_capacity ? '#dc2626' : '#111827' }}>
                  {m.enrolled ?? 0}
                </span>
                <span style={{ color: '#94a3b8' }}> / {m.max_capacity ?? '—'}</span>
              </td>
              <td style={{ padding: '9px 12px' }}>
                <MeetingTypeBadge type={m.meeting_type} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Placeholder tab ──────────────────────────────────────────
function PlaceholderTab({ name }) {
  return (
    <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)', border: '2px dashed var(--border)', borderRadius: 12 }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>🔧</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{name}</div>
      <div style={{ fontSize: 13 }}>Coming in a future step</div>
    </div>
  );
}

// ─── Sections tab ─────────────────────────────────────────────
const SECTIONS_LIMIT = 50;

// Room types that are valid teaching/learning spaces.
// Offices, corridors, bathrooms, storage, etc. are excluded.
const TEACHING_ROOM_TYPES = new Set([
  'classroom',
  'lecture_hall',
  'lab',
  'engineering_drawing_room',
  'engineering_drawing_studio',
  'amphitheater',
]);

function SectionsTab({ semester, academicYear, onDataChanged }) {
  // ── Lookup data for the form modal ─────────────────────────
  const { courses: allCourses }         = useCourses({ limit: 1000 });
  const { instructors: allInstructors } = useInstructors({ limit: 1000, active_only: 'true' });
  const [lookupRooms, setLookupRooms]   = useState([]);

  // Filter to Faculty of Engineering: any department containing "Engineering" (case-insensitive)
  const lookupCourses     = (allCourses     || []).filter(c => (c.department || '').toLowerCase().includes('engineering'));
  const lookupInstructors = (allInstructors || []).filter(i => (i.department || '').toLowerCase().includes('engineering'));

  useEffect(() => {
    roomAPI.getAll({ active_only: 'true' })
      .then(res => {
        const all = res.data?.data?.rooms || [];
        setLookupRooms(all.filter(r => TEACHING_ROOM_TYPES.has((r.type || '').toLowerCase())));
      })
      .catch(() => {});
  }, []);

  // ── Sections table state ────────────────────────────────────
  const [sections, setSections] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editSection, setEditSection] = useState(null);
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [deactivateLoading, setDeactivateLoading] = useState(false);

  const loadSections = useCallback(async () => {
    setLoading(true);
    try {
      const res = await scheduleAPI.getAll({
        semester,
        academic_year: academicYear,
        page,
        limit: SECTIONS_LIMIT,
        department_contains: DEPT_FILTER,
      });
      const d = res.data?.data || {};
      setSections(d.sections || []);
      setTotal(d.pagination?.total || 0);
    } catch {
      setSections([]);
    } finally {
      setLoading(false);
    }
  }, [semester, academicYear, page]);

  useEffect(() => { loadSections(); }, [loadSections]);

  // Reset to page 1 when semester/year changes
  useEffect(() => { setPage(1); }, [semester, academicYear]);

  const handleSaved = () => {
    setShowCreate(false);
    setEditSection(null);
    loadSections();
    onDataChanged();
  };

  const handleDeactivate = async () => {
    if (!deactivateTarget?.id) return;
    setDeactivateLoading(true);
    try {
      await scheduleAPI.update(deactivateTarget.id, { is_active: false });
      toast.success('Section deactivated');
      setDeactivateTarget(null);
      loadSections();
      onDataChanged();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setDeactivateLoading(false);
    }
  };

  const totalPages = Math.ceil(total / SECTIONS_LIMIT);

  return (
    <div>
      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: '#64748b' }}>
          {loading ? 'Loading…' : `${total} section${total !== 1 ? 's' : ''} · ${cap(semester)} ${academicYear}`}
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            padding: '8px 16px', borderRadius: 8, background: '#2563eb',
            color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}
        >
          + Add Section
        </button>
      </div>

      {/* Empty state */}
      {!loading && sections.length === 0 && (
        <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8', border: '2px dashed #e2e8f0', borderRadius: 12 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 4 }}>No sections found</div>
          <div style={{ fontSize: 13 }}>Add the first section for this semester using the button above.</div>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && sections.length === 0 && (
        <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>Loading sections…</div>
      )}

      {/* Table */}
      {sections.length > 0 && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                {['Course', 'Sec #', 'Doctor', 'Days', 'Time', 'Room', 'Enrolled / Cap', 'Actions'].map(h => (
                  <th key={h} style={{
                    padding: '10px 12px', textAlign: 'left', color: '#64748b',
                    fontWeight: 600, fontSize: 11, textTransform: 'uppercase',
                    whiteSpace: 'nowrap', borderBottom: '1px solid #e2e8f0',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sections.map((s, i) => (
                <tr key={s.id} style={{
                  background: i % 2 === 0 ? '#fff' : '#f8fafc',
                  borderBottom: '1px solid #e2e8f0',
                }}>
                  <td style={{ padding: '9px 12px' }}>
                    <div style={{ fontWeight: 600, color: '#111827' }}>{s.course_code}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{s.course_name}</div>
                  </td>
                  <td style={{ padding: '9px 12px', color: '#374151', fontFamily: 'monospace', fontWeight: 600 }}>
                    {s.section_number}
                  </td>
                  <td style={{ padding: '9px 12px', color: '#374151' }}>
                    {s.instructor_name || <span style={{ color: '#94a3b8' }}>—</span>}
                  </td>
                  <td style={{ padding: '9px 12px', color: '#374151', whiteSpace: 'nowrap' }}>
                    {daysArrayToString(s.day_of_week) || <span style={{ color: '#94a3b8' }}>—</span>}
                  </td>
                  <td style={{ padding: '9px 12px', color: '#374151', whiteSpace: 'nowrap' }}>
                    {formatTime(s.start_time)} – {formatTime(s.end_time)}
                  </td>
                  <td style={{ padding: '9px 12px' }}>
                    {s.room_number ? (
                      <span style={{
                        fontSize: 12, padding: '2px 8px', borderRadius: 6,
                        background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0',
                      }}>
                        {s.room_number}
                      </span>
                    ) : <span style={{ color: '#94a3b8' }}>—</span>}
                  </td>
                  <td style={{ padding: '9px 12px' }}>
                    <span style={{ color: s.max_capacity && s.enrolled >= s.max_capacity ? '#dc2626' : '#111827' }}>
                      {s.enrolled ?? 0}
                    </span>
                    <span style={{ color: '#94a3b8' }}> / {s.max_capacity ?? '—'}</span>
                  </td>
                  <td style={{ padding: '9px 12px' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        onClick={() => setEditSection(s)}
                        title="Edit section"
                        style={{
                          padding: '4px 8px', borderRadius: 6, border: '1px solid #e2e8f0',
                          background: '#fff', cursor: 'pointer', color: '#2563eb', fontSize: 13,
                        }}
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => setDeactivateTarget(s)}
                        title="Deactivate section"
                        style={{
                          padding: '4px 8px', borderRadius: 6, border: '1px solid #fecaca',
                          background: '#fff', cursor: 'pointer', color: '#dc2626', fontSize: 13,
                        }}
                      >
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', marginTop: 16 }}>
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            style={{
              padding: '6px 14px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13,
              background: page <= 1 ? '#f8fafc' : '#fff', cursor: page <= 1 ? 'not-allowed' : 'pointer',
              color: page <= 1 ? '#94a3b8' : '#374151',
            }}
          >
            ← Prev
          </button>
          <span style={{ fontSize: 13, color: '#64748b' }}>Page {page} of {totalPages}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
            style={{
              padding: '6px 14px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13,
              background: page >= totalPages ? '#f8fafc' : '#fff', cursor: page >= totalPages ? 'not-allowed' : 'pointer',
              color: page >= totalPages ? '#94a3b8' : '#374151',
            }}
          >
            Next →
          </button>
        </div>
      )}

      {/* Create modal */}
      <SectionFormModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSaved={handleSaved}
        defaultSemester={semester}
        defaultAcademicYear={academicYear}
        title="Add Section"
        externalCourses={lookupCourses}
        externalInstructors={lookupInstructors}
        externalRooms={lookupRooms}
      />

      {/* Edit modal */}
      <SectionFormModal
        open={!!editSection}
        onClose={() => setEditSection(null)}
        existingSection={editSection}
        onSaved={handleSaved}
        defaultSemester={semester}
        defaultAcademicYear={academicYear}
        title="Edit Section"
        externalCourses={lookupCourses}
        externalInstructors={lookupInstructors}
        externalRooms={lookupRooms}
      />

      {/* Deactivate confirmation */}
      <ConfirmDialog
        open={!!deactivateTarget}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={handleDeactivate}
        loading={deactivateLoading}
        danger
        title="Deactivate Section"
        message={`Deactivate "${deactivateTarget?.course_code} — Section ${deactivateTarget?.section_number}"? The section will be hidden from the schedule but not permanently deleted.`}
      />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────
export default function SemesterManagementPage() {
  const [semester, setSemester] = useState('fall');
  const [startYear, setStartYear] = useState(NOW);
  const academicYear = `${startYear}/${startYear + 1}`;
  const [activeTab, setActiveTab] = useState('Timetable');

  const [stats, setStats] = useState(null);
  const [meetings, setMeetings] = useState([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [meetingsLoading, setMeetingsLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadStats = useCallback(async () => {
    if (!semester || !academicYear) return;
    setStatsLoading(true);
    setError(null);
    try {
      const res = await semesterAPI.getSemesterStats(semester, academicYear, { department_contains: DEPT_FILTER });
      setStats(res.data.data);
    } catch {
      setError('Failed to load stats — check semester and year values.');
    } finally {
      setStatsLoading(false);
    }
  }, [semester, academicYear]);

  const loadMeetings = useCallback(async () => {
    if (!semester || !academicYear) return;
    setMeetingsLoading(true);
    try {
      const res = await semesterAPI.getSemesterMeetings(semester, academicYear, { department_contains: DEPT_FILTER });
      setMeetings(res.data.data.meetings || []);
    } catch {
      setMeetings([]);
    } finally {
      setMeetingsLoading(false);
    }
  }, [semester, academicYear]);

  // Auto-load whenever semester or academic year changes
  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { if (activeTab === 'Timetable') loadMeetings(); }, [activeTab, loadMeetings]);

  // Called by SectionsTab after any create/edit/deactivate
  const handleSectionDataChanged = useCallback(() => {
    loadStats();
    loadMeetings();
  }, [loadStats, loadMeetings]);

  const statCards = stats ? [
    { label: 'Total Sections',          value: stats.total_sections,              icon: '📋' },
    { label: 'Total Courses',           value: stats.total_courses,               icon: '📚' },
    { label: 'Instructors Assigned',    value: stats.instructors_assigned,        icon: '👨‍🏫' },
    { label: 'Without Instructor',      value: stats.sections_without_instructor, icon: '⚠️', warn: stats.sections_without_instructor > 0 },
    { label: 'Rooms Assigned',          value: stats.rooms_assigned,              icon: '🚪' },
    { label: 'Without Room',            value: stats.sections_without_room,       icon: '⚠️', warn: stats.sections_without_room > 0 },
    { label: 'Total Enrolled',          value: stats.total_enrolled,              icon: '👥' },
    { label: 'Total Capacity',          value: stats.total_capacity,              icon: '🏛️' },
    { label: 'Total Meetings',          value: stats.total_meetings,              icon: '📅' },
    { label: 'Conflicts Found',         value: stats.conflicts_found,             icon: '🔴', warn: stats.conflicts_found > 0 },
  ] : [];

  return (
    <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Semester Management</h1>
          <p style={{ color: 'var(--text-muted)', margin: '4px 0 0', fontSize: 14 }}>
            Manage sections, enrollments, and schedules per semester
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 600,
            background: 'rgba(59,130,246,0.15)', color: '#60a5fa',
            border: '1px solid rgba(59,130,246,0.3)',
          }}>
            Working Draft
          </span>
          <button disabled title="Coming in a future update" style={{
            padding: '8px 14px', borderRadius: 8, background: '#f1f5f9',
            color: '#94a3b8', border: '1px solid #e2e8f0',
            cursor: 'not-allowed', fontSize: 13,
          }}>
            Generate Draft&nbsp;<span style={{ fontSize: 10, opacity: 0.7 }}>Coming Soon</span>
          </button>
          <button disabled title="Requires academic terms — Phase 2" style={{
            padding: '8px 14px', borderRadius: 8, background: '#f1f5f9',
            color: '#94a3b8', border: '1px solid #e2e8f0',
            cursor: 'not-allowed', fontSize: 13,
          }}>
            Publish Semester&nbsp;<span style={{ fontSize: 10, opacity: 0.7 }}>Phase 2</span>
          </button>
        </div>
      </div>

      {/* ── Controls ── */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 24, flexWrap: 'wrap', alignItems: 'flex-end' }}>

        {/* Semester chips */}
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Semester
          </label>
          <div style={{ display: 'flex', borderRadius: 8, border: '1px solid #d1d5db', overflow: 'hidden', background: '#fff' }}>
            {SEMESTERS.map(({ value, label }, i) => (
              <button
                key={value}
                onClick={() => setSemester(value)}
                style={{
                  padding: '8px 18px',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: 'none',
                  borderRight: i < SEMESTERS.length - 1 ? '1px solid #d1d5db' : 'none',
                  background: semester === value ? '#2563eb' : '#fff',
                  color:      semester === value ? '#fff'    : '#374151',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Academic year stepper */}
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Academic Year
          </label>
          <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', overflow: 'hidden' }}>
            <button
              onClick={() => setStartYear(y => Math.max(YEAR_MIN, y - 1))}
              disabled={startYear <= YEAR_MIN}
              style={{
                width: 36, height: 38, fontSize: 16, border: 'none', cursor: startYear <= YEAR_MIN ? 'not-allowed' : 'pointer',
                background: 'transparent', color: startYear <= YEAR_MIN ? '#d1d5db' : '#374151',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRight: '1px solid #d1d5db',
              }}
              title="Previous year"
            >
              ‹
            </button>
            <span style={{ padding: '0 14px', fontSize: 14, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', userSelect: 'none' }}>
              {academicYear}
            </span>
            <button
              onClick={() => setStartYear(y => Math.min(YEAR_MAX, y + 1))}
              disabled={startYear >= YEAR_MAX}
              style={{
                width: 36, height: 38, fontSize: 16, border: 'none', cursor: startYear >= YEAR_MAX ? 'not-allowed' : 'pointer',
                background: 'transparent', color: startYear >= YEAR_MAX ? '#d1d5db' : '#374151',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderLeft: '1px solid #d1d5db',
              }}
              title="Next year"
            >
              ›
            </button>
          </div>
        </div>

      </div>

      {/* ── Error banner ── */}
      {error && (
        <div style={{
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#f87171', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {/* ── Stats cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(158px, 1fr))', gap: 12, marginBottom: 28 }}>
        {statsLoading
          ? Array(10).fill(0).map((_, i) => <SkeletonCard key={i} />)
          : statCards.map(card => (
            <div key={card.label} style={{
              background: card.warn ? '#fef2f2' : '#fff',
              border: `1px solid ${card.warn ? '#fecaca' : '#e2e8f0'}`,
              borderRadius: 12, padding: 16,
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ fontSize: 11, color: '#64748b', lineHeight: 1.4 }}>{card.label}</span>
                <span style={{ fontSize: 16 }}>{card.icon}</span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6, color: card.warn ? '#dc2626' : '#111827' }}>
                {card.value ?? '—'}
              </div>
            </div>
          ))
        }
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: '9px 16px', background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 600, marginBottom: -1,
            color: activeTab === tab ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: activeTab === tab ? '2px solid var(--primary)' : '2px solid transparent',
          }}>
            {tab}
          </button>
        ))}
      </div>

      {/* ── Tab panels ── */}
      {activeTab === 'Sections' && (
        <SectionsTab
          semester={semester}
          academicYear={academicYear}
          onDataChanged={handleSectionDataChanged}
        />
      )}
      {activeTab === 'Timetable' && (
        <TimetableTab meetings={meetings} loading={meetingsLoading} />
      )}
      {activeTab !== 'Sections' && activeTab !== 'Timetable' && (
        <PlaceholderTab name={activeTab} />
      )}
    </div>
  );
}

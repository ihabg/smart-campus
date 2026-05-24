import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { semesterAPI, scheduleAPI, roomAPI, enrollmentAPI, instructorAPI } from '../../api';
import { SectionFormModal, AcademicYearStepper } from './AdminPages';
import { ConfirmDialog, Spinner } from '../../components/ui/index';
import { useCourses, useInstructors, useRoomTypes } from '../../hooks/index';
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

// ─── College / Faculty config ─────────────────────────────────
// Add entries here to support additional colleges in the future.
// departmentContains is passed to backend as `department_contains`
// and used for frontend filtering of courses/instructors.
const COLLEGES = [
  { label: 'Faculty of Engineering', departmentContains: 'Engineering' },
];

const COLLEGE_FILTERS = Object.fromEntries(
  COLLEGES.map(c => [c.label, { departmentContains: c.departmentContains }])
);

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

function SectionsTab({ semester, academicYear, departmentContains, collegeName, onDataChanged }) {
  // ── Lookup data for the form modal ─────────────────────────
  const { courses: allCourses }         = useCourses({ limit: 1000 });
  const { instructors: allInstructors } = useInstructors({ limit: 1000, active_only: 'true' });
  const { roomTypes }                   = useRoomTypes();
  const [allRooms, setAllRooms]         = useState([]);

  // Filter courses and instructors to the selected college using the
  // departmentContains filter (case-insensitive). An empty string means
  // "show everything" — safe default for future colleges without a filter.
  const deptLower         = (departmentContains || '').toLowerCase();
  const lookupCourses     = (allCourses     || []).filter(c => !deptLower || (c.department || '').toLowerCase().includes(deptLower));
  const lookupInstructors = (allInstructors || []).filter(i => !deptLower || (i.department || '').toLowerCase().includes(deptLower));

  // Teaching room types come from the DB metadata — no hardcoding.
  // If a type is later marked is_teaching=true in room_types, it appears here automatically.
  const teachingTypeValues = useMemo(
    () => new Set(roomTypes.filter(rt => rt.is_teaching).map(rt => rt.value)),
    [roomTypes]
  );

  const lookupRooms = useMemo(
    () => allRooms.filter(r => teachingTypeValues.has((r.type || '').toLowerCase())),
    [allRooms, teachingTypeValues]
  );

  useEffect(() => {
    roomAPI.getAll({ active_only: 'true' })
      .then(res => setAllRooms(res.data?.data?.rooms || []))
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
        department_contains: departmentContains || undefined,
      });
      const d = res.data?.data || {};
      setSections(d.sections || []);
      setTotal(d.pagination?.total || 0);
    } catch {
      setSections([]);
    } finally {
      setLoading(false);
    }
  }, [semester, academicYear, page, departmentContains]);

  useEffect(() => { loadSections(); }, [loadSections]);

  // Reset to page 1 when semester, year, or college changes
  useEffect(() => { setPage(1); }, [semester, academicYear, departmentContains]);

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
        readOnlyContext={{ semester, academicYear, collegeName }}
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
        readOnlyContext={{ semester, academicYear, collegeName }}
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

// ─── Enrollments tab — shared helpers ────────────────────────

const YEAR_OPTIONS = [1, 2, 3, 4, 5, 6];

function InfoRow({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 12, marginBottom: 3 }}>
      <span style={{ color: '#64748b', minWidth: 46, flexShrink: 0 }}>{label}:</span>
      <span style={{ color: '#374151', fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function SectionDetailCard({ section, loading }) {
  if (loading && !section) return (
    <div style={{ padding: 24, textAlign: 'center' }}><Spinner /></div>
  );
  if (!section) return null;

  const isFull = section.max_capacity !== null && section.enrolled >= section.max_capacity;
  const pct    = section.max_capacity ? Math.round((section.enrolled / section.max_capacity) * 100) : null;

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 18px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        <div style={{ flex: '2 1 170px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{section.course_code}</div>
          <div style={{ fontSize: 13, color: '#374151', marginTop: 2 }}>{section.course_name}</div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>Section {section.section_number}</div>
        </div>
        <div style={{ flex: '2 1 170px' }}>
          <InfoRow label="Doctor" value={section.instructor_name || '—'} />
          <InfoRow label="Room"   value={section.room_number    || '—'} />
          <InfoRow label="Days"   value={daysArrayToString(section.day_of_week) || '—'} />
          <InfoRow label="Time"   value={section.start_time ? `${formatTime(section.start_time)} – ${formatTime(section.end_time)}` : '—'} />
        </div>
        <div style={{ flex: '0 0 auto', textAlign: 'center', minWidth: 80 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: isFull ? '#dc2626' : '#111827', lineHeight: 1 }}>
            {section.enrolled}
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>/ {section.max_capacity ?? '∞'} seats</div>
          {pct !== null && (
            <div style={{ marginTop: 6, width: 72, height: 5, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden', margin: '6px auto 0' }}>
              <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', borderRadius: 3, transition: 'width 0.3s',
                background: isFull ? '#dc2626' : pct > 80 ? '#f59e0b' : '#2563eb' }} />
            </div>
          )}
          {isFull && <div style={{ fontSize: 10, color: '#dc2626', fontWeight: 700, marginTop: 4, letterSpacing: '0.05em' }}>FULL</div>}
        </div>
      </div>
    </div>
  );
}

function EnrolledStudentsPanel({
  students, loading, total, page, totalPages,
  onPageChange, search, department, year,
  onSearchChange, onDepartmentChange, onYearChange, onRemove,
  departments, onRemoveAll,
}) {
  const [confirmRemoveAll, setConfirmRemoveAll] = useState(false);

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 18px' }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span>Enrolled Students</span>
        {!loading && total > 0 && <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 400 }}>({total})</span>}
        {!loading && total > 0 && (
          <button
            onClick={() => setConfirmRemoveAll(true)}
            style={{ marginLeft: 'auto', padding: '4px 12px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff', cursor: 'pointer', color: '#dc2626', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}
          >
            Remove All ({total})
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <input
          placeholder="Name, email, or reg. number…"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          style={{ flex: '2 1 160px', padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13 }}
        />
        <select
          value={department}
          onChange={e => onDepartmentChange(e.target.value)}
          style={{ flex: '1 1 140px', padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, color: '#0f172a', background: '#ffffff' }}
        >
          <option value="">All departments</option>
          {(departments || []).map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select
          value={year}
          onChange={e => onYearChange(e.target.value)}
          style={{ flex: '0 0 auto', padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, color: '#374151' }}
        >
          <option value="">All years</option>
          {YEAR_OPTIONS.map(y => <option key={y} value={y}>Year {y}</option>)}
        </select>
      </div>

      {loading && <div style={{ padding: 32, textAlign: 'center' }}><Spinner /></div>}

      {!loading && students.length === 0 && (
        <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
          {(search || department || year)
            ? 'No students match the current filters.'
            : 'No students are enrolled in this section yet.'}
        </div>
      )}

      {!loading && students.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 520 }}>
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                {['Reg. #', 'Name', 'Email', 'Department', 'Year', 'Action'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', whiteSpace: 'nowrap', borderBottom: '1px solid #e2e8f0' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map((s, i) => (
                <tr key={s.user_id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '8px 10px', fontFamily: 'monospace', color: '#374151', whiteSpace: 'nowrap' }}>{s.registration_number || '—'}</td>
                  <td style={{ padding: '8px 10px', color: '#111827', fontWeight: 500, whiteSpace: 'nowrap' }}>{s.first_name} {s.last_name}</td>
                  <td style={{ padding: '8px 10px', color: '#374151' }}>{s.email}</td>
                  <td style={{ padding: '8px 10px', color: '#374151' }}>{s.department || '—'}</td>
                  <td style={{ padding: '8px 10px', color: '#374151', textAlign: 'center' }}>{s.year_of_study ?? '—'}</td>
                  <td style={{ padding: '8px 10px' }}>
                    <button
                      onClick={() => onRemove(s)}
                      style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff', cursor: 'pointer', color: '#dc2626', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', marginTop: 12 }}>
          <button disabled={page <= 1} onClick={() => onPageChange(p => p - 1)} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12, background: page <= 1 ? '#f8fafc' : '#fff', cursor: page <= 1 ? 'not-allowed' : 'pointer', color: page <= 1 ? '#94a3b8' : '#374151' }}>← Prev</button>
          <span style={{ fontSize: 12, color: '#64748b' }}>Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => onPageChange(p => p + 1)} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12, background: page >= totalPages ? '#f8fafc' : '#fff', cursor: page >= totalPages ? 'not-allowed' : 'pointer', color: page >= totalPages ? '#94a3b8' : '#374151' }}>Next →</button>
        </div>
      )}

      {confirmRemoveAll && (
        <ConfirmDialog
          open={true}
          onClose={() => setConfirmRemoveAll(false)}
          onConfirm={() => { setConfirmRemoveAll(false); onRemoveAll(); }}
          danger
          title="Remove All Students"
          message={`Remove all ${total} enrolled student${total !== 1 ? 's' : ''} from this section? They can be re-enrolled later.`}
        />
      )}
    </div>
  );
}

function AddStudentPanel({ sectionId, sectionDetail, defaultDept, departments, onEnrolled }) {
  const [search,       setSearch]       = useState('');
  const [dept,         setDept]         = useState('');
  const [year,         setYear]         = useState('');
  const [results,      setResults]      = useState([]);
  const [searching,    setSearching]    = useState(false);
  const [searchError,  setSearchError]  = useState('');
  const [searched,     setSearched]     = useState(false);
  const [enrollingId,  setEnrollingId]  = useState(null);
  const [forceTarget,  setForceTarget]  = useState(null);
  const [forceLoading, setForceLoading] = useState(false);
  const timerRef = useRef(null);

  // Reset when section or college changes
  useEffect(() => {
    setSearch('');
    setDept('');
    setYear('');
    setResults([]);
    setSearchError('');
    setSearched(false);
    setForceTarget(null);
  }, [sectionId, defaultDept]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const runSearch = useCallback(async (s, d, y) => {
    if (!s && !d && !y) { setResults([]); setSearched(false); return; }
    setSearching(true);
    setSearchError('');
    setSearched(true);
    try {
      const res = await enrollmentAPI.searchStudents({
        search:             s || undefined,
        department:         d || undefined,
        year_of_study:      y ? parseInt(y, 10) : undefined,
        exclude_section_id: sectionId,
        limit: 50,
      });
      setResults(res.data?.data?.students || []);
    } catch (err) {
      setSearchError(getErrorMessage(err));
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [sectionId]);

  const schedule = (s, d, y, immediate) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (immediate) { runSearch(s, d, y); return; }
    timerRef.current = setTimeout(() => runSearch(s, d, y), 300);
  };

  const handleEnroll = async (student) => {
    setEnrollingId(student.user_id);
    try {
      await enrollmentAPI.enrollStudent({ section_id: sectionId, student_id: student.user_id });
      toast.success(`${student.first_name} ${student.last_name} enrolled.`);
      setResults(prev => prev.map(r => r.user_id === student.user_id ? { ...r, already_enrolled: true } : r));
      onEnrolled();
    } catch (err) {
      const data = err.response?.data;
      if (data?.already_enrolled) {
        toast.error('Student is already enrolled.');
        setResults(prev => prev.map(r => r.user_id === student.user_id ? { ...r, already_enrolled: true } : r));
      } else if (data?.at_capacity && data?.can_force) {
        // Show force enroll confirmation instead of a dead-end error
        setForceTarget(student);
      } else {
        toast.error(getErrorMessage(err));
      }
    } finally {
      setEnrollingId(null);
    }
  };

  const handleForceEnroll = async () => {
    if (!forceTarget) return;
    setForceLoading(true);
    try {
      await enrollmentAPI.enrollStudent({ section_id: sectionId, student_id: forceTarget.user_id, force: true });
      toast.success(`${forceTarget.first_name} ${forceTarget.last_name} force enrolled successfully.`);
      setResults(prev => prev.map(r => r.user_id === forceTarget.user_id ? { ...r, already_enrolled: true } : r));
      setForceTarget(null);
      onEnrolled();
    } catch (err) {
      const data = err.response?.data;
      if (data?.already_enrolled) {
        toast.error('Student is already enrolled.');
        setResults(prev => prev.map(r => r.user_id === forceTarget.user_id ? { ...r, already_enrolled: true } : r));
        setForceTarget(null);
      } else {
        toast.error(getErrorMessage(err));
      }
    } finally {
      setForceLoading(false);
    }
  };

  const isFull = sectionDetail?.max_capacity != null && sectionDetail.enrolled >= sectionDetail.max_capacity;

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 18px' }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        Add Student
        {isFull && (
          <span style={{ fontSize: 11, color: '#c2410c', fontWeight: 600, padding: '2px 8px', background: '#fff7ed', borderRadius: 10, border: '1px solid #fed7aa' }}>
            Section Full — Force Enroll Available
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <input
          placeholder="Name, email, or registration number…"
          value={search}
          onChange={e => { setSearch(e.target.value); schedule(e.target.value, dept, year, false); }}
          style={{ flex: '2 1 190px', padding: '7px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13 }}
        />
        <select
          value={dept}
          onChange={e => { setDept(e.target.value); schedule(search, e.target.value, year, true); }}
          style={{ flex: '1 1 140px', padding: '7px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, color: '#0f172a', background: '#ffffff' }}
        >
          <option value="">All departments</option>
          {(departments || []).map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select
          value={year}
          onChange={e => { setYear(e.target.value); schedule(search, dept, e.target.value, true); }}
          style={{ flex: '0 0 auto', padding: '7px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, color: '#374151' }}
        >
          <option value="">All years</option>
          {YEAR_OPTIONS.map(y => <option key={y} value={y}>Year {y}</option>)}
        </select>
      </div>

      {searching && <div style={{ padding: 24, textAlign: 'center' }}><Spinner /></div>}

      {searchError && (
        <div style={{ padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: 13, marginBottom: 8 }}>
          {searchError}
        </div>
      )}

      {!searching && !searched && !searchError && (
        <div style={{ fontSize: 13, color: '#94a3b8', padding: '6px 0' }}>
          Enter a name, email, registration number, or department to search for students.
        </div>
      )}

      {!searching && searched && results.length === 0 && !searchError && (
        <div style={{ fontSize: 13, color: '#94a3b8', padding: '6px 0' }}>No students found matching your search.</div>
      )}

      {!searching && results.length > 0 && (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 460 }}>
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  {['Reg. #', 'Name', 'Department', 'Year', 'Action'].map(h => (
                    <th key={h} style={{ padding: '7px 10px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', whiteSpace: 'nowrap', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((s, i) => (
                  <tr key={s.user_id} style={{ background: s.already_enrolled ? '#f8fafc' : (i % 2 === 0 ? '#fff' : '#f8fafc'), borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '7px 10px', fontFamily: 'monospace', color: '#374151', whiteSpace: 'nowrap' }}>{s.registration_number || '—'}</td>
                    <td style={{ padding: '7px 10px', color: s.already_enrolled ? '#94a3b8' : '#111827', fontWeight: 500, whiteSpace: 'nowrap' }}>{s.first_name} {s.last_name}</td>
                    <td style={{ padding: '7px 10px', color: '#374151' }}>{s.department || '—'}</td>
                    <td style={{ padding: '7px 10px', color: '#374151', textAlign: 'center' }}>{s.year_of_study ?? '—'}</td>
                    <td style={{ padding: '7px 10px' }}>
                      {s.already_enrolled ? (
                        <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>Already enrolled</span>
                      ) : (
                        <button
                          onClick={() => handleEnroll(s)}
                          disabled={enrollingId === s.user_id}
                          style={
                            enrollingId === s.user_id
                              ? { padding: '3px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'not-allowed', color: '#94a3b8', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }
                              : isFull
                                ? { padding: '3px 10px', borderRadius: 6, border: '1px solid #fed7aa', background: '#fff7ed', cursor: 'pointer', color: '#c2410c', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }
                                : { padding: '3px 10px', borderRadius: 6, border: '1px solid #bfdbfe', background: '#eff6ff', cursor: 'pointer', color: '#2563eb', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }
                          }
                        >
                          {enrollingId === s.user_id ? 'Enrolling…' : isFull ? 'Force Enroll' : 'Enroll'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {results.length >= 50 && (
            <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', paddingTop: 6 }}>
              Showing first 50 results — narrow your search for more precise results.
            </div>
          )}
        </>
      )}

      {/* Force enroll confirmation dialog */}
      {forceTarget && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget && !forceLoading) setForceTarget(null); }}
        >
          <div style={{ background: '#fff', borderRadius: 14, padding: '24px 28px', maxWidth: 440, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span style={{ fontSize: 22 }}>⚠️</span>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#92400e' }}>Section Full — Force Enroll?</div>
            </div>

            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '12px 14px', marginBottom: 16, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, gap: 12 }}>
                <span style={{ color: '#64748b', fontWeight: 500, whiteSpace: 'nowrap' }}>Section</span>
                <span style={{ color: '#111827', fontWeight: 600, textAlign: 'right' }}>
                  {sectionDetail?.course_code || '—'} — Sec {sectionDetail?.section_number || '—'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, gap: 12 }}>
                <span style={{ color: '#64748b', fontWeight: 500, whiteSpace: 'nowrap' }}>Capacity</span>
                <span style={{ color: '#dc2626', fontWeight: 700 }}>
                  {sectionDetail?.enrolled ?? '—'} / {sectionDetail?.max_capacity ?? '∞'} (Full)
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ color: '#64748b', fontWeight: 500, whiteSpace: 'nowrap' }}>Student</span>
                <span style={{ color: '#111827', fontWeight: 600, textAlign: 'right' }}>
                  {forceTarget.first_name} {forceTarget.last_name}
                  {forceTarget.registration_number ? ` (${forceTarget.registration_number})` : ''}
                </span>
              </div>
            </div>

            <p style={{ fontSize: 13, color: '#374151', marginBottom: 20, lineHeight: 1.55 }}>
              This section has reached its maximum capacity. Force enrolling will exceed the limit. This is an exceptional administrative action.
            </p>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                onClick={() => setForceTarget(null)}
                disabled={forceLoading}
                style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: forceLoading ? 'not-allowed' : 'pointer', color: '#374151', fontSize: 13, fontWeight: 500 }}
              >
                Cancel
              </button>
              <button
                onClick={handleForceEnroll}
                disabled={forceLoading}
                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: forceLoading ? '#fde68a' : '#f59e0b', cursor: forceLoading ? 'not-allowed' : 'pointer', color: '#fff', fontSize: 13, fontWeight: 700 }}
              >
                {forceLoading ? 'Enrolling…' : 'Force Enroll'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BulkEnrollPanel({ sectionId, sectionDetail, defaultDept, departments, onEnrolled }) {
  const [open,    setOpen]    = useState(false);
  const [dept,    setDept]    = useState('');
  const [year,    setYear]    = useState('');
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState(null);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    setDept('');
    setYear('');
    setResult(null);
    setConfirm(false);
  }, [sectionId, defaultDept]);

  const isFull    = sectionDetail?.max_capacity != null && sectionDetail.enrolled >= sectionDetail.max_capacity;
  const canSubmit = (dept.trim() || year) && !isFull;

  const handleBulkEnroll = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await enrollmentAPI.bulkEnroll({
        section_id:          sectionId,
        department_contains: dept || undefined,
        year_of_study:       year ? parseInt(year, 10) : undefined,
      });
      const d = res.data?.data;
      setResult(d);
      if (d.inserted > 0) {
        toast.success(`Enrolled ${d.inserted} student${d.inserted !== 1 ? 's' : ''}.`);
        onEnrolled();
      } else {
        toast('No new students enrolled — all matched are already enrolled or section is full.', { icon: 'ℹ️' });
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
      setConfirm(false);
    }
  };

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 18px' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#111827', display: 'flex', alignItems: 'center', gap: 6, padding: 0, width: '100%' }}
      >
        <span style={{ fontSize: 10, color: '#64748b', fontFamily: 'monospace' }}>{open ? '▲' : '▼'}</span>
        Bulk Enroll by Department / Year
        {isFull && <span style={{ fontSize: 11, color: '#dc2626', marginLeft: 4, fontWeight: 500 }}>— Section full</span>}
      </button>

      {open && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
            <div style={{ flex: '2 1 170px' }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Department</label>
              <select
                value={dept}
                onChange={e => setDept(e.target.value)}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box', color: '#0f172a', background: '#ffffff' }}
              >
                <option value="">All departments</option>
                {(departments || []).map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div style={{ flex: '1 1 110px' }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Year of study</label>
              <select
                value={year}
                onChange={e => setYear(e.target.value)}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13 }}
              >
                <option value="">All years</option>
                {YEAR_OPTIONS.map(y => <option key={y} value={y}>Year {y}</option>)}
              </select>
            </div>
          </div>

          <div style={{ fontSize: 12, color: '#64748b', padding: '8px 10px', background: '#f8fafc', borderRadius: 6, marginBottom: 12 }}>
            All active students matching the filters will be enrolled. Already-enrolled students are skipped. Enrollment stops if the section reaches capacity.
          </div>

          {result && (
            <div style={{ marginBottom: 12, padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontSize: 13 }}>
              <div style={{ fontWeight: 600, color: '#166534', marginBottom: 6 }}>Bulk Enrollment Result</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 20px' }}>
                <span style={{ color: '#166534' }}>✓ Enrolled: <strong>{result.inserted}</strong></span>
                {result.skipped_duplicates > 0 && (
                  <span style={{ color: '#92400e' }}>↩ Already enrolled (skipped): <strong>{result.skipped_duplicates}</strong></span>
                )}
                {result.skipped_capacity > 0 && (
                  <span style={{ color: '#dc2626' }}>⚠ Skipped (section full): <strong>{result.skipped_capacity}</strong></span>
                )}
                <span style={{ color: '#64748b' }}>Total enrolled now: <strong>{result.enrolled} / {result.max_capacity ?? '∞'}</strong></span>
              </div>
            </div>
          )}

          <button
            onClick={() => setConfirm(true)}
            disabled={!canSubmit || loading}
            style={{ padding: '8px 20px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600, cursor: canSubmit && !loading ? 'pointer' : 'not-allowed', background: canSubmit && !loading ? '#2563eb' : '#f1f5f9', color: canSubmit && !loading ? '#fff' : '#94a3b8' }}
          >
            {loading ? 'Enrolling…' : 'Bulk Enroll'}
          </button>

          {confirm && (
            <ConfirmDialog
              open={true}
              onClose={() => setConfirm(false)}
              onConfirm={handleBulkEnroll}
              loading={loading}
              title="Confirm Bulk Enrollment"
              message={`Enroll all active students${dept ? ` from "${dept}"` : ''}${year ? ` in Year ${year}` : ''} into this section? Already-enrolled students will be skipped.`}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Enrollments tab ─────────────────────────────────────────
const ENROLLED_LIMIT = 20;

function sectionLabel(s) {
  const days = daysArrayToString(s.day_of_week) || '';
  const time = s.start_time ? `${formatTime(s.start_time)}–${formatTime(s.end_time)}` : '';
  return [
    `${s.course_code} — Sec ${s.section_number}`,
    days, time,
    s.instructor_name,
  ].filter(Boolean).join(' · ');
}

function SectionSearchCombobox({ sections, sectionsLoading, selectedId, onSelect }) {
  const [query,          setQuery]          = useState('');
  const [open,           setOpen]           = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);

  const wrapRef  = useRef(null);
  const inputRef = useRef(null);
  const listRef  = useRef(null);

  // When parent resets selectedId (e.g. semester filter change), clear the input
  useEffect(() => {
    if (!selectedId) setQuery('');
  }, [selectedId]);

  const filtered = useMemo(() => {
    if (!query.trim()) return sections;
    const q = query.toLowerCase();
    return sections.filter(s => sectionLabel(s).toLowerCase().includes(q));
  }, [sections, query]);

  // Close on outside click/tap
  useEffect(() => {
    const handler = e => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.children[highlightIndex];
    if (item) item.scrollIntoView({ block: 'nearest' });
  }, [highlightIndex, open]);

  const handleInputChange = e => {
    setQuery(e.target.value);
    setOpen(true);
    setHighlightIndex(0);
    if (selectedId) onSelect('');
  };

  const handleSelect = section => {
    onSelect(section.id);
    setQuery(sectionLabel(section));
    setOpen(false);
    setHighlightIndex(0);
  };

  const handleClear = () => {
    setQuery('');
    onSelect('');
    setOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = e => {
    if (!open && e.key !== 'Escape') {
      setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlightIndex]) handleSelect(filtered[highlightIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const placeholder = sectionsLoading
    ? 'Loading sections…'
    : sections.length === 0
      ? 'No sections found for this semester / college'
      : `Search ${sections.length} section${sections.length !== 1 ? 's' : ''}…`;

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', maxWidth: 700 }}>
      {/* Input row */}
      <div style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          disabled={sectionsLoading}
          placeholder={placeholder}
          autoComplete="off"
          style={{
            width: '100%',
            padding: '8px 36px 8px 12px',
            borderRadius: 8,
            border: '1px solid #d1d5db',
            fontSize: 13,
            color: '#374151',
            background: sectionsLoading ? '#f9fafb' : '#fff',
            boxSizing: 'border-box',
            outline: 'none',
          }}
        />
        {(query || selectedId) && (
          <button
            type="button"
            onClick={handleClear}
            title="Clear selection"
            style={{
              position: 'absolute',
              right: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#9ca3af',
              fontSize: 18,
              lineHeight: 1,
              padding: '0 2px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && !sectionsLoading && (
        <div
          ref={listRef}
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            width: '100%',
            maxHeight: 260,
            overflowY: 'auto',
            background: '#fff',
            border: '1px solid #d1d5db',
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
            zIndex: 200,
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: '10px 12px', fontSize: 13, color: '#94a3b8' }}>
              No sections match "{query}"
            </div>
          ) : (
            filtered.map((s, idx) => (
              <button
                key={s.id}
                type="button"
                role="option"
                aria-selected={s.id === selectedId}
                onMouseDown={() => handleSelect(s)}
                onMouseEnter={() => setHighlightIndex(idx)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 12px',
                  background: idx === highlightIndex ? '#f0f9ff' : s.id === selectedId ? '#f8fafc' : 'transparent',
                  border: 'none',
                  borderBottom: idx < filtered.length - 1 ? '1px solid #f1f5f9' : 'none',
                  cursor: 'pointer',
                  fontSize: 13,
                  color: '#374151',
                  lineHeight: 1.5,
                  fontWeight: s.id === selectedId ? 600 : 400,
                }}
              >
                {sectionLabel(s)}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function EnrollmentsTab({ semester, academicYear, departmentContains, onDataChanged }) {
  const [sections,        setSections]        = useState([]);
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [selectedId,      setSelectedId]      = useState('');

  const [sectionDetail,   setSectionDetail]   = useState(null);
  const [students,        setStudents]        = useState([]);
  const [studentsTotal,   setStudentsTotal]   = useState(0);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsPage,    setStudentsPage]    = useState(1);

  const [enrolledSearch, setEnrolledSearch] = useState('');
  const [enrolledDept,   setEnrolledDept]   = useState('');
  const [enrolledYear,   setEnrolledYear]   = useState('');

  const [removeTarget,    setRemoveTarget]    = useState(null);
  const [removeLoading,   setRemoveLoading]   = useState(false);
  const [removeAllLoading, setRemoveAllLoading] = useState(false);

  const [departments, setDepartments] = useState([]);

  // Load section list for the dropdown
  const loadSections = useCallback(async () => {
    setSectionsLoading(true);
    try {
      const res = await scheduleAPI.getAll({
        semester,
        academic_year:      academicYear,
        department_contains: departmentContains || undefined,
        limit: 1000,
      });
      setSections(res.data?.data?.sections || []);
    } catch {
      setSections([]);
    } finally {
      setSectionsLoading(false);
    }
  }, [semester, academicYear, departmentContains]);

  useEffect(() => { loadSections(); }, [loadSections]);

  // Load distinct departments for filter selects
  useEffect(() => {
    enrollmentAPI.getStudentDepartments(
      departmentContains ? { department_contains: departmentContains } : {}
    )
      .then(res => setDepartments(res.data?.data?.departments || []))
      .catch(() => setDepartments([]));
  }, [departmentContains]);

  // Reset when page-level filters change
  useEffect(() => {
    setSelectedId('');
    setSectionDetail(null);
    setStudents([]);
    setStudentsTotal(0);
    setStudentsPage(1);
    setEnrolledSearch('');
    setEnrolledDept('');
    setEnrolledYear('');
  }, [semester, academicYear, departmentContains]);

  // Load enrolled students + section detail
  const loadEnrolled = useCallback(async () => {
    if (!selectedId) return;
    setStudentsLoading(true);
    try {
      const res = await enrollmentAPI.getEnrollments(selectedId, {
        search:       enrolledSearch || undefined,
        department:   enrolledDept   || undefined,
        year_of_study: enrolledYear  || undefined,
        page:  studentsPage,
        limit: ENROLLED_LIMIT,
      });
      const d = res.data?.data || {};
      setSectionDetail(d.section   || null);
      setStudents(d.students       || []);
      setStudentsTotal(d.pagination?.total || 0);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setStudentsLoading(false);
    }
  }, [selectedId, enrolledSearch, enrolledDept, enrolledYear, studentsPage]);

  useEffect(() => { loadEnrolled(); }, [loadEnrolled]);

  const handleSectionSelect = id => {
    setSelectedId(id);
    setSectionDetail(null);
    setStudents([]);
    setStudentsPage(1);
    setEnrolledSearch('');
    setEnrolledDept('');
    setEnrolledYear('');
  };

  const handleEnrolled = useCallback(() => {
    loadEnrolled();
    onDataChanged();
  }, [loadEnrolled, onDataChanged]);

  const handleRemove = async () => {
    if (!removeTarget) return;
    setRemoveLoading(true);
    try {
      await enrollmentAPI.removeEnrollment(selectedId, removeTarget.user_id);
      toast.success(`${removeTarget.first_name} ${removeTarget.last_name} removed.`);
      setRemoveTarget(null);
      loadEnrolled();
      onDataChanged();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setRemoveLoading(false);
    }
  };

  const handleRemoveAll = async () => {
    setRemoveAllLoading(true);
    try {
      const res = await enrollmentAPI.removeAllEnrollments(selectedId);
      const { removed } = res.data?.data || {};
      toast.success(`Removed ${removed} student${removed !== 1 ? 's' : ''} from the section.`);
      setStudentsPage(1);
      loadEnrolled();
      onDataChanged();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setRemoveAllLoading(false);
    }
  };

  const totalPages = Math.ceil(studentsTotal / ENROLLED_LIMIT);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Section picker */}
      <div>
        <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
          Select Section
        </label>
        <SectionSearchCombobox
          sections={sections}
          sectionsLoading={sectionsLoading}
          selectedId={selectedId}
          onSelect={handleSectionSelect}
        />
      </div>

      {/* Empty placeholder */}
      {!selectedId && (
        <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8', border: '2px dashed #e2e8f0', borderRadius: 12 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>👥</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 4 }}>No section selected</div>
          <div style={{ fontSize: 13 }}>Select a section above to view and manage enrollments.</div>
        </div>
      )}

      {/* Content */}
      {selectedId && (
        <>
          <SectionDetailCard section={sectionDetail} loading={studentsLoading && !sectionDetail} />

          <EnrolledStudentsPanel
            students={students}
            loading={studentsLoading}
            total={studentsTotal}
            page={studentsPage}
            totalPages={totalPages}
            onPageChange={setStudentsPage}
            search={enrolledSearch}
            department={enrolledDept}
            year={enrolledYear}
            onSearchChange={v => { setEnrolledSearch(v); setStudentsPage(1); }}
            onDepartmentChange={v => { setEnrolledDept(v); setStudentsPage(1); }}
            onYearChange={v => { setEnrolledYear(v); setStudentsPage(1); }}
            onRemove={setRemoveTarget}
            departments={departments}
            onRemoveAll={handleRemoveAll}
          />

          <AddStudentPanel
            sectionId={selectedId}
            sectionDetail={sectionDetail}
            defaultDept={departmentContains}
            departments={departments}
            onEnrolled={handleEnrolled}
          />

          <BulkEnrollPanel
            sectionId={selectedId}
            sectionDetail={sectionDetail}
            defaultDept={departmentContains}
            departments={departments}
            onEnrolled={handleEnrolled}
          />
        </>
      )}

      {/* Remove confirmation */}
      {removeTarget && (
        <ConfirmDialog
          open={true}
          onClose={() => setRemoveTarget(null)}
          onConfirm={handleRemove}
          loading={removeLoading}
          danger
          title="Remove Student"
          message={`Remove ${removeTarget.first_name} ${removeTarget.last_name} (${removeTarget.registration_number || removeTarget.email}) from this section? They can be re-enrolled later.`}
        />
      )}
    </div>
  );
}

// ─── Validation tab ───────────────────────────────────────────
const SEVERITY_CONFIG = {
  critical: { color: '#dc2626', bg: '#fef2f2', border: '#fecaca', icon: '🔴', label: 'Critical' },
  warning:  { color: '#d97706', bg: '#fffbeb', border: '#fde68a', icon: '⚠️', label: 'Warning'  },
  info:     { color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe', icon: 'ℹ️', label: 'Info'     },
};

const DAY_SHORT = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' };

function fmtT(t) { return t ? String(t).slice(0, 5) : '—'; }

function IssueCard({ issue }) {
  const [expanded, setExpanded] = useState(true);
  const cfg = SEVERITY_CONFIG[issue.severity] || SEVERITY_CONFIG.info;
  const items = issue.sections || issue.conflicts || [];

  const sectionColumns = ['Course Code', 'Section #',
    ...(issue.type === 'over_capacity' ? ['Enrolled', 'Capacity'] : []),
    ...(issue.type === 'count_mismatch' ? ['Stored', 'Real'] : []),
  ];
  const conflictColumns = issue.type === 'room_conflict'
    ? ['Room', 'Section A', 'Section B', 'Day', 'Time A', 'Time B']
    : ['Instructor', 'Section A', 'Section B', 'Day', 'Time A', 'Time B'];

  return (
    <div style={{ border: `1px solid ${cfg.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 10 }}>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: cfg.bg, cursor: 'pointer', userSelect: 'none' }}
      >
        <span>{cfg.icon}</span>
        <span style={{ fontWeight: 600, color: cfg.color, fontSize: 13, flex: 1 }}>{issue.message}</span>
        <span style={{ fontSize: 11, color: cfg.color, fontWeight: 700, padding: '2px 8px', background: 'rgba(255,255,255,0.6)', border: `1px solid ${cfg.border}`, borderRadius: 10 }}>{cfg.label}</span>
        <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 4 }}>{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && items.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {(issue.conflicts ? conflictColumns : sectionColumns).map(h => (
                  <th key={h} style={{ padding: '7px 10px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {issue.conflicts ? items.map((c, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '7px 10px', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>
                    {issue.type === 'room_conflict' ? c.room_number : c.instructor_name}
                  </td>
                  <td style={{ padding: '7px 10px', color: '#374151', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{c.course_a}/{c.section_a_number}</td>
                  <td style={{ padding: '7px 10px', color: '#374151', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{c.course_b}/{c.section_b_number}</td>
                  <td style={{ padding: '7px 10px', color: '#374151', whiteSpace: 'nowrap' }}>{DAY_SHORT[c.conflict_day] ?? c.conflict_day}</td>
                  <td style={{ padding: '7px 10px', color: '#374151', whiteSpace: 'nowrap' }}>{fmtT(c.a_start)}–{fmtT(c.a_end)}</td>
                  <td style={{ padding: '7px 10px', color: '#374151', whiteSpace: 'nowrap' }}>{fmtT(c.b_start)}–{fmtT(c.b_end)}</td>
                </tr>
              )) : items.map((s, i) => (
                <tr key={s.section_id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontWeight: 600, color: '#374151' }}>{s.course_code}</td>
                  <td style={{ padding: '7px 10px', color: '#374151' }}>{s.section_number}</td>
                  {issue.type === 'over_capacity' && (
                    <>
                      <td style={{ padding: '7px 10px', color: '#dc2626', fontWeight: 700 }}>{s.enrolled}</td>
                      <td style={{ padding: '7px 10px', color: '#374151' }}>{s.max_capacity}</td>
                    </>
                  )}
                  {issue.type === 'count_mismatch' && (
                    <>
                      <td style={{ padding: '7px 10px', color: '#374151' }}>{s.stored_count}</td>
                      <td style={{ padding: '7px 10px', color: '#dc2626', fontWeight: 700 }}>{s.real_count}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Chip helper ──────────────────────────────────────────────
function Chip({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 44 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: color || '#374151', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{label}</div>
    </div>
  );
}

// ─── Room conflict detector ────────────────────────────────────
function roomHasConflict(secs) {
  for (let i = 0; i < secs.length; i++) {
    for (let j = i + 1; j < secs.length; j++) {
      const a = secs[i], b = secs[j];
      const dA = Array.isArray(a.day_of_week) ? a.day_of_week : [];
      const dB = Array.isArray(b.day_of_week) ? b.day_of_week : [];
      if (dA.some(d => dB.includes(d)) && a.start_time && b.start_time) {
        if (a.start_time < b.end_time && b.start_time < a.end_time) return true;
      }
    }
  }
  return false;
}

// ─── Doctors tab ──────────────────────────────────────────────
function DoctorsTab({ semester, academicYear, departmentContains }) {
  const [sections,     setSections]     = useState([]);
  const [instructors,  setInstructors]  = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [loadError,    setLoadError]    = useState(null);
  const [expandedId,   setExpandedId]   = useState(null);
  const [search,       setSearch]       = useState('');
  const [filterMode,   setFilterMode]   = useState('all'); // 'all' | 'assigned' | 'unassigned'

  const load = useCallback(async () => {
    if (!semester || !academicYear) return;
    setLoading(true);
    setLoadError(null);
    let sectErr = null;
    let instErr = null;

    // Sections — same params/limit as EnrollmentsTab (max 1000 enforced by backend)
    try {
      const res = await scheduleAPI.getAll({
        semester,
        academic_year: academicYear,
        department_contains: departmentContains || undefined,
        limit: 1000,
      });
      setSections(res.data?.data?.sections || []);
    } catch (err) {
      sectErr = getErrorMessage(err);
      setSections([]);
    }

    // Instructors — independent fetch; if this fails we still show assigned doctors from sections
    try {
      const res = await instructorAPI.getAll({ limit: 1000, active_only: 'true' });
      setInstructors(res.data?.data?.instructors || []);
    } catch (err) {
      instErr = getErrorMessage(err);
      setInstructors([]);
    }

    if (sectErr) {
      setLoadError(sectErr);
      toast.error('Failed to load doctors data', { id: 'doctors-tab-load-error' });
    } else if (instErr) {
      toast.error('Could not load full instructor list — showing section-assigned doctors only', { id: 'doctors-inst-load-error' });
    }

    setLoading(false);
  }, [semester, academicYear, departmentContains]);

  useEffect(() => { load(); }, [load]);

  // Build per-instructor section groups
  const doctorRows = useMemo(() => {
    const byId = new Map();
    for (const s of sections) {
      if (!s.instructor_id) continue;
      if (!byId.has(s.instructor_id)) byId.set(s.instructor_id, []);
      byId.get(s.instructor_id).push(s);
    }

    // Instructors with sections
    const rows = [];
    for (const [id, secs] of byId.entries()) {
      const inst = instructors.find(i => String(i.id) === String(id));
      const courseSet = new Set(secs.map(s => s.course_code).filter(Boolean));
      const meetings = secs.reduce((acc, s) => acc + (Array.isArray(s.day_of_week) ? s.day_of_week.length : 0), 0);
      rows.push({
        id,
        name: secs[0]?.instructor_name || (inst ? `${inst.title || ''} ${inst.first_name || ''} ${inst.last_name || ''}`.trim() : `ID ${id}`),
        doctor_number: inst?.doctor_number ?? null,
        email: inst?.email ?? secs[0]?.instructor_email ?? null,
        department: inst?.department ?? null,
        sectionCount: secs.length,
        courseCount: courseSet.size,
        meetings,
        sections: secs,
        hasSection: true,
      });
    }

    // Instructors from DB not in any section
    for (const inst of instructors) {
      if (!byId.has(String(inst.id)) && !byId.has(inst.id)) {
        rows.push({
          id: inst.id,
          name: `${inst.title || ''} ${inst.first_name || ''} ${inst.last_name || ''}`.trim() || inst.email,
          doctor_number: inst.doctor_number ?? null,
          email: inst.email ?? null,
          department: inst.department ?? null,
          sectionCount: 0,
          courseCount: 0,
          meetings: 0,
          sections: [],
          hasSection: false,
        });
      }
    }

    return rows.sort((a, b) => b.sectionCount - a.sectionCount || (a.name || '').localeCompare(b.name || ''));
  }, [sections, instructors]);

  const filtered = useMemo(() => {
    let rows = doctorRows;
    if (filterMode === 'assigned')   rows = rows.filter(r => r.hasSection);
    if (filterMode === 'unassigned') rows = rows.filter(r => !r.hasSection);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        (r.name || '').toLowerCase().includes(q) ||
        (r.email || '').toLowerCase().includes(q) ||
        (r.department || '').toLowerCase().includes(q) ||
        (r.doctor_number != null && String(r.doctor_number).includes(q))
      );
    }
    return rows;
  }, [doctorRows, filterMode, search]);

  const assignedCount   = doctorRows.filter(r => r.hasSection).length;
  const unassignedCount = doctorRows.filter(r => !r.hasSection).length;

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
        <Spinner />
        <div style={{ marginTop: 12 }}>Loading doctors…</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ padding: 48, textAlign: 'center', border: '2px dashed #fecaca', borderRadius: 12, background: '#fef2f2' }}>
        <div style={{ fontSize: 22, marginBottom: 8 }}>⚠️</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#dc2626', marginBottom: 4 }}>Failed to load doctors data</div>
        <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 16 }}>{loadError}</div>
        <button onClick={load} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Summary chips */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 16, padding: '10px 16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10 }}>
          <Chip label="Total" value={doctorRows.length} color="#374151" />
          <Chip label="Teaching" value={assignedCount} color="#2563eb" />
          <Chip label="No Sections" value={unassignedCount} color={unassignedCount > 0 ? '#f59e0b' : '#94a3b8'} />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginLeft: 'auto' }}>
          {[['all','All'],['assigned','Teaching'],['unassigned','No Sections']].map(([mode, lbl]) => (
            <button key={mode} onClick={() => setFilterMode(mode)} style={{
              padding: '5px 12px', borderRadius: 6, border: '1px solid', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              borderColor: filterMode === mode ? '#2563eb' : '#e2e8f0',
              background: filterMode === mode ? '#2563eb' : '#fff',
              color: filterMode === mode ? '#fff' : '#374151',
            }}>
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search by name, email, department, doctor number…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, marginBottom: 14, boxSizing: 'border-box', outline: 'none', color: '#111827', background: '#fff' }}
      />

      {/* Table */}
      {filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
          No doctors match the current filter.
        </div>
      ) : (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Doctor</th>
                <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Department</th>
                <th style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 600, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sections</th>
                <th style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 600, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Courses</th>
                <th style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 600, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Meetings/wk</th>
                <th style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 600, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => (
                <React.Fragment key={row.id}>
                  <tr
                    onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                    style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #e2e8f0', cursor: row.sections.length > 0 ? 'pointer' : 'default' }}
                  >
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 600, color: '#111827' }}>{row.name}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
                        {row.doctor_number != null ? `#${row.doctor_number}` : ''}
                        {row.doctor_number != null && row.email ? ' · ' : ''}
                        {row.email || ''}
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#64748b', fontSize: 12 }}>{row.department || '—'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      {row.sectionCount > 0
                        ? <span style={{ fontWeight: 700, color: '#2563eb' }}>{row.sectionCount}</span>
                        : <span style={{ color: '#f59e0b', fontWeight: 600, fontSize: 11 }}>None</span>
                      }
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: '#374151' }}>{row.courseCount || '—'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: '#374151' }}>{row.meetings || '—'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, color: '#94a3b8' }}>
                      {row.sections.length > 0 ? (expandedId === row.id ? '▲' : '▼') : ''}
                    </td>
                  </tr>
                  {expandedId === row.id && row.sections.length > 0 && (
                    <tr style={{ background: '#f0f7ff' }}>
                      <td colSpan={6} style={{ padding: '0 16px 12px' }}>
                        <div style={{ paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {row.sections.map(s => (
                            <div key={s.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '6px 10px', background: '#fff', borderRadius: 6, border: '1px solid #dbeafe', fontSize: 12, flexWrap: 'wrap' }}>
                              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#2563eb', minWidth: 70 }}>{s.course_code}</span>
                              <span style={{ color: '#374151' }}>§{s.section_number}</span>
                              <span style={{ color: '#64748b' }}>{Array.isArray(s.day_of_week) ? s.day_of_week.map(dayLabel).join(', ') : '—'}</span>
                              <span style={{ color: '#64748b' }}>{s.start_time ? `${formatTime(s.start_time)}–${formatTime(s.end_time)}` : '—'}</span>
                              <span style={{ color: '#94a3b8' }}>{s.room_number || '—'}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Rooms tab ────────────────────────────────────────────────
function RoomsTab({ semester, academicYear, departmentContains }) {
  const [sections,   setSections]   = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [loadError,  setLoadError]  = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [search,     setSearch]     = useState('');
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'used' | 'conflict'

  const load = useCallback(async () => {
    if (!semester || !academicYear) return;
    setLoading(true);
    setLoadError(null);
    try {
      // limit capped at 1000 by backend validatePagination middleware
      const res = await scheduleAPI.getAll({
        semester,
        academic_year: academicYear,
        department_contains: departmentContains || undefined,
        limit: 1000,
      });
      setSections(res.data?.data?.sections || []);
    } catch (err) {
      setLoadError(getErrorMessage(err));
      setSections([]);
      toast.error('Failed to load rooms data', { id: 'rooms-tab-load-error' });
    } finally {
      setLoading(false);
    }
  }, [semester, academicYear, departmentContains]);

  useEffect(() => { load(); }, [load]);

  const roomRows = useMemo(() => {
    const byId = new Map();
    for (const s of sections) {
      if (!s.room_id) continue;
      if (!byId.has(s.room_id)) byId.set(s.room_id, []);
      byId.get(s.room_id).push(s);
    }
    const rows = [];
    for (const [id, secs] of byId.entries()) {
      const first = secs[0];
      const totalEnrolled = secs.reduce((acc, s) => acc + (s.enrolled_count ?? 0), 0);
      const totalCapacity = secs.reduce((acc, s) => acc + (s.max_capacity ?? 0), 0);
      const meetings = secs.reduce((acc, s) => acc + (Array.isArray(s.day_of_week) ? s.day_of_week.length : 0), 0);
      const conflict = roomHasConflict(secs);
      rows.push({
        id,
        room_number: first.room_number || `Room ${id}`,
        room_name:   first.room_name   || null,
        floor_label: first.floor_label || null,
        building:    first.building_code || null,
        sectionCount: secs.length,
        totalEnrolled,
        totalCapacity,
        utilization: totalCapacity > 0 ? Math.round((totalEnrolled / totalCapacity) * 100) : null,
        meetings,
        conflict,
        sections: secs,
      });
    }
    return rows.sort((a, b) => {
      if (a.conflict && !b.conflict) return -1;
      if (!a.conflict && b.conflict) return 1;
      return b.sectionCount - a.sectionCount;
    });
  }, [sections]);

  const filtered = useMemo(() => {
    let rows = roomRows;
    if (filterMode === 'used')     rows = rows.filter(r => r.sectionCount > 0);
    if (filterMode === 'conflict') rows = rows.filter(r => r.conflict);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        (r.room_number || '').toLowerCase().includes(q) ||
        (r.room_name   || '').toLowerCase().includes(q) ||
        (r.floor_label || '').toLowerCase().includes(q) ||
        (r.building    || '').toLowerCase().includes(q)
      );
    }
    return rows;
  }, [roomRows, filterMode, search]);

  const conflictCount = roomRows.filter(r => r.conflict).length;

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
        <Spinner />
        <div style={{ marginTop: 12 }}>Loading rooms…</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ padding: 48, textAlign: 'center', border: '2px dashed #fecaca', borderRadius: 12, background: '#fef2f2' }}>
        <div style={{ fontSize: 22, marginBottom: 8 }}>⚠️</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#dc2626', marginBottom: 4 }}>Failed to load rooms data</div>
        <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 16 }}>{loadError}</div>
        <button onClick={load} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Summary chips */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 16, padding: '10px 16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10 }}>
          <Chip label="Rooms Used" value={roomRows.length} color="#374151" />
          <Chip label="Conflicts" value={conflictCount} color={conflictCount > 0 ? '#dc2626' : '#94a3b8'} />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginLeft: 'auto' }}>
          {[['all','All'],['used','With Sections'],['conflict','Conflicts Only']].map(([mode, lbl]) => (
            <button key={mode} onClick={() => setFilterMode(mode)} style={{
              padding: '5px 12px', borderRadius: 6, border: '1px solid', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              borderColor: filterMode === mode ? '#2563eb' : '#e2e8f0',
              background: filterMode === mode ? '#2563eb' : '#fff',
              color: filterMode === mode ? '#fff' : '#374151',
            }}>
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search by room number, name, floor, building…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, marginBottom: 14, boxSizing: 'border-box', outline: 'none', color: '#111827', background: '#fff' }}
      />

      {/* Table */}
      {filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
          No rooms match the current filter.
        </div>
      ) : (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Room</th>
                <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Location</th>
                <th style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 600, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sections</th>
                <th style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 600, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Enrolled</th>
                <th style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 600, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Utilization</th>
                <th style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 600, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Meetings/wk</th>
                <th style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 600, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => (
                <React.Fragment key={row.id}>
                  <tr
                    onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                    style={{ background: row.conflict ? '#fff5f5' : (i % 2 === 0 ? '#fff' : '#f8fafc'), borderBottom: '1px solid #e2e8f0', cursor: 'pointer' }}
                  >
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {row.conflict && <span title="Scheduling conflict detected" style={{ color: '#dc2626', fontSize: 13 }}>🔴</span>}
                        <span style={{ fontWeight: 700, color: '#111827', fontFamily: 'monospace' }}>{row.room_number}</span>
                      </div>
                      {row.room_name && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{row.room_name}</div>}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#64748b', fontSize: 12 }}>
                      {[row.floor_label, row.building].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#2563eb' }}>{row.sectionCount}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: '#374151' }}>
                      {row.totalCapacity > 0 ? `${row.totalEnrolled}/${row.totalCapacity}` : row.totalEnrolled || '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      {row.utilization != null ? (
                        <span style={{
                          fontWeight: 700,
                          color: row.utilization > 100 ? '#dc2626' : row.utilization >= 80 ? '#f59e0b' : '#10b981',
                        }}>
                          {row.utilization}%
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: '#374151' }}>{row.meetings || '—'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, color: '#94a3b8' }}>
                      {expandedId === row.id ? '▲' : '▼'}
                    </td>
                  </tr>
                  {expandedId === row.id && (
                    <tr style={{ background: '#f0f7ff' }}>
                      <td colSpan={7} style={{ padding: '0 16px 12px' }}>
                        <div style={{ paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {row.sections.map(s => (
                            <div key={s.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '6px 10px', background: '#fff', borderRadius: 6, border: '1px solid #dbeafe', fontSize: 12, flexWrap: 'wrap' }}>
                              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#2563eb', minWidth: 70 }}>{s.course_code}</span>
                              <span style={{ color: '#374151' }}>§{s.section_number}</span>
                              <span style={{ color: '#64748b', flex: 1, minWidth: 100 }}>{s.instructor_name || '—'}</span>
                              <span style={{ color: '#64748b' }}>{Array.isArray(s.day_of_week) ? s.day_of_week.map(dayLabel).join(', ') : '—'}</span>
                              <span style={{ color: '#64748b' }}>{s.start_time ? `${formatTime(s.start_time)}–${formatTime(s.end_time)}` : '—'}</span>
                              {s.enrolled_count != null && s.max_capacity != null && (
                                <span style={{ color: s.enrolled_count > s.max_capacity ? '#dc2626' : '#94a3b8' }}>
                                  {s.enrolled_count}/{s.max_capacity}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ValidationTab({ semester, academicYear, departmentContains }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [ran, setRan] = useState(false);

  const runValidation = useCallback(async () => {
    if (!semester || !academicYear) return;
    setLoading(true);
    try {
      const res = await semesterAPI.validate({
        semester,
        academic_year: academicYear,
        department_contains: departmentContains || undefined,
      });
      setResult(res.data?.data || null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
      setRan(true);
    }
  }, [semester, academicYear, departmentContains]);

  useEffect(() => { runValidation(); }, [runValidation]);

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
        <Spinner />
        <div style={{ marginTop: 12 }}>Running validation checks…</div>
      </div>
    );
  }

  if (!ran) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <button onClick={runValidation} style={{ padding: '10px 20px', borderRadius: 8, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          Run Validation
        </button>
      </div>
    );
  }

  const { issues = [], summary = {}, total_sections = 0 } = result || {};
  const hasIssues = issues.length > 0;

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, color: '#64748b' }}>
          {total_sections} section{total_sections !== 1 ? 's' : ''} checked · {cap(semester)} {academicYear}
        </div>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', alignItems: 'center', flexWrap: 'wrap' }}>
          {['critical', 'warning', 'info'].map(sev => {
            const cfg = SEVERITY_CONFIG[sev];
            const count = summary[sev] || 0;
            return (
              <span key={sev} style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: count > 0 ? cfg.bg : '#f8fafc', color: count > 0 ? cfg.color : '#94a3b8', border: `1px solid ${count > 0 ? cfg.border : '#e2e8f0'}` }}>
                {cfg.icon} {count} {cfg.label}
              </span>
            );
          })}
          <button
            onClick={runValidation}
            style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 12, color: '#374151', fontWeight: 500 }}
          >
            Re-run
          </button>
        </div>
      </div>

      {!hasIssues ? (
        <div style={{ padding: 48, textAlign: 'center', border: '2px solid #bbf7d0', borderRadius: 12, background: '#f0fdf4' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#166534', marginBottom: 4 }}>All checks passed</div>
          <div style={{ fontSize: 13, color: '#166534' }}>No issues found for {cap(semester)} {academicYear}. Safe to publish.</div>
        </div>
      ) : (
        <div>
          {['critical', 'warning', 'info'].flatMap(sev =>
            issues.filter(i => i.severity === sev).map(issue => (
              <IssueCard key={issue.type} issue={issue} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────
export default function SemesterManagementPage() {
  const [semester, setSemester] = useState('fall');
  const [startYear, setStartYear] = useState(NOW);
  const academicYear = `${startYear}/${startYear + 1}`;
  const [activeTab, setActiveTab] = useState('Timetable');

  // College / Faculty selector — defaults to the first (and currently only) college.
  const [selectedCollege, setSelectedCollege] = useState(COLLEGES[0].label);
  const deptFilter = COLLEGE_FILTERS[selectedCollege]?.departmentContains || '';

  const [stats, setStats] = useState(null);
  const [meetings, setMeetings] = useState([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [meetingsLoading, setMeetingsLoading] = useState(false);
  const [error, setError] = useState(null);

  const [allSemesterStatuses, setAllSemesterStatuses] = useState([]);
  const [statusLoading, setStatusLoading] = useState(false);
  const [publishLoading, setPublishLoading] = useState(false);
  const [publishConfirm, setPublishConfirm] = useState(false);
  const [unpublishConfirm, setUnpublishConfirm] = useState(false);
  const [publishBlockedResult, setPublishBlockedResult] = useState(null);
  const [publishWarnings, setPublishWarnings] = useState(null);

  const currentSemData = allSemesterStatuses.find(
    s => s.semester === semester && s.academic_year === academicYear
  );
  const semesterStatus = currentSemData?.status || null;

  const loadStats = useCallback(async () => {
    if (!semester || !academicYear) return;
    setStatsLoading(true);
    setError(null);
    try {
      const res = await semesterAPI.getSemesterStats(semester, academicYear, {
        department_contains: deptFilter || undefined,
      });
      setStats(res.data.data);
    } catch {
      setError('Failed to load stats — check semester and year values.');
    } finally {
      setStatsLoading(false);
    }
  }, [semester, academicYear, deptFilter]);

  const loadMeetings = useCallback(async () => {
    if (!semester || !academicYear) return;
    setMeetingsLoading(true);
    try {
      const res = await semesterAPI.getSemesterMeetings(semester, academicYear, {
        department_contains: deptFilter || undefined,
      });
      setMeetings(res.data.data.meetings || []);
    } catch {
      setMeetings([]);
    } finally {
      setMeetingsLoading(false);
    }
  }, [semester, academicYear, deptFilter]);

  // Auto-load whenever semester or academic year changes
  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { if (activeTab === 'Timetable') loadMeetings(); }, [activeTab, loadMeetings]);

  // Called by SectionsTab after any create/edit/deactivate
  const handleSectionDataChanged = useCallback(() => {
    loadStats();
    loadMeetings();
  }, [loadStats, loadMeetings]);

  const loadSemesterStatuses = useCallback(async () => {
    setStatusLoading(true);
    try {
      const res = await semesterAPI.list();
      setAllSemesterStatuses(res.data?.data?.semesters || []);
    } catch {
      setAllSemesterStatuses([]);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => { loadSemesterStatuses(); }, [loadSemesterStatuses]);

  useEffect(() => {
    if (!semester || !academicYear) return;
    semesterAPI.ensure({ semester, academic_year: academicYear })
      .then(() => loadSemesterStatuses())
      .catch(() => {});
  }, [semester, academicYear]); // eslint-disable-line react-hooks/exhaustive-deps

  const doPublish = async () => {
    setPublishLoading(true);
    try {
      await semesterAPI.publish({ semester, academic_year: academicYear });
      toast.success(`${cap(semester)} ${academicYear} published — students can now see their schedule.`);
      setPublishConfirm(false);
      setPublishWarnings(null);
      await loadSemesterStatuses();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setPublishLoading(false);
    }
  };

  const handlePublishClick = async () => {
    setPublishLoading(true);
    try {
      const res = await semesterAPI.validate({
        semester,
        academic_year: academicYear,
        department_contains: deptFilter || undefined,
      });
      const validation = res.data?.data;
      if (validation?.summary?.critical > 0) {
        setPublishBlockedResult(validation);
        return;
      }
      setPublishWarnings(validation?.summary?.warning > 0 ? validation : null);
      setPublishConfirm(true);
    } catch {
      setPublishWarnings(null);
      setPublishConfirm(true);
    } finally {
      setPublishLoading(false);
    }
  };

  const handleUnpublish = async () => {
    setPublishLoading(true);
    try {
      await semesterAPI.unpublish({ semester, academic_year: academicYear });
      toast.success(`${cap(semester)} ${academicYear} set to draft — hidden from students.`);
      setUnpublishConfirm(false);
      await loadSemesterStatuses();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setPublishLoading(false);
    }
  };

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
          {statusLoading ? (
            <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 600, background: '#f1f5f9', color: '#94a3b8', border: '1px solid #e2e8f0' }}>
              …
            </span>
          ) : semesterStatus === 'published' ? (
            <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 600, background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}>
              Published
            </span>
          ) : (
            <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 600, background: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)' }}>
              Draft
            </span>
          )}

          {semesterStatus === 'published' ? (
            <button
              onClick={() => setUnpublishConfirm(true)}
              disabled={publishLoading}
              style={{ padding: '8px 14px', borderRadius: 8, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', cursor: publishLoading ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}
            >
              Set to Draft
            </button>
          ) : (
            <button
              onClick={handlePublishClick}
              disabled={publishLoading || statusLoading}
              style={{ padding: '8px 14px', borderRadius: 8, background: publishLoading || statusLoading ? '#f1f5f9' : '#2563eb', color: publishLoading || statusLoading ? '#94a3b8' : '#fff', border: 'none', cursor: publishLoading || statusLoading ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}
            >
              {publishLoading ? 'Validating…' : 'Publish Semester'}
            </button>
          )}
        </div>

        {publishConfirm && (
          <ConfirmDialog
            open={true}
            onClose={() => { setPublishConfirm(false); setPublishWarnings(null); }}
            onConfirm={doPublish}
            loading={publishLoading}
            title="Publish Semester"
            message={
              <>
                {publishWarnings && (
                  <span style={{ display: 'block', marginBottom: 10, padding: '8px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, color: '#92400e', fontWeight: 600, fontSize: 13 }}>
                    ⚠️ {publishWarnings.summary.warning} warning{publishWarnings.summary.warning !== 1 ? 's' : ''} found — review the Validation tab after publishing.
                  </span>
                )}
                {`Publish ${cap(semester)} ${academicYear}? Students will be able to see their schedule for this semester.`}
              </>
            }
          />
        )}

        {publishBlockedResult && (
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
            onClick={e => { if (e.target === e.currentTarget) setPublishBlockedResult(null); }}
          >
            <div style={{ background: '#fff', borderRadius: 14, padding: '24px 28px', maxWidth: 520, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 22 }}>🚫</span>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#dc2626' }}>Cannot Publish — Critical Issues Found</div>
              </div>
              <p style={{ fontSize: 13, color: '#374151', marginBottom: 14 }}>
                Fix the following issues before publishing <strong>{cap(semester)} {academicYear}</strong>:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20, maxHeight: 260, overflowY: 'auto' }}>
                {(publishBlockedResult.issues || []).filter(i => i.severity === 'critical').map(issue => (
                  <div key={issue.type} style={{ padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: '#dc2626', fontWeight: 600 }}>
                    🔴 {issue.message}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setPublishBlockedResult(null)}
                  style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', color: '#374151', fontSize: 13, fontWeight: 500 }}
                >
                  Close
                </button>
                <button
                  onClick={() => { setPublishBlockedResult(null); setActiveTab('Validation'); }}
                  style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                >
                  Go to Validation
                </button>
              </div>
            </div>
          </div>
        )}
        {unpublishConfirm && (
          <ConfirmDialog
            open={true}
            onClose={() => setUnpublishConfirm(false)}
            onConfirm={handleUnpublish}
            loading={publishLoading}
            danger
            title="Set to Draft"
            message={`Set ${cap(semester)} ${academicYear} back to draft? Students will no longer see their schedule for this semester.`}
          />
        )}
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
          <AcademicYearStepper
            value={academicYear}
            onChange={v => setStartYear(parseInt(v.split('/')[0], 10))}
            minYear={YEAR_MIN}
            maxYear={YEAR_MAX}
          />
        </div>

        {/* College / Faculty selector */}
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            College / Faculty
          </label>
          <select
            value={selectedCollege}
            onChange={e => setSelectedCollege(e.target.value)}
            style={{
              height: 38, padding: '0 12px',
              border: '1px solid #d1d5db', borderRadius: 8,
              background: '#fff', fontSize: 13, fontWeight: 500,
              color: '#111827', cursor: 'pointer',
              minWidth: 210,
            }}
          >
            {COLLEGES.map(c => (
              <option key={c.label} value={c.label}>{c.label}</option>
            ))}
          </select>
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
          departmentContains={deptFilter}
          collegeName={selectedCollege}
          onDataChanged={handleSectionDataChanged}
        />
      )}
      {activeTab === 'Timetable' && (
        <TimetableTab meetings={meetings} loading={meetingsLoading} />
      )}
      {activeTab === 'Enrollments' && (
        <EnrollmentsTab
          semester={semester}
          academicYear={academicYear}
          departmentContains={deptFilter}
          onDataChanged={handleSectionDataChanged}
        />
      )}
      {activeTab === 'Doctors' && (
        <DoctorsTab
          semester={semester}
          academicYear={academicYear}
          departmentContains={deptFilter}
        />
      )}
      {activeTab === 'Rooms' && (
        <RoomsTab
          semester={semester}
          academicYear={academicYear}
          departmentContains={deptFilter}
        />
      )}
      {activeTab === 'Validation' && (
        <ValidationTab
          semester={semester}
          academicYear={academicYear}
          departmentContains={deptFilter}
        />
      )}
    </div>
  );
}

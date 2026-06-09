import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';
import { notificationAPI, floorAPI } from '../api/index';
import { RoomAvailabilityMap } from '../components/map/RoomAvailabilityMap';
import { useAuth } from '../context/AuthContext';
import { timeAgo } from '../utils/helpers';
import useProfessorTerm from '../hooks/useProfessorTerm';
import './ProfessorDashboard.css';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const SEMESTERS = [
  { value: 'spring', label: 'Second Semester' },
  { value: 'fall', label: 'First Semester' },
  { value: 'summer', label: 'Summer Semester' }
];

const TIME_SLOTS = [
  '08:00', '09:00', '10:00', '11:00', '12:00',
  '13:00', '14:00', '15:00', '16:00', '17:00',
  '18:00', '19:00', '20:00'
];

function formatTime(t) {
  if (!t) return '';
  const [h, m] = String(t).split(':');
  const hr = parseInt(h, 10);
  return `${hr > 12 ? hr - 12 : hr || 12}:${m || '00'} ${hr >= 12 ? 'PM' : 'AM'}`;
}

function formatTime24(t) {
  if (!t) return '';
  return String(t).slice(0, 5);
}

function getCountdownProf(startTime) {
  if (!startTime) return '';
  const now = new Date();
  const [h, m] = String(startTime).split(':').map(Number);
  const start = new Date(now);
  start.setHours(h, m, 0, 0);
  const diffMs = start - now;
  if (diffMs <= 0) return 'Starting';
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 60) return `In ${diffMin}m`;
  const hrs = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  return mins > 0 ? `In ${hrs}h ${mins}m` : `In ${hrs}h`;
}

function getAcademicYearOptions() {
  const current = new Date().getFullYear();
  return [
    `${current}/${current + 1}`,
    `${current - 1}/${current}`,
    `${current - 2}/${current - 1}`,
    '2025/2026',
    '2024/2025'
  ].filter((v, idx, arr) => arr.indexOf(v) === idx);
}

function dateForNextDay(dayNumber) {
  const today = new Date();
  const todayDay = today.getDay();
  const diff = (Number(dayNumber) - todayDay + 7) % 7;
  const target = new Date(today);
  target.setDate(today.getDate() + diff);
  return target.toISOString().split('T')[0];
}

function slotOf(time) {
  if (!time) return '';
  return String(time).slice(0, 2) + ':00';
}

function isSameSlot(row, slot) {
  return slotOf(row.start_time) === slot;
}

function isOnlineRoom(roomNumber) {
  const value = String(roomNumber ?? '').trim();
  return value === '9999' || value.endsWith('9999');
}

function roomDisplay(roomNumber, fallback = '—') {
  return isOnlineRoom(roomNumber) ? 'الكتروني' : (roomNumber || fallback);
}

function roomDisplayEnglish(roomNumber, fallback = 'TBA') {
  return isOnlineRoom(roomNumber) ? 'Online' : (roomNumber || fallback);
}

function formatDateLabel(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-GB');
}

function scopeLabel(scope) {
  if (scope === 'single_day') return 'This lecture only';
  if (scope === 'date_range') return 'Date range';
  if (scope === 'permanent') return 'Permanent';
  return scope || 'Change';
}

function changeDateText(change) {
  if (!change) return '';
  if (change.change_scope === 'single_day') return formatDateLabel(change.change_date);
  if (change.change_scope === 'date_range') {
    return `${formatDateLabel(change.start_date)} → ${formatDateLabel(change.end_date)}`;
  }
  return 'All future lectures';
}

function StatCard({ icon, label, value, color }) {
  return (
    <div className={`prof-stat prof-stat--${color}`}>
      <div className="prof-stat__icon">{icon}</div>
      <div className="prof-stat__val">{value}</div>
      <div className="prof-stat__label">{label}</div>
    </div>
  );
}

function AttBadge({ pct }) {
  if (pct === null || pct === undefined) return <span className="att-badge att-badge--none">No data</span>;
  const n = parseFloat(pct);
  const cls = n >= 75 ? 'good' : n >= 50 ? 'warn' : 'danger';
  return <span className={`att-badge att-badge--${cls}`}>{n}%</span>;
}

function SectionSelectCard({ sections, onOpenStudents, onOpenAttendance, showAttendance = false }) {
  return (
    <div className="card">
      <div className="prof-card-hdr">
        <h3>📚 Select a section</h3>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Choose a course to manage students and grades
        </span>
      </div>

      {(sections || []).map((s) => (
        <div key={s.id} className="prof-section-item">
          <div className="prof-section-code">{s.code}</div>
          <div className="prof-section-info">
            <div className="prof-section-name">{s.course_name}</div>
            <div className="prof-section-meta">
              §{s.section_number} · {(s.day_of_week || []).map((d) => DAY_SHORT[d]).join(', ')}
              {s.room_number && ` · ${roomDisplayEnglish(s.room_number)}`}
            </div>
          </div>
          <div className="prof-section-count">
            <span>{s.enrolled || 0}</span>
            <small>students</small>
          </div>
          <div className="prof-section-actions">
            <button className="btn btn--sm btn--secondary" onClick={() => onOpenStudents(s)}>
              Grades
            </button>
            {showAttendance && (
              <button className="btn btn--sm btn--primary" onClick={() => onOpenAttendance(s)}>
                Attendance
              </button>
            )}
          </div>
        </div>
      ))}

      {(sections || []).length === 0 && (
        <div className="empty-state">
          <p className="empty-state__title">No sections assigned yet.</p>
        </div>
      )}
    </div>
  );
}

function normalizeFloorKey(floor) {
  const label = String(floor?.floor_label || '').trim().toUpperCase();
  if (label === 'B2') return 'B2';
  if (label === 'B1') return 'B1';
  if (label === 'G')  return 'G';
  const n = Number(floor?.floor_number);
  if (n === -2) return 'B2';
  if (n === -1) return 'B1';
  if (n === 0)  return 'G';
  return String(n || label);
}

export default function ProfessorDashboard() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const mode = location.pathname.includes('/professor/schedule')
    ? 'schedule'
    : location.pathname.includes('/professor/students')
      ? 'students'
      : location.pathname.includes('/professor/materials')
        ? 'materials'
        : location.pathname.includes('/professor/messages')
          ? 'messages'
          : location.pathname.includes('/professor/office-hours')
            ? 'officeHours'
            : location.pathname.includes('/professor/change-history')
              ? 'changeHistory'
              : location.pathname.includes('/professor/analytics')
                ? 'analytics'
                : location.pathname.includes('/professor/attendance')
                  ? 'attendance'
                  : 'overview';

  const [data, setData] = useState(null);
  const [scheduleRows, setScheduleRows] = useState([]);
  const [officeHours, setOfficeHours] = useState([]);
  const [scheduleChanges, setScheduleChanges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const { semester, academicYear, terms, termLoading, hasTerm, setTerm } = useProfessorTerm();

  const [scheduleView, setScheduleView] = useState('text');

  const [activeSection, setActiveSection] = useState(null);
  const [students, setStudents] = useState([]);
  const [attSummary, setAttSummary] = useState([]);
  const [loadingSec, setLoadingSec] = useState(false);

  const [attDate, setAttDate] = useState(new Date().toISOString().split('T')[0]);
  const [attRecs, setAttRecs] = useState({});
  const [saving, setSaving] = useState(false);

  const [gradeEdit, setGradeEdit] = useState({});
  const [savingGrades, setSavingGrades] = useState(false);
  const [hasUnsavedGrades, setHasUnsavedGrades] = useState(false);

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importConfirming, setImportConfirming] = useState(false);
  const [missingExpanded, setMissingExpanded] = useState(false);

  const [roomOptions, setRoomOptions] = useState([]);
  const [changeModal, setChangeModal] = useState(null);
  const [changeForm, setChangeForm] = useState({
    change_scope: 'single_day',
    change_date: '',
    start_date: '',
    end_date: '',
    day_of_week: '',
    start_time: '',
    end_time: '',
    room_id: '',
    reason: ''
  });
  const [changeSaving, setChangeSaving] = useState(false);
  const [changeError, setChangeError] = useState(null);
  const [editingChangeId, setEditingChangeId] = useState(null);

  const [roomSearch, setRoomSearch] = useState('');
  const [roomDropOpen, setRoomDropOpen] = useState(false);
  const roomDropRef = useRef(null);

  const [mapOpen, setMapOpen] = useState(false);
  const [mapFloors, setMapFloors] = useState([]);
  const mapFloorsLoadedRef = useRef(false);
  const [mapFloorId, setMapFloorId] = useState('');
  const [mapMsg, setMapMsg] = useState('');

  // Availability state
  const [availMap, setAvailMap]       = useState(null); // Map<roomId, {status,conflict}> | null
  const [availLoading, setAvailLoading] = useState(false);
  const availSeqRef = useRef(0);        // stale-request guard
  const [rconflictMsg, setRconflictMsg] = useState('');

  const [materials, setMaterials] = useState([]);
  const [materialSections, setMaterialSections] = useState([]);
  const [materialSectionId, setMaterialSectionId] = useState('');
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [materialSaving, setMaterialSaving] = useState(false);
  const [materialFileUploading, setMaterialFileUploading] = useState(false);
  const materialFileInputRef = useRef(null);
  const materialFormRef = useRef(null);
  const [editingMaterialId, setEditingMaterialId] = useState(null);
  const [materialForm, setMaterialForm] = useState({
    title: '',
    material_type: 'lecture_notes',
    week_number: '',
    file_url: '',
    description: '',
    is_published: true,
    notify_students: true
  });

  const [officeRows, setOfficeRows] = useState([]);
  const [officeLoading, setOfficeLoading] = useState(false);
  const [officeSaving, setOfficeSaving] = useState(false);
  const [editingOfficeId, setEditingOfficeId] = useState(null);
  const [assignedOffice, setAssignedOffice] = useState(undefined);
  const [officeForm, setOfficeForm] = useState({
    day_of_week: String(new Date().getDay()),
    start_time: '10:00',
    end_time: '11:00',
    note: '',
    notify_students: false
  });

  const [officeBookings, setOfficeBookings] = useState([]);
  const [bookingSavingId, setBookingSavingId] = useState(null);

  const [messages, setMessages] = useState([]);
  const [messageSections, setMessageSections] = useState([]);
  const [messageSectionId, setMessageSectionId] = useState('');
  const [messageLoading, setMessageLoading] = useState(false);
  const [messageSaving, setMessageSaving] = useState(false);
  const [messageForm, setMessageForm] = useState({
    title: '',
    body: '',
    is_pinned: false,
    notify_students: true
  });

  const [changeHistory, setChangeHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [analytics, setAnalytics] = useState({ totals: {}, sections: [] });
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsSectionId, setAnalyticsSectionId] = useState('all');

  const [activeChanges, setActiveChanges] = useState([]);
  const [profNotifications, setProfNotifications] = useState([]);
  const [profUnreadCount, setProfUnreadCount] = useState(0);
  const [notifLoading, setNotifLoading] = useState(false);

  const analyticsSections = useMemo(() => analytics.sections || [], [analytics.sections]);

  const filteredAnalyticsSections = useMemo(() => {
    if (analyticsSectionId === 'all') return analyticsSections;
    return analyticsSections.filter((s) => String(s.section_id) === String(analyticsSectionId));
  }, [analyticsSections, analyticsSectionId]);

  const analyticsTotals = useMemo(() => {
    const rows = filteredAnalyticsSections;
    const totalCourses = new Set(rows.map((s) => s.course_id || s.code)).size;

    return {
      total_sections: rows.length,
      total_students: rows.reduce((sum, s) => sum + Number(s.enrolled || 0), 0),
      total_courses: totalCourses,
      warnings_sent: rows.reduce((sum, s) => sum + Number(s.warnings_sent || 0), 0)
    };
  }, [filteredAnalyticsSections]);

  const selectedAnalyticsLabel = useMemo(() => {
    if (analyticsSectionId === 'all') return 'All courses / sections';
    const row = analyticsSections.find((s) => String(s.section_id) === String(analyticsSectionId));
    return row ? `${row.code} §${row.section_number}` : 'Selected course';
  }, [analyticsSections, analyticsSectionId]);

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const dashGen = useRef(0);
  const schedGen = useRef(0);

  const loadDashboard = useCallback(async () => {
    if (!hasTerm) return;
    const gen = ++dashGen.current;
    setLoading(true);
    setData(null);
    // Clear per-section state so stale data from the previous semester never shows
    setActiveSection(null);
    setStudents([]);
    setAttSummary([]);
    setGradeEdit({});
    setAttRecs({});
    try {
      const r = await axiosInstance.get('/professor/dashboard', {
        params: { semester, academic_year: academicYear },
      });
      if (gen === dashGen.current) setData(r.data?.data ?? null);
    } catch (err) {
      if (gen === dashGen.current) {
        const msg = err?.response?.data?.message || err?.message || 'Failed to load dashboard';
        showToast(msg, 'error');
      }
    } finally {
      if (gen === dashGen.current) setLoading(false);
    }
  }, [semester, academicYear, hasTerm, showToast]);

  const loadSchedule = useCallback(async () => {
    if (!hasTerm) return;
    const gen = ++schedGen.current;
    setScheduleLoading(true);
    try {
      const r = await axiosInstance.get('/professor/schedule', {
        params: { semester, academic_year: academicYear }
      });
      if (gen === schedGen.current) {
        setScheduleRows(r.data.data.sections || []);
        setOfficeHours(r.data.data.office_hours || []);
        setScheduleChanges(r.data.data.active_changes || []);
      }
    } catch {
      if (gen === schedGen.current) showToast('Failed to load schedule', 'error');
    } finally {
      if (gen === schedGen.current) setScheduleLoading(false);
    }
  }, [semester, academicYear, hasTerm, showToast]);

  const loadMaterials = useCallback(async (sectionIdArg) => {
    if (!hasTerm) return;
    setMaterialsLoading(true);
    // When called with no sectionId (term change or mode switch), reset selection
    if (sectionIdArg === undefined) {
      setMaterialSections([]);
      setMaterials([]);
      setMaterialSectionId('');
    }
    try {
      const selectedSectionId = sectionIdArg !== undefined ? sectionIdArg : '';
      const r = await axiosInstance.get('/professor/materials', {
        params: {
          semester,
          academic_year: academicYear,
          ...(selectedSectionId ? { section_id: selectedSectionId } : {})
        }
      });

      const sections = r.data.data.sections || [];
      const nextSectionId = selectedSectionId || sections[0]?.id || '';

      setMaterialSections(sections);
      setMaterialSectionId(nextSectionId);
      setMaterials(r.data.data.materials || []);
    } catch {
      showToast('Failed to load course materials', 'error');
    } finally {
      setMaterialsLoading(false);
    }
  }, [semester, academicYear, hasTerm, showToast]);

  const loadOfficeHoursPage = useCallback(async () => {
    setOfficeLoading(true);
    try {
      const hoursRes = await axiosInstance.get('/professor/office-hours');
      setOfficeRows(hoursRes.data.data.office_hours || []);
      setAssignedOffice(hoursRes.data.data.assigned_office ?? null);
    } catch {
      showToast('Failed to load office hours', 'error');
    } finally {
      setOfficeLoading(false);
    }

    try {
      const bookingsRes = await axiosInstance.get('/professor/office-hour-bookings');
      setOfficeBookings(bookingsRes.data.data.bookings || []);
    } catch {
      setOfficeBookings([]);
    }
  }, [showToast]);

  const loadChangeHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const r = await axiosInstance.get('/professor/meeting-changes');
      setChangeHistory(r.data.data.changes || []);
    } catch {
      showToast('Failed to load change history', 'error');
    } finally {
      setHistoryLoading(false);
    }
  }, [showToast]);

  const loadAnalytics = useCallback(async () => {
    if (!hasTerm) return;
    setAnalyticsLoading(true);
    setAnalytics({ totals: {}, sections: [] });
    try {
      const r = await axiosInstance.get('/professor/analytics', {
        params: { semester, academic_year: academicYear }
      });
      setAnalytics(r.data.data || { totals: {}, sections: [] });
    } catch {
      showToast('Failed to load analytics', 'error');
    } finally {
      setAnalyticsLoading(false);
    }
  }, [semester, academicYear, hasTerm, showToast]);


  const loadMessages = useCallback(async () => {
    setMessageLoading(true);
    try {
      const r = await axiosInstance.get('/professor/messages');
      const sections = r.data.data.sections || [];
      setMessageSections(sections);
      setMessages(r.data.data.messages || []);
      setMessageSectionId((prev) => prev || sections[0]?.id || '');
    } catch {
      showToast('Failed to load course messages', 'error');
    } finally {
      setMessageLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (mode === 'schedule') loadSchedule();
  }, [mode, loadSchedule]);

  useEffect(() => {
    if (mode === 'materials') loadMaterials();
  }, [mode, loadMaterials]);

  useEffect(() => {
    if (mode === 'officeHours') loadOfficeHoursPage();
  }, [mode, loadOfficeHoursPage]);

  useEffect(() => {
    if (mode === 'changeHistory') loadChangeHistory();
  }, [mode, loadChangeHistory]);

  useEffect(() => {
    if (mode === 'analytics') loadAnalytics();
  }, [mode, loadAnalytics]);

  // Lock background scroll while import modal is open
  useEffect(() => {
    if (importModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [importModalOpen]);

  useEffect(() => {
    if (
      analyticsSectionId !== 'all'
      && analyticsSections.length > 0
      && !analyticsSections.some((s) => String(s.section_id) === String(analyticsSectionId))
    ) {
      setAnalyticsSectionId('all');
    }
  }, [analyticsSectionId, analyticsSections]);


  useEffect(() => {
    if (mode === 'messages') loadMessages();
  }, [mode, loadMessages]);

  useEffect(() => {
    if (mode !== 'overview') return;
    axiosInstance.get('/professor/meeting-changes')
      .then(res => {
        const payload = res.data?.data?.changes ?? res.data?.data ?? res.data?.changes ?? res.data ?? [];
        const changes = Array.isArray(payload) ? payload : [];
        setActiveChanges(changes.filter(c => c?.is_active !== false));
      })
      .catch(() => setActiveChanges([]));
  }, [mode]);

  useEffect(() => {
    if (mode !== 'overview') return;
    setNotifLoading(true);
    notificationAPI.getMy({ limit: 5 })
      .then(res => {
        const items = res.data?.data ?? res.data ?? [];
        const list = Array.isArray(items) ? items : [];
        setProfNotifications(list);
        setProfUnreadCount(list.filter(n => !n.is_read).length);
      })
      .catch(() => setProfNotifications([]))
      .finally(() => setNotifLoading(false));
  }, [mode]);

  useEffect(() => {
    if (!roomDropOpen) return;
    function closeOnOutsideClick(e) {
      if (roomDropRef.current && !roomDropRef.current.contains(e.target)) {
        setRoomDropOpen(false);
        setRoomSearch('');
        setRconflictMsg('');
      }
    }
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [roomDropOpen]);

  // ── Availability refresh ─────────────────────────────────────────────
  // Fires whenever the change modal's time/date params change.
  // Uses a sequence counter to discard stale responses (avoids races).
  useEffect(() => {
    if (!changeModal) {
      setAvailMap(null);
      setAvailLoading(false);
      return;
    }

    const {
      change_scope, change_date, start_date, end_date,
      day_of_week, start_time, end_time,
    } = changeForm;

    const hasTime =
      start_time && end_time &&
      day_of_week !== '' && day_of_week !== undefined;
    const hasDate =
      change_scope === 'single_day' ? !!change_date :
      change_scope === 'date_range' ? (!!start_date && !!end_date) :
      true;

    if (!hasTime || !hasDate) {
      setAvailMap(null);
      setAvailLoading(false);
      return;
    }

    // Debounce + stale-guard
    availSeqRef.current += 1;
    const seq = availSeqRef.current;
    setAvailLoading(true);

    const timer = setTimeout(async () => {
      const params = {
        section_id:   changeModal.id,
        change_scope,
        day_of_week,
        start_time,
        end_time,
      };
      if (change_scope === 'single_day')  params.date       = change_date;
      if (change_scope === 'date_range') { params.start_date = start_date; params.end_date = end_date; }
      if (changeModal.meeting_id)         params.meeting_id  = changeModal.meeting_id;
      if (editingChangeId)                params.editing_change_id = editingChangeId;

      try {
        const res = await axiosInstance.get('/professor/rooms/availability', { params });
        if (availSeqRef.current !== seq) return; // stale — a newer request superseded this one
        const payload = res.data?.data;
        if (!payload?.params_complete) {
          setAvailMap(null);
        } else {
          const map = new Map();
          (payload.rooms || []).forEach(r => {
            map.set(String(r.id), { status: r.status, conflict: r.conflict });
          });
          setAvailMap(map);
        }
      } catch {
        if (availSeqRef.current !== seq) return;
        setAvailMap(null); // keep modal usable on error
      } finally {
        if (availSeqRef.current === seq) setAvailLoading(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [
    changeModal,
    editingChangeId,
    changeForm.change_scope,
    changeForm.change_date,
    changeForm.start_date,
    changeForm.end_date,
    changeForm.day_of_week,
    changeForm.start_time,
    changeForm.end_time,
  ]);

  const loadSection = useCallback(async (section, targetMode = 'students', options = {}) => {
    if (!section) return;

    setActiveSection(section);
    setLoadingSec(true);

    if (targetMode === 'attendance') {
      navigate('/professor/attendance');
      if (options.date) setAttDate(options.date);
    } else {
      navigate('/professor/students');
    }

    try {
      const [studRes, attRes] = await Promise.all([
        axiosInstance.get(`/professor/sections/${section.id}/students`),
        axiosInstance.get(`/professor/sections/${section.id}/attendance/summary`)
      ]);

      const studs = studRes.data.data.students || [];
      setStudents(studs);
      setAttSummary(attRes.data.data.summary || []);

      const ge = {};
      studs.forEach((s) => {
        ge[s.id] = {
          midterm: s.midterm || '',
          assignments: s.assignments || '',
          final: s.final || ''
        };
      });
      setGradeEdit(ge);
      setHasUnsavedGrades(false);

      const ar = {};
      studs.forEach((s) => {
        ar[s.id] = 'present';
      });
      setAttRecs(ar);
    } catch {
      showToast('Failed to load section data', 'error');
    } finally {
      setLoadingSec(false);
    }
  }, [navigate, showToast]);

  const openAttendanceFromMeeting = (meeting) => {
    const section = (data?.sections || []).find((s) => s.id === meeting.id) || meeting;
    const targetDate = dateForNextDay(meeting.day_of_week);
    loadSection(section, 'attendance', { date: targetDate });
  };


  const loadRoomOptions = useCallback(async () => {
    try {
      const r = await axiosInstance.get('/professor/rooms');
      setRoomOptions(r.data.data.rooms || []);
    } catch {
      showToast('Failed to load rooms', 'error');
    }
  }, [showToast]);

  // ── Rooms enriched with availability status ──────────────────────────
  const roomsWithAvail = useMemo(() => {
    return roomOptions.map(r => {
      const av = availMap ? availMap.get(String(r.id)) : null;
      return {
        ...r,
        avStatus:  av?.status  || (availMap ? 'available' : 'unknown'),
        avConflict: av?.conflict || null,
      };
    });
  }, [roomOptions, availMap]);

  // Sorted + filtered list for the dropdown
  // Order: selected first, then available, then busy, then unknown
  const filteredRoomOptions = useMemo(() => {
    const q = roomSearch.trim().toLowerCase();
    const STATUS_ORDER = { available: 0, busy: 1, unknown: 2 };
    return roomsWithAvail
      .filter(r =>
        !q ||
        (r.room_number || '').toLowerCase().includes(q) ||
        (r.name || '').toLowerCase().includes(q) ||
        (r.type || '').toLowerCase().replace(/_/g, ' ').includes(q) ||
        (r.floor_label || '').toLowerCase().includes(q) ||
        (r.building_name || '').toLowerCase().includes(q)
      )
      .sort((a, b) => {
        const aSelected = String(a.id) === String(changeForm.room_id);
        const bSelected = String(b.id) === String(changeForm.room_id);
        if (aSelected && !bSelected) return -1;
        if (!aSelected && bSelected) return 1;
        return (STATUS_ORDER[a.avStatus] ?? 2) - (STATUS_ORDER[b.avStatus] ?? 2);
      });
  }, [roomsWithAvail, roomSearch, changeForm.room_id]);

  const selectedRoomObj = useMemo(
    () => roomOptions.find(r => String(r.id) === String(changeForm.room_id)) || null,
    [roomOptions, changeForm.room_id]
  );

  const mapFloorKey = useMemo(() => {
    const floor = mapFloors.find(f => f.id === mapFloorId);
    return floor ? normalizeFloorKey(floor) : null;
  }, [mapFloors, mapFloorId]);

  // Map availability — uses availability data when loaded, falls back to
  // showing all rooms as "available" (clickable/green) when params are
  // not yet complete so the floor plan remains navigable.
  const mapAvailability = useMemo(() => {
    const floor = mapFloors.find(f => f.id === mapFloorId);
    if (!floor) return {};
    const fLabel = floor.floor_label;
    const byNum  = {};
    roomsWithAvail.forEach(r => {
      if (r.floor_label !== fLabel) return;
      const isSelected = String(r.id) === String(changeForm.room_id);
      let mapStatus;
      // Conflict status always wins — even for the selected room.
      // isSelected is set separately so the map component can draw the blue outline.
      if (r.avStatus === 'busy') {
        mapStatus = r.avConflict?.type === 'event_booking' ? 'event_conflict' : 'lecture_conflict';
      } else if (isSelected) {
        mapStatus = 'selected';
      } else {
        // 'available' or 'unknown' — show as green/clickable either way
        mapStatus = 'available';
      }
      byNum[r.room_number] = { status: mapStatus, room_id: r.id, conflict: r.avConflict, isSelected };
    });
    return byNum;
  }, [mapFloors, mapFloorId, roomsWithAvail, changeForm.room_id]);

  // Warning when the professor's current room selection becomes conflicted
  // (e.g. they changed the time after picking a room).
  const selectedRoomBusy = useMemo(() => {
    if (!changeForm.room_id || !availMap) return null;
    const av = availMap.get(String(changeForm.room_id));
    return av?.status === 'busy' ? av.conflict : null;
  }, [changeForm.room_id, availMap]);

  const openMeetingChange = async (meeting) => {
    const nextDate = dateForNextDay(meeting.day_of_week);
    setEditingChangeId(null);
    setChangeError(null);
    setAvailMap(null);
    setAvailLoading(false);
    setRconflictMsg('');
    setChangeModal(meeting);
    setChangeForm({
      change_scope: 'single_day',
      change_date: nextDate,
      start_date: nextDate,
      end_date: nextDate,
      day_of_week: String(meeting.day_of_week ?? ''),
      start_time: formatTime24(meeting.start_time),
      end_time: formatTime24(meeting.end_time),
      room_id: meeting.room_id || '',
      reason: ''
    });

    if (!roomOptions.length) await loadRoomOptions();
  };

  const openChangeEdit = async (change) => {
    setEditingChangeId(change.id);
    setChangeError(null);
    setAvailMap(null);
    setAvailLoading(false);
    setRconflictMsg('');
    setChangeModal({
      id:          change.section_id,
      meeting_id:  change.meeting_id || null,
      code:        change.code,
      course_name: change.course_name
    });
    setChangeForm({
      change_scope: change.change_scope,
      change_date:  change.change_date  ? String(change.change_date).slice(0, 10)  : '',
      start_date:   change.start_date   ? String(change.start_date).slice(0, 10)   : '',
      end_date:     change.end_date     ? String(change.end_date).slice(0, 10)     : '',
      day_of_week:  String(change.new_day_of_week ?? ''),
      start_time:   formatTime24(change.new_start_time),
      end_time:     formatTime24(change.new_end_time),
      room_id:      change.new_room_id || '',
      reason:       change.reason || ''
    });
    if (!roomOptions.length) await loadRoomOptions();
  };

  const openRoomMap = async () => {
    if (!roomOptions.length) await loadRoomOptions();
    setMapMsg('');
    setMapOpen(true);
    if (!mapFloorsLoadedRef.current) {
      try {
        const res = await floorAPI.getAll();
        const floors = res?.data?.data?.floors || [];
        setMapFloors(floors);
        setMapFloorId(floors[0]?.id || '');
        mapFloorsLoadedRef.current = true;
      } catch {
        /* floors stay empty — RoomAvailabilityMap shows graceful fallback */
      }
    }
  };

  const submitMeetingChange = async () => {
    if (!changeModal) return;

    setChangeSaving(true);
    setChangeError(null);
    try {
      const payload = {
        change_scope: changeForm.change_scope,
        change_date:  changeForm.change_scope === 'single_day' ? changeForm.change_date : null,
        start_date:   changeForm.change_scope === 'date_range' ? changeForm.start_date  : null,
        end_date:     changeForm.change_scope === 'date_range' ? changeForm.end_date    : null,
        day_of_week:  Number(changeForm.day_of_week),
        start_time:   changeForm.start_time,
        end_time:     changeForm.end_time,
        room_id:      changeForm.room_id || null,
        reason:       changeForm.reason || ''
      };

      if (editingChangeId) {
        await axiosInstance.patch(`/professor/meeting-changes/${editingChangeId}`, payload);
      } else {
        await axiosInstance.post(`/professor/sections/${changeModal.id}/meeting-change`, {
          ...payload,
          meeting_id: changeModal.meeting_id || null
        });
      }

      showToast('✅ Change saved and students notified');
      setChangeModal(null);
      setEditingChangeId(null);
      setChangeError(null);
      await loadSchedule();
      await loadDashboard();
    } catch (err) {
      if (err?.response?.status === 409) {
        setChangeError(err.response.data?.message || 'This room is already booked at the selected time.');
      } else {
        showToast(err?.response?.data?.message || 'Failed to change room/time', 'error');
      }
    } finally {
      setChangeSaving(false);
    }
  };

  const handleMaterialSectionChange = (sectionId) => {
    setMaterialSectionId(sectionId);
    resetMaterialForm();
    loadMaterials(sectionId);
  };

  const selectedMaterialSection = materialSections.find((s) => s.id === materialSectionId);

  const filteredMaterials = useMemo(() => {
    return materials.filter((m) => !materialSectionId || m.section_id === materialSectionId);
  }, [materials, materialSectionId]);


  const uploadMaterialFile = async (file) => {
    if (!file) return;

    setMaterialFileUploading(true);
    try {
      const form = new FormData();
      form.append('material', file);

      const res = await axiosInstance.post('/professor/materials/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const fileUrl = res.data?.data?.file_url;
      if (!fileUrl) throw new Error('Upload did not return a file URL.');

      setMaterialForm((p) => ({
        ...p,
        file_url: fileUrl
      }));

      showToast(`✅ File selected: ${file.name}`);
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to upload material file', 'error');
    } finally {
      setMaterialFileUploading(false);
      if (materialFileInputRef.current) {
        materialFileInputRef.current.value = '';
      }
    }
  };

  const openMaterial = async (material) => {
    if (!material?.id) return;

    try {
      const r = await axiosInstance.post(`/professor/materials/${material.id}/open`);
      const fileUrl = r.data?.data?.file_url || material.file_url;

      if (fileUrl) {
        window.open(toPublicFileUrl(fileUrl), '_blank', 'noopener,noreferrer');
      }

      setMaterials((prev) => prev.map((m) => (
        m.id === material.id
          ? { ...m, download_count: Number(m.download_count || 0) + 1 }
          : m
      )));
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to open material', 'error');
    }
  };

  const downloadBlob = async (url, filename) => {
    try {
      const r = await axiosInstance.get(url, { responseType: 'blob' });
      const blobUrl = window.URL.createObjectURL(new Blob([r.data]));
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to export file', 'error');
    }
  };

  const exportGrades = () => {
    if (!activeSection?.id) return;
    const sem = (activeSection.semester || 'semester').toLowerCase();
    const yr = (activeSection.academic_year || 'year').replace('/', '-');
    downloadBlob(`/professor/sections/${activeSection.id}/export/grades`, `grades_${activeSection.code || 'section'}_section_${activeSection.section_number || '1'}_${sem}_${yr}.xlsx`);
  };

  const openImportModal = () => {
    setImportModalOpen(true);
    setImportFile(null);
    setImportPreview(null);
  };

  const closeImportModal = () => {
    if (importLoading || importConfirming) return;
    setImportModalOpen(false);
    setImportFile(null);
    setImportPreview(null);
    setMissingExpanded(false);
  };

  const handleImportPreview = async () => {
    if (!importFile || !activeSection?.id) return;
    setImportLoading(true);
    try {
      const form = new FormData();
      form.append('grades_file', importFile);
      form.append('dry_run', 'true');
      const r = await axiosInstance.post(
        `/professor/sections/${activeSection.id}/import/grades`,
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      setImportPreview(r.data.data);
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to parse file', 'error');
    } finally {
      setImportLoading(false);
    }
  };

  const handleImportConfirm = async () => {
    if (!importFile || !activeSection?.id || !importPreview?.summary?.changed) return;
    setImportConfirming(true);
    try {
      const form = new FormData();
      form.append('grades_file', importFile);
      form.append('dry_run', 'false');
      await axiosInstance.post(
        `/professor/sections/${activeSection.id}/import/grades`,
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      showToast(`✅ ${importPreview.summary.changed} grade(s) imported successfully`);
      closeImportModal();
      const r2 = await axiosInstance.get(`/professor/sections/${activeSection.id}/students`);
      const fresh = r2.data.data.students || [];
      setStudents(fresh);
      const ge = {};
      fresh.forEach((s) => {
        ge[s.id] = { midterm: s.midterm ?? '', assignments: s.assignments ?? '', final: s.final ?? '' };
      });
      setGradeEdit(ge);
      setHasUnsavedGrades(false);
    } catch (err) {
      showToast(err?.response?.data?.message || 'Import failed', 'error');
    } finally {
      setImportConfirming(false);
    }
  };

  const exportAttendance = () => {
    if (!activeSection?.id) return;
    downloadBlob(`/professor/sections/${activeSection.id}/export/attendance`, `${activeSection.code || 'section'}-attendance.csv`);
  };

  const resetMaterialForm = () => {
    setEditingMaterialId(null);
    setMaterialForm({
      title: '',
      material_type: 'lecture_notes',
      week_number: '',
      file_url: '',
      description: '',
      is_published: true,
      notify_students: true
    });
  };

  const saveMaterial = async () => {
    if (!materialSectionId || !materialForm.title.trim()) {
      showToast('Select a section and write a material title', 'error');
      return;
    }

    setMaterialSaving(true);
    try {
      const payload = {
        section_id: materialSectionId,
        ...materialForm,
        week_number: materialForm.week_number ? Number(materialForm.week_number) : null
      };

      if (editingMaterialId) {
        await axiosInstance.patch(`/professor/materials/${editingMaterialId}`, payload);
        showToast('✅ Material updated');
      } else {
        await axiosInstance.post('/professor/materials', payload);
        showToast('✅ Material added');
      }

      resetMaterialForm();
      await loadMaterials(materialSectionId);
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to save material', 'error');
    } finally {
      setMaterialSaving(false);
    }
  };

  const editMaterial = (m) => {
    setEditingMaterialId(m.id);
    setMaterialSectionId(m.section_id);
    setMaterialForm({
      title: m.title || '',
      material_type: m.material_type || 'lecture_notes',
      week_number: m.week_number || '',
      file_url: m.file_url || '',
      description: m.description || '',
      is_published: m.is_published !== false,
      notify_students: false
    });
    setTimeout(() => materialFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const deleteMaterial = async (materialId) => {
    if (!window.confirm('Delete this material?')) return;
    try {
      await axiosInstance.delete(`/professor/materials/${materialId}`);
      showToast('Material deleted');
      await loadMaterials(materialSectionId);
    } catch {
      showToast('Failed to delete material', 'error');
    }
  };

  const resetOfficeForm = () => {
    setEditingOfficeId(null);
    setOfficeForm({
      day_of_week: String(new Date().getDay()),
      start_time: '10:00',
      end_time: '11:00',
      note: '',
      notify_students: false
    });
  };

  const saveOfficeHour = async () => {
    setOfficeSaving(true);
    try {
      await axiosInstance.post('/professor/office-hours', {
        id: editingOfficeId,
        day_of_week: Number(officeForm.day_of_week),
        start_time:  officeForm.start_time,
        end_time:    officeForm.end_time,
        note:        officeForm.note,
        notify_students: officeForm.notify_students
      });
      showToast(editingOfficeId ? '✅ Office hour updated' : '✅ Office hour added');
      resetOfficeForm();
      await loadOfficeHoursPage();
      await loadSchedule();
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to save office hour', 'error');
    } finally {
      setOfficeSaving(false);
    }
  };

  const editOfficeHour = (row) => {
    setEditingOfficeId(row.id);
    setOfficeForm({
      day_of_week:     String(row.day_of_week ?? 0),
      start_time:      formatTime24(row.start_time),
      end_time:        formatTime24(row.end_time),
      note:            row.note || '',
      notify_students: false
    });
  };

  const deleteOfficeHour = async (id) => {
    if (!window.confirm('Delete this office hour?')) return;
    try {
      await axiosInstance.delete(`/professor/office-hours/${id}`);
      showToast('Office hour deleted');
      await loadOfficeHoursPage();
      await loadSchedule();
    } catch {
      showToast('Failed to delete office hour', 'error');
    }
  };

  const respondBooking = async (bookingId, status) => {
    setBookingSavingId(bookingId);
    try {
      await axiosInstance.patch(`/professor/office-hour-bookings/${bookingId}`, { status });
      showToast(status === 'accepted' ? '✅ Booking accepted' : 'Booking declined');
      await loadOfficeHoursPage();
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to update booking', 'error');
    } finally {
      setBookingSavingId(null);
    }
  };

  const saveCourseMessage = async () => {
    if (!messageSectionId || !messageForm.title.trim() || !messageForm.body.trim()) {
      showToast('Select a section and write the message title/body', 'error');
      return;
    }

    setMessageSaving(true);
    try {
      await axiosInstance.post('/professor/messages', {
        section_id: messageSectionId,
        ...messageForm
      });
      showToast('✅ Course message posted');
      setMessageForm({ title: '', body: '', is_pinned: false, notify_students: true });
      await loadMessages();
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to post message', 'error');
    } finally {
      setMessageSaving(false);
    }
  };

  const deleteCourseMessage = async (messageId) => {
    if (!window.confirm('Delete this course message?')) return;

    try {
      await axiosInstance.delete(`/professor/messages/${messageId}`);
      showToast('Course message deleted');
      await loadMessages();
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to delete message', 'error');
    }
  };

  const cancelChange = async (id) => {
    if (!window.confirm('Cancel this schedule change and notify students?')) return;
    try {
      await axiosInstance.delete(`/professor/meeting-changes/${id}`);
      showToast('Change canceled and students notified');
      await loadChangeHistory();
      await loadSchedule();
      await loadDashboard();
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to cancel change', 'error');
    }
  };

  const markAttendance = async () => {
    if (!activeSection) return;
    setSaving(true);

    try {
      const records = Object.entries(attRecs).map(([sid, status]) => ({
        student_id: sid,
        status
      }));

      await axiosInstance.post('/professor/attendance', {
        section_id: activeSection.id,
        lecture_date: attDate,
        records
      });

      showToast(`✅ Attendance saved for ${records.length} students`);

      const r = await axiosInstance.get(`/professor/sections/${activeSection.id}/attendance/summary`);
      setAttSummary(r.data.data.summary || []);
    } catch {
      showToast('Failed to save attendance', 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveAllGrades = async () => {
    if (!activeSection) return;
    setSavingGrades(true);

    try {
      const grades = Object.entries(gradeEdit).map(([sid, g]) => ({
        student_id: sid,
        midterm: g.midterm ? parseFloat(g.midterm) : 0,
        assignments: g.assignments ? parseFloat(g.assignments) : 0,
        final: g.final ? parseFloat(g.final) : 0,
        practical: 0
      }));

      await axiosInstance.post('/professor/grades/bulk', {
        section_id: activeSection.id,
        grades
      });

      showToast('✅ All grades saved');
      const r = await axiosInstance.get(`/professor/sections/${activeSection.id}/students`);
      const freshStudents = r.data.data.students || [];
      setStudents(freshStudents);
      const ge = {};
      freshStudents.forEach((s) => {
        ge[s.id] = {
          midterm: s.midterm || '',
          assignments: s.assignments || '',
          final: s.final || ''
        };
      });
      setGradeEdit(ge);
      setHasUnsavedGrades(false);
    } catch {
      showToast('Failed to save grades', 'error');
    } finally {
      setSavingGrades(false);
    }
  };

  const sendWarning = async (student) => {
    if (!activeSection) return;

    try {
      await axiosInstance.post('/professor/warning', {
        student_id: student.id,
        section_id: activeSection.id
      });
      showToast(`⚠️ Warning sent to ${student.first_name}`);
    } catch {
      showToast('Failed to send warning', 'error');
    }
  };

  const groupedSchedule = useMemo(() => {
    const map = new Map();

    scheduleRows.forEach((row) => {
      const key = row.id;
      if (!map.has(key)) {
        map.set(key, {
          ...row,
          meetings: []
        });
      }
      map.get(key).meetings.push(row);
    });

    return Array.from(map.values());
  }, [scheduleRows]);

  const stats = data?.stats || {};
  const todayName = DAYS[new Date().getDay()];
  const todayItems = data?.today_schedule || [];
  const atRiskCount = data?.at_risk?.length || 0;
  const now24 = new Date().toTimeString().slice(0, 5);
  const nextClass = todayItems.find((s) => String(s.end_time || '').slice(0, 5) > now24) || todayItems[0] || null;

  const currentLecture = todayItems.find(s =>
    String(s.start_time || '').slice(0, 5) <= now24 && String(s.end_time || '').slice(0, 5) > now24
  ) || null;
  const firstUpcoming = todayItems.find(s => String(s.start_time || '').slice(0, 5) > now24) || null;
  const featuredLecture = currentLecture || firstUpcoming || todayItems[0] || null;
  const sectionHasChange = (sectionId) =>
    Array.isArray(activeChanges) &&
    activeChanges.some(c => String(c?.section_id) === String(sectionId));

  if (termLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
        <div className="spinner" />
      </div>
    );
  }

  if (loading && hasTerm) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
        <div className="spinner" />
      </div>
    );
  }

  // Professor has no sections in any semester
  if (!hasTerm) {
    return (
      <div className="prof-dash">
        <div className="prof-header">
          <div className="prof-header__left">
            <div className="prof-header__badge">👨‍🏫 Professor Portal</div>
            <h1 className="prof-header__title">
              {user?.academic_title || 'Dr.'} {user?.last_name}
            </h1>
            <p className="prof-header__sub">
              {user?.department || 'Faculty of Engineering'} — An-Najah National University
            </p>
          </div>
        </div>
        <div className="empty-state" style={{ marginTop: 48 }}>
          <div className="empty-state__icon">📋</div>
          <p className="empty-state__title">No assigned sections yet.</p>
          <p>You will see your dashboard once sections are assigned to you for the current semester.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="prof-dash">
      {toast && (
        <div className={`prof-toast prof-toast--${toast.type}`}>{toast.msg}</div>
      )}


      {importModalOpen && createPortal(
        <div className="prof-modal-backdrop" onClick={closeImportModal}>
          <div className="prof-import-modal" onClick={(e) => e.stopPropagation()}>

            {/* Header */}
            <div className="prof-change-modal__head">
              <div>
                <h3>⬆ Import Grades</h3>
                <p>{activeSection?.code} — Section {activeSection?.section_number}</p>
              </div>
              <button onClick={closeImportModal} disabled={importLoading || importConfirming}>×</button>
            </div>

            {/* Scrollable body — no action buttons here */}
            <div className="prof-import-modal__body">
              {!importPreview ? (
                /* ── Upload step ── */
                <div className="prof-import-upload">
                  <p className="prof-import-hint">
                    Use the exported grade sheet format. Only <strong>Student ID</strong>, <strong>Midterm</strong>, <strong>Assignments</strong>, and <strong>Final</strong> columns are read. Empty grade cells are treated as 0.
                  </p>
                  <label className="prof-import-file-label">
                    <input
                      type="file"
                      accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      onChange={(e) => { setImportFile(e.target.files[0] || null); setImportPreview(null); }}
                    />
                    <span className="prof-import-file-btn">
                      {importFile ? `📄 ${importFile.name}` : '📂 Choose .xlsx file'}
                    </span>
                  </label>
                </div>
              ) : (
                /* ── Preview step ── */
                <div className="prof-import-preview">
                  {/* Summary cards */}
                  <div className="prof-import-summary">
                    {[
                      { label: 'Rows Found',    value: importPreview.summary.total_rows,              color: 'blue' },
                      { label: 'Changed',       value: importPreview.summary.changed,                 color: 'green' },
                      { label: 'Unchanged',     value: importPreview.summary.unchanged,               color: 'gray' },
                      { label: 'Invalid',       value: importPreview.summary.invalid,                 color: 'red' },
                      { label: 'Not Enrolled',  value: importPreview.summary.not_enrolled,            color: 'orange' },
                      { label: 'Missing',       value: importPreview.summary.missing_from_file_count, color: 'amber' }
                    ].map(({ label, value, color }) => (
                      <div key={label} className={`prof-import-card prof-import-card--${color}`}>
                        <span className="prof-import-card__val">{value}</span>
                        <span className="prof-import-card__lbl">{label}</span>
                      </div>
                    ))}
                  </div>

                  {/* Missing enrolled students warning */}
                  {importPreview.missing_from_file?.length > 0 && (
                    <div className="prof-import-warning">
                      <div className="prof-import-warning__head" onClick={() => setMissingExpanded((v) => !v)}>
                        <span>
                          ⚠ {importPreview.missing_from_file.length} enrolled student{importPreview.missing_from_file.length !== 1 ? 's are' : ' is'} not included in this file. {importPreview.missing_from_file.length !== 1 ? 'Their' : 'Their'} grades will remain unchanged.
                        </span>
                        <span className="prof-import-warning__toggle">{missingExpanded ? '▲ Hide' : '▼ Show'}</span>
                      </div>
                      {missingExpanded && (
                        <ul className="prof-import-missing-list">
                          {importPreview.missing_from_file.map((s) => (
                            <li key={s.student_id}>
                              <span className="prof-import-missing-id">{s.student_id}</span>
                              <span className="prof-import-missing-name">{s.student_name}</span>
                              <span className="prof-import-missing-email">{s.email}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {/* Preview table — horizontal scroll inside scrollable body */}
                  <div className="prof-import-table-wrap">
                    <table className="table prof-import-table">
                      <thead>
                        <tr>
                          <th>Student</th>
                          <th style={{ textAlign: 'center' }}>Status</th>
                          <th style={{ textAlign: 'center' }}>Cur. Mid</th>
                          <th style={{ textAlign: 'center' }}>New Mid</th>
                          <th style={{ textAlign: 'center' }}>Cur. Ass.</th>
                          <th style={{ textAlign: 'center' }}>New Ass.</th>
                          <th style={{ textAlign: 'center' }}>Cur. Final</th>
                          <th style={{ textAlign: 'center' }}>New Final</th>
                          <th style={{ textAlign: 'center' }}>Cur. Total</th>
                          <th style={{ textAlign: 'center' }}>New Total</th>
                          <th style={{ textAlign: 'center' }}>New Grade</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.rows.map((row, i) => (
                          <tr key={i} className={`prof-import-row--${row.status}`}>
                            <td>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{row.student_name || row.student_id}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{row.student_id}</div>
                              {row.errors.length > 0 && (
                                <div className="prof-import-errors">
                                  {row.errors.map((e, ei) => <span key={ei}>{e}</span>)}
                                </div>
                              )}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <span className={`prof-import-status prof-import-status--${row.status}`}>
                                {row.status === 'changed' ? '✏️ Changed' :
                                 row.status === 'unchanged' ? '— Same' :
                                 row.status === 'invalid' ? '⚠ Invalid' :
                                 '✕ Not Enrolled'}
                              </span>
                            </td>
                            <td style={{ textAlign: 'center' }}>{row.current?.midterm ?? '—'}</td>
                            <td style={{ textAlign: 'center' }} className={row.status === 'changed' && row.imported?.midterm !== row.current?.midterm ? 'prof-import-cell--changed' : ''}>{row.imported?.midterm ?? '—'}</td>
                            <td style={{ textAlign: 'center' }}>{row.current?.assignments ?? '—'}</td>
                            <td style={{ textAlign: 'center' }} className={row.status === 'changed' && row.imported?.assignments !== row.current?.assignments ? 'prof-import-cell--changed' : ''}>{row.imported?.assignments ?? '—'}</td>
                            <td style={{ textAlign: 'center' }}>{row.current?.final ?? '—'}</td>
                            <td style={{ textAlign: 'center' }} className={row.status === 'changed' && row.imported?.final !== row.current?.final ? 'prof-import-cell--changed' : ''}>{row.imported?.final ?? '—'}</td>
                            <td style={{ textAlign: 'center', fontWeight: 600 }}>{row.current?.total ?? '—'}</td>
                            <td style={{ textAlign: 'center', fontWeight: 600 }} className={row.status === 'changed' ? 'prof-import-cell--changed' : ''}>{row.imported?.total ?? '—'}</td>
                            <td style={{ textAlign: 'center', fontWeight: 600 }}>{row.imported?.letter_grade ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Sticky footer — always visible, never scrolls away */}
            <div className="prof-import-modal__footer">
              {!importPreview ? (
                <>
                  <button className="btn btn--secondary" onClick={closeImportModal} disabled={importLoading}>
                    Cancel
                  </button>
                  <button
                    className="btn btn--primary"
                    onClick={handleImportPreview}
                    disabled={!importFile || importLoading}
                  >
                    {importLoading ? 'Parsing...' : 'Preview Changes'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="btn btn--secondary"
                    onClick={() => { setImportPreview(null); setImportFile(null); setMissingExpanded(false); }}
                    disabled={importConfirming}
                  >
                    ← Choose different file
                  </button>
                  <button
                    className="btn btn--primary"
                    onClick={handleImportConfirm}
                    disabled={importPreview.summary.changed === 0 || importConfirming}
                  >
                    {importConfirming
                      ? 'Importing...'
                      : importPreview.summary.changed === 0
                        ? 'No changes to import'
                        : `Confirm Import (${importPreview.summary.changed} student${importPreview.summary.changed !== 1 ? 's' : ''})`}
                  </button>
                </>
              )}
            </div>

          </div>
        </div>,
        document.body
      )}

      {changeModal && createPortal(
        <div className="prof-modal-backdrop" onClick={() => { if (!changeSaving) { setChangeModal(null); setEditingChangeId(null); setChangeError(null); setMapOpen(false); setAvailMap(null); setAvailLoading(false); setRconflictMsg(''); } }}>
          <div className="prof-change-modal" onClick={(e) => e.stopPropagation()}>
            <div className="prof-change-modal__head">
              <div>
                <h3>{editingChangeId ? 'Edit schedule change' : 'Change room / time'}</h3>
                <p>{changeModal.code} — {changeModal.course_name}</p>
              </div>
              <button onClick={() => { setChangeModal(null); setEditingChangeId(null); setChangeError(null); setMapOpen(false); setAvailMap(null); setAvailLoading(false); setRconflictMsg(''); }} disabled={changeSaving}>×</button>
            </div>

            <div className="prof-change-form">
              <label className="prof-change-form__wide">
                <span>Change applies to</span>
                <select
                  value={changeForm.change_scope}
                  onChange={(e) => setChangeForm((p) => ({ ...p, change_scope: e.target.value }))}
                >
                  <option value="single_day">This lecture only</option>
                  <option value="date_range">Specific date range</option>
                  <option value="permanent">All future lectures</option>
                </select>
              </label>

              {changeForm.change_scope === 'single_day' && (
                <label className="prof-change-form__wide">
                  <span>Lecture date</span>
                  <input
                    type="date"
                    value={changeForm.change_date}
                    onChange={(e) => setChangeForm((p) => ({ ...p, change_date: e.target.value }))}
                  />
                </label>
              )}

              {changeForm.change_scope === 'date_range' && (
                <div className="prof-change-form__range prof-change-form__wide">
                  <label>
                    <span>From date</span>
                    <input
                      type="date"
                      value={changeForm.start_date}
                      onChange={(e) => setChangeForm((p) => ({ ...p, start_date: e.target.value }))}
                    />
                  </label>
                  <label>
                    <span>To date</span>
                    <input
                      type="date"
                      value={changeForm.end_date}
                      onChange={(e) => setChangeForm((p) => ({ ...p, end_date: e.target.value }))}
                    />
                  </label>
                </div>
              )}

              {changeForm.change_scope === 'permanent' && (
                <div className="prof-change-warning prof-change-form__wide">
                  This will update the normal weekly schedule for all future lectures.
                </div>
              )}

              <label>
                <span>Day</span>
                <select
                  value={changeForm.day_of_week}
                  onChange={(e) => setChangeForm((p) => ({ ...p, day_of_week: e.target.value }))}
                >
                  {DAYS_AR.map((d, idx) => (
                    <option key={d} value={idx}>{d}</option>
                  ))}
                </select>
              </label>

              <label>
                <span>Start time</span>
                <input
                  type="time"
                  value={changeForm.start_time}
                  onChange={(e) => setChangeForm((p) => ({ ...p, start_time: e.target.value }))}
                />
              </label>

              <label>
                <span>End time</span>
                <input
                  type="time"
                  value={changeForm.end_time}
                  onChange={(e) => setChangeForm((p) => ({ ...p, end_time: e.target.value }))}
                />
              </label>

              <div className="prof-change-form__wide prof-room-field">
                <span>
                  Room
                  {availLoading && <span className="prof-avail-loading-badge">Checking…</span>}
                </span>
                <div className="prof-room-input-row">
                  <div className="prof-room-picker" ref={roomDropRef}>
                    {roomDropOpen ? (
                      <input
                        className="prof-room-picker__input"
                        type="text"
                        autoFocus
                        autoComplete="off"
                        placeholder="Search by room number, name, type…"
                        value={roomSearch}
                        onChange={e => { setRoomSearch(e.target.value); setRconflictMsg(''); }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="prof-room-picker__display"
                        onClick={() => { setRoomDropOpen(true); setRoomSearch(''); setRconflictMsg(''); }}
                      >
                        <span className="prof-room-picker__display-text">
                          {selectedRoomObj
                            ? `${selectedRoomObj.room_number}${selectedRoomObj.name ? ` — ${selectedRoomObj.name}` : ''}${selectedRoomObj.floor_label ? ` · Floor ${selectedRoomObj.floor_label}` : ''}`
                            : 'Online / no room'}
                        </span>
                        <span className="prof-room-picker__chevron">▾</span>
                      </button>
                    )}
                    {changeForm.room_id && (
                      <button
                        type="button"
                        className="prof-room-picker__clear"
                        onClick={() => { setChangeForm(p => ({ ...p, room_id: '' })); setRconflictMsg(''); }}
                        title="Clear room"
                      >×</button>
                    )}
                    {roomDropOpen && (
                      <div className="prof-room-picker__dropdown">
                        {/* Header row: availability hint or loading */}
                        {availLoading && (
                          <div className="prof-room-picker__avail-status">Checking availability…</div>
                        )}
                        {!availLoading && !availMap && (
                          <div className="prof-room-picker__avail-status">Set date &amp; time to check availability</div>
                        )}
                        {/* "Online / no room" option */}
                        <button
                          type="button"
                          className="prof-room-picker__option"
                          onMouseDown={e => { e.preventDefault(); setChangeForm(p => ({ ...p, room_id: '' })); setRoomDropOpen(false); setRoomSearch(''); setRconflictMsg(''); }}
                        >
                          <span className="prof-room-picker__opt-tag">—</span>
                          <span className="prof-room-picker__opt-body">
                            <span className="prof-room-picker__opt-text">Online / no room</span>
                          </span>
                        </button>
                        {filteredRoomOptions.map(room => {
                          const isSelected = String(changeForm.room_id) === String(room.id);
                          const isBusy     = room.avStatus === 'busy';
                          return (
                            <button
                              key={room.id}
                              type="button"
                              className={[
                                'prof-room-picker__option',
                                isSelected ? 'prof-room-picker__option--active' : '',
                                isBusy     ? 'prof-room-picker__option--busy'   : '',
                              ].filter(Boolean).join(' ')}
                              onMouseDown={e => {
                                e.preventDefault();
                                if (isBusy) {
                                  const c = room.avConflict;
                                  setRconflictMsg(c
                                    ? c.type === 'event_booking'
                                      ? `Reserved for event "${c.title}" — ${c.start_time}–${c.end_time}`
                                      : `Conflict: ${c.course_code} — ${c.start_time}–${c.end_time}`
                                    : 'This room has a conflict at the selected time.');
                                  return;
                                }
                                setChangeForm(p => ({ ...p, room_id: room.id }));
                                setRoomDropOpen(false);
                                setRoomSearch('');
                                setRconflictMsg('');
                              }}
                            >
                              <span className="prof-room-picker__opt-tag">{room.room_number}</span>
                              <span className="prof-room-picker__opt-body">
                                {room.name && <span className="prof-room-picker__opt-text">{room.name}</span>}
                                {isBusy && room.avConflict && (
                                  <span className="prof-room-picker__opt-conflict">
                                    {room.avConflict.type === 'event_booking'
                                      ? `Event: ${room.avConflict.title} ${room.avConflict.start_time}–${room.avConflict.end_time}`
                                      : `Conflict: ${room.avConflict.course_code} ${room.avConflict.start_time}–${room.avConflict.end_time}`}
                                  </span>
                                )}
                                <span className="prof-room-picker__opt-meta">
                                  {room.type ? room.type.replace(/_/g, ' ') : ''}
                                  {room.capacity ? ` · ${room.capacity} seats` : ''}
                                  {room.floor_label ? ` · Floor ${room.floor_label}` : ''}
                                </span>
                              </span>
                              <span className={`prof-room-avail-dot prof-room-avail-dot--${isBusy ? 'busy' : isSelected ? 'selected' : room.avStatus === 'unknown' ? 'unknown' : 'available'}`} />
                            </button>
                          );
                        })}
                        {filteredRoomOptions.length === 0 && roomSearch && (
                          <div className="prof-room-picker__empty">No rooms match "{roomSearch}"</div>
                        )}
                      </div>
                    )}
                  </div>
                  <button type="button" className="prof-map-btn" onClick={openRoomMap}>
                    🗺 Map
                  </button>
                </div>
                {rconflictMsg && (
                  <div className="prof-room-conflict-msg">{rconflictMsg}</div>
                )}
                {!rconflictMsg && selectedRoomBusy && (
                  <div className="prof-room-conflict-msg">
                    ⚠ Selected room is now occupied:{' '}
                    {selectedRoomBusy.type === 'event_booking'
                      ? `Event "${selectedRoomBusy.title}" ${selectedRoomBusy.start_time}–${selectedRoomBusy.end_time}`
                      : `${selectedRoomBusy.course_code} ${selectedRoomBusy.start_time}–${selectedRoomBusy.end_time}`
                    }. Please choose a different room.
                  </div>
                )}
              </div>

              <label className="prof-change-form__wide">
                <span>Reason / note for students</span>
                <textarea
                  rows="3"
                  value={changeForm.reason}
                  onChange={(e) => setChangeForm((p) => ({ ...p, reason: e.target.value }))}
                  placeholder="Example: room maintenance, online lecture, exam review..."
                />
              </label>
            </div>

            {changeError && (
              <div className="prof-change-conflict-error">
                <span>&#9888;</span> {changeError}
              </div>
            )}

            <div className="prof-change-modal__foot">
              <button className="btn btn--secondary" onClick={() => { setChangeModal(null); setEditingChangeId(null); setChangeError(null); setMapOpen(false); setAvailMap(null); setAvailLoading(false); setRconflictMsg(''); }} disabled={changeSaving}>Cancel</button>
              <button className="btn btn--primary" onClick={submitMeetingChange} disabled={changeSaving}>
                {changeSaving ? 'Saving...' : 'Save change & notify students'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {mapOpen && createPortal(
        <div className="prof-map-overlay" onClick={() => setMapOpen(false)}>
          <div className="prof-map-modal" onClick={e => e.stopPropagation()}>

            {/* ── Header ─────────────────────────────────────────── */}
            <div className="prof-map-modal__head">
              <h3>Choose Room from Map</h3>
              <button className="prof-map-modal__close" onClick={() => setMapOpen(false)}>×</button>
            </div>

            {/* ── Date / time controls ────────────────────────────
                All inputs write directly to changeForm — no duplicate
                state; values are already in the main modal on close. */}
            <div className="prof-map-controls">
              {changeForm.change_scope === 'single_day' && (
                <label className="prof-map-ctrl">
                  <span>Date</span>
                  <input
                    type="date"
                    value={changeForm.change_date}
                    onChange={e => {
                      const v = e.target.value;
                      if (v) {
                        const [y, m, d] = v.split('-').map(Number);
                        const dow = new Date(y, m - 1, d).getDay();
                        setChangeForm(p => ({ ...p, change_date: v, day_of_week: String(dow) }));
                      } else {
                        setChangeForm(p => ({ ...p, change_date: v }));
                      }
                    }}
                  />
                </label>
              )}
              {changeForm.change_scope === 'date_range' && (
                <>
                  <label className="prof-map-ctrl">
                    <span>From</span>
                    <input type="date" value={changeForm.start_date}
                      onChange={e => setChangeForm(p => ({ ...p, start_date: e.target.value }))} />
                  </label>
                  <label className="prof-map-ctrl">
                    <span>To</span>
                    <input type="date" value={changeForm.end_date}
                      onChange={e => setChangeForm(p => ({ ...p, end_date: e.target.value }))} />
                  </label>
                </>
              )}
              {/* Day selector — hidden for single_day (derived from date) */}
              {changeForm.change_scope !== 'single_day' && (
                <label className="prof-map-ctrl">
                  <span>Day</span>
                  <select value={changeForm.day_of_week}
                    onChange={e => setChangeForm(p => ({ ...p, day_of_week: e.target.value }))}>
                    {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </label>
              )}
              <label className="prof-map-ctrl">
                <span>Start</span>
                <input type="time" value={changeForm.start_time}
                  onChange={e => setChangeForm(p => ({ ...p, start_time: e.target.value }))} />
              </label>
              <label className="prof-map-ctrl">
                <span>End</span>
                <input type="time" value={changeForm.end_time}
                  onChange={e => setChangeForm(p => ({ ...p, end_time: e.target.value }))} />
              </label>
              {availLoading && <span className="prof-map-avail-badge prof-map-avail-badge--loading">Checking…</span>}
              {!availLoading && availMap === null && changeForm.start_time && changeForm.end_time && (
                <span className="prof-map-avail-badge prof-map-avail-badge--hint">Set all fields</span>
              )}
            </div>

            {/* ── Floor tabs ──────────────────────────────────────── */}
            <div className="prof-map-modal__tabs">
              {mapFloors.map(f => (
                <button
                  key={f.id}
                  type="button"
                  className={`prof-map-tab${mapFloorId === f.id ? ' prof-map-tab--active' : ''}`}
                  onClick={() => { setMapFloorId(f.id); setMapMsg(''); }}
                >
                  {f.floor_label || f.floor_number}
                </button>
              ))}
              {mapFloors.length === 0 && (
                <span className="prof-map-loading">Loading floors…</span>
              )}
            </div>

            {/* ── Map canvas ──────────────────────────────────────── */}
            <div className="prof-map-modal__body">
              <RoomAvailabilityMap
                floorKey={mapFloorKey}
                availabilityByRoomNumber={mapAvailability}
                selectedRoomId={changeForm.room_id}
                onRoomClick={(block, avail) => {
                  if (!avail || !avail.room_id) {
                    setMapMsg(
                      availMap
                        ? 'This room is not available for scheduling.'
                        : 'Set date and time to check room availability.'
                    );
                    return;
                  }
                  const status = avail.status;
                  if (status === 'lecture_conflict' || status === 'event_conflict') {
                    const c = avail.conflict;
                    setMapMsg(c
                      ? c.type === 'event_booking'
                        ? `Reserved for event "${c.title}" — ${c.start_time}–${c.end_time}`
                        : `Conflict: ${c.course_code} — ${c.start_time}–${c.end_time}`
                      : 'This room has a conflict at the selected time.');
                    return;
                  }
                  setChangeForm(p => ({ ...p, room_id: avail.room_id }));
                  setMapMsg(`Room ${block.roomNumber || ''} selected.`);
                  setRconflictMsg('');
                  setTimeout(() => setMapOpen(false), 350);
                }}
                clickableStatuses={['available', 'selected', 'lecture_conflict', 'event_conflict']}
              />
            </div>

            {/* ── Feedback message ────────────────────────────────── */}
            {mapMsg && <div className="prof-map-msg">{mapMsg}</div>}

            {/* ── Footer: legend + close ──────────────────────────── */}
            <div className="prof-map-modal__foot">
              <div className="prof-map-legend">
                <span className="prof-map-legend__dot prof-map-legend__dot--available" /> Available
                <span className="prof-map-legend__dot prof-map-legend__dot--selected"  /> Selected
                <span className="prof-map-legend__dot prof-map-legend__dot--conflict"  /> Conflict
                <span className="prof-map-legend__dot prof-map-legend__dot--event"     /> Event
                <span className="prof-map-legend__dot prof-map-legend__dot--default"   /> Not schedulable
              </div>
              <button className="btn btn--secondary" onClick={() => setMapOpen(false)}>Close</button>
            </div>

          </div>
        </div>,
        document.body
      )}

      <div className="prof-header">
        <div className="prof-header__left">
          <div className="prof-header__badge">👨‍🏫 Professor Portal</div>
          <h1 className="prof-header__title">
            {data?.instructor_title || user?.academic_title || 'Dr.'} {user?.last_name}
          </h1>
          <p className="prof-header__sub">
            {user?.department || 'Faculty of Engineering'} — An-Najah National University
          </p>
        </div>
        <div className="prof-header__stats">
          <StatCard icon="📚" label="Courses" value={stats.total_courses || 0} color="blue" />
          <StatCard icon="📋" label="Sections" value={stats.total_sections || 0} color="green" />
          <StatCard icon="👥" label="Students" value={stats.total_students || 0} color="gold" />
        </div>
      </div>

      {mode !== 'schedule' && terms.length > 0 && (
        <div className="prof-term-bar">
          <span className="prof-term-bar__label">Semester</span>
          <select
            className="prof-select"
            value={`${semester}||${academicYear}`}
            onChange={e => {
              const [s, y] = e.target.value.split('||');
              setTerm(s, y);
            }}
          >
            {terms.map(t => (
              <option key={`${t.semester}||${t.academic_year}`} value={`${t.semester}||${t.academic_year}`}>
                {SEMESTERS.find(s => s.value === t.semester)?.label || t.semester} — {t.academic_year}
              </option>
            ))}
          </select>
        </div>
      )}

      {mode === 'overview' && (
        <div className="prof-overview-special">
          <section className="prof-insight-grid">
            <div className="prof-insight-card prof-insight-card--primary">
              <span>Today</span>
              <strong>{todayItems.length}</strong>
              <small>{todayItems.length === 1 ? 'class today' : 'classes today'}</small>
            </div>

            <div className="prof-insight-card">
              <span>Active sections</span>
              <strong>{stats.total_sections || 0}</strong>
              <small>available from Students & Grades</small>
            </div>

            <div className="prof-insight-card">
              <span>Students</span>
              <strong>{stats.total_students || 0}</strong>
              <small>registered in your sections</small>
            </div>

            <div className={`prof-insight-card ${atRiskCount > 0 ? 'prof-insight-card--danger' : ''}`}>
              <span>Attendance alerts</span>
              <strong>{atRiskCount}</strong>
              <small>{atRiskCount > 0 ? 'students below 75%' : 'no urgent warnings'}</small>
            </div>
          </section>

          {/* ── Today's Schedule + Featured Lecture ── */}
          <section className="prof-overview-grid">
            {/* Today's Teaching Schedule */}
            <div className="card">
              <div className="prof-card-hdr">
                <h3>📅 Today's Schedule</h3>
                <button className="btn btn--sm btn--ghost prof-card-link" onClick={() => navigate('/professor/schedule')}>
                  Full schedule →
                </button>
              </div>
              {todayItems.length === 0 ? (
                <div className="empty-state empty-state--compact">
                  <div className="empty-state__icon">☀️</div>
                  <p className="empty-state__title">No classes today</p>
                </div>
              ) : (
                <div className="prof-today-list">
                  {todayItems.map(s => {
                    const start5 = String(s.start_time || '').slice(0, 5);
                    const end5   = String(s.end_time   || '').slice(0, 5);
                    const isNow  = start5 <= now24 && end5 > now24;
                    const isPast = end5 <= now24;
                    const isNext = !isNow && !isPast && s === firstUpcoming;
                    const changed = sectionHasChange(s.id);
                    return (
                      <div key={s.id}
                        className={`prof-today-item${isNow ? ' prof-today-item--now' : isPast ? ' prof-today-item--past' : ''}`}
                        onClick={() => {
                          const sec = (data?.sections || []).find(x => String(x.id) === String(s.id));
                          if (sec) loadSection(sec, 'students');
                        }}
                        style={{ cursor: 'pointer' }}>
                        <div className="prof-today-time">
                          <span>{formatTime(s.start_time)}</span>
                          <small>{formatTime(s.end_time)}</small>
                        </div>
                        <div className="prof-today-info">
                          <div className="prof-today-code">{s.code}</div>
                          <div className="prof-today-name">{s.course_name}</div>
                          <div className="prof-today-meta">
                            {isOnlineRoom(s.room_number) ? 'Online' : `Room ${s.room_number}`} · §{s.section_number} · {s.enrolled || 0} students
                          </div>
                        </div>
                        <div className="prof-today-badges">
                          {isNow  && <span className="prof-ov-badge prof-ov-badge--now">NOW</span>}
                          {isNext && <span className="prof-ov-badge prof-ov-badge--next">NEXT</span>}
                          {isPast && <span className="prof-ov-badge prof-ov-badge--done">DONE</span>}
                          {changed && <span className="prof-ov-badge prof-ov-badge--changed">CHANGED</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Current / Next Lecture */}
            <div className="card">
              <div className="prof-card-hdr">
                <h3>{currentLecture ? '🟢 Now Teaching' : '⏭ Next Lecture'}</h3>
              </div>
              {featuredLecture ? (
                <div className="prof-featured-lecture">
                  <div className="prof-featured-badges">
                    {currentLecture
                      ? <span className="prof-ov-badge prof-ov-badge--now">IN PROGRESS</span>
                      : <span className="prof-ov-badge prof-ov-badge--next">{getCountdownProf(featuredLecture.start_time)}</span>
                    }
                    {sectionHasChange(featuredLecture.id) && (
                      <span className="prof-ov-badge prof-ov-badge--changed">ROOM CHANGED</span>
                    )}
                  </div>
                  <div className="prof-featured-course">
                    <div className="prof-featured-code">{featuredLecture.code}</div>
                    <div className="prof-featured-name">{featuredLecture.course_name}</div>
                    <div className="prof-featured-meta">
                      §{featuredLecture.section_number} · {featuredLecture.enrolled || 0} students
                    </div>
                    <div className="prof-featured-time">
                      {formatTime(featuredLecture.start_time)} – {formatTime(featuredLecture.end_time)}
                    </div>
                    <div className="prof-featured-meta">
                      {isOnlineRoom(featuredLecture.room_number) ? '🌐 Online' : `📍 Room ${featuredLecture.room_number}`}
                    </div>
                  </div>
                  <div className="prof-featured-actions">
                    <button className="btn btn--sm btn--primary"
                      onClick={() => {
                        const sec = (data?.sections || []).find(x => String(x.id) === String(featuredLecture.id));
                        if (sec) loadSection(sec, 'attendance');
                      }}>
                      ✅ Take Attendance
                    </button>
                    <button className="btn btn--sm btn--secondary"
                      onClick={() => {
                        const sec = (data?.sections || []).find(x => String(x.id) === String(featuredLecture.id));
                        if (sec) loadSection(sec, 'students');
                      }}>
                      👥 View Students
                    </button>
                  </div>
                </div>
              ) : (
                <div className="empty-state empty-state--compact">
                  <div className="empty-state__icon">🎉</div>
                  <p className="empty-state__title">No more classes today</p>
                </div>
              )}
            </div>
          </section>

          {/* ── Sections Overview + Notifications ── */}
          <section className="prof-overview-grid">
            {/* Sections Overview */}
            <div className="card">
              <div className="prof-card-hdr">
                <h3>📚 My Sections</h3>
                <button className="btn btn--sm btn--ghost prof-card-link" onClick={() => navigate('/professor/students')}>
                  View grades →
                </button>
              </div>
              {(data?.sections || []).length === 0 ? (
                <div className="empty-state empty-state--compact">
                  <div className="empty-state__icon">📖</div>
                  <p className="empty-state__title">No sections this term</p>
                </div>
              ) : (
                <div className="prof-sections-ov-list">
                  {(data?.sections || []).map(sec => (
                    <div key={sec.id} className="prof-sections-ov-row"
                      onClick={() => loadSection(sec, 'students')}
                      style={{ cursor: 'pointer' }}>
                      <div className="prof-sections-ov-code">
                        <span>{sec.code}</span>
                        {sectionHasChange(sec.id) && (
                          <span className="prof-ov-badge prof-ov-badge--changed" style={{ fontSize: 9 }}>CHANGED</span>
                        )}
                      </div>
                      <div className="prof-sections-ov-info">
                        <div className="prof-sections-ov-name">{sec.course_name}</div>
                        <div className="prof-sections-ov-meta">
                          §{sec.section_number} · {sec.day_of_week?.join(', ')} · {formatTime(sec.start_time)}–{formatTime(sec.end_time)}
                        </div>
                      </div>
                      <div className="prof-sections-ov-count">{sec.enrolled || 0}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Notifications */}
            <div className="card">
              <div className="prof-card-hdr">
                <h3>
                  🔔 Notifications
                  {profUnreadCount > 0 && (
                    <span className="prof-unread-badge">{profUnreadCount}</span>
                  )}
                </h3>
                <Link to="/notifications" className="prof-card-link">See all →</Link>
              </div>
              {notifLoading ? (
                <div style={{ padding: '12px 0', color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
              ) : profNotifications.length === 0 ? (
                <div className="empty-state empty-state--compact">
                  <div className="empty-state__icon">✅</div>
                  <p className="empty-state__title">All caught up</p>
                </div>
              ) : (
                <div className="prof-notif-list">
                  {profNotifications.map(n => (
                    <div key={n.id} className={`prof-notif-item${!n.is_read ? ' prof-notif-item--unread' : ''}`}>
                      <div className="prof-notif-title">{n.title}</div>
                      {n.body && <div className="prof-notif-body">{n.body}</div>}
                      <div className="prof-notif-time">{timeAgo(n.published_at || n.created_at)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* ── Quick Actions ── */}
          <div className="card">
            <div className="prof-card-hdr">
              <h3>🚀 Quick Actions</h3>
            </div>
            <div className="prof-quick-actions-grid">
              <button className="prof-quick-action-btn" onClick={() => navigate('/professor/schedule')}>
                <span className="prof-quick-action-icon">📅</span>
                <span>Weekly Schedule</span>
              </button>
              <button className="prof-quick-action-btn" onClick={() => navigate('/professor/attendance')}>
                <span className="prof-quick-action-icon">✅</span>
                <span>Take Attendance</span>
              </button>
              <button className="prof-quick-action-btn" onClick={() => navigate('/professor/students')}>
                <span className="prof-quick-action-icon">📊</span>
                <span>Students & Grades</span>
              </button>
              <button className="prof-quick-action-btn" onClick={() => navigate('/professor/materials')}>
                <span className="prof-quick-action-icon">📚</span>
                <span>Course Materials</span>
              </button>
              <button className="prof-quick-action-btn" onClick={() => navigate('/professor/assessments')}>
                <span className="prof-quick-action-icon">📝</span>
                <span>Assessments</span>
              </button>
              <button className="prof-quick-action-btn" onClick={() => navigate('/professor/analytics')}>
                <span className="prof-quick-action-icon">📈</span>
                <span>Analytics</span>
              </button>
            </div>
          </div>

          {(data?.at_risk || []).length > 0 && (
            <div className="card prof-risk-card">
              <div className="prof-card-hdr">
                <h3>⚠️ Attendance alerts</h3>
                <span style={{ color: 'var(--red)', fontWeight: 600, fontSize: 13 }}>Students below 75%</span>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Course</th>
                      <th>Attendance</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.at_risk.map((s) => (
                      <tr key={`${s.id}-${s.section_id}`}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{s.first_name} {s.last_name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{s.student_id}</div>
                        </td>
                        <td><span className="badge badge--blue">{s.course_code}</span></td>
                        <td><AttBadge pct={s.attendance_pct} /></td>
                        <td>
                          <button
                            className="btn btn--sm"
                            style={{ background: '#fde8e8', color: '#dc2626', border: '1px solid #fca5a5' }}
                            onClick={async () => {
                              try {
                                await axiosInstance.post('/professor/warning', {
                                  student_id: s.id,
                                  section_id: s.section_id
                                });
                                showToast(`⚠️ Warning sent to ${s.first_name}`);
                              } catch {
                                showToast('Failed to send warning', 'error');
                              }
                            }}
                          >
                            ⚠️ Send Warning
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {mode === 'schedule' && (
        <div className="prof-schedule-page">
          <div className="prof-schedule-toolbar">
            <div className="prof-view-toggle">
              <button
                className={`prof-view-btn ${scheduleView === 'text' ? 'prof-view-btn--active' : ''}`}
                onClick={() => setScheduleView('text')}
              >
                Text View
              </button>
              <button
                className={`prof-view-btn ${scheduleView === 'table' ? 'prof-view-btn--active' : ''}`}
                onClick={() => setScheduleView('table')}
              >
                Table View
              </button>
            </div>
            <select className="prof-select" value={semester} onChange={(e) => setTerm(e.target.value, academicYear)}>
              {SEMESTERS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <select className="prof-select" value={academicYear} onChange={(e) => setTerm(semester, e.target.value)}>
              {getAcademicYearOptions().map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <button className="btn btn--sm btn--primary" onClick={loadSchedule}>
              Refresh
            </button>
          </div>

          {scheduleChanges.length > 0 && (
            <div className="prof-active-changes-card">
              <div className="prof-active-changes-card__head">
                <strong>Active temporary/permanent changes</strong>
                <span>{scheduleChanges.length} change{scheduleChanges.length === 1 ? '' : 's'}</span>
              </div>
              <div className="prof-active-changes-list">
                {scheduleChanges.map((change) => (
                  <div className="prof-active-change" key={change.id}>
                    <div className="prof-active-change__info">
                      <strong>{change.code} — {change.course_name}</strong>
                      <p>
                        {scopeLabel(change.change_scope)} · {changeDateText(change)} · {DAYS_AR[change.new_day_of_week] || DAYS[change.new_day_of_week]} · {formatTime24(change.new_start_time)} - {formatTime24(change.new_end_time)} · {roomDisplay(change.new_room_number)}
                      </p>
                      {change.reason && <small>Note: {change.reason}</small>}
                    </div>
                    <div className="prof-active-change__meta">
                      <span className={`prof-change-scope prof-change-scope--${change.change_scope}`}>
                        {scopeLabel(change.change_scope)}
                      </span>
                      <div className="prof-active-change__actions">
                        <button
                          className="btn btn--sm btn--ghost"
                          onClick={() => openChangeEdit(change)}
                        >
                          Edit
                        </button>
                        {change.change_scope !== 'permanent' ? (
                          <button
                            className="btn btn--sm prof-danger-btn"
                            onClick={() => cancelChange(change.id)}
                          >
                            Cancel
                          </button>
                        ) : (
                          <button
                            className="btn btn--sm btn--ghost"
                            disabled
                            title="Permanent changes update the base schedule. Use Edit to modify, or create a new change to override."
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {scheduleLoading ? (
            <div className="card" style={{ textAlign: 'center', padding: 40 }}>
              <div className="spinner" />
            </div>
          ) : scheduleView === 'text' ? (
            <div className="prof-student-like-schedule">
              <div className="prof-schedule-title">
                <span>{SEMESTERS.find((s) => s.value === semester)?.label || semester} {academicYear}</span>
              </div>

              <div className="table-wrap">
                <table className="prof-schedule-text-table">
                  <thead>
                    <tr>
                      <th>رقم المساق حسب الخطة</th>
                      <th>رقم الشعبة</th>
                      <th>اسم المساق</th>
                      <th>س.م</th>
                      <th>الحضور</th>
                      <th>الأيام</th>
                      <th>من-إلى</th>
                      <th>رقم القاعة</th>
                      <th>الحرم</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedSchedule.flatMap((section) => (
                      (section.meetings || []).map((meeting, idx) => (
                        <tr key={`${section.id}-${meeting.day_of_week}-${meeting.start_time}`}>
                          {idx === 0 && (
                            <>
                              <td rowSpan={section.meetings.length}>{section.code}</td>
                              <td rowSpan={section.meetings.length}>{section.section_number}</td>
                              <td rowSpan={section.meetings.length}>{section.course_name_ar || section.course_name}</td>
                              <td rowSpan={section.meetings.length}>{section.credit_hours || 3}</td>
                            </>
                          )}
                          <td>
                            <div className="prof-schedule-actions-cell">
                              <button
                                className="prof-attendance-day-btn"
                                onClick={() => openAttendanceFromMeeting(meeting)}
                              >
                                حضور {DAYS_AR[meeting.day_of_week] || DAYS[meeting.day_of_week]}
                              </button>
                              <button
                                className="prof-change-meeting-btn"
                                onClick={() => openMeetingChange(meeting)}
                                title="Change room or time and notify students"
                              >
                                تغيير
                              </button>
                            </div>
                          </td>
                          <td>{DAYS_AR[meeting.day_of_week] || DAYS[meeting.day_of_week]}</td>
                          <td>{formatTime24(meeting.start_time)} - {formatTime24(meeting.end_time)}</td>
                          <td>{roomDisplay(meeting.room_number)}</td>
                          <td>{isOnlineRoom(meeting.room_number) ? 'الكتروني' : (meeting.campus || 'الجديد')}</td>
                        </tr>
                      ))
                    ))}

                    {groupedSchedule.length === 0 && (
                      <tr>
                        <td colSpan={9} style={{ textAlign: 'center', padding: 28, color: 'var(--text-muted)' }}>
                          No schedule found for this semester.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="prof-weekly-grid-card">
              <div className="prof-grid-title">
                <div>
                  <h3>الساعات المكتبية — {SEMESTERS.find((s) => s.value === semester)?.label} {academicYear}</h3>
                  <p>{user?.email}</p>
                </div>
                <button className="btn btn--sm btn--secondary" onClick={() => setScheduleView('text')}>
                  إغلاق
                </button>
              </div>

              <div className="prof-week-table-wrap">
                <table className="prof-week-table">
                  <thead>
                    <tr>
                      <th className="prof-week-day-head">اليوم/الوقت</th>
                      {TIME_SLOTS.map((slot) => (
                        <th key={slot}>{slot}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {DAYS_AR.map((day, dayIndex) => (
                      <tr key={day}>
                        <th className="prof-week-day">{day}</th>
                        {TIME_SLOTS.map((slot) => {
                          const classes = scheduleRows.filter((r) => Number(r.day_of_week) === dayIndex && isSameSlot(r, slot));
                          const office = officeHours.filter((oh) => Number(oh.day_of_week) === dayIndex && isSameSlot(oh, slot));

                          return (
                            <td key={`${day}-${slot}`} className={classes.length || office.length ? 'prof-week-cell prof-week-cell--busy' : 'prof-week-cell'}>
                              {classes.map((c) => (
                                <div
                                  key={`${c.id}-${c.start_time}`}
                                  className="prof-week-class"
                                  title="Class meeting"
                                >
                                  <span>{c.course_name_ar || c.course_name}</span>
                                  <strong>{c.code}/{c.section_number}</strong>
                                  <small>{roomDisplay(c.room_number, 'TBA')}</small>
                                  <div className="prof-week-class-actions">
                                    <button onClick={() => openAttendanceFromMeeting(c)}>حضور</button>
                                    <button onClick={() => openMeetingChange(c)}>تغيير</button>
                                  </div>
                                </div>
                              ))}
                              {office.map((oh) => (
                                <div key={oh.id || `${day}-${slot}-oh`} className="prof-office-hour">O.H</div>
                              ))}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {mode === 'students' && !activeSection && (
        <SectionSelectCard
          sections={data?.sections || []}
          onOpenStudents={(s) => loadSection(s, 'students')}
          onOpenAttendance={(s) => loadSection(s, 'attendance')}
          showAttendance={false}
        />
      )}

      {mode === 'students' && activeSection && (
        <div>
          <div className="prof-section-banner">
            <div>
              <span className="prof-section-banner__code">{activeSection.code}</span>
              <span className="prof-section-banner__name">{activeSection.course_name}</span>
              <span className="prof-section-banner__meta">Section {activeSection.section_number} · {activeSection.enrolled || 0} students</span>
            </div>
            <button className="btn btn--secondary btn--sm" onClick={() => { setActiveSection(null); navigate('/professor/students'); }}>
              ← Sections
            </button>
          </div>

          {loadingSec ? (
            <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" /></div>
          ) : (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="prof-card-hdr">
                <h3>👥 Students & Grades</h3>
                <div className="prof-header-actions">
                  <button className="btn btn--secondary btn--sm" onClick={exportGrades}>⬇ Export grades</button>
                  <button className="btn btn--secondary btn--sm" onClick={openImportModal}>⬆ Import grades</button>
                  {hasUnsavedGrades && (
                    <span style={{ fontSize: 12, color: '#d97706', fontWeight: 600, alignSelf: 'center' }}>
                      Unsaved changes
                    </span>
                  )}
                  <button className="btn btn--primary btn--sm" onClick={saveAllGrades} disabled={savingGrades}>
                    {savingGrades ? 'Saving...' : '💾 Save All Grades'}
                  </button>
                </div>
              </div>

              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th style={{ textAlign: 'center' }}>Midterm<br /><small style={{ fontWeight: 400, opacity: .7 }}>/30</small></th>
                      <th style={{ textAlign: 'center' }}>Quizzes & Assign.<br /><small style={{ fontWeight: 400, opacity: .7 }}>/20</small></th>
                      <th style={{ textAlign: 'center' }}>Final<br /><small style={{ fontWeight: 400, opacity: .7 }}>/50</small></th>
                      <th style={{ textAlign: 'center' }}>Grade</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s) => {
                      const att = attSummary.find((a) => a.id === s.id);
                      const ge = gradeEdit[s.id] || {};
                      const total =
                        (parseFloat(ge.midterm) || 0) +
                        (parseFloat(ge.assignments) || 0) +
                        (parseFloat(ge.final) || 0);

                      const lg =
                        total >= 90 ? 'A' :
                          total >= 88 ? 'A-' :
                            total >= 85 ? 'B+' :
                              total >= 80 ? 'B' :
                                total >= 78 ? 'B-' :
                                  total >= 73 ? 'C+' :
                                    total >= 70 ? 'C' :
                                      total >= 65 ? 'C-' :
                                        total >= 63 ? 'D+' :
                                          total >= 60 ? 'D' :
                                            total >= 45 ? 'D-' :
                                              total > 0 ? 'E' : '—';

                      return (
                        <tr key={s.id}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{s.first_name} {s.last_name}</div>
                            <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                              {s.student_id}
                            </div>
                          </td>

                          {[
                            { field: 'midterm', max: 30 },
                            { field: 'assignments', max: 20 },
                            { field: 'final', max: 50 }
                          ].map(({ field, max }) => (
                            <td key={field} style={{ textAlign: 'center' }}>
                              <input
                                type="number"
                                min="0"
                                max={max}
                                className="prof-grade-input"
                                value={ge[field] || ''}
                                onChange={(e) => {
                                  let value = e.target.value;
                                  if (value !== '') value = Math.max(0, Math.min(Number(value), max));

                                  setGradeEdit((prev) => ({
                                    ...prev,
                                    [s.id]: {
                                      ...prev[s.id],
                                      [field]: value
                                    }
                                  }));
                                  setHasUnsavedGrades(true);
                                }}
                                placeholder="—"
                              />
                            </td>
                          ))}

                          <td style={{ textAlign: 'center' }}>
                            <span className={`prof-grade-badge prof-grade-badge--${lg === 'F' ? 'f' : lg.includes('+') || lg === 'A' ? 'a' : lg.includes('B') ? 'b' : lg.includes('C') ? 'c' : 'd'}`}>
                              {lg}
                            </span>
                          </td>
                          <td>
                            {att?.attendance_pct < 75 && (
                              <button
                                className="btn btn--sm"
                                title="Send attendance warning"
                                style={{ background: '#fde8e8', color: '#dc2626', border: '1px solid #fca5a5', fontSize: 11 }}
                                onClick={() => sendWarning(s)}
                              >
                                ⚠️ Warn
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {students.length === 0 && (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
                          No enrolled students in this section.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}


      {mode === 'materials' && (
        <div className="prof-feature-page">
          <div className="prof-feature-grid">
            <div
              ref={materialFormRef}
              className={`card prof-feature-form-card${editingMaterialId ? ' prof-feature-form-card--editing' : ''}`}
            >
              <div className="prof-card-hdr">
                {editingMaterialId ? (
                  <>
                    <h3>✏️ Edit material</h3>
                    <span className="prof-editing-badge">Editing</span>
                  </>
                ) : (
                  <>
                    <h3>📚 Course Materials</h3>
                    <span className="prof-muted">Dynamic from your sections and database</span>
                  </>
                )}
              </div>

              <label className="prof-field">
                <span>Section</span>
                <select value={materialSectionId} onChange={(e) => handleMaterialSectionChange(e.target.value)}>
                  {materialSections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} — {s.course_name} §{s.section_number}
                    </option>
                  ))}
                </select>
              </label>

              <div className="prof-material-section-card">
                <strong>{selectedMaterialSection?.code || 'No section selected'}</strong>
                <p>{selectedMaterialSection?.course_name || 'Choose a section to add materials.'}</p>
                {selectedMaterialSection && (
                  <small>§{selectedMaterialSection.section_number} · {selectedMaterialSection.enrolled || 0} students · {filteredMaterials.length} real materials</small>
                )}
              </div>

              <label className="prof-field">
                <span>Material title</span>
                <input value={materialForm.title} onChange={(e) => setMaterialForm((p) => ({ ...p, title: e.target.value }))} placeholder="Example: Week 3 slides" />
              </label>

              <div className="prof-form-row">
                <label className="prof-field">
                  <span>Type</span>
                  <select value={materialForm.material_type} onChange={(e) => setMaterialForm((p) => ({ ...p, material_type: e.target.value }))}>
                    <option value="lecture_notes">Lecture notes</option>
                    <option value="slides">Slides</option>
                    <option value="assignment">Assignment</option>
                    <option value="lab_sheet">Lab sheet</option>
                    <option value="recording">Recording</option>
                    <option value="reference">Reference</option>
                    <option value="exam_review">Exam review</option>
                  </select>
                </label>
                <label className="prof-field">
                  <span>Week</span>
                  <input type="number" min="1" max="16" value={materialForm.week_number} onChange={(e) => setMaterialForm((p) => ({ ...p, week_number: e.target.value }))} placeholder="1-16" />
                </label>
              </div>

              <label className="prof-field">
                <span>Material file</span>

                <input
                  ref={materialFileInputRef}
                  type="file"
                  className="prof-hidden-file"
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip,.rar,.png,.jpg,.jpeg,.webp,.mp4,.mov"
                  onChange={(e) => uploadMaterialFile(e.target.files?.[0])}
                />

                <div className="prof-file-picker">
                  <button
                    type="button"
                    className="prof-file-picker__btn"
                    onClick={() => materialFileInputRef.current?.click()}
                    disabled={materialFileUploading}
                  >
                    {materialFileUploading ? 'Uploading...' : 'Choose file'}
                  </button>

                  <div className="prof-file-picker__info">
                    <strong>{materialForm.file_url ? 'Selected material' : 'No file selected'}</strong>
                    <small>{materialForm.file_url || 'PDF, Word, PowerPoint, image, video, or archive'}</small>
                  </div>

                  {materialForm.file_url && (
                    <button
                      type="button"
                      className="prof-file-picker__clear"
                      onClick={() => setMaterialForm((p) => ({ ...p, file_url: '' }))}
                    >
                      Clear
                    </button>
                  )}
                </div>

                <input
                  className="prof-file-link-input"
                  value={materialForm.file_url}
                  onChange={(e) => setMaterialForm((p) => ({ ...p, file_url: e.target.value }))}
                  placeholder="Or paste an external link manually"
                />
              </label>

              <label className="prof-field">
                <span>Description</span>
                <textarea rows="4" value={materialForm.description} onChange={(e) => setMaterialForm((p) => ({ ...p, description: e.target.value }))} placeholder="Short note for students" />
              </label>

              <div className="prof-check-row">
                <label><input type="checkbox" checked={materialForm.is_published} onChange={(e) => setMaterialForm((p) => ({ ...p, is_published: e.target.checked }))} /> Published</label>
                <label><input type="checkbox" checked={materialForm.notify_students} onChange={(e) => setMaterialForm((p) => ({ ...p, notify_students: e.target.checked }))} /> Notify enrolled students</label>
              </div>

              <div className="prof-form-actions">
                {editingMaterialId && <button className="btn btn--secondary" onClick={resetMaterialForm}>Cancel edit</button>}
                <button className="btn btn--primary" onClick={saveMaterial} disabled={materialSaving || !materialSectionId}>{materialSaving ? 'Saving...' : editingMaterialId ? 'Update material' : 'Add material'}</button>
              </div>
            </div>

            <div className="card prof-feature-list-card">
              <div className="prof-card-hdr">
                <h3>📄 Materials list{selectedMaterialSection ? ` — ${selectedMaterialSection.code} §${selectedMaterialSection.section_number}` : ''}</h3>
                <button className="btn btn--sm btn--secondary" onClick={() => loadMaterials(materialSectionId)}>Refresh</button>
              </div>

              {materialsLoading ? <div className="spinner" /> : (
                <div className="prof-material-list">
                  {filteredMaterials.map((m) => (
                    <div className="prof-material-item" key={m.id}>
                      <div>
                        <div className="prof-material-topline">
                          <span className="badge badge--blue">{m.material_type}</span>
                          {m.week_number && <span className="badge badge--amber">Week {m.week_number}</span>}
                          {!m.is_published && <span className="badge">Draft</span>}
                        </div>
                        <strong>{m.title}</strong>
                        <p>{m.description || 'No description'}</p>
                        <small>
                          {m.course_code} §{m.section_number} · Opened {Number(m.download_count || 0)} times
                          {m.file_url ? ' · File available' : ' · No file selected'}
                        </small>
                      </div>
                      <div className="prof-material-actions">
                        <button className="btn btn--sm btn--secondary" onClick={() => openMaterial(m)} disabled={!m.file_url}>Open</button>
                        <button className="btn btn--sm btn--secondary" onClick={() => editMaterial(m)}>Edit</button>
                        <button className="btn btn--sm prof-danger-btn" onClick={() => deleteMaterial(m.id)}>Delete</button>
                      </div>
                    </div>
                  ))}
                  {filteredMaterials.length === 0 && (
                    <div className="empty-state">
                      <p className="empty-state__title">No real uploaded materials for this section yet.</p>
                      <p>Choose a file and click Add material to create the first item for this course.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {mode === 'officeHours' && (
        <div className="prof-feature-page">
          <div className="prof-feature-grid prof-feature-grid--office">
            <div className="card prof-feature-form-card">
              <div className="prof-card-hdr"><h3>🕓 Office Hours</h3><span className="prof-muted">Shown to your students</span></div>

              {/* Assigned office room — read-only, set by admin */}
              {assignedOffice === undefined ? null : assignedOffice ? (
                <div className="prof-office-assigned prof-office-assigned--set">
                  <span className="prof-office-assigned__icon">🏢</span>
                  <div>
                    <span className="prof-office-assigned__label">Assigned office</span>
                    <strong className="prof-office-assigned__room">
                      Room {assignedOffice.room_number}{assignedOffice.room_name ? ` — ${assignedOffice.room_name}` : ''}
                    </strong>
                  </div>
                </div>
              ) : (
                <div className="prof-office-assigned prof-office-assigned--none">
                  <span className="prof-office-assigned__icon">⚠️</span>
                  <div>
                    <strong className="prof-office-assigned__label">No office room assigned</strong>
                    <span className="prof-office-assigned__sub">Please contact admin to assign your office.</span>
                  </div>
                </div>
              )}

              <label className="prof-field">
                <span>Day</span>
                <select value={officeForm.day_of_week} onChange={(e) => setOfficeForm((p) => ({ ...p, day_of_week: e.target.value }))} disabled={!assignedOffice}>
                  {DAYS_AR.map((d, idx) => <option key={d} value={idx}>{d}</option>)}
                </select>
              </label>

              <div className="prof-form-row">
                <label className="prof-field"><span>Start</span><input type="time" value={officeForm.start_time} onChange={(e) => setOfficeForm((p) => ({ ...p, start_time: e.target.value }))} disabled={!assignedOffice} /></label>
                <label className="prof-field"><span>End</span><input type="time" value={officeForm.end_time} onChange={(e) => setOfficeForm((p) => ({ ...p, end_time: e.target.value }))} disabled={!assignedOffice} /></label>
              </div>

              <label className="prof-field"><span>Note</span><textarea rows="3" value={officeForm.note} onChange={(e) => setOfficeForm((p) => ({ ...p, note: e.target.value }))} placeholder="Example: by appointment" disabled={!assignedOffice} /></label>
              <div className="prof-check-row"><label><input type="checkbox" checked={officeForm.notify_students} onChange={(e) => setOfficeForm((p) => ({ ...p, notify_students: e.target.checked }))} disabled={!assignedOffice} /> Notify my students</label></div>
              <div className="prof-form-actions">
                {editingOfficeId && <button className="btn btn--secondary" onClick={resetOfficeForm}>Cancel edit</button>}
                <button className="btn btn--primary" onClick={saveOfficeHour} disabled={officeSaving || !assignedOffice}>
                  {officeSaving ? 'Saving...' : editingOfficeId ? 'Update office hour' : 'Add office hour'}
                </button>
              </div>
            </div>

            <div className="card prof-feature-list-card">
              <div className="prof-card-hdr"><h3>Weekly office hours</h3><button className="btn btn--sm btn--secondary" onClick={loadOfficeHoursPage}>Refresh</button></div>
              {officeLoading ? <div className="spinner" /> : (
                <div className="prof-office-list">
                  {officeRows.map((oh) => (
                    <div className="prof-office-item" key={oh.id}>
                      <div className="prof-office-day">{DAYS_AR[oh.day_of_week] || oh.day_of_week}</div>
                      <div className="prof-office-info"><strong>{formatTime(oh.start_time)} - {formatTime(oh.end_time)}</strong><span>{oh.office_room || 'Office / Online not specified'}</span>{oh.note && <small>{oh.note}</small>}</div>
                      <div className="prof-office-actions"><button className="btn btn--sm btn--secondary" onClick={() => editOfficeHour(oh)}>Edit</button><button className="btn btn--sm prof-danger-btn" onClick={() => deleteOfficeHour(oh.id)}>Delete</button></div>
                    </div>
                  ))}
                  {officeRows.length === 0 && <div className="empty-state"><p className="empty-state__title">No office hours added yet.</p></div>}
                </div>
              )}
            <div className="card prof-feature-list-card prof-wide-card">
              <div className="prof-card-hdr">
                <h3>📌 Office hour booking requests</h3>
                <span className="prof-muted">Student appointment requests</span>
              </div>

              <div className="prof-booking-list">
                {officeBookings.map((b) => (
                  <div className="prof-booking-item" key={b.id}>
                    <div>
                      <strong>{b.student_name}</strong>
                      <small>{b.student_number || b.student_email} · {DAYS_AR[b.day_of_week] || b.day_of_week} · {formatTime(b.start_time)} - {formatTime(b.end_time)}</small>
                      {b.message && <p>{b.message}</p>}
                    </div>
                    <div className="prof-booking-actions">
                      <span className={`badge ${b.status === 'accepted' ? 'badge--green' : b.status === 'declined' ? 'badge--red' : 'badge--amber'}`}>{b.status}</span>
                      {b.status === 'pending' && (
                        <>
                          <button className="btn btn--sm btn--secondary" disabled={bookingSavingId === b.id} onClick={() => respondBooking(b.id, 'accepted')}>Accept</button>
                          <button className="btn btn--sm prof-danger-btn" disabled={bookingSavingId === b.id} onClick={() => respondBooking(b.id, 'declined')}>Decline</button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {officeBookings.length === 0 && <div className="empty-state"><p className="empty-state__title">No booking requests yet.</p></div>}
              </div>
            </div>

            </div>
          </div>
        </div>
      )}

      {mode === 'messages' && (
        <div className="prof-feature-page">
          <div className="prof-feature-grid prof-feature-grid--materials">
            <div className="card prof-feature-form-card">
              <div className="prof-card-hdr">
                <h3>💬 Course Message Board</h3>
                <span className="prof-muted">Post notes to one section</span>
              </div>

              <label className="prof-field">
                <span>Section</span>
                <select value={messageSectionId} onChange={(e) => setMessageSectionId(e.target.value)}>
                  {messageSections.map((s) => (
                    <option key={s.id} value={s.id}>{s.code} §{s.section_number} — {s.course_name}</option>
                  ))}
                </select>
              </label>

              <label className="prof-field">
                <span>Title</span>
                <input value={messageForm.title} onChange={(e) => setMessageForm((p) => ({ ...p, title: e.target.value }))} placeholder="Example: Quiz postponed" />
              </label>

              <label className="prof-field">
                <span>Message</span>
                <textarea rows="5" value={messageForm.body} onChange={(e) => setMessageForm((p) => ({ ...p, body: e.target.value }))} placeholder="Write the message for students" />
              </label>

              <div className="prof-check-row">
                <label><input type="checkbox" checked={messageForm.is_pinned} onChange={(e) => setMessageForm((p) => ({ ...p, is_pinned: e.target.checked }))} /> Pin message</label>
                <label><input type="checkbox" checked={messageForm.notify_students} onChange={(e) => setMessageForm((p) => ({ ...p, notify_students: e.target.checked }))} /> Notify enrolled students</label>
              </div>

              <div className="prof-form-actions">
                <button className="btn btn--primary" onClick={saveCourseMessage} disabled={messageSaving || !messageSectionId}>{messageSaving ? 'Posting...' : 'Post message'}</button>
              </div>
            </div>

            <div className="card prof-feature-list-card">
              <div className="prof-card-hdr"><h3>Messages</h3><button className="btn btn--sm btn--secondary" onClick={loadMessages}>Refresh</button></div>
              {messageLoading ? <div className="spinner" /> : (
                <div className="prof-message-list">
                  {messages.map((m) => (
                    <div className="prof-message-item" key={m.id}>
                      <div>
                        <div className="prof-material-topline">
                          <span className="badge badge--blue">{m.course_code} §{m.section_number}</span>
                          {m.is_pinned && <span className="badge badge--amber">Pinned</span>}
                        </div>
                        <strong>{m.title}</strong>
                        <p>{m.body}</p>
                        <small>{new Date(m.created_at).toLocaleString()}</small>
                      </div>
                      <button className="btn btn--sm prof-danger-btn" onClick={() => deleteCourseMessage(m.id)}>Delete</button>
                    </div>
                  ))}
                  {messages.length === 0 && <div className="empty-state"><p className="empty-state__title">No course messages yet.</p></div>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {mode === 'changeHistory' && (
        <div className="card prof-history-page">
          <div className="prof-card-hdr"><h3>🧾 Room / Time Change History</h3><button className="btn btn--sm btn--secondary" onClick={loadChangeHistory}>Refresh</button></div>
          {historyLoading ? <div className="spinner" /> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Course</th><th>Scope</th><th>Date</th><th>Old</th><th>New</th><th>Reason</th><th>Status</th><th>Action</th></tr></thead>
                <tbody>
                  {changeHistory.map((ch) => (
                    <tr key={ch.id}>
                      <td><strong>{ch.code}</strong><div style={{fontSize:11,color:'var(--text-muted)'}}>{ch.course_name} §{ch.section_number}</div></td>
                      <td><span className="badge badge--blue">{scopeLabel(ch.change_scope)}</span></td>
                      <td>{changeDateText(ch)}</td>
                      <td>{DAYS_AR[ch.old_day_of_week] || '—'} · {formatTime24(ch.old_start_time)}-{formatTime24(ch.old_end_time)} · {roomDisplay(ch.old_room_number)}</td>
                      <td>{DAYS_AR[ch.new_day_of_week] || '—'} · {formatTime24(ch.new_start_time)}-{formatTime24(ch.new_end_time)} · {roomDisplay(ch.new_room_number)}</td>
                      <td>{ch.reason || '—'}</td>
                      <td><span className={`badge ${ch.is_active ? 'badge--green' : ''}`}>{ch.is_active ? 'Active' : 'Canceled'}</span></td>
                      <td>{ch.is_active && ch.change_scope !== 'permanent' ? <button className="btn btn--sm prof-danger-btn" onClick={() => cancelChange(ch.id)}>Cancel</button> : <span style={{color:'var(--text-muted)'}}>—</span>}</td>
                    </tr>
                  ))}
                  {changeHistory.length === 0 && <tr><td colSpan={8} style={{textAlign:'center',padding:24,color:'var(--text-muted)'}}>No schedule changes yet.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {mode === 'analytics' && (
        <div className="prof-analytics-page">
          <div className="card prof-analytics-toolbar">
            <div>
              <h3>📊 Attendance Analytics & Grade Summary</h3>
              <p>Choose one course section, or keep it on all courses to see the full summary.</p>
            </div>
            <div className="prof-analytics-controls">
              <label className="prof-analytics-filter">
                <span>Course / section</span>
                <select
                  className="prof-select prof-analytics-select"
                  value={analyticsSectionId}
                  onChange={(e) => setAnalyticsSectionId(e.target.value)}
                >
                  <option value="all">All courses / sections</option>
                  {analyticsSections.map((s) => (
                    <option key={s.section_id} value={s.section_id}>
                      {s.code} — {s.course_name} §{s.section_number}
                    </option>
                  ))}
                </select>
              </label>
              <button className="btn btn--sm btn--secondary" onClick={loadAnalytics}>Refresh</button>
            </div>
          </div>

          <section className="prof-insight-grid">
            <div className="prof-insight-card"><span>Sections</span><strong>{analyticsTotals.total_sections || 0}</strong><small>{selectedAnalyticsLabel}</small></div>
            <div className="prof-insight-card"><span>Students</span><strong>{analyticsTotals.total_students || 0}</strong><small>enrolled students</small></div>
            <div className="prof-insight-card"><span>Courses</span><strong>{analyticsTotals.total_courses || 0}</strong><small>{analyticsSectionId === 'all' ? 'different courses' : 'selected course'}</small></div>
            <div className="prof-insight-card prof-insight-card--danger"><span>Warnings</span><strong>{analyticsTotals.warnings_sent || 0}</strong><small>sent warnings</small></div>
          </section>

          <div className="card">
            {analyticsLoading ? <div className="spinner" /> : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Section</th><th>Students</th><th>Avg Attendance</th><th>Below 75%</th><th>Avg Grade</th><th>High</th><th>Low</th><th>Missing Grades</th><th>Failing</th></tr></thead>
                  <tbody>
                    {filteredAnalyticsSections.map((s) => (
                      <tr key={s.section_id}>
                        <td><strong>{s.code}</strong><div style={{fontSize:11,color:'var(--text-muted)'}}>{s.course_name} §{s.section_number}</div></td>
                        <td>{s.enrolled || 0}</td>
                        <td><AttBadge pct={s.average_attendance} /></td>
                        <td><span className={Number(s.below_75_count) > 0 ? 'badge badge--red' : 'badge badge--green'}>{s.below_75_count || 0}</span></td>
                        <td>{s.average_grade ?? '—'}</td>
                        <td>{s.highest_grade ?? '—'}</td>
                        <td>{s.lowest_grade ?? '—'}</td>
                        <td>{s.missing_grades || 0}</td>
                        <td><span className={Number(s.failing_count) > 0 ? 'badge badge--red' : ''}>{s.failing_count || 0}</span></td>
                      </tr>
                    ))}
                    {filteredAnalyticsSections.length === 0 && (
                      <tr>
                        <td colSpan={9} style={{textAlign:'center',padding:24,color:'var(--text-muted)'}}>
                          {analyticsSectionId === 'all' ? 'No analytics yet.' : 'No analytics for the selected course yet.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {mode === 'attendance' && !activeSection && (
        <SectionSelectCard
          sections={data?.sections || []}
          onOpenStudents={(s) => loadSection(s, 'students')}
          onOpenAttendance={(s) => loadSection(s, 'attendance')}
          showAttendance={true}
        />
      )}

      {mode === 'attendance' && activeSection && (
        <div>
          <div className="prof-section-banner">
            <div>
              <span className="prof-section-banner__code">{activeSection.code}</span>
              <span className="prof-section-banner__name">{activeSection.course_name}</span>
            </div>
            <button className="btn btn--secondary btn--sm" onClick={() => { setActiveSection(null); navigate('/professor/attendance'); }}>
              ← Sections
            </button>
          </div>

          {loadingSec ? (
            <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" /></div>
          ) : (
            <div style={{ display: 'grid', gap: 20, marginTop: 16 }}>
              <div className="card">
                <div className="prof-card-hdr">
                  <h3>✅ Mark Attendance</h3>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button className="btn btn--secondary btn--sm" onClick={exportAttendance}>⬇ Export attendance</button>
                    <input
                      type="date"
                      className="form-input"
                      style={{ width: 160, padding: '6px 10px', fontSize: 13 }}
                      value={attDate}
                      onChange={(e) => setAttDate(e.target.value)}
                    />
                    <button className="btn btn--primary btn--sm" onClick={markAttendance} disabled={saving}>
                      {saving ? 'Saving...' : '💾 Save Attendance'}
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>Mark all as:</span>
                  {['present', 'absent', 'late', 'excused'].map((s) => (
                    <button
                      key={s}
                      className="btn btn--sm btn--secondary"
                      onClick={() => {
                        const updated = {};
                        students.forEach((st) => { updated[st.id] = s; });
                        setAttRecs(updated);
                      }}
                      style={{ textTransform: 'capitalize' }}
                    >
                      {s === 'present' ? '🟢' : s === 'absent' ? '🔴' : s === 'late' ? '🟡' : '🔵'} {s}
                    </button>
                  ))}
                </div>

                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Student</th>
                        <th>Student ID</th>
                        <th style={{ textAlign: 'center' }}>Status</th>
                        <th style={{ textAlign: 'center' }}>Overall Att.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((s, idx) => {
                        const att = attSummary.find((a) => a.id === s.id);
                        const cur = attRecs[s.id] || 'present';

                        return (
                          <tr key={s.id}>
                            <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{idx + 1}</td>
                            <td style={{ fontWeight: 600 }}>{s.first_name} {s.last_name}</td>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{s.student_id}</td>
                            <td>
                              <div className="prof-att-btns">
                                {['present', 'absent', 'late', 'excused'].map((opt) => (
                                  <button
                                    key={opt}
                                    className={`prof-att-btn prof-att-btn--${opt} ${cur === opt ? 'prof-att-btn--active' : ''}`}
                                    onClick={() => setAttRecs((prev) => ({ ...prev, [s.id]: opt }))}
                                  >
                                    {opt === 'present' ? '✓' : opt === 'absent' ? '✗' : opt === 'late' ? '⏰' : '📝'}
                                  </button>
                                ))}
                              </div>
                            </td>
                            <td style={{ textAlign: 'center' }}><AttBadge pct={att?.attendance_pct} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card">
                <div className="prof-card-hdr"><h3>📊 Attendance Summary</h3></div>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th style={{ textAlign: 'center' }}>Present</th>
                        <th style={{ textAlign: 'center' }}>Absent</th>
                        <th style={{ textAlign: 'center' }}>Late</th>
                        <th style={{ textAlign: 'center' }}>Total</th>
                        <th style={{ textAlign: 'center' }}>Attendance %</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attSummary.map((s) => (
                        <tr key={s.id}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{s.first_name} {s.last_name}</div>
                            <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{s.student_number}</div>
                          </td>
                          <td style={{ textAlign: 'center' }}><span className="badge badge--green">{s.present || 0}</span></td>
                          <td style={{ textAlign: 'center' }}><span className="badge badge--red">{s.absent || 0}</span></td>
                          <td style={{ textAlign: 'center' }}><span className="badge badge--amber">{s.late || 0}</span></td>
                          <td style={{ textAlign: 'center' }}>{s.total || 0}</td>
                          <td style={{ textAlign: 'center' }}><AttBadge pct={s.attendance_pct} /></td>
                          <td>
                            {parseFloat(s.attendance_pct) < 75 && s.total > 0 && (
                              <button
                                className="btn btn--sm"
                                style={{ background: '#fde8e8', color: '#dc2626', border: '1px solid #fca5a5', fontSize: 11 }}
                                onClick={() => sendWarning(s)}
                              >
                                ⚠️ Warn
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {attSummary.length === 0 && (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>
                            No attendance records yet. Start marking attendance above.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function toPublicFileUrl(fileUrl) {
  if (!fileUrl) return '';

  if (/^https?:\/\//i.test(fileUrl)) {
    return fileUrl;
  }

  const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
  const publicBase = apiBase.replace(/\/api\/?$/, '');

  return `${publicBase}${fileUrl.startsWith('/') ? fileUrl : `/${fileUrl}`}`;
}
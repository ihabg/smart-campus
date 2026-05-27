import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { userAPI, announcementAPI, professorAPI, instructorAPI, scheduleAPI, studentAPI } from '../api/index';
import { useAsync } from '../hooks/index';
import { Button, Input, Spinner, Badge } from '../components/ui/index';
import { getErrorMessage, timeAgo, formatTime } from '../utils/helpers';
import { publicUrl } from '../utils/publicUrl';
import toast from 'react-hot-toast';
import './ProfilePage.css';

// ─── Shared helpers ───────────────────────────────────────────
const PROF_DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const SEMESTER_LABELS = { fall: 'Fall', spring: 'Spring', summer: 'Summer' };

function termLabel(term) {
  if (!term) return '';
  return `${SEMESTER_LABELS[term.semester] || term.semester} ${term.academic_year}`;
}

// Professor sections: flat day_of_week array + start_time on the section row
function getNextClass(sections) {
  const now = new Date();
  const today = now.getDay();
  const cur = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:00`;
  const slots = [];
  for (const s of sections) {
    const days = Array.isArray(s.day_of_week) ? s.day_of_week : [];
    for (const d of days) {
      slots.push({ day: d, startTime: s.start_time || '', code: s.code, section: s.section_number, room: s.room_number });
    }
  }
  if (!slots.length) return null;
  slots.sort((a, b) => {
    const da = (a.day - today + 7) % 7;
    const db = (b.day - today + 7) % 7;
    if (da !== db) return da - db;
    return (a.startTime || '').localeCompare(b.startTime || '');
  });
  for (const slot of slots) {
    const ahead = (slot.day - today + 7) % 7;
    if (ahead === 0 && slot.startTime <= cur) continue;
    return slot;
  }
  return slots[0] || null;
}

// Student sections: nested meetings array per section
function getNextClassForStudent(sections) {
  const now = new Date();
  const today = now.getDay();
  const cur = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:00`;
  const slots = [];
  for (const s of sections) {
    const meetings = Array.isArray(s.meetings) ? s.meetings : [];
    for (const m of meetings) {
      slots.push({
        day:       m.day_of_week,
        startTime: m.start_time   || '',
        endTime:   m.end_time     || '',
        code:      s.course_code  || '',
        name:      s.course_name  || '',
        section:   s.section_number,
        room:      m.room_number  || '',
      });
    }
  }
  if (!slots.length) return null;
  slots.sort((a, b) => {
    const da = (a.day - today + 7) % 7;
    const db = (b.day - today + 7) % 7;
    if (da !== db) return da - db;
    return (a.startTime || '').localeCompare(b.startTime || '');
  });
  for (const slot of slots) {
    const ahead = (slot.day - today + 7) % 7;
    if (ahead === 0 && slot.startTime <= cur) continue;
    return slot;
  }
  return slots[0] || null;
}

function getNextOfficeHour(officeHours) {
  if (!officeHours.length) return null;
  const now = new Date();
  const today = now.getDay();
  const cur = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:00`;
  const sorted = [...officeHours].sort((a, b) => {
    const da = (a.day_of_week - today + 7) % 7;
    const db = (b.day_of_week - today + 7) % 7;
    if (da !== db) return da - db;
    return (a.start_time || '').localeCompare(b.start_time || '');
  });
  for (const oh of sorted) {
    const ahead = (oh.day_of_week - today + 7) % 7;
    if (ahead === 0 && (oh.start_time || '') <= cur) continue;
    return oh;
  }
  return sorted[0] || null;
}

// ─── Reusable form column (shared by professor + student layouts) ──
function ProfileFormColumn({ tab, setTab, form, set, user, saving, handleSaveProfile,
                             passwords, setPw, pwLoading, handleChangePassword }) {
  return (
    <div className="prof-left">
      <div className="prof-tabs">
        <button className={`prof-tab${tab === 'profile'  ? ' active' : ''}`} onClick={() => setTab('profile')}>Profile</button>
        <button className={`prof-tab${tab === 'security' ? ' active' : ''}`} onClick={() => setTab('security')}>Security</button>
      </div>

      {tab === 'profile' && (
        <div className="card">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            <div className="form-row">
              <Input label="First name" required value={form.first_name} onChange={set('first_name')} />
              <Input label="Last name"  required value={form.last_name}  onChange={set('last_name')} />
            </div>
            <Input label="Email" value={user?.email || ''} disabled hint="Email cannot be changed" />
            <Button variant="primary" loading={saving} onClick={handleSaveProfile}>Save Changes</Button>
          </div>
        </div>
      )}

      {tab === 'security' && (
        <div className="card">
          <form onSubmit={handleChangePassword}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
              <Input label="Current password" type="password" required
                value={passwords.current_password} onChange={setPw('current_password')} />
              <Input label="New password" type="password" required
                value={passwords.new_password} onChange={setPw('new_password')}
                hint="Minimum 8 characters, 1 uppercase, 1 number" />
              <Button type="submit" variant="primary" loading={pwLoading}>Update Password</Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ─── Profile Page ─────────────────────────────────────────────
export function ProfilePage() {
  const { user, updateUser } = useAuth();
  const [tab, setTab] = useState('profile');
  const [form, setForm] = useState({
    first_name: user?.first_name || '',
    last_name:  user?.last_name  || '',
  });
  const [passwords, setPasswords] = useState({ current_password: '', new_password: '' });
  const [saving,    setSaving]    = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  const isProfessor = user?.role === 'professor' || user?.role === 'department_head';
  const isStudent   = user?.role === 'student';

  // ── Professor state (hooks always called — gated inside loader) ──
  const [profLoading,    setProfLoading]    = useState(isProfessor);
  const [profError,      setProfError]      = useState(null);
  const [latestTerm,     setLatestTerm]     = useState(null);
  const [sections,       setSections]       = useState([]);
  const [instrTitle,     setInstrTitle]     = useState(null);
  const [instructor,     setInstructor]     = useState(null);
  const [assignedOffice, setAssignedOffice] = useState(null);
  const [officeHours,    setOfficeHours]    = useState([]);

  // ── Student state (hooks always called — gated inside loader) ──
  const [stuLoading,  setStuLoading]  = useState(isStudent);
  const [stuError,    setStuError]    = useState(null);
  const [stuTerm,     setStuTerm]     = useState(null);
  const [stuSections, setStuSections] = useState([]);
  const [stuGrades,   setStuGrades]   = useState([]);
  const [gpaData,     setGpaData]     = useState(null);

  // ── Shared handlers ───────────────────────────────────────────
  const set   = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const setPw = k => e => setPasswords(p => ({ ...p, [k]: e.target.value }));

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const { data } = await userAPI.updateMe(form);
      updateUser(data.data.user);
      toast.success('Profile updated');
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setSaving(false); }
  };

  const handleChangePassword = async e => {
    e.preventDefault();
    if (passwords.new_password.length < 8) { toast.error('Minimum 8 characters'); return; }
    setPwLoading(true);
    try {
      const { authAPI } = await import('../api/authAPI');
      await authAPI.changePassword(passwords);
      toast.success('Password updated. Please log in again.');
      setPasswords({ current_password: '', new_password: '' });
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setPwLoading(false); }
  };

  const handleAvatarUpload = async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const { data } = await userAPI.uploadAvatar(file);
      updateUser({ avatar_url: data.data.avatar_url });
      toast.success('Avatar updated');
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  // ── Professor loader ──────────────────────────────────────────
  const loadProfData = useCallback(async () => {
    if (!isProfessor) return;
    setProfLoading(true);
    setProfError(null);
    try {
      const termsRes = await professorAPI.getTerms();
      const terms = termsRes.data?.data?.terms || [];
      const latest = terms[0] || null;
      setLatestTerm(latest);

      const [dashS, officeS, instS] = await Promise.allSettled([
        latest
          ? professorAPI.getDashboard({ semester: latest.semester, academic_year: latest.academic_year })
          : Promise.resolve({ data: { data: { sections: [], instructor_title: null } } }),
        professorAPI.getOfficeHours(),
        instructorAPI.getAll({ search: user?.email, limit: 1, active_only: 'true' }),
      ]);

      if (dashS.status === 'fulfilled') {
        const d = dashS.value.data?.data || {};
        setSections(d.sections || []);
        setInstrTitle(d.instructor_title || null);
      }
      if (officeS.status === 'fulfilled') {
        const o = officeS.value.data?.data || {};
        setAssignedOffice(o.assigned_office || null);
        setOfficeHours(o.office_hours || []);
      }
      if (instS.status === 'fulfilled') {
        const rows = instS.value.data?.data?.instructors || [];
        setInstructor(rows[0] || null);
      }
    } catch (err) {
      setProfError(getErrorMessage(err));
    } finally {
      setProfLoading(false);
    }
  }, [isProfessor, user?.email]);

  useEffect(() => {
    if (isProfessor) loadProfData();
  }, [loadProfData, isProfessor]);

  // ── Student loader ────────────────────────────────────────────
  const loadStuData = useCallback(async () => {
    if (!isStudent) return;
    setStuLoading(true);
    setStuError(null);
    try {
      // Step 1: latest enrolled term (terms already sorted DESC)
      const termsRes = await scheduleAPI.getMyTerms();
      const terms = termsRes.data?.data?.terms || [];
      const latest = terms[0] || null;
      setStuTerm(latest);

      // Step 2: schedule, grades, and GPA — all independent failures
      const [schedS, gradesS, planS] = await Promise.allSettled([
        latest
          ? scheduleAPI.getMy({ semester: latest.semester, academic_year: latest.academic_year })
          : Promise.resolve({ data: { data: { sections: [] } } }),
        scheduleAPI.getGrades(),
        studentAPI.getStudyPlan(),
      ]);

      if (schedS.status === 'fulfilled') {
        setStuSections(schedS.value.data?.data?.sections || []);
      }
      if (gradesS.status === 'fulfilled') {
        // grades table entries — professor-entered per-course grades only, NOT GPA
        setStuGrades(gradesS.value.data?.data?.grades || []);
      }
      if (planS.status === 'fulfilled') {
        setGpaData(planS.value.data?.data?.gpa_summary || null);
      }
    } catch (err) {
      setStuError(getErrorMessage(err));
    } finally {
      setStuLoading(false);
    }
  }, [isStudent]);

  useEffect(() => {
    if (isStudent) loadStuData();
  }, [loadStuData, isStudent]);

  const ROLE_LABELS = {
    student:         'Student',
    professor:       'Professor',
    department_head: 'Department Head',
    super_admin:     'Admin',
    admin:           'Admin',
    lab_assistant:   'Lab Assistant',
    secretary:       'Secretary',
    dean:            'Dean',
  };

  // ── Admin / other roles: unchanged simple 600px layout ────────
  if (!isProfessor && !isStudent) {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <div className="page-header"><h1 className="page-title">My Profile</h1></div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 'var(--space-lg)', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--najah-light)', overflow: 'hidden', border: '2px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700, color: 'var(--najah-blue)' }}>
              {user?.avatar_url
                ? <img src={publicUrl(user.avatar_url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : `${user?.first_name?.[0] || ''}${user?.last_name?.[0] || ''}`
              }
            </div>
            <label style={{ position: 'absolute', bottom: 0, right: 0, width: 22, height: 22, background: 'var(--najah-blue)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 11, color: '#fff' }}>
              ✎ <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} />
            </label>
          </div>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600 }}>
              {user?.academic_title && `${user.academic_title} `}
              {user?.first_name} {user?.last_name}
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{user?.email}</p>
            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              <Badge variant="amber">{ROLE_LABELS[user?.role] || user?.role}</Badge>
              {user?.department && <Badge variant="gray">{user.department}</Badge>}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4, marginBottom: 'var(--space-lg)', borderBottom: '1px solid var(--border)' }}>
          {['profile', 'security'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '8px 16px', background: 'none', border: 'none',
              borderBottom: `2px solid ${tab === t ? 'var(--najah-blue)' : 'transparent'}`,
              color: tab === t ? 'var(--najah-blue)' : 'var(--text-muted)',
              fontWeight: tab === t ? 600 : 400, fontSize: 14, cursor: 'pointer',
            }}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {tab === 'profile' && (
          <div className="card">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
              <div className="form-row">
                <Input label="First name" required value={form.first_name} onChange={set('first_name')} />
                <Input label="Last name"  required value={form.last_name}  onChange={set('last_name')} />
              </div>
              <Input label="Email" value={user?.email || ''} disabled hint="Email cannot be changed" />
              <Button variant="primary" loading={saving} onClick={handleSaveProfile}>Save Changes</Button>
            </div>
          </div>
        )}

        {tab === 'security' && (
          <div className="card">
            <form onSubmit={handleChangePassword}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                <Input label="Current password" type="password" required
                  value={passwords.current_password} onChange={setPw('current_password')} />
                <Input label="New password" type="password" required
                  value={passwords.new_password} onChange={setPw('new_password')}
                  hint="Minimum 8 characters, 1 uppercase, 1 number" />
                <Button type="submit" variant="primary" loading={pwLoading}>Update Password</Button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  // ── Professor layout (unchanged) ──────────────────────────────
  if (isProfessor) {
    const totalSections = sections.length;
    const totalCourses  = new Set(sections.map(s => s.course_id).filter(Boolean)).size;
    const totalStudents = sections.reduce((acc, s) => acc + (parseInt(s.enrolled) || 0), 0);
    const roomsUsed     = new Set(sections.filter(s => s.room_number).map(s => s.room_number)).size;
    const nextClass     = getNextClass(sections);

    const title        = instrTitle || instructor?.title || user?.academic_title || '';
    const doctorNumber = instructor?.doctor_number ?? null;
    const department   = user?.department || instructor?.department || '';
    const roleLabel    = user?.role === 'department_head' ? 'Department Head' : 'Professor';

    const formProps = { tab, setTab, form, set, user, saving, handleSaveProfile, passwords, setPw, pwLoading, handleChangePassword };

    return (
      <div className="prof-profile">

        <div className="prof-hero card">
          <div className="prof-hero__avatar-wrap">
            <div className="prof-hero__avatar">
              {user?.avatar_url
                ? <img src={publicUrl(user.avatar_url)} alt="" />
                : `${user?.first_name?.[0] || ''}${user?.last_name?.[0] || ''}`
              }
            </div>
            <label className="prof-hero__avatar-edit" title="Change photo">
              ✎
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} />
            </label>
          </div>
          <div className="prof-hero__info">
            <h2 className="prof-hero__name">
              {title ? `${title} ` : ''}{user?.first_name} {user?.last_name}
            </h2>
            <p className="prof-hero__email">{user?.email}</p>
            <div className="prof-hero__badges">
              <Badge variant="amber">{roleLabel}</Badge>
              {department && <Badge variant="gray">{department}</Badge>}
              {doctorNumber != null && <Badge variant="blue">#{doctorNumber}</Badge>}
            </div>
          </div>
        </div>

        <div className="prof-body">
          <ProfileFormColumn {...formProps} />

          {profLoading ? (
            <div className="prof-right-loading">
              <Spinner />
              <span>Loading academic profile…</span>
            </div>
          ) : profError ? (
            <div className="prof-right">
              <div className="prof-card" style={{ textAlign: 'center', padding: '32px 24px' }}>
                <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 14 }}>{profError}</div>
                <button onClick={loadProfData} style={{ padding: '7px 20px', background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  Retry
                </button>
              </div>
            </div>
          ) : (
            <div className="prof-right">

              {/* Academic Information */}
              <div className="prof-card">
                <div className="prof-card__head">
                  <span className="prof-card__head-icon">🎓</span>
                  Academic Information
                </div>
                <div className="prof-fields">
                  {doctorNumber != null && (
                    <div>
                      <span className="prof-field__label">Doctor Number</span>
                      <span className="prof-field__value prof-field__value--mono">#{doctorNumber}</span>
                    </div>
                  )}
                  {title && (
                    <div>
                      <span className="prof-field__label">Title</span>
                      <span className="prof-field__value">{title}</span>
                    </div>
                  )}
                  {department && (
                    <div>
                      <span className="prof-field__label">Department</span>
                      <span className="prof-field__value">{department}</span>
                    </div>
                  )}
                  <div>
                    <span className="prof-field__label">Email</span>
                    <span className="prof-field__value" style={{ wordBreak: 'break-all' }}>{user?.email}</span>
                  </div>
                  <div>
                    <span className="prof-field__label">Role</span>
                    <span className="prof-field__value">{roleLabel}</span>
                  </div>
                </div>
              </div>

              {/* Assigned Office */}
              <div className="prof-card">
                <div className="prof-card__head">
                  <span className="prof-card__head-icon">🏢</span>
                  Assigned Office
                </div>
                {assignedOffice ? (
                  <>
                    <div className="prof-office__room-number">{assignedOffice.room_number || '—'}</div>
                    {assignedOffice.room_name && (
                      <div className="prof-office__room-name">{assignedOffice.room_name}</div>
                    )}
                    <Link to="/map" className="prof-map-btn">🗺️ Open Campus Map</Link>
                  </>
                ) : (
                  <div className="prof-office__warning">
                    <span className="prof-office__warning-icon">⚠️</span>
                    <span>No office assigned. Please contact admin.</span>
                  </div>
                )}
              </div>

              {/* Teaching Summary */}
              <div className="prof-card">
                <div className="prof-card__head">
                  <span className="prof-card__head-icon">📚</span>
                  Teaching Summary
                  {latestTerm && (
                    <span className="prof-term-pill prof-card__head-extra">{termLabel(latestTerm)}</span>
                  )}
                </div>
                {totalSections === 0 ? (
                  <p className="prof-empty">
                    No active sections for {latestTerm ? termLabel(latestTerm) : 'current term'}.
                  </p>
                ) : (
                  <>
                    <div className="prof-stats">
                      <div className="prof-stat">
                        <div className="prof-stat__label">Sections</div>
                        <div className="prof-stat__value">{totalSections}</div>
                      </div>
                      <div className="prof-stat">
                        <div className="prof-stat__label">Courses</div>
                        <div className="prof-stat__value">{totalCourses}</div>
                      </div>
                      <div className="prof-stat">
                        <div className="prof-stat__label">Students</div>
                        <div className="prof-stat__value">{totalStudents}</div>
                      </div>
                      <div className="prof-stat">
                        <div className="prof-stat__label">Rooms Used</div>
                        <div className="prof-stat__value">{roomsUsed}</div>
                      </div>
                    </div>
                    {nextClass && (
                      <div className="prof-next-class">
                        <div className="prof-next-class__label">Next Class</div>
                        <div className="prof-next-class__detail">
                          {nextClass.code} §{nextClass.section} · {PROF_DAYS[nextClass.day]} {formatTime(nextClass.startTime)}
                        </div>
                        {nextClass.room && (
                          <div className="prof-next-class__room">Room {nextClass.room}</div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Office Hours */}
              <div className="prof-card">
                <div className="prof-card__head">
                  <span className="prof-card__head-icon">🕐</span>
                  Office Hours
                </div>
                {officeHours.length === 0 ? (
                  <p className="prof-empty">No office hours scheduled.</p>
                ) : (
                  <>
                    <div className="prof-oh-slots">
                      {officeHours.slice(0, 3).map((oh, i) => (
                        <div key={oh.id || i} className="prof-oh-slot">
                          <span className="prof-oh-slot__day">{PROF_DAYS[oh.day_of_week]}</span>
                          <span className="prof-oh-slot__time">{formatTime(oh.start_time)} – {formatTime(oh.end_time)}</span>
                        </div>
                      ))}
                    </div>
                    {officeHours.length > 3 && (
                      <div className="prof-oh-more">
                        +{officeHours.length - 3} more slot{officeHours.length - 3 !== 1 ? 's' : ''}
                      </div>
                    )}
                  </>
                )}
                {assignedOffice?.room_number && (
                  <div className="prof-oh-location">
                    📍 Room {assignedOffice.room_number}{assignedOffice.room_name ? ` — ${assignedOffice.room_name}` : ''}
                  </div>
                )}
                <Link to="/professor/office-hours" className="prof-manage-btn">
                  Manage Office Hours →
                </Link>
              </div>

            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Student layout ────────────────────────────────────────────
  const stuCourseCount = stuSections.length;
  const stuCreditHours = stuSections.reduce((acc, s) => acc + (parseInt(s.credit_hours) || 0), 0);
  const stuDeprived    = stuSections.filter(s => !!s.deprivation_status).length;
  // stuGrades are professor-entered course grades — NOT GPA, NOT assessment averages
  const stuGradeCount  = stuGrades.length;
  const stuNextClass   = getNextClassForStudent(stuSections);

  const stuDept   = user?.department || '';
  const stuYear   = user?.year_of_study ? `Year ${user.year_of_study}` : '';
  const stuRegNo  = user?.student_id || '';

  const formProps = { tab, setTab, form, set, user, saving, handleSaveProfile, passwords, setPw, pwLoading, handleChangePassword };

  const quickActions = [
    { label: 'My Schedule',           icon: '📅', to: '/schedule'   },
    { label: 'Campus Map',            icon: '🗺️', to: '/map'        },
    { label: 'Course Materials',      icon: '📂', to: '/materials'  },
    { label: 'Assignments & Quizzes', icon: '✏️', to: '/assessments'},
  ];

  return (
    <div className="prof-profile">

      {/* ── Hero card ── */}
      <div className="prof-hero card">
        <div className="prof-hero__avatar-wrap">
          <div className="prof-hero__avatar">
            {user?.avatar_url
              ? <img src={publicUrl(user.avatar_url)} alt="" />
              : `${user?.first_name?.[0] || ''}${user?.last_name?.[0] || ''}`
            }
          </div>
          <label className="prof-hero__avatar-edit" title="Change photo">
            ✎
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} />
          </label>
        </div>

        <div className="prof-hero__info">
          <h2 className="prof-hero__name">
            {user?.first_name} {user?.last_name}
          </h2>
          <p className="prof-hero__email">{user?.email}</p>
          <div className="prof-hero__badges">
            <Badge variant="blue">Student</Badge>
            {stuRegNo  && <Badge variant="gray">{stuRegNo}</Badge>}
            {stuDept   && <Badge variant="gray">{stuDept}</Badge>}
            {stuYear   && <Badge variant="gray">{stuYear}</Badge>}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="prof-body">

        {/* Left: edit form (identical structure to professor) */}
        <ProfileFormColumn {...formProps} />

        {/* Right: info cards */}
        {stuLoading ? (
          <div className="prof-right-loading">
            <Spinner />
            <span>Loading academic profile…</span>
          </div>
        ) : stuError ? (
          <div className="prof-right">
            <div className="prof-card" style={{ textAlign: 'center', padding: '32px 24px' }}>
              <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 14 }}>{stuError}</div>
              <button onClick={loadStuData} style={{ padding: '7px 20px', background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                Retry
              </button>
            </div>
          </div>
        ) : (
          <div className="prof-right">

            {/* ── Academic Information ── */}
            <div className="prof-card">
              <div className="prof-card__head">
                <span className="prof-card__head-icon">🎓</span>
                Academic Information
              </div>
              <div className="prof-fields">
                {stuRegNo && (
                  <div>
                    <span className="prof-field__label">Registration No.</span>
                    <span className="prof-field__value prof-field__value--mono">{stuRegNo}</span>
                  </div>
                )}
                {stuDept && (
                  <div>
                    <span className="prof-field__label">Department</span>
                    <span className="prof-field__value">{stuDept}</span>
                  </div>
                )}
                {user?.year_of_study && (
                  <div>
                    <span className="prof-field__label">Year of Study</span>
                    <span className="prof-field__value">Year {user.year_of_study}</span>
                  </div>
                )}
                <div>
                  <span className="prof-field__label">Email</span>
                  <span className="prof-field__value" style={{ wordBreak: 'break-all' }}>{user?.email}</span>
                </div>
                <div>
                  <span className="prof-field__label">Role</span>
                  <span className="prof-field__value">Student</span>
                </div>
              </div>
            </div>

            {/* ── Academic Performance (GPA) ── */}
            <div className="prof-card">
              <div className="prof-card__head">
                <span className="prof-card__head-icon">📊</span>
                Academic Performance
              </div>
              {gpaData === null || (gpaData.cumulative_gpa === null || gpaData.cumulative_gpa === undefined) ? (
                <div className="prof-fields">
                  <div>
                    <span className="prof-field__label">Cumulative GPA</span>
                    <span className="prof-field__value" style={{ color: 'var(--text-muted)' }}>GPA not available yet</span>
                  </div>
                  <div>
                    <span className="prof-field__label">GPA Hours</span>
                    <span className="prof-field__value prof-field__value--mono">{gpaData?.gpa_hours ?? '—'}</span>
                  </div>
                  <div>
                    <span className="prof-field__label">Graded Courses</span>
                    <span className="prof-field__value prof-field__value--mono">{gpaData?.graded_courses_count ?? '—'}</span>
                  </div>
                </div>
              ) : (
                <div className="prof-fields">
                  <div>
                    <span className="prof-field__label">Cumulative GPA</span>
                    <div className="prof-gpa-display" style={{ marginBottom: 0 }}>
                      <span className={`prof-gpa__value prof-gpa__value--${
                        gpaData.cumulative_gpa >= 3.0 ? 'green' :
                        gpaData.cumulative_gpa >= 2.0 ? 'blue' : 'red'
                      }`}>
                        {gpaData.cumulative_gpa.toFixed(2)}
                      </span>
                      <span className="prof-gpa__scale">/ 4.00</span>
                    </div>
                  </div>
                  <div>
                    <span className="prof-field__label">GPA Hours</span>
                    <span className="prof-field__value prof-field__value--mono">{gpaData.gpa_hours ?? 0}</span>
                  </div>
                  <div>
                    <span className="prof-field__label">Graded Courses</span>
                    <span className="prof-field__value prof-field__value--mono">{gpaData.graded_courses_count ?? 0}</span>
                  </div>
                </div>
              )}
            </div>

            {/* ── Current Semester Summary ── */}
            <div className="prof-card">
              <div className="prof-card__head">
                <span className="prof-card__head-icon">📋</span>
                Current Semester
                {stuTerm && (
                  <span className="prof-term-pill prof-card__head-extra">{termLabel(stuTerm)}</span>
                )}
              </div>
              {stuCourseCount === 0 ? (
                <p className="prof-empty">
                  No enrollments found for {stuTerm ? termLabel(stuTerm) : 'current term'}.
                </p>
              ) : (
                <div className="prof-fields">
                  <div>
                    <span className="prof-field__label">Enrolled Courses</span>
                    <span className="prof-field__value prof-field__value--mono">{stuCourseCount}</span>
                  </div>
                  <div>
                    <span className="prof-field__label">Credit Hours</span>
                    <span className="prof-field__value prof-field__value--mono">{stuCreditHours}</span>
                  </div>
                  <div>
                    <span className="prof-field__label">Deprived Sections</span>
                    <span
                      className="prof-field__value prof-field__value--mono"
                      style={{ color: stuDeprived > 0 ? '#dc2626' : undefined }}
                    >
                      {stuDeprived}
                    </span>
                  </div>
                  <div>
                    {/* stuGradeCount = enrolled active sections across all active semesters (no term filter) */}
                    <span className="prof-field__label">Active Courses</span>
                    <span className="prof-field__value prof-field__value--mono">{stuGradeCount}</span>
                  </div>
                </div>
              )}
            </div>

            {/* ── Next Class ── */}
            <div className="prof-card">
              <div className="prof-card__head">
                <span className="prof-card__head-icon">🕐</span>
                Today / Next Class
              </div>
              {stuNextClass ? (
                <div className="prof-next-class" style={{ marginBottom: 14 }}>
                  <div className="prof-next-class__label">Next Class</div>
                  <div className="prof-next-class__detail">
                    {stuNextClass.code}
                    {stuNextClass.section != null ? ` §${stuNextClass.section}` : ''}
                    {' · '}
                    {PROF_DAYS[stuNextClass.day]}
                    {' '}
                    {formatTime(stuNextClass.startTime)}
                    {stuNextClass.endTime ? ` – ${formatTime(stuNextClass.endTime)}` : ''}
                  </div>
                  {stuNextClass.room && (
                    <div className="prof-next-class__room">Room {stuNextClass.room}</div>
                  )}
                  {stuNextClass.name && (
                    <div className="prof-next-class__room">{stuNextClass.name}</div>
                  )}
                </div>
              ) : (
                <p className="prof-empty" style={{ marginBottom: 14 }}>No upcoming classes found.</p>
              )}
              <Link to="/schedule" className="prof-manage-btn">
                View My Schedule →
              </Link>
            </div>

            {/* ── Quick Actions ── */}
            <div className="prof-card">
              <div className="prof-card__head">
                <span className="prof-card__head-icon">⚡</span>
                Quick Actions
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                {quickActions.map(({ label, icon, to }) => (
                  <Link
                    key={label}
                    to={to}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      padding: '14px 10px',
                      background: 'var(--surface-2, #f8f9fd)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--r-md, 8px)',
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--navy)',
                      textDecoration: 'none',
                      textAlign: 'center',
                      lineHeight: 1.35,
                      transition: 'background var(--t-fast, 120ms), box-shadow var(--t-fast, 120ms)',
                    }}
                  >
                    <span style={{ fontSize: 20 }}>{icon}</span>
                    {label}
                  </Link>
                ))}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

// ─── Announcements Page (unchanged) ──────────────────────────
export function AnnouncementsPage() {
  const { data, loading } = useAsync(() => announcementAPI.getAll({ limit: 20 }), []);
  const announcements = data?.announcements || [];

  return (
    <div style={{ maxWidth: 1150, margin: '0 auto', direction: 'rtl' }}>
      <div
        style={{
          background: '#123f78',
          color: '#fff',
          padding: '10px 16px',
          fontWeight: 700,
          textAlign: 'right',
          marginBottom: 0,
        }}
      >
        ◆ رسائل هامة
      </div>

      {loading ? (
        <Spinner center />
      ) : announcements.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #aaa', padding: 24 }}>
          <div style={{ textAlign: 'center', color: '#0033cc', fontWeight: 700 }}>
            لا توجد إعلانات حالياً
          </div>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #aaa' }}>
          {announcements.map(a => (
            <Link
              key={a.id}
              to={`/announcements/${a.id}`}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div
                style={{
                  padding: '18px 22px',
                  borderBottom: '1px solid #aaa',
                  textAlign: 'right',
                }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ color: 'red', fontSize: 16 }}>✉</span>
                  <span
                    style={{
                      color: '#0033cc',
                      fontWeight: 700,
                      textDecoration: 'underline',
                      fontSize: 16,
                    }}
                  >
                    {a.title}
                  </span>
                </div>

                <p
                  style={{
                    margin: '10px 26px 0 0',
                    color: '#0033cc',
                    fontWeight: 700,
                    lineHeight: 1.9,
                    fontSize: 16,
                    background: a.is_pinned ? 'yellow' : 'transparent',
                    display: a.is_pinned ? 'inline' : 'block',
                  }}
                >
                  {a.content}
                </p>

                <div style={{ fontSize: 11, color: '#555', marginTop: 10 }}>
                  {a.author_name && <span>{a.author_name} · </span>}
                  <span>{timeAgo(a.published_at)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

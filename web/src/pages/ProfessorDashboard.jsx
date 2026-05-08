import React, { useState, useEffect, useCallback } from 'react';
import axiosInstance from '../api/axiosInstance';
import { useAuth } from '../context/AuthContext';
import './ProfessorDashboard.css';

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hr = parseInt(h);
  return `${hr > 12 ? hr-12 : hr || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
}

// ── Stat Card ──────────────────────────────────────────────────
function StatCard({ icon, label, value, color }) {
  return (
    <div className={`prof-stat prof-stat--${color}`}>
      <div className="prof-stat__icon">{icon}</div>
      <div className="prof-stat__val">{value}</div>
      <div className="prof-stat__label">{label}</div>
    </div>
  );
}

// ── Attendance Badge ───────────────────────────────────────────
function AttBadge({ pct }) {
  if (pct === null || pct === undefined) return <span className="att-badge att-badge--none">No data</span>;
  const n = parseFloat(pct);
  const cls = n >= 75 ? 'good' : n >= 50 ? 'warn' : 'danger';
  return <span className={`att-badge att-badge--${cls}`}>{n}%</span>;
}

// ════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════
export default function ProfessorDashboard() {
  const { user } = useAuth();
  const [tab,       setTab]       = useState('overview');
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [toast,     setToast]     = useState(null);

  // Section-level state
  const [activeSection, setActiveSection] = useState(null);
  const [students,      setStudents]      = useState([]);
  const [attSummary,    setAttSummary]    = useState([]);
  const [loadingSec,    setLoadingSec]    = useState(false);

  // Attendance marking
  const [attDate,   setAttDate]   = useState(new Date().toISOString().split('T')[0]);
  const [attRecs,   setAttRecs]   = useState({});
  const [saving,    setSaving]    = useState(false);

  // Grades
  const [gradeEdit, setGradeEdit] = useState({});
  const [savingGrades, setSavingGrades] = useState(false);

  useEffect(() => {
    axiosInstance.get('/professor/dashboard')
      .then(r => setData(r.data.data))
      .catch(() => showToast('Failed to load dashboard', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const loadSection = useCallback(async (section) => {
    setActiveSection(section);
    setLoadingSec(true);
    setTab('students');
    try {
      const [studRes, attRes] = await Promise.all([
        axiosInstance.get(`/professor/sections/${section.id}/students`),
        axiosInstance.get(`/professor/sections/${section.id}/attendance/summary`),
      ]);
      const studs = studRes.data.data.students;
      setStudents(studs);
      setAttSummary(attRes.data.data.summary);
      // Init grade edit state
      const ge = {};
      studs.forEach(s => {
        ge[s.id] = {
  midterm: s.midterm || '',
  assignments: s.assignments || '',
  final: s.final || ''
};
      });
      setGradeEdit(ge);
      // Init attendance
      const ar = {};
      studs.forEach(s => { ar[s.id] = 'present'; });
      setAttRecs(ar);
    } catch { showToast('Failed to load section data', 'error'); }
    finally { setLoadingSec(false); }
  }, []);

  const markAttendance = async () => {
    if (!activeSection) return;
    setSaving(true);
    try {
      const records = Object.entries(attRecs).map(([sid, status]) => ({ student_id: sid, status }));
      await axiosInstance.post('/professor/attendance', {
        section_id: activeSection.id, lecture_date: attDate, records,
      });
      showToast(`✅ Attendance saved for ${records.length} students`);
      // Reload summary
      const r = await axiosInstance.get(`/professor/sections/${activeSection.id}/attendance/summary`);
      setAttSummary(r.data.data.summary);
    } catch { showToast('Failed to save attendance', 'error'); }
    finally { setSaving(false); }
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
practical: 0,
      }));
      await axiosInstance.post('/professor/grades/bulk', { section_id: activeSection.id, grades });
      showToast('✅ All grades saved');
      // Reload students
      const r = await axiosInstance.get(`/professor/sections/${activeSection.id}/students`);
      setStudents(r.data.data.students);
    } catch { showToast('Failed to save grades', 'error'); }
    finally { setSavingGrades(false); }
  };

  const sendWarning = async (student) => {
    if (!activeSection) return;
    try {
      await axiosInstance.post('/professor/warning', {
        student_id: student.id, section_id: activeSection.id,
      });
      showToast(`⚠️ Warning sent to ${student.first_name}`);
    } catch { showToast('Failed to send warning', 'error'); }
  };

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  if (loading) return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:300 }}>
      <div className="spinner"/>
    </div>
  );

  const stats = data?.stats || {};
  const todayName = DAYS[new Date().getDay()];

  return (
    <div className="prof-dash">

      {/* Toast */}
      {toast && (
        <div className={`prof-toast prof-toast--${toast.type}`}>{toast.msg}</div>
      )}

      {/* ── Header ─────────────────────────────────────────── */}
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
        <div className="prof-header__stats">
          <StatCard icon="📚" label="Courses"  value={stats.total_courses  || 0} color="blue"/>
          <StatCard icon="📋" label="Sections" value={stats.total_sections || 0} color="green"/>
          <StatCard icon="👥" label="Students" value={stats.total_students || 0} color="gold"/>
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────── */}
      <div className="prof-tabs">
        {[
          { id:'overview',    label:'📊 Overview' },
          { id:'students',    label:'👥 Students & Grades', disabled: !activeSection },
          { id:'attendance',  label:'✅ Attendance',        disabled: !activeSection },
          { id:'schedule',    label:'📅 My Schedule' },
        ].map(t => (
          <button key={t.id}
            className={`prof-tab ${tab===t.id?'prof-tab--active':''} ${t.disabled?'prof-tab--disabled':''}`}
            onClick={() => !t.disabled && setTab(t.id)}
            title={t.disabled ? 'Select a section first' : ''}
          >{t.label}</button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════
           TAB: OVERVIEW
          ══════════════════════════════════════════════════════ */}
      {tab === 'overview' && (
        <div className="prof-grid">

          {/* Today's classes */}
          <div className="card">
            <div className="prof-card-hdr">
              <h3>📅 Today — {todayName}</h3>
            </div>
            {(data?.today_schedule || []).length === 0 ? (
              <div className="empty-state">
                <div className="empty-state__icon">☀️</div>
                <p className="empty-state__title">No classes today</p>
              </div>
            ) : (data?.today_schedule || []).map(s => {
              const now = new Date().toTimeString().slice(0,5);
              const isNow = s.start_time?.slice(0,5) <= now && s.end_time?.slice(0,5) > now;
              return (
                <div key={s.id} className={`prof-sched-item ${isNow ? 'prof-sched-item--now' : ''}`}>
                  <div className="prof-sched-time">
                    {formatTime(s.start_time)}<br/>{formatTime(s.end_time)}
                  </div>
                  <div className="prof-sched-info">
                    <div className="prof-sched-course">{s.code} — {s.course_name}</div>
                    <div className="prof-sched-detail">
                      {s.room_number && `📍 Room ${s.room_number}  ·  `}
                      👥 {s.enrolled || 0} students  ·  §{s.section_number}
                    </div>
                  </div>
                  {isNow && <span className="prof-badge prof-badge--now">NOW</span>}
                </div>
              );
            })}
          </div>

          {/* Sections */}
          <div className="card">
            <div className="prof-card-hdr">
              <h3>📚 My Sections</h3>
              <span style={{fontSize:12,color:'var(--text-muted)'}}>Click to manage</span>
            </div>
            {(data?.sections || []).map(s => (
              <div key={s.id} className="prof-section-item"
                onClick={() => loadSection(s)}>
                <div className="prof-section-code">{s.code}</div>
                <div className="prof-section-info">
                  <div className="prof-section-name">{s.course_name}</div>
                  <div className="prof-section-meta">
                    §{s.section_number} · {(s.day_of_week||[]).map(d=>DAY_SHORT[d]).join(', ')} · {formatTime(s.start_time)}
                    {s.room_number && ` · Room ${s.room_number}`}
                  </div>
                </div>
                <div className="prof-section-count">
                  <span>{s.enrolled || 0}</span>
                  <small>students</small>
                </div>
                <span className="prof-section-arrow">→</span>
              </div>
            ))}
            {(data?.sections || []).length === 0 && (
              <div className="empty-state">
                <p className="empty-state__title">No sections assigned</p>
              </div>
            )}
          </div>

          {/* At-risk students */}
          {(data?.at_risk || []).length > 0 && (
            <div className="card" style={{gridColumn:'span 2'}}>
              <div className="prof-card-hdr">
                <h3>⚠️ At-Risk Students <span style={{color:'var(--red)',fontWeight:400,fontSize:13}}>Attendance below 75%</span></h3>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr>
                    <th>Student</th><th>Course</th><th>Attendance</th><th>Action</th>
                  </tr></thead>
                  <tbody>
                    {data.at_risk.map(s => (
                      <tr key={`${s.id}-${s.section_id}`}>
                        <td>
                          <div style={{fontWeight:600}}>{s.first_name} {s.last_name}</div>
                          <div style={{fontSize:11,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>{s.student_id}</div>
                        </td>
                        <td><span className="badge badge--blue">{s.course_code}</span></td>
                        <td><AttBadge pct={s.attendance_pct}/></td>
                        <td>
                          <button className="btn btn--sm" style={{background:'#fde8e8',color:'#dc2626',border:'1px solid #fca5a5'}}
                            onClick={async () => {
                              try {
                                await axiosInstance.post('/professor/warning', { student_id:s.id, section_id:s.section_id });
                                showToast(`⚠️ Warning sent to ${s.first_name}`);
                              } catch { showToast('Failed to send warning','error'); }
                            }}>
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

      {/* ══════════════════════════════════════════════════════
           TAB: STUDENTS & GRADES
          ══════════════════════════════════════════════════════ */}
      {tab === 'students' && activeSection && (
        <div>
          <div className="prof-section-banner">
            <div>
              <span className="prof-section-banner__code">{activeSection.code}</span>
              <span className="prof-section-banner__name">{activeSection.course_name}</span>
              <span className="prof-section-banner__meta">Section {activeSection.section_number} · {activeSection.enrolled || 0} students</span>
            </div>
            <button className="btn btn--secondary btn--sm" onClick={()=>setTab('overview')}>← Back</button>
          </div>

          {loadingSec ? <div style={{textAlign:'center',padding:40}}><div className="spinner"/></div> : (
            <>
              <div className="card" style={{marginTop:16}}>
                <div className="prof-card-hdr">
                  <h3>👥 Students & Grades</h3>
                  <button className="btn btn--primary btn--sm"
                    onClick={saveAllGrades} disabled={savingGrades}>
                    {savingGrades ? 'Saving...' : '💾 Save All Grades'}
                  </button>
                </div>
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr>
                      <th>Student</th>
<th style={{textAlign:'center'}}>Midterm<br/><small style={{fontWeight:400,opacity:.7}}>/30</small></th>
<th style={{textAlign:'center'}}>Quizzes & Assign.<br/><small style={{fontWeight:400,opacity:.7}}>/20</small></th>
<th style={{textAlign:'center'}}>Final<br/><small style={{fontWeight:400,opacity:.7}}>/50</small></th>
<th style={{textAlign:'center'}}>Grade</th>
<th>Actions</th>
                    </tr></thead>
                    <tbody>
                      {students.map(s => {
                        const att = attSummary.find(a => a.id === s.id);
                        const ge  = gradeEdit[s.id] || {};
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
  total >= 75 ? 'C+' :
  total >= 70 ? 'C' :
  total >= 66 ? 'C-' :
  total >= 63 ? 'D+' :
  total >= 60 ? 'D' :
  total >= 45 ? 'D-' :
  total > 0 ? 'E' : '—';
                        return (
<tr key={s.id}>
  <td>
    <div style={{fontWeight:600}}>{s.first_name} {s.last_name}</div>
    <div style={{fontSize:11,fontFamily:'var(--font-mono)',color:'var(--text-muted)'}}>
      {s.student_id}
    </div>
  </td>

  {[
    { field: 'midterm', max: 30 },
    { field: 'assignments', max: 20 },
    { field: 'final', max: 50 }
  ].map(({ field, max }) => (
  <td key={field} style={{textAlign:'center'}}>
<input
  type="number"
  min="0"
  max={max}
  className="prof-grade-input"
  value={ge[field] || ''}
  onChange={(e) => {
    let value = e.target.value;

    if (value !== '') {
      value = Math.max(0, Math.min(Number(value), max));
    }

    setGradeEdit(prev => ({
      ...prev,
      [s.id]: {
        ...prev[s.id],
        [field]: value
      }
    }));
  }}
  placeholder="—"
/>
  </td>
))}
                            <td style={{textAlign:'center'}}>
                              <span className={`prof-grade-badge prof-grade-badge--${lg==='F'?'f':lg.includes('+')||lg==='A'?'a':lg.includes('B')?'b':lg.includes('C')?'c':'d'}`}>
                                {lg}
                              </span>
                            </td>
                            <td>
                              {att?.attendance_pct < 75 && (
                                <button className="btn btn--sm" title="Send attendance warning"
                                  style={{background:'#fde8e8',color:'#dc2626',border:'1px solid #fca5a5',fontSize:11}}
                                  onClick={() => sendWarning(s)}>
                                  ⚠️ Warn
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
           TAB: ATTENDANCE
          ══════════════════════════════════════════════════════ */}
      {tab === 'attendance' && activeSection && (
        <div>
          <div className="prof-section-banner">
            <div>
              <span className="prof-section-banner__code">{activeSection.code}</span>
              <span className="prof-section-banner__name">{activeSection.course_name}</span>
            </div>
            <button className="btn btn--secondary btn--sm" onClick={()=>setTab('overview')}>← Back</button>
          </div>

          {loadingSec ? <div style={{textAlign:'center',padding:40}}><div className="spinner"/></div> : (
            <div style={{display:'grid',gap:20,marginTop:16}}>

              {/* Mark attendance */}
              <div className="card">
                <div className="prof-card-hdr">
                  <h3>✅ Mark Attendance</h3>
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    <input type="date" className="form-input" style={{width:160,padding:'6px 10px',fontSize:13}}
                      value={attDate} onChange={e=>setAttDate(e.target.value)}/>
                    <button className="btn btn--primary btn--sm"
                      onClick={markAttendance} disabled={saving}>
                      {saving ? 'Saving...' : '💾 Save Attendance'}
                    </button>
                  </div>
                </div>

                {/* Quick mark all buttons */}
                <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}}>
                  <span style={{fontSize:12,color:'var(--text-muted)',alignSelf:'center'}}>Mark all as:</span>
                  {['present','absent','late','excused'].map(s => (
                    <button key={s} className="btn btn--sm btn--secondary"
                      onClick={() => {
                        const updated = {};
                        students.forEach(st => { updated[st.id] = s; });
                        setAttRecs(updated);
                      }}
                      style={{textTransform:'capitalize'}}>
                      {s === 'present' ? '🟢' : s === 'absent' ? '🔴' : s === 'late' ? '🟡' : '🔵'} {s}
                    </button>
                  ))}
                </div>

                <div className="table-wrap">
                  <table className="table">
                    <thead><tr>
                      <th>#</th><th>Student</th><th>Student ID</th>
                      <th style={{textAlign:'center'}}>Status</th>
                      <th style={{textAlign:'center'}}>Overall Att.</th>
                    </tr></thead>
                    <tbody>
                      {students.map((s, idx) => {
                        const att = attSummary.find(a => a.id === s.id);
                        const cur = attRecs[s.id] || 'present';
                        return (
                          <tr key={s.id}>
                            <td style={{color:'var(--text-muted)',fontSize:12}}>{idx+1}</td>
                            <td style={{fontWeight:600}}>{s.first_name} {s.last_name}</td>
                            <td style={{fontFamily:'var(--font-mono)',fontSize:12}}>{s.student_id}</td>
                            <td>
                              <div className="prof-att-btns">
                                {['present','absent','late','excused'].map(opt => (
                                  <button key={opt}
                                    className={`prof-att-btn prof-att-btn--${opt} ${cur===opt?'prof-att-btn--active':''}`}
                                    onClick={() => setAttRecs(prev => ({ ...prev, [s.id]: opt }))}>
                                    {opt === 'present' ? '✓' : opt === 'absent' ? '✗' : opt === 'late' ? '⏰' : '📝'}
                                  </button>
                                ))}
                              </div>
                            </td>
                            <td style={{textAlign:'center'}}><AttBadge pct={att?.attendance_pct}/></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Attendance Summary */}
              <div className="card">
                <div className="prof-card-hdr"><h3>📊 Attendance Summary</h3></div>
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr>
                      <th>Student</th>
                      <th style={{textAlign:'center'}}>Present</th>
                      <th style={{textAlign:'center'}}>Absent</th>
                      <th style={{textAlign:'center'}}>Late</th>
                      <th style={{textAlign:'center'}}>Total</th>
                      <th style={{textAlign:'center'}}>Attendance %</th>
                      <th>Action</th>
                    </tr></thead>
                    <tbody>
                      {attSummary.map(s => (
                        <tr key={s.id}>
                          <td>
                            <div style={{fontWeight:600}}>{s.first_name} {s.last_name}</div>
                            <div style={{fontSize:11,fontFamily:'var(--font-mono)',color:'var(--text-muted)'}}>{s.student_number}</div>
                          </td>
                          <td style={{textAlign:'center'}}><span className="badge badge--green">{s.present || 0}</span></td>
                          <td style={{textAlign:'center'}}><span className="badge badge--red">{s.absent || 0}</span></td>
                          <td style={{textAlign:'center'}}><span className="badge badge--amber">{s.late || 0}</span></td>
                          <td style={{textAlign:'center'}}>{s.total || 0}</td>
                          <td style={{textAlign:'center'}}><AttBadge pct={s.attendance_pct}/></td>
                          <td>
                            {parseFloat(s.attendance_pct) < 75 && s.total > 0 && (
                              <button className="btn btn--sm"
                                style={{background:'#fde8e8',color:'#dc2626',border:'1px solid #fca5a5',fontSize:11}}
                                onClick={() => sendWarning(s)}>
                                ⚠️ Warn
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {attSummary.length === 0 && (
                        <tr><td colSpan={7} style={{textAlign:'center',color:'var(--text-muted)',padding:24}}>
                          No attendance records yet. Start marking attendance above.
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
           TAB: SCHEDULE
          ══════════════════════════════════════════════════════ */}
      {tab === 'schedule' && (
        <div className="card">
          <div className="prof-card-hdr"><h3>📅 Weekly Schedule</h3></div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr>
                <th>Course</th><th>Section</th><th>Days</th><th>Time</th>
                <th>Room</th><th>Students</th><th>Action</th>
              </tr></thead>
              <tbody>
                {(data?.sections || []).map(s => (
                  <tr key={s.id}>
                    <td>
                      <span className="badge badge--blue">{s.code}</span>
                      <div style={{fontSize:12,marginTop:3}}>{s.course_name}</div>
                    </td>
                    <td style={{textAlign:'center'}}>§{s.section_number}</td>
                    <td style={{fontSize:12}}>{(s.day_of_week||[]).map(d=>DAY_SHORT[d]).join(', ')}</td>
                    <td style={{fontFamily:'var(--font-mono)',fontSize:12}}>
                      {formatTime(s.start_time)} – {formatTime(s.end_time)}
                    </td>
                    <td>{s.room_number ? `Room ${s.room_number}` : '—'}</td>
                    <td style={{textAlign:'center'}}><span className="badge badge--green">{s.enrolled || 0}</span></td>
                    <td>
                      <button className="btn btn--sm btn--primary" onClick={() => loadSection(s)}>
                        Manage →
                      </button>
                    </td>
                  </tr>
                ))}
                {(data?.sections || []).length === 0 && (
                  <tr><td colSpan={7} style={{textAlign:'center',color:'var(--text-muted)',padding:24}}>
                    No sections assigned yet.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

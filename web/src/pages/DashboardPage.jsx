import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTodaySchedule, useNotifications, useAsync } from '../hooks/index';
import { announcementAPI, studentAPI, scheduleAPI } from '../api/index';
import { Spinner, Badge } from '../components/ui/index';
import { formatTime, timeAgo } from '../utils/helpers';
import './Dashboard.css';

export default function DashboardPage() {
  const { user } = useAuth();
  const isProfessor = ['professor', 'department_head', 'dean'].includes(user?.role);
  const isStudent   = user?.role === 'student';

  const { data: todayData,     loading: schedLoading } = useTodaySchedule();
  const { notifications, unreadCount, loading: notifLoading } = useNotifications();
  const { data: annData,       loading: annLoading }   = useAsync(() => announcementAPI.getAll({ limit: 4 }), []);

  // Student-only fetches — professors get Promise.resolve(null) to avoid unnecessary API calls
  const { data: studyPlanData, loading: spLoading }  = useAsync(
    isStudent ? () => studentAPI.getStudyPlan()              : () => Promise.resolve(null),
    [isStudent]
  );
  const { data: semestersData, loading: semLoading } = useAsync(
    isStudent ? () => scheduleAPI.getPublishedSemesters()    : () => Promise.resolve(null),
    [isStudent]
  );

  const sections    = todayData?.sections || [];
  const current     = sections.find(s => s.is_current);
  const nextSection = sections.find(s => !s.is_current && !s.is_past);
  const today       = new Date();

  // GPA & study plan derived state
  const gpa         = studyPlanData?.gpa_summary;
  const planSummary = studyPlanData?.summary;

  // Registration derived state
  const activeSemester = semestersData?.semesters?.[0];
  const regStatus      = getRegStatus(activeSemester);

  // Stats — Department & Year only for students
  const STATS = [
    { label: 'Classes Today', value: sections.length,  icon: '📅', color: 'blue',  isNum: true  },
    { label: 'Unread Alerts', value: unreadCount,       icon: '🔔', color: 'red',   isNum: true  },
    ...(isStudent ? [
      { label: 'Department',    value: user?.department?.split(' ').slice(0, 2).join(' ') || '—', icon: '🏛',  color: 'gold',  isNum: false },
      { label: 'Year of Study', value: user?.year_of_study ? `Year ${user.year_of_study}` : '—', icon: '🎓', color: 'green', isNum: false },
    ] : []),
  ];

  const QUICK_LINKS = isProfessor ? [
    { to: '/professor/schedule',   label: 'My Schedule',       emoji: '📅' },
    { to: '/professor/students',   label: 'Students & Grades', emoji: '👥' },
    { to: '/professor/attendance', label: 'Attendance',        emoji: '✅' },
    { to: '/professor/analytics',  label: 'Analytics',         emoji: '📊' },
    { to: '/professor/materials',  label: 'Course Materials',  emoji: '📚' },
    { to: '/announcements',        label: 'Announcements',     emoji: '📢' },
  ] : [
    { to: '/map',                                label: 'Campus Map',          emoji: '🗺️' },
    { to: '/schedule',                           label: 'My Schedule',         emoji: '📅' },
    { to: '/registration-summary',               label: 'Reg. Summary',        emoji: '🧾' },
    isStudent && { to: '/study-plan',            label: 'Study Plan',          emoji: '🎓' },
    isStudent && { to: '/course-registration',   label: 'Course Registration', emoji: '📋' },
    { to: '/notifications',                      label: 'Notifications',       emoji: '🔔' },
  ].filter(Boolean);

  return (
    <div className="dashboard">

      {/* ── 1. Welcome banner ──────────────────────────────────── */}
      <div className="dashboard__welcome">
        <div>
          <div className="dashboard__welcome-badge">
            ✪ An-Najah National University
          </div>
          <h1 className="dashboard__greeting">
            Good {getGreeting()}, {user?.first_name}!
          </h1>
          <p className="dashboard__date">
            {today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        {!isProfessor && (
          <Link to="/map" className="btn btn--gold btn--lg">
            🗺️ Open Campus Map
          </Link>
        )}
      </div>

      {/* ── 2. Current class banner ────────────────────────────── */}
      {current && (
        <div className="dashboard__current-class">
          <div className="dashboard__current-badge">🔴 NOW IN SESSION</div>
          <div className="dashboard__current-info">
            <h3>{current.course_name} — {current.course_code}</h3>
            <p>{current.instructor_name || ''} · {formatTime(current.start_time)} – {formatTime(current.end_time)}</p>
          </div>
          {current.room_number && (
            <Link to="/map" state={{ roomId: current.room_id }}
              className="btn btn--secondary btn--sm"
              style={{ background: 'rgba(255,255,255,.15)', color: '#fff', borderColor: 'rgba(255,255,255,.3)' }}>
              📍 Room {current.room_number} — {current.building_code}
            </Link>
          )}
        </div>
      )}

      {/* ── 3. Stat cards ──────────────────────────────────────── */}
      <div className="dashboard__stats">
        {STATS.map(s => (
          <div key={s.label} className={`stat-card stat-card--${s.color}`}>
            <div className="stat-card__icon">{s.icon}</div>
            <div className="stat-card__label">{s.label}</div>
            <div className={`stat-card__value ${!s.isNum ? 'stat-card__value--text' : ''}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── 4. Student-only tri-grid: GPA · Registration · Next ── */}
      {isStudent && (
        <div className="dashboard__tri-grid">

          {/* GPA & Study Plan */}
          <div className="card">
            <div className="dashboard__card-header">
              <h2 className="dashboard__card-title">🎓 GPA & Study Plan</h2>
              <Link to="/study-plan" className="dashboard__card-link">View plan →</Link>
            </div>
            {spLoading ? <Spinner center /> : (
              <div className="dash-gpa-body">
                <div className="dash-gpa-main">
                  <span className="dash-gpa-value">
                    {gpa?.cumulative_gpa != null ? Number(gpa.cumulative_gpa).toFixed(2) : '—'}
                  </span>
                  <span className="dash-gpa-out-of">/ 4.00 cumulative GPA</span>
                </div>
                {planSummary && (
                  <div className="dash-gpa-credits">
                    <div className="dash-gpa-credit-item">
                      <span className="dash-gpa-credit-value">{planSummary.completed_credit_hours ?? 0}</span>
                      <span className="dash-gpa-credit-label">Completed hrs</span>
                    </div>
                    <div className="dash-gpa-credit-divider" />
                    <div className="dash-gpa-credit-item">
                      <span className="dash-gpa-credit-value">{planSummary.in_progress_credit_hours ?? 0}</span>
                      <span className="dash-gpa-credit-label">In progress hrs</span>
                    </div>
                  </div>
                )}
                {gpa?.cumulative_gpa == null && (
                  <p className="dash-gpa-empty">No grades recorded yet.</p>
                )}
              </div>
            )}
          </div>

          {/* Registration Status */}
          <div className="card">
            <div className="dashboard__card-header">
              <h2 className="dashboard__card-title">📋 Registration</h2>
              <Link to="/course-registration" className="dashboard__card-link">Open →</Link>
            </div>
            {semLoading ? <Spinner center /> : !activeSemester ? (
              <div className="empty-state">
                <div className="empty-state__icon">📭</div>
                <p className="empty-state__title">No active semester</p>
              </div>
            ) : (
              <div className="dash-reg-body">
                <p className="dash-reg-semester">
                  {activeSemester.label || `${activeSemester.semester} ${activeSemester.academic_year}`}
                </p>
                <span className={`dash-reg-status dash-reg-status--${regStatus}`}>
                  {regStatus === 'open'   ? '✅ Open for Registration' :
                   regStatus === 'closed' ? '🔒 Registration Closed'   :
                   regStatus === 'soon'   ? '⏳ Opening Soon'           : '— Status Unknown'}
                </span>
                <div className="dash-reg-dates">
                  {activeSemester.registration_start && (
                    <div className="dash-reg-date-row">
                      <span className="dash-reg-date-label">Opens</span>
                      <span className="dash-reg-date-value">{formatShortDate(activeSemester.registration_start)}</span>
                    </div>
                  )}
                  {activeSemester.registration_end && (
                    <div className="dash-reg-date-row">
                      <span className="dash-reg-date-label">Closes</span>
                      <span className="dash-reg-date-value">{formatShortDate(activeSemester.registration_end)}</span>
                    </div>
                  )}
                  {activeSemester.drop_deadline && (
                    <div className="dash-reg-date-row">
                      <span className="dash-reg-date-label">Drop by</span>
                      <span className="dash-reg-date-value">{formatShortDate(activeSemester.drop_deadline)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Next Class */}
          <div className="card">
            <div className="dashboard__card-header">
              <h2 className="dashboard__card-title">⏭ Next Class</h2>
            </div>
            {schedLoading ? <Spinner center /> : !nextSection ? (
              <div className="empty-state">
                <div className="empty-state__icon">☀️</div>
                <p className="empty-state__title">No more classes today</p>
              </div>
            ) : (
              <div className="dash-next-body">
                {getCountdown(nextSection.start_time) && (
                  <span className="dash-next-countdown">{getCountdown(nextSection.start_time)}</span>
                )}
                <div className="dash-next-course">
                  <span className="dash-next-code">{nextSection.course_code}</span>
                  <span className="dash-next-name">{nextSection.course_name}</span>
                </div>
                <div className="dash-next-time">
                  {formatTime(nextSection.start_time)} – {formatTime(nextSection.end_time)}
                </div>
                {nextSection.room_number && (
                  <Link to="/map" state={{ roomId: nextSection.room_id }} className="dash-next-room">
                    📍 Room {nextSection.room_number}
                    {nextSection.building_code && ` — ${nextSection.building_code}`}
                  </Link>
                )}
                {nextSection.instructor_name && (
                  <div className="dash-next-instructor">{nextSection.instructor_name}</div>
                )}
              </div>
            )}
          </div>

        </div>
      )}

      {/* ── 5. Main 2-col: Today's Classes + Announcements ─────── */}
      <div className="dashboard__grid">

        {/* Today's schedule — with "Next" badge on first upcoming */}
        <div className="card">
          <div className="dashboard__card-header">
            <h2 className="dashboard__card-title">📅 Today's Classes</h2>
            <Link to="/schedule" className="dashboard__card-link">View all →</Link>
          </div>
          {schedLoading ? <Spinner center /> : sections.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state__icon">☀️</div>
              <p className="empty-state__title">No classes today</p>
              <p className="empty-state__sub">Enjoy your free day!</p>
            </div>
          ) : (
            <div className="dashboard__schedule-list">
              {sections.map(sec => (
                <div key={sec.section_id}
                  className={`dash-class-item ${sec.is_current ? 'dash-class-item--active' : sec.is_past ? 'dash-class-item--past' : ''}`}>
                  <div className="dash-class-item__time">
                    <span>{formatTime(sec.start_time)}</span>
                    <span>{formatTime(sec.end_time)}</span>
                  </div>
                  <div className="dash-class-item__info">
                    <span className="dash-class-item__name">{sec.course_code}</span>
                    <span className="dash-class-item__sub">{sec.course_name}</span>
                    {sec.room_number && (
                      <Link to="/map" state={{ roomId: sec.room_id }} className="dash-class-item__room">
                        📍 Room {sec.room_number}
                      </Link>
                    )}
                  </div>
                  {sec.is_current                                  && <Badge variant="green">Now</Badge>}
                  {sec.is_past                                     && <Badge variant="gray">Done</Badge>}
                  {!sec.is_current && !sec.is_past && sec === nextSection && <Badge variant="blue">Next</Badge>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Announcements — najah style, unchanged */}
        <div className="card najah-ann-card" dir="rtl">
          <div className="najah-ann-header">
            <span>◆ رسائل هامة</span>
            <Link to="/announcements" className="najah-ann-see-all">
              عرض الكل
            </Link>
          </div>
          {annLoading ? (
            <Spinner center />
          ) : (
            <div className="najah-ann-list">
              {(annData?.announcements || []).map(a => (
                <Link
                  key={a.id}
                  to={`/announcements/${a.id}`}
                  className={`najah-ann-item ${a.is_pinned ? 'najah-ann-item--pinned' : ''}`}
                >
                  <span className="najah-ann-icon">✉</span>
                  <div className="najah-ann-content">
                    <h3>{a.title}</h3>
                    <p>{a.content}</p>
                    <small>{timeAgo(a.published_at)}</small>
                  </div>
                </Link>
              ))}
              {(!annData?.announcements?.length) && (
                <div className="empty-state" style={{ padding: 'var(--space-xl)' }}>
                  <p className="empty-state__title">لا توجد إعلانات</p>
                </div>
              )}
            </div>
          )}
        </div>

      </div>

      {/* ── 6. Notifications + Quick Access ────────────────────── */}
      <div className="dashboard__grid">

        {/* Notifications card */}
        <div className="card">
          <div className="dashboard__card-header">
            <h2 className="dashboard__card-title">
              🔔 Notifications
              {unreadCount > 0 && (
                <span className="dashboard__unread-badge">{unreadCount}</span>
              )}
            </h2>
            <Link to="/notifications" className="dashboard__card-link">View all →</Link>
          </div>
          {notifLoading ? <Spinner center /> : notifications.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state__icon">🔔</div>
              <p className="empty-state__title">All caught up</p>
              <p className="empty-state__sub">No notifications yet.</p>
            </div>
          ) : (
            <div className="dashboard__notif-list">
              {notifications.slice(0, 5).map(n => (
                <div key={n.id}
                  className={`dash-notif-item ${!n.is_read ? 'dash-notif-item--unread' : ''}`}>
                  <div className="dash-notif-item__title">{n.title}</div>
                  {n.body && <div className="dash-notif-item__body">{n.body}</div>}
                  <div className="dash-notif-item__time">{timeAgo(n.created_at || n.published_at)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Access — expanded to up to 6 links */}
        <div className="card">
          <h2 className="dashboard__card-title" style={{ marginBottom: 'var(--space-lg)' }}>⚡ Quick Access</h2>
          <div className="dashboard__quick-links">
            {QUICK_LINKS.map(l => (
              <Link key={`${l.to}__${l.label}`} to={l.to} className="dashboard__quick-item">
                <span className="dashboard__quick-emoji">{l.emoji}</span>
                <span>{l.label}</span>
              </Link>
            ))}
          </div>
        </div>

      </div>

    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

function getRegStatus(sem) {
  if (!sem) return null;
  const now = new Date();
  if (sem.registration_start && now < new Date(sem.registration_start)) return 'soon';
  if (sem.registration_end   && now > new Date(sem.registration_end))   return 'closed';
  return 'open';
}

function formatShortDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getCountdown(startTime) {
  if (!startTime) return null;
  const [h, m] = startTime.split(':').map(Number);
  const now = new Date();
  const classStart = new Date(now);
  classStart.setHours(h, m, 0, 0);
  const diffMs = classStart - now;
  if (diffMs <= 0) return null;
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 60) return `In ${diffMin} min`;
  const hrs  = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  return mins > 0 ? `In ${hrs}h ${mins}m` : `In ${hrs}h`;
}

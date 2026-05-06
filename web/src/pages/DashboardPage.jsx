import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTodaySchedule, useNotifications, useAsync } from '../hooks/index';
import { announcementAPI } from '../api/index';
import { Spinner, Badge } from '../components/ui/index';
import { formatTime, timeAgo } from '../utils/helpers';
import './Dashboard.css';

export default function DashboardPage() {
  const { user } = useAuth();
  const isProfessor = ['professor','department_head','dean'].includes(user?.role);
  const isStudent   = user?.role === 'student';

  const { data: todayData, loading: schedLoading } = useTodaySchedule();
  const { notifications, unreadCount, loading: notifLoading } = useNotifications();
  const { data: annData, loading: annLoading } = useAsync(() => announcementAPI.getAll({ limit: 4 }), []);

  const sections = todayData?.sections || [];
  const current  = sections.find(s => s.is_current);
  const today    = new Date();

  // Stats — show Department & Year only for students
  const STATS = [
    { label:'Classes Today', value: sections.length, icon:'📅', color:'blue',  isNum: true  },
    { label:'Unread Alerts', value: unreadCount,     icon:'🔔', color:'red',   isNum: true  },
    ...(isStudent ? [
      { label:'Department',   value: user?.department?.split(' ').slice(0,2).join(' ') || '—', icon:'🏛', color:'gold',  isNum: false },
      { label:'Year of Study',value: user?.year_of_study ? `Year ${user.year_of_study}` : '—', icon:'🎓', color:'green', isNum: false },
    ] : []),
  ];

  // Quick Access — no Notifications for anyone, no Campus Map for professors
  const QUICK_LINKS = [
    !isProfessor && { to:'/map',      label:'Campus Map',  emoji:'🗺️' },
    { to:'/schedule',                 label:'My Schedule', emoji:'📅' },
    { to:'/search',                   label:'Find a Room', emoji:'🔍' },
  ].filter(Boolean);

  return (
    <div className="dashboard">
      {/* Welcome banner */}
      <div className="dashboard__welcome">
        <div>
          <div className="dashboard__welcome-badge">
            ✪ An-Najah National University
          </div>
          <h1 className="dashboard__greeting">
            Good {getGreeting()}, {user?.first_name}!
          </h1>
          <p className="dashboard__date">
            {today.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}
          </p>
        </div>
        {!isProfessor && (
          <Link to="/map" className="btn btn--gold btn--lg">
            🗺️ Open Campus Map
          </Link>
        )}
      </div>

      {/* Current class */}
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
              style={{ background:'rgba(255,255,255,.15)', color:'#fff', borderColor:'rgba(255,255,255,.3)' }}>
              📍 Room {current.room_number} — {current.building_code}
            </Link>
          )}
        </div>
      )}

      {/* Stat cards */}
      <div className="dashboard__stats">
        {STATS.map(s => (
          <div key={s.label} className={`stat-card stat-card--${s.color}`}>
            <div className="stat-card__icon">{s.icon}</div>
            <div className="stat-card__label">{s.label}</div>
            <div className={`stat-card__value ${!s.isNum ? 'stat-card__value--text' : ''}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div className="dashboard__grid">

        {/* Today's schedule */}
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
                  {sec.is_current && <Badge variant="green">Now</Badge>}
                  {sec.is_past    && <Badge variant="gray">Done</Badge>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Announcements */}
        <div className="card">
          <div className="dashboard__card-header">
            <h2 className="dashboard__card-title">📢 Announcements</h2>
            <Link to="/announcements" className="dashboard__card-link">See all →</Link>
          </div>
          {annLoading ? <Spinner center /> : (
            <div className="dashboard__announce-list">
              {(annData?.announcements || []).map(a => (
                <Link key={a.id} to={`/announcements/${a.id}`} className="dash-announce-item">
                  {a.is_pinned && <span>📌</span>}
                  <div>
                    <div className="dash-announce-item__title">{a.title}</div>
                    <div className="dash-announce-item__time">{timeAgo(a.published_at)}</div>
                  </div>
                </Link>
              ))}
              {(!annData?.announcements?.length) && (
                <div className="empty-state" style={{ padding:'var(--space-xl)' }}>
                  <p className="empty-state__title">No announcements</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quick Access */}
        <div className="card">
          <h2 className="dashboard__card-title" style={{ marginBottom:'var(--space-lg)' }}>⚡ Quick Access</h2>
          <div className="dashboard__quick-links">
            {QUICK_LINKS.map(l => (
              <Link key={l.to} to={l.to} className="dashboard__quick-item">
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

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

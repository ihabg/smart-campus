import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './Sidebar.css';

const NAV = {
  super_admin: {
    label: 'Admin Panel', badge: 'badge--amber',
    links: [
      { to: '/admin',               end: true, icon: '⊞',  label: 'Dashboard' },
      { to: '/admin/users',                    icon: '👥', label: 'Users' },
      { to: '/admin/floors',                   icon: '🏢', label: 'Floors & Maps' },
      { to: '/admin/rooms',                    icon: '🚪', label: 'Rooms' },
      { to: '/admin/schedule',                 icon: '📅', label: 'Schedule' },
      { to: '/admin/notifications',            icon: '🔔', label: 'Notifications' },
      { to: '/admin/announcements',            icon: '📢', label: 'Announcements' },
    ],
  },
  admin: {
    label: 'Admin Panel', badge: 'badge--amber',
    links: [
      { to: '/admin',               end: true, icon: '⊞',  label: 'Dashboard' },
      { to: '/admin/users',                    icon: '👥', label: 'Users' },
      { to: '/admin/floors',                   icon: '🏢', label: 'Floors & Maps' },
      { to: '/admin/rooms',                    icon: '🚪', label: 'Rooms' },
      { to: '/admin/schedule',                 icon: '📅', label: 'Schedule' },
      { to: '/admin/notifications',            icon: '🔔', label: 'Notifications' },
      { to: '/admin/announcements',            icon: '📢', label: 'Announcements' },
    ],
  },
  professor: {
    label: 'Professor Portal', badge: 'badge--green',
    links: [
      { to: '/professor',           end: true, icon: '⊞',  label: 'Dashboard' },
      { to: '/professor/schedule',             icon: '📅', label: 'My Schedule' },
      { to: '/professor/students',             icon: '👥', label: 'Students & Grades' },
      { to: '/announcements',                  icon: '📢', label: 'Announcements' },
      { to: '/profile',                        icon: '👤', label: 'My Profile' },
    ],
  },
  department_head: {
    label: 'Professor Portal', badge: 'badge--green',
    links: [
      { to: '/professor',           end: true, icon: '⊞',  label: 'Dashboard' },
      { to: '/professor/schedule',             icon: '📅', label: 'My Schedule' },
      { to: '/professor/students',             icon: '👥', label: 'Students & Grades' },
      { to: '/announcements',                  icon: '📢', label: 'Announcements' },
      { to: '/profile',                        icon: '👤', label: 'My Profile' },
    ],
  },
  student: {
    label: 'Student Portal', badge: 'badge--blue',
    links: [
      { to: '/dashboard',           end: true, icon: '⊞',  label: 'Dashboard' },
      { to: '/map',                            icon: '🗺️', label: 'Campus Map' },
      { to: '/schedule',                       icon: '📅', label: 'My Schedule' },
      { to: '/search',                         icon: '🔍', label: 'Search' },
      { to: '/announcements',                  icon: '📢', label: 'Announcements' },
      { to: '/profile',                        icon: '👤', label: 'My Profile' },
    ],
  },
};

export default function Sidebar({ collapsed, mobileOpen, onMobileClose }) {
  const { user } = useAuth();
  const cfg = NAV[user?.role] || NAV.student;

  return (
    <>
      {mobileOpen && <div className="sidebar-overlay" onClick={onMobileClose} />}
      <aside className={[
        'sidebar',
        collapsed  ? 'sidebar--collapsed'   : '',
        mobileOpen ? 'sidebar--mobile-open' : '',
      ].join(' ').trim()}>

        <div className="sidebar__role">
          <span className={`badge ${cfg.badge}`}>
            {collapsed ? cfg.label.charAt(0) : cfg.label}
          </span>
        </div>

        <nav className="sidebar__nav">
          {cfg.links.map(link => (
            <NavLink key={link.to} to={link.to} end={link.end} title={link.label}
              className={({ isActive }) =>
                `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`
              }>
              <span className="sidebar__link-icon">{link.icon}</span>
              <span className="sidebar__link-label">{link.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__footer">
          <div className="sidebar__user">
            <div className="sidebar__user-avatar">
              {user?.avatar_url
                ? <img src={user.avatar_url} alt="avatar" />
                : `${user?.first_name?.[0] || ''}${user?.last_name?.[0] || ''}`
              }
            </div>
            <div className="sidebar__user-info">
              <span className="sidebar__user-name">
                {user?.academic_title && `${user.academic_title} `}
                {user?.first_name} {user?.last_name}
              </span>
              <span className="sidebar__user-id">
                {user?.student_id || user?.email?.split('@')[0] || ''}
              </span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

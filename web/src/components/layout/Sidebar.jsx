import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './Sidebar.css';

const STUDENT_LINKS = [
  { to: '/dashboard',      icon: <DashIcon />,    label: 'Dashboard' },
  { to: '/map',            icon: <MapIcon />,      label: 'Campus Map' },
  { to: '/schedule',       icon: <CalIcon />,      label: 'My Schedule' },
  { to: '/search',         icon: <SearchIcon />,   label: 'Search' },
  { to: '/notifications',  icon: <BellIcon />,     label: 'Notifications' },
  { to: '/announcements',  icon: <MegaIcon />,     label: 'Announcements' },
  { to: '/profile',        icon: <UserIcon />,     label: 'My Profile' },
];

const ADMIN_LINKS = [
  { to: '/admin',                 icon: <DashIcon />,   label: 'Dashboard',     end: true },
  { to: '/admin/users',           icon: <UsersIcon />,  label: 'Users' },
  { to: '/admin/floors',          icon: <BuildIcon />,  label: 'Floors & Maps' },
  { to: '/admin/rooms',           icon: <MapIcon />,    label: 'Rooms' },
  { to: '/admin/map-editor',      icon: <EditIcon />,   label: 'Map Editor' },
  { to: '/admin/schedule',        icon: <CalIcon />,    label: 'Schedule' },
  { to: '/admin/notifications',   icon: <BellIcon />,   label: 'Notifications' },
  { to: '/admin/announcements',   icon: <MegaIcon />,   label: 'Announcements' },
];

export default function Sidebar({ open, collapsed, onClose }) {
  const { user, isAdmin } = useAuth();
  const location          = useLocation();
  const links             = isAdmin ? ADMIN_LINKS : STUDENT_LINKS;

  return (
    <>
      {/* Overlay for mobile */}
      {open && <div className="sidebar-overlay" onClick={onClose} />}

      <aside className={`sidebar ${open ? 'sidebar--open' : ''} ${collapsed ? 'sidebar--collapsed' : ''}`}>
        {/* Role label */}
        <div className="sidebar__role">
          <span className={`badge ${isAdmin ? 'badge--amber' : 'badge--blue'}`}>
            {isAdmin ? 'Admin Panel' : 'Student Portal'}
          </span>
        </div>

        {/* Navigation */}
        <nav className="sidebar__nav">
          {links.map(link => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
              onClick={() => window.innerWidth < 768 && onClose?.()}
            >
              <span className="sidebar__link-icon">{link.icon}</span>
              <span className="sidebar__link-label">{link.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Bottom user info */}
        <div className="sidebar__footer">
          <div className="sidebar__user">
            <div className="sidebar__user-avatar">
              {user?.avatar_url
                ? <img src={user.avatar_url} alt="" />
                : `${user?.first_name?.[0] || ''}${user?.last_name?.[0] || ''}`
              }
            </div>
            <div className="sidebar__user-info">
              <span className="sidebar__user-name">{user?.first_name} {user?.last_name}</span>
              <span className="sidebar__user-id">{user?.student_id || user?.email}</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

// ── Icons ────────────────────────────────────────────────────
function DashIcon()   { return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>; }
function MapIcon()    { return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 1L1 3v12l5-2 4 2 5-2V1l-5 2-4-2z"/><line x1="6" y1="1" x2="6" y2="13"/><line x1="10" y1="3" x2="10" y2="15"/></svg>; }
function CalIcon()    { return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="3" width="14" height="12" rx="1"/><path d="M1 7h14M5 1v4M11 1v4"/></svg>; }
function SearchIcon() { return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="6.5" cy="6.5" r="4.5"/><path d="m10 10 3.5 3.5"/></svg>; }
function BellIcon()   { return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 1a5 5 0 00-5 5c0 3-1.5 3.5-1.5 4.5h13c0-1-1.5-1.5-1.5-4.5a5 5 0 00-5-5z"/><path d="M6.5 13.5a1.5 1.5 0 003 0"/></svg>; }
function MegaIcon()   { return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M13 3L3 7v3l10 4V3z"/><path d="M3 7H1v3h2"/></svg>; }
function UserIcon()   { return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="5" r="3"/><path d="M2 14c0-3.314 2.686-6 6-6s6 2.686 6 6"/></svg>; }
function UsersIcon()  { return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="6" cy="5" r="2.5"/><path d="M1 13c0-2.761 2.239-5 5-5"/><circle cx="11" cy="5" r="2.5"/><path d="M15 13c0-2.761-2.239-5-5-5"/><path d="M6 13h5"/></svg>; }
function BuildIcon()  { return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="4" width="14" height="11" rx="1"/><path d="M1 8h14M5 4V1h6v3"/><line x1="5" y1="11" x2="5" y2="15"/><line x1="8" y1="11" x2="8" y2="15"/><line x1="11" y1="11" x2="11" y2="15"/></svg>; }
function EditIcon()   { return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11.5 2.5l2 2-9 9H2.5v-2l9-9z"/></svg>; }

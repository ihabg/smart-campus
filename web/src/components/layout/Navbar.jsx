import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../hooks/index';
import { BellIcon, SearchIcon } from '../ui/index';
import { timeAgo } from '../../utils/helpers';
import toast from 'react-hot-toast';
import './Navbar.css';

export default function Navbar({ onMenuToggle }) {
  const { user, logout, isAdmin }                         = useAuth();
  const { unreadCount, notifications, markRead, markAllRead } = useNotifications();
  const [notifOpen, setNotifOpen]                         = useState(false);
  const [profileOpen, setProfileOpen]                     = useState(false);
  const [searchQuery, setSearchQuery]                     = useState('');
  const notifRef   = useRef(null);
  const profileRef = useRef(null);
  const navigate   = useNavigate();

  // Close dropdowns on outside click
  useEffect(() => {
    function handler(e) {
      if (notifRef.current   && !notifRef.current.contains(e.target))   setNotifOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSearch = e => {
    e.preventDefault();
    if (searchQuery.trim().length >= 2) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
    }
  };

  const handleLogout = async () => {
    try { await logout(); navigate('/login'); }
    catch { toast.error('Logout failed'); }
  };

  return (
    <header className="navbar">
      {/* Left: logo + hamburger */}
      <div className="navbar__left">
        <button className="navbar__menu-btn" onClick={onMenuToggle} aria-label="Toggle sidebar">
          <HamburgerIcon />
        </button>
        <Link to="/dashboard" className="navbar__brand">
          <div className="navbar__logo">AN</div>
          <div className="navbar__brand-text">
            <span className="navbar__title">Smart Campus</span>
            <span className="navbar__sub">An-Najah University</span>
          </div>
        </Link>
      </div>

      {/* Center: search bar */}
      <form className="navbar__search" onSubmit={handleSearch}>
        <span className="navbar__search-icon"><SearchIcon size={14} /></span>
        <input
          className="navbar__search-input"
          type="text"
          placeholder="Search rooms, courses, instructors…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </form>

      {/* Right: notifications + profile */}
      <div className="navbar__right">
        {/* Notifications */}
        <div className="navbar__notif-wrap" ref={notifRef}>
          <button
            className="navbar__icon-btn"
            onClick={() => setNotifOpen(o => !o)}
            aria-label="Notifications"
          >
            <BellIcon size={18} />
            {unreadCount > 0 && (
              <span className="navbar__badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
            )}
          </button>

          {notifOpen && (
            <div className="notif-dropdown">
              <div className="notif-dropdown__header">
                <span>Notifications</span>
                {unreadCount > 0 && (
                  <button className="notif-dropdown__mark-all" onClick={markAllRead}>
                    Mark all read
                  </button>
                )}
              </div>
              <div className="notif-dropdown__list">
                {notifications.length === 0 ? (
                  <div className="notif-dropdown__empty">No notifications</div>
                ) : notifications.slice(0, 8).map(n => (
                  <button
                    key={n.id}
                    className={`notif-item ${!n.is_read ? 'notif-item--unread' : ''}`}
                    onClick={() => { markRead(n.id); }}
                  >
                    <div className="notif-item__title">{n.title}</div>
                    <div className="notif-item__body">{n.body}</div>
                    <div className="notif-item__time">{timeAgo(n.published_at)}</div>
                  </button>
                ))}
              </div>
              <Link to="/notifications" className="notif-dropdown__footer" onClick={() => setNotifOpen(false)}>
                View all notifications
              </Link>
            </div>
          )}
        </div>

        {/* Profile menu */}
        <div className="navbar__profile-wrap" ref={profileRef}>
          <button className="navbar__profile-btn" onClick={() => setProfileOpen(o => !o)}>
            {user?.avatar_url
              ? <img src={user.avatar_url} alt="avatar" className="navbar__avatar" />
              : <div className="navbar__avatar navbar__avatar--initials">
                  {user?.first_name?.[0]}{user?.last_name?.[0]}
                </div>
            }
            <span className="navbar__username">{user?.first_name}</span>
            <ChevronIcon />
          </button>

          {profileOpen && (
            <div className="profile-dropdown">
              <div className="profile-dropdown__user">
                <strong>{user?.first_name} {user?.last_name}</strong>
                <span>{user?.email}</span>
                <span className={`badge ${user?.role === 'student' ? 'badge--blue' : 'badge--amber'}`}>
                  {user?.role?.replace('_', ' ')}
                </span>
              </div>
              <div className="profile-dropdown__divider" />
              <Link to="/profile" className="profile-dropdown__item" onClick={() => setProfileOpen(false)}>
                My Profile
              </Link>
              <Link to="/schedule" className="profile-dropdown__item" onClick={() => setProfileOpen(false)}>
                My Schedule
              </Link>
              {isAdmin && (
                <Link to="/admin" className="profile-dropdown__item" onClick={() => setProfileOpen(false)}>
                  Admin Dashboard
                </Link>
              )}
              <div className="profile-dropdown__divider" />
              <button className="profile-dropdown__item profile-dropdown__item--danger" onClick={handleLogout}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function HamburgerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M2 4h14M2 9h14M2 14h14"/>
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 4.5l3 3 3-3"/>
    </svg>
  );
}

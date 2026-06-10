import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../hooks/index';
import { BellIcon } from '../ui/index';
import { timeAgo } from '../../utils/helpers';
import { getNotificationTarget } from '../../utils/notificationTarget';
import { publicUrl } from '../../utils/publicUrl';
import toast from 'react-hot-toast';
import './Navbar.css';

export default function Navbar({ onMenuToggle }) {
  const { user, logout, isAdmin } = useAuth();

  const {
    unreadCount,
    notifications,
    markRead,
    markAllRead
  } = useNotifications();

  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const notifRef = useRef(null);
  const profileRef = useRef(null);
  const navigate = useNavigate();

  const homePath = isAdmin ? '/admin' : '/dashboard';
  const notificationsPath = isAdmin ? '/admin/notifications' : '/notifications';

  useEffect(() => {
    function handler(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }

      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    }

    document.addEventListener('mousedown', handler);

    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch {
      toast.error('Logout failed');
    }
  };

  return (
    <header className="navbar">
      <div className="navbar__left">
        <button
          className="navbar__menu-btn"
          onClick={onMenuToggle}
          aria-label="Toggle sidebar"
          type="button"
        >
          <HamburgerIcon />
        </button>

        <Link to={homePath} className="navbar__brand">
          <div className="navbar__logo">AN</div>

          <div className="navbar__brand-text">
            <span className="navbar__title">Smart Campus</span>
            <span className="navbar__sub">An-Najah University</span>
          </div>
        </Link>
      </div>

      <div className="navbar__spacer" />

      <div className="navbar__right">
        <div className="navbar__notif-wrap" ref={notifRef}>
          <button
            className="navbar__icon-btn"
            onClick={() => setNotifOpen((open) => !open)}
            aria-label="Notifications"
            type="button"
          >
            <BellIcon size={18} />

            {unreadCount > 0 && (
              <span className="navbar__badge">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="notif-dropdown">
              <div className="notif-dropdown__header">
                <span>Notifications</span>

                {unreadCount > 0 && (
                  <button
                    className="notif-dropdown__mark-all"
                    onClick={markAllRead}
                    type="button"
                  >
                    Mark all read
                  </button>
                )}
              </div>

              <div className="notif-dropdown__list">
                {notifications.length === 0 ? (
                  <div className="notif-dropdown__empty">
                    No notifications
                  </div>
                ) : (
                  notifications.slice(0, 8).map((notification) => (
                    <button
                      key={notification.id}
                      className={`notif-item ${
                        !notification.is_read ? 'notif-item--unread' : ''
                      }`}
                      onClick={() => {
                        if (!notification.is_read) markRead(notification.id);
                        setNotifOpen(false);
                        const target = getNotificationTarget(notification, user);
                        navigate(target.search
                          ? { pathname: target.pathname, search: target.search }
                          : target.pathname
                        );
                      }}
                      type="button"
                    >
                      <div className="notif-item__title">
                        {notification.title}
                      </div>

                      <div className="notif-item__body">
                        {notification.body}
                      </div>

                      <div className="notif-item__time">
                        {timeAgo(notification.published_at)}
                      </div>
                    </button>
                  ))
                )}
              </div>

              <Link
                to={notificationsPath}
                className="notif-dropdown__footer"
                onClick={() => setNotifOpen(false)}
              >
                View all notifications
              </Link>
            </div>
          )}
        </div>

        <div className="navbar__profile-wrap" ref={profileRef}>
          <button
            className="navbar__profile-btn"
            onClick={() => setProfileOpen((open) => !open)}
            type="button"
          >
            {user?.avatar_url ? (
              <img
                src={publicUrl(user.avatar_url)}
                alt="avatar"
                className="navbar__avatar"
              />
            ) : (
              <div className="navbar__avatar navbar__avatar--initials">
                {user?.first_name?.[0]}
                {user?.last_name?.[0]}
              </div>
            )}

            <span className="navbar__username">
              {user?.first_name}
            </span>

            <ChevronIcon />
          </button>

          {profileOpen && (
            <div className="profile-dropdown">
              <div className="profile-dropdown__user">
                <strong>
                  {user?.first_name} {user?.last_name}
                </strong>

                <span>{user?.email}</span>

                <span
                  className={`badge ${
                    user?.role === 'student'
                      ? 'badge--blue'
                      : 'badge--amber'
                  }`}
                >
                  {user?.role?.replace('_', ' ')}
                </span>
              </div>

              <div className="profile-dropdown__divider" />

              {!isAdmin && (
                <>
                  <Link
                    to="/profile"
                    className="profile-dropdown__item"
                    onClick={() => setProfileOpen(false)}
                  >
                    My Profile
                  </Link>

                  <Link
                    to={['professor', 'department_head', 'dean'].includes(user?.role) ? '/professor/schedule' : '/schedule'}
                    className="profile-dropdown__item"
                    onClick={() => setProfileOpen(false)}
                  >
                    My Schedule
                  </Link>

                  <Link
                    to="/map"
                    className="profile-dropdown__item"
                    onClick={() => setProfileOpen(false)}
                  >
                    Campus Map
                  </Link>
                </>
              )}

              {isAdmin && (
                <>
                  <Link
                    to="/admin/profile"
                    className="profile-dropdown__item"
                    onClick={() => setProfileOpen(false)}
                  >
                    My Profile
                  </Link>

                  <Link
                    to="/admin"
                    className="profile-dropdown__item"
                    onClick={() => setProfileOpen(false)}
                  >
                    Admin Dashboard
                  </Link>

                  <Link
                    to="/admin/floors"
                    className="profile-dropdown__item"
                    onClick={() => setProfileOpen(false)}
                  >
                    Floors & Maps
                  </Link>

                  <Link
                    to="/admin/rooms"
                    className="profile-dropdown__item"
                    onClick={() => setProfileOpen(false)}
                  >
                    Manage Rooms
                  </Link>

                  <Link
                    to="/admin/notifications"
                    className="profile-dropdown__item"
                    onClick={() => setProfileOpen(false)}
                  >
                    Admin Notifications
                  </Link>
                </>
              )}

              <div className="profile-dropdown__divider" />

              <button
                className="profile-dropdown__item profile-dropdown__item--danger"
                onClick={handleLogout}
                type="button"
              >
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
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M2 4h14M2 9h14M2 14h14" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M3 4.5l3 3 3-3" />
    </svg>
  );
}
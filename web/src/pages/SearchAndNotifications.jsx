import React, { useEffect, useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useSearch, useNotifications } from '../hooks/index';
import { useAuth } from '../context/AuthContext';
import { SearchInput, Spinner, Badge } from '../components/ui/index';
import { roomTypeLabel, roomTypeBadgeClass, timeAgo } from '../utils/helpers';
import { getNotificationTarget } from '../utils/notificationTarget';

// ─── Search Page ──────────────────────────────────────────────
export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [input,        setInput]        = useState(searchParams.get('q') || '');
  const { results, loading, search, clear } = useSearch();

  useEffect(() => {
    const q = searchParams.get('q');
    if (q) search(q);
  }, []); // eslint-disable-line

  const handleSearch = val => {
    setInput(val);
    if (val.trim().length >= 2) {
      setSearchParams({ q: val });
      search(val);
    } else {
      setSearchParams({});
      clear();
    }
  };

  const total = results
    ? Object.values(results.results).reduce((s, a) => s + a.length, 0)
    : 0;

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div className="page-header">
        <h1 className="page-title">Search Campus</h1>
        <p className="page-sub">Find rooms, courses, instructors, and announcements</p>
      </div>

      <div style={{ marginBottom: 'var(--space-xl)' }}>
        <SearchInput
          value={input}
          onChange={handleSearch}
          onClear={() => handleSearch('')}
          placeholder="Search rooms, courses, instructors…"
        />
      </div>

      {loading && <Spinner center />}

      {!loading && results && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)' }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {total} result{total !== 1 ? 's' : ''} for "{results.query}"
          </p>

          {/* Rooms */}
          {results.results.rooms?.length > 0 && (
            <section>
              <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 'var(--space-md)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Rooms ({results.results.rooms.length})
              </h2>
              <div className="card card--no-pad">
                {results.results.rooms.map(room => (
                  <Link
                    key={room.id}
                    to="/map"
                    state={{ roomId: room.id, floorId: room.floor_id }}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border)', textDecoration: 'none' }}
                  >
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--najah-blue)', minWidth: 40 }}>
                      {room.room_number}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{room.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {room.building_name} · {room.floor_label}
                        {room.department && ` · ${room.department}`}
                      </div>
                    </div>
                    <Badge variant={room.type === 'lab' ? 'lab' : room.type === 'lecture_hall' ? 'lecture' : 'gray'}>
                      {roomTypeLabel(room.type)}
                    </Badge>
                    {room.capacity && (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{room.capacity} seats</span>
                    )}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Courses */}
          {results.results.courses?.length > 0 && (
            <section>
              <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 'var(--space-md)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Courses ({results.results.courses.length})
              </h2>
              <div className="card card--no-pad">
                {results.results.courses.map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--najah-blue)', minWidth: 60 }}>{c.code}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.department}</div>
                    </div>
                    {c.credit_hours && <Badge variant="gray">{c.credit_hours} cr</Badge>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Instructors */}
          {results.results.instructors?.length > 0 && (
            <section>
              <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 'var(--space-md)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Instructors ({results.results.instructors.length})
              </h2>
              <div className="card card--no-pad">
                {results.results.instructors.map(i => (
                  <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--najah-light)', color: 'var(--najah-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                      {i.first_name?.[0]}{i.last_name?.[0]}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{i.title} {i.first_name} {i.last_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{i.department}</div>
                    </div>
                    {i.office_room_number && (
                      <Link to="/map" state={{ roomId: i.office_room_id }}>
                        <Badge variant="gray">Office: {i.office_room_number}</Badge>
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {total === 0 && (
            <div className="empty-state">
              <div className="empty-state__icon">🔍</div>
              <p className="empty-state__title">No results found</p>
              <p className="empty-state__sub">Try different keywords or check the spelling</p>
            </div>
          )}
        </div>
      )}

      {!loading && !results && !input && (
        <div className="empty-state">
          <div className="empty-state__icon">🔍</div>
          <p className="empty-state__title">Search anything</p>
          <p className="empty-state__sub">Enter a room number, course name, or instructor name above</p>
        </div>
      )}
    </div>
  );
}

// ─── Notifications Page ───────────────────────────────────────
export function NotificationsPage() {
  const { notifications, loading, markRead, markAllRead, unreadCount, refetch } = useNotifications();
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">Notifications</h1>
          {unreadCount > 0 && <p className="page-sub">{unreadCount} unread</p>}
        </div>
        {unreadCount > 0 && (
          <button className="btn btn--secondary btn--sm" onClick={markAllRead}>
            Mark all as read
          </button>
        )}
      </div>

      {loading ? <Spinner center /> : notifications.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state__icon">🔔</div>
            <p className="empty-state__title">No notifications</p>
            <p className="empty-state__sub">You're all caught up!</p>
          </div>
        </div>
      ) : (
        <div className="card card--no-pad">
          {notifications.map(n => (
            <div
              key={n.id}
              onClick={() => {
                if (!n.is_read) markRead(n.id);
                const target = getNotificationTarget(n, user);
                navigate(target.search
                  ? { pathname: target.pathname, search: target.search }
                  : target.pathname
                );
              }}
              style={{
                padding: '14px 20px',
                borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
                background: n.is_read ? 'var(--surface)' : 'var(--najah-light)',
                display: 'flex', gap: 12,
              }}
            >
              {!n.is_read && (
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--najah-blue)', marginTop: 6, flexShrink: 0 }} />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: n.is_read ? 400 : 600, color: 'var(--text)', marginBottom: 4 }}>{n.title}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>{n.body}</div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{timeAgo(n.published_at)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

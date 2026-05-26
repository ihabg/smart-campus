import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { announcementAPI } from '../api/index';
import { Button, Spinner } from '../components/ui/index';
import { getErrorMessage, formatDate } from '../utils/helpers';
import toast from 'react-hot-toast';

const API_ORIGIN = (process.env.REACT_APP_API_URL || 'http://localhost:5000/api')
  .replace(/\/api\/?$/, '');

function getImageUrl(url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_ORIGIN}${url.startsWith('/') ? url : `/${url}`}`;
}

export default function AnnouncementDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [announcement, setAnnouncement] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    async function loadAnnouncement() {
      setLoading(true);

      try {
        const response = await announcementAPI.getById(id);
        const payload = response.data?.data || response.data || {};
        const item = payload.announcement || payload;

        if (alive) {
          setAnnouncement(item);
        }
      } catch (error) {
        toast.error(getErrorMessage(error, 'Announcement was not found.'));
        if (alive) {
          setAnnouncement(null);
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    }

    loadAnnouncement();

    return () => {
      alive = false;
    };
  }, [id]);

  if (loading) {
    return <Spinner center />;
  }

  if (!announcement) {
    return (
      <div
        className="card"
        style={{
          maxWidth: 760,
          margin: '40px auto',
          textAlign: 'center',
          padding: 32,
        }}
      >
        <h1 className="page-title" style={{ marginBottom: 8 }}>
          Announcement not found
        </h1>

        <p className="page-sub" style={{ marginBottom: 20 }}>
          It may be deleted, expired, scheduled for later, or not targeted to your account.
        </p>

        <Button variant="primary" onClick={() => navigate('/announcements')}>
          Back to announcements
        </Button>
      </div>
    );
  }

  const imageUrl = getImageUrl(announcement.image_url);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 0' }}>
      <Button variant="secondary" onClick={() => navigate('/announcements')}>
        ← Back to announcements
      </Button>

      <article className="card" style={{ marginTop: 16, padding: 28 }}>
        {imageUrl && (
          <img
            src={imageUrl}
            alt=""
            style={{
              width: '100%',
              maxHeight: 320,
              objectFit: 'cover',
              borderRadius: 16,
              marginBottom: 24,
            }}
          />
        )}

        <h1
          style={{
            margin: 0,
            color: 'var(--navy-deep)',
            fontSize: 30,
            lineHeight: 1.25,
          }}
        >
          {announcement.title}
        </h1>

        <div
          style={{
            marginTop: 12,
            marginBottom: 22,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            color: 'var(--text-muted)',
            fontSize: 13,
          }}
        >
          {announcement.author_name && <span>By {announcement.author_name}</span>}
          {announcement.published_at && <span>• {formatDate(announcement.published_at)}</span>}
          {announcement.target_role && <span>• {announcement.target_role}</span>}
          {announcement.target_department && announcement.target_department !== 'all' && (
            <span>• {announcement.target_department}</span>
          )}
        </div>

        <div
          style={{
            whiteSpace: 'pre-wrap',
            color: 'var(--text)',
            fontSize: 16,
            lineHeight: 1.8,
          }}
        >
          {announcement.content}
        </div>
      </article>
    </div>
  );
}
import React, { useState, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { userAPI } from '../../api/index';
import { authAPI } from '../../api/authAPI';
import { publicUrl } from '../../utils/publicUrl';
import { getErrorMessage } from '../../utils/helpers';
import toast from 'react-hot-toast';
import './AdminProfilePage.css';

const ROLE_LABELS = {
  admin:       'Admin',
  super_admin: 'Super Admin',
};

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch {
    return '—';
  }
}

function formatDateFull(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function StatusBadge({ status }) {
  if (!status) return null;
  const cls = `ap-status--${status}`;
  return <span className={cls}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>;
}

// ─── Password rule checker ────────────────────────────────────
function pwRules(pw) {
  return {
    length:    pw.length >= 8,
    uppercase: /[A-Z]/.test(pw),
    number:    /[0-9]/.test(pw),
  };
}

// ─── Profile Tab ──────────────────────────────────────────────
function ProfileTab({ user, updateUser }) {
  const [form, setForm] = useState({
    first_name: user?.first_name || '',
    last_name:  user?.last_name  || '',
  });
  const [saving,     setSaving]     = useState(false);
  const [uploading,  setUploading]  = useState(false);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSave = async () => {
    const fn = form.first_name.trim();
    const ln = form.last_name.trim();
    if (!fn) { toast.error('First name is required'); return; }
    if (!ln) { toast.error('Last name is required'); return; }

    setSaving(true);
    try {
      const { data } = await userAPI.updateMe({ first_name: fn, last_name: ln });
      updateUser(data.data.user);
      toast.success('Profile updated');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarChange = useCallback(async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so the same file can be re-selected if needed
    e.target.value = '';

    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      toast.error('Only JPG, PNG, or WebP images are allowed');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be under 2 MB');
      return;
    }

    setUploading(true);
    try {
      const { data } = await userAPI.uploadAvatar(file);
      updateUser({ avatar_url: data.data.avatar_url });
      toast.success('Avatar updated');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }, [updateUser]);

  const initials = `${user?.first_name?.[0] || ''}${user?.last_name?.[0] || ''}`.toUpperCase();

  return (
    <div className="ap-card">
      <h3 className="ap-card__title">Edit Profile</h3>

      {/* Avatar editor inside the card */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
        <div className={`ap-avatar-wrap${uploading ? ' ap-avatar-uploading' : ''}`}>
          <div className="ap-avatar" style={{ width: 80, height: 80, fontSize: 24 }}>
            {user?.avatar_url
              ? <img src={publicUrl(user.avatar_url)} alt="avatar" />
              : initials
            }
          </div>
          <label className="ap-avatar-edit" title="Change photo">
            ✎
            <input
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={handleAvatarChange}
              disabled={uploading}
            />
          </label>
        </div>
        <p className="ap-avatar-hint">
          {uploading ? 'Uploading…' : 'JPG, PNG, WebP · max 2 MB'}
        </p>
      </div>

      {/* Name fields */}
      <div className="ap-form-row">
        <div className="ap-form-group" style={{ marginBottom: 0 }}>
          <label className="ap-label">First Name</label>
          <input
            className="ap-input"
            type="text"
            value={form.first_name}
            onChange={set('first_name')}
            placeholder="First name"
            maxLength={100}
          />
        </div>
        <div className="ap-form-group" style={{ marginBottom: 0 }}>
          <label className="ap-label">Last Name</label>
          <input
            className="ap-input"
            type="text"
            value={form.last_name}
            onChange={set('last_name')}
            placeholder="Last name"
            maxLength={100}
          />
        </div>
      </div>

      {/* Read-only email */}
      <div className="ap-form-group" style={{ marginTop: 14 }}>
        <label className="ap-label">Email</label>
        <input
          className="ap-input ap-input--readonly"
          type="email"
          value={user?.email || ''}
          readOnly
          tabIndex={-1}
        />
        <span className="ap-hint">Email cannot be changed from this page</span>
      </div>

      <div className="ap-form-actions">
        <button
          className="ap-btn ap-btn--primary"
          onClick={handleSave}
          disabled={saving}
          type="button"
        >
          {saving && <span className="ap-spinner" />}
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

// ─── Security Tab ─────────────────────────────────────────────
function SecurityTab() {
  const [form, setForm] = useState({
    current_password: '',
    new_password:     '',
    confirm_password: '',
  });
  const [loading, setLoading] = useState(false);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const rules  = pwRules(form.new_password);
  const allOk  = rules.length && rules.uppercase && rules.number;
  const matches = form.confirm_password
    ? form.new_password === form.confirm_password
    : null;

  const handleSubmit = async e => {
    e.preventDefault();

    if (!form.current_password) { toast.error('Current password is required'); return; }
    if (!allOk)                 { toast.error('New password does not meet requirements'); return; }
    if (!form.confirm_password) { toast.error('Please confirm your new password'); return; }
    if (!matches)               { toast.error('Passwords do not match'); return; }
    if (form.new_password === form.current_password) {
      toast.error('New password must be different from current password');
      return;
    }

    setLoading(true);
    try {
      await authAPI.changePassword({
        current_password: form.current_password,
        new_password:     form.new_password,
      });
      toast.success('Password updated. Please log in again.');
      setForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (err) {
      const msg = getErrorMessage(err);
      // Surface field-level 422 validation errors from the server clearly
      const errData = err?.response?.data;
      if (errData?.errors?.length) {
        errData.errors.forEach(fe => toast.error(fe.message));
      } else {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ap-card">
      <h3 className="ap-card__title">Change Password</h3>
      <form onSubmit={handleSubmit} noValidate>
        <div className="ap-form-group">
          <label className="ap-label">Current Password</label>
          <input
            className="ap-input"
            type="password"
            value={form.current_password}
            onChange={set('current_password')}
            placeholder="Enter current password"
            autoComplete="current-password"
          />
        </div>

        <div className="ap-form-group">
          <label className="ap-label">New Password</label>
          <input
            className="ap-input"
            type="password"
            value={form.new_password}
            onChange={set('new_password')}
            placeholder="Enter new password"
            autoComplete="new-password"
          />
          <div className="ap-pw-rules">
            <div className={`ap-pw-rule${rules.length    ? ' ap-pw-rule--ok' : ''}`}>
              <span className="ap-pw-rule__dot" />
              At least 8 characters
            </div>
            <div className={`ap-pw-rule${rules.uppercase ? ' ap-pw-rule--ok' : ''}`}>
              <span className="ap-pw-rule__dot" />
              One uppercase letter
            </div>
            <div className={`ap-pw-rule${rules.number   ? ' ap-pw-rule--ok' : ''}`}>
              <span className="ap-pw-rule__dot" />
              One number
            </div>
          </div>
        </div>

        <div className="ap-form-group">
          <label className="ap-label">Confirm New Password</label>
          <input
            className="ap-input"
            type="password"
            value={form.confirm_password}
            onChange={set('confirm_password')}
            placeholder="Re-enter new password"
            autoComplete="new-password"
            style={form.confirm_password
              ? { borderColor: matches ? '#16a34a' : '#dc2626' }
              : undefined
            }
          />
          {form.confirm_password && !matches && (
            <span className="ap-hint" style={{ color: '#dc2626' }}>Passwords do not match</span>
          )}
          {form.confirm_password && matches && (
            <span className="ap-hint" style={{ color: '#16a34a' }}>Passwords match</span>
          )}
        </div>

        <div className="ap-form-actions">
          <button
            type="submit"
            className="ap-btn ap-btn--primary"
            disabled={loading}
          >
            {loading && <span className="ap-spinner" />}
            {loading ? 'Updating…' : 'Update Password'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────
export default function AdminProfilePage() {
  const { user, updateUser } = useAuth();
  const [tab, setTab] = useState('profile');

  const initials = `${user?.first_name?.[0] || ''}${user?.last_name?.[0] || ''}`.toUpperCase();
  const roleLabel = ROLE_LABELS[user?.role] || (user?.role?.replace('_', ' ') ?? '');

  return (
    <div className="ap-page">
      {/* ── Page header ── */}
      <div className="ap-header">
        <div>
          <h1 className="ap-header__title">My Profile</h1>
          <p className="ap-header__sub">Manage your account information and security settings</p>
        </div>
      </div>

      {/* ── Hero card ── */}
      <div className="ap-hero">
        {/* Avatar */}
        <div className="ap-avatar-wrap">
          <div className="ap-avatar">
            {user?.avatar_url
              ? <img src={publicUrl(user.avatar_url)} alt="avatar" />
              : initials
            }
          </div>
        </div>

        {/* Info */}
        <div className="ap-hero__info">
          <h2 className="ap-hero__name">
            {user?.first_name} {user?.last_name}
          </h2>
          <p className="ap-hero__email">{user?.email}</p>
          <div className="ap-hero__badges">
            <span style={{
              background: user?.role === 'super_admin' ? '#fef3c7' : '#dbeafe',
              color:      user?.role === 'super_admin' ? '#92400e' : '#1e40af',
              borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 700,
              display: 'inline-block',
            }}>
              {roleLabel}
            </span>
            {user?.status && <StatusBadge status={user.status} />}
          </div>

          {/* Meta strip */}
          <div className="ap-hero__meta">
            {user?.created_at && (
              <div className="ap-meta-item">
                <span className="ap-meta-item__label">Member Since</span>
                <span className="ap-meta-item__value">{formatDate(user.created_at)}</span>
              </div>
            )}
            {user?.last_login && (
              <div className="ap-meta-item">
                <span className="ap-meta-item__label">Last Login</span>
                <span className="ap-meta-item__value">{formatDateFull(user.last_login)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="ap-tabs">
        <button
          className={`ap-tab${tab === 'profile'  ? ' ap-tab--active' : ''}`}
          onClick={() => setTab('profile')}
          type="button"
        >
          Profile
        </button>
        <button
          className={`ap-tab${tab === 'security' ? ' ap-tab--active' : ''}`}
          onClick={() => setTab('security')}
          type="button"
        >
          Security
        </button>
      </div>

      {/* ── Tab content ── */}
      {tab === 'profile'  && <ProfileTab  user={user} updateUser={updateUser} />}
      {tab === 'security' && <SecurityTab />}
    </div>
  );
}

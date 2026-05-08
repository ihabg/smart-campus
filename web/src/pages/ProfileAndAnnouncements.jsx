import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { userAPI, announcementAPI } from '../api/index';
import { useAsync } from '../hooks/index';
import { Button, Input, Spinner, Badge } from '../components/ui/index';
import { getErrorMessage, timeAgo } from '../utils/helpers';
import toast from 'react-hot-toast';

// ─── Profile Page ─────────────────────────────────────────────
export function ProfilePage() {
  const { user, updateUser } = useAuth();
  const [tab, setTab] = useState('profile');
  const [form, setForm] = useState({
    first_name: user?.first_name || '',
    last_name:  user?.last_name  || '',
  });
  const [passwords, setPasswords] = useState({ current_password: '', new_password: '' });
  const [saving,    setSaving]    = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  const set   = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const setPw = k => e => setPasswords(p => ({ ...p, [k]: e.target.value }));

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const { data } = await userAPI.updateMe(form);
      updateUser(data.data.user);
      toast.success('Profile updated');
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setSaving(false); }
  };

  const handleChangePassword = async e => {
    e.preventDefault();
    if (passwords.new_password.length < 8) { toast.error('Minimum 8 characters'); return; }
    setPwLoading(true);
    try {
      const { authAPI } = await import('../api/authAPI');
      await authAPI.changePassword(passwords);
      toast.success('Password updated. Please log in again.');
      setPasswords({ current_password: '', new_password: '' });
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setPwLoading(false); }
  };

  const handleAvatarUpload = async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const { data } = await userAPI.uploadAvatar(file);
      updateUser({ avatar_url: data.data.avatar_url });
      toast.success('Avatar updated');
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  const ROLE_LABELS = {
    student:         'Student',
    professor:       'Professor',
    department_head: 'Department Head',
    super_admin:     'Admin',
    admin:           'Admin',
    lab_assistant:   'Lab Assistant',
    secretary:       'Secretary',
    dean:            'Dean',
  };

  return (
    <div style={{ maxWidth:600, margin:'0 auto' }}>
      <div className="page-header"><h1 className="page-title">My Profile</h1></div>

      {/* Profile header card */}
      <div className="card" style={{ display:'flex', alignItems:'center', gap:20, marginBottom:'var(--space-lg)' }}>
        <div style={{ position:'relative', flexShrink:0 }}>
          <div style={{ width:72, height:72, borderRadius:'50%', background:'var(--najah-light)', overflow:'hidden', border:'2px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, fontWeight:700, color:'var(--najah-blue)' }}>
            {user?.avatar_url
              ? <img src={user.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
              : `${user?.first_name?.[0] || ''}${user?.last_name?.[0] || ''}`
            }
          </div>
          <label style={{ position:'absolute', bottom:0, right:0, width:22, height:22, background:'var(--najah-blue)', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:11, color:'#fff' }}>
            ✎ <input type="file" accept="image/*" style={{ display:'none' }} onChange={handleAvatarUpload}/>
          </label>
        </div>
        <div>
          <h2 style={{ fontSize:18, fontWeight:600 }}>
            {user?.academic_title && `${user.academic_title} `}
            {user?.first_name} {user?.last_name}
          </h2>
          <p style={{ fontSize:13, color:'var(--text-muted)' }}>{user?.email}</p>
          <div style={{ display:'flex', gap:6, marginTop:6, flexWrap:'wrap' }}>
            <Badge variant={user?.role === 'student' ? 'blue' : 'amber'}>
              {ROLE_LABELS[user?.role] || user?.role}
            </Badge>
            {user?.student_id  && <Badge variant="gray">{user.student_id}</Badge>}
            {user?.department  && <Badge variant="gray">{user.department}</Badge>}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:'var(--space-lg)', borderBottom:'1px solid var(--border)' }}>
        {['profile','security'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding:'8px 16px', background:'none', border:'none',
            borderBottom:`2px solid ${tab===t ? 'var(--najah-blue)' : 'transparent'}`,
            color: tab===t ? 'var(--najah-blue)' : 'var(--text-muted)',
            fontWeight: tab===t ? 600 : 400, fontSize:14, cursor:'pointer',
          }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Profile tab — only First Name, Last Name, Email */}
      {tab === 'profile' && (
        <div className="card">
          <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-md)' }}>
            <div className="form-row">
              <Input label="First name" required value={form.first_name} onChange={set('first_name')}/>
              <Input label="Last name"  required value={form.last_name}  onChange={set('last_name')}/>
            </div>
            <Input label="Email" value={user?.email || ''} disabled hint="Email cannot be changed"/>
            <Button variant="primary" loading={saving} onClick={handleSaveProfile}>Save Changes</Button>
          </div>
        </div>
      )}

      {/* Security tab */}
      {tab === 'security' && (
        <div className="card">
          <form onSubmit={handleChangePassword}>
            <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-md)' }}>
              <Input label="Current password" type="password" required
                value={passwords.current_password} onChange={setPw('current_password')}/>
              <Input label="New password" type="password" required
                value={passwords.new_password} onChange={setPw('new_password')}
                hint="Minimum 8 characters, 1 uppercase, 1 number"/>
              <Button type="submit" variant="primary" loading={pwLoading}>Update Password</Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ─── Announcements Page ───────────────────────────────────────
export function AnnouncementsPage() {
  const { data, loading } = useAsync(() => announcementAPI.getAll({ limit: 20 }), []);
  const announcements = data?.announcements || [];

  return (
    <div style={{ maxWidth: 1150, margin: '0 auto', direction: 'rtl' }}>
      <div
        style={{
          background: '#123f78',
          color: '#fff',
          padding: '10px 16px',
          fontWeight: 700,
          textAlign: 'right',
          marginBottom: 0,
        }}
      >
        ◆ رسائل هامة
      </div>

      {loading ? (
        <Spinner center />
      ) : announcements.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #aaa', padding: 24 }}>
          <div style={{ textAlign: 'center', color: '#0033cc', fontWeight: 700 }}>
            لا توجد إعلانات حالياً
          </div>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #aaa' }}>
          {announcements.map(a => (
            <Link
              key={a.id}
              to={`/announcements/${a.id}`}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div
                style={{
                  padding: '18px 22px',
                  borderBottom: '1px solid #aaa',
                  textAlign: 'right',
                }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ color: 'red', fontSize: 16 }}>✉</span>
                  <span
                    style={{
                      color: '#0033cc',
                      fontWeight: 700,
                      textDecoration: 'underline',
                      fontSize: 16,
                    }}
                  >
                    {a.title}
                  </span>
                </div>

                <p
                  style={{
                    margin: '10px 26px 0 0',
                    color: '#0033cc',
                    fontWeight: 700,
                    lineHeight: 1.9,
                   fontSize: 16,
background: a.is_pinned ? 'yellow' : 'transparent',
                    display: a.is_pinned ? 'inline' : 'block',
                  }}
                >
                  {a.content}
                </p>

                <div style={{ fontSize: 11, color: '#555', marginTop: 10 }}>
                  {a.author_name && <span>{a.author_name} · </span>}
                  <span>{timeAgo(a.published_at)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { userAPI, roomAPI, scheduleAPI, notificationAPI } from '../../api/index';
import { floorAPI } from '../../api/floorAPI';
import { useAsync, useAllSections } from '../../hooks/index';
import {
  Table, Pagination, Button, Input, Select, Textarea,
  Modal, ConfirmDialog, Badge, Spinner, SectionHeader,
  SearchInput, PlusIcon, EditIcon, TrashIcon, EyeIcon,
} from '../../components/ui/index';
import {
  formatDate, formatTime, daysArrayToString, statusBadgeClass,
  statusLabel, roomTypeLabel, getErrorMessage, semesterLabel,
} from '../../utils/helpers';

import toast from 'react-hot-toast';

// ─── Admin Dashboard ──────────────────────────────────────────
export function AdminDashboard() {
  const { data, loading } = useAsync(() => userAPI.getStats(), []);

  if (loading) return <Spinner center />;

  const stats = data || {};

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Admin Dashboard</h1>
        <p className="page-sub">System overview for An-Najah Smart Campus</p>
      </div>

      <div className="grid-4" style={{ marginBottom: 'var(--space-xl)' }}>
        <StatCard label="Total Students" value={stats.users?.students || 0} sub="Registered accounts" color="blue" />
        <StatCard label="Total Rooms"    value={stats.rooms?.total    || 0} sub={`${stats.rooms?.labs || 0} labs, ${stats.rooms?.classrooms || 0} classrooms`} color="green" />
        <StatCard label="Active Sections"value={stats.sections?.active || 0} sub="This semester" color="gold" />
        <StatCard label="Notifications"  value={stats.notifications?.published || 0} sub="Published" color="red" />
      </div>

      <div className="grid-2">
        <div className="card">
          <SectionHeader title="Room Types" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              ['Classrooms',    stats.rooms?.classrooms,    'classroom'],
              ['Lecture Halls', stats.rooms?.lecture_halls, 'lecture'],
              ['Labs',          stats.rooms?.labs,          'lab'],
              ['Offices',       stats.rooms?.offices,       'office'],
            ].map(([label, count, type]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13 }}>{label}</span>
                <Badge variant={type}>{count || 0}</Badge>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <SectionHeader title="Quick Actions" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { to: '/admin/floors',        label: 'Manage Floors & Upload Maps' },
              { to: '/admin/rooms',         label: 'Manage Rooms' },
              { to: '/admin/map-editor',    label: 'Open Map Editor' },
              { to: '/admin/schedule',      label: 'Manage Schedule' },
              { to: '/admin/notifications', label: 'Send Notification' },
              { to: '/admin/users',         label: 'Manage Users' },
            ].map(a => (
              <Link key={a.to} to={a.to} className="btn btn--secondary" style={{ justifyContent: 'flex-start' }}>
                {a.label} →
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color }) {
  return (
    <div className={`stat-card stat-card--${color}`}>
      <div className="stat-card__label">{label}</div>
      <div className="stat-card__value">{value}</div>
      {sub && <div className="stat-card__sub">{sub}</div>}
    </div>
  );
}

// ─── Admin Users ──────────────────────────────────────────────
export function AdminUsers() {
  const [page,   setPage]   = useState(1);
  const [search, setSearch] = useState('');
  const [role,   setRole]   = useState('');
  const [editUser,  setEditUser]  = useState(null);
  const [delUser,   setDelUser]   = useState(null);
  const [delLoading, setDelLoading] = useState(false);

  const { data, loading, refetch } = useAsync(
    () => userAPI.getAll({ page, limit: 20, search, role }),
    [page, search, role]
  );

  const users      = data?.users || [];
  const pagination = data?.pagination;

  const handleDelete = async () => {
    setDelLoading(true);
    try {
      await userAPI.delete(delUser.id);
      toast.success('User deleted');
      setDelUser(null);
      refetch();
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setDelLoading(false); }
  };

  const handleUpdateRole = async (userId, role, status) => {
    try {
      await userAPI.adminUpdate(userId, { role, status });
      toast.success('User updated');
      refetch();
      setEditUser(null);
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  const columns = [
    { key: 'name', label: 'Name', render: (_, r) => (
      <div>
        <div style={{ fontWeight: 600 }}>{r.first_name} {r.last_name}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.email}</div>
      </div>
    )},
    { key: 'student_id', label: 'ID', render: v => <span style={{ fontFamily: 'monospace' }}>{v || '—'}</span> },
    { key: 'role',   label: 'Role',   render: v => <Badge variant={v === 'student' ? 'blue' : 'amber'}>{v.replace('_',' ')}</Badge> },
    { key: 'status', label: 'Status', render: v => <Badge variant={statusBadgeClass(v).replace('badge--','')}>{statusLabel(v)}</Badge> },
    { key: 'department', label: 'Dept', render: v => v || '—' },
    { key: 'last_login', label: 'Last Login', render: v => formatDate(v) },
    { key: 'actions', label: '', render: (_, r) => (
      <div style={{ display: 'flex', gap: 4 }}>
        <button className="btn btn--ghost btn--sm btn--icon" onClick={() => setEditUser(r)} title="Edit"><EditIcon /></button>
        <button className="btn btn--ghost btn--sm btn--icon" onClick={() => setDelUser(r)} title="Delete" style={{ color: 'var(--red)' }}><TrashIcon /></button>
      </div>
    )},
  ];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Users</h1>
        <p className="page-sub">{pagination?.total || 0} total users</p>
      </div>

      <div className="card card--no-pad">
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <SearchInput value={search} onChange={v => { setSearch(v); setPage(1); }} onClear={() => { setSearch(''); setPage(1); }} placeholder="Search users…" />
          </div>
          <select className="form-input" style={{ width: 'auto' }} value={role} onChange={e => { setRole(e.target.value); setPage(1); }}>
            <option value="">All roles</option>
            <option value="student">Students</option>
            <option value="admin">Admins</option>
          </select>
        </div>
        <Table columns={columns} data={users} loading={loading} emptyMessage="No users found" />
        <div style={{ padding: '0 16px' }}>
          <Pagination pagination={pagination} onPageChange={setPage} />
        </div>
      </div>

      {/* Edit modal */}
      <Modal open={!!editUser} onClose={() => setEditUser(null)} title={`Edit: ${editUser?.first_name} ${editUser?.last_name}`}
        footer={<Button variant="secondary" onClick={() => setEditUser(null)}>Close</Button>}
      >
        {editUser && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Select label="Role" value={editUser.role}
              onChange={e => setEditUser(u => ({ ...u, role: e.target.value }))}
              options={[{value:'student',label:'Student'},{value:'admin',label:'Admin'},{value:'super_admin',label:'Super Admin'}]}
            />
            <Select label="Status" value={editUser.status}
              onChange={e => setEditUser(u => ({ ...u, status: e.target.value }))}
              options={[{value:'active',label:'Active'},{value:'inactive',label:'Inactive'},{value:'suspended',label:'Suspended'}]}
            />
            <Button variant="primary" onClick={() => handleUpdateRole(editUser.id, editUser.role, editUser.status)}>
              Save Changes
            </Button>
          </div>
        )}
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!delUser} onClose={() => setDelUser(null)}
        onConfirm={handleDelete} loading={delLoading} danger
        title="Delete User"
        message={`Are you sure you want to delete ${delUser?.first_name} ${delUser?.last_name}? This action cannot be undone.`}
      />
    </div>
  );
}

// ─── Admin Floors ─────────────────────────────────────────────
export function AdminFloors() {
  const [showCreate, setShowCreate] = useState(false);
  const [editFloor,  setEditFloor]  = useState(null);
  const [delFloor,   setDelFloor]   = useState(null);
  const [uploading,  setUploading]  = useState(null);
  const [delLoading, setDelLoading] = useState(false);

  const { data: bldData } = useAsync(() => floorAPI.getBuildings(), []);
  const buildings = bldData?.buildings || [];

  const { data, loading, refetch } = useAsync(() => floorAPI.getAll({ active_only: 'false' }), []);
  const floors = data?.floors || [];

  // Group by building
  const byBuilding = {};
  floors.forEach(f => {
    const k = f.building_code;
    if (!byBuilding[k]) byBuilding[k] = { name: f.building_name, code: f.building_code, id: f.building_id, floors: [] };
    byBuilding[k].floors.push(f);
  });

  const handleUploadMap = async (floorId, file) => {
    setUploading(floorId);
    try {
      await floorAPI.uploadMap(floorId, file);
      toast.success('Map uploaded successfully!');
      refetch();
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setUploading(null); }
  };

  const handleDelete = async () => {
    setDelLoading(true);
    try {
      await floorAPI.delete(delFloor.id);
      toast.success('Floor deleted');
      setDelFloor(null);
      refetch();
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setDelLoading(false); }
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">Floors & Maps</h1>
          <p className="page-sub">Upload and manage floor map images for each building</p>
        </div>
        <Button variant="primary" icon={<PlusIcon />} onClick={() => setShowCreate(true)}>Add Floor</Button>
      </div>

      {loading ? <Spinner center /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)' }}>
          {Object.values(byBuilding).map(bld => (
            <div key={bld.code} className="card card--no-pad">
              <div style={{ padding: '12px 16px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 15 }}>
                Block {bld.code} — {bld.name}
              </div>
              {bld.floors.map(floor => (
                <div key={floor.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
                  {/* Map thumbnail */}
                  <div style={{ width: 100, height: 60, border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden', flexShrink: 0, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {floor.map_image_url
                      ? <img src={floor.map_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>No map</span>
                    }
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{floor.floor_label} — {floor.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Floor {floor.floor_number}</div>
                    {floor.map_image_url && <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 2 }}>✓ Map uploaded</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <label className="btn btn--secondary btn--sm" style={{ cursor: 'pointer' }}>
                      {uploading === floor.id ? <Spinner size="sm" /> : '⬆ Upload Map'}
                      <input type="file" accept="image/*,.svg" style={{ display: 'none' }}
                        onChange={e => { if (e.target.files[0]) handleUploadMap(floor.id, e.target.files[0]); }} />
                    </label>
                    <Link to={`/admin/map-editor?floor=${floor.id}`} className="btn btn--secondary btn--sm">Edit Rooms</Link>
                    <button className="btn btn--ghost btn--sm btn--icon" onClick={() => setDelFloor(floor)} style={{ color: 'var(--red)' }}><TrashIcon /></button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Create floor modal */}
      <CreateFloorModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        buildings={buildings}
        onCreated={() => { setShowCreate(false); refetch(); }}
      />

      <ConfirmDialog
        open={!!delFloor} onClose={() => setDelFloor(null)}
        onConfirm={handleDelete} loading={delLoading} danger
        title="Delete Floor"
        message={`Delete floor "${delFloor?.floor_label}"? All rooms on this floor will also be deleted.`}
      />
    </div>
  );
}

function CreateFloorModal({ open, onClose, buildings, onCreated }) {
  const [form, setForm] = useState({ building_id: '', floor_number: '', floor_label: '', name: '' });
  const [loading, setLoading] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleCreate = async () => {
    setLoading(true);
    try {
      await floorAPI.create({ ...form, floor_number: parseInt(form.floor_number) });
      toast.success('Floor created');
      onCreated();
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setLoading(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add New Floor"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" loading={loading} onClick={handleCreate}>Create</Button></>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Select label="Building" required value={form.building_id} onChange={set('building_id')}
          options={buildings.map(b => ({ value: b.id, label: `Block ${b.code} — ${b.name}` }))}
          placeholder="Select building" />
        <div className="form-row">
          <Input label="Floor Number" type="number" required value={form.floor_number} onChange={set('floor_number')} placeholder="7" />
          <Input label="Floor Label"  required value={form.floor_label} onChange={set('floor_label')} placeholder="F7" />
        </div>
        <Input label="Floor Name" value={form.name} onChange={set('name')} placeholder="Engineering Floor 7" />
      </div>
    </Modal>
  );
}

// ─── Admin Schedule ───────────────────────────────────────────
export function AdminSchedule() {
  const [page,       setPage]      = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [editSec,    setEditSec]   = useState(null);
  const [delSec,     setDelSec]    = useState(null);
  const [delLoading, setDelLoading]= useState(false);

  const { sections, pagination, loading, refetch } = useAllSections({ page, limit: 20 });

  const handleDelete = async () => {
    setDelLoading(true);
    try {
      await scheduleAPI.delete(delSec.id);
      toast.success('Section deleted');
      setDelSec(null);
      refetch();
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setDelLoading(false); }
  };

  const columns = [
    { key: 'course_code', label: 'Course', render: (v, r) => (
      <div><div style={{ fontWeight: 600 }}>{v}</div><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.course_name}</div></div>
    )},
    { key: 'section_number', label: 'Section', render: v => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v}</span> },
    { key: 'days', label: 'Days', render: (_, r) => daysArrayToString(r.day_of_week) },
    { key: 'time', label: 'Time', render: (_, r) => `${formatTime(r.start_time)} – ${formatTime(r.end_time)}` },
    { key: 'room_number', label: 'Room', render: (v, r) => v ? <Badge variant="gray">Room {v}</Badge> : '—' },
    { key: 'instructor_name', label: 'Instructor', render: v => v || '—' },
    { key: 'enrolled', label: 'Enrolled', render: (v, r) => `${v}${r.max_capacity ? `/${r.max_capacity}` : ''}` },
    { key: 'actions', label: '', render: (_, r) => (
      <div style={{ display: 'flex', gap: 4 }}>
        <button className="btn btn--ghost btn--sm btn--icon" onClick={() => setEditSec(r)}><EditIcon /></button>
        <button className="btn btn--ghost btn--sm btn--icon" onClick={() => setDelSec(r)} style={{ color: 'var(--red)' }}><TrashIcon /></button>
      </div>
    )},
  ];

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div><h1 className="page-title">Schedule Management</h1><p className="page-sub">Manage course sections and room assignments</p></div>
        <Button variant="primary" icon={<PlusIcon />} onClick={() => setShowCreate(true)}>Add Section</Button>
      </div>
      <div className="card card--no-pad">
        <Table columns={columns} data={sections} loading={loading} emptyMessage="No sections found" />
        <div style={{ padding: '0 16px' }}><Pagination pagination={pagination} onPageChange={setPage} /></div>
      </div>
      <ConfirmDialog open={!!delSec} onClose={() => setDelSec(null)} onConfirm={handleDelete} loading={delLoading} danger
        title="Delete Section" message={`Delete section "${delSec?.course_code} - ${delSec?.section_number}"?`} />
    </div>
  );
}

// ─── Admin Notifications ──────────────────────────────────────
export function AdminNotifications() {
  const [showCreate, setShowCreate] = useState(false);
  const [page, setPage] = useState(1);

  const { data, loading, refetch } = useAsync(() => notificationAPI.getAll({ page, limit: 20 }), [page]);
  const notifications = data?.notifications || [];
  const pagination    = data?.pagination;

  const handleDelete = async (id) => {
    try { await notificationAPI.delete(id); toast.success('Deleted'); refetch(); }
    catch (err) { toast.error(getErrorMessage(err)); }
  };

  const columns = [
    { key: 'title', label: 'Title', render: (v, r) => (
      <div><div style={{ fontWeight: 600 }}>{v}</div><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.body?.slice(0, 60)}…</div></div>
    )},
    { key: 'type', label: 'Type', render: v => <Badge variant="gray">{v.replace('_',' ')}</Badge> },
    { key: 'sender_name', label: 'Sent by', render: v => v || '—' },
    { key: 'receipt_count', label: 'Recipients' },
    { key: 'read_count',    label: 'Read' },
    { key: 'published_at',  label: 'Date', render: v => formatDate(v) },
    { key: 'actions', label: '', render: (_, r) => (
      <button className="btn btn--ghost btn--sm btn--icon" onClick={() => handleDelete(r.id)} style={{ color: 'var(--red)' }}><TrashIcon /></button>
    )},
  ];

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div><h1 className="page-title">Notifications</h1><p className="page-sub">Send push notifications to students</p></div>
        <Button variant="primary" icon={<PlusIcon />} onClick={() => setShowCreate(true)}>Send Notification</Button>
      </div>
      <div className="card card--no-pad">
        <Table columns={columns} data={notifications} loading={loading} emptyMessage="No notifications sent yet" />
        <div style={{ padding: '0 16px' }}><Pagination pagination={pagination} onPageChange={setPage} /></div>
      </div>
      <CreateNotifModal open={showCreate} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); refetch(); }} />
    </div>
  );
}

function CreateNotifModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({ title: '', body: '', type: 'announcement', target_role: '', send_push: true });
  const [loading, setLoading] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSend = async () => {
    if (!form.title || !form.body) { toast.error('Title and body required'); return; }
    setLoading(true);
    try {
      const { data } = await notificationAPI.create({ ...form, target_role: form.target_role || undefined });
      toast.success(data.message || 'Notification sent');
      onCreated();
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setLoading(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Send Notification"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" loading={loading} onClick={handleSend}>Send</Button></>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Input label="Title" required value={form.title} onChange={set('title')} placeholder="Notification title" />
        <Textarea label="Message" required value={form.body} onChange={set('body')} placeholder="Notification body…" rows={3} />
        <div className="form-row">
          <Select label="Type" value={form.type} onChange={set('type')}
            options={['announcement','schedule_change','room_change','exam_reminder','system','custom'].map(v => ({ value: v, label: v.replace(/_/g,' ') }))} />
          <Select label="Target" value={form.target_role} onChange={set('target_role')} placeholder="All users"
            options={[{value:'student',label:'Students only'},{value:'admin',label:'Admins only'}]} />
        </div>
      </div>
    </Modal>
  );
}

import React, { useState, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  userAPI,
  roomAPI,
  scheduleAPI,
  announcementAPI,
  notificationAPI,
  floorAPI,
  courseAPI,
  instructorAPI
} from '../../api/index';
import { useAsync, useAllSections } from '../../hooks/index';
import {
  Table, Pagination, Button, Input, Select, Textarea,
  Modal, ConfirmDialog, Badge, Spinner, SectionHeader,
  SearchInput, SearchableSelect, PlusIcon, EditIcon, TrashIcon, EyeIcon,
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

  const roomTypes = Array.isArray(stats.rooms?.by_type)
    ? stats.rooms.by_type
    : [];

  const activeSections =
    stats.sections?.spring_active ??
    stats.sections?.active ??
    0;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Admin Dashboard</h1>
        <p className="page-sub">System overview for An-Najah Smart Campus</p>
      </div>

      <div className="grid-4" style={{ marginBottom: 'var(--space-xl)' }}>
        <StatCard
          label="Total Students"
          value={stats.users?.students || 0}
          sub={`${stats.users?.active || 0} active users`}
          color="blue"
        />

        <StatCard
          label="Total Rooms"
          value={stats.rooms?.total || 0}
          sub="All active mapped locations"
          color="green"
        />

        <StatCard
          label="Spring Sections"
          value={activeSections}
          sub="Spring 2025/2026"
          color="gold"
        />

        <StatCard
          label="Buildings"
          value={stats.buildings?.total || 0}
          sub="Active buildings"
          color="blue"
        />
      </div>

      <div className="grid-2">
        <div className="card">
          <SectionHeader title="Room Types From Database" />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {roomTypes.length === 0 ? (
              <div
                style={{
                  fontSize: 13,
                  color: 'var(--text-muted)',
                  padding: '10px 0'
                }}
              >
                No room type statistics found. Restart the backend and make sure
                <code style={{ marginLeft: 4 }}>rooms.by_type</code> is returned
                from <code>/api/users/stats</code>.
              </div>
            ) : (
              roomTypes.map((item) => (
                <div
                  key={item.type}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '7px 0',
                    borderBottom: '1px solid var(--border)'
                  }}
                >
                  <span style={{ fontSize: 13 }}>
                    {roomTypeLabel(item.type)}
                  </span>

                  <Badge variant={getRoomTypeBadgeVariant(item.type)}>
                    {Number(item.count) || 0}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card">
          <SectionHeader title="Quick Actions" />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { to: '/admin/floors', label: 'Manage Floors & Upload Maps' },
              { to: '/admin/rooms', label: 'Manage Rooms' },
              { to: '/admin/map-editor', label: '✏️ Open Map Editor' },
              { to: '/admin/schedule', label: 'Manage Schedule' },
              { to: '/admin/announcements', label: '📢 Manage Announcements' },
              { to: '/admin/notifications', label: '🔔 Send Notification' },
              { to: '/admin/users', label: 'Manage Users' }
            ].map((action) => (
              <Link
                key={action.to}
                to={action.to}
                className="btn btn--secondary"
                style={{ justifyContent: 'flex-start' }}
              >
                {action.label} →
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

function getRoomTypeBadgeVariant(type) {
  const map = {
    classroom: 'classroom',
    lecture_hall: 'lecture',
    lab: 'lab',
    office: 'office',
    restroom: 'blue',
    bathroom: 'blue',
    elevator: 'gray',
    stairs: 'gray',
    emergency_exit: 'red',
    storage: 'amber',
    meeting_room: 'green',
    professor_lounge: 'green',
    amphitheater: 'amber',
    engineering_drawing_room: 'blue',
    engineering_drawing_studio: 'blue',
    corridor: 'gray',
    atrium: 'gray',
    library: 'green',
    cafeteria: 'amber',
    bookstore: 'amber',
    other: 'gray'
  };

  return map[type] || 'gray';
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
  const [editFloor, setEditFloor] = useState(null);
  const [delFloor, setDelFloor] = useState(null);
  const [uploading, setUploading] = useState(null);
  const [delLoading, setDelLoading] = useState(false);

  const { data: bldData, loading: buildingsLoading } = useAsync(
    () => floorAPI.getBuildings(),
    []
  );

const allBuildings = bldData?.buildings || [];

const buildings =
  allBuildings.filter((building) => building.code === 'ENG').length > 0
    ? allBuildings.filter((building) => building.code === 'ENG')
    : allBuildings;

  const { data, loading, refetch } = useAsync(
    () => floorAPI.getAll({ active_only: 'false' }),
    []
  );

  const floors = data?.floors || [];

  const byBuilding = {};

  floors.forEach((floor) => {
    const key = floor.building_code || 'UNKNOWN';

    if (!byBuilding[key]) {
      byBuilding[key] = {
        name: floor.building_name,
        code: floor.building_code,
        id: floor.building_id,
        floors: []
      };
    }

    byBuilding[key].floors.push(floor);
  });

  Object.values(byBuilding).forEach((building) => {
    building.floors.sort((a, b) => {
      const aOrder = Number(a.display_order ?? a.floor_number ?? 0);
      const bOrder = Number(b.display_order ?? b.floor_number ?? 0);
      return aOrder - bOrder;
    });
  });

  const handleUploadMap = async (floorId, file) => {
    if (!file) return;

    setUploading(floorId);

    try {
      await floorAPI.uploadMap(floorId, file);
      toast.success('Map uploaded successfully');
      refetch();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setUploading(null);
    }
  };

  const handleDelete = async () => {
    if (!delFloor?.id) return;

    setDelLoading(true);

    try {
      await floorAPI.delete(delFloor.id);
      toast.success('Floor deleted');
      setDelFloor(null);
      refetch();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setDelLoading(false);
    }
  };

  return (
    <div>
      <div
        className="page-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16
        }}
      >
        <div>
          <h1 className="page-title">Floors & Maps</h1>
          <p className="page-sub">
            Add floors, upload floor map images, and open the room map editor.
          </p>
        </div>

        <Button
          variant="primary"
          icon={<PlusIcon />}
          onClick={() => setShowCreate(true)}
          disabled={buildingsLoading || buildings.length === 0}
        >
          Add Floor
        </Button>
      </div>

      {loading ? (
        <Spinner center />
      ) : floors.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state__icon">🏢</div>
            <p className="empty-state__title">No floors found</p>
            <p className="empty-state__sub">
              Create the first floor for your building.
            </p>
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-xl)'
          }}
        >
          {Object.values(byBuilding).map((building) => (
            <div key={building.code} className="card card--no-pad">
              <div
                style={{
                  padding: '12px 16px',
                  background: 'var(--bg)',
                  borderBottom: '1px solid var(--border)',
                  fontWeight: 700,
                  fontSize: 15,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12
                }}
              >
                <span>
                  Block {building.code} — {building.name}
                </span>

                <Badge variant="gray">
                  {building.floors.length} floor
                  {building.floors.length !== 1 ? 's' : ''}
                </Badge>
              </div>

              {building.floors.map((floor) => (
                <div
                  key={floor.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    padding: '14px 16px',
                    borderBottom: '1px solid var(--border)'
                  }}
                >
                  <div
                    style={{
                      width: 112,
                      height: 68,
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      overflow: 'hidden',
                      flexShrink: 0,
                      background: 'var(--bg)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {floor.map_image_url ? (
                      <img
                        src={floor.map_image_url}
                        alt={`${floor.floor_label} map`}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover'
                        }}
                      />
                    ) : (
                      <span
                        style={{
                          fontSize: 11,
                          color: 'var(--text-faint)'
                        }}
                      >
                        No map
                      </span>
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 14,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap'
                      }}
                    >
                      <span>
                        {floor.floor_label} — {floor.name || 'Unnamed floor'}
                      </span>

                      <Badge variant={floor.is_active ? 'green' : 'gray'}>
                        {floor.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>

                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--text-muted)',
                        marginTop: 3
                      }}
                    >
                      Floor number: {floor.floor_number} · Display order:{' '}
                      {floor.display_order ?? '—'}
                    </div>

                    <div
                      style={{
                        fontSize: 11,
                        color: floor.map_image_url
                          ? 'var(--green)'
                          : 'var(--text-faint)',
                        marginTop: 3
                      }}
                    >
                      {floor.map_image_url
                        ? `✓ Map uploaded: ${floor.map_image_url}`
                        : 'No map image uploaded'}
                    </div>

                    {(floor.map_width || floor.map_height) && (
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--text-muted)',
                          marginTop: 2
                        }}
                      >
                        Size: {floor.map_width || '—'} ×{' '}
                        {floor.map_height || '—'}
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      gap: 6,
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      justifyContent: 'flex-end'
                    }}
                  >
                    <label
                      className="btn btn--secondary btn--sm"
                      style={{ cursor: 'pointer' }}
                    >
                      {uploading === floor.id ? (
                        <Spinner size="sm" />
                      ) : (
                        '⬆ Upload Map'
                      )}

                      <input
                        type="file"
                        accept="image/*,.svg"
                        style={{ display: 'none' }}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) handleUploadMap(floor.id, file);
                          event.target.value = '';
                        }}
                      />
                    </label>

                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => setEditFloor(floor)}
                    >
                      Edit Floor
                    </button>

                    <Link
                      to={`/admin/map-editor?floor=${floor.id}`}
                      className="btn btn--secondary btn--sm"
                    >
                      Edit Rooms
                    </Link>

                    <button
                      type="button"
                      className="btn btn--ghost btn--sm btn--icon"
                      onClick={() => setDelFloor(floor)}
                      style={{ color: 'var(--red)' }}
                      title="Delete floor"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <FloorFormModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        buildings={buildings}
        onSaved={() => {
          setShowCreate(false);
          refetch();
        }}
        title="Add New Floor"
      />

      <FloorFormModal
        open={!!editFloor}
        onClose={() => setEditFloor(null)}
        buildings={buildings}
        existingFloor={editFloor}
        onSaved={() => {
          setEditFloor(null);
          refetch();
        }}
        title="Edit Floor"
      />

      <ConfirmDialog
        open={!!delFloor}
        onClose={() => setDelFloor(null)}
        onConfirm={handleDelete}
        loading={delLoading}
        danger
        title="Delete Floor"
        message={`Delete floor "${delFloor?.floor_label}"? All rooms on this floor may also be deleted or become unavailable depending on backend constraints.`}
      />
    </div>
  );
}

function FloorFormModal({
  open,
  onClose,
  buildings,
  existingFloor,
  onSaved,
  title
}) {
  const isEdit = Boolean(existingFloor?.id);

  const [form, setForm] = useState({
    building_id: '',
    floor_number: '',
    floor_label: '',
    name: '',
    map_image_url: '',
    map_width: '',
    map_height: '',
    display_order: '',
    is_active: true
  });

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const fileInputRef = React.useRef(null);
  const [selectedMapFile, setSelectedMapFile] = useState(null);
  

  React.useEffect(() => {
    if (!open) return;

    if (existingFloor) {
      setForm({
        building_id: existingFloor.building_id || '',
        floor_number:
          existingFloor.floor_number !== undefined &&
          existingFloor.floor_number !== null
            ? String(existingFloor.floor_number)
            : '',
        floor_label: existingFloor.floor_label || '',
        name: existingFloor.name || '',
        map_image_url: existingFloor.map_image_url || '',
        map_width:
          existingFloor.map_width !== undefined &&
          existingFloor.map_width !== null
            ? String(existingFloor.map_width)
            : '',
        map_height:
          existingFloor.map_height !== undefined &&
          existingFloor.map_height !== null
            ? String(existingFloor.map_height)
            : '',
        display_order:
          existingFloor.display_order !== undefined &&
          existingFloor.display_order !== null
            ? String(existingFloor.display_order)
            : '',
        is_active: existingFloor.is_active !== false
      });
    } else {
      setForm({
        building_id: buildings[0]?.id || '',
        floor_number: '',
        floor_label: '',
        name: '',
        map_image_url: '',
        map_width: '',
        map_height: '',
        display_order: '',
        is_active: true
      });
    }

    setErrors({});
  }, [open, existingFloor, buildings]);

  const set = (key) => (event) => {
    const value =
      event.target.type === 'checkbox'
        ? event.target.checked
        : event.target.value;

    setForm((current) => ({
      ...current,
      [key]: value
    }));
  };

  const validate = () => {
    const nextErrors = {};

    if (!form.building_id) {
      nextErrors.building_id = 'Building is required';
    }

    if (form.floor_number === '') {
      nextErrors.floor_number = 'Floor number is required';
    }

    if (!form.floor_label.trim()) {
      nextErrors.floor_label = 'Floor label is required';
    }

    if (
      form.map_width !== '' &&
      (!Number.isFinite(Number(form.map_width)) || Number(form.map_width) <= 0)
    ) {
      nextErrors.map_width = 'Map width must be a positive number';
    }

    if (
      form.map_height !== '' &&
      (!Number.isFinite(Number(form.map_height)) ||
        Number(form.map_height) <= 0)
    ) {
      nextErrors.map_height = 'Map height must be a positive number';
    }

    setErrors(nextErrors);

    return Object.keys(nextErrors).length === 0;
  };

  const buildPayload = () => {
    return {
      building_id: form.building_id,
      floor_number: Number(form.floor_number),
      floor_label: form.floor_label.trim(),
      name: form.name.trim() || null,
      map_image_url: form.map_image_url.trim() || null,
      map_width: form.map_width ? Number(form.map_width) : null,
      map_height: form.map_height ? Number(form.map_height) : null,
      display_order:
        form.display_order !== ''
          ? Number(form.display_order)
          : Number(form.floor_number),
      is_active: form.is_active
    };
  };

  const handleSelectMapFile = (event) => {
  const file = event.target.files?.[0];
  event.target.value = '';

  if (!file) return;

  if (!file.type.startsWith('image/')) {
    toast.error('Please select an image file.');
    return;
  }

  setSelectedMapFile(file);

  const previewUrl = URL.createObjectURL(file);
  const image = new Image();

  image.onload = () => {
    setForm((current) => ({
      ...current,
      map_width: image.naturalWidth ? String(image.naturalWidth) : current.map_width,
      map_height: image.naturalHeight ? String(image.naturalHeight) : current.map_height,
    }));

    URL.revokeObjectURL(previewUrl);
  };

  image.onerror = () => {
    URL.revokeObjectURL(previewUrl);
  };

  image.src = previewUrl;
};
  const handleSave = async () => {
  if (!validate()) return;

  setLoading(true);

  try {
    const payload = buildPayload();

    let savedFloorId = existingFloor?.id;

    if (isEdit) {
      await floorAPI.update(existingFloor.id, payload);
      savedFloorId = existingFloor.id;
    } else {
      const response = await floorAPI.create(payload);

      savedFloorId =
        response?.data?.data?.floor?.id ||
        response?.data?.floor?.id ||
        response?.data?.id;
    }

    if (selectedMapFile && savedFloorId) {
      await floorAPI.uploadMap(savedFloorId, selectedMapFile);
    }

    toast.success(
      selectedMapFile
        ? isEdit
          ? 'Floor and map image updated'
          : 'Floor created and map image uploaded'
        : isEdit
          ? 'Floor updated'
          : 'Floor created'
    );

    onSaved();
  } catch (err) {
    toast.error(getErrorMessage(err));
  } finally {
    setLoading(false);
  }
};

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>

          <Button variant="primary" loading={loading} onClick={handleSave}>
            {isEdit ? 'Save Changes' : 'Create Floor'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Select
          label="Building"
          required
          value={form.building_id}
          onChange={set('building_id')}
          disabled={isEdit}
          options={buildings.map((building) => ({
            value: building.id,
            label: `Block ${building.code} — ${building.name}`
          }))}
          placeholder="Select building"
        />

        {errors.building_id && (
          <span className="form-error">{errors.building_id}</span>
        )}

        <div className="form-row">
          <Input
            label="Floor Number"
            type="number"
            required
            value={form.floor_number}
            onChange={set('floor_number')}
            placeholder="-2, -1, 0, 1, 2..."
            error={errors.floor_number}
          />

          <Input
            label="Floor Label"
            required
            value={form.floor_label}
            onChange={set('floor_label')}
            placeholder="B2, B1, G, 1, 2..."
            error={errors.floor_label}
          />
        </div>

        <Input
          label="Floor Name"
          value={form.name}
          onChange={set('name')}
          placeholder="Second Floor — الطابق الثاني"
        />

      <div className="form-group">
  <label className="form-label">Map Image</label>

  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      flexWrap: 'wrap',
    }}
  >
    <button
      type="button"
      className="btn btn--secondary"
      onClick={() => fileInputRef.current?.click()}
    >
      {selectedMapFile ? 'Change Map Image' : 'Choose Map Image'}
    </button>

    <input
      ref={fileInputRef}
      type="file"
      accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
      style={{ display: 'none' }}
      onChange={handleSelectMapFile}
    />

    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
      {selectedMapFile
        ? selectedMapFile.name
        : form.map_image_url
          ? form.map_image_url
          : 'No image selected'}
    </span>
  </div>

  {form.map_image_url && !selectedMapFile && (
    <div style={{ marginTop: 8 }}>
      <img
        src={form.map_image_url}
        alt="Current floor map"
        style={{
          width: 160,
          height: 90,
          objectFit: 'cover',
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'var(--bg)',
        }}
      />
    </div>
  )}
</div>

        <div className="form-row">
          <Input
            label="Map Width"
            type="number"
            value={form.map_width}
            onChange={set('map_width')}
            placeholder="1533"
            error={errors.map_width}
          />

          <Input
            label="Map Height"
            type="number"
            value={form.map_height}
            onChange={set('map_height')}
            placeholder="1026"
            error={errors.map_height}
          />
        </div>

        <Input
          label="Display Order"
          type="number"
          value={form.display_order}
          onChange={set('display_order')}
          placeholder="0"
        />

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            color: 'var(--text)'
          }}
        >
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={set('is_active')}
          />
          Active floor
        </label>
      </div>
    </Modal>
  );
}




const SEMESTER_OPTIONS = [
  { value: 'fall', label: 'Fall' },
  { value: 'spring', label: 'Spring' },
  { value: 'summer', label: 'Summer' },
];

const DAY_OPTIONS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

function unwrapApiResponse(response) {
  return response?.data?.data || response?.data || response || {};
}

function getNextAcademicYear() {
  const now = new Date();
  const year = now.getFullYear();
  const startYear = now.getMonth() >= 7 ? year : year - 1;

  return `${startYear}/${startYear + 1}`;
}

function getNextSemesterDefault() {
  const month = new Date().getMonth();

  if (month >= 0 && month <= 4) return 'summer';
  if (month >= 5 && month <= 7) return 'fall';

  return 'spring';
}

function emptySectionForm() {
  return {
    course_id: '',
    instructor_id: '',
    room_id: '',
    semester: getNextSemesterDefault(),
    academic_year: getNextAcademicYear(),
    section_number: '',
    day_of_week: [],
    start_time: '',
    end_time: '',
    max_capacity: '',
  };
}

function normalizeTimeInput(value) {
  return String(value || '').slice(0, 5);
}

function sectionToForm(section) {
  return {
    course_id: section.course_id || '',
    instructor_id: section.instructor_id || '',
    room_id: section.room_id || '',
    semester: section.semester || getNextSemesterDefault(),
    academic_year: section.academic_year || getNextAcademicYear(),
    section_number: section.section_number || '',
    day_of_week: Array.isArray(section.day_of_week)
      ? section.day_of_week.map(Number)
      : [],
    start_time: normalizeTimeInput(section.start_time),
    end_time: normalizeTimeInput(section.end_time),
    max_capacity:
      section.max_capacity !== null && section.max_capacity !== undefined
        ? String(section.max_capacity)
        : '',
  };
}

// ─── Admin Schedule ───────────────────────────────────────────
export function AdminSchedule() {
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [editSec, setEditSec] = useState(null);
  const [delSec, setDelSec] = useState(null);
  const [delLoading, setDelLoading] = useState(false);

  const [filters, setFilters] = useState({
    semester: getNextSemesterDefault(),
    academic_year: getNextAcademicYear(),
  });

  const { sections, pagination, loading, refetch } = useAllSections({
    page,
    limit: 20,
    semester: filters.semester || undefined,
    academic_year: filters.academic_year || undefined,
  });

  const handleDelete = async () => {
    if (!delSec?.id) return;

    setDelLoading(true);

    try {
      await scheduleAPI.delete(delSec.id);
      toast.success('Doctor schedule deleted');
      setDelSec(null);
      refetch();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setDelLoading(false);
    }
  };

  const columns = [
    {
      key: 'course_code',
      label: 'Course',
      render: (v, r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{v}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {r.course_name}
          </div>
        </div>
      ),
    },
    {
      key: 'section_number',
      label: 'Section',
      render: v => (
        <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
          {v}
        </span>
      ),
    },
    {
      key: 'semester',
      label: 'Semester',
      render: (v, r) => (
        <Badge variant="blue">
          {semesterLabel?.(v) || v} {r.academic_year}
        </Badge>
      ),
    },
    {
      key: 'days',
      label: 'Days',
      render: (_, r) => daysArrayToString(r.day_of_week),
    },
    {
      key: 'time',
      label: 'Time',
      render: (_, r) => `${formatTime(r.start_time)} – ${formatTime(r.end_time)}`,
    },
    {
      key: 'room_number',
      label: 'Room',
      render: v => (v ? <Badge variant="gray">Room {v}</Badge> : '—'),
    },
    {
      key: 'instructor_name',
      label: 'Doctor',
      render: v => v || '—',
    },
    {
      key: 'enrolled',
      label: 'Enrolled',
      render: (v, r) => `${v}${r.max_capacity ? `/${r.max_capacity}` : ''}`,
    },
    {
      key: 'actions',
      label: '',
      render: (_, r) => (
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            type="button"
            className="btn btn--ghost btn--sm btn--icon"
            onClick={() => setEditSec(r)}
            title="Edit schedule"
          >
            <EditIcon />
          </button>

          <button
            type="button"
            className="btn btn--ghost btn--sm btn--icon"
            onClick={() => setDelSec(r)}
            style={{ color: 'var(--red)' }}
            title="Delete schedule"
          >
            <TrashIcon />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div
        className="page-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}
      >
        <div>
          <h1 className="page-title">Doctor Schedule Management</h1>
          <p className="page-sub">
            Create and manage doctors&apos; teaching schedules for the next semester
          </p>
        </div>

        <Button
          variant="primary"
          icon={<PlusIcon />}
          onClick={() => setShowCreate(true)}
        >
          Add Doctor Schedule
        </Button>
      </div>

      <div
        className="card card--sm"
        style={{
          marginBottom: 'var(--space-lg)',
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <Select
          label="Semester"
          value={filters.semester}
          onChange={event => {
            setFilters(current => ({
              ...current,
              semester: event.target.value,
            }));
            setPage(1);
          }}
          options={SEMESTER_OPTIONS}
          style={{ width: 180 }}
        />

        <Input
          label="Academic Year"
          value={filters.academic_year}
          onChange={event => {
            setFilters(current => ({
              ...current,
              academic_year: event.target.value,
            }));
            setPage(1);
          }}
          placeholder="2026/2027"
          style={{ width: 180 }}
        />
      </div>

      <div className="card card--no-pad">
        <Table
          columns={columns}
          data={sections}
          loading={loading}
          emptyMessage="No doctor schedules found for this semester"
        />

        <div style={{ padding: '0 16px' }}>
          <Pagination pagination={pagination} onPageChange={setPage} />
        </div>
      </div>

      <SectionFormModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSaved={() => {
          setShowCreate(false);
          refetch();
        }}
        defaultSemester={filters.semester}
        defaultAcademicYear={filters.academic_year}
        title="Add Doctor Schedule"
      />

      <SectionFormModal
        open={!!editSec}
        onClose={() => setEditSec(null)}
        existingSection={editSec}
        onSaved={() => {
          setEditSec(null);
          refetch();
        }}
        defaultSemester={filters.semester}
        defaultAcademicYear={filters.academic_year}
        title="Edit Doctor Schedule"
      />

      <ConfirmDialog
        open={!!delSec}
        onClose={() => setDelSec(null)}
        onConfirm={handleDelete}
        loading={delLoading}
        danger
        title="Delete Doctor Schedule"
        message={`Delete schedule "${delSec?.course_code} - ${delSec?.section_number}"?`}
      />
    </div>
  );
}

export function SectionFormModal({
  open,
  onClose,
  existingSection,
  onSaved,
  defaultSemester,
  defaultAcademicYear,
  title,
  // Optional pre-loaded lookup data. When provided the modal skips its
  // internal fetch and uses these arrays directly.
  externalCourses,
  externalInstructors,
  externalRooms,
}) {
  const isEdit = Boolean(existingSection?.id);

  const [form, setForm] = useState(emptySectionForm());
  const [loading, setLoading] = useState(false);
  const [lookupsLoading, setLookupsLoading] = useState(false);
  const [courses, setCourses] = useState([]);
  const [instructors, setInstructors] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [errors, setErrors] = useState({});

  const loadLookups = useCallback(async () => {
    setLookupsLoading(true);

    try {
      const [coursesResponse, instructorsResponse, roomsResponse] =
        await Promise.all([
          courseAPI.getAll({ limit: 1000 }),
          instructorAPI.getAll({ limit: 1000, active_only: 'true' }),
          roomAPI.getAll({ limit: 2000, active_only: 'true' }),
        ]);

      const coursesPayload = unwrapApiResponse(coursesResponse);
      const instructorsPayload = unwrapApiResponse(instructorsResponse);
      const roomsPayload = unwrapApiResponse(roomsResponse);

      setCourses(coursesPayload.courses || []);
      setInstructors(instructorsPayload.instructors || []);
      setRooms(roomsPayload.rooms || []);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLookupsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;

    // Skip internal fetch when the caller already supplies the data.
    if (!externalCourses) loadLookups();

    if (existingSection) {
      setForm(sectionToForm(existingSection));
    } else {
      setForm({
        ...emptySectionForm(),
        semester: defaultSemester || getNextSemesterDefault(),
        academic_year: defaultAcademicYear || getNextAcademicYear(),
      });
    }

    setErrors({});
  }, [
    open,
    existingSection,
    defaultSemester,
    defaultAcademicYear,
    loadLookups,
    externalCourses,
  ]);

  const set = key => event => {
    setForm(current => ({
      ...current,
      [key]: event.target.value,
    }));
  };

  // For SearchableSelect — receives the value directly (not a DOM event)
  const setVal = key => val => setForm(current => ({ ...current, [key]: val }));

  const toggleDay = day => {
    setForm(current => {
      const currentDays = Array.isArray(current.day_of_week)
        ? current.day_of_week
        : [];

      const exists = currentDays.includes(day);

      return {
        ...current,
        day_of_week: exists
          ? currentDays.filter(item => item !== day)
          : [...currentDays, day].sort((a, b) => a - b),
      };
    });
  };

  const validate = () => {
    const nextErrors = {};

    if (!form.course_id) nextErrors.course_id = 'Course is required.';
    if (!form.instructor_id) nextErrors.instructor_id = 'Doctor is required.';
    if (!form.section_number.trim()) {
      nextErrors.section_number = 'Section number is required.';
    }

    if (!form.semester) nextErrors.semester = 'Semester is required.';

    if (!/^\d{4}\/\d{4}$/.test(form.academic_year || '')) {
      nextErrors.academic_year = 'Academic year must be like 2026/2027.';
    }

    if (!Array.isArray(form.day_of_week) || !form.day_of_week.length) {
      nextErrors.day_of_week = 'Choose at least one day.';
    }

    if (!form.start_time) nextErrors.start_time = 'Start time is required.';
    if (!form.end_time) nextErrors.end_time = 'End time is required.';

    if (form.start_time && form.end_time && form.start_time >= form.end_time) {
      nextErrors.end_time = 'End time must be after start time.';
    }

    if (
      String(form.max_capacity || '').trim() &&
      Number(form.max_capacity) < 0
    ) {
      nextErrors.max_capacity = 'Capacity must be zero or more.';
    }

    setErrors(nextErrors);

    return Object.keys(nextErrors).length === 0;
  };

  const buildPayload = () => ({
    course_id: form.course_id,
    instructor_id: form.instructor_id || null,
    room_id: form.room_id || null,
    semester: form.semester,
    academic_year: form.academic_year,
    section_number: String(form.section_number || '').trim(),
    day_of_week: form.day_of_week.map(Number),
    start_time: form.start_time,
    end_time: form.end_time,
    max_capacity: form.max_capacity ? Number(form.max_capacity) : null,
  });

  const handleSave = async () => {
    if (!validate()) return;

    setLoading(true);

    try {
      const payload = buildPayload();

      if (isEdit) {
        await scheduleAPI.update(existingSection.id, payload);
        toast.success('Doctor schedule updated');
      } else {
        await scheduleAPI.create(payload);
        toast.success('Doctor schedule created');
      }

      onSaved();
    } catch (err) {
      const message =
        err.response?.data?.message ||
        err.response?.data?.error ||
        getErrorMessage(err);

      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  // Prefer external data when supplied by the parent.
  const activeCourses     = externalCourses     ?? courses;
  const activeInstructors = externalInstructors ?? instructors;
  const activeRooms       = externalRooms       ?? rooms;

  const courseOptions = activeCourses.map(course => {
    const parts = [course.code, course.name];
    if (course.department) parts.push(course.department);
    return { value: course.id, label: parts.join(' — ') };
  });

  const instructorOptions = activeInstructors.map(instructor => {
    const name = instructor.instructor_name ||
      `${instructor.title || ''} ${instructor.first_name || ''} ${instructor.last_name || ''}`.trim() ||
      instructor.email;
    return {
      value: instructor.id,
      label: instructor.department ? `${name} — ${instructor.department}` : name,
    };
  });

  const roomOptions = activeRooms.map(room => {
    const parts = [room.room_number];
    if (room.type) parts.push(room.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
    if (room.capacity) parts.push(`Cap: ${room.capacity}`);
    return { value: room.id, label: parts.join(' — ') };
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>

          <Button
            variant="primary"
            loading={loading}
            onClick={handleSave}
            disabled={lookupsLoading}
          >
            Save Schedule
          </Button>
        </>
      }
    >
      {lookupsLoading && !externalCourses ? (
        <Spinner center />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-row">
            <SearchableSelect
              label="Course"
              required
              value={form.course_id}
              onChange={setVal('course_id')}
              options={courseOptions}
              placeholder="Select course…"
              error={errors.course_id}
            />

            <SearchableSelect
              label="Doctor"
              required
              value={form.instructor_id}
              onChange={setVal('instructor_id')}
              options={instructorOptions}
              placeholder="Select doctor…"
              error={errors.instructor_id}
            />
          </div>

          <div className="form-row">
            <Input
              label="Section Number"
              required
              value={form.section_number}
              onChange={set('section_number')}
              placeholder="1"
              error={errors.section_number}
            />

            <SearchableSelect
              label="Room"
              value={form.room_id}
              onChange={setVal('room_id')}
              options={roomOptions}
              placeholder="No room yet"
            />
          </div>

          <div className="form-row">
            <Select
              label="Semester"
              required
              value={form.semester}
              onChange={set('semester')}
              options={SEMESTER_OPTIONS}
              error={errors.semester}
            />

            <Input
              label="Academic Year"
              required
              value={form.academic_year}
              onChange={set('academic_year')}
              placeholder="2026/2027"
              error={errors.academic_year}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Days *</label>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              {DAY_OPTIONS.map(day => (
                <label
                  key={day.value}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 10px',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: form.day_of_week.includes(day.value)
                      ? 'var(--najah-blue-50)'
                      : 'var(--card)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={form.day_of_week.includes(day.value)}
                    onChange={() => toggleDay(day.value)}
                  />
                  {day.label}
                </label>
              ))}
            </div>

            {errors.day_of_week && (
              <div className="form-error">{errors.day_of_week}</div>
            )}
          </div>

          <div className="form-row">
            <Input
              label="Start Time"
              type="time"
              required
              value={form.start_time}
              onChange={set('start_time')}
              error={errors.start_time}
            />

            <Input
              label="End Time"
              type="time"
              required
              value={form.end_time}
              onChange={set('end_time')}
              error={errors.end_time}
            />

            <Input
              label="Max Capacity"
              type="number"
              value={form.max_capacity}
              onChange={set('max_capacity')}
              placeholder="Optional"
              error={errors.max_capacity}
            />
          </div>
        </div>
      )}
    </Modal>
  );
}


// ─── Admin Announcements ─────────────────────────────────────
const ANNOUNCEMENT_TARGETS = [
  { value: 'all', label: 'Everyone' },
  { value: 'students', label: 'Students' },
  { value: 'professors', label: 'Professors' },
];

function normalizeDepartmentOptions(raw) {
  const payload = raw?.data?.data || raw?.data || raw || {};

  const list = Array.isArray(payload?.departments)
    ? payload.departments
    : Array.isArray(raw?.departments)
      ? raw.departments
      : Array.isArray(raw)
        ? raw
        : [];

  return list
    .map(item => {
      if (typeof item === 'string') return item;
      return item.department || item.name || item.value || '';
    })
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .filter((value, index, arr) => arr.indexOf(value) === index)
    .sort((a, b) => a.localeCompare(b, 'en'));
}

function targetRoleLabel(value) {
  return ANNOUNCEMENT_TARGETS.find(item => item.value === value)?.label || 'Everyone';
}

export function AdminAnnouncements() {
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [editAnnouncement, setEditAnnouncement] = useState(null);
  const [delAnnouncement, setDelAnnouncement] = useState(null);
  const [delLoading, setDelLoading] = useState(false);

  const { data, loading, refetch } = useAsync(
    () => announcementAPI.getAll({ page, limit: 20 }),
    [page]
  );

  const announcements = data?.announcements || [];
  const pagination = data?.pagination;

  const handleDelete = async () => {
    if (!delAnnouncement?.id) return;

    setDelLoading(true);
    try {
      await announcementAPI.delete(delAnnouncement.id);
      toast.success('Announcement deleted');
      setDelAnnouncement(null);
      refetch();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setDelLoading(false);
    }
  };

  const columns = [
    {
      key: 'title',
      label: 'Title',
      render: (value, row) => (
        <div>
          <div style={{ fontWeight: 700 }}>{value}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {String(row.content || '').slice(0, 90)}{String(row.content || '').length > 90 ? '…' : ''}
          </div>
        </div>
      ),
    },
    {
      key: 'target_role',
      label: 'Recipients',
      render: (_, row) => (
        <div>
          <Badge variant={row.target_role === 'professors' ? 'amber' : row.target_role === 'students' ? 'blue' : 'green'}>
            {targetRoleLabel(row.target_role || 'all')}
          </Badge>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            {row.target_department === 'all' || !row.target_department
              ? 'All departments'
              : row.target_department}
          </div>
        </div>
      ),
    },
    {
      key: 'is_published',
      label: 'Status',
      render: (_, row) => {
        const status = getAnnouncementStatus(row);

        return (
          <Badge variant={status.variant}>
            {status.label}
          </Badge>
        );
      },
    },
    {
      key: 'published_at',
      label: 'Spread Time',
      render: value => value ? formatDate(value) : '—',
    },
    {
      key: 'is_pinned',
      label: 'Pinned',
      render: value => (value ? '📌' : '—'),
    },
    {
      key: 'expires_at',
      label: 'Expires',
      render: value => value ? formatDate(value) : '—',
    },
    {
      key: 'created_at',
      label: 'Created',
      render: value => formatDate(value),
    },
    {
      key: 'actions',
      label: '',
      render: (_, row) => (
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            type="button"
            className="btn btn--ghost btn--sm btn--icon"
            onClick={() => setEditAnnouncement(row)}
            title="Edit"
          >
            <EditIcon />
          </button>

          <button
            type="button"
            className="btn btn--ghost btn--sm btn--icon"
            onClick={() => setDelAnnouncement(row)}
            title="Delete"
            style={{ color: 'var(--red)' }}
          >
            <TrashIcon />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div
        className="page-header"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
      >
        <div>
          <h1 className="page-title">Announcements</h1>
          <p className="page-sub">
            Create targeted announcements for students or professors by department.
          </p>
        </div>

        <Button
          variant="primary"
          icon={<PlusIcon />}
          onClick={() => setShowCreate(true)}
        >
          New Announcement
        </Button>
      </div>

      <div className="card card--no-pad">
        <Table
          columns={columns}
          data={announcements}
          loading={loading}
          emptyMessage="No announcements yet"
        />
        <div style={{ padding: '0 16px' }}>
          <Pagination pagination={pagination} onPageChange={setPage} />
        </div>
      </div>

      <AnnouncementFormModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSaved={() => {
          setShowCreate(false);
          refetch();
        }}
        title="Create Announcement"
      />

      <AnnouncementFormModal
        open={!!editAnnouncement}
        existingAnnouncement={editAnnouncement}
        onClose={() => setEditAnnouncement(null)}
        onSaved={() => {
          setEditAnnouncement(null);
          refetch();
        }}
        title="Edit Announcement"
      />

      <ConfirmDialog
        open={!!delAnnouncement}
        onClose={() => setDelAnnouncement(null)}
        onConfirm={handleDelete}
        loading={delLoading}
        danger
        title="Delete Announcement"
        message={`Delete announcement "${delAnnouncement?.title}"?`}
      />
    </div>
  );
}

function emptyAnnouncementForm() {
  return {
    title: '',
    content: '',
    target_role: 'all',
    target_department: 'all',
    is_pinned: false,
    publish_mode: 'now',
    publish_at: '',
    is_published: true,
    expires_at: '',
  };
}

function toDateInputValue(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function toDateTimeLocalValue(value) {
  if (!value) return '';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 16);
  }

  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);

  return local.toISOString().slice(0, 16);
}

function getAnnouncementPublishMode(announcement) {
  if (!announcement?.is_published) return 'draft';

  if (
    announcement.published_at &&
    new Date(announcement.published_at).getTime() > Date.now()
  ) {
    return 'scheduled';
  }

  return 'now';
}

function getAnnouncementStatus(announcement) {
  if (!announcement?.is_published) return { label: 'Draft', variant: 'gray' };

  if (
    announcement.published_at &&
    new Date(announcement.published_at).getTime() > Date.now()
  ) {
    return { label: 'Scheduled', variant: 'amber' };
  }

  return { label: 'Published', variant: 'green' };
}

function AnnouncementFormModal({
  open,
  onClose,
  onSaved,
  title,
  existingAnnouncement,
}) {
  const isEdit = Boolean(existingAnnouncement?.id);
  const [form, setForm] = useState(emptyAnnouncementForm());
  const [imageFile, setImageFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const { data: departmentsData } = useAsync(
    () => announcementAPI.getDepartments(),
    []
  );

  const departmentOptions = [
    { value: 'all', label: 'All departments' },
    ...normalizeDepartmentOptions(departmentsData).map(department => ({
      value: department,
      label: department,
    })),
  ];

  useEffect(() => {
    if (!open) return;

    if (existingAnnouncement) {
      setForm({
        title: existingAnnouncement.title || '',
        content: existingAnnouncement.content || '',
        target_role: existingAnnouncement.target_role || 'all',
        target_department: existingAnnouncement.target_department || 'all',
        is_pinned: existingAnnouncement.is_pinned === true,
        publish_mode: getAnnouncementPublishMode(existingAnnouncement),
        publish_at: toDateTimeLocalValue(existingAnnouncement.published_at),
        is_published: existingAnnouncement.is_published !== false,
        expires_at: toDateInputValue(existingAnnouncement.expires_at),
      });
    } else {
      setForm(emptyAnnouncementForm());
    }

    setImageFile(null);
    setErrors({});
  }, [open, existingAnnouncement]);

  const set = key => event => {
    const value = event.target.type === 'checkbox'
      ? event.target.checked
      : event.target.value;

    setForm(current => ({ ...current, [key]: value }));
  };

  const validate = () => {
    const nextErrors = {};

    if (!String(form.title || '').trim()) {
      nextErrors.title = 'Title is required.';
    }

    if (!String(form.content || '').trim()) {
      nextErrors.content = 'Content is required.';
    }

    if (!['all', 'students', 'professors'].includes(form.target_role)) {
      nextErrors.target_role = 'Choose a valid recipient type.';
    }

    if (!String(form.target_department || '').trim()) {
      nextErrors.target_department = 'Choose a department scope.';
    }

    if (form.publish_mode === 'scheduled') {
      if (!form.publish_at) {
        nextErrors.publish_at = 'Choose when this announcement should spread.';
      } else if (new Date(form.publish_at).getTime() <= Date.now()) {
        nextErrors.publish_at = 'Scheduled spread time must be in the future.';
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;

    setLoading(true);

    try {
      const payload = {
        title: String(form.title || '').trim(),
        content: String(form.content || '').trim(),
        target_role: form.target_role || 'all',
        target_department: form.target_department || 'all',
        is_pinned: Boolean(form.is_pinned),
        is_published: form.publish_mode !== 'draft',
        publish_at: form.publish_mode === 'scheduled' ? form.publish_at : null,
        expires_at: form.expires_at || null,
      };

      if (isEdit) {
        await announcementAPI.update(existingAnnouncement.id, payload, imageFile);
        toast.success('Announcement updated');
      } else {
        await announcementAPI.create(payload, imageFile);
        toast.success('Announcement created');
      }

      onSaved();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>

          <Button variant="primary" loading={loading} onClick={handleSave}>
            Save Announcement
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Input
          label="Title"
          required
          value={form.title}
          onChange={set('title')}
          error={errors.title}
          placeholder="Announcement title"
        />

        <Textarea
          label="Content"
          required
          value={form.content}
          onChange={set('content')}
          error={errors.content}
          placeholder="Write the announcement content…"
          rows={5}
        />

        <div className="form-row">
          <Select
            label="Recipient"
            required
            value={form.target_role}
            onChange={set('target_role')}
            options={ANNOUNCEMENT_TARGETS}
            error={errors.target_role}
          />

          <Select
            label="Department Scope"
            required
            value={form.target_department}
            onChange={set('target_department')}
            options={departmentOptions}
            error={errors.target_department}
          />
        </div>

        <div className="form-row">
          <Input
            label="Expires At"
            type="date"
            value={form.expires_at}
            onChange={set('expires_at')}
          />

          <div className="form-group">
            <label className="form-label">Image</label>
            <input
              type="file"
              accept="image/*"
              className="form-input"
              onChange={event => setImageFile(event.target.files?.[0] || null)}
            />
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={form.is_pinned}
            onChange={set('is_pinned')}
          />
          Pin this announcement
        </label>

        <div className="form-row">
          <Select
            label="Determine when it will spread"
            required
            value={form.publish_mode}
            onChange={set('publish_mode')}
            options={[
              { value: 'now', label: 'Spread immediately' },
              { value: 'scheduled', label: 'Schedule for later' },
              { value: 'draft', label: 'Save as draft' },
            ]}
          />

          {form.publish_mode === 'scheduled' ? (
            <Input
              label="Spread At"
              type="datetime-local"
              required
              value={form.publish_at}
              onChange={set('publish_at')}
              error={errors.publish_at}
            />
          ) : (
            <div className="form-group">
              <label className="form-label">Spread At</label>
              <div
                className="form-input"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  color: 'var(--text-muted)',
                  background: 'var(--bg)',
                }}
              >
                {form.publish_mode === 'draft'
                  ? 'Not visible until published'
                  : 'Immediately after saving'}
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
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

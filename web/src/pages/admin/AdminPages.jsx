import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
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
import { useAsync, useAllSections, useRoomTypes } from '../../hooks/index';
import { RoomFormModal } from './AdminRoomsPage';
import {
  Table, Pagination, Button, Input, Select, Textarea,
  Modal, ConfirmDialog, Badge, Spinner, SectionHeader,
  SearchInput, SearchableSelect, PlusIcon, EditIcon, TrashIcon, EyeIcon,
} from '../../components/ui/index';
import {
  formatDate, formatTime, daysArrayToString, statusBadgeClass,
  statusLabel, roomTypeLabel, roomTypeBadgeClass, getErrorMessage, semesterLabel,
} from '../../utils/helpers';
import toast from 'react-hot-toast';
import { RoomAvailabilityMap } from '../../components/map/RoomAvailabilityMap';


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
              { to: '/admin/floors', label: 'Manage Floors & Rooms' },
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
  const [selectedBuildingId, setSelectedBuildingId] = useState(null);
  const [showBuildingManager, setShowBuildingManager] = useState(false);
  const [showRoomsFor, setShowRoomsFor] = useState(null);

  const { data: bldData, loading: buildingsLoading, refetch: refetchBuildings } = useAsync(
    () => floorAPI.getBuildings(),
    []
  );

  const allBuildings = bldData?.buildings || [];

  // Auto-select: prefer ENG if present, otherwise first building
  useEffect(() => {
    if (selectedBuildingId || allBuildings.length === 0) return;
    const preferred = allBuildings.find(b => b.code === 'ENG') ?? allBuildings[0];
    setSelectedBuildingId(preferred.id);
  }, [allBuildings]); // eslint-disable-line react-hooks/exhaustive-deps

  // If selectedBuildingId is no longer in the active list (after archive/delete), auto-select
  useEffect(() => {
    if (!selectedBuildingId || allBuildings.length === 0) return;
    if (!allBuildings.find(b => b.id === selectedBuildingId)) {
      const preferred = allBuildings.find(b => b.code === 'ENG') ?? allBuildings[0];
      setSelectedBuildingId(preferred?.id ?? null);
    }
  }, [allBuildings, selectedBuildingId]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedBuilding = allBuildings.find(b => b.id === selectedBuildingId) ?? null;

  const { data, loading, refetch } = useAsync(
    () => floorAPI.getAll({ active_only: 'false' }),
    []
  );

  const floors = data?.floors || [];

  const selectedFloors = floors
    .filter(f => f.building_id === selectedBuildingId)
    .sort((a, b) =>
      Number(a.display_order ?? a.floor_number ?? 0) -
      Number(b.display_order ?? b.floor_number ?? 0)
    );

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
          disabled={buildingsLoading || allBuildings.length === 0 || !selectedBuildingId}
        >
          Add Floor
        </Button>
      </div>

      {/* ── College / Building selector ── */}
      <div className="card" style={{ marginBottom: 16, padding: '12px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            College / Building
          </span>

          {buildingsLoading ? (
            <Spinner size="sm" />
          ) : allBuildings.length === 0 ? (
            <span style={{ fontSize: 13, color: 'var(--text-faint)' }}>No buildings found</span>
          ) : allBuildings.length === 1 ? (
            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
              Block {selectedBuilding?.code} — {selectedBuilding?.name}
            </span>
          ) : (
            <select
              value={selectedBuildingId || ''}
              onChange={e => setSelectedBuildingId(e.target.value)}
              style={{
                height: 36,
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '0 32px 0 12px',
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--text)',
                background: 'var(--surface)',
                cursor: 'pointer',
                outline: 'none',
                minWidth: 260,
                appearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%236b7280' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 12px center',
              }}
            >
              {allBuildings.map(b => (
                <option key={b.id} value={b.id}>
                  Block {b.code} — {b.name}
                </option>
              ))}
            </select>
          )}

          {selectedBuilding && (
            <Badge variant="gray">
              {selectedFloors.length} floor{selectedFloors.length !== 1 ? 's' : ''}
            </Badge>
          )}

          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => setShowBuildingManager(true)}
            style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}
          >
            Manage Buildings
          </button>
        </div>
      </div>

      {/* ── Floors list ── */}
      {loading || buildingsLoading ? (
        <Spinner center />
      ) : allBuildings.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state__icon">🏢</div>
            <p className="empty-state__title">No buildings configured</p>
            <p className="empty-state__sub">
              Add a building to the database to get started.
            </p>
          </div>
        </div>
      ) : selectedFloors.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state__icon">🏢</div>
            <p className="empty-state__title">No floors yet</p>
            <p className="empty-state__sub">
              Create the first floor for {selectedBuilding?.name || 'this building'}.
            </p>
          </div>
        </div>
      ) : (
        <div className="card card--no-pad">
          {selectedFloors.map((floor) => (
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

                    <button
                      type="button"
                      className="btn btn--primary btn--sm"
                      onClick={() => setShowRoomsFor(floor)}
                      title="View and manage rooms on this floor"
                    >
                      Manage Rooms
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
      )}

      <FloorFormModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        buildings={allBuildings}
        defaultBuildingId={selectedBuildingId}
        onSaved={() => {
          setShowCreate(false);
          refetch();
        }}
        title="Add New Floor"
      />

      <FloorFormModal
        open={!!editFloor}
        onClose={() => setEditFloor(null)}
        buildings={allBuildings}
        defaultBuildingId={selectedBuildingId}
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

      <BuildingManagerModal
        open={showBuildingManager}
        onClose={() => setShowBuildingManager(false)}
        onBuildingsChanged={refetchBuildings}
      />

      <RoomsManagerModal
        floor={showRoomsFor}
        open={!!showRoomsFor}
        onClose={() => setShowRoomsFor(null)}
      />
    </div>
  );
}

// ─── Building Manager Modal ───────────────────────────────────

// ─── Rooms Manager Modal ──────────────────────────────────────

function roomsErrMsg(err) {
  const fieldErrors = err?.response?.data?.errors;
  if (Array.isArray(fieldErrors) && fieldErrors.length > 0) {
    return fieldErrors.map(e => e.message).join(', ');
  }
  return err?.response?.data?.message || err?.message || 'An unexpected error occurred';
}

function RoomsManagerModal({ floor, open, onClose }) {
  const { roomTypes } = useRoomTypes();
  const [rooms, setRooms] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editRoom, setEditRoom] = useState(null);
  const [delRoom, setDelRoom] = useState(null);
  const [delLoading, setDelLoading] = useState(false);

  const fetchRooms = useCallback(async () => {
    if (!floor?.id) return;
    setLoadingRooms(true);
    try {
      const res = await roomAPI.getByFloor(floor.id, { active_only: 'false' });
      const payload = res?.data?.data || res?.data || {};
      setRooms(payload.rooms || []);
    } catch (err) {
      toast.error(roomsErrMsg(err));
    } finally {
      setLoadingRooms(false);
    }
  }, [floor?.id]);

  useEffect(() => {
    if (open && floor?.id) {
      setSearch('');
      setTypeFilter('');
      fetchRooms();
    }
  }, [open, floor?.id, fetchRooms]);

  const filteredRooms = rooms.filter(r => {
    const matchSearch = !search ||
      r.room_number?.toLowerCase().includes(search.toLowerCase()) ||
      r.name?.toLowerCase().includes(search.toLowerCase());
    const matchType = !typeFilter || r.type === typeFilter;
    return matchSearch && matchType;
  });

  const handleDelete = async () => {
    if (!delRoom?.id) return;
    setDelLoading(true);
    try {
      await roomAPI.delete(delRoom.id);
      toast.success(`Room ${delRoom.room_number} deleted`);
      setDelRoom(null);
      await fetchRooms();
    } catch (err) {
      toast.error(roomsErrMsg(err));
    } finally {
      setDelLoading(false);
    }
  };

  const floorTitle = floor
    ? `${floor.building_code || floor.building_name || ''} — ${floor.floor_label}${floor.name ? ` (${floor.name})` : ''}`
    : '';

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={`Rooms — ${floorTitle}`}
        size="lg"
        footer={
          <Button variant="secondary" onClick={onClose}>Close</Button>
        }
      >
        {/* ── Toolbar ── */}
        <div style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          alignItems: 'center',
          marginBottom: 12,
        }}>
          <input
            type="search"
            className="form-input"
            placeholder="Search room # or name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: '1 1 160px', minWidth: 0, height: 36 }}
          />

          <select
            className="form-input"
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            style={{ width: 160, height: 36, flexShrink: 0 }}
          >
            <option value="">All types</option>
            {roomTypes.map(rt => (
              <option key={rt.value} value={rt.value}>{rt.label_en}</option>
            ))}
          </select>

          <Link
            to={floor?.id ? `/admin/map-editor?floor=${floor.id}` : '/admin/map-editor'}
            className="btn btn--secondary btn--sm"
            style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
            onClick={onClose}
          >
            Open Map Editor
          </Link>

          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => setShowCreate(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
          >
            <PlusIcon /> Add Room
          </button>
        </div>

        {/* ── Room count ── */}
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
          {loadingRooms
            ? 'Loading…'
            : `${filteredRooms.length} of ${rooms.length} room${rooms.length !== 1 ? 's' : ''}`}
        </div>

        {/* ── Table ── */}
        {loadingRooms ? (
          <Spinner center />
        ) : rooms.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__icon">🚪</div>
            <p className="empty-state__title">No rooms on this floor yet</p>
            <p className="empty-state__sub">Click "Add Room" to create the first one.</p>
          </div>
        ) : filteredRooms.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state__title">No rooms match your filter</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'min(420px, 55vh)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                  {['Room #', 'Name', 'Type', 'Capacity', 'Positioned', 'Accessible', ''].map(h => (
                    <th
                      key={h}
                      style={{
                        padding: '8px 12px',
                        textAlign: 'left',
                        fontWeight: 700,
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRooms.map((r, i) => (
                  <tr
                    key={r.id}
                    style={{
                      borderBottom: i < filteredRooms.length - 1 ? '1px solid var(--border)' : 'none',
                      background: 'var(--surface)',
                    }}
                  >
                    <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--najah-blue)', whiteSpace: 'nowrap' }}>
                      {r.room_number}
                    </td>
                    <td style={{ padding: '9px 12px', minWidth: 120 }}>
                      <div style={{ fontWeight: 500 }}>{r.name}</div>
                      {r.department && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.department}</div>
                      )}
                    </td>
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                      <Badge variant={roomTypeBadgeClass(r.type).replace('badge--', '')}>
                        {roomTypeLabel(r.type)}
                      </Badge>
                    </td>
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                      {r.capacity ? `${r.capacity} seats` : '—'}
                    </td>
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                      {r.coord_x != null
                        ? <span style={{ color: 'var(--green)', fontSize: 12 }}>✓ Yes</span>
                        : <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>No</span>}
                    </td>
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', textAlign: 'center' }}>
                      {r.is_accessible ? '✓' : '✗'}
                    </td>
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm btn--icon"
                          onClick={() => setEditRoom({ ...r })}
                          title="Edit room"
                        >
                          <EditIcon />
                        </button>
                        <Link
                          to={`/admin/map-editor?floor=${r.floor_id}`}
                          className="btn btn--ghost btn--sm btn--icon"
                          title="Position on map"
                          onClick={onClose}
                        >
                          🗺️
                        </Link>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm btn--icon"
                          onClick={() => setDelRoom(r)}
                          style={{ color: 'var(--red)' }}
                          title="Delete room"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* Add room — floor is locked to current floor */}
      <RoomFormModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        floorId={floor?.id}
        roomTypes={roomTypes}
        getBackendErrorMessage={roomsErrMsg}
        onSaved={async () => {
          setShowCreate(false);
          await fetchRooms();
        }}
        title={`Add Room — ${floorTitle}`}
      />

      {/* Edit room */}
      <RoomFormModal
        open={!!editRoom}
        onClose={() => setEditRoom(null)}
        floorId={floor?.id}
        existingRoom={editRoom}
        roomTypes={roomTypes}
        getBackendErrorMessage={roomsErrMsg}
        onSaved={async () => {
          setEditRoom(null);
          await fetchRooms();
        }}
        title="Edit Room"
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!delRoom}
        onClose={() => setDelRoom(null)}
        onConfirm={handleDelete}
        loading={delLoading}
        danger
        title="Delete Room"
        message={`Delete room "${delRoom?.room_number}${delRoom?.name ? ` — ${delRoom.name}` : ''}"? Schedule references will be unassigned by the database.`}
      />
    </>
  );
}

function buildingErrMsg(err) {
  const fieldErrors = err?.response?.data?.errors;
  if (Array.isArray(fieldErrors) && fieldErrors.length > 0) {
    return fieldErrors.map(e => e.message).join(', ');
  }
  return err?.response?.data?.message || err?.message || 'An unexpected error occurred';
}

function BuildingManagerModal({ open, onClose, onBuildingsChanged }) {
  const [buildings, setBuildings] = useState([]);
  const [loadingBuildings, setLoadingBuildings] = useState(false);
  const [formMode, setFormMode] = useState(null); // null | 'add' | 'edit'
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm] = useState({ code: '', name: '', description: '' });
  const [formErrors, setFormErrors] = useState({});
  const [formLoading, setFormLoading] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchBuildings = useCallback(async () => {
    setLoadingBuildings(true);
    try {
      const res = await floorAPI.getBuildingsAdmin();
      setBuildings(res?.data?.data?.buildings || res?.data?.buildings || []);
    } catch (err) {
      toast.error(buildingErrMsg(err));
    } finally {
      setLoadingBuildings(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchBuildings();
  }, [open, fetchBuildings]);

  const activeCount = buildings.filter(b => b.is_active).length;

  const openAdd = () => {
    setEditTarget(null);
    setForm({ code: '', name: '', description: '' });
    setFormErrors({});
    setFormMode('add');
  };

  const openEdit = (b) => {
    setEditTarget(b);
    setForm({ code: b.code, name: b.name, description: b.description || '' });
    setFormErrors({});
    setFormMode('edit');
  };

  const cancelForm = () => { setFormMode(null); setEditTarget(null); };

  const validateForm = () => {
    const errs = {};
    if (!form.code.trim()) errs.code = 'Code is required';
    if (!form.name.trim()) errs.name = 'Name is required';
    setFormErrors(errs);
    return !Object.keys(errs).length;
  };

  const handleSaveBuilding = async () => {
    if (!validateForm()) return;
    setFormLoading(true);
    try {
      if (formMode === 'add') {
        await floorAPI.createBuilding(form);
        toast.success('Building created');
      } else {
        await floorAPI.updateBuilding(editTarget.id, form);
        toast.success('Building updated');
      }
      cancelForm();
      await fetchBuildings();
      onBuildingsChanged();
    } catch (err) {
      toast.error(buildingErrMsg(err));
    } finally {
      setFormLoading(false);
    }
  };

  const handleToggleActive = async (building) => {
    if (building.is_active) {
      if (activeCount <= 1) {
        toast.error('You must keep at least one active building.');
        return;
      }
      setArchiveConfirm(building);
    } else {
      setActionLoading(true);
      try {
        await floorAPI.updateBuilding(building.id, { is_active: true });
        toast.success('Building restored');
        await fetchBuildings();
        onBuildingsChanged();
      } catch (err) {
        toast.error(buildingErrMsg(err));
      } finally {
        setActionLoading(false);
      }
    }
  };

  const handleConfirmArchive = async () => {
    if (!archiveConfirm) return;
    setActionLoading(true);
    try {
      await floorAPI.updateBuilding(archiveConfirm.id, { is_active: false });
      toast.success('Building archived');
      setArchiveConfirm(null);
      await fetchBuildings();
      onBuildingsChanged();
    } catch (err) {
      toast.error(buildingErrMsg(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return;
    setActionLoading(true);
    try {
      await floorAPI.deleteBuilding(deleteConfirm.id);
      toast.success('Building deleted');
      setDeleteConfirm(null);
      await fetchBuildings();
      onBuildingsChanged();
    } catch (err) {
      toast.error(buildingErrMsg(err));
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Manage Buildings"
        footer={
          <Button variant="secondary" onClick={onClose}>Close</Button>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={openAdd}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <PlusIcon /> Add Building
            </button>
          </div>

          {formMode && (
            <div style={{
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: 14,
              background: 'var(--bg)'
            }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>
                {formMode === 'add' ? 'New Building' : `Edit Building — ${editTarget?.code}`}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Input
                  label="Code (e.g. ENG)"
                  required
                  value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                  error={formErrors.code}
                  placeholder="ENG"
                />
                <Input
                  label="Name"
                  required
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  error={formErrors.name}
                  placeholder="College of Engineering"
                />
                <Input
                  label="Description (optional)"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder=""
                />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <Button variant="secondary" onClick={cancelForm} disabled={formLoading}>
                    Cancel
                  </Button>
                  <Button variant="primary" loading={formLoading} onClick={handleSaveBuilding}>
                    {formMode === 'add' ? 'Create' : 'Save'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {loadingBuildings ? (
            <Spinner center />
          ) : buildings.length === 0 ? (
            <div className="empty-state">
              <p className="empty-state__title">No buildings yet</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {buildings.map(b => (
                <div
                  key={b.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    background: b.is_active ? 'var(--surface)' : 'var(--bg)',
                    opacity: b.is_active ? 1 : 0.65,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>Block {b.code}</span>
                      <Badge variant={b.is_active ? 'green' : 'gray'}>
                        {b.is_active ? 'Active' : 'Archived'}
                      </Badge>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{b.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
                      {Number(b.floor_count)} active floor{Number(b.floor_count) !== 1 ? 's' : ''}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => openEdit(b)}
                      disabled={actionLoading}
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => handleToggleActive(b)}
                      disabled={actionLoading}
                    >
                      {b.is_active ? 'Archive' : 'Restore'}
                    </button>

                    {Number(b.floor_count) === 0 && (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm btn--icon"
                        style={{ color: 'var(--red)' }}
                        onClick={() => setDeleteConfirm(b)}
                        disabled={actionLoading}
                        title="Permanently delete building"
                      >
                        <TrashIcon />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!archiveConfirm}
        onClose={() => setArchiveConfirm(null)}
        onConfirm={handleConfirmArchive}
        loading={actionLoading}
        danger
        title="Archive Building"
        message={
          archiveConfirm
            ? Number(archiveConfirm.floor_count) > 0
              ? `This building has ${archiveConfirm.floor_count} active floor${Number(archiveConfirm.floor_count) !== 1 ? 's' : ''}. Archiving it will hide it from Floors & Maps selectors. Floors and rooms will not be deleted. Continue?`
              : `Archive "${archiveConfirm.name}"? It will be hidden from Floors & Maps selectors.`
            : ''
        }
      />

      <ConfirmDialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={handleConfirmDelete}
        loading={actionLoading}
        danger
        title="Delete Building"
        message={`Permanently delete building "${deleteConfirm?.name}"? This cannot be undone.`}
      />
    </>
  );
}

// ─── Floor Form Modal ─────────────────────────────────────────

function FloorFormModal({
  open,
  onClose,
  buildings,
  existingFloor,
  onSaved,
  title,
  defaultBuildingId
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
        building_id: defaultBuildingId || buildings[0]?.id || '',
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

function normalizeFloorKeyFromDb(floor) {
  const label = String(floor?.floor_label || '').trim().toUpperCase();
  if (label === 'B2') return 'B2';
  if (label === 'B1') return 'B1';
  if (label === 'G')  return 'G';
  const n = Number(floor?.floor_number);
  if (n === -2) return 'B2';
  if (n === -1) return 'B1';
  if (n === 0)  return 'G';
  return String(n || label);
}

const ACADEMIC_YEAR_MIN = 2020;
const ACADEMIC_YEAR_MAX = 2035;

export function AcademicYearStepper({ value, onChange, minYear = ACADEMIC_YEAR_MIN, maxYear = ACADEMIC_YEAR_MAX }) {
  const startYear = parseInt((value || '').split('/')[0], 10) || new Date().getFullYear();

  const dec = () => {
    if (startYear <= minYear) return;
    onChange(`${startYear - 1}/${startYear}`);
  };
  const inc = () => {
    if (startYear >= maxYear) return;
    onChange(`${startYear + 1}/${startYear + 2}`);
  };

  const atMin = startYear <= minYear;
  const atMax = startYear >= maxYear;

  return (
    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', overflow: 'hidden', height: 38 }}>
      <button
        type="button"
        onClick={dec}
        disabled={atMin}
        style={{
          width: 36, height: 38, fontSize: 16, border: 'none',
          cursor: atMin ? 'not-allowed' : 'pointer',
          background: 'transparent',
          color: atMin ? '#d1d5db' : '#374151',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRight: '1px solid #d1d5db', flexShrink: 0,
        }}
        title="Previous year"
      >
        ‹
      </button>
      <span style={{ flex: 1, textAlign: 'center', fontSize: 14, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', userSelect: 'none', padding: '0 8px' }}>
        {startYear}/{startYear + 1}
      </span>
      <button
        type="button"
        onClick={inc}
        disabled={atMax}
        style={{
          width: 36, height: 38, fontSize: 16, border: 'none',
          cursor: atMax ? 'not-allowed' : 'pointer',
          background: 'transparent',
          color: atMax ? '#d1d5db' : '#374151',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderLeft: '1px solid #d1d5db', flexShrink: 0,
        }}
        title="Next year"
      >
        ›
      </button>
    </div>
  );
}

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
  // When provided the modal hides the Semester/AcademicYear inputs and
  // shows a read-only context summary instead.
  readOnlyContext,
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

  // ── Room availability (shared by list panel + map modal) ─────
  const [availOpen, setAvailOpen]       = useState(false);
  const [mapOpen,   setMapOpen]         = useState(false);
  const [availLoading, setAvailLoading] = useState(false);
  const [availRooms, setAvailRooms]     = useState(null);
  const [availError, setAvailError]     = useState('');
  const [availDay, setAvailDay]         = useState(null);
  const formRef = useRef(form);
  formRef.current = form;

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

  // Reset availability state whenever the section modal closes.
  useEffect(() => {
    if (!open) {
      setAvailOpen(false);
      setMapOpen(false);
      setAvailRooms(null);
      setAvailError('');
      setAvailDay(null);
    }
  }, [open]);

  // Shared fetch used by both the list panel and the map modal.
  const fetchAvailability = useCallback(async (checkDay) => {
    const f = formRef.current;
    setAvailDay(checkDay);
    setAvailLoading(true);
    setAvailError('');
    setAvailRooms(null);
    try {
      const params = {
        semester:      f.semester,
        academic_year: f.academic_year,
        day_of_week:   checkDay,
        start_time:    f.start_time,
        end_time:      f.end_time,
      };
      if (f.max_capacity) params.expected_capacity = f.max_capacity;
      const res = await scheduleAPI.getRoomAvailability(params);
      setAvailRooms(res.data?.data?.rooms || []);
    } catch (err) {
      setAvailError(getErrorMessage(err));
    } finally {
      setAvailLoading(false);
    }
  }, []);

  const validateAvailFields = () => {
    const f = formRef.current;
    const days = Array.isArray(f.day_of_week) ? f.day_of_week : [];
    if (!days.length || !f.start_time || !f.end_time) {
      setAvailError('Please select at least one day and set start/end time first.');
      setAvailRooms(null);
      return null;
    }
    return days;
  };

  const handleFindRooms = (dayOverride) => {
    const days = validateAvailFields();
    if (!days) { setAvailOpen(true); return; }
    setAvailOpen(true);
    fetchAvailability(dayOverride ?? days[0]);
  };

  const handleViewOnMap = () => {
    setMapOpen(true);
    // Always refetch — form times may have changed since the last fetch.
    const days = validateAvailFields();
    if (!days) return;
    fetchAvailability(availDay ?? days[0]);
  };

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

          {/* Room availability quick actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: -4 }}>
            <button
              type="button"
              onClick={() => handleFindRooms()}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 12, color: 'var(--najah-blue)', padding: '2px 4px',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              🔍 Find Available Room
            </button>
            <button
              type="button"
              onClick={handleViewOnMap}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 12, color: 'var(--najah-blue)', padding: '2px 4px',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              🗺️ View on Map
            </button>
          </div>

          {/* Availability list panel */}
          {availOpen && (
            <RoomAvailabilityPanel
              loading={availLoading}
              error={availError}
              rooms={availRooms}
              form={form}
              availDay={availDay}
              onSwitchDay={handleFindRooms}
              onSelectRoom={roomId => {
                setVal('room_id')(roomId);
                setAvailOpen(false);
              }}
              onClose={() => setAvailOpen(false)}
            />
          )}

          {/* Map assignment modal */}
          {mapOpen && (
            <MapAssignmentModal
              open={mapOpen}
              availRooms={availRooms}
              availLoading={availLoading}
              availError={availError}
              availDay={availDay}
              form={form}
              onSwitchDay={fetchAvailability}
              onSelectRoom={roomId => {
                setVal('room_id')(roomId);
                setMapOpen(false);
              }}
              onClose={() => setMapOpen(false)}
            />
          )}

          {readOnlyContext ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '7px 12px', borderRadius: 8,
              background: 'var(--najah-blue-50, rgba(37,99,235,0.07))',
              border: '1px solid rgba(37,99,235,0.18)',
              fontSize: 13, color: '#1e40af', fontWeight: 500,
            }}>
              <span style={{ fontSize: 15 }}>📅</span>
              <span>
                {semesterLabel(form.semester)} {form.academic_year}
                {readOnlyContext.collegeName ? ` — ${readOnlyContext.collegeName}` : ''}
              </span>
            </div>
          ) : (
            <div className="form-row">
              <Select
                label="Semester"
                required
                value={form.semester}
                onChange={set('semester')}
                options={SEMESTER_OPTIONS}
                error={errors.semester}
              />

              <div className="form-group">
                <label className="form-label">Academic Year *</label>
                <AcademicYearStepper
                  value={form.academic_year}
                  onChange={v => setForm(f => ({ ...f, academic_year: v }))}
                />
                {errors.academic_year && <p className="form-error">{errors.academic_year}</p>}
              </div>
            </div>
          )}

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

// ─── Room Availability Panel ─────────────────────────────────
const STATUS_META = {
  available:           { label: 'Available',           color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
  booked:              { label: 'Booked',               color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  too_small:           { label: 'Too Small',            color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  not_teaching_room:   { label: 'Not Teaching Room',    color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' },
};

function RoomAvailabilityPanel({ loading, error, rooms, form, availDay, onSwitchDay, onSelectRoom, onClose }) {
  const days = Array.isArray(form?.day_of_week) ? form.day_of_week : [];

  // Group rooms by status
  const grouped = React.useMemo(() => {
    if (!rooms) return {};
    const g = {};
    for (const r of rooms) {
      const s = r.status || 'not_teaching_room';
      if (!g[s]) g[s] = [];
      g[s].push(r);
    }
    return g;
  }, [rooms]);

  const statusOrder = ['available', 'booked', 'too_small', 'not_teaching_room'];
  const totalAvailable = grouped.available?.length || 0;

  const panelStyle = {
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'var(--surface)',
    marginBottom: 12,
    overflow: 'hidden',
  };

  const headerStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    background: 'var(--surface-raised, #f8fafc)',
    borderBottom: '1px solid var(--border)',
  };

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>Find Available Room</span>
          {rooms && !loading && (
            <span style={{ fontSize: 11, color: totalAvailable > 0 ? '#16a34a' : '#6b7280' }}>
              {totalAvailable} available
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#6b7280', lineHeight: 1, padding: 2 }}
        >
          ×
        </button>
      </div>

      {/* Day pills — only shown when multiple days selected */}
      {days.length > 1 && (
        <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: '#6b7280', alignSelf: 'center', marginRight: 2 }}>Check day:</span>
          {days.map(d => {
            const dayMeta = DAY_OPTIONS.find(o => o.value === d || o.value === Number(d));
            const isActive = String(availDay) === String(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => onSwitchDay(d)}
                style={{
                  padding: '2px 10px',
                  borderRadius: 12,
                  border: '1px solid',
                  fontSize: 11,
                  cursor: 'pointer',
                  fontWeight: isActive ? 600 : 400,
                  background: isActive ? 'var(--najah-blue)' : 'transparent',
                  borderColor: isActive ? 'var(--najah-blue)' : 'var(--border)',
                  color: isActive ? '#fff' : 'inherit',
                }}
              >
                {dayMeta?.label || d}
              </button>
            );
          })}
        </div>
      )}

      {/* Body */}
      <div style={{ maxHeight: 320, overflowY: 'auto', padding: loading || error || !rooms ? '16px 14px' : 0 }}>
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
            <Spinner />
          </div>
        )}

        {!loading && error && (
          <p style={{ margin: 0, fontSize: 12, color: '#dc2626' }}>{error}</p>
        )}

        {!loading && !error && rooms && rooms.length === 0 && (
          <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>No rooms found.</p>
        )}

        {!loading && !error && rooms && rooms.length > 0 && (
          <div>
            {statusOrder.map(status => {
              const list = grouped[status];
              if (!list || list.length === 0) return null;
              const meta = STATUS_META[status] || STATUS_META.not_teaching_room;
              const isSelectable = status === 'available';

              return (
                <div key={status}>
                  {/* Group label */}
                  <div style={{
                    padding: '6px 14px 4px',
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: meta.color,
                    background: meta.bg,
                    borderBottom: `1px solid ${meta.border}`,
                    borderTop: '1px solid var(--border)',
                    position: 'sticky',
                    top: 0,
                  }}>
                    {meta.label} ({list.length})
                  </div>

                  {/* Room rows */}
                  {list.map(room => (
                    <div
                      key={room.room_id}
                      onClick={isSelectable ? () => onSelectRoom(room.room_id) : undefined}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                        padding: '8px 14px',
                        borderBottom: '1px solid var(--border)',
                        cursor: isSelectable ? 'pointer' : 'default',
                        transition: 'background 0.12s',
                        background: 'transparent',
                      }}
                      onMouseEnter={e => { if (isSelectable) e.currentTarget.style.background = meta.bg; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      {/* Status dot */}
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: meta.color, flexShrink: 0, marginTop: 4,
                      }} />

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 600, fontSize: 13 }}>{room.room_number}</span>
                          {room.room_name && (
                            <span style={{ fontSize: 11, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{room.room_name}</span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>
                          {room.room_type_label || room.room_type}
                          {room.capacity ? ` · Cap: ${room.capacity}` : ''}
                        </div>
                        {/* Booking details */}
                        {status === 'booked' && room.booking && (
                          <div style={{ fontSize: 11, color: '#dc2626', marginTop: 2 }}>
                            {room.booking.course_code} — {room.booking.instructor_name || 'No instructor'}
                            {' · '}{room.booking.start_time}–{room.booking.end_time}
                          </div>
                        )}
                      </div>

                      {/* Select hint */}
                      {isSelectable && (
                        <span style={{ fontSize: 10, color: meta.color, flexShrink: 0, marginTop: 3 }}>Select →</span>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Map Assignment Modal ─────────────────────────────────────
function MapAssignmentModal({ open, availRooms, availLoading, availError, availDay, form, onSwitchDay, onSelectRoom, onClose }) {
  const [floors, setFloors]             = useState([]);
  const [floorsLoading, setFloorsLoading] = useState(false);
  const [selectedFloorId, setSelectedFloorId] = useState(null);
  const [clickedRoom, setClickedRoom]   = useState(null); // { block, avail }

  useEffect(() => {
    if (!open) { setClickedRoom(null); return; }
    setFloorsLoading(true);
    floorAPI.getAll()
      .then(res => {
        const list = unwrapApiResponse(res).floors || [];
        setFloors(list);
      })
      .catch(() => {})
      .finally(() => setFloorsLoading(false));
  }, [open]);

  // floor_id → FLOOR_MAPS key
  const floorIdToKey = useMemo(() => {
    const map = {};
    floors.forEach(f => { map[f.id] = normalizeFloorKeyFromDb(f); });
    return map;
  }, [floors]);

  // room_number → availability info
  const availabilityByRoomNumber = useMemo(() => {
    const map = {};
    availRooms?.forEach(r => { map[r.room_number] = r; });
    return map;
  }, [availRooms]);

  // Default to the floor that has the most available rooms
  useEffect(() => {
    if (!availRooms?.length || !floors.length) return;
    if (selectedFloorId) return; // already set
    const count = {};
    availRooms.forEach(r => {
      if (r.status === 'available' && r.floor_id) {
        count[r.floor_id] = (count[r.floor_id] || 0) + 1;
      }
    });
    const best = Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0];
    setSelectedFloorId(best || floors[0]?.id || null);
  }, [availRooms, floors, selectedFloorId]);

  const selectedFloorKey = floorIdToKey[selectedFloorId];
  const days = Array.isArray(form?.day_of_week) ? form.day_of_week : [];

  // Group floors by building for the tab bar
  const buildingGroups = useMemo(() => {
    const groups = {};
    floors.forEach(f => {
      const bid = f.building_id;
      if (!groups[bid]) groups[bid] = { name: f.building_name || f.building_code || 'Building', floors: [] };
      groups[bid].floors.push(f);
    });
    return Object.values(groups);
  }, [floors]);

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.65)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 12,
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 12,
        width: '96vw', maxWidth: 1240, height: '90vh',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 32px 100px rgba(0,0,0,0.45)',
      }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Choose Room from Map</span>
          {availRooms && !availLoading && (
            <span style={{ fontSize: 11, color: '#16a34a', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '1px 8px' }}>
              {availRooms.filter(r => r.status === 'available').length} available
            </span>
          )}

          {/* Day pills */}
          {days.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 4 }}>
              <span style={{ fontSize: 11, color: '#6b7280' }}>Day:</span>
              {days.map(d => {
                const dayMeta = DAY_OPTIONS.find(o => o.value === d || o.value === Number(d));
                const isActive = String(availDay) === String(d);
                return (
                  <button key={d} type="button" onClick={() => { setSelectedFloorId(null); onSwitchDay(d); }}
                    style={{
                      padding: '2px 9px', borderRadius: 10, border: '1px solid', fontSize: 11,
                      cursor: 'pointer', fontWeight: isActive ? 600 : 400,
                      background: isActive ? 'var(--najah-blue)' : 'transparent',
                      borderColor: isActive ? 'var(--najah-blue)' : 'var(--border)',
                      color: isActive ? '#fff' : 'inherit',
                    }}>
                    {dayMeta?.label || d}
                  </button>
                );
              })}
            </div>
          )}

          <button type="button" onClick={onClose}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: '#6b7280', padding: '0 2px', lineHeight: 1 }}>
            ×
          </button>
        </div>

        {/* ── Floor tabs ── */}
        {!floorsLoading && buildingGroups.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0, overflowX: 'auto' }}>
            {buildingGroups.map(bg => (
              bg.floors.map(f => {
                const key = floorIdToKey[f.id];
                const isActive = f.id === selectedFloorId;
                const avCount = availRooms?.filter(r => r.floor_id === f.id && r.status === 'available').length || 0;
                return (
                  <button key={f.id} type="button"
                    onClick={() => { setSelectedFloorId(f.id); setClickedRoom(null); }}
                    style={{
                      position: 'relative', padding: '4px 12px', borderRadius: 6,
                      border: '1px solid', fontSize: 12, fontWeight: isActive ? 700 : 400,
                      cursor: 'pointer', whiteSpace: 'nowrap',
                      background: isActive ? 'var(--najah-blue)' : 'transparent',
                      borderColor: isActive ? 'var(--najah-blue)' : 'var(--border)',
                      color: isActive ? '#fff' : 'inherit',
                    }}>
                    {key || f.floor_label || `F${f.floor_number}`}
                    {avCount > 0 && (
                      <span style={{
                        position: 'absolute', top: -5, right: -5,
                        background: '#16a34a', color: '#fff', borderRadius: '50%',
                        width: 15, height: 15, fontSize: 9, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: '1.5px solid var(--surface)',
                      }}>
                        {avCount}
                      </span>
                    )}
                  </button>
                );
              })
            ))}
          </div>
        )}

        {/* ── Main: map + info panel ── */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

          {/* Map */}
          <div style={{ flex: 1, padding: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            {availLoading && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Spinner />
              </div>
            )}
            {!availLoading && availError && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626', fontSize: 13, padding: 24, textAlign: 'center' }}>
                {availError}
              </div>
            )}
            {!availLoading && !availError && !selectedFloorKey && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, color: '#6b7280' }}>
                <span style={{ fontSize: 32 }}>🗺️</span>
                <span style={{ fontSize: 13 }}>
                  {floors.length === 0 && floorsLoading ? 'Loading floors…' : 'Select a floor above to view the map'}
                </span>
              </div>
            )}
            {!availLoading && !availError && selectedFloorKey && (
              <RoomAvailabilityMap
                floorKey={selectedFloorKey}
                availabilityByRoomNumber={availabilityByRoomNumber}
                selectedRoomId={form?.room_id}
                onRoomClick={(block, avail) => setClickedRoom({ block, avail })}
              />
            )}
          </div>

          {/* Room info sidebar */}
          <div style={{ width: 288, borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
            {clickedRoom ? (
              <MapRoomInfoPanel
                block={clickedRoom.block}
                avail={clickedRoom.avail}
                expectedCapacity={form?.max_capacity ? Number(form.max_capacity) : null}
                onSelect={() => onSelectRoom(clickedRoom.avail.room_id)}
              />
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10, color: '#9ca3af', textAlign: 'center' }}>
                <span style={{ fontSize: 36 }}>👆</span>
                <span style={{ fontSize: 13 }}>Click a room on the map to see its details</span>
                <span style={{ fontSize: 11 }}>Green rooms are available to assign</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Legend ── */}
        <div style={{ display: 'flex', gap: 16, padding: '7px 16px', borderTop: '1px solid var(--border)', flexShrink: 0, flexWrap: 'wrap' }}>
          {[
            { color: 'rgba(34,197,94,0.65)',  label: 'Available' },
            { color: 'rgba(239,68,68,0.65)',  label: 'Booked' },
            { color: 'rgba(245,158,11,0.65)', label: 'Too Small' },
            { color: 'rgba(209,213,219,0.5)', label: 'Not Teaching Room' },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#374151' }}>
              <div style={{ width: 12, height: 12, borderRadius: 2, background: color, border: '1px solid rgba(0,0,0,0.1)', flexShrink: 0 }} />
              {label}
            </div>
          ))}
          <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 'auto' }}>Scroll to zoom · Drag to pan</span>
        </div>
      </div>
    </div>
  );
}

function MapRoomInfoPanel({ block, avail, expectedCapacity, onSelect }) {
  const status = avail?.status || 'not_teaching_room';
  const meta   = STATUS_META[status] || STATUS_META.not_teaching_room;

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', flex: 1 }}>
      {/* Status badge */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: meta.bg, color: meta.color,
        border: `1px solid ${meta.border}`, borderRadius: 6,
        padding: '4px 10px', alignSelf: 'flex-start',
      }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: meta.color }} />
        <span style={{ fontSize: 12, fontWeight: 600 }}>{meta.label}</span>
      </div>

      {/* Room identity */}
      <div>
        <div style={{ fontWeight: 700, fontSize: 17 }}>{block.roomNumber}</div>
        {block.name && (
          <div style={{ fontSize: 13, color: '#374151', marginTop: 3 }}>{block.name}</div>
        )}
      </div>

      {/* Basic info rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <MapInfoRow label="Type"     value={avail?.room_type_label || block.type} />
        <MapInfoRow label="Capacity" value={avail?.capacity ?? block.capacity ?? '—'} />
        {avail?.room_type_icon && (
          <MapInfoRow label="Icon" value={avail.room_type_icon} />
        )}
      </div>

      {/* Booking detail (booked) */}
      {status === 'booked' && avail?.booking && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current Booking</div>
          <MapInfoRow label="Course"     value={avail.booking.course_code ? `${avail.booking.course_code}${avail.booking.course_name ? ' — ' + avail.booking.course_name : ''}` : '—'} />
          <MapInfoRow label="Section"    value={avail.booking.section_number ?? '—'} />
          <MapInfoRow label="Instructor" value={avail.booking.instructor_name || '—'} />
          <MapInfoRow label="Time"       value={`${avail.booking.start_time} – ${avail.booking.end_time}`} />
          {avail.booking.meeting_day != null && (
            <MapInfoRow label="Day" value={DAY_OPTIONS.find(d => d.value === Number(avail.booking.meeting_day))?.label ?? `Day ${avail.booking.meeting_day}`} />
          )}
        </div>
      )}

      {/* Too small */}
      {status === 'too_small' && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#d97706', marginBottom: 2 }}>Capacity Issue</div>
          <div style={{ fontSize: 12, color: '#374151' }}>Room capacity: <strong>{avail?.capacity ?? block.capacity ?? '—'}</strong></div>
          {expectedCapacity != null && (
            <div style={{ fontSize: 12, color: '#374151' }}>Required: <strong>{expectedCapacity}</strong></div>
          )}
          <div style={{ fontSize: 12, color: '#d97706', marginTop: 2 }}>Room capacity is too small for this section.</div>
        </div>
      )}

      {/* Not teaching room */}
      {status === 'not_teaching_room' && (
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 10 }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>This room is not valid for scheduling.</div>
        </div>
      )}

      {/* Select button */}
      {status === 'available' && avail?.room_id && (
        <button
          type="button"
          onClick={onSelect}
          style={{
            marginTop: 'auto', padding: '10px 16px',
            background: 'var(--najah-blue)', color: '#fff',
            border: 'none', borderRadius: 8, cursor: 'pointer',
            fontWeight: 600, fontSize: 14, width: '100%',
          }}
        >
          Select This Room
        </button>
      )}
    </div>
  );
}

function MapInfoRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
      <span style={{ color: '#6b7280', flexShrink: 0 }}>{label}</span>
      <span style={{ color: '#111827', fontWeight: 500, textAlign: 'right' }}>{String(value ?? '—')}</span>
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

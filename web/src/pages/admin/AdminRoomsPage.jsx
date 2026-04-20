import React, { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { roomAPI, floorAPI } from '../../api/index';
import { useAsync } from '../../hooks/index';
import {
  Table, Pagination, Button, Input, Select, Modal,
  ConfirmDialog, Badge, Spinner, SectionHeader, SearchInput,
  PlusIcon, EditIcon, TrashIcon,
} from '../../components/ui/index';
import { roomTypeLabel, roomTypeBadgeClass, getErrorMessage, statusBadgeClass } from '../../utils/helpers';
import toast from 'react-hot-toast';

const ROOM_TYPES = [
  { value: '',             label: 'All types' },
  { value: 'classroom',    label: 'Classroom' },
  { value: 'lecture_hall', label: 'Lecture Hall' },
  { value: 'lab',          label: 'Lab' },
  { value: 'office',       label: 'Office' },
  { value: 'corridor',     label: 'Corridor' },
  { value: 'restroom',     label: 'Restroom' },
  { value: 'stairs',       label: 'Stairs' },
  { value: 'storage',      label: 'Storage' },
  { value: 'atrium',       label: 'Atrium' },
  { value: 'meeting_room', label: 'Meeting Room' },
  { value: 'other',        label: 'Other' },
];

export default function AdminRoomsPage() {
  const [floorId,    setFloorId]    = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page,       setPage]       = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [editRoom,   setEditRoom]   = useState(null);
  const [delRoom,    setDelRoom]    = useState(null);
  const [delLoading, setDelLoading] = useState(false);

  // Load buildings + floors for filter
  const { data: bldData } = useAsync(() => floorAPI.getBuildings(), []);
  const buildings = bldData?.buildings || [];

  const { data: floorsData } = useAsync(
    () => floorId ? Promise.resolve(null) : floorAPI.getAll({ active_only: 'false' }),
    [floorId]
  );
  const allFloors = floorsData?.floors || [];

  // Load rooms
  const { data, loading, refetch } = useAsync(
    () => floorId ? roomAPI.getByFloor(floorId, { type: typeFilter || undefined, active_only: 'false' }) : Promise.resolve({ data: { data: { rooms: [] } } }),
    [floorId, typeFilter]
  );
  const rooms = data?.rooms || [];

  const handleDelete = async () => {
    setDelLoading(true);
    try {
      await roomAPI.delete(delRoom.id);
      toast.success('Room deleted');
      setDelRoom(null);
      refetch();
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setDelLoading(false); }
  };

  const columns = [
    { key: 'room_number', label: 'Room #', render: v => <span style={{ fontFamily:'monospace', fontWeight:700, color:'var(--najah-blue)' }}>{v}</span> },
    { key: 'name', label: 'Name', render: (v, r) => (
      <div>
        <div style={{ fontWeight:500 }}>{v}</div>
        {r.department && <div style={{ fontSize:11, color:'var(--text-muted)' }}>{r.department}</div>}
      </div>
    )},
    { key: 'type', label: 'Type', render: v => <Badge variant={roomTypeBadgeClass(v).replace('badge--','')}>{roomTypeLabel(v)}</Badge> },
    { key: 'capacity', label: 'Capacity', render: v => v ? `${v} seats` : '—' },
    { key: 'coords', label: 'Positioned', render: (_, r) => r.coord_x ? <span style={{ color:'var(--green)', fontSize:12 }}>✓ Yes</span> : <span style={{ color:'var(--text-faint)', fontSize:12 }}>No</span> },
    { key: 'is_accessible', label: 'Accessible', render: v => v ? '✓' : '✗' },
    { key: 'actions', label: '', render: (_, r) => (
      <div style={{ display:'flex', gap:4 }}>
        <button className="btn btn--ghost btn--sm btn--icon" onClick={() => setEditRoom({ ...r })} title="Edit"><EditIcon /></button>
        <Link to={`/admin/map-editor?floor=${r.floor_id}`} className="btn btn--ghost btn--sm btn--icon" title="Edit on map">🗺️</Link>
        <button className="btn btn--ghost btn--sm btn--icon" onClick={() => setDelRoom(r)} title="Delete" style={{ color:'var(--red)' }}><TrashIcon /></button>
      </div>
    )},
  ];

  return (
    <div>
      <div className="page-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div>
          <h1 className="page-title">Rooms</h1>
          <p className="page-sub">Manage all rooms across all floors and buildings</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <Link to="/admin/map-editor" className="btn btn--secondary">Open Map Editor</Link>
          <Button variant="primary" icon={<PlusIcon />} onClick={() => setShowCreate(true)} disabled={!floorId}>
            Add Room
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="card card--sm" style={{ marginBottom:'var(--space-lg)', display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
        <Select
          value={floorId}
          onChange={e => { setFloorId(e.target.value); setPage(1); }}
          options={allFloors.map(f => ({ value: f.id, label: `${f.building_code} ${f.floor_label} — ${f.name}` }))}
          placeholder="Select floor to view rooms…"
          style={{ flex:1, minWidth:240 }}
        />
        <Select
          value={typeFilter}
          onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
          options={ROOM_TYPES}
          style={{ width:160 }}
        />
        {floorId && <span style={{ fontSize:12, color:'var(--text-muted)', marginLeft:'auto' }}>{rooms.length} room{rooms.length !== 1 ? 's' : ''}</span>}
      </div>

      {!floorId ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state__icon">🏢</div>
            <p className="empty-state__title">Select a floor</p>
            <p className="empty-state__sub">Choose a floor from the dropdown above to view and manage its rooms</p>
          </div>
        </div>
      ) : (
        <div className="card card--no-pad">
          <Table columns={columns} data={rooms} loading={loading} emptyMessage="No rooms found for this floor" />
        </div>
      )}

      {/* Create room modal */}
      <RoomFormModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        floorId={floorId}
        onSaved={() => { setShowCreate(false); refetch(); }}
        title="Add Room"
      />

      {/* Edit room modal */}
      <RoomFormModal
        open={!!editRoom}
        onClose={() => setEditRoom(null)}
        floorId={floorId}
        existingRoom={editRoom}
        onSaved={() => { setEditRoom(null); refetch(); }}
        title="Edit Room"
      />

      <ConfirmDialog
        open={!!delRoom} onClose={() => setDelRoom(null)}
        onConfirm={handleDelete} loading={delLoading} danger
        title="Delete Room"
        message={`Delete room "${delRoom?.room_number} — ${delRoom?.name}"? All schedule sections for this room will be unassigned.`}
      />
    </div>
  );
}

function RoomFormModal({ open, onClose, floorId, existingRoom, onSaved, title }) {
  const [form, setForm] = useState(existingRoom || {
    room_number:'', name:'', type:'classroom', department:'',
    capacity:'', description:'', is_accessible: true,
  });
  const [loading, setLoading] = useState(false);
  const [errors,  setErrors]  = useState({});

  React.useEffect(() => { if (existingRoom) setForm(existingRoom); }, [existingRoom]);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const validate = () => {
    const e = {};
    if (!form.room_number?.trim()) e.room_number = 'Required';
    if (!form.name?.trim())        e.name        = 'Required';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const payload = {
        ...form,
        floor_id:  floorId,
        capacity:  form.capacity ? parseInt(form.capacity) : null,
        is_accessible: form.is_accessible !== false,
      };
      if (existingRoom?.id) {
        await roomAPI.update(existingRoom.id, payload);
        toast.success('Room updated');
      } else {
        await roomAPI.create(payload);
        toast.success(`Room ${form.room_number} created`);
      }
      onSaved();
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setLoading(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={title} size="md"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" loading={loading} onClick={handleSave}>Save</Button></>}
    >
      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        <div className="form-row">
          <Input label="Room Number" required value={form.room_number || ''} onChange={set('room_number')} error={errors.room_number} placeholder="e.g. 101" />
          <Select label="Type" required value={form.type || 'classroom'} onChange={set('type')} options={ROOM_TYPES.slice(1)} />
        </div>
        <Input label="Room Name" required value={form.name || ''} onChange={set('name')} error={errors.name} placeholder="e.g. Computer Lab 101" />
        <div className="form-row">
          <Input label="Department" value={form.department || ''} onChange={set('department')} placeholder="Optional" />
          <Input label="Capacity" type="number" value={form.capacity || ''} onChange={set('capacity')} placeholder="Seats" />
        </div>
        <div className="form-group">
          <label className="form-label">Description</label>
          <textarea className="form-input" rows={2} value={form.description || ''} onChange={set('description')} placeholder="Optional room description" />
        </div>
        <div className="form-group" style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
          <input type="checkbox" id="accessible" checked={form.is_accessible !== false} onChange={e => setForm(f => ({ ...f, is_accessible: e.target.checked }))} />
          <label htmlFor="accessible" className="form-label" style={{ marginBottom:0 }}>Wheelchair accessible</label>
        </div>
      </div>
    </Modal>
  );
}

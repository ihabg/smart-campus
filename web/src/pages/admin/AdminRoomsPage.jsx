import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { roomAPI, floorAPI } from '../../api/index';
import { useAsync, useRoomTypes } from '../../hooks/index';
import {
  Table,
  Button,
  Input,
  Select,
  Modal,
  ConfirmDialog,
  Badge,
  PlusIcon,
  EditIcon,
  TrashIcon,
} from '../../components/ui/index';
import {
  roomTypeLabel,
  roomTypeBadgeClass,
  getErrorMessage,
} from '../../utils/helpers';
import toast from 'react-hot-toast';

export default function AdminRoomsPage() {
  const { roomTypes } = useRoomTypes();
  const [floorId, setFloorId] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editRoom, setEditRoom] = useState(null);
  const [delRoom, setDelRoom] = useState(null);
  const [delLoading, setDelLoading] = useState(false);

  const { data: floorsData, loading: floorsLoading } = useAsync(
    () => floorAPI.getAll({ active_only: 'false' }),
    []
  );

  const allFloors = (floorsData?.floors || []).sort((a, b) => {
    const orderA = Number(a.display_order ?? a.floor_number ?? 0);
    const orderB = Number(b.display_order ?? b.floor_number ?? 0);
    return orderA - orderB;
  });

  const { data, loading, refetch } = useAsync(
    () =>
      floorId
        ? roomAPI.getByFloor(floorId, {
            type: typeFilter || undefined,
            active_only: 'false',
          })
        : Promise.resolve({ data: { data: { rooms: [] } } }),
    [floorId, typeFilter]
  );

  const rooms = data?.rooms || [];

  const getBackendErrorMessage = err => {
    const response = err.response?.data || {};
    const detailArrays = [response.errors, response.details].filter(Array.isArray);

    for (const list of detailArrays) {
      const message = list
        .map(item => item.message || item.msg || item.field || item.path)
        .filter(Boolean)
        .join(', ');

      if (message) return message;
    }

    return (
      response.message ||
      response.error ||
      getErrorMessage(err) ||
      'Request failed'
    );
  };

  const handleDelete = async () => {
    if (!delRoom?.id) return;

    setDelLoading(true);

    try {
      await roomAPI.delete(delRoom.id);
      toast.success(`Room ${delRoom.room_number} deleted from database`);
      setDelRoom(null);
      await refetch();
    } catch (err) {
      console.error('Room delete error:', err.response?.data || err);
      toast.error(getBackendErrorMessage(err));
    } finally {
      setDelLoading(false);
    }
  };

  const columns = [
    {
      key: 'room_number',
      label: 'Room #',
      render: v => (
        <span
          style={{
            fontFamily: 'monospace',
            fontWeight: 700,
            color: 'var(--najah-blue)',
          }}
        >
          {v}
        </span>
      ),
    },
    {
  key: 'lecturer_number',
  label: 'Lect the `urer #',
  render: v => (
    <span
      style={{
        fontFamily: 'monospace',
        fontWeight: 700,
        color: v ? 'var(--najah-blue)' : 'var(--text-faint)',
      }}
    >
      {v || '—'}
    </span>
  ),
},
    {
      key: 'name',
      label: 'Name',
      render: (v, r) => (
        <div>
          <div style={{ fontWeight: 500 }}>{v}</div>
          {r.department && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {r.department}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'type',
      label: 'Type',
      render: v => (
        <Badge variant={roomTypeBadgeClass(v).replace('badge--', '')}>
          {roomTypeLabel(v)}
        </Badge>
      ),
    },
    {
      key: 'capacity',
      label: 'Capacity',
      render: v => (v ? `${v} seats` : '—'),
    },
    {
      key: 'coords',
      label: 'Positioned',
      render: (_, r) =>
        r.coord_x !== null && r.coord_x !== undefined ? (
          <span style={{ color: 'var(--green)', fontSize: 12 }}>✓ Yes</span>
        ) : (
          <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>No</span>
        ),
    },
    {
      key: 'is_accessible',
      label: 'Accessible',
      render: v => (v ? '✓' : '✗'),
    },
    {
      key: 'actions',
      label: '',
      render: (_, r) => (
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            type="button"
            className="btn btn--ghost btn--sm btn--icon"
            onClick={() => setEditRoom({ ...r })}
            title="Edit"
          >
            <EditIcon />
          </button>

          <Link
            to={`/admin/map-editor?floor=${r.floor_id}`}
            className="btn btn--ghost btn--sm btn--icon"
            title="Edit on map"
          >
            🗺️
          </Link>

          <button
            type="button"
            className="btn btn--ghost btn--sm btn--icon"
            onClick={() => setDelRoom(r)}
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
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}
      >
        <div>
          <h1 className="page-title">Rooms</h1>
          <p className="page-sub">
            Manage all rooms across all floors and buildings
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Link
            to={floorId ? `/admin/map-editor?floor=${floorId}` : '/admin/map-editor'}
            className="btn btn--secondary"
          >
            Open Map Editor
          </Link>

          <Button
            variant="primary"
            icon={<PlusIcon />}
            onClick={() => setShowCreate(true)}
            disabled={!floorId}
          >
            Add Room
          </Button>
        </div>
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
          value={floorId}
          onChange={e => {
            setFloorId(e.target.value);
            setTypeFilter('');
          }}
          options={allFloors.map(floor => ({
            value: floor.id,
            label: `${floor.building_code || 'ENG'} ${floor.floor_label} — ${
              floor.name || 'Unnamed floor'
            }`,
          }))}
          placeholder={
            floorsLoading ? 'Loading floors...' : 'Select floor to view rooms…'
          }
          style={{ flex: 1, minWidth: 240 }}
        />

        <Select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          options={[
            { value: '', label: 'All types' },
            ...roomTypes.map(rt => ({ value: rt.value, label: rt.label_en })),
          ]}
          style={{ width: 180 }}
        />

        {floorId && (
          <span
            style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              marginLeft: 'auto',
            }}
          >
            {rooms.length} room{rooms.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {!floorId ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state__icon">🏢</div>
            <p className="empty-state__title">Select a floor</p>
            <p className="empty-state__sub">
              Choose a floor from the dropdown above to view and manage its rooms
            </p>
          </div>
        </div>
      ) : (
        <div className="card card--no-pad">
          <Table
            columns={columns}
            data={rooms}
            loading={loading}
            emptyMessage="No rooms found for this floor"
          />
        </div>
      )}

      <RoomFormModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        floorId={floorId}
        roomTypes={roomTypes}
        getBackendErrorMessage={getBackendErrorMessage}
        onSaved={async () => {
          setShowCreate(false);
          await refetch();
        }}
        title="Add Room"
      />

      <RoomFormModal
        open={!!editRoom}
        onClose={() => setEditRoom(null)}
        floorId={floorId}
        existingRoom={editRoom}
        roomTypes={roomTypes}
        getBackendErrorMessage={getBackendErrorMessage}
        onSaved={async () => {
          setEditRoom(null);
          await refetch();
        }}
        title="Edit Room"
      />

      <ConfirmDialog
        open={!!delRoom}
        onClose={() => setDelRoom(null)}
        onConfirm={handleDelete}
        loading={delLoading}
        danger
        title="Delete Room"
        message={`Delete room "${delRoom?.room_number} — ${delRoom?.name}" from the database? Schedule references will be unassigned by the backend/database.`}
      />
    </div>
  );
}

export function emptyRoomForm() {
  return {
    room_number: '',
    lecturer_number: '',
    name: '',
    type: 'lecture_hall',
    department: '',
    capacity: '',
    description: '',
    is_accessible: true,
  };
}

export function cleanRoomType(value) {
  const type = String(value || 'lecture_hall')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');

  if (type === 'emergency_stairs') return 'emergency_exit';

  return type;
}

export function buildRoomPayload(form, floorId) {
  const payload = {
    floor_id: floorId,
    room_number: String(form.room_number || '').trim().toUpperCase(),
    name: String(form.name || '').trim(),
    type: cleanRoomType(form.type),
    is_accessible: Boolean(form.is_accessible),
  };

  const department = String(form.department || '').trim();
  const lecturerNumber = String(form.lecturer_number || '').trim();
  const description = String(form.description || '').trim();
  const capacity = String(form.capacity ?? '').trim();

  if (department) payload.department = department;
  if (lecturerNumber) payload.lecturer_number = lecturerNumber;
  if (description) payload.description = description;

  if (capacity !== '') {
    payload.capacity = Number(capacity);
  }

  return payload;
}

export function RoomFormModal({
  open,
  onClose,
  floorId,
  existingRoom,
  onSaved,
  title,
  getBackendErrorMessage,
  roomTypes,
}) {
  const isEdit = Boolean(existingRoom?.id);

  const [form, setForm] = useState(emptyRoomForm());
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  React.useEffect(() => {
    if (!open) return;

    if (existingRoom) {
      setForm({
        room_number: existingRoom.room_number || '',
        lecturer_number: existingRoom.lecturer_number || '',
        name: existingRoom.name || '',
        type: cleanRoomType(existingRoom.type || 'lecture_hall'),
        department: existingRoom.department || '',
        capacity:
          existingRoom.capacity !== null && existingRoom.capacity !== undefined
            ? String(existingRoom.capacity)
            : '',
        description: existingRoom.description || '',
        is_accessible: existingRoom.is_accessible === true,
      });
    } else {
      setForm(emptyRoomForm());
    }

    setErrors({});
  }, [open, existingRoom]);

  const set = key => event => {
    const value =
      event.target.type === 'checkbox'
        ? event.target.checked
        : event.target.value;

    setForm(current => ({
      ...current,
      [key]: value,
    }));
  };

  const validate = () => {
    const nextErrors = {};

    if (!floorId) {
      nextErrors.floor_id = 'Please select a floor first.';
    }

    if (!String(form.room_number || '').trim()) {
      nextErrors.room_number = 'Room number is required.';
    }

    if (!String(form.name || '').trim()) {
      nextErrors.name = 'Room name is required.';
    }

    if (!String(form.type || '').trim()) {
      nextErrors.type = 'Room type is required.';
    }
    const lecturerNumber = String(form.lecturer_number || '').trim();

if (
  cleanRoomType(form.type) === 'office' &&
  !/^\d{4}$/.test(lecturerNumber)
) {
  nextErrors.lecturer_number =
    'Doctor offices must have a 4-digit lecturer number.';
} else if (lecturerNumber && !/^\d{4}$/.test(lecturerNumber)) {
  nextErrors.lecturer_number =
    'Lecturer number must be exactly 4 digits.';
}

    if (
      String(form.capacity ?? '').trim() !== '' &&
      (!Number.isInteger(Number(form.capacity)) || Number(form.capacity) < 0)
    ) {
      nextErrors.capacity = 'Capacity must be a positive integer or zero.';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;

    setLoading(true);

    try {
      const payload = buildRoomPayload(form, floorId);

      if (isEdit) {
        await roomAPI.update(existingRoom.id, payload);
        toast.success(`Room ${payload.room_number} updated in database`);
      } else {
        await roomAPI.create(payload);
        toast.success(`Room ${payload.room_number} added to database`);
      }

      await onSaved();
    } catch (err) {
      console.error('Room save error:', err.response?.data || err);
      toast.error(getBackendErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>

          <Button variant="primary" loading={loading} onClick={handleSave}>
            Save
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {errors.floor_id && (
          <div className="form-error">{errors.floor_id}</div>
        )}

        <div className="form-row">
          <Input
            label="Room Number"
            required
            value={form.room_number}
            onChange={set('room_number')}
            error={errors.room_number}
            placeholder="e.g. B2-EXIT-3"
          />

          <Input
  label="Lecturer Number / رقم المدرس"
  value={form.lecturer_number || ''}
  onChange={set('lecturer_number')}
  error={errors.lecturer_number}
  placeholder="Example: 1394"
/>

          <Select
            label="Type"
            required
            value={form.type}
            onChange={set('type')}
            options={roomTypes.map(rt => ({ value: rt.value, label: rt.label_en }))}
            error={errors.type}
          />
        </div>

        <Input
          label="Room Name"
          required
          value={form.name}
          onChange={set('name')}
          error={errors.name}
          placeholder="e.g. مخرج الطوارئ"
        />

        <div className="form-row">
          <Input
            label="Department"
            value={form.department}
            onChange={set('department')}
            placeholder="Optional"
          />

          <Input
            label="Capacity"
            type="number"
            value={form.capacity}
            onChange={set('capacity')}
            error={errors.capacity}
            placeholder="Seats"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Description</label>

          <textarea
            className="form-input"
            rows={3}
            value={form.description}
            onChange={set('description')}
            placeholder="Optional room description"
          />
        </div>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            color: 'var(--text)',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={form.is_accessible}
            onChange={set('is_accessible')}
          />
          Wheelchair accessible
        </label>
      </div>
    </Modal>
  );
}

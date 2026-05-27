import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { roomAPI, floorAPI, roomTypeAPI } from '../../api/index';
import OfficeAssignmentsPanel from '../../components/ui/OfficeAssignmentsPanel';
import AdminEventsTab from './AdminEventsTab';
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
import './AdminRoomsPage.css';

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminRoomsPage() {
  const { roomTypes } = useRoomTypes(); // active types only, for Add Room dropdown

  const [activeTab, setActiveTab] = useState('rooms');

  // Building-first navigation
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [selectedFloor, setSelectedFloor]       = useState(null);

  // Building search (for the building selector)
  const [bldSearch, setBldSearch] = useState('');

  // Room search / type filter
  const [search,     setSearch]     = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  // Room modals
  const [showCreate, setShowCreate] = useState(false);
  const [editRoom,   setEditRoom]   = useState(null);
  const [delRoom,    setDelRoom]    = useState(null);
  const [delLoading, setDelLoading] = useState(false);

  // Room type manager
  const [showRoomTypeManager, setShowRoomTypeManager] = useState(false);

  // ── Data fetching ──────────────────────────────────────────────
  const { data: buildingsData, loading: buildingsLoading } = useAsync(
    () => floorAPI.getBuildingsAdmin(),
    []
  );
  const buildings = buildingsData?.buildings || [];

  // ≤ this many → card grid; > this many → searchable list
  const CARD_THRESHOLD = 8;

  const filteredBuildings = buildings.filter(b => {
    const q = bldSearch.toLowerCase();
    return (
      !q ||
      (b.code || '').toLowerCase().includes(q) ||
      (b.name || '').toLowerCase().includes(q)
    );
  });

  const { data: floorsData, loading: floorsLoading } = useAsync(
    () =>
      selectedBuilding
        ? floorAPI.getAll({ building_id: selectedBuilding.id, active_only: 'false' })
        : Promise.resolve(null),
    [selectedBuilding?.id]
  );
  const floors = (floorsData?.floors || []).sort((a, b) => {
    const oa = Number(a.display_order ?? a.floor_number ?? 0);
    const ob = Number(b.display_order ?? b.floor_number ?? 0);
    return oa - ob;
  });

  const floorId = selectedFloor?.id || '';

  const { data, loading, refetch } = useAsync(
    () =>
      selectedFloor
        ? roomAPI.getByFloor(selectedFloor.id, { active_only: 'false' })
        : Promise.resolve(null),
    [selectedFloor?.id]
  );
  const allRooms = data?.rooms || [];

  // Client-side search + type filter
  const rooms = allRooms.filter(r => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      (r.room_number || '').toLowerCase().includes(q) ||
      (r.name || '').toLowerCase().includes(q);
    const matchType = !typeFilter || r.type === typeFilter;
    return matchSearch && matchType;
  });

  // ── Handlers ───────────────────────────────────────────────────
  const handleSelectBuilding = bld => {
    setSelectedBuilding(bld);
    setSelectedFloor(null);
    setSearch('');
    setTypeFilter('');
    setBldSearch('');
  };

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
    return response.message || response.error || getErrorMessage(err) || 'Request failed';
  };

  const handleDelete = async () => {
    if (!delRoom?.id) return;
    setDelLoading(true);
    try {
      await roomAPI.delete(delRoom.id);
      toast.success(`Room ${delRoom.room_number} deleted`);
      setDelRoom(null);
      await refetch();
    } catch (err) {
      toast.error(getBackendErrorMessage(err));
    } finally {
      setDelLoading(false);
    }
  };

  // ── Table columns ──────────────────────────────────────────────
  const columns = [
    {
      key: 'room_number',
      label: 'Room #',
      render: v => (
        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--navy)' }}>
          {v}
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
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.department}</div>
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
      label: 'On Map',
      render: (_, r) =>
        r.coord_x !== null && r.coord_x !== undefined ? (
          <span style={{ color: 'var(--green)', fontSize: 12 }}>✓</span>
        ) : (
          <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>—</span>
        ),
    },
    {
      key: 'is_active',
      label: 'Status',
      render: v => (
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: v !== false ? 'var(--green)' : 'var(--text-muted)',
          }}
        >
          {v !== false ? 'Active' : 'Inactive'}
        </span>
      ),
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

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="ar-page">

      {/* ── Page header ── */}
      <div className="page-header ar-page-header">
        <div>
          <h1 className="page-title">Rooms</h1>
          <p className="page-sub">Manage rooms across buildings and floors</p>
        </div>
        {activeTab === 'rooms' && (
          <div className="ar-header-actions">
            <button
              className="btn btn--secondary"
              onClick={() => setShowRoomTypeManager(true)}
            >
              🏷 Room Types
            </button>
            <Link
              to={floorId ? `/admin/map-editor?floor=${floorId}` : '/admin/map-editor'}
              className="btn btn--secondary"
            >
              🗺️ Map Editor
            </Link>
            <Button
              variant="primary"
              icon={<PlusIcon />}
              onClick={() => setShowCreate(true)}
              disabled={!floorId}
              title={!floorId ? 'Select a building and floor first' : undefined}
            >
              Add Room
            </Button>
          </div>
        )}
      </div>

      {/* ── Tab strip ── */}
      <div className="ar-tabs">
        <button
          className={`ar-tab${activeTab === 'rooms' ? ' ar-tab--active' : ''}`}
          onClick={() => setActiveTab('rooms')}
        >
          🏢 Rooms
        </button>
        <button
          className={`ar-tab${activeTab === 'events' ? ' ar-tab--active' : ''}`}
          onClick={() => setActiveTab('events')}
        >
          📅 Events
        </button>
      </div>

      {/* ── Events tab ── */}
      {activeTab === 'events' && <AdminEventsTab />}

      {/* ── Rooms tab ── */}
      {activeTab === 'rooms' && (
        <div className="ar-rooms-body">

          {/* Step 1 — Building selector (cards ≤8, searchable list >8) */}
          <div className="card ar-bld-section">
            <div className="ar-section-label">🏗️ Select a Building</div>

            {buildingsLoading ? (
              /* skeleton */
              <div className="ar-bld-grid">
                {[1, 2, 3].map(i => (
                  <div key={i} className="ar-bld-card ar-bld-card--skeleton" />
                ))}
              </div>

            ) : buildings.length === 0 ? (
              /* no buildings at all */
              <div className="empty-state">
                <div className="empty-state__icon">🏗️</div>
                <p className="empty-state__title">No buildings found</p>
                <p className="empty-state__sub">Add buildings from Floors &amp; Maps first</p>
              </div>

            ) : buildings.length <= CARD_THRESHOLD ? (
              /* ── CARD MODE (≤ 8 buildings) ── */
              <div>
                {buildings.length > 3 && (
                  <input
                    className="form-input ar-bld-search-input"
                    value={bldSearch}
                    onChange={e => setBldSearch(e.target.value)}
                    placeholder="Search building or college…"
                  />
                )}
                {filteredBuildings.length === 0 ? (
                  <p className="ar-empty-inline">
                    No buildings match &ldquo;{bldSearch}&rdquo;
                  </p>
                ) : (
                  <div className="ar-bld-grid">
                    {filteredBuildings.map(bld => (
                      <button
                        key={bld.id}
                        className={`ar-bld-card${selectedBuilding?.id === bld.id ? ' ar-bld-card--active' : ''}`}
                        onClick={() => handleSelectBuilding(bld)}
                      >
                        <span className="ar-bld-code">{bld.code}</span>
                        <span className="ar-bld-name">{bld.name}</span>
                        <span className="ar-bld-meta">
                          {bld.floor_count || 0} floor{bld.floor_count !== 1 ? 's' : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

            ) : (
              /* ── LIST MODE (> 8 buildings) — searchable combobox ── */
              <div className="ar-bld-search-wrap">
                {/* Selected building banner (shown when building chosen and not actively searching) */}
                {selectedBuilding && !bldSearch && (
                  <div className="ar-bld-selected">
                    <span className="ar-bld-selected-icon">✓</span>
                    <span className="ar-bld-selected-text">
                      <strong>Block {selectedBuilding.code}</strong>
                      {' — '}
                      {selectedBuilding.name}
                      <span className="ar-bld-selected-meta">
                        · {selectedBuilding.floor_count || 0} floors
                      </span>
                    </span>
                    <button
                      className="btn btn--ghost btn--sm"
                      onClick={() => {
                        setSelectedBuilding(null);
                        setSelectedFloor(null);
                        setBldSearch('');
                      }}
                      title="Change building"
                    >
                      ✕ Change
                    </button>
                  </div>
                )}

                {/* Search input — always shown; also shown when no selection yet */}
                {(!selectedBuilding || bldSearch) && (
                  <input
                    className="form-input ar-bld-search-input"
                    value={bldSearch}
                    onChange={e => setBldSearch(e.target.value)}
                    placeholder="Search building or college…"
                    autoFocus={!selectedBuilding}
                  />
                )}

                {/* Change button doubles as a re-open trigger */}
                {selectedBuilding && !bldSearch && (
                  <button
                    className="btn btn--ghost btn--sm ar-bld-change-btn"
                    onClick={() => setBldSearch(' ')}
                  >
                    🔍 Browse all buildings
                  </button>
                )}

                {/* Results list */}
                {(!selectedBuilding || bldSearch) && (
                  <div className="ar-bld-list">
                    {filteredBuildings.length === 0 ? (
                      <div className="ar-bld-list-empty">
                        {bldSearch.trim()
                          ? <>No buildings match &ldquo;<strong>{bldSearch.trim()}</strong>&rdquo;</>
                          : 'No buildings available'}
                      </div>
                    ) : (
                      filteredBuildings.map(bld => (
                        <button
                          key={bld.id}
                          className={`ar-bld-list-item${selectedBuilding?.id === bld.id ? ' ar-bld-list-item--active' : ''}`}
                          onClick={() => handleSelectBuilding(bld)}
                        >
                          <span className="ar-bld-list-code">{bld.code}</span>
                          <span className="ar-bld-list-info">
                            <span className="ar-bld-list-name">{bld.name}</span>
                            <span className="ar-bld-list-meta">
                              {bld.floor_count || 0} floor{bld.floor_count !== 1 ? 's' : ''}
                            </span>
                          </span>
                          {selectedBuilding?.id === bld.id && (
                            <span className="ar-bld-list-check">✓</span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Step 2 — Floor chips (only after building selected) */}
          {selectedBuilding && (
            <div className="card ar-floor-section">
              <div className="ar-floor-header">
                <span className="ar-section-label">
                  🏬 {selectedBuilding.name} — Select a Floor
                </span>
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={() => { setSelectedBuilding(null); setSelectedFloor(null); }}
                >
                  ✕ Clear
                </button>
              </div>
              {floorsLoading ? (
                <div className="ar-floor-chips">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="ar-floor-chip ar-floor-chip--skeleton" />
                  ))}
                </div>
              ) : floors.length === 0 ? (
                <p className="ar-empty-inline">No floors found for this building</p>
              ) : (
                <div className="ar-floor-chips">
                  {floors.map(fl => (
                    <button
                      key={fl.id}
                      className={`ar-floor-chip${selectedFloor?.id === fl.id ? ' ar-floor-chip--active' : ''}`}
                      onClick={() => setSelectedFloor(fl)}
                    >
                      {fl.floor_label || fl.name || `Floor ${fl.floor_number}`}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 3 — Rooms (progressive disclosure) */}
          {!selectedBuilding ? (
            <div className="card">
              <div className="empty-state">
                <div className="empty-state__icon">🏢</div>
                <p className="empty-state__title">Select a building to get started</p>
                <p className="empty-state__sub">
                  Choose a building above, then select a floor to view its rooms
                </p>
              </div>
            </div>
          ) : !selectedFloor ? (
            <div className="card">
              <div className="empty-state">
                <div className="empty-state__icon">🏬</div>
                <p className="empty-state__title">Select a floor</p>
                <p className="empty-state__sub">
                  Choose a floor from {selectedBuilding.name} to view and manage its rooms
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Context bar + search */}
              <div className="card card--sm ar-rooms-toolbar">
                <div className="ar-context-bar">
                  <span className="ar-breadcrumb">
                    <span className="ar-breadcrumb-bld">{selectedBuilding.name}</span>
                    <span className="ar-breadcrumb-sep">›</span>
                    <span className="ar-breadcrumb-fl">
                      {selectedFloor.floor_label || selectedFloor.name || `Floor ${selectedFloor.floor_number}`}
                    </span>
                  </span>
                  <span className="ar-rooms-count">
                    {rooms.length !== allRooms.length
                      ? `${rooms.length} of ${allRooms.length} rooms`
                      : `${allRooms.length} room${allRooms.length !== 1 ? 's' : ''}`}
                  </span>
                </div>
                <div className="ar-search-row">
                  <Input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search room number or name…"
                    style={{ flex: 1, minWidth: 160 }}
                  />
                  <Select
                    value={typeFilter}
                    onChange={e => setTypeFilter(e.target.value)}
                    options={[
                      { value: '', label: 'All types' },
                      ...roomTypes.map(rt => ({ value: rt.value, label: rt.label_en })),
                    ]}
                    style={{ width: 160 }}
                  />
                </div>
              </div>

              <div className="card card--no-pad">
                <Table
                  columns={columns}
                  data={rooms}
                  loading={loading}
                  emptyMessage={
                    allRooms.length === 0
                      ? 'No rooms on this floor yet — click Add Room to create one'
                      : 'No rooms match your search or filter'
                  }
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Modals ── */}
      <RoomFormModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        floorId={floorId}
        floorLabel={
          selectedFloor
            ? `${selectedBuilding?.name} › ${selectedFloor.floor_label || selectedFloor.name}`
            : undefined
        }
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
        floorLabel={
          selectedFloor
            ? `${selectedBuilding?.name} › ${selectedFloor.floor_label || selectedFloor.name}`
            : undefined
        }
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
        message={`Delete room "${delRoom?.room_number} — ${delRoom?.name}"? Schedule references will be unassigned.`}
      />

      <RoomTypeManagerModal
        open={showRoomTypeManager}
        onClose={() => setShowRoomTypeManager(false)}
      />
    </div>
  );
}

// ─── Room Type Manager Modal ──────────────────────────────────────────────────

function ToggleSwitch({ checked, onChange, color = 'blue', title }) {
  return (
    <label className={`ar-toggle ar-toggle--${color}`} title={title}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="ar-toggle-track" />
    </label>
  );
}

function RoomTypeForm({ initial, onSave, onCancel, saving, isCreate }) {
  const [form, setForm] = useState(() =>
    initial
      ? {
          label_en:              initial.label_en              || '',
          label_ar:              initial.label_ar              || '',
          icon:                  initial.icon                  || '',
          color:                 initial.color                 || '',
          sort_order:            initial.sort_order            ?? 999,
          is_bookable_for_events: initial.is_bookable_for_events ?? false,
          is_teaching:           initial.is_teaching           ?? false,
          is_accessible:         initial.is_accessible         ?? false,
          is_public:             initial.is_public             ?? true,
          is_active:             initial.is_active             ?? true,
        }
      : {
          value:                 '',
          label_en:              '',
          label_ar:              '',
          icon:                  '',
          color:                 '',
          sort_order:            999,
          is_bookable_for_events: false,
          is_teaching:           false,
          is_accessible:         false,
          is_public:             true,
          is_active:             true,
        }
  );

  const set = key => e => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm(f => ({ ...f, [key]: val }));
  };

  return (
    <div className="ar-rtype-form">
      <div className="ar-rtype-form-head">
        <strong>{isCreate ? '+ Add New Room Type' : `Edit: ${initial?.value}`}</strong>
        <button className="btn btn--ghost btn--sm" onClick={onCancel}>✕ Cancel</button>
      </div>

      {isCreate && (
        <div className="ar-rtype-form-field">
          <Input
            label="Type Key (slug)"
            required
            value={form.value}
            onChange={set('value')}
            placeholder="e.g. seminar_room"
          />
          <p className="ar-rtype-warning">
            ⚠️ The key maps to a database enum value and <strong>cannot be changed</strong> after
            creation. Lowercase letters, numbers, and underscores only.
          </p>
        </div>
      )}

      <div className="form-row">
        <Input
          label="English Label"
          required
          value={form.label_en}
          onChange={set('label_en')}
          placeholder="Lecture Hall"
        />
        <Input
          label="Arabic Label"
          value={form.label_ar}
          onChange={set('label_ar')}
          placeholder="قاعة محاضرات"
        />
      </div>

      <div className="form-row" style={{ marginTop: 8 }}>
        <Input
          label="Icon (emoji)"
          value={form.icon}
          onChange={set('icon')}
          placeholder="🎓"
          style={{ maxWidth: 100 }}
        />
        <Input
          label="Color (hex)"
          value={form.color}
          onChange={set('color')}
          placeholder="#1d4ed8"
          style={{ maxWidth: 130 }}
        />
        <Input
          label="Sort Order"
          type="number"
          value={form.sort_order}
          onChange={set('sort_order')}
          style={{ maxWidth: 110 }}
        />
      </div>

      <div className="ar-rtype-flags">
        {[
          { key: 'is_bookable_for_events', label: 'Bookable for Events' },
          { key: 'is_teaching',            label: 'Teaching Room' },
          { key: 'is_accessible',          label: 'Accessible Facility' },
          { key: 'is_public',              label: 'Visible to Students' },
          { key: 'is_active',              label: 'Active' },
        ].map(({ key, label }) => (
          <label key={key} className="ar-rtype-flag-label">
            <input type="checkbox" checked={form[key]} onChange={set(key)} />
            {label}
          </label>
        ))}
      </div>

      <div className="ar-rtype-form-actions">
        <Button variant="primary" loading={saving} onClick={() => onSave(form)}>
          {isCreate ? 'Create Room Type' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}

function RoomTypeManagerModal({ open, onClose }) {
  const [types,       setTypes]       = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [showCreate,  setShowCreate]  = useState(false);
  const [saving,      setSaving]      = useState(false);

  const loadTypes = useCallback(async () => {
    setLoadingList(true);
    try {
      const res  = await roomTypeAPI.adminList();
      const list = res.data?.data?.roomTypes ?? res.data?.roomTypes ?? [];
      setTypes(Array.isArray(list) ? list : []);
    } catch {
      toast.error('Failed to load room types');
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    if (open) loadTypes();
  }, [open, loadTypes]);

  // Optimistic toggle for boolean flags
  const handleToggle = async (type, field) => {
    const snapshot = types;
    setTypes(prev =>
      prev.map(t => (t.id === type.id ? { ...t, [field]: !t[field] } : t))
    );
    try {
      if (field === 'is_active') {
        await roomTypeAPI.adminToggle(type.id);
      } else {
        await roomTypeAPI.adminUpdate(type.id, { [field]: !type[field] });
      }
    } catch {
      setTypes(snapshot);
      toast.error('Failed to update');
    }
  };

  const handleSaveEdit = async formData => {
    setSaving(true);
    try {
      await roomTypeAPI.adminUpdate(editingType.id, formData);
      toast.success('Room type updated');
      setEditingType(null);
      await loadTypes();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update room type');
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async formData => {
    setSaving(true);
    try {
      await roomTypeAPI.adminCreate(formData);
      toast.success(`Room type "${formData.value}" created`);
      setShowCreate(false);
      await loadTypes();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create room type');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Room Types Manager"
      size="xl"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      {/* Header row */}
      <div className="ar-rtm-header">
        <p className="ar-rtm-sub">
          Edit labels, icons, and flags. Inactive types won't appear in the Add Room dropdown.
          Toggles save immediately.
        </p>
        {!showCreate && !editingType && (
          <Button
            variant="primary"
            icon={<PlusIcon />}
            onClick={() => setShowCreate(true)}
          >
            Add Type
          </Button>
        )}
      </div>

      {/* Create / Edit form */}
      {showCreate && (
        <RoomTypeForm
          isCreate
          onSave={handleCreate}
          onCancel={() => setShowCreate(false)}
          saving={saving}
        />
      )}
      {editingType && (
        <RoomTypeForm
          initial={editingType}
          onSave={handleSaveEdit}
          onCancel={() => setEditingType(null)}
          saving={saving}
        />
      )}

      {/* Types table */}
      {loadingList ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div className="spinner" />
        </div>
      ) : (
        <div className="ar-rtype-table-wrap">
          <table className="ar-rtype-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Labels</th>
                <th title="Bookable for Events" className="ar-rtype-th-center">Events</th>
                <th title="Teaching Room"        className="ar-rtype-th-center">Teaching</th>
                <th title="Visible to students"  className="ar-rtype-th-center">Public</th>
                <th title="Active in dropdowns"  className="ar-rtype-th-center">Active</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {types.map(t => (
                <tr
                  key={t.id}
                  className={`ar-rtype-row${!t.is_active ? ' ar-rtype-row--inactive' : ''}`}
                >
                  <td>
                    <div className="ar-rtype-identity">
                      <span className="ar-rtype-icon">{t.icon || '📍'}</span>
                      <span
                        className="ar-rtype-key"
                        style={{ backgroundColor: t.color ? `${t.color}22` : undefined }}
                      >
                        {t.value}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="ar-rtype-labels">
                      <span className="ar-rtype-label-en">{t.label_en}</span>
                      {t.label_ar && (
                        <span className="ar-rtype-label-ar">{t.label_ar}</span>
                      )}
                    </div>
                  </td>
                  <td className="ar-rtype-td-center">
                    <ToggleSwitch
                      checked={!!t.is_bookable_for_events}
                      onChange={() => handleToggle(t, 'is_bookable_for_events')}
                      color="gold"
                      title="Bookable for events"
                    />
                  </td>
                  <td className="ar-rtype-td-center">
                    <ToggleSwitch
                      checked={!!t.is_teaching}
                      onChange={() => handleToggle(t, 'is_teaching')}
                      color="green"
                      title="Teaching room"
                    />
                  </td>
                  <td className="ar-rtype-td-center">
                    <ToggleSwitch
                      checked={!!t.is_public}
                      onChange={() => handleToggle(t, 'is_public')}
                      color="blue"
                      title="Visible to students"
                    />
                  </td>
                  <td className="ar-rtype-td-center">
                    <ToggleSwitch
                      checked={!!t.is_active}
                      onChange={() => handleToggle(t, 'is_active')}
                      color="navy"
                      title="Active in dropdowns"
                    />
                  </td>
                  <td>
                    <button
                      className="btn btn--ghost btn--sm btn--icon"
                      title="Edit labels and settings"
                      onClick={() => {
                        setEditingType(t);
                        setShowCreate(false);
                      }}
                    >
                      <EditIcon />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

// ─── Exported helpers (used by MapEditorPage and others) ─────────────────────

export function emptyRoomForm() {
  return {
    room_number:     '',
    lecturer_number: '',
    name:            '',
    type:            'lecture_hall',
    department:      '',
    capacity:        '',
    description:     '',
    is_accessible:   true,
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
    floor_id:     floorId,
    room_number:  String(form.room_number || '').trim().toUpperCase(),
    name:         String(form.name        || '').trim(),
    type:         cleanRoomType(form.type),
    is_accessible: Boolean(form.is_accessible),
  };

  const department     = String(form.department     || '').trim();
  const lecturerNumber = String(form.lecturer_number || '').trim();
  const description    = String(form.description    || '').trim();
  const capacity       = String(form.capacity       ?? '').trim();

  if (department)     payload.department      = department;
  if (lecturerNumber) payload.lecturer_number = lecturerNumber;
  if (description)    payload.description     = description;
  if (capacity !== '') payload.capacity       = Number(capacity);

  return payload;
}

export function RoomFormModal({
  open,
  onClose,
  floorId,
  floorLabel,
  existingRoom,
  onSaved,
  title,
  getBackendErrorMessage,
  roomTypes,
}) {
  const isEdit = Boolean(existingRoom?.id);

  const [form,    setForm]    = useState(emptyRoomForm());
  const [loading, setLoading] = useState(false);
  const [errors,  setErrors]  = useState({});

  useEffect(() => {
    if (!open) return;

    if (existingRoom) {
      setForm({
        room_number:     existingRoom.room_number     || '',
        lecturer_number: existingRoom.lecturer_number || '',
        name:            existingRoom.name            || '',
        type:            cleanRoomType(existingRoom.type || 'lecture_hall'),
        department:      existingRoom.department      || '',
        capacity:
          existingRoom.capacity !== null && existingRoom.capacity !== undefined
            ? String(existingRoom.capacity)
            : '',
        description:   existingRoom.description   || '',
        is_accessible: existingRoom.is_accessible === true,
      });
    } else {
      setForm(emptyRoomForm());
    }

    setErrors({});
  }, [open, existingRoom]);

  const set = key => event => {
    const value =
      event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm(current => ({ ...current, [key]: value }));
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
    if (cleanRoomType(form.type) === 'office' && !/^\d{4}$/.test(lecturerNumber)) {
      nextErrors.lecturer_number = 'Doctor offices must have a 4-digit lecturer number.';
    } else if (lecturerNumber && !/^\d{4}$/.test(lecturerNumber)) {
      nextErrors.lecturer_number = 'Lecturer number must be exactly 4 digits.';
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
        toast.success(`Room ${payload.room_number} updated`);
      } else {
        await roomAPI.create(payload);
        toast.success(`Room ${payload.room_number} added`);
      }
      await onSaved();
    } catch (err) {
      toast.error(getBackendErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Only show active room types in the dropdown
  const activeRoomTypes = (roomTypes || []).filter(rt => rt.is_active !== false);

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
        {/* Floor context banner */}
        {floorLabel && (
          <div className="ar-modal-context">
            📍 {floorLabel}
          </div>
        )}

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
            placeholder="e.g. A2-101"
          />
          <Input
            label="Lecturer Number / رقم المدرس"
            value={form.lecturer_number || ''}
            onChange={set('lecturer_number')}
            error={errors.lecturer_number}
            placeholder="e.g. 1394"
          />
          <Select
            label="Type"
            required
            value={form.type}
            onChange={set('type')}
            options={activeRoomTypes.map(rt => ({ value: rt.value, label: rt.label_en }))}
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
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 13, color: 'var(--text)', cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={form.is_accessible}
            onChange={set('is_accessible')}
          />
          Wheelchair accessible
        </label>

        {isEdit && cleanRoomType(form.type) === 'office' && (
          <OfficeAssignmentsPanel roomId={existingRoom.id} />
        )}
      </div>
    </Modal>
  );
}

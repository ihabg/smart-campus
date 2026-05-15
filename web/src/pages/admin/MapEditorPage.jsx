import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { floorAPI, mapEditorAPI, roomAPI } from '../../api/index';
import { Button, Input, Select, Modal, ConfirmDialog, Spinner } from '../../components/ui/index';
import { getErrorMessage, roomTypeLabel } from '../../utils/helpers';
import toast from 'react-hot-toast';
import './MapEditor.css';

const ROOM_TYPES = [
  'classroom',
  'lecture_hall',
  'lab',
  'office',
  'corridor',
  'restroom',
  'bathroom',
  'elevator',
  'stairs',
  'storage',
  'atrium',
  'meeting_room',
  'library',
  'cafeteria',
  'amphitheater',
  'professor_lounge',
  'emergency_exit',
  'bookstore',
  'engineering_drawing_room',
  'engineering_drawing_studio',
  'other',
];

const FLOOR_ORDER = ['B2', 'B1', 'G', '1', '2', '3', '4'];
const MAIN_BUILDING_CODE = 'ENG';

const TYPE_COLORS = {
  classroom:    '#e8e3fa',
  lecture_hall: '#dbeafe',
  lab:          '#d1eddf',
  office:       '#fef3c7',
  corridor:     '#dde4f0',
  stairs:       '#cdd5e5',
  default:      '#f1f0ee',
};

const TYPE_STROKES = {
  classroom:    '#7c3aed',
  lecture_hall: '#1d4ed8',
  lab:          '#22a060',
  office:       '#b45309',
  corridor:     '#b0bcd0',
  stairs:       '#8899bb',
  default:      '#b0bcd0',
};

export default function MapEditorPage() {
  const [searchParams]  = useSearchParams();
  const initialFloorId  = searchParams.get('floor');

  // Floor / building state
const [buildings,         setBuildings]         = useState([]);
const [floors,            setFloors]            = useState([]);
const [selectedBuilding,  setSelectedBuilding]  = useState('');
const [selectedFloor,     setSelectedFloor]     = useState(initialFloorId || '');
  const [floorData,      setFloorData]      = useState(null);
  const [loading,        setLoading]        = useState(false);

  // Room state
  const [rooms,          setRooms]          = useState([]);
  const [adjacency,      setAdjacency]      = useState([]);
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [hoveredRoomId,  setHoveredRoomId]  = useState(null);

  // Editor mode
  const [mode, setMode] = useState('select'); // 'select' | 'add' | 'connect'
  const [newRoomForm, setNewRoomForm] = useState({ room_number:'', name:'', type:'classroom', department:'', capacity:'' });
  const [showAddModal,   setShowAddModal]   = useState(false);
  const [pendingCoords,  setPendingCoords]  = useState(null);
  const [connecting,     setConnecting]     = useState(null); // first room of connection

  // Edit room modal
  const [editRoom,       setEditRoom]       = useState(null);
  const [delRoom,        setDelRoom]        = useState(null);
  const [delLoading,     setDelLoading]     = useState(false);
  const [saving,         setSaving]         = useState(false);

  // Drag state
  const canvasRef   = useRef(null);
  const drag        = useRef({ active: false, roomId: null, startX: 0, startY: 0, origX: 0, origY: 0 });
  const resize      = useRef({ active: false, roomId: null, handle: null, startX: 0, startY: 0, orig: null });
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const panDrag     = useRef({ active: false, sx: 0, sy: 0, tx: 0, ty: 0 });

function sortFloors(list) {
  return [...list].sort((a, b) => {
    const ai = FLOOR_ORDER.indexOf(String(a.floor_label));
    const bi = FLOOR_ORDER.indexOf(String(b.floor_label));

    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;

    return Number(a.display_order ?? a.floor_number ?? 0) -
           Number(b.display_order ?? b.floor_number ?? 0);
  });
}

const loadFloors = async (buildingId) => {
  if (!buildingId) {
    setFloors([]);
    return [];
  }

  const { data } = await floorAPI.getAll({
    active_only: 'false',
    building_id: buildingId
  });

  const rawFloors = data.data?.floors || [];

  // This extra filter protects you if backend ignores building_id.
  const filteredFloors = rawFloors.filter((floor) => {
    return !buildingId || floor.building_id === buildingId;
  });

  const sortedFloors = sortFloors(filteredFloors);

  setFloors(sortedFloors);

  return sortedFloors;
};

const loadFloor = useCallback(async (floorId) => {
  if (!floorId) return;

  setSelectedFloor(floorId);
  setLoading(true);

  try {
    const { data } = await mapEditorAPI.getFloor(floorId);
    const floor = data.data.floor;

    setFloorData(floor);

    if (floor?.building_id) {
      setSelectedBuilding(floor.building_id);
    }

    setRooms(
      (data.data.rooms || []).map((room) => ({
        ...room,
        coord_x: parseFloat(room.coord_x) || 10,
        coord_y: parseFloat(room.coord_y) || 10,
        coord_width: parseFloat(room.coord_width) || 8,
        coord_height: parseFloat(room.coord_height) || 6,
      }))
    );

    setAdjacency(data.data.adjacency || []);
    setSelectedRoomId(null);
    setConnecting(null);

    setTimeout(() => {
      fitCanvas();
    }, 80);
  } catch (err) {
    toast.error(getErrorMessage(err));
  } finally {
    setLoading(false);
  }
}, []); // eslint-disable-line react-hooks/exhaustive-deps

useEffect(() => {
  async function initEditor() {
    try {
      const { data } = await floorAPI.getBuildings();

      const allBuildings = data.data?.buildings || [];

      // Keep Engineering Building first, and hide other blocks if ENG exists.
      const engBuildings = allBuildings.filter(
        (building) => building.code === MAIN_BUILDING_CODE
      );

      const visibleBuildings =
        engBuildings.length > 0 ? engBuildings : allBuildings;

      setBuildings(visibleBuildings);

      const defaultBuilding = visibleBuildings[0];

      if (!defaultBuilding) return;

      setSelectedBuilding(defaultBuilding.id);

      const loadedFloors = await loadFloors(defaultBuilding.id);

      if (initialFloorId) {
        await loadFloor(initialFloorId);
        return;
      }

      const defaultFloor =
        loadedFloors.find((floor) => floor.floor_label === 'G') ||
        loadedFloors[0];

      if (defaultFloor) {
        await loadFloor(defaultFloor.id);
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  initEditor();
}, [initialFloorId, loadFloor]); // eslint-disable-line react-hooks/exhaustive-deps

async function handleBuildingChange(buildingId) {
  setSelectedBuilding(buildingId);
  setSelectedFloor('');
  setFloorData(null);
  setRooms([]);
  setAdjacency([]);
  setSelectedRoomId(null);

  const loadedFloors = await loadFloors(buildingId);

  const defaultFloor =
    loadedFloors.find((floor) => floor.floor_label === 'G') ||
    loadedFloors[0];

  if (defaultFloor) {
    await loadFloor(defaultFloor.id);
  }
}

  const fitCanvas = () => {
    if (!canvasRef.current) return;
    const { clientWidth: cw, clientHeight: ch } = canvasRef.current;
    setTransform({ x: 20, y: 20, scale: Math.min((cw - 40) / 1200, (ch - 40) / 600) });
  };

  // ── Convert screen coords to canvas coords ────────────────
  const screenToCanvas = useCallback((sx, sy) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: ((sx - rect.left - transform.x) / transform.scale / 12),
      y: ((sy - rect.top  - transform.y) / transform.scale / 6),
    };
  }, [transform]);

  // ── Canvas click ──────────────────────────────────────────
  const handleCanvasClick = useCallback((e) => {
    if (e.target !== canvasRef.current && !e.target.classList.contains('mec-canvas-bg')) return;

    if (mode === 'add') {
      const coords = screenToCanvas(e.clientX, e.clientY);
      setPendingCoords({ x: Math.max(1, Math.min(91, coords.x)), y: Math.max(1, Math.min(91, coords.y)) });
      setShowAddModal(true);
    } else {
      setSelectedRoomId(null);
    }
  }, [mode, screenToCanvas]);

  // ── Room click ────────────────────────────────────────────
  const handleRoomClick = useCallback((e, roomId) => {
    e.stopPropagation();
    if (mode === 'connect') {
      if (!connecting) {
        setConnecting(roomId);
        toast('Now click the second room to connect', { icon: '🔗' });
      } else if (connecting !== roomId) {
        // Add or toggle adjacency
        const exists = adjacency.find(a =>
          (a.room_a_id === connecting && a.room_b_id === roomId) ||
          (a.room_a_id === roomId    && a.room_b_id === connecting)
        );
        if (exists) {
          setAdjacency(prev => prev.filter(a => a !== exists));
          toast.success('Connection removed');
        } else {
          setAdjacency(prev => [...prev, { room_a_id: connecting, room_b_id: roomId, weight: 1.0 }]);
          toast.success('Connection added');
        }
        setConnecting(null);
      }
    } else {
      setSelectedRoomId(roomId);
    }
  }, [mode, connecting, adjacency]);

  // ── Room drag ─────────────────────────────────────────────
  const handleRoomMouseDown = useCallback((e, roomId) => {
    if (mode !== 'select') return;
    e.stopPropagation();
    const room = rooms.find(r => r.id === roomId);
    if (!room) return;
    drag.current = {
      active: true, roomId,
      startX: e.clientX, startY: e.clientY,
      origX: room.coord_x, origY: room.coord_y,
    };
    setSelectedRoomId(roomId);
  }, [mode, rooms]);

  // ── Resize handle mouse down ──────────────────────────────
  const handleResizeMouseDown = useCallback((e, roomId, handle) => {
    e.stopPropagation();
    const room = rooms.find(r => r.id === roomId);
    if (!room) return;
    resize.current = {
      active: true, roomId, handle,
      startX: e.clientX, startY: e.clientY,
      orig: { x: room.coord_x, y: room.coord_y, w: room.coord_width, h: room.coord_height },
    };
  }, [rooms]);

  // ── Global mouse move / up ────────────────────────────────
  useEffect(() => {
    const onMove = (e) => {
      // Drag room
      if (drag.current.active) {
        const dx = (e.clientX - drag.current.startX) / transform.scale / 12;
        const dy = (e.clientY - drag.current.startY) / transform.scale / 6;
        setRooms(prev => prev.map(r => r.id === drag.current.roomId
          ? { ...r, coord_x: Math.max(0, Math.min(91, drag.current.origX + dx)), coord_y: Math.max(0, Math.min(91, drag.current.origY + dy)) }
          : r
        ));
        return;
      }
      // Resize room
      if (resize.current.active) {
        const { orig, handle } = resize.current;
        const dx = (e.clientX - resize.current.startX) / transform.scale / 12;
        const dy = (e.clientY - resize.current.startY) / transform.scale / 6;
        setRooms(prev => prev.map(r => {
          if (r.id !== resize.current.roomId) return r;
          let { x, y, w, h } = { x: orig.x, y: orig.y, w: orig.w, h: orig.h };
          if (handle === 'se') { w = Math.max(2, w + dx); h = Math.max(1, h + dy); }
          if (handle === 'sw') { x = orig.x + dx; w = Math.max(2, w - dx); h = Math.max(1, h + dy); }
          if (handle === 'ne') { y = orig.y + dy; w = Math.max(2, w + dx); h = Math.max(1, h - dy); }
          if (handle === 'nw') { x = orig.x + dx; y = orig.y + dy; w = Math.max(2, w - dx); h = Math.max(1, h - dy); }
          if (handle === 'e')  { w = Math.max(2, w + dx); }
          if (handle === 's')  { h = Math.max(1, h + dy); }
          if (handle === 'w')  { x = orig.x + dx; w = Math.max(2, w - dx); }
          if (handle === 'n')  { y = orig.y + dy; h = Math.max(1, h - dy); }
          return { ...r, coord_x: x, coord_y: y, coord_width: w, coord_height: h };
        }));
        return;
      }
      // Pan canvas
      if (panDrag.current.active) {
        setTransform(t => ({
          ...t,
          x: panDrag.current.tx + (e.clientX - panDrag.current.sx),
          y: panDrag.current.ty + (e.clientY - panDrag.current.sy),
        }));
      }
    };

    const onUp = async () => {
      // Auto-save room position on drag end
      if (drag.current.active) {
        const room = rooms.find(r => r.id === drag.current.roomId);
        if (room?.id && !room.id.startsWith('new_')) {
          try {
            await mapEditorAPI.savePosition(room.id, {
              coord_x: room.coord_x, coord_y: room.coord_y,
              coord_width: room.coord_width, coord_height: room.coord_height,
            });
          } catch { /* silent */ }
        }
      }
      drag.current.active   = false;
      resize.current.active = false;
      panDrag.current.active = false;
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [rooms, transform.scale]);

  // ── Canvas pan ────────────────────────────────────────────
  const handleCanvasMouseDown = (e) => {
    if (e.target !== canvasRef.current && !e.target.classList.contains('mec-canvas-bg')) return;
    if (mode === 'add') return;
    panDrag.current = { active: true, sx: e.clientX, sy: e.clientY, tx: transform.x, ty: transform.y };
  };

  // ── Wheel zoom ────────────────────────────────────────────
  const handleWheel = (e) => {
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const f = e.deltaY < 0 ? 1.12 : 0.9;
    setTransform(t => {
      const ns = Math.max(0.2, Math.min(5, t.scale * f));
      return { scale: ns, x: mx - (mx - t.x) * (ns / t.scale), y: my - (my - t.y) * (ns / t.scale) };
    });
  };

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }); // eslint-disable-line

  // ── Add room ──────────────────────────────────────────────
  const handleAddRoom = async () => {
    if (!newRoomForm.room_number || !newRoomForm.name) {
      toast.error('Room number and name are required');
      return;
    }
    try {
      const { data } = await roomAPI.create({
        floor_id:     selectedFloor,
        room_number:  newRoomForm.room_number,
        name:         newRoomForm.name,
        type:         newRoomForm.type,
        department:   newRoomForm.department || null,
        capacity:     newRoomForm.capacity ? parseInt(newRoomForm.capacity) : null,
        coord_x:      pendingCoords?.x || 10,
        coord_y:      pendingCoords?.y || 10,
        coord_width:  8,
        coord_height: 6,
      });
      setRooms(prev => [...prev, {
        ...data.data.room,
        coord_x:      parseFloat(data.data.room.coord_x) || 10,
        coord_y:      parseFloat(data.data.room.coord_y) || 10,
        coord_width:  parseFloat(data.data.room.coord_width) || 8,
        coord_height: parseFloat(data.data.room.coord_height) || 6,
      }]);
      setShowAddModal(false);
      setNewRoomForm({ room_number:'', name:'', type:'classroom', department:'', capacity:'' });
      toast.success(`Room ${data.data.room.room_number} added`);
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  // ── Save full layout ──────────────────────────────────────
  const handleSaveLayout = async () => {
    setSaving(true);
    try {
      await mapEditorAPI.saveLayout(selectedFloor, {
        rooms:     rooms.map(r => ({ ...r, polygon_points: r.polygon_points || null })),
        adjacency: adjacency,
      });
      toast.success('Layout saved successfully!');
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setSaving(false); }
  };

  // ── Delete room ───────────────────────────────────────────
  const handleDeleteRoom = async () => {
    setDelLoading(true);
    try {
      await roomAPI.delete(delRoom.id);
      setRooms(prev => prev.filter(r => r.id !== delRoom.id));
      setAdjacency(prev => prev.filter(a => a.room_a_id !== delRoom.id && a.room_b_id !== delRoom.id));
      if (selectedRoomId === delRoom.id) setSelectedRoomId(null);
      setDelRoom(null);
      toast.success('Room deleted');
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setDelLoading(false); }
  };

  // ── Update room from sidebar ──────────────────────────────
  const handleUpdateRoom = async () => {
    if (!editRoom) return;
    try {
      await roomAPI.update(editRoom.id, {
        name: editRoom.name, type: editRoom.type,
        department: editRoom.department, capacity: editRoom.capacity ? parseInt(editRoom.capacity) : null,
      });
      setRooms(prev => prev.map(r => r.id === editRoom.id ? { ...r, ...editRoom } : r));
      setEditRoom(null);
      toast.success('Room updated');
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  const selectedRoom = rooms.find(r => r.id === selectedRoomId);

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="mec">
      {/* Top toolbar */}
      <div className="mec-toolbar">
        <div className="mec-toolbar__left">
<select
  className="form-input mec-select"
  value={selectedBuilding}
  onChange={(e) => handleBuildingChange(e.target.value)}
>
  <option value="">Select building…</option>

  {buildings.map((building) => (
    <option key={building.id} value={building.id}>
      Block {building.code} — {building.name}
    </option>
  ))}
</select>

<select
  className="form-input mec-select"
  value={selectedFloor}
  onChange={(e) => loadFloor(e.target.value)}
  disabled={!selectedBuilding}
>
  <option value="">Select floor…</option>

  {floors.map((floor) => (
    <option key={floor.id} value={floor.id}>
      {floor.floor_label} — {floor.name}
    </option>
  ))}
</select>
        </div>

        <div className="mec-toolbar__modes">
          {[
            { key: 'select',  label: '↖ Select',  tip: 'Drag to move rooms' },
            { key: 'add',     label: '＋ Add',     tip: 'Click canvas to add room' },
            { key: 'connect', label: '🔗 Connect', tip: 'Click two rooms to add pathfinding edge' },
          ].map(m => (
            <button
              key={m.key}
              className={`btn btn--sm ${mode === m.key ? 'btn--primary' : 'btn--secondary'}`}
              onClick={() => { setMode(m.key); setConnecting(null); }}
              title={m.tip}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="mec-toolbar__right">
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {rooms.length} rooms · {adjacency.length} connections
          </span>
          <button className="btn btn--secondary btn--sm" onClick={() => setTransform(t => ({ ...t, scale: Math.min(5, t.scale * 1.2) }))}>+</button>
          <button className="btn btn--secondary btn--sm" onClick={() => setTransform(t => ({ ...t, scale: Math.max(0.2, t.scale / 1.2) }))}>−</button>
          <button className="btn btn--secondary btn--sm" onClick={fitCanvas}>⊙ Fit</button>
          <Button variant="primary" size="sm" loading={saving} onClick={handleSaveLayout} disabled={!selectedFloor}>
            💾 Save Layout
          </Button>
        </div>
      </div>

      {/* Help banner */}
      <div className="mec-hint">
        {mode === 'select'  && '↖ Drag rooms to reposition · Resize with corner handles · Click to select'}
        {mode === 'add'     && '＋ Click anywhere on the canvas to place a new room'}
        {mode === 'connect' && `🔗 ${connecting ? 'Now click the second room to connect' : 'Click the first room to start a connection'}`}
        {connecting && <span style={{ marginLeft: 12, color: 'var(--amber)', fontWeight: 600 }}>Connecting from: {rooms.find(r => r.id === connecting)?.room_number}</span>}
      </div>

      {/* Main area */}
      <div className="mec-main">
        {/* Canvas */}
        <div
          className={`mec-canvas ${mode === 'add' ? 'mec-canvas--crosshair' : ''}`}
          ref={canvasRef}
          onMouseDown={handleCanvasMouseDown}
          onClick={handleCanvasClick}
        >
          {loading ? (
            <div className="mec-canvas-loading"><Spinner size="lg" /></div>
          ) : !floorData ? (
            <div className="mec-canvas-empty">
              <div style={{ fontSize: 40, marginBottom: 12 }}>🗺️</div>
              <p style={{ fontWeight: 600, color: 'var(--text)' }}>Select a floor to start editing</p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Use the dropdowns above to choose a building and floor</p>
            </div>
          ) : (
            <div
              className="mec-canvas-wrap"
              style={{ transform: `translate(${transform.x}px,${transform.y}px) scale(${transform.scale})`, transformOrigin: 'top left' }}
            >
              {/* Background — either uploaded map image or grid */}
              {floorData.map_image_url ? (
                <img
                  src={floorData.map_image_url}
                  alt="floor map"
                  className="mec-map-img mec-canvas-bg"
                  draggable={false}
                />
              ) : (
                <div className="mec-map-grid mec-canvas-bg">
                  <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', color: 'var(--text-faint)', fontSize: 13, pointerEvents:'none' }}>
                    No map image uploaded — rooms are shown as placeholders
                  </span>
                </div>
              )}

              {/* Adjacency lines */}
              <svg className="mec-adjacency-svg" viewBox="0 0 1200 600" style={{ pointerEvents:'none' }}>
                {adjacency.map((edge, i) => {
                  const a = rooms.find(r => r.id === edge.room_a_id);
                  const b = rooms.find(r => r.id === edge.room_b_id);
                  if (!a || !b) return null;
                  const ax = (a.coord_x + a.coord_width  / 2) * 12;
                  const ay = (a.coord_y + a.coord_height / 2) * 6;
                  const bx = (b.coord_x + b.coord_width  / 2) * 12;
                  const by = (b.coord_y + b.coord_height / 2) * 6;
                  return <line key={i} x1={ax} y1={ay} x2={bx} y2={by} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4,3" opacity={0.7} />;
                })}
              </svg>

              {/* Rooms */}
              {rooms.map(room => {
                const x  = room.coord_x * 12;
                const y  = room.coord_y * 6;
                const w  = room.coord_width  * 12;
                const h  = room.coord_height * 6;
                const selected   = selectedRoomId === room.id;
                const hovered    = hoveredRoomId  === room.id;
                const connecting1= connecting === room.id;
                const fill   = TYPE_COLORS[room.type]   || TYPE_COLORS.default;
                const stroke = TYPE_STROKES[room.type]  || TYPE_STROKES.default;

                return (
                  <div
                    key={room.id}
                    className={`mec-room ${selected ? 'mec-room--selected' : ''} ${connecting1 ? 'mec-room--connecting' : ''} ${mode === 'add' ? 'mec-room--readonly' : ''}`}
                    style={{ left: x, top: y, width: w, height: h, background: fill, borderColor: selected ? '#ef4444' : connecting1 ? '#f59e0b' : stroke }}
                    onMouseDown={e => handleRoomMouseDown(e, room.id)}
                    onClick={e => handleRoomClick(e, room.id)}
                    onMouseEnter={() => setHoveredRoomId(room.id)}
                    onMouseLeave={() => setHoveredRoomId(null)}
                  >
                    <span className="mec-room__num" style={{ color: TYPE_STROKES[room.type] || '#555' }}>{room.room_number}</span>
                    {w > 60 && <span className="mec-room__name">{room.name?.slice(0, 12)}</span>}

                    {/* Resize handles (only when selected and in select mode) */}
                    {selected && mode === 'select' && ['nw','n','ne','e','se','s','sw','w'].map(h => (
                      <div
                        key={h}
                        className={`mec-handle mec-handle--${h}`}
                        onMouseDown={e => handleResizeMouseDown(e, room.id, h)}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="mec-sidebar">
          {selectedRoom ? (
            <div className="mec-sidebar__content">
              <div className="mec-sidebar__header">
                <span className="mec-sidebar__title">Room {selectedRoom.room_number}</span>
                <button className="btn btn--ghost btn--sm btn--icon" onClick={() => setSelectedRoomId(null)}>✕</button>
              </div>

              <div className="mec-sidebar__body">
                <div className="form-group">
                  <label className="form-label">Room Number</label>
                  <input className="form-input" value={selectedRoom.room_number} readOnly style={{ background: 'var(--bg)' }} />
                </div>
                <div className="form-group">
                  <label className="form-label">Name</label>
                  <input className="form-input" value={editRoom?.id === selectedRoom.id ? editRoom.name : selectedRoom.name}
                    onChange={e => setEditRoom(r => r ? { ...r, name: e.target.value } : { ...selectedRoom, name: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Type</label>
                  <select className="form-input" value={editRoom?.id === selectedRoom.id ? editRoom.type : selectedRoom.type}
                    onChange={e => setEditRoom(r => r ? { ...r, type: e.target.value } : { ...selectedRoom, type: e.target.value })}>
                    {ROOM_TYPES.map(t => <option key={t} value={t}>{roomTypeLabel(t)}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Department</label>
                  <input className="form-input" value={editRoom?.id === selectedRoom.id ? editRoom.department || '' : selectedRoom.department || ''}
                    onChange={e => setEditRoom(r => r ? { ...r, department: e.target.value } : { ...selectedRoom, department: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Capacity</label>
                  <input type="number" className="form-input" value={editRoom?.id === selectedRoom.id ? editRoom.capacity || '' : selectedRoom.capacity || ''}
                    onChange={e => setEditRoom(r => r ? { ...r, capacity: e.target.value } : { ...selectedRoom, capacity: e.target.value })} />
                </div>

                <div style={{ padding: '8px 0', borderTop: '1px solid var(--border)', marginTop: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Position (% of canvas)</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, fontSize:12 }}>
                    <div>X: <strong>{selectedRoom.coord_x?.toFixed(1)}%</strong></div>
                    <div>Y: <strong>{selectedRoom.coord_y?.toFixed(1)}%</strong></div>
                    <div>W: <strong>{selectedRoom.coord_width?.toFixed(1)}%</strong></div>
                    <div>H: <strong>{selectedRoom.coord_height?.toFixed(1)}%</strong></div>
                  </div>
                </div>

                <div style={{ display:'flex', flexDirection:'column', gap:6, marginTop:12 }}>
                  <Button variant="primary" size="sm" full onClick={handleUpdateRoom}>Save Room Info</Button>
                  <Button variant="danger" size="sm" full onClick={() => setDelRoom(selectedRoom)}>Delete Room</Button>
                </div>

                {/* Connections */}
                <div style={{ marginTop:16 }}>
                  <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em', color:'var(--text-muted)', marginBottom:8 }}>Connections</div>
                  {adjacency.filter(a => a.room_a_id === selectedRoomId || a.room_b_id === selectedRoomId).map((edge, i) => {
                    const otherId = edge.room_a_id === selectedRoomId ? edge.room_b_id : edge.room_a_id;
                    const other   = rooms.find(r => r.id === otherId);
                    return (
                      <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 8px', background:'var(--bg)', borderRadius:4, marginBottom:4, fontSize:12 }}>
                        <span>Room {other?.room_number || '?'}</span>
                        <button className="btn btn--ghost btn--sm" style={{ padding:'2px 6px', color:'var(--red)', fontSize:11 }}
                          onClick={() => setAdjacency(prev => prev.filter((_, idx) => idx !== adjacency.indexOf(edge)))}>✕</button>
                      </div>
                    );
                  })}
                  {adjacency.filter(a => a.room_a_id === selectedRoomId || a.room_b_id === selectedRoomId).length === 0 && (
                    <p style={{ fontSize:12, color:'var(--text-faint)' }}>No connections yet. Use 🔗 Connect mode.</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="mec-sidebar__empty">
              <div style={{ fontSize:32, marginBottom:12 }}>🏢</div>
              <p style={{ fontWeight:600, marginBottom:6 }}>No room selected</p>
              <p style={{ fontSize:12, color:'var(--text-muted)', lineHeight:1.6 }}>
                Click a room to edit its details, or use the toolbar to add new rooms.
              </p>
              {floorData && (
                <div style={{ marginTop:16, fontSize:12, color:'var(--text-muted)', textAlign:'left', width:'100%' }}>
                  <strong style={{ color:'var(--text)', display:'block', marginBottom:8 }}>{floorData.name}</strong>
                  <div style={{ display:'flex', justifyContent:'space-between', borderBottom:'1px solid var(--border)', padding:'5px 0' }}>
                    <span>Total rooms</span><strong>{rooms.length}</strong>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', borderBottom:'1px solid var(--border)', padding:'5px 0' }}>
                    <span>Connections</span><strong>{adjacency.length}</strong>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', padding:'5px 0' }}>
                    <span>Map image</span><strong style={{ color: floorData.map_image_url ? 'var(--green)' : 'var(--red)' }}>{floorData.map_image_url ? '✓ Uploaded' : '✗ Missing'}</strong>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add room modal */}
      <Modal open={showAddModal} onClose={() => setShowAddModal(false)} title="Add New Room" size="sm"
        footer={<><Button variant="secondary" onClick={() => setShowAddModal(false)}>Cancel</Button><Button variant="primary" onClick={handleAddRoom}>Add Room</Button></>}
      >
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {pendingCoords && <p style={{ fontSize:12, color:'var(--text-muted)' }}>Position: ({pendingCoords.x?.toFixed(1)}%, {pendingCoords.y?.toFixed(1)}%)</p>}
          <Input label="Room Number" required value={newRoomForm.room_number} onChange={e => setNewRoomForm(f => ({ ...f, room_number: e.target.value }))} placeholder="e.g. 101" />
          <Input label="Room Name" required value={newRoomForm.name} onChange={e => setNewRoomForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Computer Lab" />
          <Select label="Type" value={newRoomForm.type} onChange={e => setNewRoomForm(f => ({ ...f, type: e.target.value }))}
            options={ROOM_TYPES.map(t => ({ value: t, label: roomTypeLabel(t) }))} />
          <div className="form-row">
            <Input label="Department" value={newRoomForm.department} onChange={e => setNewRoomForm(f => ({ ...f, department: e.target.value }))} placeholder="Optional" />
            <Input label="Capacity" type="number" value={newRoomForm.capacity} onChange={e => setNewRoomForm(f => ({ ...f, capacity: e.target.value }))} placeholder="Optional" />
          </div>
        </div>
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog open={!!delRoom} onClose={() => setDelRoom(null)} onConfirm={handleDeleteRoom}
        loading={delLoading} danger title="Delete Room"
        message={`Delete room "${delRoom?.room_number} — ${delRoom?.name}"? This cannot be undone.`} />
    </div>
  );
}

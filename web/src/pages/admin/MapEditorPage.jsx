import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { floorAPI, mapEditorAPI, roomAPI } from '../../api/index';
import { Button, Input, Select, Modal, ConfirmDialog, Spinner } from '../../components/ui/index';
import { getErrorMessage, roomTypeLabel } from '../../utils/helpers';
import toast from 'react-hot-toast';
import './MapEditor.css';
import { FLOOR_MAPS } from '../../data/floorMapGeometry';

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

const TYPE_STROKES = {
  classroom: '#7c3aed',
  lecture_hall: '#1d4ed8',
  lab: '#22a060',
  office: '#b45309',
  corridor: '#b0bcd0',
  restroom: '#2563eb',
  bathroom: '#7c3aed',
  elevator: '#8b5cf6',
  stairs: '#ef4444',
  emergency_exit: '#ef4444',
  emergency_stairs: '#ef4444',
  storage: '#64748b',
  default: '#b0bcd0',
};

function normalizeRoomSearch(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizeEditorRoomType(type) {
  const value = String(type || 'other').trim().toLowerCase().replace(/\s+/g, '_');
  if (value === 'emergency_exit') return 'emergency_stairs';
  return value;
}

function getDbRoomCandidateKeys(room) {
  const raw = String(room?.room_number || '').trim().toUpperCase();
  const keys = new Set();

  if (raw) keys.add(normalizeRoomSearch(raw));
  if (raw.includes('-EXIT-')) keys.add(normalizeRoomSearch(raw.replace('-EXIT-', '-STAIRS-')));
  if (raw.includes('-STAIRS-')) keys.add(normalizeRoomSearch(raw.replace('-STAIRS-', '-EXIT-')));

  return [...keys];
}

function getEditorFloorKey(floorData) {
  const label = String(floorData?.floor_label || '').trim().toUpperCase();

  if (label === 'B2') return 'B2';
  if (label === 'B1') return 'B1';
  if (label === 'G') return 'G';

  const number = Number(floorData?.floor_number);
  if (number === -2) return 'B2';
  if (number === -1) return 'B1';
  if (number === 0) return 'G';

  return String(number || label);
}

function sortFloors(list) {
  return [...list].sort((a, b) => {
    const ai = FLOOR_ORDER.indexOf(String(a.floor_label));
    const bi = FLOOR_ORDER.indexOf(String(b.floor_label));

    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;

    return Number(a.display_order ?? a.floor_number ?? 0) - Number(b.display_order ?? b.floor_number ?? 0);
  });
}

function parseFeatures(features) {
  if (!features) return {};
  if (typeof features === 'object') return features;

  if (typeof features === 'string') {
    try {
      const parsed = JSON.parse(features);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  return {};
}

function withOffsetMode(features) {
  return {
    ...parseFeatures(features),
    geometry_mode: 'offset_from_design',
  };
}

function usesOffsetMode(roomOrBlock) {
  return parseFeatures(roomOrBlock?.features).geometry_mode === 'offset_from_design';
}

function percentToPixelsX(percent, width) {
  return (Number(percent || 0) / 100) * width;
}

function percentToPixelsY(percent, height) {
  return (Number(percent || 0) / 100) * height;
}

function pixelsToPercentX(pixels, width) {
  return width ? (pixels / width) * 100 : 0;
}

function pixelsToPercentY(pixels, height) {
  return height ? (pixels / height) * 100 : 0;
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function generateDefaultPolygonPoints(centerX, centerY, vertexCount, radiusPercent = 8) {
  return Array.from({ length: vertexCount }, (_, i) => {
    const angle = (i / vertexCount) * 2 * Math.PI - Math.PI / 2;
    return {
      x: Math.round((centerX + radiusPercent * Math.cos(angle)) * 10) / 10,
      y: Math.round((centerY + radiusPercent * Math.sin(angle)) * 10) / 10,
    };
  });
}

function polygonCenter(points) {
  const parsed = String(points || '')
    .trim()
    .split(/\s+/)
    .map(pair => {
      const [x, y] = pair.split(',').map(Number);
      return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
    })
    .filter(Boolean);

  if (!parsed.length) return { x: 0, y: 0 };

  return {
    x: parsed.reduce((sum, point) => sum + point.x, 0) / parsed.length,
    y: parsed.reduce((sum, point) => sum + point.y, 0) / parsed.length,
  };
}

function getStaticBlockCenter(block) {
  if (Number.isFinite(Number(block.labelX)) && Number.isFinite(Number(block.labelY))) {
    return { x: Number(block.labelX), y: Number(block.labelY) };
  }

  if (block.shape === 'polygon') return polygonCenter(block.points);

  return {
    x: Number(block.x || 0) + Number(block.width || 0) / 2,
    y: Number(block.y || 0) + Number(block.height || 0) / 2,
  };
}

function getBlockOffsetPixels(block, floorWidth, floorHeight) {
  if (block.isDynamicDbBlock) return { x: 0, y: 0 };
  if (!usesOffsetMode(block)) return { x: 0, y: 0 };

  return {
    x: percentToPixelsX(block.coord_x, floorWidth),
    y: percentToPixelsY(block.coord_y, floorHeight),
  };
}

function getBlockCenter(block, floorWidth, floorHeight) {
  if (block.isDynamicDbBlock) {
    return {
      x: Number(block.x || 0) + Number(block.width || 0) / 2,
      y: Number(block.y || 0) + Number(block.height || 0) / 2,
    };
  }

  const base = getStaticBlockCenter(block);
  const offset = getBlockOffsetPixels(block, floorWidth, floorHeight);

  return {
    x: base.x + offset.x,
    y: base.y + offset.y,
  };
}

function getBlockCssClass(block, selected, connecting) {
  const type = normalizeEditorRoomType(block.type);
  const classes = ['mec-design-block'];

  if (selected) classes.push('mec-design-block--selected');
  if (connecting) classes.push('mec-design-block--connecting');

  if (type === 'lab') classes.push('mec-design-block--lab');
  if (type === 'lecture_hall') classes.push('mec-design-block--lecture');
  if (type === 'office') classes.push('mec-design-block--office');
  if (type === 'restroom') classes.push('mec-design-block--restroom');
  if (type === 'bathroom') classes.push('mec-design-block--bathroom');
  if (type === 'elevator') classes.push('mec-design-block--elevator');
  if (type === 'stairs' || type === 'emergency_stairs') classes.push('mec-design-block--stairs');

  return classes.join(' ');
}

export default function MapEditorPage() {
  const [searchParams] = useSearchParams();
  const initialFloorId = searchParams.get('floor');

  const [buildings, setBuildings] = useState([]);
  const [floors, setFloors] = useState([]);
  const [selectedBuilding, setSelectedBuilding] = useState('');
  const [selectedFloor, setSelectedFloor] = useState(initialFloorId || '');
  const [floorData, setFloorData] = useState(null);
  const [loading, setLoading] = useState(false);

  const [rooms, setRooms] = useState([]);
  const roomsRef = useRef([]);
  const [adjacency, setAdjacency] = useState([]);
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [hoveredRoomId, setHoveredRoomId] = useState(null);

  const [mode, setMode] = useState('select');
  const [newRoomForm, setNewRoomForm] = useState({
    room_number: '',
    name: '',
    type: 'classroom',
    department: '',
    capacity: '',
  });
  const [showAddModal, setShowAddModal] = useState(false);
  const [pendingCoords, setPendingCoords] = useState(null);
  const [connecting, setConnecting] = useState(null);

  const [editRoom, setEditRoom] = useState(null);
  const [delRoom, setDelRoom] = useState(null);
  const [delLoading, setDelLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Add-room wizard
  const [addWizardStep, setAddWizardStep] = useState(1);
  const [addWizardShape, setAddWizardShape] = useState('rect');
  const [addWizardVertexCount, setAddWizardVertexCount] = useState(4);

  const canvasRef = useRef(null);
  const didInitEditorRef = useRef(false);
  const panDrag = useRef({ active: false, sx: 0, sy: 0, tx: 0, ty: 0 });
  const vertexDrag = useRef({ active: false, dbId: null, isPolygon: false, vertexIndex: -1, startX: 0, startY: 0, origPoints: null, origX: 0, origY: 0, origWidth: 0, origHeight: 0 });
  const centerDrag = useRef({ active: false, dbId: null, isPolygon: false, startX: 0, startY: 0, origPoints: null, origX: 0, origY: 0 });
  const designDrag = useRef({
    active: false,
    dbId: null,
    blockId: null,
    isDynamicDbBlock: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
  });

  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });

  useEffect(() => {
    roomsRef.current = rooms;
  }, [rooms]);

  const activeFloorKey = floorData ? getEditorFloorKey(floorData) : '';
  const activeFloorMeta = FLOOR_MAPS?.[activeFloorKey] || null;

  const editorCanvasWidth =
    Number(activeFloorMeta?.width) || Number(floorData?.map_width) || 1200;

  const editorCanvasHeight =
    Number(activeFloorMeta?.height) || Number(floorData?.map_height) || 600;

  const loadFloors = async buildingId => {
    if (!buildingId) {
      setFloors([]);
      return [];
    }

    const { data } = await floorAPI.getAll({
      active_only: 'false',
      building_id: buildingId,
    });

    const rawFloors = data.data?.floors || [];
    const filteredFloors = rawFloors.filter(floor => !buildingId || floor.building_id === buildingId);
    const sortedFloors = sortFloors(filteredFloors);

    setFloors(sortedFloors);

    return sortedFloors;
  };

  const fitCanvas = useCallback(() => {
    if (!canvasRef.current) return;

    const { clientWidth: cw, clientHeight: ch } = canvasRef.current;

    const scale = Math.min(
      (cw - 40) / editorCanvasWidth,
      (ch - 40) / editorCanvasHeight
    );

    setTransform({
      x: 20,
      y: 20,
      scale: Math.max(0.05, scale),
    });
  }, [editorCanvasWidth, editorCanvasHeight]);

  const zoomAtViewportCenter = useCallback((factor) => {
    const el = canvasRef.current;
    if (!el) return;
    const { clientWidth: cw, clientHeight: ch } = el;
    const mx = cw / 2;
    const my = ch / 2;
    setTransform(t => {
      const nextScale = Math.max(0.05, Math.min(5, t.scale * factor));
      return {
        scale: nextScale,
        x: mx - (mx - t.x) * (nextScale / t.scale),
        y: my - (my - t.y) * (nextScale / t.scale),
      };
    });
  }, []);

  const loadFloor = useCallback(
    async floorId => {
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
          (data.data.rooms || []).map(room => ({
            ...room,
            coord_x: Number(room.coord_x) || 0,
            coord_y: Number(room.coord_y) || 0,
            coord_width: Number(room.coord_width) || 6,
            coord_height: Number(room.coord_height) || 4,
            features: parseFeatures(room.features),
          }))
        );

        setAdjacency(data.data.adjacency || []);
        setSelectedRoomId(null);
        setConnecting(null);
        setEditRoom(null);

        setTimeout(() => {
          fitCanvas();
        }, 80);
      } catch (err) {
        toast.error(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [fitCanvas]
  );

 useEffect(() => {
  if (didInitEditorRef.current) return;

  didInitEditorRef.current = true;

  async function initEditor() {
    try {
      const { data } = await floorAPI.getBuildings();

      const allBuildings = data.data?.buildings || [];

      const engBuildings = allBuildings.filter(
        building => building.code === MAIN_BUILDING_CODE
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
        loadedFloors.find(floor => floor.floor_label === 'G') ||
        loadedFloors[0];

      if (defaultFloor) {
        await loadFloor(defaultFloor.id);
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  initEditor();
}, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleBuildingChange(buildingId) {
    setSelectedBuilding(buildingId);
    setSelectedFloor('');
    setFloorData(null);
    setRooms([]);
    setAdjacency([]);
    setSelectedRoomId(null);
    setEditRoom(null);

    const loadedFloors = await loadFloors(buildingId);

    const defaultFloor =
      loadedFloors.find(floor => floor.floor_label === 'G') || loadedFloors[0];

    if (defaultFloor) {
      await loadFloor(defaultFloor.id);
    }
  }

  const editorBlocks = useMemo(() => {
    const dbRoomsByKey = new Map();
    const matchedRoomIds = new Set();

    rooms.forEach(room => {
      getDbRoomCandidateKeys(room).forEach(key => {
        dbRoomsByKey.set(key, room);
      });
    });

    const staticBlocks = (activeFloorMeta?.blocks || []).map(staticBlock => {
      const staticKey = normalizeRoomSearch(staticBlock.roomNumber || staticBlock.id);
      const dbRoom = dbRoomsByKey.get(staticKey);

      if (dbRoom?.id) {
        matchedRoomIds.add(dbRoom.id);
      }

      return {
        ...staticBlock,

        id: dbRoom?.id || `static_${staticBlock.id}`,
        dbId: dbRoom?.id || null,
        isStaticOnly: !dbRoom,
        isDynamicDbBlock: false,

        room_number: dbRoom?.room_number || staticBlock.roomNumber || staticBlock.id,
        roomNumber: dbRoom?.room_number || staticBlock.roomNumber || staticBlock.id,
        name: dbRoom?.name || staticBlock.name || '',
        type: dbRoom?.type || staticBlock.type || 'other',
        department: dbRoom?.department || staticBlock.department || '',
        capacity: dbRoom?.capacity ?? staticBlock.capacity ?? '',
        is_accessible: dbRoom?.is_accessible === true || staticBlock.accessible === true,

        coord_x: Number(dbRoom?.coord_x) || 0,
        coord_y: Number(dbRoom?.coord_y) || 0,
        coord_width: Number(dbRoom?.coord_width) || 0,
        coord_height: Number(dbRoom?.coord_height) || 0,
        features: parseFeatures(dbRoom?.features),
      };
    });

    const dynamicDbBlocks = rooms
      .filter(room => !matchedRoomIds.has(room.id))
      .map(room => {
        const commonProps = {
          id: room.id,
          dbId: room.id,
          isStaticOnly: false,
          isDynamicDbBlock: true,
          room_number: room.room_number,
          roomNumber: room.room_number,
          name: room.name || '',
          type: room.type || 'other',
          department: room.department || '',
          capacity: room.capacity ?? '',
          is_accessible: room.is_accessible === true,
          coord_x: Number(room.coord_x) || 0,
          coord_y: Number(room.coord_y) || 0,
          coord_width: Number(room.coord_width) || 6,
          coord_height: Number(room.coord_height) || 4,
          features: parseFeatures(room.features),
        };

        const polyPts = Array.isArray(room.polygon_points) && room.polygon_points.length >= 3
          ? room.polygon_points
          : null;

        if (polyPts) {
          const pixelPoints = polyPts.map(pt => ({
            x: percentToPixelsX(pt.x, editorCanvasWidth),
            y: percentToPixelsY(pt.y, editorCanvasHeight),
          }));
          const svgPoints = pixelPoints.map(pt => `${pt.x},${pt.y}`).join(' ');
          const center = polygonCenter(svgPoints);
          return {
            ...commonProps,
            shape: 'polygon',
            points: svgPoints,
            pixelPoints,
            labelX: center.x,
            labelY: center.y,
          };
        }

        const x = percentToPixelsX(room.coord_x, editorCanvasWidth);
        const y = percentToPixelsY(room.coord_y, editorCanvasHeight);
        const width = percentToPixelsX(room.coord_width || 6, editorCanvasWidth);
        const height = percentToPixelsY(room.coord_height || 4, editorCanvasHeight);
        return {
          ...commonProps,
          shape: 'rect',
          x,
          y,
          width,
          height,
          labelX: x + width / 2,
          labelY: y + height / 2,
        };
      });

    return [...staticBlocks, ...dynamicDbBlocks];
  }, [rooms, activeFloorMeta, editorCanvasWidth, editorCanvasHeight]);

  const selectedRoom = editorBlocks.find(block => block.id === selectedRoomId);

  const screenToCanvas = useCallback(
    (sx, sy) => {
      const rect = canvasRef.current?.getBoundingClientRect();

      if (!rect) return { x: 0, y: 0 };

      const pixelX = (sx - rect.left - transform.x) / transform.scale;
      const pixelY = (sy - rect.top - transform.y) / transform.scale;

      return {
        x: clampNumber(pixelsToPercentX(pixelX, editorCanvasWidth), 0, 100),
        y: clampNumber(pixelsToPercentY(pixelY, editorCanvasHeight), 0, 100),
      };
    },
    [transform, editorCanvasWidth, editorCanvasHeight]
  );

  const handleCanvasClick = useCallback(
    e => {
      if (
        e.target !== canvasRef.current &&
        !e.target.classList.contains('mec-canvas-bg')
      ) {
        return;
      }
      setSelectedRoomId(null);
      setEditRoom(null);
    },
    []
  );

  const handleRoomClick = useCallback(
    (e, roomId) => {
      e.stopPropagation();

      if (mode === 'connect') {
        if (!connecting) {
          setConnecting(roomId);
          toast('Now click the second room to connect', { icon: '🔗' });
        } else if (connecting !== roomId) {
          const exists = adjacency.find(
            a =>
              (a.room_a_id === connecting && a.room_b_id === roomId) ||
              (a.room_a_id === roomId && a.room_b_id === connecting)
          );

          if (exists) {
            setAdjacency(prev => prev.filter(a => a !== exists));
            toast.success('Connection removed');
          } else {
            setAdjacency(prev => [
              ...prev,
              {
                room_a_id: connecting,
                room_b_id: roomId,
                weight: 1.0,
              },
            ]);
            toast.success('Connection added');
          }

          setConnecting(null);
        }
      } else {
        setSelectedRoomId(roomId);
        setEditRoom(null);
      }
    },
    [mode, connecting, adjacency]
  );

  function handleDesignBlockMouseDown(event, block) {
    // Middle mouse starts canvas pan — don't block drag, let it bubble up.
    if (event.button === 1) return;

    if (mode !== 'select') return;

    if (!block.dbId) {
      toast.error('This block is not linked to a database room yet.');
      return;
    }

    event.stopPropagation();

    designDrag.current = {
      active: true,
      dbId: block.dbId,
      blockId: block.id,
      isDynamicDbBlock: block.isDynamicDbBlock === true,
      startX: event.clientX,
      startY: event.clientY,
      origX: Number(block.coord_x || 0),
      origY: Number(block.coord_y || 0),
    };

    setSelectedRoomId(block.id);
  }

  function handleVertexHandleMouseDown(e, block, vertexIndex) {
    e.stopPropagation();
    if (parseFeatures(block.features).is_locked) return;
    const isPolygon = block.shape === 'polygon';
    const rawRoom = roomsRef.current.find(r => r.id === block.dbId);
    vertexDrag.current = {
      active: true,
      dbId: block.dbId,
      isPolygon,
      vertexIndex,
      startX: e.clientX,
      startY: e.clientY,
      origPoints: isPolygon ? (rawRoom?.polygon_points || []) : null,
      origX: block.coord_x,
      origY: block.coord_y,
      origWidth: block.coord_width,
      origHeight: block.coord_height,
    };
  }

  function handleCenterHandleMouseDown(e, block) {
    e.stopPropagation();
    if (parseFeatures(block.features).is_locked) return;
    const isPolygon = block.shape === 'polygon';
    const rawRoom = roomsRef.current.find(r => r.id === block.dbId);
    centerDrag.current = {
      active: true,
      dbId: block.dbId,
      isPolygon,
      startX: e.clientX,
      startY: e.clientY,
      origPoints: isPolygon ? (rawRoom?.polygon_points || []) : null,
      origX: block.coord_x,
      origY: block.coord_y,
    };
  }

  async function persistRoomPosition(room) {
    if (!room?.id) return;

    const features = room._geometryOffsetMode
      ? withOffsetMode(room.features)
      : parseFeatures(room.features);

    await roomAPI.update(room.id, {
      coord_x: Number(room.coord_x) || 0,
      coord_y: Number(room.coord_y) || 0,
      coord_width: Number(room.coord_width) || 6,
      coord_height: Number(room.coord_height) || 4,
      features,
    });
  }

  useEffect(() => {
    const onMove = e => {
      if (designDrag.current.active) {
        const dxPixels = (e.clientX - designDrag.current.startX) / transform.scale;
        const dyPixels = (e.clientY - designDrag.current.startY) / transform.scale;

        const dxPercent = pixelsToPercentX(dxPixels, editorCanvasWidth);
        const dyPercent = pixelsToPercentY(dyPixels, editorCanvasHeight);

        setRooms(prev =>
          prev.map(room => {
            if (room.id !== designDrag.current.dbId) return room;

            if (designDrag.current.isDynamicDbBlock) {
              return {
                ...room,
                coord_x: clampNumber(designDrag.current.origX + dxPercent, -100, 200),
                coord_y: clampNumber(designDrag.current.origY + dyPercent, -100, 200),
              };
            }

            return {
              ...room,
              coord_x: clampNumber(designDrag.current.origX + dxPercent, -100, 200),
              coord_y: clampNumber(designDrag.current.origY + dyPercent, -100, 200),
              features: withOffsetMode(room.features),
              _geometryOffsetMode: true,
            };
          })
        );

        return;
      }

      if (vertexDrag.current.active) {
        const dxPx = (e.clientX - vertexDrag.current.startX) / transform.scale;
        const dyPx = (e.clientY - vertexDrag.current.startY) / transform.scale;
        const dxPct = pixelsToPercentX(dxPx, editorCanvasWidth);
        const dyPct = pixelsToPercentY(dyPx, editorCanvasHeight);

        if (vertexDrag.current.isPolygon) {
          const orig = vertexDrag.current.origPoints;
          const vi = vertexDrag.current.vertexIndex;
          const next = orig.map((pt, i) => i === vi ? { x: pt.x + dxPct, y: pt.y + dyPct } : pt);
          setRooms(prev => prev.map(r => r.id === vertexDrag.current.dbId ? { ...r, polygon_points: next } : r));
        } else {
          const { origX, origY, origWidth, origHeight, vertexIndex: vi } = vertexDrag.current;
          let nx = origX, ny = origY, nw = origWidth, nh = origHeight;
          if (vi === 0) { nx = origX + dxPct; ny = origY + dyPct; nw = origWidth - dxPct; nh = origHeight - dyPct; }
          else if (vi === 1) { ny = origY + dyPct; nw = origWidth + dxPct; nh = origHeight - dyPct; }
          else if (vi === 2) { nw = origWidth + dxPct; nh = origHeight + dyPct; }
          else if (vi === 3) { nx = origX + dxPct; nw = origWidth - dxPct; nh = origHeight + dyPct; }
          setRooms(prev => prev.map(r => r.id === vertexDrag.current.dbId
            ? { ...r, coord_x: clampNumber(nx, 0, 100), coord_y: clampNumber(ny, 0, 100), coord_width: Math.max(1, nw), coord_height: Math.max(1, nh) }
            : r));
        }
        return;
      }

      if (centerDrag.current.active) {
        const dxPx = (e.clientX - centerDrag.current.startX) / transform.scale;
        const dyPx = (e.clientY - centerDrag.current.startY) / transform.scale;
        const dxPct = pixelsToPercentX(dxPx, editorCanvasWidth);
        const dyPct = pixelsToPercentY(dyPx, editorCanvasHeight);

        if (centerDrag.current.isPolygon) {
          const orig = centerDrag.current.origPoints;
          const next = orig.map(pt => ({ x: pt.x + dxPct, y: pt.y + dyPct }));
          setRooms(prev => prev.map(r => r.id === centerDrag.current.dbId ? { ...r, polygon_points: next } : r));
        } else {
          setRooms(prev => prev.map(r => r.id === centerDrag.current.dbId
            ? { ...r, coord_x: clampNumber(centerDrag.current.origX + dxPct, 0, 100), coord_y: clampNumber(centerDrag.current.origY + dyPct, 0, 100) }
            : r));
        }
        return;
      }

      if (panDrag.current.active) {
        setTransform(t => ({
          ...t,
          x: panDrag.current.tx + (e.clientX - panDrag.current.sx),
          y: panDrag.current.ty + (e.clientY - panDrag.current.sy),
        }));
      }
    };

    const onUp = async () => {
      if (vertexDrag.current.active) {
        const room = roomsRef.current.find(r => r.id === vertexDrag.current.dbId);
        if (room) {
          try {
            if (vertexDrag.current.isPolygon) {
              await roomAPI.update(room.id, { polygon_points: room.polygon_points });
            } else {
              await roomAPI.update(room.id, { coord_x: room.coord_x, coord_y: room.coord_y, coord_width: room.coord_width, coord_height: room.coord_height });
            }
          } catch { toast.error('Could not save shape.'); }
        }
        vertexDrag.current.active = false;
        return;
      }

      if (centerDrag.current.active) {
        const room = roomsRef.current.find(r => r.id === centerDrag.current.dbId);
        if (room) {
          try {
            if (centerDrag.current.isPolygon) {
              await roomAPI.update(room.id, { polygon_points: room.polygon_points });
            } else {
              await roomAPI.update(room.id, { coord_x: room.coord_x, coord_y: room.coord_y });
            }
          } catch { toast.error('Could not save position.'); }
        }
        centerDrag.current.active = false;
        return;
      }

      if (designDrag.current.active) {
        const room = roomsRef.current.find(r => r.id === designDrag.current.dbId);

        if (room) {
          try {
            await persistRoomPosition(room);
          } catch {
            toast.error('Could not save block position.');
          }
        }
      }

      designDrag.current.active = false;
      panDrag.current.active = false;
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [transform.scale, editorCanvasWidth, editorCanvasHeight]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCanvasMouseDown = e => {
    const isMiddle = e.button === 1;

    if (isMiddle) {
      // Prevent the browser autoscroll cursor.
      e.preventDefault();
    } else {
      if (
        e.target !== canvasRef.current &&
        !e.target.classList.contains('mec-canvas-bg')
      ) {
        return;
      }
    }

    panDrag.current = {
      active: true,
      sx: e.clientX,
      sy: e.clientY,
      tx: transform.x,
      ty: transform.y,
    };
  };

  const handleWheel = useCallback(e => {
    e.preventDefault();

    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 0.9;

    setTransform(t => {
      const nextScale = Math.max(0.05, Math.min(5, t.scale * factor));

      return {
        scale: nextScale,
        x: mx - (mx - t.x) * (nextScale / t.scale),
        y: my - (my - t.y) * (nextScale / t.scale),
      };
    });
  }, []);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return undefined;

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  useEffect(() => {
    const onKeyDown = e => {
      if (e.key === 'Escape') fitCanvas();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fitCanvas]);

  const handleAddRoom = async () => {
    if (!newRoomForm.room_number || !newRoomForm.name || !newRoomForm.type) {
      toast.error('Room number, name and type are required');
      return;
    }

    const isPolygon = addWizardShape === 'polygon';
    const polygonPoints = isPolygon
      ? generateDefaultPolygonPoints(50, 50, addWizardVertexCount, 8)
      : null;

    try {
      const { data } = await roomAPI.create({
        floor_id: selectedFloor,
        room_number: newRoomForm.room_number.trim(),
        name: newRoomForm.name.trim(),
        type: newRoomForm.type,
        department: newRoomForm.department || null,
        capacity: newRoomForm.capacity ? parseInt(newRoomForm.capacity, 10) : null,
        coord_x: isPolygon ? null : 45,
        coord_y: isPolygon ? null : 45,
        coord_width: isPolygon ? null : 10,
        coord_height: isPolygon ? null : 8,
        polygon_points: polygonPoints,
        features: {},
      });

      const saved = data.data.room;
      setRooms(prev => [
        ...prev,
        {
          ...saved,
          coord_x: Number(saved.coord_x) || 45,
          coord_y: Number(saved.coord_y) || 45,
          coord_width: Number(saved.coord_width) || 10,
          coord_height: Number(saved.coord_height) || 8,
          polygon_points: saved.polygon_points || polygonPoints,
          features: parseFeatures(saved.features),
        },
      ]);

      setShowAddModal(false);
      setAddWizardStep(1);
      setAddWizardShape('rect');
      setNewRoomForm({ room_number: '', name: '', type: 'classroom', department: '', capacity: '' });

      toast.success(`Room ${saved.room_number} added`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleSaveLayout = async () => {
    setSaving(true);

    try {
      await mapEditorAPI.saveLayout(selectedFloor, {
        rooms: rooms.map(room => ({
          ...room,
          polygon_points: room.polygon_points || null,
        })),
        adjacency,
      });

      toast.success('Layout and connections saved.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRoom = async () => {
    if (!delRoom?.dbId && !delRoom?.id) return;

    const roomId = delRoom.dbId || delRoom.id;
    setDelLoading(true);

    try {
      await roomAPI.delete(roomId);

      setRooms(prev => prev.filter(r => r.id !== roomId));
      setAdjacency(prev => prev.filter(a => a.room_a_id !== roomId && a.room_b_id !== roomId));

      if (selectedRoomId === roomId) setSelectedRoomId(null);

      setDelRoom(null);
      setEditRoom(null);

      toast.success('Room deleted');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setDelLoading(false);
    }
  };

  const handleUpdateRoom = async () => {
    const sourceRoom = editRoom || selectedRoom;
    if (!sourceRoom || sourceRoom.isStaticOnly) return;

    try {
      await roomAPI.update(sourceRoom.dbId || sourceRoom.id, {
        room_number: String(sourceRoom.room_number || '').trim(),
        name: sourceRoom.name,
        type: sourceRoom.type,
        department: sourceRoom.department || null,
        capacity: sourceRoom.capacity ? parseInt(sourceRoom.capacity, 10) : null,
      });

      setRooms(prev =>
        prev.map(room =>
          room.id === (sourceRoom.dbId || sourceRoom.id)
            ? {
                ...room,
                room_number: String(sourceRoom.room_number || '').trim(),
                name: sourceRoom.name,
                type: sourceRoom.type,
                department: sourceRoom.department || null,
                capacity: sourceRoom.capacity ? parseInt(sourceRoom.capacity, 10) : null,
              }
            : room
        )
      );

      setSelectedRoomId(sourceRoom.dbId || sourceRoom.id);
      setEditRoom(null);

      toast.success('Room updated');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const selectedRoomConnections = selectedRoom?.dbId
    ? adjacency.filter(edge => edge.room_a_id === selectedRoom.dbId || edge.room_b_id === selectedRoom.dbId)
    : [];

  return (
    <div className="mec">
      <div className="mec-toolbar">
        <div className="mec-toolbar__left">
          <select className="form-input mec-select" value={selectedBuilding} onChange={e => handleBuildingChange(e.target.value)}>
            <option value="">Select building…</option>
            {buildings.map(building => (
              <option key={building.id} value={building.id}>
                Block {building.code} — {building.name}
              </option>
            ))}
          </select>

          <select className="form-input mec-select" value={selectedFloor} onChange={async e => {
  const floorId = e.target.value;

  setSelectedFloor(floorId);
  setSelectedRoomId(null);
  setEditRoom(null);
  setConnecting(null);

  await loadFloor(floorId);

  window.history.replaceState(
    null,
    '',
    `/admin/map-editor?floor=${floorId}`
  );
}}disabled={!selectedBuilding}>
            <option value="">Select floor…</option>
            {floors.map(floor => (
              <option key={floor.id} value={floor.id}>
                {floor.floor_label} — {floor.name}
              </option>
            ))}
          </select>
        </div>

        <div className="mec-toolbar__modes">
          <button
            className="btn btn--sm btn--primary"
            onClick={() => {
              setAddWizardStep(1);
              setAddWizardShape('rect');
              setAddWizardVertexCount(4);
              setShowAddModal(true);
            }}
            disabled={!selectedFloor}
            title="Add a new room to this floor"
          >
            ＋ Add Room
          </button>
        </div>

        <div className="mec-toolbar__right">
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {rooms.length} rooms · {adjacency.length} connections
          </span>

          <button className="btn btn--secondary btn--sm" onClick={() => zoomAtViewportCenter(1.2)}>+</button>
          <button className="btn btn--secondary btn--sm" onClick={() => zoomAtViewportCenter(1 / 1.2)}>−</button>
          <button className="btn btn--secondary btn--sm" onClick={fitCanvas}>⊙ Fit</button>

          <Button variant="primary" size="sm" loading={saving} onClick={handleSaveLayout} disabled={!selectedFloor}>
            💾 Save Layout
          </Button>
        </div>
      </div>

      <div className="mec-main">
        <div
          className="mec-canvas"
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
              style={{
                width: editorCanvasWidth,
                height: editorCanvasHeight,
                transform: `translate(${transform.x}px,${transform.y}px) scale(${transform.scale})`,
                transformOrigin: 'top left',
              }}
            >
              {activeFloorMeta?.image || floorData.map_image_url ? (
                <img
                  src={activeFloorMeta?.image || floorData.map_image_url}
                  alt="floor map"
                  className="mec-map-img mec-canvas-bg"
                  draggable={false}
                  style={{ width: editorCanvasWidth, height: editorCanvasHeight }}
                />
              ) : (
                <div className="mec-map-grid mec-canvas-bg" style={{ width: editorCanvasWidth, height: editorCanvasHeight }}>
                  <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', color: 'var(--text-faint)', fontSize: 13, pointerEvents: 'none' }}>
                    No map image uploaded — rooms are shown as placeholders
                  </span>
                </div>
              )}

              <svg className="mec-adjacency-svg" viewBox={`0 0 ${editorCanvasWidth} ${editorCanvasHeight}`} style={{ pointerEvents: 'none' }}>
                {adjacency.map((edge, index) => {
                  const a = editorBlocks.find(block => block.dbId === edge.room_a_id);
                  const b = editorBlocks.find(block => block.dbId === edge.room_b_id);
                  if (!a || !b) return null;

                  const ac = getBlockCenter(a, editorCanvasWidth, editorCanvasHeight);
                  const bc = getBlockCenter(b, editorCanvasWidth, editorCanvasHeight);

                  return (
                    <line
                      key={index}
                      x1={ac.x}
                      y1={ac.y}
                      x2={bc.x}
                      y2={bc.y}
                      stroke="#f59e0b"
                      strokeWidth={2}
                      strokeDasharray="6,4"
                      opacity={0.8}
                    />
                  );
                })}
              </svg>

              <svg className="mec-design-overlay" viewBox={`0 0 ${editorCanvasWidth} ${editorCanvasHeight}`} preserveAspectRatio="none">
                {editorBlocks.map(block => {
                  const selected = selectedRoomId === block.id;
                  const hovered = hoveredRoomId === block.id;
                  const connectingBlock = connecting === block.dbId;
                  const offset = getBlockOffsetPixels(block, editorCanvasWidth, editorCanvasHeight);

                  const handleBlockClick = event => {
                    event.stopPropagation();
                    setSelectedRoomId(block.id);
                    setEditRoom(null);
                  };

                  const isLocked = parseFeatures(block.features).is_locked;

                  return (
                    <g
                      key={block.id}
                      transform={`translate(${offset.x}, ${offset.y})`}
                      onMouseDown={event => handleDesignBlockMouseDown(event, block)}
                    >
                      {block.shape === 'polygon' ? (
                        <polygon
                          points={block.points}
                          className={getBlockCssClass(block, selected, connectingBlock)}
                          onClick={handleBlockClick}
                          onMouseEnter={() => setHoveredRoomId(block.id)}
                          onMouseLeave={() => setHoveredRoomId(null)}
                        />
                      ) : (
                        <rect
                          x={block.x}
                          y={block.y}
                          width={block.width}
                          height={block.height}
                          className={getBlockCssClass(block, selected, connectingBlock)}
                          onClick={handleBlockClick}
                          onMouseEnter={() => setHoveredRoomId(block.id)}
                          onMouseLeave={() => setHoveredRoomId(null)}
                        />
                      )}

                      {(selected || hovered) && (
                        <foreignObject
                          x={(block.labelX || block.x || 0) - 70}
                          y={(block.labelY || block.y || 0) - 34}
                          width="170"
                          height="54"
                          className="mec-design-label-wrap"
                        >
                          <div className="mec-design-label">
                            <strong>{block.roomNumber}</strong>
                            <span>{block.name}</span>
                          </div>
                        </foreignObject>
                      )}

                      {selected && block.isDynamicDbBlock && !isLocked && (
                        <>
                          {/* Center move handle */}
                          <circle
                            cx={block.labelX}
                            cy={block.labelY}
                            r={9}
                            className="mec-center-handle"
                            onMouseDown={e => handleCenterHandleMouseDown(e, block)}
                            onClick={e => e.stopPropagation()}
                          />

                          {/* Polygon vertex handles */}
                          {block.shape === 'polygon' && block.pixelPoints?.map((pt, vi) => (
                            <circle
                              key={vi}
                              cx={pt.x}
                              cy={pt.y}
                              r={6}
                              className="mec-vertex-handle"
                              onMouseDown={e => handleVertexHandleMouseDown(e, block, vi)}
                              onClick={e => e.stopPropagation()}
                            />
                          ))}

                          {/* Rect corner handles */}
                          {block.shape === 'rect' && [
                            [block.x, block.y],
                            [block.x + block.width, block.y],
                            [block.x + block.width, block.y + block.height],
                            [block.x, block.y + block.height],
                          ].map(([cx, cy], vi) => (
                            <circle
                              key={vi}
                              cx={cx}
                              cy={cy}
                              r={6}
                              className="mec-vertex-handle"
                              onMouseDown={e => handleVertexHandleMouseDown(e, block, vi)}
                              onClick={e => e.stopPropagation()}
                            />
                          ))}
                        </>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          )}
        </div>

        <div className="mec-sidebar">
          {selectedRoom ? (
            <div className="mec-sidebar__content">
              <div className="mec-sidebar__header">
                <span className="mec-sidebar__title">Room {selectedRoom.room_number}</span>
                <button
                  className="btn btn--ghost btn--sm btn--icon"
                  onClick={() => {
                    setSelectedRoomId(null);
                    setEditRoom(null);
                  }}
                >
                  ✕
                </button>
              </div>

              <div className="mec-sidebar__body">
                {selectedRoom.isStaticOnly && (
                  <div style={{ padding: 10, borderRadius: 8, background: '#fff7ed', color: '#9a3412', fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
                    This block is from the design file only. Create/link a matching database room number to edit and move it.
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Room Number</label>
                  <input
                    className="form-input"
                    value={editRoom?.id === selectedRoom.id ? editRoom.room_number : selectedRoom.room_number || ''}
                    disabled={selectedRoom.isStaticOnly}
                    onChange={e =>
                      setEditRoom(current =>
                        current
                          ? { ...current, room_number: e.target.value }
                          : { ...selectedRoom, id: selectedRoom.dbId || selectedRoom.id, room_number: e.target.value }
                      )
                    }
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Name</label>
                  <input
                    className="form-input"
                    value={editRoom?.id === selectedRoom.id ? editRoom.name : selectedRoom.name || ''}
                    disabled={selectedRoom.isStaticOnly}
                    onChange={e =>
                      setEditRoom(current =>
                        current
                          ? { ...current, name: e.target.value }
                          : { ...selectedRoom, id: selectedRoom.dbId || selectedRoom.id, name: e.target.value }
                      )
                    }
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Type</label>
                  <select
                    className="form-input"
                    value={editRoom?.id === selectedRoom.id ? editRoom.type : selectedRoom.type || 'other'}
                    disabled={selectedRoom.isStaticOnly}
                    onChange={e =>
                      setEditRoom(current =>
                        current
                          ? { ...current, type: e.target.value }
                          : { ...selectedRoom, id: selectedRoom.dbId || selectedRoom.id, type: e.target.value }
                      )
                    }
                  >
                    {ROOM_TYPES.map(type => (
                      <option key={type} value={type}>{roomTypeLabel(type)}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Department</label>
                  <input
                    className="form-input"
                    value={editRoom?.id === selectedRoom.id ? editRoom.department || '' : selectedRoom.department || ''}
                    disabled={selectedRoom.isStaticOnly}
                    onChange={e =>
                      setEditRoom(current =>
                        current
                          ? { ...current, department: e.target.value }
                          : { ...selectedRoom, id: selectedRoom.dbId || selectedRoom.id, department: e.target.value }
                      )
                    }
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Capacity</label>
                  <input
                    type="number"
                    className="form-input"
                    value={editRoom?.id === selectedRoom.id ? editRoom.capacity || '' : selectedRoom.capacity || ''}
                    disabled={selectedRoom.isStaticOnly}
                    onChange={e =>
                      setEditRoom(current =>
                        current
                          ? { ...current, capacity: e.target.value }
                          : { ...selectedRoom, id: selectedRoom.dbId || selectedRoom.id, capacity: e.target.value }
                      )
                    }
                  />
                </div>

                {/* Lock position toggle */}
                {!selectedRoom.isStaticOnly && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--border)', marginTop: 4 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>Lock Position</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {parseFeatures(selectedRoom.features).is_locked ? 'Shape is locked' : 'Drag handles to reshape'}
                      </div>
                    </div>
                    <button
                      className={`mec-lock-btn${parseFeatures(selectedRoom.features).is_locked ? ' mec-lock-btn--locked' : ''}`}
                      onClick={async () => {
                        const roomId = selectedRoom.dbId || selectedRoom.id;
                        const cur = parseFeatures(selectedRoom.features);
                        const next = { ...cur, is_locked: !cur.is_locked };
                        try {
                          await roomAPI.update(roomId, { features: next });
                          setRooms(prev => prev.map(r => r.id === roomId ? { ...r, features: next } : r));
                        } catch { toast.error('Could not update lock state'); }
                      }}
                    >
                      {parseFeatures(selectedRoom.features).is_locked ? '🔒 Locked' : '🔓 Unlocked'}
                    </button>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                  <Button variant="primary" size="sm" full onClick={handleUpdateRoom} disabled={selectedRoom.isStaticOnly}>
                    Save Room Info
                  </Button>

                  <Button variant="danger" size="sm" full onClick={() => setDelRoom(selectedRoom)} disabled={selectedRoom.isStaticOnly}>
                    Delete Room
                  </Button>
                </div>

                <div style={{ marginTop: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                      Pathfinding Connections
                    </div>
                    {selectedRoom.dbId && (
                      <button
                        className="btn btn--ghost btn--sm"
                        style={{ fontSize: 11, padding: '2px 6px' }}
                        onClick={() => { setMode('connect'); setConnecting(selectedRoom.dbId); toast('Click another room to connect', { icon: '🔗' }); }}
                      >
                        + Connect
                      </button>
                    )}
                  </div>

                  {selectedRoomConnections.map((edge, index) => {
                    const otherId = edge.room_a_id === selectedRoom.dbId ? edge.room_b_id : edge.room_a_id;
                    const other = rooms.find(room => room.id === otherId);

                    return (
                      <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 8px', background: 'var(--bg)', borderRadius: 4, marginBottom: 4, fontSize: 12 }}>
                        <span>Room {other?.room_number || '?'}</span>
                        <button
                          className="btn btn--ghost btn--sm"
                          style={{ padding: '2px 6px', color: 'var(--red)', fontSize: 11 }}
                          onClick={() => setAdjacency(prev => prev.filter((_, idx) => idx !== adjacency.indexOf(edge)))}
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}

                  {selectedRoomConnections.length === 0 && (
                    <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>No pathfinding connections yet.</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="mec-sidebar__empty">
              <div style={{ fontSize: 32, marginBottom: 12 }}>🏢</div>
              <p style={{ fontWeight: 600, marginBottom: 6 }}>No room selected</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Click a room to edit its details. Drag a linked block to move it.
              </p>

              {floorData && (
                <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-muted)', textAlign: 'left', width: '100%' }}>
                  <strong style={{ color: 'var(--text)', display: 'block', marginBottom: 8 }}>{floorData.name}</strong>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', padding: '5px 0' }}>
                    <span>Total rooms</span><strong>{rooms.length}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', padding: '5px 0' }}>
                    <span>Connections</span><strong>{adjacency.length}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}>
                    <span>Map image</span>
                    <strong style={{ color: activeFloorMeta?.image || floorData.map_image_url ? 'var(--green)' : 'var(--red)' }}>
                      {activeFloorMeta?.image || floorData.map_image_url ? '✓ Uploaded' : '✗ Missing'}
                    </strong>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Modal
        open={showAddModal}
        onClose={() => { setShowAddModal(false); setAddWizardStep(1); }}
        title={addWizardStep === 1 ? 'Add Room — Step 1: Shape' : 'Add Room — Step 2: Details'}
        size="sm"
        footer={
          addWizardStep === 1 ? (
            <>
              <Button variant="secondary" onClick={() => setShowAddModal(false)}>Cancel</Button>
              <Button variant="primary" onClick={() => setAddWizardStep(2)}>Next →</Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setAddWizardStep(1)}>← Back</Button>
              <Button variant="primary" onClick={handleAddRoom}>Create Room</Button>
            </>
          )
        }
      >
        {addWizardStep === 1 && (
          <div className="mec-wizard-step">
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              Choose the shape of the clickable room area on the map.
            </p>

            <div className="mec-wizard-shapes">
              <button
                className={`mec-wizard-shape-btn${addWizardShape === 'rect' ? ' mec-wizard-shape-btn--active' : ''}`}
                onClick={() => setAddWizardShape('rect')}
              >
                <svg width="52" height="40" viewBox="0 0 52 40">
                  <rect x="4" y="6" width="44" height="28" rx="3" fill="none" stroke="currentColor" strokeWidth="3" />
                </svg>
                <span>Rectangle</span>
              </button>

              <button
                className={`mec-wizard-shape-btn${addWizardShape === 'polygon' ? ' mec-wizard-shape-btn--active' : ''}`}
                onClick={() => setAddWizardShape('polygon')}
              >
                <svg width="52" height="40" viewBox="0 0 52 40">
                  <polygon points="26,3 49,15 41,37 11,37 3,15" fill="none" stroke="currentColor" strokeWidth="3" />
                </svg>
                <span>Polygon</span>
              </button>
            </div>

            {addWizardShape === 'polygon' && (
              <div style={{ marginTop: 20 }}>
                <label className="form-label">Number of vertices (corners)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
                  <input
                    type="range"
                    min="3"
                    max="12"
                    value={addWizardVertexCount}
                    onChange={e => setAddWizardVertexCount(Number(e.target.value))}
                    style={{ flex: 1 }}
                  />
                  <span className="mec-wizard-vertex-count">{addWizardVertexCount}</span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                  {addWizardVertexCount === 3 ? 'Triangle' : addWizardVertexCount === 4 ? 'Quadrilateral' : addWizardVertexCount === 5 ? 'Pentagon' : addWizardVertexCount === 6 ? 'Hexagon' : `${addWizardVertexCount}-sided polygon`}
                  {' — '}vertices appear on map as drag handles
                </p>
              </div>
            )}
          </div>
        )}

        {addWizardStep === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Input label="Room Number *" required value={newRoomForm.room_number} onChange={e => setNewRoomForm(f => ({ ...f, room_number: e.target.value }))} placeholder="e.g. 2590" />
            <Input label="Room Name *" required value={newRoomForm.name} onChange={e => setNewRoomForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Computer Lab" />
            <Select label="Type *" value={newRoomForm.type} onChange={e => setNewRoomForm(f => ({ ...f, type: e.target.value }))} options={ROOM_TYPES.map(t => ({ value: t, label: roomTypeLabel(t) }))} />
            <div className="form-row">
              <Input label="Department" value={newRoomForm.department} onChange={e => setNewRoomForm(f => ({ ...f, department: e.target.value }))} placeholder="Optional" />
              <Input label="Capacity" type="number" value={newRoomForm.capacity} onChange={e => setNewRoomForm(f => ({ ...f, capacity: e.target.value }))} placeholder="Optional" />
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!delRoom}
        onClose={() => setDelRoom(null)}
        onConfirm={handleDeleteRoom}
        loading={delLoading}
        danger
        title="Delete Room"
        message={`Delete room "${delRoom?.room_number} — ${delRoom?.name}"? This cannot be undone.`}
      />
    </div>
  );
}

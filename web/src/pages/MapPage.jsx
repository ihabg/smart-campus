import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { roomAPI, floorAPI } from '../api/index';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import SmartFinderPanel from '../components/map/SmartFinderPanel';
import '../components/map/SmartFinderPanel.css';
import './MapPage.css';
import { FLOOR_MAPS, FLOOR_ORDER } from '../data/floorMapGeometry';

const REQUEST_OPTIONS = [
  { value: 'all', label: 'Everything' },
  { value: 'lab', label: 'Labs' },
  { value: 'lecture_hall', label: 'Lecture Halls' },
  { value: 'engineering_drawing_studio', label: 'Drawing Studios' },
  { value: 'bookstore', label: 'Bookstore / Printing' },
  { value: 'office', label: 'Doctor Offices' },
  { value: 'meeting_room', label: 'Meeting Rooms' },
  { value: 'professor_lounge', label: 'Professor Lounge' },
  { value: 'storage', label: 'Storage' },
  { value: 'stairs', label: 'Stairs' },
  { value: 'restroom', label: 'Restrooms' },
  { value: 'amphitheater', label: 'Amphitheater' },
  { value: 'entrance', label: 'Entrances' },
  { value: 'bathroom', label: 'Accessible Restrooms' },
  { value: 'elevator', label: 'Elevators' },
  { value: 'emergency_stairs', label: 'Emergency Stairs' },
  { value: 'accessible', label: 'Accessible Places' },
];
const QUICK_REQUEST_VALUES = [
  'all',
  'lecture_hall',
  'lab',
  'office',
  'restroom',
  'stairs',
  'elevator',
  'accessible',
];

const REQUEST_ICON_MAP = {
  all: '✨',
  lab: '🧪',
  lecture_hall: '🎓',
  engineering_drawing_studio: '✏️',
  bookstore: '📚',
  office: '👨‍🏫',
  meeting_room: '🤝',
  professor_lounge: '☕',
  storage: '📦',
  stairs: '🪜',
  restroom: '🚻',
  amphitheater: '🏛️',
  entrance: '🚪',
  bathroom: '♿',
  elevator: '🛗',
  emergency_stairs: '🚨',
  accessible: '♿',
};

function getRequestIcon(value) {
  return REQUEST_ICON_MAP[value] || '📍';
}


function unwrapApi(response) {
  return response?.data?.data || response?.data || response || {};
}

function normalizeFloorKeyFromDb(floor) {
  const label = String(floor?.floor_label || '').trim().toUpperCase();

  if (label === 'B2') return 'B2';
  if (label === 'B1') return 'B1';
  if (label === 'G') return 'G';

  const floorNumber = Number(floor?.floor_number);

  if (floorNumber === -2) return 'B2';
  if (floorNumber === -1) return 'B1';
  if (floorNumber === 0) return 'G';

  return String(floorNumber || label);
}

function normalizeMapType(type) {
  const value = String(type || 'other')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');

  if (value === 'emergency_exit') return 'emergency_stairs';

  return value;
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function mergeDbRoomWithStaticGeometry(room, floorMeta, staticBlock) {
  const type = normalizeMapType(room.type);

  const sharedFields = {
    dbId: room.id,
    fromDatabase: true,
    id: staticBlock?.id || room.room_number || String(room.id),
    roomNumber: room.room_number || staticBlock?.roomNumber || '',
    room_number: room.room_number,
    name: room.name || staticBlock?.name || '',
    type,
    department: room.department || staticBlock?.department || '—',
    capacity: room.capacity ?? staticBlock?.capacity ?? '—',
    description: room.description || staticBlock?.description || '',
    status: room.is_active === false ? 'Inactive' : 'Available',
    accessible: room.is_accessible === true || staticBlock?.accessible === true,
    is_active: room.is_active !== false,
    lecturerNumber: room.lecturer_number || room.lecturerNumber || staticBlock?.lecturerNumber || '—',
    lecturerName: room.lecturerName || room.lecturer_name || room.name || staticBlock?.lecturerName || '—',
    lecturerEmail: room.lecturerEmail || room.lecturer_email || room.email || staticBlock?.lecturerEmail || '—',
    currentCourse: room.currentCourse || staticBlock?.currentCourse || '—',
    lectureTime: room.lectureTime || staticBlock?.lectureTime || '—',
    coord_x: Number(room.coord_x) || 0,
    coord_y: Number(room.coord_y) || 0,
    features: parseRoomFeatures(room.features),
  };

  // Use polygon_points from DB if available (admin-drawn shapes, migrated rooms)
  const polyPts = Array.isArray(room.polygon_points) && room.polygon_points.length >= 3
    ? room.polygon_points
    : null;

  if (polyPts) {
    const pixelPoints = polyPts.map(pt => ({
      x: (Number(pt.x) / 100) * floorMeta.width,
      y: (Number(pt.y) / 100) * floorMeta.height,
    }));
    const points = pixelPoints.map(pt => `${pt.x},${pt.y}`).join(' ');
    const labelX = pixelPoints.reduce((s, p) => s + p.x, 0) / pixelPoints.length;
    const labelY = pixelPoints.reduce((s, p) => s + p.y, 0) / pixelPoints.length;
    return {
      ...(staticBlock || {}),
      ...sharedFields,
      shape: 'polygon',
      points,
      labelX,
      labelY,
    };
  }

  // Fallback: use static block pixel geometry (pre-migration rooms)
  if (!staticBlock?.shape) {
    return null;
  }

  return {
    ...staticBlock,
    ...sharedFields,
  };
}

const BASIC_FACILITY_TYPES = new Set([
  'restroom',
  'bathroom',
  'accessible_restroom',
  'disabled_restroom',
  'stairs',
  'emergency_stairs',
  'emergency_exit',
  'elevator',
  'bookstore',
  'professor_lounge',
  'storage',
]);

const CLASS_SCHEDULE_TYPES = new Set([
  'classroom',
  'lecture_hall',
  'lab',
  'amphitheater',
  'engineering_drawing_room',
  'engineering_drawing_studio',
]);

function getBlockText(block) {
  return [
    block?.type,
    block?.id,
    block?.roomNumber,
    block?.room_number,
    block?.name,
    block?.department,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function isSteelCenter(block) {
  const text = getBlockText(block);

  return (
    text.includes('steel-center') ||
    text.includes('steel center') ||
    text.includes('steel_center') ||
    text.includes('steel') ||
    text.includes('مركز الحديد') ||
    text.includes('مشغل الحديد')
  );
}
function isBasicFacility(block) {
  const type = String(block?.type || '').toLowerCase();

  const text = [
    block?.type,
    block?.id,
    block?.roomNumber,
    block?.room_number,
    block?.name,
    block?.department,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return (
    [
      'restroom',
      'bathroom',
      'accessible_restroom',
      'disabled_restroom',
      'stairs',
      'emergency_stairs',
      'emergency_exit',
      'elevator',
      'bookstore',
      'professor_lounge',
      'storage',
    ].includes(type) ||

    text.includes('restroom') ||
    text.includes('bathroom') ||
    text.includes('stairs') ||
    text.includes('stair') ||
    text.includes('exit') ||
    text.includes('elevator') ||
    text.includes('bookstore') ||
    text.includes('lounge') ||
    text.includes('storage') ||
    text.includes('steel-center') ||
    text.includes('steel center') ||
    text.includes('steel_center') ||

    text.includes('دورة مياه') ||
    text.includes('درج') ||
    text.includes('مصعد') ||
    text.includes('مكتبة') ||
    text.includes('استراحة') ||
    text.includes('مخزن') ||
    text.includes('تخزين')
  );
}

function isOffice(block) {
  const type = String(block?.type || '').toLowerCase();
  const text = getBlockText(block);

  return (
    type === 'office' ||
    text.includes('office') ||
    text.includes('مكتب')
  );
}

function isMeetingRoom(block) {
  const type = String(block?.type || '').toLowerCase();
  const text = getBlockText(block);

  return (
    type === 'meeting_room' ||
    text.includes('meeting') ||
    text.includes('اجتماع') ||
    text.includes('قاعة اجتماعات')
  );
}

const ACADEMIC_SPACE_TYPES = new Set([
  'classroom',
  'lecture_hall',
  'lab',
  'amphitheater',
  'ampitheater',
  'engineering_drawing_room',
  'engineering_drawing_studio',
]);

function isAcademicSpace(block) {
  const type = String(block?.type || '').toLowerCase();
  const text = getBlockText(block);

  return (
    ACADEMIC_SPACE_TYPES.has(type) ||
    text.includes('amphitheater') ||
    text.includes('ampitheater') ||
    text.includes('مدرج') ||
    text.includes('مختبر') ||
    text.includes('lecture') ||
    text.includes('classroom')
  );
}

function shouldShowAvailabilityBox(block) {
  if (!block) return false;

  if (isAcademicSpace(block)) {
    return true;
  }

  return !isBasicFacility(block) && !isOffice(block) && !isMeetingRoom(block);
}

function shouldShowNoClassBox(block) {
  if (!block) return false;

  return isAcademicSpace(block);
}

function getRoomInfoItems(block, floorTitle) {
  const basicItems = [
    {
      label: 'Type',
      value: getTypeLabel(block?.type),
    },
    {
      label: 'Floor',
      value: floorTitle || '—',
    },
  ];
  if (isBasicFacility(block) && !isAcademicSpace(block)) {
    return basicItems;
  }

  if (isMeetingRoom(block)) {
    return [
      {
        label: 'Type',
        value: getTypeLabel(block?.type),
      },
      {
        label: 'Department',
        value: block?.department || 'كلية الهندسة',
      },
      {
        label: 'Floor',
        value: floorTitle || '—',
      },
    ];
  }

  if (isOffice(block)) {
    return [
      {
        label: 'Type',
        value: getTypeLabel(block?.type),
      },
      {
        label: 'Floor',
        value: floorTitle || '—',
      },
      {
        label: 'Department',
        value: block?.department || 'كلية الهندسة',
      },
    ];
  }

  return [
    ...basicItems,
    {
      label: 'Capacity',
      value: block?.capacity || '—',
    },
    {
      label: 'Department',
      value: block?.department || '—',
    },
    {
      label: 'Lecturer',
      value: block?.lecturerName || '—',
    },
    {
      label: 'Email',
      value: block?.lecturerEmail || '—',
    },
    {
      label: 'Current Course',
      value: block?.currentCourse || '—',
    },
    {
      label: 'Lecture Time',
      value: block?.lectureTime || '—',
    },
  ];
}
function parseRoomFeatures(features) {
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

function getRoomOffsetPixels(block, floorMeta) {
  // DB rooms store absolute position in polygon_points — never apply extra offset
  if (block.fromDatabase) return { x: 0, y: 0 };

  const features = parseRoomFeatures(block.features);

  if (features.geometry_mode !== 'offset_from_design') {
    return { x: 0, y: 0 };
  }

  return {
    x: (Number(block.coord_x || 0) / 100) * floorMeta.width,
    y: (Number(block.coord_y || 0) / 100) * floorMeta.height,
  };
}
function getTypeLabel(type) {
  const map = {
    lab: 'Lab',
    lecture_hall: 'Lecture Hall',
    engineering_drawing_studio: 'Engineering Drawing Studio',
    office: 'Doctor Office',
    meeting_room: 'Meeting Room',
    professor_lounge: 'Professor Lounge',
    storage: 'Storage',
    bookstore: 'Bookstore / Printing',
    amphitheater: 'Amphitheater',
    entrance: 'Entrance',
    restroom: 'Restroom',
    bathroom: 'Accessible Restroom',
    elevator: 'Elevator',
    stairs: 'Stairs',
    emergency_stairs: 'Emergency Stairs',
  };

  return map[type] || type || 'Room';
}

function matchesNeed(block, need) {
  if (need === 'all') return true;
  if (need === 'accessible') return Boolean(block.accessible);
  return block.type === need;
}

function getBlockClass(block, selectedBlock, selectedNeed, availableNowMode, availableRoomIds) {
  const classes = ['map-block-zone'];

  if (selectedBlock?.id === block.id) classes.push('selected');
  if (selectedNeed !== 'all' && matchesNeed(block, selectedNeed)) {
    classes.push('need-match');
  }

  if (availableNowMode && block.dbId && isAcademicSpace(block)) {
    if (availableRoomIds.has(block.dbId)) {
      classes.push('available-now-zone');
    } else {
      classes.push('occupied-dim');
    }
  }

  if (block.type === 'lab') classes.push('lab-zone');
  if (block.type === 'lecture_hall') classes.push('lecture-zone');
  if (block.type === 'engineering_drawing_studio') classes.push('studio-zone');
  if (block.type === 'office') classes.push('office-zone');
  if (block.type === 'meeting_room') classes.push('meeting-zone');
  if (block.type === 'professor_lounge') classes.push('lounge-zone');
  if (block.type === 'bookstore') classes.push('bookstore-zone');
  if (block.type === 'storage') classes.push('storage-zone');
  if (block.type === 'stairs') classes.push('stairs-normal-zone');
  if (block.type === 'restroom') classes.push('restroom-zone');
  if (block.type === 'bathroom') classes.push('accessible-zone');
  if (block.type === 'elevator') classes.push('elevator-zone');
  if (block.type === 'amphitheater') classes.push('amphitheater-zone');
  if (block.type === 'entrance') classes.push('entrance-zone');
  if (block.type === 'emergency_stairs') classes.push('stairs-zone');

  return classes.join(' ');
}
function normalizeScheduleRoomNumber(roomNumber) {
  const raw = String(roomNumber || '').trim();

  if (!raw || raw === '—') return '';
  if (/^\d{6}$/.test(raw)) {
    return raw.slice(2);
  }

  return raw;
}

function getPossibleMapRoomIds(roomNumber) {
  const raw = String(roomNumber || '').trim();
  const normalized = normalizeScheduleRoomNumber(raw);

  const values = new Set();

  if (raw) values.add(raw);
  if (normalized) values.add(normalized);
  if (/^\d{4}$/.test(normalized)) {
    values.add(`B${normalized}`);
    values.add(`G${normalized}`);
  }
  return Array.from(values);
}

function findBlockByScheduleRoom(roomNumber) {
  const possibleIds = getPossibleMapRoomIds(roomNumber);

  for (const [floorKey, floor] of Object.entries(FLOOR_MAPS)) {
    const block = floor.blocks.find((item) => {
      return (
        possibleIds.includes(String(item.id)) ||
        possibleIds.includes(String(item.roomNumber))
      );
    });

    if (block) {
      return {
        floorKey,
        block
      };
    }
  }

  return null;
}


function fmtTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const period = h < 12 ? 'AM' : 'PM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

function LiveStatusPanel({ status, loading }) {
  if (loading) {
    return <div className="room-live-loading">Loading live status…</div>;
  }
  if (!status) return null;

  const isOccupied = status.status === 'occupied';
  const isEvent    = status.status === 'event';
  const { current, next, event } = status;

  return (
    <>
      <div className={`room-popup-status${isOccupied ? ' status-occupied' : isEvent ? ' status-event' : ''}`}>
        <div className="room-status-left">
          <span className={`room-status-dot${isOccupied ? ' dot-occupied' : isEvent ? ' dot-event' : ''}`} />
          <div>
            <strong>{isOccupied ? 'In Session' : isEvent ? 'Reserved for Event' : 'Available'}</strong>
            <small>
              {isOccupied
                ? `${current.course_code} · ends ${fmtTime(current.end_time)}`
                : isEvent
                ? `${event.title} · ends ${fmtTime(event.end_time)}`
                : 'No active class'}
            </small>
          </div>
        </div>
        <span className={`room-status-badge${isOccupied ? '' : isEvent ? ' badge-event' : ' badge-open'}`}>
          {isOccupied ? 'LIVE' : isEvent ? 'EVENT' : 'OPEN'}
        </span>
      </div>

      {isOccupied && current && (
        <div className="room-popup-live-class current-class">
          <div className="live-class-label">Current Class</div>
          <div className="live-class-name">{current.course_code}: {current.course_name}</div>
          {current.instructor_name && (
            <div className="live-class-instructor">{current.instructor_name}</div>
          )}
          <div className="live-class-time">
            {fmtTime(current.start_time)} – {fmtTime(current.end_time)}
          </div>
        </div>
      )}

      {isEvent && event && (
        <div className="room-popup-live-event">
          <div className="live-event-label">Event</div>
          <div className="live-event-title">{event.title}</div>
          {event.description && (
            <div className="live-event-desc">{event.description}</div>
          )}
          <div className="live-event-time">
            {fmtTime(event.start_time)} – {fmtTime(event.end_time)}
          </div>
        </div>
      )}

      {next ? (
        <div className="room-popup-live-class next-class">
          <div className="live-class-label">Next Class</div>
          <div className="live-class-name">{next.course_code}: {next.course_name}</div>
          {next.instructor_name && (
            <div className="live-class-instructor">{next.instructor_name}</div>
          )}
          <div className="live-class-time">
            {fmtTime(next.start_time)} – {fmtTime(next.end_time)}
          </div>
        </div>
      ) : !isOccupied && !isEvent && (
        <div className="room-popup-empty">
          <span className="room-popup-empty-icon">✨</span>
          <h4>No classes scheduled now</h4>
          <p>This location is currently free</p>
        </div>
      )}
    </>
  );
}

function OfficeInstructorsPanel({ instructors, loading }) {
  if (loading) {
    return <div className="office-instructors-loading">Loading assigned professors…</div>;
  }
  return (
    <div className="office-instructors-section">
      <div className="office-instructors-label">Assigned Professors</div>
      {instructors.length === 0 ? (
        <div className="office-instructors-empty">No professor assigned to this office yet.</div>
      ) : (
        <div className="office-instructors-list">
          {instructors.map(inst => (
            <div className="office-instructor-card" key={inst.id}>
              <div className="office-instructor-name">
                {[inst.title, inst.first_name, inst.last_name].filter(Boolean).join(' ')}
              </div>
              <div className="office-instructor-meta">
                {inst.doctor_number && <span className="office-instructor-num">#{inst.doctor_number}</span>}
                {inst.department && <span className="office-instructor-dept">{inst.department}</span>}
              </div>
              {inst.email && (
                <a href={`mailto:${inst.email}`} className="office-instructor-email">{inst.email}</a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const MIN_MAP_ZOOM = 1;
const MAX_MAP_ZOOM = 3;
const MAP_ZOOM_STEP = 0.12;
function clampZoom(value) {
  return Math.min(MAX_MAP_ZOOM, Math.max(MIN_MAP_ZOOM, value));
}

function getPointerDistance(a, b) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function getPointerCenter(a, b) {
  return {
    clientX: (a.clientX + b.clientX) / 2,
    clientY: (a.clientY + b.clientY) / 2,
  };
}

export default function MapPage() {
  const location = useLocation();

  const mapViewportRef = useRef(null);
const activePointersRef = useRef(new Map());
const panStartRef = useRef(null);
const pinchStartRef = useRef(null);
// Tracks the last room target already handled so that periodic mapFloors
// refreshes (every 5 s) do not re-trigger the highlight or reopen the panel.
const scheduleTargetHandledRef = useRef('');
const [scheduleHighlightedBlock, setScheduleHighlightedBlock] = useState(null);

const [mapZoom, setMapZoom] = useState(1);
const [mapPan, setMapPan] = useState({ x: 0, y: 0 });
const [isMapDragging, setIsMapDragging] = useState(false);

const mapZoomRef = useRef(mapZoom);
const mapPanRef = useRef(mapPan);

useEffect(() => {
  mapZoomRef.current = mapZoom;
}, [mapZoom]);

useEffect(() => {
  mapPanRef.current = mapPan;
}, [mapPan]);

useEffect(() => {
  const onKeyDown = e => {
    if (e.key === 'Escape') resetMapView();
  };
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}, []);

  const [liveStatus, setLiveStatus] = useState(null);
  const [liveStatusLoading, setLiveStatusLoading] = useState(false);
  const [officeInstructors, setOfficeInstructors] = useState([]);
  const [officeInstructorsLoading, setOfficeInstructorsLoading] = useState(false);

  const [dbRoomsByFloor, setDbRoomsByFloor] = useState({});
  const [dbRoomsLoaded, setDbRoomsLoaded] = useState(false);
  const [dbRoomsLoading, setDbRoomsLoading] = useState(false);
  const [roomSearch, setRoomSearch] = useState('');
  const [roomSearchError, setRoomSearchError] = useState('');
  const [activeFloor, setActiveFloor] = useState('B2');
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [hoveredBlock, setHoveredBlock] = useState(null);
  const [selectedNeed, setSelectedNeed] = useState('all');
  const [startNodeId, setStartNodeId] = useState('B2_LEFT_STAIRS');
  const [accessibleRoute, setAccessibleRoute] = useState(false);
  const [routePath, setRoutePath] = useState([]);
  const [routeInstructions, setRouteInstructions] = useState([]);
  const [routeTarget, setRouteTarget] = useState(null);
  const [routeError, setRouteError] = useState('');

  const [availableNowMode, setAvailableNowMode] = useState(false);
  const [availableRooms, setAvailableRooms] = useState([]);
  const [availableRoomsLoading, setAvailableRoomsLoading] = useState(false);




const loadMapRoomsFromDatabase = useCallback(async () => {
  setDbRoomsLoading(true);

  try {
    const floorsResponse = await floorAPI.getAll({ active_only: 'false' });
    const floorsPayload = unwrapApi(floorsResponse);
    const floors = floorsPayload.floors || [];

    const nextRoomsByFloor = {};

    for (const floor of floors) {
      const floorKey = normalizeFloorKeyFromDb(floor);
      const floorMeta = FLOOR_MAPS[floorKey];

      if (!floorMeta) continue;

      const roomsResponse = await roomAPI.getByFloor(floor.id, {
        active_only: 'true',
        limit: 1000,
      });

      const roomsPayload = unwrapApi(roomsResponse);
      const rooms = roomsPayload.rooms || [];

      const staticByRoom = new Map(
        floorMeta.blocks.map(block => [
          normalizeRoomSearch(block.roomNumber || block.id),
          block,
        ])
      );

      nextRoomsByFloor[floorKey] = rooms
        .map(room => {
          const staticBlock = staticByRoom.get(
            normalizeRoomSearch(room.room_number)
          );

          return mergeDbRoomWithStaticGeometry(room, floorMeta, staticBlock);
        })
        .filter(Boolean);
    }

    setDbRoomsByFloor(nextRoomsByFloor);
    setDbRoomsLoaded(true);
  } catch {
    setDbRoomsLoaded(false);
  } finally {
    setDbRoomsLoading(false);
  }
}, 
[]
);

const AUTO_MAP_REFRESH_MS = 5000;

useEffect(() => {
  loadMapRoomsFromDatabase();

  const intervalId = window.setInterval(() => {
    if (document.visibilityState === 'visible') {
      loadMapRoomsFromDatabase();
    }
  }, AUTO_MAP_REFRESH_MS);

  const handleFocus = () => {
    loadMapRoomsFromDatabase();
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      loadMapRoomsFromDatabase();
    }
  };

  window.addEventListener('focus', handleFocus);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    window.clearInterval(intervalId);
    window.removeEventListener('focus', handleFocus);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}, [loadMapRoomsFromDatabase]);

const mapFloors = useMemo(() => {
  const result = {};

  Object.entries(FLOOR_MAPS).forEach(([floorKey, floorMeta]) => {
    const hasDbFloor = Object.prototype.hasOwnProperty.call(
      dbRoomsByFloor,
      floorKey
    );

    result[floorKey] = {
      ...floorMeta,
      blocks:
        dbRoomsLoaded && hasDbFloor
          ? dbRoomsByFloor[floorKey]
          : [],
    };
  });

  return result;
}, [dbRoomsByFloor, dbRoomsLoaded]);

const currentFloor = mapFloors[activeFloor] || FLOOR_MAPS[activeFloor];

const visibleBlocks = useMemo(() => {
  return currentFloor.blocks.filter(block => matchesNeed(block, selectedNeed));
}, [currentFloor, selectedNeed]);

const availableRoomIds = useMemo(
  () => new Set(availableRooms.map(r => r.id)),
  [availableRooms]
);

function findBlockByDbId(value) {
  if (!value) return null;
  const target = String(value);

  for (const [floorKey, floor] of Object.entries(mapFloors)) {
    const block = floor.blocks.find(item =>
      String(item.dbId || item.id || '') === target
    );

    if (block) return { floorKey, block };
  }

  return null;
}

useEffect(() => {
  const params = new URLSearchParams(location.search);
  const state = location.state || {};

  const roomFromUrl = params.get('room') || state.roomNumber || state.room_number || state.room || '';
  const roomIdFromUrl = params.get('roomId') || state.roomId || state.room_id || '';
  // Only open the details popup when the URL/state explicitly asks for it.
  // A roomId alone should select/highlight the room, not show the popup.
  const shouldOpenRoom = params.get('open') === '1' || state.openRoom === true;

  if (!roomFromUrl && !roomIdFromUrl) return;

  const targetKey = roomIdFromUrl
    ? `id:${roomIdFromUrl}:open:${shouldOpenRoom ? '1' : '0'}`
    : `room:${roomFromUrl}:open:${shouldOpenRoom ? '1' : '0'}`;

  // Guard against the auto-refresh loop: mapFloors rebuilds every 5 s, which
  // re-fires this effect. Once we've handled a given target we skip all future
  // re-fires for that same target, so closing the panel keeps it closed.
  if (scheduleTargetHandledRef.current === targetKey) return;

  const result = roomIdFromUrl
    ? (findBlockByDbId(roomIdFromUrl) || findBlockByRoomSearch(roomFromUrl))
    : findBlockByRoomSearch(roomFromUrl);

  const displayTarget = roomFromUrl || roomIdFromUrl;

  if (!result) {
    // Wait until DB rooms have loaded before showing "not found" to avoid a
    // false-error flash while the async fetch is still in flight.
    if (dbRoomsLoaded) {
      setRoomSearch(displayTarget);
      setRoomSearchError(`Room "${displayTarget}" was not found on the map.`);
      scheduleTargetHandledRef.current = targetKey;
    }
    return;
  }

  scheduleTargetHandledRef.current = targetKey;

  setActiveFloor(result.floorKey);
  setSelectedNeed('all');
  setHoveredBlock(null);
  setRoomSearch(result.block.roomNumber || result.block.room_number || displayTarget);
  setRoomSearchError('');
  resetMapView();

  if (shouldOpenRoom) {
    // Only direct room detail links open the popup.
    setSelectedBlock(result.block);
    setScheduleHighlightedBlock(null);
  } else {
    // Chatbot/search links select and highlight the room without opening the popup.
    setScheduleHighlightedBlock(result.block);
    setSelectedBlock(null);
  }

  if (result.floorKey === 'G') {
    setStartNodeId('G_NORTH_ENTRANCE_NODE');
  }

  if (result.floorKey === 'B2') {
    setStartNodeId('B2_LEFT_STAIRS');
  }
}, [location.search, location.state, mapFloors, dbRoomsLoaded]);

  useEffect(() => {
    if (!selectedBlock?.dbId || !isAcademicSpace(selectedBlock)) {
      setLiveStatus(null);
      setLiveStatusLoading(false);
      return;
    }
    setLiveStatusLoading(true);
    roomAPI.getLiveStatus(selectedBlock.dbId)
      .then(res => {
        const payload = res?.data?.data || res?.data || res;
        setLiveStatus(payload || null);
      })
      .catch(() => setLiveStatus(null))
      .finally(() => setLiveStatusLoading(false));
  }, [selectedBlock]);

  useEffect(() => {
    if (!selectedBlock?.dbId || !isOffice(selectedBlock)) {
      setOfficeInstructors([]);
      setOfficeInstructorsLoading(false);
      return;
    }
    setOfficeInstructorsLoading(true);
    roomAPI.getAssignedInstructors(selectedBlock.dbId)
      .then(res => {
        const payload = res?.data?.data || res?.data || {};
        setOfficeInstructors(payload.instructors || []);
      })
      .catch(() => setOfficeInstructors([]))
      .finally(() => setOfficeInstructorsLoading(false));
  }, [selectedBlock]);

  function clearRoute() {
    setRoutePath([]);
    setRouteInstructions([]);
    setRouteTarget(null);
    setRouteError('');
  }

  const handleToggleAvailableNow = useCallback(async () => {
    if (availableNowMode) {
      setAvailableNowMode(false);
      setAvailableRooms([]);
      return;
    }
    setAvailableRoomsLoading(true);
    try {
      const res = await roomAPI.getAvailableNow();
      const payload = res?.data?.data || res?.data || {};
      setAvailableRooms(payload.rooms || []);
      setAvailableNowMode(true);
    } catch {
      setAvailableNowMode(false);
    } finally {
      setAvailableRoomsLoading(false);
    }
  }, [availableNowMode]);

  const handleSelectAvailableRoom = useCallback((room) => {
    const floorKey = normalizeFloorKeyFromDb({
      floor_label: room.floor_label,
      floor_number: room.floor_number,
    });
    setActiveFloor(floorKey);
    resetMapView();
    const block = (mapFloors[floorKey]?.blocks || []).find(b => b.dbId === room.id);
    if (block) {
      setScheduleHighlightedBlock(block);
      setSelectedBlock(null);
    }
  }, [mapFloors]);
  function handleSelectBlock(block) {
    setScheduleHighlightedBlock(null);
    setSelectedBlock(block);
  }

  function closeCard() {
    setSelectedBlock(null);
  }
  function normalizeRoomSearch(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/^ROOM\s*/i, '')
    .replace(/\s+/g, '');
}

function findBlockByRoomSearch(value) {
  const raw = normalizeRoomSearch(value); // uppercased, "ROOM " stripped, whitespace collapsed
  if (!raw) return null;

  // ── Phase 1: exact match (highest priority, prefix-preserving) ──────────
  // "B2080" must hit block.roomNumber "B2080" — never "2080".
  for (const [floorKey, floor] of Object.entries(mapFloors)) {
    const block = floor.blocks.find(item =>
      [item.id, item.roomNumber, item.room_number, item.lecturerNumber, item.lecturer_number]
        .filter(Boolean)
        .some(v => normalizeRoomSearch(v) === raw)
    );
    if (block) return { floorKey, block };
  }

  // ── Phase 2: digit-variant fallback ─────────────────────────────────────
  // Only strip non-digits when the ORIGINAL input was already purely numeric.
  // "2080" → also try "B2080"/"G2080".
  // "B2080" → do NOT produce "2080" — that would wrongly match a different room.
  const digitsOnly = raw.replace(/\D/g, '');
  const inputWasPureDigits = !!digitsOnly && digitsOnly === raw;
  const fallback = new Set([raw]);

  if (inputWasPureDigits) {
    if (/^\d{6}$/.test(digitsOnly)) fallback.add(digitsOnly.slice(2));
    if (/^\d{4}$/.test(digitsOnly)) {
      fallback.add(`G${digitsOnly}`);
      fallback.add(`B${digitsOnly}`);
    }
  }
  // Include schedule-normalizer variants (handles 6-digit codes like "102080")
  getPossibleMapRoomIds(raw).forEach(id => fallback.add(String(id).toUpperCase()));

  for (const [floorKey, floor] of Object.entries(mapFloors)) {
    const block = floor.blocks.find(item =>
      [item.id, item.roomNumber, item.room_number, item.lecturerNumber, item.lecturer_number, item.lecturerName, item.name]
        .filter(Boolean)
        .some(v => fallback.has(normalizeRoomSearch(v)))
    );
    if (block) return { floorKey, block };
  }

  // ── Phase 3: partial/contains match (lowest priority) ───────────────────
  // "B20" can still find "B2080". Prefix is preserved: "B20" won't match "2080".
  for (const [floorKey, floor] of Object.entries(mapFloors)) {
    const block = floor.blocks.find(item =>
      [item.id, item.roomNumber, item.room_number]
        .filter(Boolean)
        .some(v => normalizeRoomSearch(v).includes(raw))
    );
    if (block) return { floorKey, block };
  }

  return null;
}

function handleRoomSearchSubmit(event) {
  event.preventDefault();

  const result = findBlockByRoomSearch(roomSearch);

  if (!result) {
    setRoomSearchError(`Room "${roomSearch}" was not found.`);
    return;
  }

  setActiveFloor(result.floorKey);
  setSelectedNeed('all');

  // Search should highlight only, NOT open the popup.
  setSelectedBlock(null);
  setScheduleHighlightedBlock(result.block);

  setHoveredBlock(null);
  setRoomSearchError('');
  resetMapView();

  if (result.floorKey === 'G') {
    setStartNodeId('G_NORTH_ENTRANCE_NODE');
  }

  if (result.floorKey === 'B2') {
    setStartNodeId('B2_LEFT_STAIRS');
  }
}

function applyZoomAtPoint(nextZoomValue, clientX, clientY) {
  const viewport = mapViewportRef.current;
  if (!viewport) return;

  const nextZoom = clampZoom(nextZoomValue);
  const currentZoom = mapZoomRef.current;
  const currentPan = mapPanRef.current;

  const rect = viewport.getBoundingClientRect();

  const localX = clientX - rect.left;
  const localY = clientY - rect.top;

  const mapX = (localX - currentPan.x) / currentZoom;
  const mapY = (localY - currentPan.y) / currentZoom;

  const nextPan = {
    x: localX - mapX * nextZoom,
    y: localY - mapY * nextZoom,
  };

  setMapZoom(nextZoom);
  setMapPan(nextPan);
}

function zoomMapBy(delta) {
  const viewport = mapViewportRef.current;
  if (!viewport) return;

  const rect = viewport.getBoundingClientRect();

  applyZoomAtPoint(
    mapZoomRef.current + delta,
    rect.left + rect.width / 2,
    rect.top + rect.height / 2
  );
}

function resetMapView() {
  setMapZoom(1);
  setMapPan({ x: 0, y: 0 });
}

function handleMapWheel(event) {
  event.preventDefault();

  const direction = event.deltaY < 0 ? 1 : -1;
  const nextZoom = mapZoomRef.current + direction * MAP_ZOOM_STEP;

  applyZoomAtPoint(nextZoom, event.clientX, event.clientY);
}

function handleMapPointerDown(event) {
  const isMiddleClick = event.button === 1;

  // Middle mouse always pans (Photoshop-style). Left click on a room block
  // opens the popup instead.
  if (!isMiddleClick && event.target?.closest?.('.map-block-zone')) {
    return;
  }

  // Prevent the browser's autoscroll cursor on middle-click.
  if (isMiddleClick) event.preventDefault();

  const viewport = mapViewportRef.current;
  if (!viewport) return;

  activePointersRef.current.set(event.pointerId, {
    clientX: event.clientX,
    clientY: event.clientY,
  });
  viewport.setPointerCapture(event.pointerId);

  const pointers = [...activePointersRef.current.values()];

  if (pointers.length === 1) {
    panStartRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      pan: mapPanRef.current,
      isMiddle: isMiddleClick,
    };

    setIsMapDragging(true);
  }

  if (pointers.length === 2) {
    const [a, b] = pointers;

    pinchStartRef.current = {
      distance: getPointerDistance(a, b),
      zoom: mapZoomRef.current,
      pan: mapPanRef.current,
      center: getPointerCenter(a, b),
    };

    setIsMapDragging(false);
  }
}

function handleMapPointerMove(event) {
  if (!activePointersRef.current.has(event.pointerId)) return;

  activePointersRef.current.set(event.pointerId, {
    clientX: event.clientX,
    clientY: event.clientY,
  });

  const pointers = [...activePointersRef.current.values()];

  if (pointers.length === 2 && pinchStartRef.current) {
    const [a, b] = pointers;
    const currentDistance = getPointerDistance(a, b);

    if (pinchStartRef.current.distance <= 0) return;

    const zoomRatio = currentDistance / pinchStartRef.current.distance;
    const nextZoom = pinchStartRef.current.zoom * zoomRatio;
    const center = getPointerCenter(a, b);

    applyZoomAtPoint(nextZoom, center.clientX, center.clientY);
    return;
  }

  if (pointers.length === 1 && panStartRef.current && (panStartRef.current.isMiddle || mapZoomRef.current > 1)) {
    const dx = event.clientX - panStartRef.current.clientX;
    const dy = event.clientY - panStartRef.current.clientY;

    const nextPan = {
      x: panStartRef.current.pan.x + dx,
      y: panStartRef.current.pan.y + dy,
    };

    setMapPan(nextPan);
  }
}

function handleMapPointerUp(event) {
  const viewport = mapViewportRef.current;

  if (viewport?.hasPointerCapture?.(event.pointerId)) {
    viewport.releasePointerCapture(event.pointerId);
  }

  activePointersRef.current.delete(event.pointerId);

  const pointers = [...activePointersRef.current.values()];

  if (pointers.length === 0) {
    panStartRef.current = null;
    pinchStartRef.current = null;
    setIsMapDragging(false);
  }

  if (pointers.length === 1) {
    const pointer = pointers[0];

    panStartRef.current = {
      clientX: pointer.clientX,
      clientY: pointer.clientY,
      pan: mapPanRef.current,
    };

    pinchStartRef.current = null;
    setIsMapDragging(true);
  }
}

return ( 
  <div className="map-page">
    <div className="map-floor-bar">
        <div className="map-floor-left">
              <span className="map-floor-label">Floor:</span>
          <div className="map-floor-tabs">
            {FLOOR_ORDER.map(floorKey => (
              <button
                key={floorKey}
                type="button"
                className={`map-floor-btn ${activeFloor === floorKey ? 'active' : ''}`}
               onClick={() => {
                  setActiveFloor(floorKey);
resetMapView();
setSelectedBlock(null);
setScheduleHighlightedBlock(null);
setHoveredBlock(null);
setSelectedNeed('all');
               }}
               >{FLOOR_MAPS[floorKey].label}
              </button>
            ))}
          </div>
         </div>
             <div className="map-floor-title">{currentFloor.title}</div>
      </div>

      <div className="map-layout">
       <div className="map-tools-panel">
<SmartFinderPanel
  requestOptions={REQUEST_OPTIONS}
  selectedNeed={selectedNeed}
  setSelectedNeed={setSelectedNeed}
  setSelectedBlock={setSelectedBlock}
  visibleBlocks={visibleBlocks}
  availableNowMode={availableNowMode}
  availableRooms={availableRooms}
  availableRoomsLoading={availableRoomsLoading}
  onToggleAvailableNow={handleToggleAvailableNow}
  onSelectAvailableRoom={handleSelectAvailableRoom}
/>

<div className="room-search-card">
  <div className="room-search-head">
    <span>🔎</span>

    <div>
      <h3>Find a Room</h3>
      <p>Type a room number, then select it on the map.</p>
    </div>
  </div>

  <form className="room-search-form" onSubmit={handleRoomSearchSubmit}>
    <input
      type="text"
      value={roomSearch}
      onChange={event => {
        setRoomSearch(event.target.value);
        setRoomSearchError('');
      }}
      placeholder="Example: 2590, G0280, 4100"
    />

    <button type="submit">
      Search
    </button>
  </form>

  {roomSearchError && (
    <p className="room-search-error">
      {roomSearchError}
    </p>
  )}

{(selectedBlock || scheduleHighlightedBlock) && (
  <p className="room-search-selected">
    Selected:{' '}
    <strong>
      {(selectedBlock || scheduleHighlightedBlock).roomNumber}
    </strong>
  </p>
)}
</div>

  {createPortal(
  <AnimatePresence>
    {selectedBlock && (
      <motion.div
        className="room-modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={closeCard}
      >
        <motion.div
          key={selectedBlock.id}
          className="room-modal-card"
          initial={{ opacity: 0, y: 28, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 18, scale: 0.96 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="room-popup-header">
            <div>
              <h2>{selectedBlock.roomNumber}</h2>
              <p>{selectedBlock.name}</p>
            </div>

            <button
              type="button"
              className="room-popup-close"
              onClick={closeCard}
              aria-label="Close room card"
            >
              ×
            </button>
          </div>

          {isAcademicSpace(selectedBlock) ? (
            <LiveStatusPanel status={liveStatus} loading={liveStatusLoading} />
          ) : shouldShowAvailabilityBox(selectedBlock) && (
            <div className="room-popup-status">
              <div className="room-status-left">
                <span className="room-status-dot" />
                <div>
                  <strong>Available</strong>
                  <small>Facility available</small>
                </div>
              </div>
              <span className="room-status-badge badge-open">OPEN</span>
            </div>
          )}

          <div className="room-popup-grid">
            {getRoomInfoItems(selectedBlock, currentFloor.title).map((item) => (
              <div className="room-info-box" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>

          {isOffice(selectedBlock) && (
            <OfficeInstructorsPanel
              instructors={officeInstructors}
              loading={officeInstructorsLoading}
            />
          )}

          <button
            type="button"
            className="room-popup-action"
            onClick={closeCard}
          >
            Close
          </button>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>,
        document.body
         )}
        </div>

<div className="map-canvas-card">
<div className="map-canvas-card">
  <div
    ref={mapViewportRef}
    className={`map-canvas-wrap map-canvas-touch ${
      isMapDragging ? 'is-dragging' : ''
    }`}
    onWheel={handleMapWheel}
    onPointerDown={handleMapPointerDown}
    onPointerMove={handleMapPointerMove}
    onPointerUp={handleMapPointerUp}
    onPointerCancel={handleMapPointerUp}
    onPointerLeave={handleMapPointerUp}
  >
    <div
      className="map-transform-layer"
      style={{
        transform: `translate(${mapPan.x}px, ${mapPan.y}px) scale(${mapZoom})`,
      }}
    >
      <div
        className="map-static-sizer"
        style={{
          aspectRatio: `${currentFloor.width} / ${currentFloor.height}`,
        }}
      >
        <img
          src={currentFloor.image}
          alt={currentFloor.title}
          className="map-floor-image"
          draggable="false"
        />

        <svg
          className="map-svg-overlay"
          viewBox={`0 0 ${currentFloor.width} ${currentFloor.height}`}
          preserveAspectRatio="none"
        >
          {currentFloor.blocks.map(block => {
            const hiddenByFilter = !matchesNeed(block, selectedNeed);
            const isActive =
  hoveredBlock?.id === block.id ||
  selectedBlock?.id === block.id ||
  scheduleHighlightedBlock?.id === block.id;

            return (
              <g
  key={block.id}
  transform={`translate(${
    getRoomOffsetPixels(block, currentFloor).x
  }, ${
    getRoomOffsetPixels(block, currentFloor).y
  })`}
>
                {block.shape === 'polygon' ? (
                  <polygon
                    points={block.points}
                    className={`${getBlockClass(
  block,
  selectedBlock || scheduleHighlightedBlock,
  selectedNeed,
  availableNowMode,
  availableRoomIds
)} ${hiddenByFilter ? 'dimmed' : ''}`}
                    onMouseEnter={() => setHoveredBlock(block)}
                    onMouseLeave={() => setHoveredBlock(null)}
                    onPointerDown={(event) => event.stopPropagation()}
onPointerUp={(event) => event.stopPropagation()}
onClick={(event) => {
  event.stopPropagation();
  handleSelectBlock(block);
}}
                  />
                ) : (
                  <rect
                    x={block.x}
                    y={block.y}
                    width={block.width}
                    height={block.height}
                    className={`${getBlockClass(
  block,
  selectedBlock || scheduleHighlightedBlock,
  selectedNeed,
  availableNowMode,
  availableRoomIds
)} ${hiddenByFilter ? 'dimmed' : ''}`}
                    onMouseEnter={() => setHoveredBlock(block)}
                    onMouseLeave={() => setHoveredBlock(null)}
                    onPointerDown={(event) => event.stopPropagation()}
onPointerUp={(event) => event.stopPropagation()}
onClick={(event) => {
  event.stopPropagation();
  handleSelectBlock(block);
}}
                  />
                )}

                {isActive && (
                  <foreignObject
                    x={block.labelX - 58}
                    y={block.labelY - 45}
                    width="145"
                    height="40"
                    className="map-hover-chip-wrap"
                  >
                    <div className="map-hover-chip">{block.roomNumber}</div>
                  </foreignObject>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  </div>

  <div className="map-legend">
    <span className="legend-item">
      <i className="legend-dot legend-lab" />
      Lab
    </span>

    <span className="legend-item">
      <i className="legend-dot legend-restroom" />
      Restroom
    </span>

    <span className="legend-item">
      <i className="legend-dot legend-accessible" />
      Accessible Restroom
    </span>

    <span className="legend-item">
      <i className="legend-dot legend-elevator" />
      Elevator
    </span>

      <span className="legend-item">
        <i className="legend-dot legend-stairs" />
        Emergency Stairs
      </span>
     </div>
    </div>
  </div>
</div>
</div>
);
}
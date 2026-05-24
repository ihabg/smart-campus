import React from 'react';
import { motion } from 'framer-motion';
import './SmartFinderPanel.css';

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

const TYPE_SHORT = {
  classroom: 'Class',
  lecture_hall: 'Lecture',
  lab: 'Lab',
  amphitheater: 'Hall',
  engineering_drawing_room: 'Drawing',
  engineering_drawing_studio: 'Studio',
};

function getRequestIcon(value) {
  return REQUEST_ICON_MAP[value] || '📍';
}

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const p = h < 12 ? 'AM' : 'PM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${p}`;
}

export default function SmartFinderPanel({
  requestOptions = [],
  selectedNeed = 'all',
  setSelectedNeed,
  setSelectedBlock,
  visibleBlocks = [],
  availableNowMode = false,
  availableRooms = [],
  availableRoomsLoading = false,
  onToggleAvailableNow,
  onSelectAvailableRoom,
}) {
  const safeRequestOptions = Array.isArray(requestOptions) ? requestOptions : [];
  const safeVisibleBlocks = Array.isArray(visibleBlocks) ? visibleBlocks : [];
  const safeAvailableRooms = Array.isArray(availableRooms) ? availableRooms : [];

  const activeOption =
    safeRequestOptions.find(option => option.value === selectedNeed) ||
    safeRequestOptions[0];

  function handleNeedChange(value) {
    if (typeof setSelectedNeed === 'function') {
      setSelectedNeed(value);
    }

    if (typeof setSelectedBlock === 'function') {
      setSelectedBlock(null);
    }
  }

  return (
    <motion.div
      className={`map-tools-card map-tools-card--pro${availableNowMode ? ' avail-now-active' : ''}`}
      initial={{ opacity: 0, y: 18, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
    >
      <div className="map-tools-glow" aria-hidden="true" />

      <div className="map-tools-head-pro">
        <motion.div
          className="map-tools-icon-pro"
          animate={{ rotate: [0, -4, 4, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        >
          🧭
        </motion.div>

        <div>
          <span className="map-tools-eyebrow">Smart Finder</span>
          <h3>{availableNowMode ? 'Rooms Free Now' : 'What do you need?'}</h3>
          <p>
            {availableNowMode
              ? 'Click a room from the list to jump to it on the map.'
              : 'Choose a category, then click any highlighted room on the map.'}
          </p>
        </div>
      </div>

      <div className="map-filter-pills" role="tablist" aria-label="Map filters">
        {safeRequestOptions
          .filter(option => QUICK_REQUEST_VALUES.includes(option.value))
          .map(option => {
            const active = selectedNeed === option.value;

            return (
              <motion.button
                key={option.value}
                type="button"
                className={`map-filter-pill ${active ? 'active' : ''}`}
                onClick={() => handleNeedChange(option.value)}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.96 }}
              >
                <span>{getRequestIcon(option.value)}</span>
                {option.label}
              </motion.button>
            );
          })}
      </div>

      <div className="map-select-group-pro">
        <label>More categories</label>

        <div className="map-select-shell-pro">
          <select
            className="map-need-select map-need-select--pro"
            value={selectedNeed}
            onChange={event => handleNeedChange(event.target.value)}
          >
            {safeRequestOptions.map(option => (
              <option key={option.value} value={option.value}>
                {getRequestIcon(option.value)} {option.label}
              </option>
            ))}
          </select>

          <span className="map-select-arrow">⌄</span>
        </div>
      </div>

      <div className="map-tools-summary-pro">
        <motion.div
          className="map-summary-box"
          key={`summary-${selectedNeed}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <span>Showing</span>

          <strong>
            {selectedNeed === 'all'
              ? 'All interactive blocks'
              : activeOption?.label || 'Selected category'}
          </strong>
        </motion.div>

        <motion.div
          className="map-summary-box map-summary-box--count"
          key={`count-${safeVisibleBlocks.length}`}
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2 }}
        >
          <span>Found</span>
          <strong>{safeVisibleBlocks.length}</strong>
        </motion.div>
      </div>

      {/* ── Available Now ── */}
      <button
        type="button"
        className={`avail-now-btn${availableNowMode ? ' active' : ''}`}
        onClick={typeof onToggleAvailableNow === 'function' ? onToggleAvailableNow : undefined}
        disabled={availableRoomsLoading}
      >
        {availableRoomsLoading ? (
          <span className="avail-now-spinner" />
        ) : (
          <span className="avail-now-pulse" />
        )}
        {availableNowMode
          ? `Available Now — ${safeAvailableRooms.length} free`
          : 'Show Available Rooms Now'}
      </button>

      {availableNowMode && (
        <div className="avail-now-list">
          <div className="avail-now-list-header">
            {safeAvailableRooms.length > 0
              ? `${safeAvailableRooms.length} rooms available right now`
              : 'No rooms available right now'}
          </div>

          {safeAvailableRooms.length === 0 ? (
            <div className="avail-now-empty">All academic rooms are in use</div>
          ) : (
            safeAvailableRooms.map(room => (
              <div
                key={room.id}
                className="avail-now-row"
                onClick={() =>
                  typeof onSelectAvailableRoom === 'function' && onSelectAvailableRoom(room)
                }
              >
                <div className="avail-now-row-top">
                  <span className="avail-now-room-num">{room.room_number}</span>
                  <span className="avail-now-floor-badge">{room.floor_label}</span>
                  <span className="avail-now-type-chip">
                    {TYPE_SHORT[room.type] || room.type}
                  </span>
                </div>
                <div className="avail-now-next">
                  {room.next_time
                    ? `Next class at ${fmtTime(room.next_time)}`
                    : 'No more classes today'}
                  {room.capacity ? ` · ${room.capacity} seats` : ''}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </motion.div>
  );
}

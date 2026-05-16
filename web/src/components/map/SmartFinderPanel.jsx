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

function getRequestIcon(value) {
  return REQUEST_ICON_MAP[value] || '📍';
}

export default function SmartFinderPanel({
  requestOptions,
  selectedNeed,
  setSelectedNeed,
  setSelectedBlock,
  clearRoute,
  visibleBlocks,
  activeFloor,
  activeStartNodes,
  startNodeId,
  setStartNodeId,
  accessibleRoute,
  setAccessibleRoute,
}) {
  const activeOption =
    requestOptions.find((option) => option.value === selectedNeed) ||
    requestOptions[0];

  function handleNeedChange(value) {
    setSelectedNeed(value);
    setSelectedBlock(null);
    clearRoute();
  }

  return (
    <motion.div
      className="map-tools-card map-tools-card--pro"
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
          <h3>What do you need?</h3>
          <p>Choose a category, then click any highlighted room on the map.</p>
        </div>
      </div>

      <div className="map-filter-pills" role="tablist" aria-label="Map filters">
        {requestOptions
          .filter((option) => QUICK_REQUEST_VALUES.includes(option.value))
          .map((option) => {
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
            onChange={(event) => handleNeedChange(event.target.value)}
          >
            {requestOptions.map((option) => (
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
          key={`count-${visibleBlocks.length}`}
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2 }}
        >
          <span>Found</span>
          <strong>{visibleBlocks.length}</strong>
        </motion.div>
      </div>

      {['G', 'B2'].includes(activeFloor) && (
        <motion.div
          className="route-control-box route-control-box--pro"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.08 }}
        >
          <div className="route-control-title">
            <span>🧭</span>

            <div>
              <strong>Navigation start</strong>
              <small>Select your starting point</small>
            </div>
          </div>

          <select
            className="map-need-select route-select-pro"
            value={startNodeId}
            onChange={(event) => {
              setStartNodeId(event.target.value);
              clearRoute();
            }}
          >
            {activeStartNodes.map((node) => (
              <option key={node.value} value={node.value}>
                {node.label}
              </option>
            ))}
          </select>

          <label className="route-check-row route-check-row--pro">
            <input
              type="checkbox"
              checked={accessibleRoute}
              onChange={(event) => {
                setAccessibleRoute(event.target.checked);
                clearRoute();
              }}
            />

            <span className="route-check-custom" />
            <span>Accessible route only</span>
          </label>
        </motion.div>
      )}
    </motion.div>
  );
}

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FLOOR_MAPS } from '../../data/floorMapGeometry';

const STATUS_STYLE = {
  available:         { fill: 'rgba(34,197,94,0.55)',  stroke: '#16a34a', strokeWidth: 2 },
  booked:            { fill: 'rgba(239,68,68,0.55)',  stroke: '#dc2626', strokeWidth: 2 },
  too_small:         { fill: 'rgba(245,158,11,0.55)', stroke: '#d97706', strokeWidth: 2 },
  not_teaching_room: { fill: 'rgba(209,213,219,0.25)',stroke: '#9ca3af', strokeWidth: 1 },
  lecture_conflict:  { fill: 'rgba(239,68,68,0.55)',  stroke: '#dc2626', strokeWidth: 2 },
  event_conflict:    { fill: 'rgba(168,85,247,0.55)', stroke: '#9333ea', strokeWidth: 2 },
  not_bookable:      { fill: 'rgba(209,213,219,0.25)',stroke: '#9ca3af', strokeWidth: 1 },
};
const DEFAULT_STYLE  = { fill: 'rgba(148,163,184,0.15)', stroke: '#94a3b8', strokeWidth: 1 };
const SELECTED_STYLE = { fill: 'rgba(37,99,235,0.55)',   stroke: '#2563eb', strokeWidth: 2.5 };

export function RoomAvailabilityMap({ floorKey, availabilityByRoomNumber = {}, selectedRoomId, onRoomClick, clickableStatuses }) {
  const floorMeta = FLOOR_MAPS[floorKey];
  const wrapRef   = useRef(null);
  const dragRef   = useRef(null);

  const [zoom, setZoom]       = useState(1);
  const [pan, setPan]         = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState(null);

  // Non-passive wheel so we can prevent modal scroll while zooming
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 0.9;
      setZoom(z => Math.min(8, Math.max(0.2, z * factor)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const handlePointerDown = useCallback((e) => {
    if (e.button !== 0) return;
    dragRef.current = { startX: e.clientX - pan.x, startY: e.clientY - pan.y };
    wrapRef.current?.setPointerCapture(e.pointerId);
  }, [pan]);

  const handlePointerMove = useCallback((e) => {
    if (!dragRef.current) return;
    setPan({ x: e.clientX - dragRef.current.startX, y: e.clientY - dragRef.current.startY });
  }, []);

  const handlePointerUp = useCallback(() => { dragRef.current = null; }, []);

  if (!floorMeta) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#6b7280' }}>
        No map available for this floor.
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      style={{ overflow: 'hidden', position: 'relative', width: '100%', height: '100%',
               cursor: dragRef.current ? 'grabbing' : 'grab', background: '#e2e8f0', borderRadius: 8, userSelect: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <div style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
        <div style={{ position: 'relative', width: floorMeta.width, height: floorMeta.height }}>
          <img
            src={floorMeta.image}
            alt={floorMeta.title}
            draggable="false"
            style={{ display: 'block', width: '100%', height: '100%', pointerEvents: 'none' }}
          />
          <svg
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
            viewBox={`0 0 ${floorMeta.width} ${floorMeta.height}`}
            preserveAspectRatio="none"
          >
            {floorMeta.blocks.map(block => {
              const avail   = availabilityByRoomNumber[block.roomNumber];
              const status  = avail?.status;
              const isSelected = avail?.room_id && avail.room_id === selectedRoomId;
              const isHovered  = hovered === block.id;
              const isClickable = (clickableStatuses || ['available']).includes(status);

              const s = isSelected ? SELECTED_STYLE : (status ? (STATUS_STYLE[status] || DEFAULT_STYLE) : DEFAULT_STYLE);

              const sharedProps = {
                fill:        s.fill,
                stroke:      isHovered && isClickable ? '#15803d' : s.stroke,
                strokeWidth: isHovered || isSelected ? Math.max(s.strokeWidth, 2.5) : s.strokeWidth,
                style:       { cursor: isClickable ? 'pointer' : 'default' },
                onMouseEnter: () => setHovered(block.id),
                onMouseLeave: () => setHovered(null),
                onPointerDown: (e) => e.stopPropagation(),
                onPointerUp:   (e) => e.stopPropagation(),
                onClick:       (e) => { e.stopPropagation(); onRoomClick(block, avail || null); },
              };

              return (
                <g key={block.id}>
                  {block.shape === 'polygon' ? (
                    <polygon points={block.points} {...sharedProps} />
                  ) : (
                    <rect x={block.x} y={block.y} width={block.width} height={block.height} {...sharedProps} />
                  )}

                  {(isHovered || isSelected) && block.labelX != null && (
                    <foreignObject
                      x={block.labelX - 44} y={block.labelY - 14}
                      width="88" height="20"
                      style={{ pointerEvents: 'none', overflow: 'visible' }}
                    >
                      <div style={{
                        background: 'rgba(0,0,0,0.78)', color: '#fff',
                        fontSize: 9, fontWeight: 700, borderRadius: 3,
                        padding: '2px 5px', textAlign: 'center', whiteSpace: 'nowrap',
                        lineHeight: 1.4,
                      }}>
                        {block.roomNumber}
                      </div>
                    </foreignObject>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Zoom hint */}
      <div style={{ position: 'absolute', bottom: 8, right: 8, fontSize: 10, color: '#64748b',
                    background: 'rgba(255,255,255,0.8)', borderRadius: 4, padding: '2px 6px', pointerEvents: 'none' }}>
        Scroll to zoom · Drag to pan
      </div>
    </div>
  );
}

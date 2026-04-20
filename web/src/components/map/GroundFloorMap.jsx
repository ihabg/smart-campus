import React, { useState, useEffect } from 'react';
import './GroundFloorMap.css';

// ─── Room data based on the actual An-Najah Ground Floor map ─────
const GROUND_FLOOR_ROOMS = [
  // ── Top row (north side) ──────────────────────────────────────
  { id:'G0110', label:'G0110', name:'Classroom G0110', type:'classroom', x:791, y:192, w:98, h:108 },
  { id:'G0120', label:'G0120', name:'Classroom G0120', type:'classroom', x:706, y:192, w:85, h:108 },
  { id:'G0130', label:'G0130', name:'Classroom G0130', type:'classroom', x:572, y:192, w:134, h:108 },
  { id:'G0140', label:'G0140', name:'Classroom G0140', type:'classroom', x:497, y:192, w:75, h:108 },
  { id:'G0150', label:'G0150', name:'Classroom G0150', type:'classroom', x:422, y:192, w:75, h:108 },

  // ── Upper left ────────────────────────────────────────────────
  { id:'G0180', label:'G0180', name:'Room G0180',      type:'classroom', x:317, y:230, w:92, h:76 },
  { id:'G0190', label:'G0190', name:'Room G0190',      type:'classroom', x:225, y:230, w:92, h:76 },

  // ── Upper right ───────────────────────────────────────────────
  { id:'G0070', label:'G0070', name:'Room G0070',      type:'office',    x:890, y:232, w:155, h:88 },

  // ── WCs (blue) ────────────────────────────────────────────────
  { id:'WC_L1', label:'WC',    name:'Restroom (Women)',type:'restroom',  x:411, y:230, w:48,  h:35 },
  { id:'WC_L2', label:'WC',    name:'Restroom (Men)',  type:'restroom',  x:411, y:265, w:48,  h:41 },
  { id:'WC_R1', label:'WC',    name:'Restroom (Women)',type:'restroom',  x:769, y:230, w:48,  h:35 },
  { id:'WC_R2', label:'WC',    name:'Restroom (Men)',  type:'restroom',  x:769, y:265, w:48,  h:41 },

  // ── Elevators (center) ────────────────────────────────────────
  { id:'ELV_L', label:'🛗',    name:'Elevator',        type:'elevator',  x:587, y:322, w:52,  h:95 },
  { id:'ELV_R', label:'🛗',    name:'Elevator',        type:'elevator',  x:689, y:322, w:52,  h:95 },

  // ── Large left room (G0220) ───────────────────────────────────
  { id:'G0220', label:'G0220', name:'Hall G0220',      type:'lecture_hall', x:90, y:318, w:175, h:195 },

  // ── Center rooms ──────────────────────────────────────────────
  { id:'G0280', label:'G0280', name:'Room G0280',      type:'classroom', x:410, y:420, w:175, h:90 },
  { id:'G0010', label:'G0010', name:'Room G0010',      type:'classroom', x:590, y:420, w:88,  h:90 },
  { id:'G0011', label:'G0011', name:'Room G0011',      type:'classroom', x:678, y:420, w:80,  h:90 },

  // ── Bottom left row ───────────────────────────────────────────
  { id:'G0230', label:'G0230', name:'Classroom G0230', type:'classroom', x:90,  y:513, w:100, h:88 },
  { id:'G0240', label:'G0240', name:'Classroom G0240', type:'classroom', x:190, y:513, w:88,  h:88 },
  { id:'G0250', label:'G0250', name:'Classroom G0250', type:'classroom', x:278, y:513, w:88,  h:88 },
  { id:'G0260', label:'G0260', name:'Classroom G0260', type:'classroom', x:366, y:513, w:88,  h:88 },

  // ── Bottom right ──────────────────────────────────────────────
  { id:'G0040A',label:'G0040', name:'Room G0040',      type:'classroom', x:760, y:490, w:85,  h:110 },
  { id:'G0040B',label:'G0040', name:'Room G0040',      type:'classroom', x:845, y:490, w:85,  h:110 },
  { id:'G0050', label:'G0050', name:'Room G0050',      type:'classroom', x:930, y:490, w:80,  h:110 },

  // ── Amphitheater G0060 (yellow) ───────────────────────────────
  { id:'G0060', label:'G0060', name:'Engineering Amphitheater', type:'amphitheater', x:1010, y:358, w:145, h:242 },

  // ── Stairs ────────────────────────────────────────────────────
  { id:'STR_L', label:'⬆',    name:'Stairs',           type:'stairs',    x:411, y:192, w:48,  h:38  },
  { id:'STR_R', label:'⬆',    name:'Stairs',           type:'stairs',    x:769, y:192, w:48,  h:38  },
];

// ─── Color scheme matching the photo ─────────────────────────────
const ROOM_COLORS = {
  classroom:    { fill:'#f0ddd6', stroke:'#c0907a', text:'#6b3a2a', hoverFill:'#e8c8bc' },
  lecture_hall: { fill:'#f0ddd6', stroke:'#c0907a', text:'#6b3a2a', hoverFill:'#e8c8bc' },
  lab:          { fill:'#cce4f0', stroke:'#5599cc', text:'#1a4a6e', hoverFill:'#b8d8ee' },
  office:       { fill:'#f0ddd6', stroke:'#c0907a', text:'#6b3a2a', hoverFill:'#e8c8bc' },
  amphitheater: { fill:'#f5e9a0', stroke:'#c8a820', text:'#7a6010', hoverFill:'#f0dc80' },
  restroom:     { fill:'#b8d4ee', stroke:'#5588bb', text:'#1a3a5e', hoverFill:'#a0c4e0' },
  elevator:     { fill:'#b8d4ee', stroke:'#5588bb', text:'#1a3a5e', hoverFill:'#a0c4e0' },
  stairs:       { fill:'#c8d4e8', stroke:'#7a88aa', text:'#3a4a6e', hoverFill:'#b8c4d8' },
  default:      { fill:'#f0eeec', stroke:'#a0a098', text:'#444',   hoverFill:'#e0dedc' },
};

// ─── Mock real-time data (replace with real API later) ────────────
const MOCK_BOOKINGS = {
  'G0130': { booked: true,  subject: 'Computer Networks', instructor: 'Dr. Ahmad Saleh',   time: '10:00 - 11:30' },
  'G0220': { booked: true,  subject: 'Software Engineering', instructor: 'Dr. Lina Hassan', time: '09:00 - 10:30' },
  'G0010': { booked: false },
  'G0060': { booked: true,  subject: 'Engineering Mathematics', instructor: 'Dr. Mohammed Ali', time: '11:00 - 13:00' },
};

export default function GroundFloorMap({ onRoomSelect }) {
  const [selectedRoom, setSelectedRoom]  = useState(null);
  const [hoveredRoom,  setHoveredRoom]   = useState(null);
  const [bookings,     setBookings]      = useState(MOCK_BOOKINGS);
  const [adminNotes,   setAdminNotes]    = useState({});
  const [showPanel,    setShowPanel]     = useState(false);
  const [realTime,     setRealTime]      = useState(true);

  // Simulate real-time updates (replace with WebSocket/polling later)
  useEffect(() => {
    if (!realTime) return;
    const interval = setInterval(() => {
      // Future: fetch real bookings from backend
      // fetchRealTimeBookings().then(setBookings);
    }, 30000);
    return () => clearInterval(interval);
  }, [realTime]);

  const handleRoomClick = (room) => {
    setSelectedRoom(room);
    setShowPanel(true);
    if (onRoomSelect) onRoomSelect(room);
  };

  const getColor = (room) => {
    const colors = ROOM_COLORS[room.type] || ROOM_COLORS.default;
    const isHovered  = hoveredRoom?.id === room.id;
    const isSelected = selectedRoom?.id === room.id;
    const booking    = bookings[room.id];

    if (isSelected) return { fill: '#003d82', stroke: '#c9a84c', text: '#fff' };
    if (isHovered)  return { ...colors, fill: colors.hoverFill };
    return colors;
  };

  const getBookingStatus = (roomId) => bookings[roomId] || { booked: false };

  const isClickable = (room) =>
    !['restroom','elevator','stairs'].includes(room.type);

  return (
    <div className="gf-map-container">
      {/* Header */}
      <div className="gf-map-header">
        <div>
          <h2 className="gf-map-title">🏛️ Ground Floor — الطابق الأرضي</h2>
          <p className="gf-map-sub">An-Najah National University · Faculty of Engineering</p>
        </div>
        <div className="gf-map-legend">
          {[
            { color:'#f0ddd6', border:'#c0907a', label:'Classroom' },
            { color:'#f5e9a0', border:'#c8a820', label:'Amphitheater' },
            { color:'#b8d4ee', border:'#5588bb', label:'WC / Elevator' },
          ].map(l => (
            <div key={l.label} className="gf-legend-item">
              <span className="gf-legend-dot" style={{ background:l.color, borderColor:l.border }}/>
              <span>{l.label}</span>
            </div>
          ))}
          <div className="gf-legend-item">
            <span className="gf-legend-dot gf-legend-booked"/>
            <span>Booked Now</span>
          </div>
        </div>
      </div>

      <div className="gf-map-body">
        {/* SVG Map */}
        <div className="gf-svg-wrap">
          <svg
            viewBox="0 0 1200 640"
            className="gf-svg"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* ── Background ──────────────────────────────── */}
            <rect x="0" y="0" width="1200" height="640" fill="#e8ecf4" />

            {/* ── Building outline ─────────────────────────── */}
            {/* Main building floor */}
            <path
              d="M88,192 L88,601 L456,601 L456,513 L759,513 L759,601 L1010,601 L1010,358 L1160,358 L1160,192 L889,192 L889,230 L817,230 L817,192 L791,192 L791,230 L769,230 L769,192 L570,192 L570,230 L459,230 L459,192 L421,192 L421,230 L409,230 L409,192 Z"
              fill="#d8dce8" stroke="#a0a8bc" strokeWidth="2"
            />
            {/* Upper section above main */}
            <rect x="88"  y="192" width="335" height="38" fill="#d8dce8" />
            <rect x="421" y="152" width="668" height="40" fill="#e0e4f0" stroke="#a0a8bc" strokeWidth="1"/>

            {/* ── Central corridor ─────────────────────────── */}
            <rect x="409" y="310" width="380" height="110" fill="#dde2ee" stroke="none"/>

            {/* ── Gardens / courtyards ──────────────────────── */}
            {/* Left courtyard inside G0220 */}
            <rect x="118" y="348" width="110" height="120" rx="4" fill="#c8dfc0" stroke="#7aaa70" strokeWidth="1.5"/>
            <circle cx="173" cy="408" r="22" fill="#88bb70" opacity="0.7"/>
            <circle cx="150" cy="395" r="12" fill="#66aa55" opacity="0.6"/>
            <circle cx="196" cy="420" r="14" fill="#77aa60" opacity="0.6"/>

            {/* Central lobby garden left */}
            <rect x="462" y="326" width="110" height="90" rx="4" fill="#c8dfc0" stroke="#7aaa70" strokeWidth="1.5"/>
            <circle cx="517" cy="371" r="20" fill="#88bb70" opacity="0.7"/>

            {/* Central lobby garden right */}
            <rect x="750" y="326" width="100" height="90" rx="4" fill="#c8dfc0" stroke="#7aaa70" strokeWidth="1.5"/>
            <circle cx="800" cy="371" r="18" fill="#88bb70" opacity="0.7"/>

            {/* ── Entrance arrows ───────────────────────────── */}
            {/* South entrance (bottom center) */}
            <g>
              <polygon points="590,610 610,610 600,595" fill="#e05050" opacity="0.9"/>
              <polygon points="590,620 610,620 600,605" fill="#e05050" opacity="0.7"/>
              <text x="600" y="638" textAnchor="middle" fontSize="11" fill="#c03030" fontWeight="600">Entrance (North)</text>
              <text x="600" y="650" textAnchor="middle" fontSize="10" fill="#c03030">المدخل الشمالي</text>
            </g>

            {/* North entrance (top right) */}
            <g>
              <polygon points="882,170 902,170 892,185" fill="#e05050" opacity="0.9"/>
              <polygon points="882,158 902,158 892,173" fill="#e05050" opacity="0.7"/>
              <text x="892" y="152" textAnchor="middle" fontSize="11" fill="#c03030" fontWeight="600">Entrance (South)</text>
              <text x="892" y="142" textAnchor="middle" fontSize="10" fill="#c03030">المدخل الجنوبي</text>
            </g>

            {/* ── "You are here" marker ─────────────────────── */}
            <g>
              <circle cx="762" cy="380" r="12" fill="#e03030" stroke="#fff" strokeWidth="2"/>
              <text x="762" y="384" textAnchor="middle" fontSize="9" fill="#fff" fontWeight="700">YOU</text>
              <text x="762" y="400" textAnchor="middle" fontSize="9" fill="#c03030" fontWeight="600">أنت هنا</text>
            </g>

            {/* ── Render rooms ──────────────────────────────── */}
            {GROUND_FLOOR_ROOMS.map((room) => {
              const colors   = getColor(room);
              const booking  = getBookingStatus(room.id);
              const clickable= isClickable(room);
              const isSelected = selectedRoom?.id === room.id;
              const cx = room.x + room.w / 2;
              const cy = room.y + room.h / 2;
              const fontSize = room.w < 60 ? 8 : room.w < 80 ? 9 : 10;

              return (
                <g
                  key={room.id}
                  className={clickable ? 'gf-room gf-room--clickable' : 'gf-room'}
                  onClick={() => clickable && handleRoomClick(room)}
                  onMouseEnter={() => clickable && setHoveredRoom(room)}
                  onMouseLeave={() => setHoveredRoom(null)}
                >
                  <rect
                    x={room.x} y={room.y} width={room.w} height={room.h}
                    rx="3" fill={colors.fill} stroke={colors.stroke}
                    strokeWidth={isSelected ? 2.5 : 1.5}
                  />

                  {/* Booking indicator dot */}
                  {booking.booked && clickable && (
                    <circle
                      cx={room.x + room.w - 8}
                      cy={room.y + 8}
                      r={5} fill="#e03030" stroke="#fff" strokeWidth={1}
                    />
                  )}

                  {/* Room label */}
                  <text
                    x={cx} y={cy + (room.h > 60 ? -4 : 3)}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={fontSize} fontWeight="600"
                    fill={colors.text}
                    style={{ pointerEvents:'none', userSelect:'none' }}
                  >
                    {room.label}
                  </text>

                  {/* Sub-label for large rooms */}
                  {room.h > 80 && room.type === 'amphitheater' && (
                    <text
                      x={cx} y={cy + 14}
                      textAnchor="middle" fontSize="8" fill={colors.text} opacity="0.8"
                      style={{ pointerEvents:'none', userSelect:'none' }}
                    >
                      مدرج الهندسة
                    </text>
                  )}
                </g>
              );
            })}

            {/* ── North compass ────────────────────────────── */}
            <g transform="translate(1140, 80)">
              <circle cx="0" cy="0" r="22" fill="white" stroke="#888" strokeWidth="1.5"/>
              <polygon points="0,-16 -5,5 0,1 5,5" fill="#333"/>
              <text x="0" y="-18" textAnchor="middle" fontSize="11" fontWeight="700" fill="#333">N</text>
            </g>

            {/* ── Map keys (bottom) ────────────────────────── */}
            <g transform="translate(40, 595)">
              {/* You are here */}
              <circle cx="8" cy="8" r="7" fill="#e03030" stroke="#fff" strokeWidth="1.5"/>
              <text x="20" y="12" fontSize="9" fill="#444">You are here (أنت هنا)</text>

              {/* Emergency exit */}
              <rect x="0" y="22" width="16" height="12" rx="2" fill="#e05050" opacity="0.85"/>
              <text x="20" y="32" fontSize="9" fill="#444">Emergency Exit (مخرج طوارئ)</text>

              {/* Booked */}
              <circle cx="8" cy="46" r="5" fill="#e03030" stroke="#fff" strokeWidth="1.5"/>
              <text x="20" y="50" fontSize="9" fill="#444">Occupied Now</text>
            </g>

          </svg>
        </div>

        {/* ── Room Info Panel ────────────────────────────────────── */}
        {showPanel && selectedRoom && (
          <div className="gf-room-panel">
            <div className="gf-panel-header">
              <div>
                <div className="gf-panel-room-num">{selectedRoom.label}</div>
                <div className="gf-panel-room-name">{selectedRoom.name}</div>
              </div>
              <button className="gf-panel-close" onClick={() => { setShowPanel(false); setSelectedRoom(null); }}>✕</button>
            </div>

            <div className="gf-panel-body">
              {/* Type */}
              <div className="gf-panel-row">
                <span className="gf-panel-label">🏷️ Type</span>
                <span className="gf-panel-value gf-type-badge" data-type={selectedRoom.type}>
                  {selectedRoom.type.replace('_',' ')}
                </span>
              </div>

              {/* Floor */}
              <div className="gf-panel-row">
                <span className="gf-panel-label">📐 Floor</span>
                <span className="gf-panel-value">Ground Floor — الطابق الأرضي</span>
              </div>

              {/* Admin note */}
              {adminNotes[selectedRoom.id] && (
                <div className="gf-panel-note">
                  📌 {adminNotes[selectedRoom.id]}
                </div>
              )}

              {/* ── Real-time status ──────────────────────── */}
              <div className="gf-panel-divider"/>
              <div className="gf-panel-status-title">
                🔴 Real-Time Status
                <span className="gf-panel-live-badge">LIVE</span>
              </div>

              {(() => {
                const booking = getBookingStatus(selectedRoom.id);
                if (booking.booked) {
                  return (
                    <div className="gf-panel-booked">
                      <div className="gf-panel-booked-dot"/>
                      <div>
                        <div className="gf-panel-booked-label">🔴 Occupied Now</div>
                        <div className="gf-panel-booked-subject">📚 {booking.subject}</div>
                        <div className="gf-panel-booked-instructor">👨‍🏫 {booking.instructor}</div>
                        <div className="gf-panel-booked-time">⏰ {booking.time}</div>
                      </div>
                    </div>
                  );
                } else {
                  return (
                    <div className="gf-panel-free">
                      <div className="gf-panel-free-dot"/>
                      <div>
                        <div className="gf-panel-free-label">✅ Available Now</div>
                        <div className="gf-panel-free-sub">No classes scheduled at this time</div>
                      </div>
                    </div>
                  );
                }
              })()}

              {/* Coming soon note */}
              <div className="gf-panel-coming-soon">
                🚀 Real-time room booking integration coming soon
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

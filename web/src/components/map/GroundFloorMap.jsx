import React, { useState, useEffect } from 'react';
import axiosInstance from '../../api/axiosInstance';
import RoomPopup from './RoomPopup';
import { getRoomLiveData, getAllRoomsStatus } from '../../data/roomsData';
import { getRoomTypeLabel, getRoomTypeColor } from '../../utils/roomTypes';
import './GroundFloorMap.css';

const ROOMS = [
  // ── TOP ROW ───────────────────────────────────────────────────────────────
  { id:'G0190', label:'G0190', name:'Room G0190',          type:'classroom',  x:50,  y:82,  w:145, h:158 },
  { id:'G0180', label:'G0180', name:'Room G0180',          type:'classroom',  x:195, y:82,  w:145, h:158 },

  { id:'STR_L', label:'',     name:'Stairs',               type:'stairs',     x:340, y:82,  w:82,  h:52  },
  { id:'WC_L1', label:'WC',   name:'Restroom (Ladies)',    type:'restroom',   x:340, y:134, w:82,  h:53  },
  { id:'WC_L2', label:'WC',   name:'Restroom (Men)',       type:'restroom',   x:340, y:187, w:82,  h:53  },

  { id:'G0150', label:'G0150', name:'Classroom G0150',     type:'classroom',  x:422, y:82,  w:88,  h:158 },
  { id:'G0140', label:'G0140', name:'Classroom G0140',     type:'classroom',  x:510, y:82,  w:88,  h:158 },
  { id:'G0130', label:'G0130', name:'Classroom G0130',     type:'classroom',  x:598, y:82,  w:176, h:158 },
  { id:'G0120', label:'G0120', name:'Classroom G0120',     type:'classroom',  x:774, y:82,  w:88,  h:158 },

  { id:'STR_R', label:'',     name:'Stairs',               type:'stairs',     x:862, y:82,  w:82,  h:52  },
  { id:'WC_R1', label:'WC',   name:'Restroom (Ladies)',    type:'restroom',   x:862, y:134, w:82,  h:53  },
  { id:'WC_R2', label:'WC',   name:'Restroom (Men)',       type:'restroom',   x:862, y:187, w:82,  h:53  },

  { id:'G0110', label:'G0110', name:'Classroom G0110',     type:'classroom',  x:944, y:82,  w:130, h:158 },

  // ── UPPER RIGHT — G0070 (below south entrance) ────────────────────────────
  { id:'G0070', label:'G0070', name:'Room G0070',          type:'classroom',  x:1114,y:135, w:186, h:205 },

  // ── ELEVATORS ─────────────────────────────────────────────────────────────
  { id:'ELV_L', label:'Lift',  name:'Elevator',            type:'elevator',   x:622, y:276, w:70,  h:120 },
  { id:'ELV_R', label:'Lift',  name:'Elevator',            type:'elevator',   x:702, y:276, w:70,  h:120 },

  // ── LARGE LEFT HALL ───────────────────────────────────────────────────────
  { id:'G0220', label:'G0220', name:'Hall G0220',          type:'lecture_hall',x:50, y:240, w:290, h:305 },

  // ── LOWER MIDDLE ─────────────────────────────────────────────────────────
  { id:'G0280', label:'G0280', name:'Room G0280',          type:'classroom',  x:340, y:445, w:252, h:100 },
  { id:'G0010', label:'G0010', name:'Room G0010',          type:'classroom',  x:750, y:445, w:98,  h:100 },
  { id:'G0011', label:'G0011', name:'Room G0011',          type:'classroom',  x:848, y:445, w:98,  h:100 },

  // ── BOTTOM LEFT ───────────────────────────────────────────────────────────
  { id:'G0230', label:'G0230', name:'Classroom G0230',     type:'classroom',  x:50,  y:545, w:122, h:100 },
  { id:'G0240', label:'G0240', name:'Classroom G0240',     type:'classroom',  x:172, y:545, w:120, h:100 },
  { id:'G0250', label:'G0250', name:'Classroom G0250',     type:'classroom',  x:292, y:545, w:120, h:100 },
  { id:'G0260', label:'G0260', name:'Classroom G0260',     type:'classroom',  x:412, y:545, w:120, h:100 },

  // ── BOTTOM RIGHT ─────────────────────────────────────────────────────────
  { id:'G0040A', label:'G0040', name:'Room G0040',         type:'classroom',  x:1074,y:445, w:56,  h:200 },
  { id:'G0040B', label:'G0040', name:'Room G0040',         type:'classroom',  x:1130,y:445, w:56,  h:200 },
  { id:'G0050',  label:'G0050', name:'Room G0050',         type:'classroom',  x:1186,y:445, w:54,  h:200 },

  // ── AMPHITHEATER ──────────────────────────────────────────────────────────
  { id:'G0060', label:'G0060', name:'Engineering Amphitheater\nمدرج كلية الهندسة',
                               type:'amphitheater',         x:1240,y:240, w:200, h:405 },
];

const COLORS = {
  classroom:    { fill:'#f0dbd0', stroke:'#b88870', text:'#5a3020' },
  lecture_hall: { fill:'#f0dbd0', stroke:'#b88870', text:'#5a3020' },
  amphitheater: { fill:'#f5e88a', stroke:'#c8a010', text:'#5a4000' },
  restroom:     { fill:'#b4ceea', stroke:'#3a78b0', text:'#1a3858' },
  elevator:     { fill:'#b4ceea', stroke:'#3a78b0', text:'#1a3858' },
  stairs:       { fill:'#b4ceea', stroke:'#3a78b0', text:'#1a3858' },
  default:      { fill:'#ece8e4', stroke:'#9a9490', text:'#444'    },
};

const MOCK = {
  'G0130':{ booked:true,  subject:'Computer Networks',   instructor:'Dr. Ahmad Saleh',   time:'10:00–11:30' },
  'G0220':{ booked:true,  subject:'Software Engineering',instructor:'Dr. Lina Hassan',   time:'09:00–10:30' },
  'G0060':{ booked:true,  subject:'Engineering Math',    instructor:'Dr. Mohammed Ali',  time:'11:00–13:00' },
};

const CLICKABLE = ['classroom','lecture_hall','amphitheater','lab','office'];

export default function GroundFloorMap({ onRoomSelect }) {
  const [selected,    setSelected]    = useState(null);
  const [popupRoom,   setPopupRoom]   = useState(null);
  const [mockStatus,  setMockStatus]  = useState({});

  useEffect(() => {
    const refresh = () => setMockStatus(getAllRoomsStatus());
    refresh();
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, []);
  const [liveStatus, setLiveStatus] = useState({});

  useEffect(() => {
    const fetchStatus = () => {
      axiosInstance.get('/room-status/all').then(r => {
        if (r.data?.data) {
          const map = {};
          r.data.data.forEach(s => { map[s.room_id] = s; });
          setLiveStatus(map);
        }
      }).catch(() => {}); // silent fail — use mock data
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const click = (room) => {
    if (!CLICKABLE.includes(room.type)) return;
    setSelected(room);
    const liveData = getRoomLiveData(room.id);
    if (liveData) setPopupRoom(liveData);
    if (onRoomSelect) onRoomSelect(room);
  };

  const STATUS_COLORS = {
    occupied:  { fill:'#fde8e8', stroke:'#dc2626', text:'#991b1b' },
    reserved:  { fill:'#fef3c7', stroke:'#d97706', text:'#92400e' },
    available: { fill:'#e3f7ee', stroke:'#0d7a4a', text:'#065f46' },
  };

  const style = (room) => {
    if (selected?.id === room.id) return { fill:'#003d82', stroke:'#c9a84c', sw:2.5, text:'#fff' };
    if (CLICKABLE.includes(room.type) && mockStatus[room.id]) {
      const sc = STATUS_COLORS[mockStatus[room.id]];
      return { ...sc, sw:1.8 };
    }
    const c = COLORS[room.type] || COLORS.default;
    return { ...c, sw:1.5 };
  };

  const bk = (roomId) => {
    // Try live status first (by room_id UUID), fallback to mock by room code
    const live = Object.values(liveStatus).find(s => s.room_id === roomId);
    if (live) return { booked: live.is_occupied, subject: live.course_name, instructor: live.instructor_name, time: live.started_at ? new Date(live.started_at).toLocaleTimeString('en',{hour:'2-digit',minute:'2-digit'}) : '' };
    return MOCK[roomId] || { booked: false };
  };

  return (
    <div className="gf-wrap">
      <div className="gf-svg-area">
        <svg viewBox="0 55 1480 620" className="gf-svg" xmlns="http://www.w3.org/2000/svg">

          {/* ── Background ─────────────────────────────────── */}
          <rect width="1480" height="800" fill="#dde3ef"/>

          {/* ── Building shells ────────────────────────────── */}
          {/* Top-left wing (G0190/G0180 + WC block) */}
          <rect x="48"  y="80"  width="376" height="162" fill="#cdd3e0" stroke="#8892a8" strokeWidth="2"/>
          {/* Main top corridor */}
          <rect x="420" y="80"  width="608" height="162" fill="#cdd3e0" stroke="#8892a8" strokeWidth="2"/>
          {/* Right WC+G0110 block */}
          <rect x="860" y="80"  width="216" height="162" fill="#cdd3e0" stroke="#8892a8" strokeWidth="2"/>
          {/* South entrance notch gap */}
          <rect x="1074" y="80" width="42" height="57"   fill="#dde3ef"/>
          {/* G0070 block */}
          <rect x="1112" y="133" width="190" height="209" fill="#cdd3e0" stroke="#8892a8" strokeWidth="2"/>
          {/* Main body */}
          <rect x="48"  y="240" width="1196" height="407" fill="#cdd3e0" stroke="#8892a8" strokeWidth="2"/>
          {/* Amphitheater extension */}
          <rect x="1238" y="238" width="204" height="409" fill="#cdd3e0" stroke="#8892a8" strokeWidth="2"/>

          {/* ── Central lobby / corridor ────────────────────── */}
          <rect x="340" y="240" width="774" height="207" fill="#d0d6e6"/>

          {/* ── LEFT LOBBY GARDEN ──────────────────────────── */}
          <rect x="344" y="244" width="272" height="196" rx="3" fill="#bcd8a4" stroke="#6aaa50" strokeWidth="1.5"/>
          <ellipse cx="438" cy="320" rx="46" ry="36" fill="#62a040" opacity="0.80"/>
          <ellipse cx="530" cy="306" rx="28" ry="22" fill="#529830" opacity="0.72"/>
          <ellipse cx="500" cy="352" rx="22" ry="17" fill="#6aaa48" opacity="0.66"/>
          <ellipse cx="580" cy="338" rx="16" ry="12" fill="#5a9838" opacity="0.60"/>

          {/* ── RIGHT LOBBY GARDEN ─────────────────────────── */}
          <rect x="776" y="244" width="166" height="196" rx="3" fill="#bcd8a4" stroke="#6aaa50" strokeWidth="1.5"/>
          <ellipse cx="859" cy="320" rx="38" ry="30" fill="#62a040" opacity="0.80"/>
          <ellipse cx="828" cy="308" rx="20" ry="16" fill="#529830" opacity="0.70"/>
          <ellipse cx="886" cy="350" rx="17" ry="13" fill="#6aaa48" opacity="0.64"/>

          {/* ── G0220 INNER COURTYARD ──────────────────────── */}
          <rect x="84"  y="278" width="218" height="182" rx="3" fill="#bcd8a4" stroke="#6aaa50" strokeWidth="1.5"/>
          <ellipse cx="193" cy="368" rx="50" ry="40" fill="#62a040" opacity="0.78"/>
          <ellipse cx="156" cy="350" rx="24" ry="19" fill="#529830" opacity="0.68"/>
          <ellipse cx="230" cy="388" rx="20" ry="16" fill="#6aaa48" opacity="0.62"/>

          {/* ── CHECKERED FLOOR (emergency exit area) ───────── */}
          <rect x="592" y="445" width="158" height="100" fill="#c0c4d2"/>
          {Array.from({length:5}).map((_,r)=>Array.from({length:8}).map((_,c)=>
            (r+c)%2===0 && <rect key={`c${r}${c}`} x={594+c*19} y={447+r*19} width="19" height="19" fill="#aaaebc" opacity="0.7"/>
          ))}
          <text x="671" y="493" textAnchor="middle" fontSize="8.5" fill="#5a6070" fontWeight="500">Emergency Exit</text>
          <text x="671" y="505" textAnchor="middle" fontSize="8"   fill="#5a6070">مخرج طوارئ</text>

          {/* ── STAIRCASE STEP LINES ─────────────────────────── */}
          {[6,12,18,24,30,36,42,46].map(d=>(
            <line key={`sl${d}`} x1="342" y1={84+d} x2="422" y2={84+d} stroke="#8892a8" strokeWidth="0.8" opacity="0.45"/>
          ))}
          {[6,12,18,24,30,36,42,46].map(d=>(
            <line key={`sr${d}`} x1="862" y1={84+d} x2="944" y2={84+d} stroke="#8892a8" strokeWidth="0.8" opacity="0.45"/>
          ))}

          {/* ── FURNITURE IN G0190 ───────────────────────────── */}
          <rect x="56"  y="90"  width="34" height="26" rx="4" fill="#dba8a0" stroke="#c08880" strokeWidth="1"/>
          <rect x="56"  y="202" width="34" height="26" rx="4" fill="#dba8a0" stroke="#c08880" strokeWidth="1"/>
          <rect x="148" y="90"  width="26" height="34" rx="4" fill="#dba8a0" stroke="#c08880" strokeWidth="1"/>
          <rect x="148" y="198" width="26" height="30" rx="4" fill="#dba8a0" stroke="#c08880" strokeWidth="1"/>

          {/* ── FURNITURE IN G0180 ───────────────────────────── */}
          <rect x="204" y="90"  width="34" height="26" rx="4" fill="#dba8a0" stroke="#c08880" strokeWidth="1"/>
          <rect x="204" y="202" width="34" height="26" rx="4" fill="#dba8a0" stroke="#c08880" strokeWidth="1"/>
          <rect x="284" y="90"  width="26" height="32" rx="4" fill="#dba8a0" stroke="#c08880" strokeWidth="1"/>
          <rect x="284" y="196" width="26" height="32" rx="4" fill="#dba8a0" stroke="#c08880" strokeWidth="1"/>

          {/* ── FURNITURE IN G0070 ───────────────────────────── */}
          <rect x="1120" y="144" width="32" height="24" rx="4" fill="#dba8a0" stroke="#c08880" strokeWidth="1"/>
          <rect x="1266" y="144" width="28" height="32" rx="4" fill="#dba8a0" stroke="#c08880" strokeWidth="1"/>
          <rect x="1120" y="298" width="32" height="28" rx="4" fill="#dba8a0" stroke="#c08880" strokeWidth="1"/>

          {/* ── AMPHITHEATER SEAT ARCS ─────────────────────── */}
          {[0,1,2,3,4,5,6,7,8,9,10].map(i=>(
            <ellipse key={`s${i}`}
              cx={1340} cy={326+i*28}
              rx={85-i*5} ry={10}
              fill="none" stroke="#c8a010" strokeWidth="1.2" opacity="0.55"
            />
          ))}

          {/* ══ ROOMS ════════════════════════════════════════ */}
          {ROOMS.map((room) => {
            const s = style(room);
            const cx = room.x + room.w/2;
            const cy = room.y + room.h/2;
            const canClick = CLICKABLE.includes(room.type);
            const hasBk = bk(room.id).booked && canClick;
            const isSel = selected?.id === room.id;
            const fs = room.w < 66 ? 8 : room.w < 82 ? 9 : 10;
            const lines = room.label.split('\n');

            return (
              <g key={room.id}
                style={{ cursor: canClick ? 'pointer' : 'default' }}
                onClick={() => click(room)}
              >
                <rect x={room.x} y={room.y} width={room.w} height={room.h}
                  rx="2" fill={s.fill}
                  stroke={isSel ? '#c9a84c' : s.stroke}
                  strokeWidth={s.sw}
                />
                {hasBk && (
                  <circle cx={room.x+room.w-9} cy={room.y+9} r={5.5}
                    fill="#dc2626" stroke="#fff" strokeWidth="1.5"/>
                )}
                {lines.map((ln, i) => (
                  <text key={i}
                    x={cx}
                    y={lines.length > 1 ? cy - 7 + i*16 : cy}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={room.id==='G0060' ? 10 : fs}
                    fontWeight="600" fill={s.text}
                    style={{ pointerEvents:'none', userSelect:'none' }}
                  >{ln}</text>
                ))}
              </g>
            );
          })}

          {/* ── SOUTH ENTRANCE (top right) ──────────────────── */}
          <polygon points="1062,80 1076,80 1069,67" fill="#cc3030"/>
          <polygon points="1062,91 1076,91 1069,78" fill="#cc3030" opacity="0.65"/>
          <text x="1035" y="61" textAnchor="middle" fontSize="10" fill="#cc3030" fontWeight="700">Entrance</text>
          <text x="1035" y="50" textAnchor="middle" fontSize="9.5" fill="#cc3030">(المدخل الجنوبي)</text>

          {/* ── NORTH ENTRANCE (bottom center) ──────────────── */}
          <polygon points="666,658 680,658 673,645" fill="#cc3030"/>
          <polygon points="666,670 680,670 673,657" fill="#cc3030" opacity="0.65"/>
          <text x="673" y="686" textAnchor="middle" fontSize="10" fill="#cc3030" fontWeight="700">Entrance</text>
          <text x="673" y="698" textAnchor="middle" fontSize="9.5" fill="#cc3030">(المدخل الشمالي)</text>

          {/* ── NORTH COMPASS ───────────────────────────────── */}
          <g transform="translate(1432, 100)">
            <circle cx="0" cy="0" r="24" fill="white" stroke="#888" strokeWidth="1.5"/>
            <polygon points="0,-16 -5,5 0,2 5,5" fill="#222"/>
            <polygon points="0,16 -5,-5 0,-2 5,-5" fill="#aaa"/>
            <text x="0" y="-22" textAnchor="middle" fontSize="12" fontWeight="800" fill="#222">N</text>
          </g>

          {/* ── MAP KEY ─────────────────────────────────────── */}
          <g transform="translate(54,658)">
            <circle cx="7" cy="7" r="6" fill="#dc2626" stroke="#fff" strokeWidth="1.5"/>
            <text x="20" y="11" fontSize="9" fill="#555">You are here — أنت هنا</text>

            <rect x="1" y="22" width="12" height="10" rx="2" fill="#dc2626" opacity="0.82"/>
            <text x="20" y="31" fontSize="9" fill="#555">Emergency Exit — مخرج طوارئ</text>

            <rect x="1" y="40" width="12" height="10" rx="2" fill="#b4ceea" stroke="#3a78b0" strokeWidth="1"/>
            <text x="20" y="49" fontSize="9" fill="#555">W.Cs / Elevators</text>

            <rect x="1" y="57" width="12" height="10" rx="2" fill="#f5e88a" stroke="#c8a010" strokeWidth="1"/>
            <text x="20" y="66" fontSize="9" fill="#555">Amphitheater — مدرج كلية الهندسة</text>

            <rect x="1" y="74" width="12" height="10" rx="2" fill="#bcd8a4" stroke="#6aaa50" strokeWidth="1"/>
            <text x="20" y="83" fontSize="9" fill="#555">Labs — المختبرات</text>
          </g>

        </svg>
      </div>

      {/* ── INFO PANEL ────────────────────────────────────── */}
      <RoomPopup
        roomData={popupRoom}
        onClose={() => { setPopupRoom(null); setSelected(null); }}
      />

      {false && selected && (
        <div className="gf-panel">
          <div className="gf-panel-top">
            <div>
              <div className="gf-panel-num">{selected.label.split('\n')[0]}</div>
              <div className="gf-panel-name">{selected.name.split('\n')[0]}</div>
            </div>
            <button className="gf-panel-x" onClick={() => setSelected(null)}>✕</button>
          </div>
          <div className="gf-panel-rows">
            <div className="gf-panel-row"><span>🏷️ Type</span>
              <span className={`gf-type gf-type--${selected.type}`}>{selected.type.replace('_',' ')}</span>
            </div>
            <div className="gf-panel-row"><span>📐 Floor</span><span>Ground Floor — G</span></div>
            <div className="gf-panel-row"><span>🏢 Building</span><span>Faculty of Engineering</span></div>
          </div>
          <div className="gf-divider"/>
          <div className="gf-status-label">🔴 Live Status <span className="gf-live">LIVE</span></div>
          {(() => {
            const b = bk(selected.id);
            return b.booked ? (
              <div className="gf-booked">
                <div className="gf-booked-dot"/>
                <div>
                  <div className="gf-booked-title">Occupied Now</div>
                  <div className="gf-booked-sub">📚 {b.subject}</div>
                  <div className="gf-booked-sub">👨‍🏫 {b.instructor}</div>
                  <div className="gf-booked-sub">⏰ {b.time}</div>
                </div>
              </div>
            ) : (
              <div className="gf-free">
                <div className="gf-free-dot"/>
                <div>
                  <div className="gf-free-title">✅ Available Now</div>
                  <div className="gf-free-sub">No class currently scheduled</div>
                </div>
              </div>
            );
          })()}
          <div className="gf-coming">🚀 Real-time room booking integration coming soon</div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import RoomPopup from './RoomPopup';
import { getRoomLiveData, getAllRoomsStatus } from '../../data/roomsData';
import './FloorMap.css';

// ─── Third Floor — accurate layout from An-Najah photo ─────────
// White spaces = corridors/paths between separate building blocks
const ROOMS = [
  // ── TOP ROW — Blue labs (separate strip) ──────────────────────
  { id:'3150', label:'3150', name:'Lab 3150',  type:'lab', x:380, y:178, w:148, h:90 },
  { id:'3140', label:'3140', name:'Lab 3140',  type:'lab', x:528, y:178, w:120, h:90 },
  { id:'3130', label:'3130', name:'Lab 3130',  type:'lab', x:648, y:178, w:148, h:90 },

  // ── Top right — separate block (3110, 3100) ──────────────────
  { id:'3110', label:'3110', name:'Room 3110', type:'lecture_hall', x:858, y:248, w:96, h:78 },
  { id:'3100', label:'3100', name:'Room 3100', type:'lecture_hall', x:954, y:248, w:96, h:78 },
  { id:'STAIR_R', label:'',  name:'Stairs',    type:'stairs',       x:1050,y:230, w:60, h:96 },

  // ── Top WC blocks ─────────────────────────────────────────────
  { id:'WC_L', label:'WC',  name:'Restroom',   type:'restroom',     x:380, y:268, w:42, h:55 },
  { id:'WC_C', label:'WC',  name:'Restroom',   type:'restroom',     x:796, y:178, w:62, h:90 },

  // ── CENTER LOBBY (separate inner block) ──────────────────────
  // Left elevator + lobby garden + right elevator
  { id:'ELV_L', label:'🛗', name:'Elevator',   type:'elevator',     x:472, y:296, w:56, h:90 },
  { id:'ELV_R', label:'🛗', name:'Elevator',   type:'elevator',     x:660, y:296, w:56, h:90 },
  { id:'YOU',   label:'',   name:'You are here', type:'marker',     x:740, y:330, w:0,  h:0  },

  // ── 3180 (small room beside elevators) ─────────────────────────
  { id:'3180',  label:'3180', name:'Room 3180', type:'lecture_hall', x:430, y:386, w:42, h:38 },

  // ── BOTTOM LEFT WING (separate building) ─────────────────────
  { id:'3010', label:'3010', name:'Lab 3010',          type:'lab',          x:380, y:444, w:124, h:80 },
  { id:'3021', label:'3021', name:'Room 3021',         type:'lecture_hall', x:504, y:444, w:62,  h:80 },
  { id:'3020', label:'3020', name:'Room 3020',         type:'lecture_hall', x:566, y:444, w:62,  h:80 },
  { id:'3030', label:'3030', name:'Lab 3030',          type:'lab',          x:628, y:444, w:128, h:80 },

  // ── Stairwell (left of 3010) ─────────────────────────────────
  { id:'STAIR_L', label:'', name:'Stairs',     type:'stairs',     x:432, y:386, w:42, h:38 },

  // ── RIGHT WING (separate building with own courtyard) ────────
  { id:'3080', label:'3080', name:'Room 3080', type:'lecture_hall', x:1040, y:330, w:96, h:128 },

  // ── BOTTOM RIGHT ─────────────────────────────────────────────
  { id:'3060', label:'3060', name:'Lab 3060',  type:'lab', x:776, y:472, w:90,  h:90 },
  { id:'3032', label:'3032', name:'Lab 3032',  type:'lab', x:866, y:472, w:108, h:90 },
  { id:'3070', label:'3070', name:'Lab 3070',  type:'lab', x:974, y:472, w:106, h:90 },
];

const COLORS = {
  lecture_hall: { fill:'#f0dbd0', stroke:'#b88870', text:'#5a3020', label:'Lecture Hall' },
  lab:          { fill:'#9dc8e8', stroke:'#3a78b0', text:'#0a2a4e', label:'Lab' },
  office:       { fill:'#fff3cd', stroke:'#d4a017', text:'#7a5000', label:'Office' },
  restroom:     { fill:'#b4ceea', stroke:'#3a78b0', text:'#1a3858', label:'Restroom' },
  elevator:     { fill:'#b4ceea', stroke:'#3a78b0', text:'#1a3858', label:'Elevator' },
  stairs:       { fill:'#f0c8c0', stroke:'#c07060', text:'#6a3020', label:'Stairs' },
  marker:       { fill:'transparent', stroke:'transparent', text:'#000', label:'' },
  default:      { fill:'#ece8e4', stroke:'#9a9490', text:'#444',   label:'Room' },
};

const NAV_NODES = {
  entrance: { x:716, y:610, label:'Entrance / Stairs' },
  corridor: { x:716, y:434 },
  '3010':   { x:442, y:484 },
  '3021':   { x:535, y:484 },
  '3020':   { x:597, y:484 },
  '3030':   { x:692, y:484 },
  '3060':   { x:821, y:517 },
  '3032':   { x:920, y:517 },
  '3070':   { x:1027,y:517 },
  '3080':   { x:1088,y:394 },
  '3110':   { x:906, y:287 },
  '3100':   { x:1002,y:287 },
  '3130':   { x:722, y:223 },
  '3140':   { x:588, y:223 },
  '3150':   { x:454, y:223 },
};

const NAV_EDGES = [
  ['entrance','corridor'],
  ['corridor','3010'],['corridor','3021'],['corridor','3020'],['corridor','3030'],
  ['corridor','3060'],['3060','3032'],['3032','3070'],['3070','3080'],
  ['corridor','3130'],['3130','3140'],['3140','3150'],
  ['3130','3110'],['3110','3100'],['corridor','3080'],
];

function dijkstra(start, end) {
  const dist={}, prev={};
  Object.keys(NAV_NODES).forEach(n=>{dist[n]=Infinity;prev[n]=null;});
  dist[start]=0;
  const queue=[...Object.keys(NAV_NODES)];
  while(queue.length){
    queue.sort((a,b)=>dist[a]-dist[b]);
    const u=queue.shift();
    if(u===end) break;
    NAV_EDGES.forEach(([a,b])=>{
      const nb=a===u?b:b===u?a:null;
      if(!nb||!queue.includes(nb)) return;
      const d=dist[u]+Math.hypot(NAV_NODES[u].x-NAV_NODES[nb].x,NAV_NODES[u].y-NAV_NODES[nb].y);
      if(d<dist[nb]){dist[nb]=d;prev[nb]=u;}
    });
  }
  const path=[]; let cur=end;
  while(cur){path.unshift(cur);cur=prev[cur];}
  return path.length>1?path:[];
}

const CLICKABLE = ['lecture_hall','lab','office'];
const NAVIGABLE = ['3010','3020','3021','3030','3032','3060','3070','3080','3100','3110','3130','3140','3150'];

export default function FloorMap3({ onRoomSelect }) {
  const [selected,    setSelected]    = useState(null);
  const [popupRoom,   setPopupRoom]   = useState(null);
  const [hovered,     setHovered]     = useState(null);
  const [roomStatus,  setRoomStatus]  = useState({});

  useEffect(() => {
    const refresh = () => setRoomStatus(getAllRoomsStatus());
    refresh();
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, []);
  const [navFrom,  setNavFrom]  = useState('entrance');
  const [navTo,    setNavTo]    = useState('');
  const [navPath,  setNavPath]  = useState([]);
  const [showNav,  setShowNav]  = useState(false);

  const STATUS_COLORS = {
    occupied:  { fill:'#fde8e8', stroke:'#dc2626', text:'#991b1b' },
    reserved:  { fill:'#fef3c7', stroke:'#d97706', text:'#92400e' },
    available: { fill:'#e3f7ee', stroke:'#0d7a4a', text:'#065f46' },
  };

  const getStyle = (room) => {
    if (selected?.id===room.id) return { fill:'#003d82', stroke:'#c9a84c', sw:2.5, text:'#fff' };
    if (CLICKABLE.includes(room.type) && roomStatus[room.id]) {
      const sc = STATUS_COLORS[roomStatus[room.id]];
      if (hovered?.id===room.id) return { ...sc, sw:2.5 };
      return { ...sc, sw:1.8 };
    }
    const c = COLORS[room.type] || COLORS.default;
    if (hovered?.id===room.id && CLICKABLE.includes(room.type)) return { ...c, sw:2 };
    return { ...c, sw:1.5 };
  };

  const handleClick = (room) => {
    if (!CLICKABLE.includes(room.type)) return;
    setSelected(room);
    const liveData = getRoomLiveData(room.id);
    if (liveData) setPopupRoom(liveData);
    if (onRoomSelect) onRoomSelect(room);
  };

  const findPath = () => {
    if (!navTo) return;
    setNavPath(dijkstra(navFrom, navTo));
  };

  const buildSvgPath = () => {
    if (navPath.length < 2) return null;
    return navPath.map((n,i)=>`${i===0?'M':'L'}${NAV_NODES[n].x},${NAV_NODES[n].y}`).join(' ');
  };

  return (
    <div className="fm-wrap">
      {/* Floating Nav Panel */}
      <div className="fm-nav-float">
        <div className="fm-nav-float-header" onClick={()=>setShowNav(v=>!v)}>
          <span>↗ Navigate</span>
          <span style={{fontSize:11,opacity:.7}}>{showNav?'▲':'▼'}</span>
        </div>
        {showNav && (
          <div className="fm-nav-float-body">
            <div className="form-group">
              <label className="form-label" style={{fontSize:11}}>From</label>
              <select className="form-input" style={{fontSize:12,padding:'4px 8px'}}
                value={navFrom} onChange={e=>setNavFrom(e.target.value)}>
                <option value="entrance">🚪 Entrance / Stairs</option>
                {NAVIGABLE.map(r=><option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="form-group" style={{marginTop:8}}>
              <label className="form-label" style={{fontSize:11}}>To</label>
              <select className="form-input" style={{fontSize:12,padding:'4px 8px'}}
                value={navTo} onChange={e=>setNavTo(e.target.value)}>
                <option value="">Select destination...</option>
                {NAVIGABLE.map(r=><option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div style={{display:'flex',gap:6,marginTop:8}}>
              <button className="btn btn--primary" style={{flex:1,fontSize:12,padding:'6px 8px'}}
                onClick={findPath} disabled={!navTo}>🗺️ Find Path</button>
              <button className="btn btn--secondary" style={{fontSize:12,padding:'6px 8px'}}
                onClick={()=>{setNavPath([]);setNavTo('');}}>Clear</button>
            </div>
          </div>
        )}
      </div>

      {/* SVG Map */}
      <div className="fm-svg-area">
        <svg viewBox="130 140 1020 510" className="fm-svg" xmlns="http://www.w3.org/2000/svg">
          <rect x="0" y="0" width="1300" height="700" fill="#f0f2f8"/>

          {/* ── Left wing under construction (separate building) ─── */}
          <rect x="148" y="240" width="220" height="280" fill="#e4e0d8" stroke="#8892a8" strokeWidth="1.5" strokeDasharray="6,3"/>
          <line x1="148" y1="240" x2="368" y2="520" stroke="#c0b8a8" strokeWidth="1.2" opacity="0.5"/>
          <line x1="368" y1="240" x2="148" y2="520" stroke="#c0b8a8" strokeWidth="1.2" opacity="0.5"/>
          <text x="258" y="392" textAnchor="middle" fontSize="11" fill="#888" opacity="0.7">Under Construction</text>

          {/* ══════════════════════════════════════════════════════
               BUILDING 1 — TOP STRIP (3150, 3140, 3130 + WC)
              ══════════════════════════════════════════════════════ */}
          <rect x="378" y="176" width="482" height="92" fill="#dde3ef" stroke="#8892a8" strokeWidth="1.5"/>

          {/* ── WHITE GAP between top strip and center building ── */}

          {/* ══════════════════════════════════════════════════════
               BUILDING 2 — CENTER (lobby with garden + elevators)
              ══════════════════════════════════════════════════════ */}
          <rect x="378" y="290" width="380" height="142" fill="#dde3ef" stroke="#8892a8" strokeWidth="1.5"/>

          {/* Center lobby garden (pink/peach floor with green plant) */}
          <rect x="528" y="304" width="132" height="86" rx="3" fill="#f0d8c8" stroke="#c89878" strokeWidth="1.3"/>
          <ellipse cx="594" cy="345" rx="22" ry="18" fill="#6aaa48" opacity="0.85"/>
          <ellipse cx="578" cy="338" rx="11" ry="9"  fill="#58984a" opacity="0.7"/>

          {/* Stair lines on elevators */}
          {[0,1,2,3,4,5].map(i=>(
            <line key={`sl${i}`} x1="472" y1={302+i*14} x2="528" y2={302+i*14} stroke="#8892a8" strokeWidth="0.6" opacity="0.5"/>
          ))}
          {[0,1,2,3,4,5].map(i=>(
            <line key={`sr${i}`} x1="660" y1={302+i*14} x2="716" y2={302+i*14} stroke="#8892a8" strokeWidth="0.6" opacity="0.5"/>
          ))}

          {/* ══════════════════════════════════════════════════════
               BUILDING 3 — TOP RIGHT (3110, 3100 + stairs)
              ══════════════════════════════════════════════════════ */}
          <rect x="856" y="246" width="256" height="82" fill="#dde3ef" stroke="#8892a8" strokeWidth="1.5"/>

          {/* ══════════════════════════════════════════════════════
               BUILDING 4 — BOTTOM LEFT (3010, 3021, 3020, 3030)
              ══════════════════════════════════════════════════════ */}
          <rect x="378" y="442" width="380" height="84" fill="#dde3ef" stroke="#8892a8" strokeWidth="1.5"/>

          {/* ── WHITE GAP between left bottom and right wing ── */}

          {/* ══════════════════════════════════════════════════════
               BUILDING 5 — RIGHT WING (own courtyard with garden)
              ══════════════════════════════════════════════════════ */}
          <rect x="774" y="330" width="362" height="240" fill="#dde3ef" stroke="#8892a8" strokeWidth="1.5"/>

          {/* Right wing inner courtyard with garden */}
          <rect x="838" y="346" width="186" height="118" rx="3" fill="#f0d8c8" stroke="#c89878" strokeWidth="1.3" strokeDasharray="3,2"/>
          <ellipse cx="930" cy="404" rx="28" ry="22" fill="#6aaa48" opacity="0.85"/>
          <ellipse cx="908" cy="394" rx="13" ry="10" fill="#58984a" opacity="0.7"/>

          {/* ── Connecting corridor (small bridges) ── */}
          <rect x="756" y="346" width="20" height="68" fill="#dde3ef" stroke="#8892a8" strokeWidth="1"/>

          {/* You are here marker */}
          <g>
            <circle cx="755" cy="330" r="9" fill="#dc2626" stroke="#fff" strokeWidth="2"/>
            <text x="755" y="328" textAnchor="middle" fontSize="6" fill="#fff" fontWeight="800" dy="1">YOU</text>
            <text x="755" y="335" textAnchor="middle" fontSize="6" fill="#fff">هنا</text>
          </g>

          {/* ── ROOMS ───────────────────────────────────────────── */}
          {ROOMS.map(room => {
            if (room.type==='marker') return null;
            const s = getStyle(room);
            const cx = room.x+room.w/2;
            const cy = room.y+room.h/2;
            const canClick = CLICKABLE.includes(room.type);
            const isNav = navPath.includes(room.id);
            const fs = room.w<70?7.5:room.w<100?9:10;

            return (
              <g key={room.id}
                style={{cursor:canClick?'pointer':'default'}}
                onClick={()=>handleClick(room)}
                onMouseEnter={()=>canClick&&setHovered(room)}
                onMouseLeave={()=>setHovered(null)}
              >
                <rect x={room.x} y={room.y} width={room.w} height={room.h} rx="1.5"
                  fill={isNav?'#e8f4ff':s.fill}
                  stroke={isNav?'#003d82':selected?.id===room.id?'#c9a84c':s.stroke}
                  strokeWidth={isNav?2.5:s.sw}/>
                <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
                  fontSize={fs} fontWeight="600" fill={isNav?'#003d82':s.text}
                  style={{pointerEvents:'none',userSelect:'none'}}>{room.label}</text>
                {hovered?.id===room.id && (
                  <g>
                    <rect x={cx-52} y={room.y-26} width="104" height="20" rx="4" fill="#003d82" opacity="0.92"/>
                    <text x={cx} y={room.y-12} textAnchor="middle" fontSize="10" fontWeight="600" fill="#fff" style={{pointerEvents:'none'}}>
                      {COLORS[room.type]?.label||room.type}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Nav path */}
          {navPath.length > 1 && (
            <g>
              <path d={buildSvgPath()} fill="none" stroke="#003d82"
                strokeWidth="4" strokeDasharray="10,6" strokeLinecap="round" opacity="0.85">
                <animate attributeName="stroke-dashoffset" from="0" to="-32" dur="1s" repeatCount="indefinite"/>
              </path>
              <circle cx={NAV_NODES[navFrom].x} cy={NAV_NODES[navFrom].y} r="10" fill="#0d7a4a" stroke="#fff" strokeWidth="2"/>
              <text x={NAV_NODES[navFrom].x} y={NAV_NODES[navFrom].y+1} textAnchor="middle" dominantBaseline="middle" fontSize="10" fontWeight="800" fill="#fff" style={{pointerEvents:'none'}}>A</text>
              <circle cx={NAV_NODES[navTo]?.x} cy={NAV_NODES[navTo]?.y} r="10" fill="#dc2626" stroke="#fff" strokeWidth="2"/>
              <text x={NAV_NODES[navTo]?.x} y={NAV_NODES[navTo]?.y+1} textAnchor="middle" dominantBaseline="middle" fontSize="10" fontWeight="800" fill="#fff" style={{pointerEvents:'none'}}>B</text>
            </g>
          )}

          {/* Compass */}
          <g transform="translate(1090,165)">
            <circle cx="0" cy="0" r="20" fill="white" stroke="#888" strokeWidth="1.5"/>
            <polygon points="0,-13 -4,4 0,2 4,4" fill="#222"/>
            <polygon points="0,13 -4,-4 0,-2 4,-4" fill="#bbb"/>
            <text x="0" y="-17" textAnchor="middle" fontSize="11" fontWeight="800" fill="#222">N</text>
          </g>

          {/* Legend */}
          <g transform="translate(148,580)">
            {[
              {color:'#9dc8e8',stroke:'#3a78b0',label:'Lab'},
              {color:'#f0dbd0',stroke:'#b88870',label:'Lecture Hall'},
              {color:'#b4ceea',stroke:'#3a78b0',label:'WC / Elevator'},
              {color:'#f0d8c8',stroke:'#c89878',label:'Garden / Courtyard'},
              {color:'#e4e0d8',stroke:'#b0a898',label:'Under Construction',dash:true},
            ].map((l,i)=>(
              <g key={l.label} transform={`translate(${i*145},0)`}>
                <rect x="0" y="-7" width="13" height="13" rx="2"
                  fill={l.color} stroke={l.stroke} strokeWidth="1"
                  strokeDasharray={l.dash?'3,2':'none'}/>
                <text x="18" y="3" fontSize="9" fill="#555">{l.label}</text>
              </g>
            ))}
          </g>
        </svg>
      </div>

      {/* Room Popup Modal */}
      <RoomPopup
        roomData={popupRoom}
        onClose={() => { setPopupRoom(null); setSelected(null); }}
        onNavigate={(r) => { setNavTo(r.number); setShowNav(true); setPopupRoom(null); }}
      />

      {false && selected && (
        <div className="fm-panel">
          <div className="fm-panel-top">
            <div>
              <div className="fm-panel-num">{selected.label}</div>
              <div className="fm-panel-name">{selected.name}</div>
            </div>
            <button className="fm-panel-x" onClick={()=>setSelected(null)}>✕</button>
          </div>
          <div className="fm-panel-rows">
            <div className="fm-panel-row"><span>🏷️ Type</span>
              <span className={`gf-type gf-type--${selected.type}`}>{COLORS[selected.type]?.label||selected.type}</span>
            </div>
            <div className="fm-panel-row"><span>📐 Floor</span><span>Third Floor — 3</span></div>
            <div className="fm-panel-row"><span>🏢 Building</span><span>Faculty of Engineering</span></div>
          </div>
          <div className="gf-divider"/>
          <div className="gf-status-label">🔴 Live Status <span className="gf-live">LIVE</span></div>
          <div className="gf-free">
            <div className="gf-free-dot"/>
            <div>
              <div className="gf-free-title">✅ Available Now</div>
              <div className="gf-free-sub">No class currently scheduled</div>
            </div>
          </div>
          <div style={{padding:'0 12px 12px'}}>
            <button className="btn btn--primary btn--sm" style={{width:'100%',marginTop:8}}
              onClick={()=>{setNavTo(selected.id);setShowNav(true);}}>
              ↗ Navigate Here
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

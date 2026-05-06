import React, { useState, useEffect } from 'react';
import RoomPopup from './RoomPopup';
import { getRoomLiveData, getAllRoomsStatus } from '../../data/roomsData';
import './FloorMap.css';

// ── Rooms traced from real An-Najah Fourth Floor photo ─────────
const ROOMS = [
  // Top center — Steel Structure Design Center (large green lab)
  { id:'SSDC', label:'Steel Structure\nDesign Center', name:'Steel Structure Design Center\nمركز تصميم المنشآت المعدنية', type:'lab',          x:740, y:158, w:265, h:140 },

  // Pink seating / lounge top right
  { id:'CHAIR', label:'',   name:'Seating Area',            type:'lounge',     x:1005, y:158, w:85,  h:100 },

  // 4080 — right of SSDC, tall
  { id:'4080',  label:'4080', name:'Lecture Hall 4080',     type:'lecture_hall',x:1005, y:158, w:130, h:140 },

  // Center open courtyard with garden
  { id:'COURT', label:'',   name:'Open Courtyard',          type:'open',       x:740,  y:298, w:175, h:130 },

  // Elevator block (blue, center right)
  { id:'ELV',  label:'🛗',  name:'Elevator — المصعد',       type:'elevator',   x:915,  y:298, w:60,  h:130 },

  // WC blocks (blue, right of elevator)
  { id:'WC_W', label:'WC',  name:'Restroom (Women) — دورات صحية',type:'restroom', x:975, y:298, w:60,  h:65  },
  { id:'WC_M', label:'WC',  name:'Restroom (Men) — دورات صحية',  type:'restroom', x:975, y:363, w:60,  h:65  },

  // 4070 — far right, middle
  { id:'4070',  label:'4070', name:'Lecture Hall 4070',     type:'lecture_hall',x:1035, y:298, w:100, h:130 },

  // Bottom row — 4030 4040 4050 4060
  { id:'4030',  label:'4030', name:'Lecture Hall 4030',     type:'lecture_hall',x:740,  y:428, w:115, h:100 },
  { id:'4040',  label:'4040', name:'Lecture Hall 4040',     type:'lecture_hall',x:855,  y:428, w:115, h:100 },
  { id:'4050',  label:'4050', name:'Lecture Hall 4050',     type:'lecture_hall',x:970,  y:428, w:115, h:100 },
  { id:'4060',  label:'4060', name:'Lab 4060',              type:'lab',         x:1085, y:428, w:100, h:100 },
];

const COLORS = {
  lecture_hall: { fill:'#f0dbd0', stroke:'#b88870', text:'#5a3020', label:'Lecture Hall' },
  lab:          { fill:'#cce8d0', stroke:'#48985a', text:'#1a4a28', label:'Lab' },
  office:       { fill:'#fff3cd', stroke:'#d4a017', text:'#7a5000', label:'Office' },
  restroom:     { fill:'#b4ceea', stroke:'#3a78b0', text:'#1a3858', label:'Restroom' },
  elevator:     { fill:'#b4ceea', stroke:'#3a78b0', text:'#1a3858', label:'Elevator' },
  lounge:       { fill:'#f0c8c0', stroke:'#c07060', text:'#6a3020', label:'Seating' },
  open:         { fill:'#bcd8a4', stroke:'#6aaa50', text:'#2a5a20', label:'Garden' },
  default:      { fill:'#ece8e4', stroke:'#9a9490', text:'#444',   label:'Room' },
};

// ── Navigation graph ───────────────────────────────────────────
const NAV_NODES = {
  entrance: { x:915, y:560, label:'Entrance / Stairs' },
  corridor: { x:915, y:428 },
  '4030':   { x:797, y:478 },
  '4040':   { x:912, y:478 },
  '4050':   { x:1027,y:478 },
  '4060':   { x:1135,y:478 },
  '4070':   { x:1085,y:363 },
  '4080':   { x:1070,y:228 },
  'SSDC':   { x:872, y:228 },
};

const NAV_EDGES = [
  ['entrance','corridor'],
  ['corridor','4030'],['corridor','4040'],['corridor','4050'],['corridor','4060'],
  ['corridor','4070'],['4070','4080'],['4070','SSDC'],
  ['corridor','SSDC'],
];

function dijkstra(start, end) {
  const dist={}, prev={};
  Object.keys(NAV_NODES).forEach(n => { dist[n]=Infinity; prev[n]=null; });
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

const CLICKABLE    = ['lecture_hall','lab','office','restroom'];
const NAVIGABLE    = ['4030','4040','4050','4060','4070','4080','SSDC'];

export default function FloorMap4({ onRoomSelect }) {
  const [selected,    setSelected]    = useState(null);
  const [popupRoom,   setPopupRoom]   = useState(null);
  const [hovered,     setHovered]     = useState(null);
  const [roomStatus,  setRoomStatus]  = useState({});

  // Load live status of all rooms (refresh every 30s)
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
    // Use status color if room has live data
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
    return navPath.map((n,i) => `${i===0?'M':'L'}${NAV_NODES[n].x},${NAV_NODES[n].y}`).join(' ');
  };

  return (
    <div className="fm-wrap">
      {/* ── Floating Navigate Panel ───────────────────── */}
      <div className="fm-nav-float">
        <div className="fm-nav-float-header" onClick={() => setShowNav(v=>!v)}>
          <span>↗ Navigate</span>
          <span style={{fontSize:11,opacity:.7}}>{showNav ? '▲' : '▼'}</span>
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
                onClick={findPath} disabled={!navTo}>
                🗺️ Find Path
              </button>
              <button className="btn btn--secondary" style={{fontSize:12,padding:'6px 8px'}}
                onClick={()=>{setNavPath([]);setNavTo('');}}>
                Clear
              </button>
            </div>
            {navPath.length > 1 && (
              <div style={{marginTop:8,background:'var(--green-bg)',border:'1px solid var(--green-border)',borderRadius:'var(--r-md)',padding:'8px 10px'}}>
                <div style={{fontSize:11,fontWeight:600,color:'var(--green)',marginBottom:4}}>✅ Route found:</div>
                <div style={{fontSize:11,color:'var(--text-muted)'}}>
                  {navPath.map((n,i)=>(
                    <span key={n}>{i>0&&' → '}<strong style={{color:'var(--navy)'}}>{NAV_NODES[n]?.label||n}</strong></span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── SVG Map ───────────────────────────────────── */}
      <div className="fm-svg-area">
        <svg viewBox="130 130 1020 470" className="fm-svg" xmlns="http://www.w3.org/2000/svg">

          {/* Background */}
          <rect x="0" y="0" width="1300" height="700" fill="#dde3ef"/>

          {/* Left wing outlines — under construction */}
          <rect x="148" y="158" width="250" height="270" fill="#e4e0d8" stroke="#b0a898" strokeWidth="1.5" strokeDasharray="6,3"/>
          <line x1="148" y1="158" x2="398" y2="428" stroke="#c0b8a8" strokeWidth="1.5" opacity="0.5"/>
          <line x1="398" y1="158" x2="148" y2="428" stroke="#c0b8a8" strokeWidth="1.5" opacity="0.5"/>

          <rect x="418" y="158" width="300" height="295" fill="#e4e0d8" stroke="#b0a898" strokeWidth="1.5" strokeDasharray="6,3"/>
          <line x1="418" y1="158" x2="718" y2="453" stroke="#c0b8a8" strokeWidth="1.5" opacity="0.5"/>
          <line x1="718" y1="158" x2="418" y2="453" stroke="#c0b8a8" strokeWidth="1.5" opacity="0.5"/>

          {/* Main building shell */}
          <rect x="738" y="155" width="455" height="375" fill="#cdd3e0" stroke="#8892a8" strokeWidth="2"/>

          {/* Garden/courtyard */}
          <rect x="742" y="300" width="171" height="126" rx="4" fill="#bcd8a4" stroke="#6aaa50" strokeWidth="1.5"/>
          <ellipse cx="827" cy="363" rx="36" ry="28" fill="#6aaa48" opacity="0.8"/>
          <ellipse cx="798" cy="350" rx="18" ry="14" fill="#58984a" opacity="0.7"/>
          <ellipse cx="855" cy="378" rx="15" ry="12" fill="#70b050" opacity="0.65"/>

          {/* Stair lines on elevator */}
          {[0,1,2,3,4,5,6,7,8,9].map(i=>(
            <line key={i} x1="915" y1={300+i*13} x2="975" y2={300+i*13}
              stroke="#8892a8" strokeWidth="0.8" opacity="0.4"/>
          ))}

          {/* ── Rooms ──────────────────────────────────── */}
          {ROOMS.map(room => {
            if (room.type==='open') return null;
            const s = getStyle(room);
            const cx = room.x+room.w/2;
            const cy = room.y+room.h/2;
            const canClick = CLICKABLE.includes(room.type);
            const isNav = navPath.includes(room.id);
            const lines = room.label.split('\n');
            const fs = room.w<80?8:room.w<110?9:10;

            return (
              <g key={room.id}
                style={{cursor:canClick?'pointer':'default'}}
                onClick={()=>handleClick(room)}
                onMouseEnter={()=>canClick&&setHovered(room)}
                onMouseLeave={()=>setHovered(null)}
              >
                <rect x={room.x} y={room.y} width={room.w} height={room.h} rx="2"
                  fill={isNav?'#e8f4ff':s.fill}
                  stroke={isNav?'#003d82':selected?.id===room.id?'#c9a84c':s.stroke}
                  strokeWidth={isNav?2.5:s.sw}
                />
                {lines.map((ln,i)=>(
                  <text key={i} x={cx} y={lines.length>1?cy-6+i*14:cy}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={fs} fontWeight="600" fill={isNav?'#003d82':s.text}
                    style={{pointerEvents:'none',userSelect:'none'}}
                  >{ln}</text>
                ))}
                {hovered?.id===room.id && (
                  <g>
                    <rect x={cx-52} y={room.y-28} width="104" height="22" rx="4" fill="#003d82" opacity="0.92"/>
                    <text x={cx} y={room.y-13} textAnchor="middle" fontSize="10" fontWeight="600" fill="#fff" style={{pointerEvents:'none'}}>
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
                strokeWidth="4" strokeDasharray="10,6" strokeLinecap="round" opacity="0.8">
                <animate attributeName="stroke-dashoffset" from="0" to="-32" dur="1s" repeatCount="indefinite"/>
              </path>
              <circle cx={NAV_NODES[navFrom].x} cy={NAV_NODES[navFrom].y} r="10" fill="#0d7a4a" stroke="#fff" strokeWidth="2"/>
              <text x={NAV_NODES[navFrom].x} y={NAV_NODES[navFrom].y+1} textAnchor="middle" dominantBaseline="middle" fontSize="10" fontWeight="800" fill="#fff" style={{pointerEvents:'none'}}>A</text>
              <circle cx={NAV_NODES[navTo].x} cy={NAV_NODES[navTo].y} r="10" fill="#dc2626" stroke="#fff" strokeWidth="2"/>
              <text x={NAV_NODES[navTo].x} y={NAV_NODES[navTo].y+1} textAnchor="middle" dominantBaseline="middle" fontSize="10" fontWeight="800" fill="#fff" style={{pointerEvents:'none'}}>B</text>
            </g>
          )}

          {/* Entrance arrow */}
          <polygon points="905,555 925,555 915,542" fill="#cc3030"/>
          <polygon points="905,567 925,567 915,554" fill="#cc3030" opacity="0.65"/>
          <text x="915" y="582" textAnchor="middle" fontSize="10" fill="#cc3030" fontWeight="700">Entrance</text>
          <text x="915" y="593" textAnchor="middle" fontSize="9" fill="#cc3030">المدخل</text>

          {/* Compass */}
          <g transform="translate(1125,160)">
            <circle cx="0" cy="0" r="20" fill="white" stroke="#888" strokeWidth="1.5"/>
            <polygon points="0,-13 -4,4 0,2 4,4" fill="#222"/>
            <polygon points="0,13 -4,-4 0,-2 4,-4" fill="#bbb"/>
            <text x="0" y="-17" textAnchor="middle" fontSize="11" fontWeight="800" fill="#222">N</text>
          </g>

          {/* Legend */}
          <g transform="translate(148,460)">
            {[
              {color:'#f0dbd0',stroke:'#b88870',label:'Lecture Hall'},
              {color:'#cce8d0',stroke:'#48985a',label:'Lab'},
              {color:'#b4ceea',stroke:'#3a78b0',label:'WC / Elevator'},
              {color:'#bcd8a4',stroke:'#6aaa50',label:'Garden'},
              {color:'#e4e0d8',stroke:'#b0a898',label:'Under Construction',dash:true},
            ].map((l,i)=>(
              <g key={l.label} transform={`translate(0,${i*18})`}>
                <rect x="0" y="-7" width="13" height="13" rx="2"
                  fill={l.color} stroke={l.stroke} strokeWidth="1"
                  strokeDasharray={l.dash?'3,2':'none'}/>
                <text x="18" y="3" fontSize="9" fill="#555">{l.label}</text>
              </g>
            ))}
          </g>
        </svg>
      </div>

      {/* ── Modern Room Popup ──────────────────────────── */}
      <RoomPopup
        roomData={popupRoom}
        onClose={() => { setPopupRoom(null); setSelected(null); }}
        onNavigate={(r) => { setNavTo(r.number); setShowNav(true); setPopupRoom(null); }}
      />

      {/* Old side panel (now hidden — popup replaces it) */}
      {false && selected && (
        <div className="fm-panel">
          <div className="fm-panel-top">
            <div>
              <div className="fm-panel-num">{selected.label.split('\n')[0]}</div>
              <div className="fm-panel-name">{selected.name.split('\n')[0]}</div>
            </div>
            <button className="fm-panel-x" onClick={()=>setSelected(null)}>✕</button>
          </div>
          <div className="fm-panel-rows">
            <div className="fm-panel-row"><span>🏷️ Type</span>
              <span className={`gf-type gf-type--${selected.type}`}>{COLORS[selected.type]?.label||selected.type}</span>
            </div>
            <div className="fm-panel-row"><span>📐 Floor</span><span>Fourth Floor — 4</span></div>
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
          <div className="gf-coming">🚀 Real-time booking integration coming soon</div>
        </div>
      )}
    </div>
  );
}

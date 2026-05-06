import React, { useState } from 'react';
import GroundFloorMap from '../components/map/GroundFloorMap';
import FloorMap4      from '../components/map/FloorMap4';
import FloorMap3      from '../components/map/FloorMap3';
import './MapPage.css';

const FLOORS = [
  { id:'B2', label:'B2', desc:'Basement 2 — الطابق السفلي 2',  available:false },
  { id:'B1', label:'B1', desc:'Basement 1 — الطابق السفلي 1',  available:false },
  { id:'G',  label:'G',  desc:'Ground Floor — الطابق الأرضي',  available:true  },
  { id:'1',  label:'1',  desc:'Floor 1 — الطابق الأول',         available:false },
  { id:'2',  label:'2',  desc:'Floor 2 — الطابق الثاني',        available:false },
  { id:'3',  label:'3',  desc:'Third Floor — الطابق الثالث',    available:true  },
  { id:'4',  label:'4',  desc:'Fourth Floor — الطابق الرابع',   available:true  },
];

// All rooms across all floors for global navigation
const ALL_ROOMS = {
  G: [
    { id:'G0110', label:'G0110 — Classroom', floor:'G', floorLabel:'Ground Floor' },
    { id:'G0120', label:'G0120 — Classroom', floor:'G', floorLabel:'Ground Floor' },
    { id:'G0130', label:'G0130 — Classroom', floor:'G', floorLabel:'Ground Floor' },
    { id:'G0140', label:'G0140 — Classroom', floor:'G', floorLabel:'Ground Floor' },
    { id:'G0150', label:'G0150 — Classroom', floor:'G', floorLabel:'Ground Floor' },
    { id:'G0180', label:'G0180 — Room',      floor:'G', floorLabel:'Ground Floor' },
    { id:'G0190', label:'G0190 — Room',      floor:'G', floorLabel:'Ground Floor' },
    { id:'G0070', label:'G0070 — Room',      floor:'G', floorLabel:'Ground Floor' },
    { id:'G0220', label:'G0220 — Hall',      floor:'G', floorLabel:'Ground Floor' },
    { id:'G0280', label:'G0280 — Room',      floor:'G', floorLabel:'Ground Floor' },
    { id:'G0010', label:'G0010 — Room',      floor:'G', floorLabel:'Ground Floor' },
    { id:'G0011', label:'G0011 — Room',      floor:'G', floorLabel:'Ground Floor' },
    { id:'G0230', label:'G0230 — Classroom', floor:'G', floorLabel:'Ground Floor' },
    { id:'G0240', label:'G0240 — Classroom', floor:'G', floorLabel:'Ground Floor' },
    { id:'G0250', label:'G0250 — Classroom', floor:'G', floorLabel:'Ground Floor' },
    { id:'G0260', label:'G0260 — Classroom', floor:'G', floorLabel:'Ground Floor' },
    { id:'G0040A',label:'G0040 — Room',      floor:'G', floorLabel:'Ground Floor' },
    { id:'G0050', label:'G0050 — Room',      floor:'G', floorLabel:'Ground Floor' },
    { id:'G0060', label:'G0060 — Amphitheater', floor:'G', floorLabel:'Ground Floor' },
  ],
  '4': [
    { id:'4030', label:'4030 — Lecture Hall',  floor:'4', floorLabel:'Fourth Floor' },
    { id:'4040', label:'4040 — Lecture Hall',  floor:'4', floorLabel:'Fourth Floor' },
    { id:'4050', label:'4050 — Lecture Hall',  floor:'4', floorLabel:'Fourth Floor' },
    { id:'4060', label:'4060 — Lab',           floor:'4', floorLabel:'Fourth Floor' },
    { id:'4070', label:'4070 — Lecture Hall',  floor:'4', floorLabel:'Fourth Floor' },
    { id:'4080', label:'4080 — Lecture Hall',  floor:'4', floorLabel:'Fourth Floor' },
    { id:'SSDC', label:'Steel Structure Design Center', floor:'4', floorLabel:'Fourth Floor' },
  ],
};

const FLAT_ROOMS = Object.values(ALL_ROOMS).flat();

export default function MapPage() {
  const [activeFloor,  setActiveFloor]  = useState('G');
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [showNav,      setShowNav]      = useState(false);
  const [navFrom,      setNavFrom]      = useState('');
  const [navTo,        setNavTo]        = useState('');
  const [navResult,    setNavResult]    = useState(null);
  const [fromSearch,   setFromSearch]   = useState('');
  const [toSearch,     setToSearch]     = useState('');

  const filteredFrom = FLAT_ROOMS.filter(r =>
    r.label.toLowerCase().includes(fromSearch.toLowerCase()) ||
    r.floorLabel.toLowerCase().includes(fromSearch.toLowerCase())
  );

  const filteredTo = FLAT_ROOMS.filter(r =>
    r.label.toLowerCase().includes(toSearch.toLowerCase()) ||
    r.floorLabel.toLowerCase().includes(toSearch.toLowerCase())
  );

  const handleNavigate = () => {
    if (!navFrom || !navTo) return;
    const from = FLAT_ROOMS.find(r => r.id === navFrom);
    const to   = FLAT_ROOMS.find(r => r.id === navTo);
    if (!from || !to) return;

    if (from.floor === to.floor) {
      // Same floor — switch to that floor
      setActiveFloor(from.floor);
      setNavResult({ type:'same', from, to, message:`Navigate on ${from.floorLabel}` });
    } else {
      // Different floors — show step by step
      setNavResult({
        type:'cross',
        from, to,
        steps: [
          `📍 Start at ${from.label} on ${from.floorLabel}`,
          `🛗 Go to the elevator or stairs`,
          `🔢 Go to ${to.floorLabel}`,
          `📍 Arrive at ${to.label}`,
        ]
      });
      setActiveFloor(from.floor);
    }
  };

  const clearNav = () => { setNavFrom(''); setNavTo(''); setNavResult(null); setFromSearch(''); setToSearch(''); };

  return (
    <div className="map-page">
      {/* ── Floor tabs ──────────────────────────────────── */}
      <div className="map-floor-bar">
        <span className="map-floor-label">Floor:</span>
        <div className="map-floor-tabs">
          {FLOORS.map(f => (
            <button
              key={f.id}
              className={`map-floor-btn ${activeFloor===f.id?'active':''} ${!f.available?'disabled':''}`}
              onClick={() => f.available && setActiveFloor(f.id)}
              title={f.desc}
            >
              {f.label}
              {!f.available && <span className="map-soon-dot"/>}
            </button>
          ))}
        </div>
        <span className="map-floor-desc">
          {FLOORS.find(f => f.id === activeFloor)?.desc}
        </span>

      </div>

      {/* ── Global Navigation Panel ──────────────────────── */}
      {showNav && (
        <div className="map-nav-panel">
          <div className="map-nav-panel-header">
            <span>🧭 Campus Navigation</span>
            <button className="map-nav-close" onClick={() => { setShowNav(false); clearNav(); }}>✕</button>
          </div>

          <div className="map-nav-panel-body">
            {/* FROM */}
            <div className="form-group">
              <label className="form-label">📍 From</label>
              <input className="form-input" placeholder="Search room or floor..."
                value={fromSearch} onChange={e => { setFromSearch(e.target.value); setNavFrom(''); }}/>
              {fromSearch && !navFrom && (
                <div className="map-nav-dropdown">
                  {filteredFrom.slice(0,8).map(r => (
                    <div key={r.id} className="map-nav-dropdown-item"
                      onClick={() => { setNavFrom(r.id); setFromSearch(r.label); }}>
                      <span className="map-nav-item-room">{r.label}</span>
                      <span className="map-nav-item-floor">{r.floorLabel}</span>
                    </div>
                  ))}
                  {filteredFrom.length === 0 && (
                    <div className="map-nav-dropdown-empty">No rooms found</div>
                  )}
                </div>
              )}
              {navFrom && (
                <div className="map-nav-selected">
                  ✅ {FLAT_ROOMS.find(r=>r.id===navFrom)?.floorLabel}
                </div>
              )}
            </div>

            {/* Swap button */}
            <div style={{textAlign:'center',margin:'4px 0'}}>
              <button className="map-nav-swap" onClick={() => {
                const tmpFrom = navFrom, tmpFromS = fromSearch;
                setNavFrom(navTo); setFromSearch(toSearch);
                setNavTo(tmpFrom); setToSearch(tmpFromS);
              }}>⇅ Swap</button>
            </div>

            {/* TO */}
            <div className="form-group">
              <label className="form-label">🎯 To</label>
              <input className="form-input" placeholder="Search room or floor..."
                value={toSearch} onChange={e => { setToSearch(e.target.value); setNavTo(''); }}/>
              {toSearch && !navTo && (
                <div className="map-nav-dropdown">
                  {filteredTo.slice(0,8).map(r => (
                    <div key={r.id} className="map-nav-dropdown-item"
                      onClick={() => { setNavTo(r.id); setToSearch(r.label); }}>
                      <span className="map-nav-item-room">{r.label}</span>
                      <span className="map-nav-item-floor">{r.floorLabel}</span>
                    </div>
                  ))}
                  {filteredTo.length === 0 && (
                    <div className="map-nav-dropdown-empty">No rooms found</div>
                  )}
                </div>
              )}
              {navTo && (
                <div className="map-nav-selected">
                  ✅ {FLAT_ROOMS.find(r=>r.id===navTo)?.floorLabel}
                </div>
              )}
            </div>

            <div style={{display:'flex',gap:6,marginTop:10}}>
              <button className="btn btn--primary" style={{flex:1}}
                onClick={handleNavigate} disabled={!navFrom || !navTo}>
                🗺️ Find Route
              </button>
              <button className="btn btn--secondary" onClick={clearNav}>Clear</button>
            </div>

            {/* Result */}
            {navResult && (
              <div className={`map-nav-result ${navResult.type==='cross'?'map-nav-result--cross':''}`}>
                {navResult.type === 'same' ? (
                  <>
                    <div className="map-nav-result-title">✅ Route on {navResult.from.floorLabel}</div>
                    <div style={{fontSize:12,color:'var(--text-muted)',marginTop:4}}>
                      The map has switched to show this floor. Use the floor map to navigate.
                    </div>
                  </>
                ) : (
                  <>
                    <div className="map-nav-result-title">🔢 Cross-Floor Route</div>
                    {navResult.steps.map((s,i) => (
                      <div key={i} className="map-nav-step">
                        <span className="map-nav-step-num">{i+1}</span>
                        <span>{s}</span>
                      </div>
                    ))}
                    <div style={{marginTop:8,display:'flex',gap:6}}>
                      <button className="btn btn--sm btn--secondary"
                        onClick={() => setActiveFloor(navResult.from.floor)}>
                        View {navResult.from.floorLabel}
                      </button>
                      <button className="btn btn--sm btn--primary"
                        onClick={() => setActiveFloor(navResult.to.floor)}>
                        View {navResult.to.floorLabel}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Map content ──────────────────────────────────── */}
      <div className="map-content">
        {activeFloor === 'G' && <GroundFloorMap onRoomSelect={setSelectedRoom}/>}
        {activeFloor === '4' && <FloorMap4      onRoomSelect={setSelectedRoom}/>}
        {activeFloor === '3' && <FloorMap3      onRoomSelect={setSelectedRoom}/>}
        {!['G','4','3'].includes(activeFloor) && (
          <div className="map-no-floor">
            <div style={{fontSize:54}}>🗺️</div>
            <h3>Map Coming Soon</h3>
            <p>The map for <strong>Floor {activeFloor}</strong> will be available once the AutoCAD design is finalized.</p>
            <p style={{marginTop:8,fontSize:13,color:'#999'}}>خريطة هذا الطابق ستكون متاحة قريباً</p>
          </div>
        )}
      </div>
    </div>
  );
}

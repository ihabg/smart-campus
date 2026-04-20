import React, { useState } from 'react';
import GroundFloorMap from '../components/map/GroundFloorMap';
import './MapPage.css';

const FLOORS = [
  { id:'ground', label:'Ground Floor', labelAr:'الطابق الأرضي', available:true },
  { id:'floor1', label:'Floor 1',      labelAr:'الطابق الأول',  available:false },
  { id:'floor2', label:'Floor 2',      labelAr:'الطابق الثاني', available:false },
  { id:'floor3', label:'Floor 3',      labelAr:'الطابق الثالث', available:false },
  { id:'floor4', label:'Floor 4',      labelAr:'الطابق الرابع', available:false },
  { id:'floor5', label:'Floor 5',      labelAr:'الطابق الخامس', available:false },
  { id:'floor6', label:'Floor 6',      labelAr:'الطابق السادس', available:false },
  { id:'floor7', label:'Floor 7',      labelAr:'الطابق السابع', available:false },
];

export default function MapPage() {
  const [activeFloor,  setActiveFloor]  = useState('ground');
  const [selectedRoom, setSelectedRoom] = useState(null);

  return (
    <div className="map-page">
      {/* Floor tabs */}
      <div className="map-floor-selector">
        <span className="map-floor-label">Floor:</span>
        <div className="map-floor-tabs">
          {FLOORS.map(f => (
            <button
              key={f.id}
              className={`map-floor-tab ${activeFloor===f.id?'map-floor-tab--active':''} ${!f.available?'map-floor-tab--disabled':''}`}
              onClick={() => f.available && setActiveFloor(f.id)}
              title={!f.available ? 'Coming soon' : f.label}
            >
              {f.label}
              {!f.available && <span className="map-floor-soon">Soon</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Map */}
      <div className="map-content">
        {activeFloor === 'ground'
          ? <GroundFloorMap onRoomSelect={setSelectedRoom} />
          : (
            <div className="map-coming-soon">
              <div style={{fontSize:52}}>🗺️</div>
              <h3>Map Coming Soon</h3>
              <p>This floor map will be available once the AutoCAD design is ready.</p>
              <p style={{marginTop:8,fontSize:13,color:'#999'}}>خريطة هذا الطابق ستكون متاحة قريباً</p>
            </div>
          )
        }
      </div>
    </div>
  );
}

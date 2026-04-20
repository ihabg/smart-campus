import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, TextInput, Dimensions, PanResponder,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Rect, G, Text as SvgText, Path, Circle, Line, Defs, Pattern } from 'react-native-svg';
import { floorAPI, searchAPI } from '../api/index';
import { dijkstra } from '../utils/dijkstra';
import { COLORS, SPACING, RADIUS } from '../theme';

const { width: SW, height: SH } = Dimensions.get('window');
const SVG_W = 1200;
const SVG_H = 560;

const ROOM_COLORS = {
  lab:          { fill: '#d1eddf', stroke: '#22a060', text: '#145c36' },
  lecture_hall: { fill: '#dbeafe', stroke: '#1d4ed8', text: '#1e3a8a' },
  classroom:    { fill: '#e8e3fa', stroke: '#7c3aed', text: '#4c1d95' },
  office:       { fill: '#fef3c7', stroke: '#b45309', text: '#78350f' },
  stairs:       { fill: '#cdd5e5', stroke: '#8899bb', text: '#555' },
  corridor:     { fill: '#dde4f0', stroke: '#b0bcd0', text: '#6b7a99' },
  default:      { fill: '#f1f0ee', stroke: '#b0bcd0', text: '#555' },
};

export default function MapScreen() {
  const [buildings,     setBuildings]     = useState([]);
  const [floors,        setFloors]        = useState([]);
  const [activeBuilding,setActiveBuilding]= useState(null);
  const [activeFloor,   setActiveFloor]   = useState(null);
  const [rooms,         setRooms]         = useState([]);
  const [graph,         setGraph]         = useState({ graph: {}, nodes: {} });
  const [loadingFloor,  setLoadingFloor]  = useState(false);
  const [selectedRoom,  setSelectedRoom]  = useState(null);
  const [activeFilter,  setActiveFilter]  = useState('all');
  const [searchQuery,   setSearchQuery]   = useState('');
  const [activePath,    setActivePath]    = useState([]);
  const [fromRoom,      setFromRoom]      = useState('');
  const [toRoom,        setToRoom]        = useState('');
  const [showPanel,     setShowPanel]     = useState(false);
  const [showPathModal, setShowPathModal] = useState(false);

  // Pan & zoom state
  const initScale = (SW - 32) / SVG_W;
  const [scale,  setScale]  = useState(initScale);
  const [offset, setOffset] = useState({ x: 0, y: 16 });
  const lastOffset = useRef({ x: 0, y: 16 });
  const lastScale  = useRef(initScale);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  (_, gs) => Math.abs(gs.dx) > 3 || Math.abs(gs.dy) > 3,
      onPanResponderGrant: () => { lastOffset.current = { ...offset }; },
      onPanResponderMove: (_, gs) => {
        setOffset({ x: lastOffset.current.x + gs.dx, y: lastOffset.current.y + gs.dy });
      },
      onPanResponderRelease: (_, gs) => {
        lastOffset.current = { x: lastOffset.current.x + gs.dx, y: lastOffset.current.y + gs.dy };
      },
    })
  ).current;

  const zoomIn  = () => { const s = Math.min(5, lastScale.current * 1.3); lastScale.current = s; setScale(s); };
  const zoomOut = () => { const s = Math.max(0.2, lastScale.current / 1.3); lastScale.current = s; setScale(s); };
  const resetView = () => { const s = (SW - 32) / SVG_W; lastScale.current = s; setScale(s); setOffset({ x: 0, y: 16 }); lastOffset.current = { x: 0, y: 16 }; };

  useEffect(() => {
    floorAPI.getBuildings()
      .then(({ data }) => {
        const blds = data.data.buildings;
        setBuildings(blds);
        if (blds.length) loadFloors(blds[0].id);
      })
      .catch(() => Alert.alert('Error', 'Failed to load buildings'));
  }, []); // eslint-disable-line

  const loadFloors = async (buildingId) => {
    setActiveBuilding(buildingId);
    try {
      const { data } = await floorAPI.getAll({ building_id: buildingId });
      const bFloors  = data.data.floors;
      setFloors(bFloors);
      if (bFloors.length) loadFloorData(bFloors[0].id);
    } catch { Alert.alert('Error', 'Failed to load floors'); }
  };

  const loadFloorData = async (floorId) => {
    setActiveFloor(floorId);
    setLoadingFloor(true);
    setActivePath([]);
    setSelectedRoom(null);
    try {
      const [floorRes, graphRes] = await Promise.all([
        floorAPI.getById(floorId),
        searchAPI.getGraph({ floor_id: floorId }),
      ]);
      setRooms(floorRes.data.data.rooms || []);
      setGraph(graphRes.data.data);
      resetView();
    } catch { Alert.alert('Error', 'Failed to load floor map'); }
    finally { setLoadingFloor(false); }
  };

  const handleRoomPress = useCallback((room) => {
    setSelectedRoom(room);
    setShowPanel(true);
  }, []);

  const handleFindPath = () => {
    if (!fromRoom || !toRoom) { Alert.alert('Error', 'Select both rooms'); return; }
    const path = dijkstra(graph.graph, fromRoom, toRoom);
    if (!path) { Alert.alert('No Path', 'No path found between these rooms'); return; }
    setActivePath(path);
    setShowPathModal(false);
  };

  // Build path D
  const pathD = activePath.length >= 2
    ? activePath.map((id, i) => {
        const n = graph.nodes[id];
        if (!n?.x || !n?.y) return '';
        const px = (parseFloat(n.x) / 100) * SVG_W;
        const py = (parseFloat(n.y) / 100) * SVG_H;
        return `${i === 0 ? 'M' : 'L'} ${px} ${py}`;
      }).join(' ')
    : '';

  const FILTERS = ['all', 'classroom', 'lab', 'office'];

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Campus Map</Text>
        <TouchableOpacity style={s.navBtn} onPress={() => setShowPathModal(true)}>
          <Text style={s.navBtnText}>↗ Navigate</Text>
        </TouchableOpacity>
      </View>

      {/* Building tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabBar} contentContainerStyle={s.tabContent}>
        {buildings.map(b => (
          <TouchableOpacity
            key={b.id}
            style={[s.tab, activeBuilding === b.id && s.tabActive]}
            onPress={() => loadFloors(b.id)}
          >
            <Text style={[s.tabText, activeBuilding === b.id && s.tabTextActive]}>Block {b.code}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Floor tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.floorBar} contentContainerStyle={s.tabContent}>
        {floors.map(f => (
          <TouchableOpacity
            key={f.id}
            style={[s.floorTab, activeFloor === f.id && s.floorTabActive]}
            onPress={() => loadFloorData(f.id)}
          >
            <Text style={[s.floorTabText, activeFloor === f.id && s.floorTabTextActive]}>{f.floor_label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Filter bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterBar} contentContainerStyle={s.tabContent}>
        {FILTERS.map(f => (
          <TouchableOpacity key={f} style={[s.filterBtn, activeFilter === f && s.filterBtnActive]} onPress={() => setActiveFilter(f)}>
            <Text style={[s.filterBtnText, activeFilter === f && s.filterBtnTextActive]}>
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1) + 's'}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Path info */}
      {activePath.length > 0 && (
        <View style={s.pathInfo}>
          <Text style={s.pathInfoText} numberOfLines={1}>
            {activePath.length - 1} steps: {activePath.map(id => graph.nodes[id]?.number || '?').join(' → ')}
          </Text>
          <TouchableOpacity onPress={() => setActivePath([])}>
            <Text style={{ color: COLORS.muted, fontWeight: '600', fontSize: 12 }}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* SVG Map */}
      <View style={s.mapArea} {...pan.panHandlers}>
        {loadingFloor ? (
          <View style={s.mapCenter}><ActivityIndicator color={COLORS.najahBlue} size="large" /></View>
        ) : (
          <Svg
            width={SW}
            height={SH * 0.55}
            viewBox={`${-offset.x / scale} ${-offset.y / scale} ${SVG_W / scale} ${SVG_H / scale}`}
          >
            <Rect width={SVG_W} height={SVG_H} fill="#eef1f8" />

            {/* Rooms */}
            {rooms.map(room => {
              if (!room.coord_x || !room.coord_y) return null;
              const x = (parseFloat(room.coord_x)      / 100) * SVG_W;
              const y = (parseFloat(room.coord_y)       / 100) * SVG_H;
              const w = (parseFloat(room.coord_width  || 8) / 100) * SVG_W;
              const h = (parseFloat(room.coord_height || 6) / 100) * SVG_H;
              const c    = ROOM_COLORS[room.type] || ROOM_COLORS.default;
              const dim  = activeFilter !== 'all' && room.type !== activeFilter;
              const sel  = selectedRoom?.id === room.id;
              const onPth= activePath.includes(room.id);

              return (
                <G key={room.id} opacity={dim ? 0.2 : 1} onPress={() => handleRoomPress(room)}>
                  <Rect
                    x={x} y={y} width={w} height={h} rx={2}
                    fill={sel ? c.stroke : onPth ? '#fef08a' : c.fill}
                    stroke={sel ? '#fff' : c.stroke}
                    strokeWidth={sel ? 3 : 1.5}
                  />
                  <SvgText x={x + w/2} y={y + h/2 + 4} textAnchor="middle"
                    fontSize={Math.min(w/6, 13)} fill={sel ? '#fff' : c.text} fontWeight="500">
                    {room.room_number}
                  </SvgText>
                </G>
              );
            })}

            {/* Path line */}
            {pathD && (
              <G>
                <Path d={pathD} fill="none" stroke="#f59e0b" strokeWidth={4} strokeLinecap="round" strokeDasharray="8,5" />
                {[activePath[0], activePath[activePath.length - 1]].map((id, i) => {
                  const n = graph.nodes[id];
                  if (!n?.x || !n?.y) return null;
                  const px = (parseFloat(n.x) / 100) * SVG_W;
                  const py = (parseFloat(n.y) / 100) * SVG_H;
                  return (
                    <G key={id}>
                      <Circle cx={px} cy={py} r={12} fill={i === 0 ? '#22c55e' : '#ef4444'} stroke="#fff" strokeWidth={2} />
                      <SvgText x={px} y={py + 4} textAnchor="middle" fontSize={10} fill="#fff" fontWeight="700">{i===0?'S':'E'}</SvgText>
                    </G>
                  );
                })}
              </G>
            )}
          </Svg>
        )}

        {/* Zoom controls */}
        <View style={s.zoomControls}>
          <TouchableOpacity style={s.zoomBtn} onPress={zoomIn}><Text style={s.zoomText}>+</Text></TouchableOpacity>
          <TouchableOpacity style={s.zoomBtn} onPress={zoomOut}><Text style={s.zoomText}>−</Text></TouchableOpacity>
          <TouchableOpacity style={s.zoomBtn} onPress={resetView}><Text style={s.zoomText}>⊙</Text></TouchableOpacity>
        </View>
      </View>

      {/* Room detail panel */}
      {showPanel && selectedRoom && (
        <View style={s.panel}>
          <View style={s.panelHandle} />
          <View style={s.panelHeader}>
            <View>
              <Text style={s.panelNum}>Room {selectedRoom.room_number}</Text>
              <Text style={s.panelName}>{selectedRoom.name}</Text>
              <View style={s.panelBadge}>
                <Text style={s.panelBadgeText}>{selectedRoom.type?.replace('_',' ')}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => setShowPanel(false)} style={s.panelClose}>
              <Text style={{ color: COLORS.muted, fontSize: 16 }}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={s.panelActions}>
            <TouchableOpacity style={s.panelBtn} onPress={() => { setToRoom(selectedRoom.id); setShowPathModal(true); setShowPanel(false); }}>
              <Text style={s.panelBtnText}>Navigate here →</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Path modal */}
      {showPathModal && (
        <View style={s.modalOverlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Find Path</Text>
            <Text style={s.modalLabel}>From</Text>
            <ScrollView horizontal style={s.roomPicker} showsHorizontalScrollIndicator={false}>
              {Object.values(graph.nodes).map(n => (
                <TouchableOpacity key={n.id} style={[s.roomPickBtn, fromRoom === n.id && s.roomPickBtnActive]} onPress={() => setFromRoom(n.id)}>
                  <Text style={[s.roomPickText, fromRoom === n.id && s.roomPickTextActive]}>{n.number}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={s.modalLabel}>To</Text>
            <ScrollView horizontal style={s.roomPicker} showsHorizontalScrollIndicator={false}>
              {Object.values(graph.nodes).map(n => (
                <TouchableOpacity key={n.id} style={[s.roomPickBtn, toRoom === n.id && s.roomPickBtnActive]} onPress={() => setToRoom(n.id)}>
                  <Text style={[s.roomPickText, toRoom === n.id && s.roomPickTextActive]}>{n.number}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: SPACING.md }}>
              <TouchableOpacity style={[s.modalBtn, { flex: 1 }]} onPress={handleFindPath}><Text style={s.modalBtnText}>Find Path</Text></TouchableOpacity>
              <TouchableOpacity style={[s.modalBtn, s.modalBtnCancel, { flex: 1 }]} onPress={() => setShowPathModal(false)}><Text style={s.modalBtnCancelText}>Cancel</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:            { flex: 1, backgroundColor: COLORS.bg },
  header:          { backgroundColor: COLORS.najahBlue, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: COLORS.gold },
  headerTitle:     { color: '#fff', fontSize: 17, fontWeight: '700' },
  navBtn:          { backgroundColor: COLORS.gold, paddingHorizontal: 12, paddingVertical: 5, borderRadius: RADIUS.sm },
  navBtnText:      { color: COLORS.najahBlue, fontSize: 12, fontWeight: '700' },
  tabBar:          { backgroundColor: COLORS.panel, borderBottomWidth: 1, borderColor: COLORS.border, maxHeight: 44 },
  tabContent:      { paddingHorizontal: SPACING.md, paddingVertical: 6, gap: 6 },
  tab:             { paddingHorizontal: 14, paddingVertical: 5, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border },
  tabActive:       { backgroundColor: COLORS.najahBlue, borderColor: COLORS.najahBlue },
  tabText:         { fontSize: 12, fontWeight: '500', color: COLORS.muted, fontFamily: 'Courier New' },
  tabTextActive:   { color: '#fff' },
  floorBar:        { backgroundColor: COLORS.surface, borderBottomWidth: 1, borderColor: COLORS.border, maxHeight: 38 },
  floorTab:        { paddingHorizontal: 12, paddingVertical: 4, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border },
  floorTabActive:  { backgroundColor: '#0a5cb8', borderColor: '#0a5cb8' },
  floorTabText:    { fontSize: 12, color: COLORS.muted, fontFamily: 'Courier New' },
  floorTabTextActive: { color: '#fff', fontWeight: '600' },
  filterBar:       { maxHeight: 38, borderBottomWidth: 1, borderColor: COLORS.border },
  filterBtn:       { paddingHorizontal: 12, paddingVertical: 4, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.panel },
  filterBtnActive: { backgroundColor: COLORS.najahBlue, borderColor: COLORS.najahBlue },
  filterBtnText:   { fontSize: 11, color: COLORS.muted, fontWeight: '500' },
  filterBtnTextActive: { color: '#fff' },
  pathInfo:        { backgroundColor: '#fffbf0', borderBottomWidth: 1, borderColor: '#f0e4b8', paddingHorizontal: SPACING.lg, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pathInfoText:    { fontSize: 11, color: COLORS.green, fontFamily: 'Courier New', flex: 1, marginRight: 8 },
  mapArea:         { flex: 1, position: 'relative', overflow: 'hidden' },
  mapCenter:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
  zoomControls:    { position: 'absolute', bottom: 12, right: 12, gap: 4 },
  zoomBtn:         { width: 32, height: 32, backgroundColor: COLORS.panel, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  zoomText:        { fontSize: 18, color: COLORS.text, lineHeight: 22 },
  panel:           { backgroundColor: COLORS.panel, borderTopLeftRadius: 16, borderTopRightRadius: 16, borderTopWidth: 1, borderColor: COLORS.border, paddingTop: SPACING.sm },
  panelHandle:     { width: 36, height: 4, backgroundColor: COLORS.border, borderRadius: RADIUS.full, alignSelf: 'center', marginBottom: SPACING.sm },
  panelHeader:     { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md, borderBottomWidth: 1, borderColor: COLORS.border },
  panelNum:        { fontFamily: 'Courier New', fontSize: 20, fontWeight: '700', color: COLORS.najahBlue },
  panelName:       { fontSize: 14, fontWeight: '500', color: COLORS.text },
  panelBadge:      { alignSelf: 'flex-start', marginTop: 4, backgroundColor: COLORS.bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.full },
  panelBadgeText:  { fontSize: 11, color: COLORS.muted },
  panelClose:      { alignSelf: 'flex-start' },
  panelActions:    { padding: SPACING.lg },
  panelBtn:        { backgroundColor: COLORS.najahBlue, borderRadius: RADIUS.md, padding: 10, alignItems: 'center' },
  panelBtnText:    { color: '#fff', fontWeight: '700' },
  modalOverlay:    { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modal:           { backgroundColor: COLORS.panel, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: SPACING.xl, paddingBottom: 32 },
  modalTitle:      { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.lg },
  modalLabel:      { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', color: COLORS.muted, letterSpacing: 0.8, marginBottom: 6 },
  roomPicker:      { marginBottom: SPACING.md, maxHeight: 44 },
  roomPickBtn:     { paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border, marginRight: 6, backgroundColor: COLORS.bg },
  roomPickBtnActive: { backgroundColor: COLORS.najahBlue, borderColor: COLORS.najahBlue },
  roomPickText:    { fontFamily: 'Courier New', fontSize: 13, color: COLORS.muted },
  roomPickTextActive: { color: '#fff' },
  modalBtn:        { backgroundColor: COLORS.najahBlue, borderRadius: RADIUS.md, padding: 11, alignItems: 'center' },
  modalBtnText:    { color: '#fff', fontWeight: '700', fontSize: 14 },
  modalBtnCancel:  { backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border },
  modalBtnCancelText: { color: COLORS.muted, fontSize: 14 },
});

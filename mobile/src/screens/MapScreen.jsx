import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import Svg, {
  Polygon,
  Rect,
  Text as SvgText,
} from 'react-native-svg';

import { SafeAreaView } from 'react-native-safe-area-context';

import { WEB_FLOORS } from '../data/floorMaps';
import { floorAPI, getAssetUrl, roomAPI } from '../api';
import {
  Card,
  EmptyState,
  LoadingState,
  ScreenHeader,
} from '../components/ui';

import { COLORS, RADIUS, SPACING } from '../theme';
import {
  getErrorMessage,
  normalizeRoomNumber,
  roomTypeLabel,
  unwrapApi,
} from '../utils/helpers';

const LOCAL_MAP_IMAGES = {
  B2: require('../../assets/maps/B2.png'),
  B1: require('../../assets/maps/B1.png'),
  G: require('../../assets/maps/G.png'),
  1: require('../../assets/maps/1.png'),
  2: require('../../assets/maps/2.png'),
  3: require('../../assets/maps/3.png'),
  4: require('../../assets/maps/4.png'),
};

const FLOOR_ORDER = ['B2', 'B1', 'G', '1', '2', '3', '4'];

const ROOM_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'lecture_hall', label: 'Lectures' },
  { value: 'lab', label: 'Labs' },
  { value: 'office', label: 'Offices' },
  { value: 'restroom', label: 'Restrooms' },
  { value: 'stairs', label: 'Stairs' },
  { value: 'elevator', label: 'Elevators' },
];

const MAP_DISPLAY_WIDTH = 1050;

function getLocalFloorOptions() {
  return FLOOR_ORDER
    .filter((label) => WEB_FLOORS[String(label)])
    .map((label, index) => ({
      id: String(label),
      floor_label: String(label),
      name: WEB_FLOORS[String(label)]?.title || String(label),
      display_order: index + 1,
      isLocal: true,
    }));
}

function sortFloors(list) {
  return [...list].sort((a, b) => {
    const ai = FLOOR_ORDER.indexOf(String(a.floor_label));
    const bi = FLOOR_ORDER.indexOf(String(b.floor_label));

    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;

    return Number(a.display_order ?? a.floor_number ?? 0) -
      Number(b.display_order ?? b.floor_number ?? 0);
  });
}

function getRoomNumber(item) {
  return (
    item?.roomNumber ||
    item?.room_number ||
    item?.roomNo ||
    item?.number ||
    item?.id ||
    ''
  );
}

function getItemType(item) {
  return item?.type || item?.room_type || 'other';
}

function getItemName(item) {
  return item?.name || item?.room_name || getRoomNumber(item) || 'Location';
}

function getSearchText(item) {
  return [
    getRoomNumber(item),
    getItemName(item),
    getItemType(item),
    item?.department,
    item?.lecturerName,
    item?.lecturerEmail,
    item?.search_keywords,
    item?.currentCourse,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function filterMatchesType(item, filter) {
  if (filter === 'all') return true;

  const type = getItemType(item);

  if (filter === 'lecture_hall') {
    return type === 'lecture_hall' || type === 'classroom';
  }

  if (filter === 'restroom') {
    return type === 'restroom' || type === 'bathroom';
  }

  return type === filter;
}

function findFloorLabelByRoomNumber(roomNumber) {
  if (!roomNumber) return '';

  const wanted = normalizeRoomNumber(roomNumber);

  for (const label of Object.keys(WEB_FLOORS)) {
    const floor = WEB_FLOORS[label];

    const found = (floor.blocks || []).some((block) => {
      return normalizeRoomNumber(getRoomNumber(block)) === wanted;
    });

    if (found) return label;
  }

  return '';
}

export default function MapScreen({ route }) {
  const [floors, setFloors] = useState([]);
  const [activeFloorId, setActiveFloorId] = useState('');
  const [rooms, setRooms] = useState([]);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedRoom, setSelectedRoom] = useState(null);

  const [loading, setLoading] = useState(true);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const floorScrollRef = useRef(null);

  const activeFloor = useMemo(() => {
    return floors.find((floor) => floor.id === activeFloorId) || floors[0] || null;
  }, [floors, activeFloorId]);

  const activeFloorLabel = String(
    activeFloor?.floor_label ||
    activeFloor?.label ||
    'G'
  );

  const activeWebFloor = WEB_FLOORS[activeFloorLabel] || WEB_FLOORS.G;

  const sourceMapWidth = Number(
    activeWebFloor?.width ||
    activeFloor?.map_width ||
    1600
  );

  const sourceMapHeight = Number(
    activeWebFloor?.height ||
    activeFloor?.map_height ||
    1000
  );

  const mapDisplayHeight = Math.max(
    360,
    Math.round((MAP_DISPLAY_WIDTH * sourceMapHeight) / sourceMapWidth)
  );

  const mapImageSource =
    activeWebFloor?.image ||
    LOCAL_MAP_IMAGES[activeFloorLabel] ||
    (
      activeFloor?.map_image_url
        ? { uri: getAssetUrl(activeFloor.map_image_url) }
        : null
    );

  const roomsByNumber = useMemo(() => {
    const map = new Map();

    rooms.forEach((room) => {
      const number = normalizeRoomNumber(room.room_number);

      if (number) {
        map.set(number, room);
      }
    });

    return map;
  }, [rooms]);

  const mapBlocks = useMemo(() => {
    const blocks = activeWebFloor?.blocks || [];

    return blocks.map((block, index) => {
      const number = getRoomNumber(block);
      const dbRoom = roomsByNumber.get(normalizeRoomNumber(number));

      return {
        ...(dbRoom || {}),
        ...block,

        id: block.id || dbRoom?.id || `${activeFloorLabel}-${index}`,
        _key: block.id || number || `${activeFloorLabel}-${index}`,

        roomNumber: number || dbRoom?.room_number || block.id,
        room_number: number || dbRoom?.room_number || block.id,

        name: block.name || dbRoom?.name || number || block.id,
        type: block.type || dbRoom?.type || 'other',
        department: block.department || dbRoom?.department || '—',
        capacity: block.capacity ?? dbRoom?.capacity ?? '—',

        is_accessible:
          block.is_accessible ??
          block.isAccessible ??
          dbRoom?.is_accessible ??
          true,

        source: 'web-block',
      };
    });
  }, [activeWebFloor, roomsByNumber, activeFloorLabel]);

  const displayLocations = useMemo(() => {
    if (mapBlocks.length > 0) return mapBlocks;

    return rooms.map((room) => ({
      ...room,
      roomNumber: room.room_number,
      source: 'database-room',
      _key: room.id,
    }));
  }, [mapBlocks, rooms]);

  const filteredLocations = useMemo(() => {
    const q = query.trim().toLowerCase();

    return displayLocations.filter((item) => {
      const typeOk = filterMatchesType(item, filter);
      const textOk = !q || getSearchText(item).includes(q);

      return typeOk && textOk;
    });
  }, [displayLocations, filter, query]);

  const loadRooms = useCallback(async (floorId) => {
    if (!floorId) return;

    setRoomsLoading(true);

    try {
      const response = await roomAPI.getByFloor(floorId, {
        active_only: 'true',
        limit: 700,
      });

      const payload = unwrapApi(response);
      setRooms(payload.rooms || []);
    } catch (error) {
      console.log('loadRooms error:', error?.message || error);
    } finally {
      setRoomsLoading(false);
    }
  }, []);

  const loadFloors = useCallback(async () => {
    try {
      const response = await floorAPI.getAll({ active_only: 'true' });
      const payload = unwrapApi(response);

      const apiFloors = (payload.floors || [])
        .filter((floor) => WEB_FLOORS[String(floor.floor_label)])
        .map((floor) => ({
          ...floor,
          floor_label: String(floor.floor_label),
        }));

      const localFloors = getLocalFloorOptions();

      const list = sortFloors(apiFloors.length > 0 ? apiFloors : localFloors);

      setFloors(list);

      const targetFloorId = route?.params?.floorId;
      const targetFloorLabel =
        route?.params?.floorLabel ||
        findFloorLabelByRoomNumber(route?.params?.roomNumber);

      const defaultFloor =
        list.find((floor) => String(floor.id) === String(targetFloorId)) ||
        list.find((floor) => String(floor.floor_label) === String(targetFloorLabel)) ||
        list.find((floor) => floor.floor_label === 'G') ||
        list[0];

      if (defaultFloor) {
        setActiveFloorId(defaultFloor.id);
      }
    } catch (error) {
      const localFloors = getLocalFloorOptions();
      setFloors(localFloors);

      const targetFloorLabel =
        route?.params?.floorLabel ||
        findFloorLabelByRoomNumber(route?.params?.roomNumber);

      const defaultFloor =
        localFloors.find((floor) => floor.floor_label === targetFloorLabel) ||
        localFloors.find((floor) => floor.floor_label === 'G') ||
        localFloors[0];

      if (defaultFloor) {
        setActiveFloorId(defaultFloor.id);
      }

      Alert.alert(
        'Map warning',
        getErrorMessage(
          error,
          'Backend floors could not be loaded. Showing local map data.'
        )
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [
    route?.params?.floorId,
    route?.params?.floorLabel,
    route?.params?.roomNumber,
  ]);

  useEffect(() => {
    loadFloors();
  }, [loadFloors]);

  useEffect(() => {
    if (!activeFloor) return;

    if (!activeFloor.isLocal && activeFloor.id !== activeFloor.floor_label) {
      loadRooms(activeFloor.id);
    } else {
      setRooms([]);
    }
  }, [activeFloor, loadRooms]);

  useEffect(() => {
    const target = route?.params?.roomNumber;

    if (!target || filteredLocations.length === 0) return;

    const normalized = normalizeRoomNumber(target);

    const found = filteredLocations.find((item) => {
      return (
        normalizeRoomNumber(getRoomNumber(item)) === normalized ||
        String(item.id) === String(route?.params?.roomId || '')
      );
    });

    if (found) {
      setSelectedRoom(found);
      setQuery(getRoomNumber(found));
    }
  }, [
    route?.params?.roomNumber,
    route?.params?.roomId,
    filteredLocations,
  ]);

  if (loading) {
    return <LoadingState />;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        title="Campus Map"
        subtitle="Engineering Building indoor navigation"
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadFloors();
            }}
          />
        }
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.floorRow}
          ref={floorScrollRef}
        >
          {floors.map((floor) => {
            const active = floor.id === activeFloorId;

            return (
              <TouchableOpacity
                key={floor.id}
                style={[
                  styles.floorChip,
                  active && styles.floorChipActive,
                ]}
                onPress={() => {
                  setActiveFloorId(floor.id);
                  setSelectedRoom(null);
                  setQuery('');
                }}
              >
                <Text
                  style={[
                    styles.floorChipText,
                    active && styles.floorChipTextActive,
                  ]}
                >
                  {floor.floor_label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Card style={styles.searchCard}>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search room, office, restroom..."
            placeholderTextColor={COLORS.faint}
          />

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {ROOM_FILTERS.map((item) => {
              const active = filter === item.value;

              return (
                <TouchableOpacity
                  key={item.value}
                  style={[
                    styles.filterChip,
                    active && styles.filterChipActive,
                  ]}
                  onPress={() => setFilter(item.value)}
                >
                  <Text
                    style={[
                      styles.filterText,
                      active && styles.filterTextActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Card>

        {mapImageSource ? (
          <Card style={styles.mapCard}>
            <Text style={styles.mapTitle}>
              {activeWebFloor?.title ||
                `${activeFloorLabel} — ${activeFloor?.name || 'Campus Map'}`}
            </Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator
              contentContainerStyle={styles.mapHorizontalContent}
            >
              <View
                style={{
                  width: MAP_DISPLAY_WIDTH,
                  height: mapDisplayHeight,
                  position: 'relative',
                }}
              >
                <Image
                  source={mapImageSource}
                  style={{
                    width: MAP_DISPLAY_WIDTH,
                    height: mapDisplayHeight,
                  }}
                  resizeMode="contain"
                />

                <Svg
                  width={MAP_DISPLAY_WIDTH}
                  height={mapDisplayHeight}
                  viewBox={`0 0 ${sourceMapWidth} ${sourceMapHeight}`}
                  preserveAspectRatio="xMidYMid meet"
                  style={StyleSheet.absoluteFill}
                >
                  {filteredLocations.map((item) => {
                    const selected =
                      normalizeRoomNumber(getRoomNumber(selectedRoom)) ===
                      normalizeRoomNumber(getRoomNumber(item));

                    if (item.source === 'web-block') {
                      return (
                        <WebBlockShape
                          key={item._key}
                          block={item}
                          selected={selected}
                          onPress={() => setSelectedRoom(item)}
                        />
                      );
                    }

                    return (
                      <DatabaseRoomShape
                        key={item._key}
                        room={item}
                        selected={selected}
                        onPress={() => setSelectedRoom(item)}
                      />
                    );
                  })}
                </Svg>
              </View>
            </ScrollView>
          </Card>
        ) : (
          <Card>
            <EmptyState
              icon="🗺️"
              title="No map image"
              subtitle="This floor has no map image yet."
            />
          </Card>
        )}

        <View style={styles.resultsHeader}>
          <Text style={styles.resultsTitle}>Locations</Text>
          <Text style={styles.resultsCount}>
            {filteredLocations.length} found
          </Text>
        </View>

        {roomsLoading ? (
          <ActivityIndicator
            color={COLORS.najahBlue}
            style={{ padding: SPACING.lg }}
          />
        ) : filteredLocations.length === 0 ? (
          <Card>
            <EmptyState
              icon="🔎"
              title="No locations found"
              subtitle="Try another floor or filter."
            />
          </Card>
        ) : (
          filteredLocations.slice(0, 120).map((item) => (
            <TouchableOpacity
              key={item._key || item.id}
              onPress={() => setSelectedRoom(item)}
              activeOpacity={0.82}
            >
              <Card style={styles.roomRow}>
                <View style={styles.roomNumberBox}>
                  <Text style={styles.roomNumber}>
                    {getRoomNumber(item)}
                  </Text>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.roomName} numberOfLines={1}>
                    {getItemName(item)}
                  </Text>

                  <Text style={styles.roomMeta} numberOfLines={2}>
                    {roomTypeLabel(getItemType(item))} ·{' '}
                    {item.department || '—'}
                  </Text>
                </View>

                <Text style={styles.arrow}>›</Text>
              </Card>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <RoomModal
        room={selectedRoom}
        onClose={() => setSelectedRoom(null)}
        floor={activeFloor}
        activeWebFloor={activeWebFloor}
      />
    </SafeAreaView>
  );
}

function WebBlockShape({ block, selected, onPress }) {
  const fill = selected
    ? 'rgba(11, 99, 255, 0.30)'
    : 'rgba(11, 99, 255, 0.05)';

  const stroke = selected
    ? '#0b63ff'
    : 'rgba(11, 99, 255, 0.55)';

  const strokeWidth = selected ? 5 : 2;

  const number = getRoomNumber(block);

  const labelX = Number(
    block.labelX ??
    block.coord_x + block.coord_width / 2 ??
    block.x + block.width / 2 ??
    0
  );

  const labelY = Number(
    block.labelY ??
    block.coord_y + block.coord_height / 2 ??
    block.y + block.height / 2 ??
    0
  );

  if (block.shape === 'polygon' && block.points) {
    return (
      <React.Fragment>
        <Polygon
          points={block.points}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          onPress={onPress}
        />

        {number ? (
          <SvgText
            x={labelX}
            y={labelY}
            fontSize="24"
            fontWeight="900"
            fill="#061b44"
            textAnchor="middle"
            onPress={onPress}
          >
            {number}
          </SvgText>
        ) : null}
      </React.Fragment>
    );
  }

  const x = Number(block.x ?? block.coord_x ?? 0);
  const y = Number(block.y ?? block.coord_y ?? 0);
  const width = Number(block.width ?? block.coord_width ?? 60);
  const height = Number(block.height ?? block.coord_height ?? 45);

  return (
    <React.Fragment>
      <Rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={6}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        onPress={onPress}
      />

      {number ? (
        <SvgText
          x={labelX || x + width / 2}
          y={labelY || y + height / 2}
          fontSize="24"
          fontWeight="900"
          fill="#061b44"
          textAnchor="middle"
          onPress={onPress}
        >
          {number}
        </SvgText>
      ) : null}
    </React.Fragment>
  );
}

function DatabaseRoomShape({ room, selected, onPress }) {
  const fill = selected
    ? 'rgba(11, 99, 255, 0.30)'
    : 'rgba(11, 99, 255, 0.04)';

  const stroke = selected
    ? '#0b63ff'
    : 'rgba(11, 99, 255, 0.55)';

  const strokeWidth = selected ? 5 : 2;

  const polygon = getPolygonPoints(room);

  const x = Number(room.coord_x || 0);
  const y = Number(room.coord_y || 0);
  const width = Number(room.coord_width || 60);
  const height = Number(room.coord_height || 45);

  const labelX = x + width / 2;
  const labelY = y + height / 2;

  if (polygon) {
    return (
      <React.Fragment>
        <Polygon
          points={polygon}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          onPress={onPress}
        />

        <SvgText
          x={labelX}
          y={labelY}
          fontSize="24"
          fill="#061b44"
          fontWeight="900"
          textAnchor="middle"
          onPress={onPress}
        >
          {getRoomNumber(room)}
        </SvgText>
      </React.Fragment>
    );
  }

  if (room.coord_x === null || room.coord_x === undefined) {
    return null;
  }

  return (
    <React.Fragment>
      <Rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={6}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        onPress={onPress}
      />

      <SvgText
        x={labelX}
        y={labelY}
        fontSize="24"
        fill="#061b44"
        fontWeight="900"
        textAnchor="middle"
        onPress={onPress}
      >
        {getRoomNumber(room)}
      </SvgText>
    </React.Fragment>
  );
}

function getPolygonPoints(room) {
  const value = room.polygon_points;

  if (!value) return '';

  if (typeof value === 'string') {
    if (value.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(value);
        return parsed.map((p) => `${p.x},${p.y}`).join(' ');
      } catch {
        return value;
      }
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map((p) => `${p.x},${p.y}`).join(' ');
  }

  return '';
}

function RoomModal({ room, floor, activeWebFloor, onClose }) {
  if (!room) return null;

  const roomNumber = getRoomNumber(room);

  return (
    <Modal
      transparent
      animationType="slide"
      visible={Boolean(room)}
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalNumber}>
                {roomNumber}
              </Text>

              <Text style={styles.modalName}>
                {getItemName(room)}
              </Text>
            </View>

            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
            >
              <Text style={styles.closeText}>×</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.modalGrid}>
            <Info label="Type" value={roomTypeLabel(getItemType(room))} />

            <Info
              label="Floor"
              value={
                activeWebFloor?.label ||
                floor?.floor_label ||
                '—'
              }
            />

            <Info
              label="Department"
              value={room.department || '—'}
            />

            <Info
              label="Capacity"
              value={room.capacity || '—'}
            />

            <Info
              label="Accessible"
              value={room.is_accessible === false ? 'No' : 'Yes'}
            />

            {room.lecturerName && room.lecturerName !== '—' ? (
              <Info label="Lecturer" value={room.lecturerName} />
            ) : null}

            {room.lecturerEmail && room.lecturerEmail !== '—' ? (
              <Info label="Email" value={room.lecturerEmail} />
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Info({ label, value }) {
  return (
    <View style={styles.infoBox}>
      <Text style={styles.infoLabel}>
        {label}
      </Text>

      <Text style={styles.infoValue}>
        {String(value ?? '—')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  content: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },

  floorRow: {
    gap: 8,
    paddingVertical: 2,
  },

  floorChip: {
    minWidth: 54,
    height: 42,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  floorChipActive: {
    backgroundColor: COLORS.najahBlue,
    borderColor: COLORS.najahBlue,
  },

  floorChipText: {
    color: COLORS.text,
    fontWeight: '900',
  },

  floorChipTextActive: {
    color: '#fff',
  },

  searchCard: {
    padding: SPACING.md,
  },

  searchInput: {
    height: 44,
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.lg,
    color: COLORS.text,
  },

  filterRow: {
    gap: 8,
    paddingTop: SPACING.md,
  },

  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  filterChipActive: {
    backgroundColor: COLORS.najahBlue,
    borderColor: COLORS.najahBlue,
  },

  filterText: {
    color: COLORS.muted,
    fontWeight: '900',
    fontSize: 12,
  },

  filterTextActive: {
    color: '#fff',
  },

  mapCard: {
    padding: SPACING.md,
  },

  mapTitle: {
    color: COLORS.text,
    fontWeight: '900',
    marginBottom: SPACING.sm,
  },

  mapHorizontalContent: {
    paddingBottom: SPACING.sm,
  },

  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  resultsTitle: {
    color: COLORS.text,
    fontWeight: '900',
    fontSize: 17,
  },

  resultsCount: {
    color: COLORS.muted,
    fontWeight: '800',
  },

  roomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.sm,
  },

  roomNumberBox: {
    width: 72,
    height: 48,
    backgroundColor: COLORS.najahLight,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },

  roomNumber: {
    color: COLORS.najahBlue,
    fontWeight: '900',
    fontSize: 12,
    textAlign: 'center',
  },

  roomName: {
    color: COLORS.text,
    fontWeight: '900',
  },

  roomMeta: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 3,
  },

  arrow: {
    color: COLORS.faint,
    fontSize: 28,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(7,20,45,0.45)',
    justifyContent: 'flex-end',
  },

  modalCard: {
    backgroundColor: COLORS.panel,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: SPACING.lg,
    maxHeight: '78%',
  },

  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },

  modalNumber: {
    color: COLORS.najahBlue,
    fontWeight: '900',
    fontSize: 30,
  },

  modalName: {
    color: COLORS.text,
    fontWeight: '800',
    marginTop: 3,
  },

  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  closeText: {
    color: COLORS.text,
    fontSize: 28,
    lineHeight: 30,
  },

  modalGrid: {
    gap: SPACING.sm,
  },

  infoBox: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
  },

  infoLabel: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 4,
    textTransform: 'uppercase',
  },

  infoValue: {
    color: COLORS.text,
    fontWeight: '800',
  },
});
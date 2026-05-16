import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { searchAPI } from '../api';
import { EmptyState, ScreenHeader } from '../components/ui';
import { COLORS, RADIUS, SPACING } from '../theme';
import { getErrorMessage, roomTypeLabel, unwrapApi } from '../utils/helpers';

export default function SearchScreen({ navigation }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);

  const runSearch = useCallback(async (value) => {
    const q = value.trim();

    if (q.length < 2) {
      setItems([]);
      return;
    }

    setLoading(true);

    try {
      const response = await searchAPI.global({ q });
      const payload = unwrapApi(response);
      const results = payload.results || payload || {};
      const merged = [];

      (results.rooms || []).forEach((item) => merged.push({ ...item, group: 'room' }));
      (results.courses || []).forEach((item) => merged.push({ ...item, group: 'course' }));
      (results.instructors || []).forEach((item) => merged.push({ ...item, group: 'instructor' }));

      setItems(merged);
    } catch (error) {
      Alert.alert('Search failed', getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => runSearch(query), 450);
    return () => clearTimeout(timer);
  }, [query, runSearch]);

  function openItem(item) {
    if (item.group === 'room') {
      navigation.navigate('MapTab', {
        roomId: item.id,
        roomNumber: item.room_number,
        floorId: item.floor_id,
      });
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Search" subtitle="Rooms, courses, doctors, services" />

      <View style={styles.searchBar}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Search room 2050, doctor, lecture..."
          placeholderTextColor={COLORS.faint}
          autoCapitalize="none"
          returnKeyType="search"
        />
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={COLORS.najahBlue} /></View>
      ) : query.trim().length < 2 ? (
        <EmptyState icon="🔍" title="Start searching" subtitle="Type at least 2 characters." />
      ) : items.length === 0 ? (
        <EmptyState icon="🕵️" title="No results" subtitle={`Nothing found for ${query}.`} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, index) => `${item.group}-${item.id || item.code || index}`}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.result} onPress={() => openItem(item)} activeOpacity={0.82}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.group === 'room' ? item.room_number : item.group === 'course' ? item.code : 'DR'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.resultTitle} numberOfLines={1}>
                  {item.name || `${item.first_name || ''} ${item.last_name || ''}`.trim() || item.code}
                </Text>
                <Text style={styles.resultSub} numberOfLines={2}>
                  {item.group === 'room'
                    ? `${item.building_name || 'Engineering'} · ${item.floor_label || ''} · ${roomTypeLabel(item.type)}`
                    : item.department || item.email || '—'}
                </Text>
              </View>
              {item.group === 'room' ? <Text style={styles.arrow}>›</Text> : null}
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  searchBar: { padding: SPACING.lg, backgroundColor: COLORS.panel, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  input: { height: 46, backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.full, paddingHorizontal: SPACING.lg, color: COLORS.text },
  loading: { padding: SPACING.xl },
  list: { padding: SPACING.lg, gap: SPACING.sm },
  result: { backgroundColor: COLORS.panel, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.lg, padding: SPACING.md, flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  badge: { width: 54, height: 42, borderRadius: RADIUS.md, backgroundColor: COLORS.najahLight, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: COLORS.najahBlue, fontWeight: '900', fontSize: 12 },
  resultTitle: { color: COLORS.text, fontWeight: '900', fontSize: 14 },
  resultSub: { color: COLORS.muted, marginTop: 3, fontSize: 12, lineHeight: 18 },
  arrow: { color: COLORS.faint, fontSize: 28 },
});

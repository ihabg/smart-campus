import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { announcementAPI } from '../api';
import { Card, EmptyState, LoadingState, Pill, ScreenHeader } from '../components/ui';
import { COLORS, SPACING } from '../theme';
import { getErrorMessage, timeAgo, unwrapApi } from '../utils/helpers';

export default function AnnouncementsScreen() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await announcementAPI.getAll({ limit: 50 });
      const payload = unwrapApi(response);
      setItems(payload.announcements || []);
    } catch (error) {
      Alert.alert('Error', getErrorMessage(error, 'Failed to load announcements.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingState />;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Announcements" subtitle="Latest campus updates" />
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={items.length ? styles.list : { flex: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
          />
        }
        ListEmptyComponent={<EmptyState icon="📢" title="No announcements" />}
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <View style={styles.topRow}>
              {item.is_pinned ? <Pill color={COLORS.amberBg} textColor={COLORS.amber}>Pinned</Pill> : <View />}
              <Text style={styles.time}>{timeAgo(item.published_at)}</Text>
            </View>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{item.content}</Text>
          </Card>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  list: { padding: SPACING.lg, gap: SPACING.md },
  card: { gap: 8 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  time: { color: COLORS.faint, fontSize: 11 },
  title: { color: COLORS.text, fontSize: 16, fontWeight: '900' },
  body: { color: COLORS.muted, lineHeight: 20 },
});

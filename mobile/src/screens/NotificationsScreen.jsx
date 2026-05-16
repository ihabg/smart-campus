import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { notificationAPI } from '../api';
import { EmptyState, LoadingState, ScreenHeader } from '../components/ui';
import { COLORS, SPACING } from '../theme';
import { getErrorMessage, timeAgo, unwrapApi } from '../utils/helpers';

export default function NotificationsScreen() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await notificationAPI.getMy({ limit: 50 });
      const payload = unwrapApi(response);
      setItems(payload.notifications || []);
      setUnread(Number(payload.unread_count || 0));
    } catch (error) {
      Alert.alert('Error', getErrorMessage(error, 'Failed to load notifications.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function markRead(id) {
    try {
      await notificationAPI.markRead(id);
      setItems((current) => current.map((item) => (item.id === id ? { ...item, is_read: true } : item)));
      setUnread((current) => Math.max(0, current - 1));
    } catch {}
  }

  async function markAllRead() {
    try {
      await notificationAPI.markAllRead();
      setItems((current) => current.map((item) => ({ ...item, is_read: true })));
      setUnread(0);
    } catch {}
  }

  if (loading) return <LoadingState />;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        title="Notifications"
        subtitle={unread > 0 ? `${unread} unread` : 'All caught up'}
        right={
          unread > 0 ? (
            <TouchableOpacity onPress={markAllRead}>
              <Text style={styles.headerAction}>Read all</Text>
            </TouchableOpacity>
          ) : null
        }
      />

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
        ListEmptyComponent={<EmptyState icon="🔔" title="No notifications" />}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.item, !item.is_read && styles.unreadItem]}
            activeOpacity={0.82}
            onPress={() => !item.is_read && markRead(item.id)}
          >
            {!item.is_read ? <View style={styles.dot} /> : null}
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, !item.is_read && styles.unreadTitle]}>{item.title}</Text>
              <Text style={styles.body} numberOfLines={3}>{item.body}</Text>
              <Text style={styles.time}>{timeAgo(item.published_at)}</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  headerAction: { color: '#fff', fontWeight: '900', fontSize: 12 },
  list: { padding: SPACING.lg, gap: SPACING.sm },
  item: { backgroundColor: COLORS.panel, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, padding: SPACING.lg, flexDirection: 'row', gap: SPACING.md },
  unreadItem: { backgroundColor: COLORS.najahLight, borderColor: '#bad0ff' },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: COLORS.najahBlue, marginTop: 5 },
  title: { color: COLORS.text, fontSize: 15, fontWeight: '800' },
  unreadTitle: { fontWeight: '900' },
  body: { color: COLORS.muted, marginTop: 4, lineHeight: 19 },
  time: { color: COLORS.faint, marginTop: 8, fontSize: 11 },
});

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { announcementAPI, notificationAPI, scheduleAPI } from '../api';
import { Card, EmptyState, LoadingState, Pill } from '../components/ui';
import { COLORS, RADIUS, SHADOW, SPACING } from '../theme';
import { cleanTime, getErrorMessage, timeAgo, unwrapApi } from '../utils/helpers';

export default function DashboardScreen({ navigation }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [todayClasses, setTodayClasses] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [announcements, setAnnouncements] = useState([]);

  const firstName = user?.first_name || 'Student';

  const load = useCallback(async () => {
    try {
      const [todayRes, notifRes, annRes] = await Promise.allSettled([
        scheduleAPI.getToday(),
        notificationAPI.getMy({ limit: 5 }),
        announcementAPI.getAll({ limit: 3 }),
      ]);

      if (todayRes.status === 'fulfilled') {
        const payload = unwrapApi(todayRes.value);
        setTodayClasses(payload.schedule || payload.classes || payload.sections || []);
      }

      if (notifRes.status === 'fulfilled') {
        const payload = unwrapApi(notifRes.value);
        setNotifications(payload.notifications || []);
      }

      if (annRes.status === 'fulfilled') {
        const payload = unwrapApi(annRes.value);
        setAnnouncements(payload.announcements || []);
      }
    } catch (error) {
      Alert.alert('Error', getErrorMessage(error, 'Failed to load dashboard.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    return [
      { label: 'Today', value: todayClasses.length, sub: 'classes' },
      { label: 'Alerts', value: notifications.filter((n) => !n.is_read).length, sub: 'unread' },
      { label: 'News', value: announcements.length, sub: 'latest' },
    ];
  }, [todayClasses, notifications, announcements]);

  if (loading) {
    return <LoadingState />;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
          />
        }
      >
        <View style={styles.hero}>
          <Text style={styles.logo}>AN</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroHello}>Hello, {firstName}</Text>
            <Text style={styles.heroSub}>Your Smart Campus assistant is ready.</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          {stats.map((item) => (
            <Card key={item.label} style={styles.statCard}>
              <Text style={styles.statValue}>{item.value}</Text>
              <Text style={styles.statLabel}>{item.label}</Text>
              <Text style={styles.statSub}>{item.sub}</Text>
            </Card>
          ))}
        </View>

        <View style={styles.quickGrid}>
          <QuickAction
            icon="🗺️"
            label="Campus Map"
            onPress={() => navigation.navigate('MapTab')}
          />
          <QuickAction
            icon="📅"
            label="Schedule"
            onPress={() => navigation.navigate('ScheduleTab')}
          />
          <QuickAction
            icon="🔍"
            label="Search"
            onPress={() => navigation.navigate('SearchTab')}
          />
          <QuickAction
            icon="🤖"
            label="Assistant"
            onPress={() => navigation.navigate('Chat')}
          />
        </View>

        <SectionTitle title="Today’s Classes" action="View all" onPress={() => navigation.navigate('ScheduleTab')} />
        {todayClasses.length === 0 ? (
          <Card>
            <EmptyState icon="📅" title="No classes today" subtitle="Your day is free for this semester." />
          </Card>
        ) : (
          todayClasses.map((item, index) => (
            <TouchableOpacity
              key={`${item.section_id || item.course_code}-${index}`}
              activeOpacity={0.82}
              onPress={() =>
                navigation.navigate('MapTab', {
                  roomNumber: item.room_number,
                  roomId: item.room_id,
                })
              }
            >
              <Card style={styles.classCard}>
                <View style={styles.classTimeBox}>
                  <Text style={styles.classTime}>{cleanTime(item.start_time)}</Text>
                  <Text style={styles.classTimeEnd}>{cleanTime(item.end_time)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.classCode}>{item.course_code}</Text>
                  <Text style={styles.className} numberOfLines={2}>
                    {item.course_name_ar || item.course_name}
                  </Text>
                  <Text style={styles.classMeta}>📍 Room {item.room_number || '—'}</Text>
                </View>
              </Card>
            </TouchableOpacity>
          ))
        )}

        <SectionTitle title="Latest Announcements" action="Open" onPress={() => navigation.navigate('Announcements')} />
        {announcements.map((item) => (
          <Card key={item.id} style={styles.announcementCard}>
            <View style={styles.announceTop}>
              {item.is_pinned ? <Pill color={COLORS.amberBg} textColor={COLORS.amber}>Pinned</Pill> : null}
              <Text style={styles.announcementTime}>{timeAgo(item.published_at)}</Text>
            </View>
            <Text style={styles.announcementTitle}>{item.title}</Text>
            <Text style={styles.announcementBody} numberOfLines={2}>{item.content}</Text>
          </Card>
        ))}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function QuickAction({ icon, label, onPress }) {
  return (
    <TouchableOpacity style={styles.quickAction} onPress={onPress} activeOpacity={0.82}>
      <Text style={styles.quickIcon}>{icon}</Text>
      <Text style={styles.quickLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function SectionTitle({ title, action, onPress }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? (
        <TouchableOpacity onPress={onPress}>
          <Text style={styles.sectionAction}>{action}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, gap: SPACING.md },
  hero: {
    minHeight: 116,
    backgroundColor: COLORS.najahBlue,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    ...SHADOW.soft,
  },
  logo: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: COLORS.gold,
    color: COLORS.najahBlue,
    textAlign: 'center',
    textAlignVertical: 'center',
    fontWeight: '900',
    fontSize: 20,
  },
  heroHello: { color: '#fff', fontSize: 22, fontWeight: '900' },
  heroSub: { color: 'rgba(255,255,255,0.75)', marginTop: 4, fontSize: 13 },
  statsRow: { flexDirection: 'row', gap: SPACING.sm },
  statCard: { flex: 1, padding: SPACING.md },
  statValue: { color: COLORS.najahBlue, fontWeight: '900', fontSize: 24 },
  statLabel: { color: COLORS.text, fontWeight: '900', marginTop: 2 },
  statSub: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md },
  quickAction: {
    width: '47.8%',
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    alignItems: 'center',
    ...SHADOW.soft,
  },
  quickIcon: { fontSize: 26, marginBottom: 8 },
  quickLabel: { color: COLORS.text, fontWeight: '900' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SPACING.md },
  sectionTitle: { color: COLORS.text, fontSize: 17, fontWeight: '900' },
  sectionAction: { color: COLORS.najahMid, fontWeight: '900', fontSize: 12 },
  classCard: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.sm },
  classTimeBox: { width: 70, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: COLORS.border },
  classTime: { color: COLORS.najahBlue, fontWeight: '900', fontSize: 15 },
  classTimeEnd: { color: COLORS.muted, fontSize: 11, marginTop: 4 },
  classCode: { color: COLORS.text, fontWeight: '900', fontSize: 15 },
  className: { color: COLORS.muted, marginTop: 3, lineHeight: 18 },
  classMeta: { color: COLORS.najahMid, fontWeight: '800', marginTop: 6, fontSize: 12 },
  announcementCard: { gap: 6 },
  announceTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  announcementTitle: { color: COLORS.text, fontSize: 15, fontWeight: '900' },
  announcementBody: { color: COLORS.muted, lineHeight: 19 },
  announcementTime: { color: COLORS.faint, fontSize: 11 },
});

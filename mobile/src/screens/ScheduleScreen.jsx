import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, FlatList, TouchableOpacity,
  TextInput, StyleSheet, ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth }      from '../context/AuthContext';
import { scheduleAPI, searchAPI, notificationAPI, announcementAPI, authAPI } from '../api/index';
import { COLORS, SPACING, RADIUS } from '../theme';
import { formatTime, daysArrayToString, timeAgo } from '../utils/helpers';

// ─── Schedule Screen ──────────────────────────────────────────
export default function ScheduleScreen() {
  const [sections,  setSections]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const today = new Date().getDay();

  const load = useCallback(async () => {
    try {
      const { data } = await scheduleAPI.getMy({ semester: 'spring', academic_year: '2025/2026' });
      setSections(data.data.sections);
    } catch { Alert.alert('Error', 'Failed to load schedule'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Group by day
  const byDay = {};
  sections.forEach(s => {
    (s.day_of_week || []).forEach(d => {
      if (!byDay[d]) byDay[d] = [];
      byDay[d].push(s);
    });
  });

  const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  if (loading) return <View style={[s.center,{flex:1}]}><ActivityIndicator color={COLORS.najahBlue} size="large" /></View>;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}><Text style={s.headerTitle}>My Schedule</Text></View>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
        {sections.length === 0 ? (
          <View style={s.empty}><Text style={s.emptyIcon}>📅</Text><Text style={s.emptyTitle}>No sections enrolled</Text></View>
        ) : (
          [0,1,2,3,4,5].map(day => (
            <View key={day} style={s.dayBlock}>
              <View style={[s.dayHeader, day === today && s.dayHeaderToday]}>
                <Text style={[s.dayName, day === today && { color: COLORS.najahBlue, fontWeight: '700' }]}>{DAY_NAMES[day]}</Text>
                {day === today && <View style={s.todayPill}><Text style={s.todayPillText}>Today</Text></View>}
              </View>
              {(byDay[day] || []).length === 0
                ? <Text style={s.freeTxt}>Free</Text>
                : (byDay[day] || []).map(sec => <ClassCard key={sec.section_id} sec={sec} today={day === today} />)
              }
            </View>
          ))
        )}
        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function ClassCard({ sec, today }) {
  const now = new Date().toTimeString().slice(0,5);
  const isNow = today && sec.start_time <= now && sec.end_time > now;
  return (
    <View style={[s.classCard, isNow && s.classCardActive]}>
      {isNow && <View style={s.nowBadge}><Text style={s.nowText}>NOW</Text></View>}
      <Text style={s.classTime}>{formatTime(sec.start_time)} – {formatTime(sec.end_time)}</Text>
      <Text style={s.classCode}>{sec.course_code}</Text>
      <Text style={s.className}>{sec.course_name}</Text>
      {sec.room_number && <Text style={s.classRoom}>📍 Room {sec.room_number} · {sec.building_code}</Text>}
      {sec.instructor_name && <Text style={s.classInst}>{sec.instructor_name}</Text>}
    </View>
  );
}

// ─── Search Screen ────────────────────────────────────────────
export function SearchScreen() {
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async q => {
    if (!q || q.trim().length < 2) { setResults(null); return; }
    setLoading(true);
    try {
      const { data } = await searchAPI.global({ q });
      setResults(data.data);
    } catch { Alert.alert('Error','Search failed'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => search(query), 400);
    return () => clearTimeout(timer);
  }, [query, search]);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}><Text style={s.headerTitle}>Search</Text></View>
      <View style={{ padding: SPACING.md, borderBottomWidth: 1, borderColor: COLORS.border }}>
        <TextInput
          style={s.searchInput}
          value={query} onChangeText={setQuery}
          placeholder="Search rooms, courses, instructors…"
          placeholderTextColor={COLORS.muted}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>
      {loading && <View style={s.center}><ActivityIndicator color={COLORS.najahBlue} /></View>}
      {!loading && results && (
        <ScrollView>
          {/* Rooms */}
          {results.results?.rooms?.length > 0 && (
            <View>
              <Text style={s.sectionLabel}>Rooms ({results.results.rooms.length})</Text>
              {results.results.rooms.map(r => (
                <View key={r.id} style={s.resultItem}>
                  <Text style={s.resultNum}>{r.room_number}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.resultName}>{r.name}</Text>
                    <Text style={s.resultSub}>{r.building_name} · {r.floor_label} · {r.type.replace('_',' ')}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
          {/* Courses */}
          {results.results?.courses?.length > 0 && (
            <View>
              <Text style={s.sectionLabel}>Courses ({results.results.courses.length})</Text>
              {results.results.courses.map(c => (
                <View key={c.id} style={s.resultItem}>
                  <Text style={s.resultNum}>{c.code}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.resultName}>{c.name}</Text>
                    <Text style={s.resultSub}>{c.department}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
          {results.total === 0 && (
            <View style={s.empty}><Text style={s.emptyIcon}>🔍</Text><Text style={s.emptyTitle}>No results for "{query}"</Text></View>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
      {!loading && !results && (
        <View style={s.empty}><Text style={s.emptyIcon}>🔍</Text><Text style={s.emptyTitle}>Search anything</Text><Text style={s.emptySub}>Enter a room number, course, or instructor name</Text></View>
      )}
    </SafeAreaView>
  );
}

// ─── Notifications Screen ─────────────────────────────────────
export function NotifScreen() {
  const [notifs,    setNotifs]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const [unread,    setUnread]    = useState(0);

  const load = useCallback(async () => {
    try {
      const { data } = await notificationAPI.getMy({ limit: 30 });
      setNotifs(data.data.notifications);
      setUnread(data.data.unread_count);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const markRead = async id => {
    await notificationAPI.markRead(id);
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnread(p => Math.max(0, p - 1));
  };

  const markAll = async () => {
    await notificationAPI.markAllRead();
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnread(0);
  };

  if (loading) return <View style={[s.center,{flex:1}]}><ActivityIndicator color={COLORS.najahBlue} size="large" /></View>;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={[s.header, { flexDirection:'row', justifyContent:'space-between', alignItems:'center' }]}>
        <Text style={s.headerTitle}>Notifications {unread > 0 ? `(${unread})` : ''}</Text>
        {unread > 0 && <TouchableOpacity onPress={markAll}><Text style={{ color: COLORS.najahMid, fontSize: 12, fontWeight:'600' }}>Mark all read</Text></TouchableOpacity>}
      </View>
      <FlatList
        data={notifs}
        keyExtractor={i => i.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        renderItem={({ item: n }) => (
          <TouchableOpacity onPress={() => !n.is_read && markRead(n.id)}
            style={[s.notifItem, !n.is_read && s.notifItemUnread]}
          >
            {!n.is_read && <View style={s.notifDot} />}
            <View style={{ flex: 1 }}>
              <Text style={[s.notifTitle, !n.is_read && { fontWeight: '700' }]}>{n.title}</Text>
              <Text style={s.notifBody} numberOfLines={2}>{n.body}</Text>
              <Text style={s.notifTime}>{timeAgo(n.published_at)}</Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<View style={s.empty}><Text style={s.emptyIcon}>🔔</Text><Text style={s.emptyTitle}>No notifications</Text></View>}
      />
    </SafeAreaView>
  );
}

// ─── Profile Screen ───────────────────────────────────────────
export function ProfileScreen() {
  const { user, logout, updateUser } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}><Text style={s.headerTitle}>Profile</Text></View>
      <ScrollView>
        {/* Avatar + name */}
        <View style={s.profileCard}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{user?.first_name?.[0]}{user?.last_name?.[0]}</Text>
          </View>
          <Text style={s.profileName}>{user?.first_name} {user?.last_name}</Text>
          <Text style={s.profileEmail}>{user?.email}</Text>
          <View style={s.profileBadges}>
            <View style={s.badgePill}><Text style={s.badgePillText}>{user?.role?.replace('_',' ')}</Text></View>
            {user?.student_id && <View style={s.badgePill}><Text style={s.badgePillText}>{user.student_id}</Text></View>}
          </View>
        </View>

        {/* Info rows */}
        <View style={s.infoCard}>
          {[
            ['Department', user?.department || '—'],
            ['Year',       user?.year_of_study ? `Year ${user.year_of_study}` : '—'],
            ['Member since', user?.created_at ? new Date(user.created_at).getFullYear() : '—'],
          ].map(([label, value]) => (
            <View key={label} style={s.infoRow}>
              <Text style={s.infoLabel}>{label}</Text>
              <Text style={s.infoValue}>{value}</Text>
            </View>
          ))}
        </View>

        {/* Sign out */}
        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
          <Text style={s.logoutText}>Sign Out</Text>
        </TouchableOpacity>
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Announcement Screen ──────────────────────────────────────
export function AnnouncementScreen() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    announcementAPI.getAll({ limit: 20 })
      .then(({ data }) => setItems(data.data.announcements))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <View style={[s.center,{flex:1}]}><ActivityIndicator color={COLORS.najahBlue} size="large" /></View>;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}><Text style={s.headerTitle}>Announcements</Text></View>
      <FlatList
        data={items}
        keyExtractor={i => i.id}
        renderItem={({ item: a }) => (
          <View style={s.announceItem}>
            {a.is_pinned && <Text style={{ fontSize: 16, marginBottom: 4 }}>📌</Text>}
            <Text style={s.announceTitle}>{a.title}</Text>
            <Text style={s.announceBody} numberOfLines={3}>{a.content}</Text>
            <Text style={s.announceTime}>{timeAgo(a.published_at)}</Text>
          </View>
        )}
        ListEmptyComponent={<View style={s.empty}><Text style={s.emptyIcon}>📢</Text><Text style={s.emptyTitle}>No announcements</Text></View>}
      />
    </SafeAreaView>
  );
}

// ─── Shared styles ────────────────────────────────────────────
const s = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: COLORS.bg },
  center:     { alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  header:     { backgroundColor: COLORS.najahBlue, paddingHorizontal: SPACING.lg, paddingVertical: 14, borderBottomWidth: 2, borderBottomColor: COLORS.gold },
  headerTitle:{ color: '#fff', fontSize: 18, fontWeight: '700' },
  empty:      { alignItems: 'center', padding: SPACING.xl * 2 },
  emptyIcon:  { fontSize: 40, marginBottom: SPACING.md },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginBottom: 4 },
  emptySub:   { fontSize: 13, color: COLORS.muted, textAlign: 'center' },

  // Schedule
  dayBlock:       { marginBottom: 2 },
  dayHeader:      { backgroundColor: COLORS.panel, paddingHorizontal: SPACING.lg, paddingVertical: 8, borderBottomWidth: 1, borderColor: COLORS.border, flexDirection: 'row', alignItems: 'center', gap: 8 },
  dayHeaderToday: { backgroundColor: COLORS.najahLight },
  dayName:        { fontSize: 13, fontWeight: '600', color: COLORS.muted },
  todayPill:      { backgroundColor: COLORS.green, paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.full },
  todayPillText:  { color: '#fff', fontSize: 10, fontWeight: '700' },
  freeTxt:        { padding: SPACING.md, fontSize: 12, color: COLORS.muted, paddingHorizontal: SPACING.lg },
  classCard:      { backgroundColor: COLORS.panel, marginHorizontal: SPACING.lg, marginTop: SPACING.sm, padding: SPACING.md, borderRadius: RADIUS.md, borderLeftWidth: 3, borderLeftColor: COLORS.najahMid, position: 'relative' },
  classCardActive:{ backgroundColor: COLORS.greenBg, borderLeftColor: COLORS.green },
  nowBadge:       { position: 'absolute', top: 8, right: 8, backgroundColor: COLORS.green, paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.full },
  nowText:        { color: '#fff', fontSize: 9, fontWeight: '800' },
  classTime:      { fontFamily: 'Courier New', fontSize: 11, color: COLORS.muted, marginBottom: 2 },
  classCode:      { fontSize: 14, fontWeight: '700', color: COLORS.text },
  className:      { fontSize: 12, color: COLORS.muted },
  classRoom:      { fontSize: 11, color: COLORS.najahMid, marginTop: 2 },
  classInst:      { fontSize: 11, color: COLORS.muted },

  // Search
  searchInput:    { backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 9, fontSize: 14, color: COLORS.text },
  sectionLabel:   { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, color: COLORS.muted, paddingHorizontal: SPACING.lg, paddingVertical: 8, backgroundColor: COLORS.bg },
  resultItem:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: SPACING.lg, paddingVertical: 10, backgroundColor: COLORS.panel, borderBottomWidth: 0.5, borderColor: COLORS.border },
  resultNum:      { fontFamily: 'Courier New', fontWeight: '700', color: COLORS.najahBlue, width: 50 },
  resultName:     { fontSize: 13, fontWeight: '500', color: COLORS.text },
  resultSub:      { fontSize: 11, color: COLORS.muted },

  // Notifications
  notifItem:      { flexDirection: 'row', gap: 10, padding: SPACING.lg, backgroundColor: COLORS.panel, borderBottomWidth: 0.5, borderColor: COLORS.border },
  notifItemUnread:{ backgroundColor: '#e8f0fb' },
  notifDot:       { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.najahBlue, marginTop: 5, flexShrink: 0 },
  notifTitle:     { fontSize: 14, fontWeight: '500', color: COLORS.text, marginBottom: 3 },
  notifBody:      { fontSize: 12, color: COLORS.muted, marginBottom: 4 },
  notifTime:      { fontSize: 11, color: COLORS.textFaint },

  // Profile
  profileCard:    { backgroundColor: COLORS.najahBlue, padding: SPACING.xl, alignItems: 'center' },
  avatar:         { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.gold, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md, borderWidth: 3, borderColor: 'rgba(255,255,255,0.3)' },
  avatarText:     { fontSize: 24, fontWeight: '700', color: COLORS.najahBlue },
  profileName:    { fontSize: 20, fontWeight: '700', color: '#fff', marginBottom: 4 },
  profileEmail:   { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: SPACING.sm },
  profileBadges:  { flexDirection: 'row', gap: 6 },
  badgePill:      { backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: RADIUS.full },
  badgePillText:  { fontSize: 11, color: '#fff', fontWeight: '600' },
  infoCard:       { backgroundColor: COLORS.panel, margin: SPACING.lg, borderRadius: RADIUS.lg, overflow: 'hidden' },
  infoRow:        { flexDirection: 'row', justifyContent: 'space-between', padding: SPACING.md, borderBottomWidth: 0.5, borderColor: COLORS.border },
  infoLabel:      { fontSize: 13, color: COLORS.muted },
  infoValue:      { fontSize: 13, fontWeight: '600', color: COLORS.text },
  logoutBtn:      { margin: SPACING.lg, backgroundColor: COLORS.redBg, padding: SPACING.md, borderRadius: RADIUS.md, alignItems: 'center', borderWidth: 1, borderColor: COLORS.redBorder },
  logoutText:     { color: COLORS.red, fontWeight: '700', fontSize: 15 },

  // Announcements
  announceItem:   { backgroundColor: COLORS.panel, padding: SPACING.lg, borderBottomWidth: 1, borderColor: COLORS.border },
  announceTitle:  { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
  announceBody:   { fontSize: 13, color: COLORS.muted, lineHeight: 20, marginBottom: 6 },
  announceTime:   { fontSize: 11, color: COLORS.textFaint },
});

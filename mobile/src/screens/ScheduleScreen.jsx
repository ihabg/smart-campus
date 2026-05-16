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
import { scheduleAPI } from '../api';
import { Card, EmptyState, LoadingState, Pill, ScreenHeader } from '../components/ui';
import { COLORS, RADIUS, SPACING } from '../theme';
import { cleanTime, dayName, getErrorMessage, unwrapApi } from '../utils/helpers';

const SEMESTERS = [
  { value: 'fall', label: 'First' },
  { value: 'spring', label: 'Second' },
  { value: 'summer', label: 'Summer' },
];

const YEARS = ['2025/2026', '2024/2025', '2023/2024'];
const DAYS = [0, 1, 2, 3, 4, 5, 6];

export default function ScheduleScreen({ navigation }) {
  const [semester, setSemester] = useState('spring');
  const [year, setYear] = useState('2025/2026');
  const [sections, setSections] = useState([]);
  const [byDay, setByDay] = useState({});
  const [selectedDay, setSelectedDay] = useState(new Date().getDay());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await scheduleAPI.getMy({
        semester,
        academic_year: year,
      });
      const payload = unwrapApi(response);
      setSections(payload.sections || []);
      setByDay(payload.by_day || {});
    } catch (error) {
      Alert.alert('Error', getErrorMessage(error, 'Failed to load schedule.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [semester, year]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const meetings = useMemo(() => {
    const fromByDay = byDay?.[selectedDay] || byDay?.[String(selectedDay)] || [];

    if (fromByDay.length) {
      return [...fromByDay].sort((a, b) => cleanTime(a.start_time).localeCompare(cleanTime(b.start_time)));
    }

    const generated = [];
    sections.forEach((section) => {
      (section.meetings || []).forEach((meeting) => {
        if (Number(meeting.day_of_week) === Number(selectedDay)) {
          generated.push({ ...section, ...meeting });
        }
      });
    });

    return generated.sort((a, b) => cleanTime(a.start_time).localeCompare(cleanTime(b.start_time)));
  }, [byDay, sections, selectedDay]);

  const totalCredits = useMemo(() => {
    return sections.reduce((sum, item) => sum + Number(item.credit_hours || 0), 0);
  }, [sections]);

  if (loading) {
    return <LoadingState />;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        title="My Schedule"
        subtitle={`${sections.length} sections · ${totalCredits} credit hours`}
      />

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
        <Card style={styles.filtersCard}>
          <Text style={styles.filterLabel}>Semester</Text>
          <View style={styles.chipRow}>
            {SEMESTERS.map((item) => (
              <TouchableOpacity
                key={item.value}
                style={[styles.chip, semester === item.value && styles.chipActive]}
                onPress={() => setSemester(item.value)}
              >
                <Text style={[styles.chipText, semester === item.value && styles.chipTextActive]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.filterLabel, { marginTop: 12 }]}>Academic Year</Text>
          <View style={styles.chipRow}>
            {YEARS.map((item) => (
              <TouchableOpacity
                key={item}
                style={[styles.yearChip, year === item && styles.chipActive]}
                onPress={() => setYear(item)}
              >
                <Text style={[styles.chipText, year === item && styles.chipTextActive]}>{item}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.daysRow}>
          {DAYS.map((day) => {
            const count = (byDay?.[day] || byDay?.[String(day)] || []).length;
            const active = Number(selectedDay) === day;

            return (
              <TouchableOpacity
                key={day}
                style={[styles.dayPill, active && styles.dayPillActive]}
                onPress={() => setSelectedDay(day)}
              >
                <Text style={[styles.dayText, active && styles.dayTextActive]}>{dayName(day).slice(0, 3)}</Text>
                <Text style={[styles.dayCount, active && styles.dayTextActive]}>{count} class</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>{dayName(selectedDay)}</Text>
          <Pill>{meetings.length} meeting{meetings.length !== 1 ? 's' : ''}</Pill>
        </View>

        {sections.length === 0 ? (
          <Card>
            <EmptyState
              icon="📅"
              title="No registered courses"
              subtitle="No courses were found for this semester."
            />
          </Card>
        ) : meetings.length === 0 ? (
          <Card>
            <EmptyState
              icon="☕"
              title="Free day"
              subtitle="No classes on this day."
            />
          </Card>
        ) : (
          meetings.map((meeting, index) => (
            <ClassCard
              key={`${meeting.section_id}-${meeting.meeting_id || index}`}
              meeting={meeting}
              onOpenMap={() =>
                navigation.navigate('MapTab', {
                  roomId: meeting.room_id,
                  roomNumber: meeting.room_number,
                })
              }
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ClassCard({ meeting, onOpenMap }) {
  const now = new Date().toTimeString().slice(0, 5);
  const isToday = Number(meeting.day_of_week) === new Date().getDay();
  const isNow = isToday && cleanTime(meeting.start_time) <= now && cleanTime(meeting.end_time) > now;

  return (
    <TouchableOpacity onPress={onOpenMap} activeOpacity={0.82}>
      <Card style={[styles.classCard, isNow && styles.classNow]}>
        <View style={styles.timeCol}>
          <Text style={styles.startTime}>{cleanTime(meeting.start_time)}</Text>
          <Text style={styles.endTime}>{cleanTime(meeting.end_time)}</Text>
          {isNow ? <Pill color={COLORS.green} textColor="#fff">NOW</Pill> : null}
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.courseCode}>{meeting.course_code}</Text>
          <Text style={styles.courseName} numberOfLines={2}>
            {meeting.course_name_ar || meeting.course_name}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>📍 Room {meeting.room_number || '—'}</Text>
          </View>
          <Text style={styles.instructor}>{meeting.instructor_name || '—'}</Text>
        </View>
      </Card>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, gap: SPACING.md },
  filtersCard: { padding: SPACING.md },
  filterLabel: { color: COLORS.muted, fontSize: 12, fontWeight: '900', marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flex: 1, minWidth: 86, alignItems: 'center', paddingVertical: 9, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.full, backgroundColor: COLORS.bg },
  yearChip: { alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.full, backgroundColor: COLORS.bg },
  chipActive: { backgroundColor: COLORS.najahBlue, borderColor: COLORS.najahBlue },
  chipText: { color: COLORS.muted, fontWeight: '900', fontSize: 12 },
  chipTextActive: { color: '#fff' },
  daysRow: { gap: 8, paddingVertical: 2 },
  dayPill: { width: 82, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.panel, borderRadius: RADIUS.lg, padding: 10, alignItems: 'center' },
  dayPillActive: { backgroundColor: COLORS.najahBlue, borderColor: COLORS.najahBlue },
  dayText: { color: COLORS.text, fontWeight: '900' },
  dayTextActive: { color: '#fff' },
  dayCount: { color: COLORS.muted, fontSize: 10, marginTop: 3 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: COLORS.text, fontSize: 18, fontWeight: '900' },
  classCard: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.sm },
  classNow: { borderColor: COLORS.green, backgroundColor: COLORS.greenBg },
  timeCol: { width: 75, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: COLORS.border, paddingRight: SPACING.md },
  startTime: { color: COLORS.najahBlue, fontWeight: '900', fontSize: 16 },
  endTime: { color: COLORS.muted, fontSize: 12, marginTop: 3, marginBottom: 8 },
  courseCode: { color: COLORS.text, fontWeight: '900', fontSize: 16 },
  courseName: { color: COLORS.muted, marginTop: 3, lineHeight: 19 },
  metaRow: { marginTop: 8 },
  metaText: { color: COLORS.najahMid, fontSize: 12, fontWeight: '800' },
  instructor: { color: COLORS.faint, marginTop: 4, fontSize: 12 },
});

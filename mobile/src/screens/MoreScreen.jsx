import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { Card, ScreenHeader } from '../components/ui';
import { COLORS, RADIUS, SPACING } from '../theme';

const ITEMS = [
  { title: 'Campus Assistant', subtitle: 'Ask about rooms and schedule', icon: '🤖', screen: 'Chat' },
  { title: 'Notifications', subtitle: 'Alerts and reminders', icon: '🔔', screen: 'Notifications' },
  { title: 'Announcements', subtitle: 'University news', icon: '📢', screen: 'Announcements' },
  { title: 'Profile', subtitle: 'Account settings', icon: '👤', screen: 'Profile' },
];

export default function MoreScreen({ navigation }) {
  const { user } = useAuth();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="More" subtitle="Smart Campus tools" />
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.userCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.first_name?.[0] || ''}{user?.last_name?.[0] || ''}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{user?.first_name} {user?.last_name}</Text>
            <Text style={styles.email}>{user?.email}</Text>
          </View>
        </Card>

        {ITEMS.map((item) => (
          <TouchableOpacity key={item.screen} onPress={() => navigation.navigate(item.screen)} activeOpacity={0.82}>
            <Card style={styles.row}>
              <Text style={styles.icon}>{item.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.subtitle}>{item.subtitle}</Text>
              </View>
              <Text style={styles.arrow}>›</Text>
            </Card>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, gap: SPACING.md },
  userCard: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.gold, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: COLORS.najahBlue, fontWeight: '900', fontSize: 20 },
  name: { color: COLORS.text, fontWeight: '900', fontSize: 16 },
  email: { color: COLORS.muted, marginTop: 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  icon: { width: 42, height: 42, textAlign: 'center', textAlignVertical: 'center', backgroundColor: COLORS.najahLight, borderRadius: RADIUS.md, fontSize: 21 },
  title: { color: COLORS.text, fontWeight: '900' },
  subtitle: { color: COLORS.muted, fontSize: 12, marginTop: 3 },
  arrow: { color: COLORS.faint, fontSize: 28 },
});

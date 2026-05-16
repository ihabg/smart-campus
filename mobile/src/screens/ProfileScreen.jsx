import React, { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import { Card, PrimaryButton, ScreenHeader } from '../components/ui';
import { COLORS, RADIUS, SPACING } from '../theme';
import { getErrorMessage, unwrapApi } from '../utils/helpers';

export default function ProfileScreen() {
  const { user, updateUser, logout } = useAuth();
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    department: user?.department || '',
  });

  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setLoading(true);
    try {
      const response = await authAPI.updateProfile(form);
      const payload = unwrapApi(response);
      updateUser(payload.user || form);
      setEditing(false);
      Alert.alert('Saved', 'Profile updated successfully.');
    } catch (error) {
      Alert.alert('Error', getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  function confirmLogout() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: logout },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Profile" subtitle="Account information" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.first_name?.[0] || ''}{user?.last_name?.[0] || ''}</Text>
          </View>
          <Text style={styles.name}>{user?.first_name} {user?.last_name}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          <Text style={styles.role}>{String(user?.role || 'student').replace(/_/g, ' ')}</Text>
        </View>

        <Card style={styles.card}>
          <Info label="Student ID" value={user?.student_id || '—'} />
          <Info label="Department" value={user?.department || '—'} />
          <Info label="Status" value={user?.status || 'active'} />
        </Card>

        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Edit Profile</Text>
            <TouchableOpacity onPress={() => setEditing((current) => !current)}>
              <Text style={styles.editText}>{editing ? 'Cancel' : 'Edit'}</Text>
            </TouchableOpacity>
          </View>

          {editing ? (
            <>
              <Field label="First Name" value={form.first_name} onChangeText={(v) => set('first_name', v)} />
              <Field label="Last Name" value={form.last_name} onChangeText={(v) => set('last_name', v)} />
              <Field label="Department" value={form.department} onChangeText={(v) => set('department', v)} />
              <PrimaryButton title="Save Changes" onPress={save} loading={loading} />
            </>
          ) : (
            <Text style={styles.hint}>Tap Edit to update your basic information.</Text>
          )}
        </Card>

        <TouchableOpacity style={styles.logoutButton} onPress={confirmLogout}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Info({ label, value }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function Field({ label, ...props }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor={COLORS.faint} {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, gap: SPACING.md },
  hero: { backgroundColor: COLORS.najahBlue, borderRadius: RADIUS.xl, padding: SPACING.xl, alignItems: 'center' },
  avatar: { width: 82, height: 82, borderRadius: 41, backgroundColor: COLORS.gold, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md },
  avatarText: { color: COLORS.najahBlue, fontWeight: '900', fontSize: 26 },
  name: { color: '#fff', fontSize: 21, fontWeight: '900' },
  email: { color: 'rgba(255,255,255,0.75)', marginTop: 4 },
  role: { color: '#fff', backgroundColor: 'rgba(255,255,255,0.16)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: RADIUS.full, marginTop: 10, overflow: 'hidden', fontWeight: '800' },
  card: { gap: SPACING.sm },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  infoLabel: { color: COLORS.muted, fontWeight: '800' },
  infoValue: { color: COLORS.text, fontWeight: '900' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { color: COLORS.text, fontSize: 16, fontWeight: '900' },
  editText: { color: COLORS.najahMid, fontWeight: '900' },
  hint: { color: COLORS.muted, lineHeight: 20 },
  field: { gap: 6 },
  fieldLabel: { color: COLORS.text, fontWeight: '800', fontSize: 12 },
  input: { height: 44, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, backgroundColor: COLORS.bg, paddingHorizontal: SPACING.md, color: COLORS.text },
  logoutButton: { backgroundColor: COLORS.redBg, borderWidth: 1, borderColor: '#f3b8b8', borderRadius: RADIUS.md, padding: SPACING.md, alignItems: 'center' },
  logoutText: { color: COLORS.red, fontWeight: '900' },
});

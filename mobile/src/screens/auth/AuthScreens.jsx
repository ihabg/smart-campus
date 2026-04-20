import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth }  from '../../context/AuthContext';
import { COLORS, SPACING, RADIUS } from '../../theme';

// ─── Login ────────────────────────────────────────────────────
export function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (err) {
        console.error('Login error:', err);
    Alert.alert('Login Failed', err.response?.data?.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
          {/* Brand */}
          <View style={s.brand}>
            <View style={s.logo}><Text style={s.logoText}>AN</Text></View>
            <Text style={s.brandTitle}>Smart Campus</Text>
            <Text style={s.brandSub}>An-Najah National University</Text>
          </View>

          {/* Card */}
          <View style={s.card}>
            <Text style={s.heading}>Sign In</Text>

            <View style={s.field}>
              <Text style={s.label}>Email</Text>
              <TextInput
                style={s.input} value={email} onChangeText={setEmail}
                placeholder="you@najah.edu" placeholderTextColor={COLORS.muted}
                keyboardType="email-address" autoCapitalize="none" autoComplete="email"
              />
            </View>

            <View style={s.field}>
              <Text style={s.label}>Password</Text>
              <TextInput
                style={s.input} value={password} onChangeText={setPassword}
                placeholder="••••••••" placeholderTextColor={COLORS.muted}
                secureTextEntry autoComplete="password"
              />
            </View>

            <TouchableOpacity style={s.btn} onPress={handleLogin} disabled={loading}>
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.btnText}>Sign In</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity onPress={() => navigation.navigate('Register')} style={s.link}>
              <Text style={s.linkText}>Don't have an account? <Text style={s.linkBold}>Register</Text></Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Register ─────────────────────────────────────────────────
export function RegisterScreen({ navigation }) {
  const { register } = useAuth();
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '',
    password: '', student_id: '', department: '',
  });
  const [loading, setLoading] = useState(false);
  const set = k => v => setForm(f => ({ ...f, [k]: v }));

  const handleRegister = async () => {
    const { first_name, last_name, email, password } = form;
    if (!first_name || !last_name || !email || !password) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }
    if (password.length < 8) { Alert.alert('Error', 'Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      const payload = { ...form };
      if (!payload.student_id) delete payload.student_id;
      if (!payload.department) delete payload.department;
      await register(payload);
    } catch (err) {
      Alert.alert('Registration Failed', err.response?.data?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
          <View style={s.brand}>
            <View style={s.logo}><Text style={s.logoText}>AN</Text></View>
            <Text style={s.brandTitle}>Smart Campus</Text>
            <Text style={s.brandSub}>Create Your Account</Text>
          </View>

          <View style={s.card}>
            <Text style={s.heading}>Register</Text>

            {[
              { key: 'first_name', label: 'First Name *',  placeholder: 'Ahmad' },
              { key: 'last_name',  label: 'Last Name *',   placeholder: 'Hasan' },
              { key: 'email',      label: 'Email *',       placeholder: 'you@najah.edu', keyboard: 'email-address' },
              { key: 'password',   label: 'Password *',    placeholder: '8+ chars, 1 uppercase, 1 number', secure: true },
              { key: 'student_id', label: 'Student ID',    placeholder: 'Optional' },
              { key: 'department', label: 'Department',    placeholder: 'e.g. Computer Engineering' },
            ].map(f => (
              <View key={f.key} style={s.field}>
                <Text style={s.label}>{f.label}</Text>
                <TextInput
                  style={s.input}
                  value={form[f.key]}
                  onChangeText={set(f.key)}
                  placeholder={f.placeholder}
                  placeholderTextColor={COLORS.muted}
                  keyboardType={f.keyboard || 'default'}
                  autoCapitalize={f.keyboard === 'email-address' ? 'none' : 'words'}
                  secureTextEntry={!!f.secure}
                />
              </View>
            ))}

            <TouchableOpacity style={s.btn} onPress={handleRegister} disabled={loading}>
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.btnText}>Create Account</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity onPress={() => navigation.navigate('Login')} style={s.link}>
              <Text style={s.linkText}>Already have an account? <Text style={s.linkBold}>Sign In</Text></Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: COLORS.najahBlue },
  container:  { flexGrow: 1, padding: SPACING.xl, justifyContent: 'center' },
  brand:      { alignItems: 'center', marginBottom: SPACING.xl },
  logo:       { width: 56, height: 56, borderRadius: RADIUS.md, backgroundColor: COLORS.gold, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.sm },
  logoText:   { fontSize: 22, fontWeight: '800', color: COLORS.najahBlue, fontFamily: 'Courier New' },
  brandTitle: { fontSize: 22, fontWeight: '700', color: '#fff', marginBottom: 2 },
  brandSub:   { fontSize: 12, color: 'rgba(255,255,255,0.6)' },
  card:       { backgroundColor: COLORS.panel, borderRadius: RADIUS.xl, padding: SPACING.xl },
  heading:    { fontSize: 20, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.lg },
  field:      { marginBottom: SPACING.md },
  label:      { fontSize: 13, fontWeight: '600', color: COLORS.text, marginBottom: SPACING.xs },
  input:      { backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 10, fontSize: 14, color: COLORS.text },
  btn:        { backgroundColor: COLORS.najahBlue, borderRadius: RADIUS.md, padding: SPACING.md, alignItems: 'center', marginTop: SPACING.sm },
  btnText:    { color: '#fff', fontWeight: '700', fontSize: 15 },
  link:       { marginTop: SPACING.lg, alignItems: 'center' },
  linkText:   { fontSize: 13, color: COLORS.muted },
  linkBold:   { color: COLORS.najahBlue, fontWeight: '600' },
});

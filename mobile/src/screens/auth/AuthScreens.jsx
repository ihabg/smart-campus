import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { COLORS, RADIUS, SHADOW, SPACING } from '../../theme';
import { getErrorMessage } from '../../utils/helpers';

export function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email.trim() || !password) {
      Alert.alert('Missing information', 'Please enter your email and password.');
      return;
    }

    setLoading(true);

    try {
      await login(email.trim().toLowerCase(), password);
    } catch (error) {
      Alert.alert('Login failed', getErrorMessage(error, 'Invalid email or password.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <Brand subtitle="An-Najah National University" />

          <View style={styles.card}>
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Sign in to Smart Campus.</Text>

            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@najah.edu"
                placeholderTextColor={COLORS.faint}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={styles.passwordInput}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor={COLORS.faint}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setShowPassword((current) => !current)}
                >
                  <Text style={styles.eyeText}>{showPassword ? 'Hide' : 'Show'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.button, loading && { opacity: 0.7 }]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Sign In</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.link}
              onPress={() => navigation.navigate('Register')}
            >
              <Text style={styles.linkText}>
                Do not have an account? <Text style={styles.linkBold}>Register</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function RegisterScreen({ navigation }) {
  const { register } = useAuth();
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    student_id: '',
    department: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleRegister() {
    if (!form.first_name || !form.last_name || !form.email || !form.password) {
      Alert.alert('Missing information', 'Please fill all required fields.');
      return;
    }

    if (form.password.length < 8) {
      Alert.alert('Weak password', 'Password must be at least 8 characters.');
      return;
    }

    setLoading(true);

    try {
      const payload = { ...form };
      if (!payload.student_id) delete payload.student_id;
      if (!payload.department) delete payload.department;

      await register(payload);
    } catch (error) {
      Alert.alert('Registration failed', getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <Brand subtitle="Create your student account" />

          <View style={styles.card}>
            <Text style={styles.title}>Create account</Text>
            <Text style={styles.subtitle}>Use your university information.</Text>

            <View style={styles.twoCols}>
              <View style={[styles.field, { flex: 1 }]}>
                <Text style={styles.label}>First Name *</Text>
                <TextInput
                  style={styles.input}
                  value={form.first_name}
                  onChangeText={(value) => set('first_name', value)}
                  placeholder="Ahmad"
                  placeholderTextColor={COLORS.faint}
                />
              </View>
              <View style={[styles.field, { flex: 1 }]}>
                <Text style={styles.label}>Last Name *</Text>
                <TextInput
                  style={styles.input}
                  value={form.last_name}
                  onChangeText={(value) => set('last_name', value)}
                  placeholder="Hasan"
                  placeholderTextColor={COLORS.faint}
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Email *</Text>
              <TextInput
                style={styles.input}
                value={form.email}
                onChangeText={(value) => set('email', value)}
                placeholder="you@najah.edu"
                placeholderTextColor={COLORS.faint}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Password *</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={styles.passwordInput}
                  value={form.password}
                  onChangeText={(value) => set('password', value)}
                  placeholder="8+ characters"
                  placeholderTextColor={COLORS.faint}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setShowPassword((current) => !current)}
                >
                  <Text style={styles.eyeText}>{showPassword ? 'Hide' : 'Show'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Student ID</Text>
              <TextInput
                style={styles.input}
                value={form.student_id}
                onChangeText={(value) => set('student_id', value)}
                placeholder="Optional"
                placeholderTextColor={COLORS.faint}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Department</Text>
              <TextInput
                style={styles.input}
                value={form.department}
                onChangeText={(value) => set('department', value)}
                placeholder="Computer Engineering"
                placeholderTextColor={COLORS.faint}
              />
            </View>

            <TouchableOpacity
              style={[styles.button, loading && { opacity: 0.7 }]}
              onPress={handleRegister}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Create Account</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.link}
              onPress={() => navigation.navigate('Login')}
            >
              <Text style={styles.linkText}>
                Already have an account? <Text style={styles.linkBold}>Sign In</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Brand({ subtitle }) {
  return (
    <View style={styles.brand}>
      <View style={styles.logo}>
        <Text style={styles.logoText}>AN</Text>
      </View>
      <Text style={styles.brandTitle}>Smart Campus</Text>
      <Text style={styles.brandSub}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.najahBlue,
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  brand: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  logo: {
    width: 66,
    height: 66,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.gold,
    marginBottom: SPACING.md,
  },
  logoText: {
    color: COLORS.najahBlue,
    fontWeight: '900',
    fontSize: 24,
  },
  brandTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '900',
  },
  brandSub: {
    color: 'rgba(255,255,255,0.72)',
    marginTop: 4,
    fontSize: 12,
  },
  card: {
    backgroundColor: COLORS.panel,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    ...SHADOW.soft,
  },
  title: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: '900',
  },
  subtitle: {
    color: COLORS.muted,
    fontSize: 13,
    marginTop: 5,
    marginBottom: SPACING.lg,
  },
  field: {
    marginBottom: SPACING.md,
  },
  label: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 6,
  },
  input: {
    height: 46,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    color: COLORS.text,
  },
  passwordRow: {
    height: 46,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
    height: '100%',
    paddingHorizontal: SPACING.md,
    color: COLORS.text,
  },
  eyeButton: {
    paddingHorizontal: SPACING.md,
    height: '100%',
    justifyContent: 'center',
  },
  eyeText: {
    color: COLORS.najahBlue,
    fontWeight: '900',
    fontSize: 12,
  },
  twoCols: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  button: {
    minHeight: 48,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.najahBlue,
    marginTop: SPACING.sm,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 15,
  },
  link: {
    alignItems: 'center',
    marginTop: SPACING.lg,
  },
  linkText: {
    color: COLORS.muted,
    fontSize: 13,
  },
  linkBold: {
    color: COLORS.najahBlue,
    fontWeight: '900',
  },
});

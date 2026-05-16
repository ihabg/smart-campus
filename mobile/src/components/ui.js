import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { COLORS, RADIUS, SHADOW, SPACING } from '../theme';

export function ScreenHeader({ title, subtitle, right }) {
  return (
    <View style={ui.header}>
      <View style={{ flex: 1 }}>
        <Text style={ui.headerTitle}>{title}</Text>
        {subtitle ? <Text style={ui.headerSubtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function Card({ children, style }) {
  return <View style={[ui.card, style]}>{children}</View>;
}

export function Pill({ children, color = COLORS.najahLight, textColor = COLORS.najahBlue }) {
  return (
    <View style={[ui.pill, { backgroundColor: color }]}> 
      <Text style={[ui.pillText, { color: textColor }]}>{children}</Text>
    </View>
  );
}

export function PrimaryButton({ title, onPress, loading, disabled, style }) {
  return (
    <TouchableOpacity
      style={[ui.primaryButton, (disabled || loading) && ui.disabled, style]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.82}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={ui.primaryButtonText}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

export function EmptyState({ icon = '✨', title, subtitle }) {
  return (
    <View style={ui.empty}>
      <Text style={ui.emptyIcon}>{icon}</Text>
      <Text style={ui.emptyTitle}>{title}</Text>
      {subtitle ? <Text style={ui.emptySubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function LoadingState() {
  return (
    <View style={ui.loading}>
      <ActivityIndicator size="large" color={COLORS.najahBlue} />
    </View>
  );
}

export const ui = StyleSheet.create({
  header: {
    backgroundColor: COLORS.najahBlue,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.gold,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    marginTop: 3,
  },
  card: {
    backgroundColor: COLORS.panel,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    ...SHADOW.soft,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    alignSelf: 'flex-start',
  },
  pillText: {
    fontSize: 11,
    fontWeight: '800',
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.najahBlue,
    paddingHorizontal: SPACING.lg,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 15,
  },
  disabled: {
    opacity: 0.55,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xxl,
  },
  emptyIcon: {
    fontSize: 42,
    marginBottom: SPACING.md,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: COLORS.text,
    textAlign: 'center',
  },
  emptySubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bg,
  },
});

import React from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { colors, fonts, radius, STATUS_LABELS, statusColor } from "../theme";

export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionLabel({ children }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

export function ScreenTitle({ children, subtitle }) {
  return (
    <View style={{ marginBottom: 18 }}>
      <Text style={styles.title}>{children}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function Badge({ status }) {
  const c = statusColor(status);
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.badgeText, { color: c.fg }]}>{STATUS_LABELS[status] || status}</Text>
    </View>
  );
}

export function Seal({ points, size = 46 }) {
  return (
    <View style={[styles.seal, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.sealText, { fontSize: size * 0.3 }]}>{points}</Text>
    </View>
  );
}

export function PrimaryButton({ title, onPress, loading, disabled, variant = "gold", style }) {
  const bg = { gold: colors.gold, ink: colors.ink, success: colors.success, danger: colors.danger, outline: "transparent" }[variant];
  const fg = variant === "gold" ? colors.ink : variant === "outline" ? colors.ink : colors.white;
  return (
    <TouchableOpacity
      style={[
        styles.btn,
        { backgroundColor: bg, borderWidth: variant === "outline" ? 1 : 0, borderColor: colors.line },
        (disabled || loading) && { opacity: 0.5 },
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.btnText, { color: fg }]}>{title}</Text>}
    </TouchableOpacity>
  );
}

export function StatTile({ label, value, accent }) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, accent && { color: colors.gold }]}>{value}</Text>
    </View>
  );
}

export function EmptyState({ text }) {
  return (
    <View style={{ padding: 30, alignItems: "center" }}>
      <Text style={{ color: colors.inkSoft, fontStyle: "italic", textAlign: "center" }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    marginBottom: 14,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.inkSoft,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  title: { fontFamily: fonts.display, fontSize: 24, fontWeight: "700", color: colors.ink },
  subtitle: { fontSize: 13.5, color: colors.inkSoft, marginTop: 4 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, alignSelf: "flex-start" },
  badgeText: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  seal: {
    borderWidth: 1.5, borderColor: colors.gold, backgroundColor: colors.goldSoft,
    alignItems: "center", justifyContent: "center",
  },
  sealText: { fontFamily: fonts.mono, fontWeight: "700", color: colors.gold },
  btn: { paddingVertical: 13, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  btnText: { fontSize: 14.5, fontWeight: "700" },
  statTile: {
    backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line,
    padding: 14, flexBasis: "48%", marginBottom: 12,
  },
  statLabel: { fontSize: 10.5, fontWeight: "700", color: colors.inkSoft, textTransform: "uppercase", letterSpacing: 0.4 },
  statValue: { fontFamily: fonts.mono, fontSize: 21, fontWeight: "700", color: colors.ink, marginTop: 6 },
});

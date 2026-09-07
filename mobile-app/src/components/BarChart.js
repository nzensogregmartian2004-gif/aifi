import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../theme";

/**
 * Graphique en barres minimaliste, construit uniquement avec des <View> —
 * volontaire : le projet n'a aucune librairie de charts (pas de
 * react-native-svg), et en ajouter une nécessiterait de relancer un
 * `expo prebuild` natif. Suffisant pour montrer une tendance mensuelle à une
 * micro-finance (croissance clients, volumes décaissés/remboursés...).
 *
 * `data` : [{ label: "2026-07", value: 12000 }, ...] — déjà trié par mois.
 * `formatValue` : (value) => string, pour l'étiquette au-dessus de la barre.
 * `formatLabel` : (label) => string, pour l'étiquette sous la barre (ex: "juil.").
 */
export default function BarChart({ data, color = colors.gold, formatValue, formatLabel, height = 140 }) {
  const values = data.map((d) => d.value);
  const max = Math.max(1, ...values);

  if (!data.length) {
    return (
      <View style={[styles.empty, { height }]}>
        <Text style={styles.emptyText}>Pas encore assez de données</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={[styles.row, { height }]}>
        {data.map((d, i) => {
          const barHeight = Math.max(3, Math.round((d.value / max) * (height - 26)));
          return (
            <View key={i} style={styles.col}>
              <Text style={styles.value} numberOfLines={1}>
                {formatValue ? formatValue(d.value) : d.value}
              </Text>
              <View style={[styles.bar, { height: barHeight, backgroundColor: color }]} />
            </View>
          );
        })}
      </View>
      <View style={styles.row}>
        {data.map((d, i) => (
          <View key={i} style={styles.col}>
            <Text style={styles.label} numberOfLines={1}>
              {formatLabel ? formatLabel(d.label) : d.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%" },
  row: { flexDirection: "row", alignItems: "flex-end" },
  col: { flex: 1, alignItems: "center", justifyContent: "flex-end" },
  bar: { width: "62%", borderRadius: 4, minHeight: 3 },
  value: { fontSize: 9, color: colors.inkSoft, marginBottom: 4, fontWeight: "700" },
  label: { fontSize: 9.5, color: colors.inkSoft, marginTop: 6 },
  empty: { alignItems: "center", justifyContent: "center" },
  emptyText: { fontSize: 12.5, color: colors.inkSoft },
});

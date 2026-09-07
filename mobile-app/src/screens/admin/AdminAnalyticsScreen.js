import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage } from "../../api/client";
import { ScreenTitle, Card } from "../../components/ui";
import BarChart from "../../components/BarChart";
import { colors, money } from "../../theme";

const MONTH_LABELS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
function formatMonthLabel(iso) {
  // iso: "2026-09"
  const [, m] = iso.split("-");
  return MONTH_LABELS[Number(m) - 1] || iso;
}
function compactMoney(v) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${Math.round(v / 1000)}k`;
  return String(v);
}

function Kpi({ label, value, sub, color }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, color && { color }]}>{value}</Text>
      {!!sub && <Text style={styles.kpiSub}>{sub}</Text>}
    </View>
  );
}

export default function AdminAnalyticsScreen() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/analytics");
      setData(data);
      setError("");
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.paper }}
      contentContainerStyle={{ padding: 20, paddingTop: 56, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}
    >
      <ScreenTitle subtitle="Croissance, volumes et risque — vue d'ensemble">Analytique</ScreenTitle>

      {!!error && <Card><Text style={{ color: colors.danger }}>{error}</Text></Card>}
      {!data ? (
        <Text style={{ color: colors.inkSoft }}>Chargement...</Text>
      ) : (
        <>
          <View style={styles.kpiGrid}>
            <Kpi label="Clients au total" value={data.kpis.totalClients} sub={`${data.kpis.activeClients} actifs`} />
            <Kpi label="Membres AIFI+" value={data.kpis.premiumClients} color={colors.premium} />
            <Kpi label="Décaissé (total)" value={`${money(data.kpis.totalDisbursedAllTime)} FCFA`} />
            <Kpi label="Remboursé (total)" value={`${money(data.kpis.totalRepaidAllTime)} FCFA`} />
          </View>

          <Text style={styles.sectionLabel}>Nouveaux clients par mois</Text>
          <Card>
            <BarChart
              data={data.monthly.newClients.map((r) => ({ label: r.month, value: r.value }))}
              formatLabel={formatMonthLabel}
              color={colors.gold}
            />
          </Card>

          <Text style={styles.sectionLabel}>Montant décaissé par mois (FCFA)</Text>
          <Card>
            <BarChart
              data={data.monthly.amountDisbursed.map((r) => ({ label: r.month, value: r.value }))}
              formatLabel={formatMonthLabel}
              formatValue={compactMoney}
              color={colors.ink}
            />
          </Card>

          <Text style={styles.sectionLabel}>Montant remboursé par mois (FCFA)</Text>
          <Card>
            <BarChart
              data={data.monthly.amountRepaid.map((r) => ({ label: r.month, value: r.value }))}
              formatLabel={formatMonthLabel}
              formatValue={compactMoney}
              color={colors.success}
            />
          </Card>

          <Text style={styles.sectionLabel}>Risque</Text>
          <Card style={styles.riskCard}>
            <View style={styles.riskRow}>
              <Text style={styles.riskLabel}>Taux de retard actuel</Text>
              <Text style={[styles.riskValue, { color: data.kpis.lateRatePercent > 10 ? colors.danger : colors.ink }]}>
                {data.kpis.lateRatePercent}%
              </Text>
            </View>
            <Text style={styles.riskHint}>
              Part des demandes décaissées/remboursées/en retard qui sont actuellement en retard ({data.kpis.lateLoansCount} prêt(s)).
            </Text>

            <View style={[styles.riskRow, { marginTop: 14 }]}>
              <Text style={styles.riskLabel}>Encours à risque</Text>
              <Text style={styles.riskValue}>{money(data.kpis.totalAtRisk)} FCFA</Text>
            </View>
            <Text style={styles.riskHint}>Somme restant due sur tous les prêts actuellement en retard.</Text>

            <View style={[styles.riskRow, { marginTop: 14 }]}>
              <Text style={styles.riskLabel}>Perte potentielle moyenne / prêt en retard</Text>
              <Text style={styles.riskValue}>{money(data.kpis.averageLossPerLateLoan)} FCFA</Text>
            </View>
            <Text style={styles.riskHint}>
              Estimation, pas une perte confirmée — l'app ne radie pas encore les créances irrécouvrables.
            </Text>
          </Card>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    fontSize: 12, fontWeight: "700", color: colors.inkSoft, textTransform: "uppercase",
    letterSpacing: 0.5, marginTop: 18, marginBottom: 10,
  },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 4 },
  kpi: {
    width: "47%", backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.line,
    padding: 14,
  },
  kpiLabel: { fontSize: 11, color: colors.inkSoft, fontWeight: "600" },
  kpiValue: { fontSize: 19, fontWeight: "800", color: colors.ink, marginTop: 4 },
  kpiSub: { fontSize: 11, color: colors.inkSoft, marginTop: 2 },
  riskCard: { paddingVertical: 16 },
  riskRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  riskLabel: { fontSize: 13.5, color: colors.ink, fontWeight: "600", flex: 1, marginRight: 10 },
  riskValue: { fontSize: 15, fontWeight: "800", color: colors.ink },
  riskHint: { fontSize: 11.5, color: colors.inkSoft, marginTop: 4, lineHeight: 16 },
});

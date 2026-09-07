import React, { useCallback, useState } from "react";
import { View, Text, FlatList, StyleSheet, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage } from "../api/client";
import { Card, ScreenTitle, Badge, PrimaryButton, EmptyState, HelpButton } from "../components/ui";
import MobileMoneyPayModal from "../components/MobileMoneyPayModal";
import HelpDocModal from "../components/HelpDocModal";
import { colors, money } from "../theme";

const REPAYABLE_STATUSES = ["ACCEPTED", "DISBURSED", "LATE"];

export default function AidRequestsScreen({ navigation }) {
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [payTarget, setPayTarget] = useState(null);
  const [payMode, setPayMode] = useState("full"); // "full" = Rembourser | "partial" = Faire une avance
  const [mypvitAvailable, setMypvitAvailable] = useState(false);
  const [minRepaymentAmount, setMinRepaymentAmount] = useState(null);
  const [helpVisible, setHelpVisible] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/client/aid-requests");
      setRequests(data);
      setError("");
    } catch (err) {
      setError(apiErrorMessage(err));
    }
    api.get("/client/settings").then(({ data }) => setMinRepaymentAmount(data.minRepaymentAmount)).catch(() => {});
    api.get("/client/payments/config").then(({ data }) => setMypvitAvailable(data.available)).catch(() => setMypvitAvailable(false));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function openPay(item, mode) {
    setPayMode(mode);
    setPayTarget(item);
  }

  const payTargetRemaining = payTarget
    ? payTarget.amountDue - payTarget.repayments.reduce((s, r) => s + r.amount, 0)
    : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper, paddingTop: 60 }}>
      <View style={{ paddingHorizontal: 20 }}>
        <ScreenTitle subtitle="Suis l'état de tes demandes et remboursements" right={<HelpButton onPress={() => setHelpVisible(true)} />}>
          Mes aides
        </ScreenTitle>
        {!!error && <Card><Text style={{ color: colors.danger }}>{error}</Text></Card>}
        <PrimaryButton title="Nouvelle demande" onPress={() => navigation.navigate("NewAidRequest")} style={{ marginBottom: 14 }} />
      </View>

      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}
        ListEmptyComponent={<EmptyState text="Tu n'as encore fait aucune demande d'aide." />}
        renderItem={({ item }) => {
          const repaid = item.repayments.reduce((s, r) => s + r.amount, 0);
          const remaining = item.amountDue - repaid;
          const canPay = REPAYABLE_STATUSES.includes(item.status);
          return (
            <Card>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <Text style={{ fontSize: 19, fontWeight: "700", color: colors.ink }}>{money(item.amount)} FCFA</Text>
                <Badge status={item.status} />
              </View>
              {item.amountDue !== item.amount && (
                <Text style={styles.meta}>Total à rembourser (frais inclus) : {money(item.amountDue)} FCFA</Text>
              )}
              {item.dueDate && (
                <Text style={styles.meta}>
                  Échéance : {new Date(item.dueDate).toLocaleDateString("fr-FR")}
                </Text>
              )}
              {repaid > 0 && (
                <Text style={styles.meta}>Remboursé : {money(repaid)} / {money(item.amountDue)} FCFA</Text>
              )}
              {canPay && (
                <View style={styles.remainingBadge}>
                  <Text style={styles.remainingBadgeText}>Reste dû : {money(remaining)} FCFA</Text>
                </View>
              )}
              <Text style={styles.metaFaint}>Demandé le {new Date(item.createdAt).toLocaleDateString("fr-FR")}</Text>

              {canPay && (
                mypvitAvailable ? (
                  <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                    <PrimaryButton title="Rembourser" onPress={() => openPay(item, "full")} style={{ flex: 1 }} />
                    <PrimaryButton
                      title="Faire une avance"
                      variant="outline"
                      onPress={() => openPay(item, "partial")}
                      style={{ flex: 1 }}
                    />
                  </View>
                ) : (
                  <View style={styles.unavailableBox}>
                    <Text style={styles.unavailableText}>
                      Le paiement est momentanément indisponible. Réessaie dans quelques instants ou contacte
                      l'administrateur depuis Messages.
                    </Text>
                  </View>
                )
              )}
            </Card>
          );
        }}
      />

      <MobileMoneyPayModal
        visible={!!payTarget}
        aidRequest={payTarget}
        remaining={payTargetRemaining}
        mode={payMode}
        minRepaymentAmount={minRepaymentAmount}
        onClose={() => setPayTarget(null)}
        onDone={() => load()}
      />
      <HelpDocModal visible={helpVisible} onClose={() => setHelpVisible(false)} navigation={navigation} />
    </View>
  );
}

const styles = StyleSheet.create({
  meta: { fontSize: 13, color: colors.inkSoft, marginTop: 8 },
  metaFaint: { fontSize: 11.5, color: colors.inkSoft, marginTop: 6, opacity: 0.7 },
  remainingBadge: {
    alignSelf: "flex-start", backgroundColor: colors.ink, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5, marginTop: 8,
  },
  remainingBadgeText: { color: colors.white, fontSize: 12.5, fontWeight: "700" },
  pendingBox: { backgroundColor: colors.warnSoft, borderRadius: 8, padding: 10, marginTop: 10 },
  pendingText: { fontSize: 12.5, color: colors.warn, fontWeight: "600" },
  unavailableBox: { backgroundColor: colors.paper, borderRadius: 8, padding: 10, marginTop: 10 },
  unavailableText: { fontSize: 12.5, color: colors.inkSoft, lineHeight: 17 },
});

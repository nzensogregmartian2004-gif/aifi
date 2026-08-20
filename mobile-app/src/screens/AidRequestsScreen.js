import React, { useCallback, useState } from "react";
import { View, Text, FlatList, StyleSheet, RefreshControl, Modal, TextInput } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage } from "../api/client";
import { Card, ScreenTitle, Badge, PrimaryButton, EmptyState } from "../components/ui";
import ImageAttach from "../components/ImageAttach";
import MobileMoneyPayModal from "../components/MobileMoneyPayModal";
import { colors, money } from "../theme";

const REPAYABLE_STATUSES = ["ACCEPTED", "DISBURSED", "LATE"];

export default function AidRequestsScreen({ navigation }) {
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [declareTarget, setDeclareTarget] = useState(null);
  const [payTarget, setPayTarget] = useState(null);
  const [payMode, setPayMode] = useState("full"); // "full" = Rembourser | "partial" = Faire une avance
  const [mypvitAvailable, setMypvitAvailable] = useState(false);
  const [minRepaymentAmount, setMinRepaymentAmount] = useState(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [proof, setProof] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

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

  function openDeclare(item) {
    setDeclareTarget(item);
    setAmount("");
    setNote("");
    setProof(null);
    setFormError("");
  }

  function openPay(item, mode) {
    setPayMode(mode);
    setPayTarget(item);
  }

  async function submitDeclare() {
    setFormError("");
    const value = Number(amount);
    if (!value || value <= 0) {
      setFormError("Entre un montant valide");
      return;
    }
    const repaid = declareTarget.repayments.reduce((s, r) => s + r.amount, 0);
    const remaining = declareTarget.amountDue - repaid;
    const isFinalPayment = value === remaining;
    if (!isFinalPayment && minRepaymentAmount && value < minRepaymentAmount) {
      setFormError(
        `Le montant minimum d'une avance est de ${minRepaymentAmount} FCFA (sauf pour solder le reste dû de ${remaining} FCFA).`
      );
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/client/aid-requests/${declareTarget.id}/repayments/declare`, {
        amount: value,
        note,
        proofImageUrl: proof?.url,
      });
      setDeclareTarget(null);
      load();
    } catch (err) {
      setFormError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const payTargetRemaining = payTarget
    ? payTarget.amountDue - payTarget.repayments.reduce((s, r) => s + r.amount, 0)
    : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper, paddingTop: 60 }}>
      <View style={{ paddingHorizontal: 20 }}>
        <ScreenTitle subtitle="Suis l'état de tes demandes et remboursements">Mes aides</ScreenTitle>
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
          const pendingDeclaration = (item.repaymentDeclarations || []).find((d) => d.status === "PENDING");
          const canDeclare = REPAYABLE_STATUSES.includes(item.status) && !pendingDeclaration;
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
              {canDeclare && (
                <View style={styles.remainingBadge}>
                  <Text style={styles.remainingBadgeText}>Reste dû : {money(remaining)} FCFA</Text>
                </View>
              )}
              <Text style={styles.metaFaint}>Demandé le {new Date(item.createdAt).toLocaleDateString("fr-FR")}</Text>

              {pendingDeclaration && (
                <View style={styles.pendingBox}>
                  <Text style={styles.pendingText}>
                    Déclaration de {money(pendingDeclaration.amount)} FCFA en attente de confirmation par l'administrateur.
                  </Text>
                </View>
              )}

              {canDeclare && (
                <>
                  {mypvitAvailable ? (
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
                    <PrimaryButton
                      title="J'ai remboursé"
                      variant="outline"
                      onPress={() => openDeclare(item)}
                      style={{ marginTop: 10 }}
                    />
                  )}
                </>
              )}
            </Card>
          );
        }}
      />

      <Modal visible={!!declareTarget} animationType="slide" transparent onRequestClose={() => setDeclareTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: colors.ink, marginBottom: 4 }}>
              Déclarer un remboursement
            </Text>
            {declareTarget && (
              <View style={styles.remainingBadge}>
                <Text style={styles.remainingBadgeText}>
                  Reste dû : {money(declareTarget.amountDue - declareTarget.repayments.reduce((s, r) => s + r.amount, 0))} FCFA
                </Text>
              </View>
            )}
            <Text style={{ fontSize: 13, color: colors.inkSoft, marginTop: 10, marginBottom: 16 }}>
              Indique le montant que tu as envoyé à l'administrateur (Mobile Money, en main propre, etc.). Il devra le
              confirmer après vérification.
              {minRepaymentAmount ? ` Minimum ${minRepaymentAmount} FCFA par avance, sauf pour solder complètement.` : ""}
            </Text>

            {!!formError && <Text style={{ color: colors.danger, marginBottom: 10 }}>{formError}</Text>}

            <Text style={styles.label}>Montant remboursé (FCFA)</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
              placeholder="Ex: 1500"
            />
            {declareTarget && (
              <PrimaryButton
                title={`Remplir avec le solde (${money(declareTarget.amountDue - declareTarget.repayments.reduce((s, r) => s + r.amount, 0))} FCFA)`}
                variant="outline"
                onPress={() =>
                  setAmount(String(declareTarget.amountDue - declareTarget.repayments.reduce((s, r) => s + r.amount, 0)))
                }
                style={{ marginTop: 8 }}
              />
            )}

            <Text style={styles.label}>Note (optionnel)</Text>
            <TextInput
              style={styles.input}
              value={note}
              onChangeText={setNote}
              placeholder="Ex: envoyé par Orange Money"
            />

            <Text style={styles.label}>Justificatif (optionnel)</Text>
            <ImageAttach
              value={proof}
              onChange={(url, previewUri) => setProof({ url, previewUri })}
              label="Joindre une capture du paiement"
            />

            <PrimaryButton title="Envoyer la déclaration" onPress={submitDeclare} loading={submitting} style={{ marginTop: 10 }} />
            <PrimaryButton title="Annuler" variant="outline" onPress={() => setDeclareTarget(null)} style={{ marginTop: 10 }} />
          </View>
        </View>
      </Modal>

      <MobileMoneyPayModal
        visible={!!payTarget}
        aidRequest={payTarget}
        remaining={payTargetRemaining}
        mode={payMode}
        minRepaymentAmount={minRepaymentAmount}
        onClose={() => setPayTarget(null)}
        onDone={() => load()}
        onFallbackManual={() => { const t = payTarget; setPayTarget(null); openDeclare(t); }}
      />
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
  modalOverlay: { flex: 1, backgroundColor: "rgba(20,33,54,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 22, paddingBottom: 36 },
  label: { fontSize: 12, fontWeight: "700", color: colors.inkSoft, textTransform: "uppercase", marginTop: 10, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, color: colors.ink, backgroundColor: colors.paper,
  },
});

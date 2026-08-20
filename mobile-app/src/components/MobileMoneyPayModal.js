import React, { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Modal, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { api, apiErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { PrimaryButton } from "./ui";
import { colors, money } from "../theme";

const OPERATORS = [
  { code: "AIRTEL_MONEY", label: "Airtel Money" },
  { code: "MOOV_MONEY", label: "Moov Money" },
  { code: "VISA_MASTERCARD", label: "Carte Visa/Mastercard" },
];

const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes, comme recommandé par MyPVit

/**
 * `aidRequest` : l'aide à rembourser. `remaining` : montant restant dû (FCFA).
 * `mode` : "full" solde le reste dû en un clic (montant fixe, non modifiable).
 *          "partial" ("faire une avance") laisse le client choisir un montant,
 *          plafonné au reste dû et soumis au minimum de remboursement partiel.
 * `onDone(success)` est appelé à la fin (paiement confirmé, échoué, ou
 * abandonné) pour que l'écran parent recharge.
 * `onFallbackManual` permet de basculer vers la déclaration manuelle si le
 * paiement échoue ou traîne trop longtemps.
 */
export default function MobileMoneyPayModal({
  visible, aidRequest, remaining, mode = "full", minRepaymentAmount,
  onClose, onDone, onFallbackManual,
}) {
  const { user } = useAuth();
  const [operator, setOperator] = useState("AIRTEL_MONEY");
  const [amount, setAmount] = useState("");
  const [stage, setStage] = useState("form"); // form | pending | success | failed
  const [error, setError] = useState("");
  const [confirmedAt, setConfirmedAt] = useState(null);
  const pollRef = useRef(null);
  const timeoutRef = useRef(null);

  const isPartial = mode === "partial";
  const effectiveAmount = isPartial ? amount : String(remaining || "");

  useEffect(() => {
    if (visible) {
      setStage("form");
      setAmount("");
      setError("");
    }
    return () => {
      clearInterval(pollRef.current);
      clearTimeout(timeoutRef.current);
    };
  }, [visible, mode]);

  async function submit() {
    const value = parseInt(effectiveAmount, 10);
    if (!value || value <= 0) return setError("Entre un montant valide.");
    if (remaining != null && value > remaining) {
      return setError(`Le montant ne peut pas dépasser le reste dû (${money(remaining)} FCFA).`);
    }
    const isFinalPayment = remaining != null && value === remaining;
    if (isPartial && !isFinalPayment && minRepaymentAmount && value < minRepaymentAmount) {
      return setError(`Le montant minimum d'une avance est de ${money(minRepaymentAmount)} FCFA.`);
    }
    setError("");
    setStage("pending");
    try {
      const { data } = await api.post(`/client/aid-requests/${aidRequest.id}/repayments/pay`, {
        amount: value,
        operatorCode: operator,
      });
      pollStatus(data.transactionId);
    } catch (err) {
      setError(apiErrorMessage(err));
      setStage("form");
    }
  }

  function pollStatus(transactionId) {
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/client/payments/${transactionId}/status`);
        if (data.status === "SUCCESS") {
          clearInterval(pollRef.current);
          clearTimeout(timeoutRef.current);
          setConfirmedAt(new Date());
          setStage("success");
          onDone?.(true);
        } else if (data.status === "FAILED") {
          clearInterval(pollRef.current);
          clearTimeout(timeoutRef.current);
          setStage("failed");
        }
      } catch {
        // on continue de sonder, une erreur ponctuelle n'annule pas le paiement
      }
    }, POLL_INTERVAL_MS);

    timeoutRef.current = setTimeout(() => {
      clearInterval(pollRef.current);
      setStage((s) => (s === "pending" ? "timeout" : s));
    }, POLL_TIMEOUT_MS);
  }

  function close() {
    clearInterval(pollRef.current);
    clearTimeout(timeoutRef.current);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {stage === "form" && (
            <>
              <Text style={styles.title}>{isPartial ? "Faire une avance" : "Rembourser"}</Text>

              {remaining != null && (
                <View style={styles.remainingBox}>
                  <Text style={styles.remainingLabel}>Reste dû</Text>
                  <Text style={styles.remainingValue}>{money(remaining)} FCFA</Text>
                </View>
              )}

              <Text style={styles.subtitle}>
                {operator === "VISA_MASTERCARD"
                  ? "Tu recevras un code de validation par SMS pour confirmer le paiement par carte."
                  : `Tu recevras une demande de validation sur ton téléphone (${operator === "AIRTEL_MONEY" ? "Airtel Money" : "Moov Money"}).`}
              </Text>

              <Text style={styles.label}>Opérateur</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                {OPERATORS.map((op) => (
                  <TouchableOpacity
                    key={op.code}
                    onPress={() => setOperator(op.code)}
                    style={[styles.chip, operator === op.code && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, operator === op.code && styles.chipTextActive]}>{op.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {isPartial ? (
                <>
                  <Text style={styles.label}>Montant de l'avance (FCFA)</Text>
                  <TextInput
                    style={styles.input}
                    value={amount}
                    onChangeText={(v) => setAmount(v.replace(/[^0-9]/g, ""))}
                    placeholder={`Max ${remaining != null ? money(remaining) : ""} FCFA`}
                    keyboardType="numeric"
                  />
                  {!!minRepaymentAmount && (
                    <Text style={styles.hint}>Minimum {money(minRepaymentAmount)} FCFA (sauf pour solder entièrement).</Text>
                  )}
                </>
              ) : (
                <View style={styles.fixedAmountBox}>
                  <Text style={styles.fixedAmountText}>Montant à rembourser : {money(remaining)} FCFA</Text>
                </View>
              )}

              {!!error && <Text style={{ color: colors.danger, marginTop: 10, marginBottom: 2 }}>{error}</Text>}

              <PrimaryButton
                title={isPartial ? "Envoyer l'avance" : `Rembourser ${remaining != null ? money(remaining) + " FCFA" : ""}`}
                onPress={submit}
                style={{ marginTop: 14 }}
              />
              <TouchableOpacity onPress={close} style={{ marginTop: 12, alignItems: "center" }}>
                <Text style={{ color: colors.inkSoft }}>Annuler</Text>
              </TouchableOpacity>
            </>
          )}

          {stage === "pending" && (
            <View style={{ alignItems: "center", paddingVertical: 10 }}>
              <ActivityIndicator color={colors.gold} size="large" />
              <Text style={[styles.title, { marginTop: 16, textAlign: "center" }]}>
                {operator === "VISA_MASTERCARD" ? "Valide avec le code reçu par SMS" : "Valide sur ton téléphone"}
              </Text>
              <Text style={[styles.subtitle, { textAlign: "center" }]}>
                Une demande de paiement de {money(effectiveAmount)} FCFA a été envoyée.{" "}
                {operator === "VISA_MASTERCARD"
                  ? "Suis les instructions reçues par SMS pour confirmer."
                  : "Confirme-la avec ton code Mobile Money."}
              </Text>
            </View>
          )}

          {stage === "success" && (
            <View style={{ alignItems: "center", paddingVertical: 10 }}>
              <View style={styles.successBadge}>
                <Text style={{ fontSize: 34, color: "#fff" }}>✓</Text>
              </View>
              <Text style={[styles.title, { textAlign: "center", color: colors.success, marginTop: 14 }]}>
                {isPartial ? "Avance confirmée" : "Remboursement confirmé"}
              </Text>
              <Text style={[styles.subtitle, { textAlign: "center", marginBottom: 4 }]}>
                {isPartial
                  ? "Ton avance a bien été reçue et déduite de ce que tu dois."
                  : "Ton solde est réglé, merci !"}
              </Text>

              <View style={styles.receiptBox}>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Montant</Text>
                  <Text style={styles.receiptValue}>{money(effectiveAmount)} FCFA</Text>
                </View>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Opérateur</Text>
                  <Text style={styles.receiptValue}>{OPERATORS.find((o) => o.code === operator)?.label}</Text>
                </View>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Compte</Text>
                  <Text style={styles.receiptValue}>{user?.phone}</Text>
                </View>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Date</Text>
                  <Text style={styles.receiptValue}>
                    {confirmedAt?.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })} à{" "}
                    {confirmedAt?.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
                {remaining != null && (
                  <View style={[styles.receiptRow, { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10, marginTop: 4 }]}>
                    <Text style={styles.receiptLabel}>Reste dû après cette opération</Text>
                    <Text style={[styles.receiptValue, { fontWeight: "800" }]}>
                      {money(Math.max(0, remaining - Number(effectiveAmount || 0)))} FCFA
                    </Text>
                  </View>
                )}
              </View>

              <PrimaryButton title="Fermer" onPress={close} style={{ marginTop: 18, width: "100%" }} />
            </View>
          )}

          {(stage === "failed" || stage === "timeout") && (
            <View style={{ alignItems: "center", paddingVertical: 10 }}>
              <Text style={{ fontSize: 40 }}>✕</Text>
              <Text style={[styles.title, { textAlign: "center", color: colors.danger }]}>
                {stage === "failed" ? "Paiement échoué" : "Toujours en attente"}
              </Text>
              <Text style={[styles.subtitle, { textAlign: "center" }]}>
                {stage === "failed"
                  ? "Le paiement n'a pas abouti (fonds insuffisants, annulation…). Tu peux réessayer."
                  : "On n'a pas encore reçu la confirmation. Si l'argent a été débité, déclare-le manuellement pour que l'admin vérifie."}
              </Text>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 16, width: "100%" }}>
                <PrimaryButton title="Réessayer" variant="outline" onPress={() => setStage("form")} style={{ flex: 1 }} />
                <PrimaryButton
                  title="Déclarer manuellement"
                  onPress={() => { close(); onFallbackManual?.(); }}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  card: { backgroundColor: colors.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 22, paddingBottom: 34 },
  title: { fontSize: 17, fontWeight: "800", color: colors.ink },
  subtitle: { fontSize: 13, color: colors.inkSoft, marginTop: 6, marginBottom: 14, lineHeight: 18 },
  remainingBox: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: colors.paper, borderRadius: 10, padding: 12, marginTop: 12, marginBottom: 4,
  },
  remainingLabel: { fontSize: 11.5, fontWeight: "700", color: colors.inkSoft, textTransform: "uppercase" },
  remainingValue: { fontSize: 16, fontWeight: "800", color: colors.ink },
  label: { fontSize: 12, fontWeight: "700", color: colors.inkSoft, textTransform: "uppercase", marginBottom: 6 },
  hint: { fontSize: 11.5, color: colors.inkSoft, marginTop: 6 },
  fixedAmountBox: {
    backgroundColor: colors.ink, borderRadius: 10, padding: 14, alignItems: "center", marginBottom: 4,
  },
  fixedAmountText: { color: colors.white, fontSize: 16, fontWeight: "700" },
  chip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, backgroundColor: colors.paper,
    borderWidth: 1, borderColor: colors.line,
  },
  chipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.ink },
  chipTextActive: { color: colors.white },
  input: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 12, fontSize: 15,
    backgroundColor: colors.paper, marginBottom: 4,
  },
  successBadge: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: colors.success,
    alignItems: "center", justifyContent: "center",
  },
  receiptBox: {
    width: "100%", backgroundColor: colors.paper, borderRadius: 12, padding: 14, marginTop: 16,
  },
  receiptRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  receiptLabel: { fontSize: 12.5, color: colors.inkSoft },
  receiptValue: { fontSize: 13, color: colors.ink, fontWeight: "600", textAlign: "right", flexShrink: 1, marginLeft: 10 },
});

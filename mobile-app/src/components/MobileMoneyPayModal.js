import React, { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Modal, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { api, apiErrorMessage } from "../api/client";
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
 * `aidRequest` : l'aide à rembourser. `onDone(success)` est appelé à la fin
 * (paiement confirmé, échoué, ou abandonné) pour que l'écran parent recharge.
 * `onFallbackManual` permet de basculer vers la déclaration manuelle si le
 * paiement échoue ou traîne trop longtemps.
 */
export default function MobileMoneyPayModal({ visible, aidRequest, onClose, onDone, onFallbackManual }) {
  const [operator, setOperator] = useState("AIRTEL_MONEY");
  const [amount, setAmount] = useState("");
  const [stage, setStage] = useState("form"); // form | pending | success | failed
  const [error, setError] = useState("");
  const pollRef = useRef(null);
  const timeoutRef = useRef(null);

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
  }, [visible]);

  async function submit() {
    const value = parseInt(amount, 10);
    if (!value || value <= 0) return setError("Montant invalide.");
    setError("");
    setStage("pending");
    try {
      const { data } = await api.post(`/client/aid-requests/${aidRequest.id}/repayments/pay`, {
        amount: value,
        operatorCode: operator,
      });
      pollStatus(data.transactionId, value);
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
      if (stage === "pending") setStage("timeout");
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
              <Text style={styles.title}>Payer</Text>
              <Text style={styles.subtitle}>
                {operator === "VISA_MASTERCARD"
                  ? "Tu recevras un code de validation par SMS pour confirmer le paiement par carte."
                  : `Tu recevras une demande de validation sur ton téléphone (${operator === "AIRTEL_MONEY" ? "Airtel Money" : "Moov Money"}).`}
              </Text>

              <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
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

              <TextInput
                style={styles.input}
                value={amount}
                onChangeText={setAmount}
                placeholder="Montant (FCFA)"
                keyboardType="numeric"
              />

              {!!error && <Text style={{ color: colors.danger, marginBottom: 10 }}>{error}</Text>}

              <PrimaryButton title="Payer maintenant" onPress={submit} style={{ marginTop: 4 }} />
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
                Une demande de paiement de {money(amount)} FCFA a été envoyée.{" "}
                {operator === "VISA_MASTERCARD"
                  ? "Suis les instructions reçues par SMS pour confirmer."
                  : "Confirme-la avec ton code Mobile Money."}
              </Text>
            </View>
          )}

          {stage === "success" && (
            <View style={{ alignItems: "center", paddingVertical: 10 }}>
              <Text style={{ fontSize: 40 }}>✓</Text>
              <Text style={[styles.title, { textAlign: "center", color: colors.success }]}>Paiement confirmé</Text>
              <PrimaryButton title="Fermer" onPress={close} style={{ marginTop: 16, width: "100%" }} />
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
  chip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, backgroundColor: colors.paper,
    borderWidth: 1, borderColor: colors.line,
  },
  chipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.ink },
  chipTextActive: { color: colors.white },
  input: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 12, fontSize: 15,
    backgroundColor: colors.paper, marginBottom: 12,
  },
});

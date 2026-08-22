import React, { useCallback, useState } from "react";
import { View, Text, TextInput, StyleSheet, Alert, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { Card, ScreenTitle, PrimaryButton } from "../components/ui";
import { colors, money } from "../theme";

const OPERATORS = [
  { code: "AIRTEL_MONEY", label: "Airtel Money" },
  { code: "MOOV_MONEY", label: "Moov Money" },
];

export default function NewAidRequestScreen({ navigation }) {
  const { user } = useAuth();
  const [available, setAvailable] = useState(null);
  const [feePercent, setFeePercent] = useState(null);
  const [durationDays, setDurationDays] = useState(null);
  const [amount, setAmount] = useState("");
  const [operator, setOperator] = useState("AIRTEL_MONEY");
  const [receivingPhone, setReceivingPhone] = useState(user?.phone || "");
  const [receivingName, setReceivingName] = useState(user?.name || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Toujours relu à l'ouverture de l'écran — si l'admin change le taux ou la
  // durée dans Paramètres, le client voit la nouvelle valeur immédiatement.
  useFocusEffect(
    useCallback(() => {
      api.get("/client/dashboard").then(({ data }) => setAvailable(data.ceilingAvailable)).catch(() => {});
      api.get("/client/settings").then(({ data }) => {
        setFeePercent(data.serviceFeePercent);
        setDurationDays(data.defaultDurationDays);
      }).catch(() => {});
    }, [])
  );

  const amountDue =
    feePercent != null && amount && Number(amount) > 0
      ? Math.round(Number(amount) * (1 + feePercent / 100))
      : null;

  const dueDate =
    durationDays != null
      ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000)
      : null;

  async function submit() {
    setError("");
    if (!amount || Number(amount) <= 0) {
      return setError("Indique un montant valide.");
    }
    if (!receivingPhone.trim() || !receivingName.trim()) {
      return setError("Le numéro et le nom du compte de réception sont obligatoires.");
    }
    setLoading(true);
    try {
      await api.post("/client/aid-requests", {
        amount: Number(amount),
        receivingOperator: operator,
        receivingPhone: receivingPhone.trim(),
        receivingName: receivingName.trim(),
      });
      Alert.alert("Demande envoyée", "Ta demande a été transmise à l'administrateur.", [
        { text: "OK", onPress: () => navigation.navigate("AidRequestsList") },
      ]);
      setAmount("");
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.paper }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 60, paddingBottom: 40 }}>
        <ScreenTitle subtitle="Le montant demandé ne peut pas dépasser ton plafond disponible.">
          Nouvelle demande d'aide
        </ScreenTitle>

        {available !== null && (
          <Card>
            <Text style={styles.label}>Plafond disponible</Text>
            <Text style={styles.available}>{money(available)} FCFA</Text>
          </Card>
        )}

        {!!error && <Card><Text style={{ color: colors.danger }}>{error}</Text></Card>}

        <Text style={styles.label}>Montant demandé (FCFA)</Text>
        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          placeholder="ex : 2000"
          placeholderTextColor={colors.inkSoft}
        />

        {/* Conditions affichées clairement AVANT que le client ne confirme */}
        <View style={styles.conditionsBox}>
          <Text style={styles.conditionsTitle}>Conditions de cette aide</Text>
          <View style={styles.conditionRow}>
            <Text style={styles.conditionLabel}>Tu reçois</Text>
            <Text style={styles.conditionValue}>{amount ? `${money(amount)} FCFA` : "—"}</Text>
          </View>
          <View style={styles.conditionRow}>
            <Text style={styles.conditionLabel}>Total à rembourser</Text>
            <Text style={[styles.conditionValue, styles.conditionValueStrong]}>
              {amountDue !== null ? `${money(amountDue)} FCFA` : "—"}
            </Text>
          </View>
          <View style={styles.conditionRow}>
            <Text style={styles.conditionLabel}>Délai de remboursement</Text>
            <Text style={styles.conditionValue}>{durationDays != null ? `${durationDays} jours` : "—"}</Text>
          </View>
          <View style={styles.conditionRow}>
            <Text style={styles.conditionLabel}>Date limite</Text>
            <Text style={styles.conditionValue}>
              {dueDate ? dueDate.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }) : "—"}
            </Text>
          </View>
          {feePercent != null && (
            <Text style={styles.conditionsHint}>Frais de service inclus : {feePercent}%</Text>
          )}
        </View>

        {/* Où recevoir l'argent — choisi par le client, jamais par l'admin */}
        <Text style={[styles.label, { marginTop: 22 }]}>Où veux-tu recevoir l'argent ?</Text>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 6, marginBottom: 4 }}>
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

        <Text style={styles.label}>Numéro {operator === "AIRTEL_MONEY" ? "Airtel Money" : "Moov Money"}</Text>
        <TextInput
          style={styles.input}
          value={receivingPhone}
          onChangeText={setReceivingPhone}
          keyboardType="phone-pad"
          placeholder="ex : 077000000"
          placeholderTextColor={colors.inkSoft}
        />

        <Text style={styles.label}>Nom sur le compte</Text>
        <TextInput
          style={styles.input}
          value={receivingName}
          onChangeText={setReceivingName}
          placeholder="Nom et prénom"
          placeholderTextColor={colors.inkSoft}
        />
        <Text style={styles.fieldHint}>
          Doit correspondre exactement au nom enregistré sur ce compte Mobile Money, sinon le transfert peut échouer.
        </Text>

        <PrimaryButton title="Envoyer la demande" onPress={submit} loading={loading} style={{ marginTop: 20 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 11.5, fontWeight: "700", color: colors.inkSoft, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6, marginTop: 12 },
  available: { fontSize: 22, fontWeight: "700", color: colors.gold },
  input: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12,
    fontSize: 16, backgroundColor: "#fff", color: colors.ink,
  },
  fieldHint: { fontSize: 11, color: colors.inkSoft, marginTop: 6 },
  conditionsBox: { backgroundColor: colors.ink, borderRadius: 12, padding: 16, marginTop: 18 },
  conditionsTitle: { color: "#fff", fontSize: 13, fontWeight: "800", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.4 },
  conditionRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  conditionLabel: { color: "#8895ac", fontSize: 13 },
  conditionValue: { color: "#fff", fontSize: 14, fontWeight: "600" },
  conditionValueStrong: { color: colors.gold, fontSize: 16, fontWeight: "800" },
  conditionsHint: { color: "#8895ac", fontSize: 11, marginTop: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, backgroundColor: "#fff",
    borderWidth: 1, borderColor: colors.line,
  },
  chipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.ink },
  chipTextActive: { color: "#fff" },
});

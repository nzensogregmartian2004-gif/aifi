import React, { useCallback, useState } from "react";
import { View, Text, TextInput, StyleSheet, Alert, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage } from "../api/client";
import { Card, ScreenTitle, PrimaryButton } from "../components/ui";
import { colors, money } from "../theme";

export default function NewAidRequestScreen({ navigation }) {
  const [available, setAvailable] = useState(null);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useFocusEffect(
    useCallback(() => {
      api.get("/client/dashboard").then(({ data }) => setAvailable(data.ceilingAvailable)).catch(() => {});
    }, [])
  );

  async function submit() {
    setError("");
    if (!amount || Number(amount) <= 0) {
      setError("Indique un montant valide.");
      return;
    }
    setLoading(true);
    try {
      await api.post("/client/aid-requests", { amount: Number(amount) });
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

        <PrimaryButton title="Envoyer la demande" onPress={submit} loading={loading} style={{ marginTop: 20 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 11.5, fontWeight: "700", color: colors.inkSoft, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 },
  available: { fontSize: 22, fontWeight: "700", color: colors.gold },
  input: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12,
    fontSize: 17, backgroundColor: "#fff", color: colors.ink, marginTop: 4,
  },
});

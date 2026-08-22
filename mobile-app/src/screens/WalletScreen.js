import React, { useCallback, useState } from "react";
import { View, Text, FlatList, TextInput, StyleSheet, RefreshControl, Alert, TouchableOpacity } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { Card, ScreenTitle, PrimaryButton, EmptyState } from "../components/ui";
import { colors, money } from "../theme";

const REASON_LABELS = {
  referral_bonus: "Bonus de parrainage",
  referral_commission: "Commission de parrainage",
  withdrawal_approved: "Retrait approuvé",
};

const OPERATORS = [
  { code: "AIRTEL_MONEY", label: "Airtel Money" },
  { code: "MOOV_MONEY", label: "Moov Money" },
];

export default function WalletScreen() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState(null);
  const [minWithdrawal, setMinWithdrawal] = useState(null);
  const [amount, setAmount] = useState("");
  const [operator, setOperator] = useState("AIRTEL_MONEY");
  const [receivingPhone, setReceivingPhone] = useState(user?.phone || "");
  const [receivingName, setReceivingName] = useState(user?.name || "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/client/wallet");
      setWallet(data);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
    api.get("/client/settings").then(({ data }) => setMinWithdrawal(data.minWithdrawal)).catch(() => {});
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function withdraw() {
    setError("");
    if (!amount || Number(amount) <= 0) {
      return setError("Indique un montant valide.");
    }
    if (!receivingPhone.trim() || !receivingName.trim()) {
      return setError("Le numéro et le nom du compte de réception sont obligatoires.");
    }
    setLoading(true);
    try {
      await api.post("/client/wallet/withdraw", {
        amount: Number(amount),
        receivingOperator: operator,
        receivingPhone: receivingPhone.trim(),
        receivingName: receivingName.trim(),
      });
      Alert.alert("Demande envoyée", "Ta demande de retrait a été transmise à l'administrateur.");
      setAmount("");
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper, paddingTop: 60 }}>
      <View style={{ paddingHorizontal: 20 }}>
        <ScreenTitle subtitle="Bonus et commissions de parrainage">Mon portefeuille</ScreenTitle>

        <Card>
          <Text style={styles.label}>Solde disponible</Text>
          <Text style={styles.balance}>{money(wallet?.balance)} FCFA</Text>
        </Card>

        {!!error && <Card><Text style={{ color: colors.danger }}>{error}</Text></Card>}

        <Card>
          <Text style={styles.label}>
            Demander un retrait{minWithdrawal ? ` (minimum ${money(minWithdrawal)} FCFA)` : ""}
          </Text>
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
            placeholder="Montant en FCFA"
            placeholderTextColor={colors.inkSoft}
          />

          <Text style={[styles.label, { marginTop: 14 }]}>Où veux-tu recevoir l'argent ?</Text>
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

          <PrimaryButton title="Demander le retrait" onPress={withdraw} loading={loading} style={{ marginTop: 14 }} />
        </Card>

        <Text style={[styles.label, { marginTop: 6 }]}>Historique</Text>
      </View>

      <FlatList
        data={wallet?.entries || []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, paddingTop: 8 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}
        ListEmptyComponent={<EmptyState text="Aucun mouvement pour le moment." />}
        renderItem={({ item }) => (
          <Card style={{ marginBottom: 8, paddingVertical: 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 13.5, color: colors.ink }}>{REASON_LABELS[item.reason] || item.reason}</Text>
              <Text style={{ fontSize: 13.5, fontWeight: "700", color: item.amount < 0 ? colors.danger : colors.success }}>
                {item.amount > 0 ? "+" : ""}{money(item.amount)} FCFA
              </Text>
            </View>
            <Text style={{ fontSize: 11.5, color: colors.inkSoft, marginTop: 4 }}>
              {new Date(item.createdAt).toLocaleDateString("fr-FR")}
            </Text>
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 11.5, fontWeight: "700", color: colors.inkSoft, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 },
  balance: { fontSize: 26, fontWeight: "700", color: colors.gold },
  input: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 11,
    fontSize: 15, backgroundColor: "#fff", color: colors.ink,
  },
  chip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, backgroundColor: "#fff",
    borderWidth: 1, borderColor: colors.line,
  },
  chipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.ink },
  chipTextActive: { color: "#fff" },
});

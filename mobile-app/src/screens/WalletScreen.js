import React, { useCallback, useState } from "react";
import { View, Text, FlatList, TextInput, StyleSheet, RefreshControl, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage } from "../api/client";
import { Card, ScreenTitle, PrimaryButton, EmptyState } from "../components/ui";
import { colors, money } from "../theme";

const REASON_LABELS = {
  referral_bonus: "Bonus de parrainage",
  referral_commission: "Commission de parrainage",
  withdrawal_approved: "Retrait approuvé",
};

export default function WalletScreen() {
  const [wallet, setWallet] = useState(null);
  const [minWithdrawal, setMinWithdrawal] = useState(null);
  const [amount, setAmount] = useState("");
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
      setError("Indique un montant valide.");
      return;
    }
    setLoading(true);
    try {
      await api.post("/client/wallet/withdraw", { amount: Number(amount) });
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
          <PrimaryButton title="Demander le retrait" onPress={withdraw} loading={loading} style={{ marginTop: 10 }} />
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
});

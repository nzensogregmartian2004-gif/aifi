import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, TextInput, StyleSheet, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage } from "../../api/client";
import { Card, ScreenTitle, Badge, Seal, PrimaryButton, SectionLabel } from "../../components/ui";
import { colors, money } from "../../theme";

export default function AdminUserDetailScreen({ route, navigation }) {
  const { userId } = route.params;
  const [user, setUser] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editPoints, setEditPoints] = useState("");
  const [editCeiling, setEditCeiling] = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/admin/users/${userId}`);
      setUser(data);
      setEditPoints(String(data.points));
      setEditCeiling(String(data.ceiling));
      setError("");
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }, [userId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function validate() {
    setBusy(true);
    try { await api.post(`/admin/users/${userId}/validate`); await load(); }
    catch (err) { setError(apiErrorMessage(err)); }
    finally { setBusy(false); }
  }

  async function toggleSuspend() {
    setBusy(true);
    try {
      await api.post(`/admin/users/${userId}/${user.status === "SUSPENDED" ? "reactivate" : "suspend"}`);
      await load();
    } catch (err) { setError(apiErrorMessage(err)); }
    finally { setBusy(false); }
  }

  function confirmSaveInfo() {
    Alert.alert(
      "Confirmer la modification",
      `Points : ${editPoints} — Plafond : ${editCeiling} FCFA. Cette action sera enregistrée dans l'historique.`,
      [
        { text: "Annuler", style: "cancel" },
        { text: "Confirmer", onPress: saveInfo },
      ]
    );
  }

  async function saveInfo() {
    setBusy(true);
    try {
      await api.patch(`/admin/users/${userId}`, {
        points: parseInt(editPoints, 10),
        ceiling: parseInt(editCeiling, 10),
      });
      await load();
    } catch (err) { setError(apiErrorMessage(err)); }
    finally { setBusy(false); }
  }

  function openChat() {
    navigation.navigate("AdminChat", { clientId: userId, name: user.name });
  }

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.paper, paddingTop: 80, paddingHorizontal: 20 }}>
        {!!error && <Text style={{ color: colors.danger }}>{error}</Text>}
      </View>
    );
  }

  const usedCeiling = user.aidRequests
    .filter((r) => ["ACCEPTED", "DISBURSED", "LATE"].includes(r.status))
    .reduce((sum, r) => sum + r.amount - r.repayments.reduce((s, p) => s + p.amount, 0), 0);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.paper }} contentContainerStyle={{ padding: 20, paddingTop: 60 }}>
      <ScreenTitle>{user.name}</ScreenTitle>

      <Card style={{ flexDirection: "row", alignItems: "center" }}>
        <Seal points={user.points} size={54} />
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={{ fontSize: 14 }}>{user.phone}</Text>
          <Text style={{ color: colors.inkSoft, fontSize: 12.5 }}>Code parrainage : {user.referralCode}</Text>
        </View>
        <Badge status={user.status} />
      </Card>

      <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
        {user.status === "PENDING" && <PrimaryButton title="Valider le compte" onPress={validate} loading={busy} style={{ flex: 1 }} />}
        {user.status !== "PENDING" && (
          <PrimaryButton
            title={user.status === "SUSPENDED" ? "Réactiver" : "Suspendre"}
            variant={user.status === "SUSPENDED" ? "success" : "danger"}
            onPress={toggleSuspend}
            loading={busy}
            style={{ flex: 1 }}
          />
        )}
        <PrimaryButton title="Message" variant="outline" onPress={openChat} style={{ flex: 1 }} />
      </View>

      <Card>
        <SectionLabel>Plafond</SectionLabel>
        <Text style={{ fontSize: 13.5 }}>Autorisé : {money(user.ceiling)} FCFA</Text>
        <Text style={{ fontSize: 13.5 }}>Utilisé : {money(usedCeiling)} FCFA</Text>
        <Text style={{ fontSize: 13.5, fontWeight: "700" }}>Disponible : {money(user.ceiling - usedCeiling)} FCFA</Text>

        <View style={{ marginTop: 14 }}>
          <SectionLabel>Modifier points / plafond</SectionLabel>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TextInput style={[styles.input, { flex: 1 }]} value={editPoints} onChangeText={setEditPoints} keyboardType="numeric" placeholder="Points" />
          <TextInput style={[styles.input, { flex: 1 }]} value={editCeiling} onChangeText={setEditCeiling} keyboardType="numeric" placeholder="Plafond" />
        </View>
        <PrimaryButton title="Enregistrer" onPress={confirmSaveInfo} loading={busy} style={{ marginTop: 10 }} />
      </Card>

      <Card>
        <SectionLabel>Aides ({user.aidRequests.length})</SectionLabel>
        {user.aidRequests.length === 0 && <Text style={{ color: colors.inkSoft, fontStyle: "italic" }}>Aucune aide.</Text>}
        {user.aidRequests.map((r) => (
          <View key={r.id} style={styles.row}>
            <Text style={{ flex: 1 }}>{money(r.amount)} FCFA</Text>
            <Badge status={r.status} />
          </View>
        ))}
      </Card>

      <Card>
        <SectionLabel>Portefeuille</SectionLabel>
        <Text style={{ fontSize: 18, fontWeight: "800" }}>
          {money(user.walletEntries.reduce((s, e) => s + e.amount, 0))} FCFA
        </Text>
        {user.walletEntries.slice(0, 5).map((e) => (
          <View key={e.id} style={styles.row}>
            <Text style={{ flex: 1, fontSize: 12.5, color: colors.inkSoft }}>{e.reason}</Text>
            <Text style={{ fontWeight: "700", color: e.amount < 0 ? colors.danger : colors.success }}>
              {e.amount > 0 ? "+" : ""}{money(e.amount)}
            </Text>
          </View>
        ))}
      </Card>

      {user.referrals?.length > 0 && (
        <Card>
          <SectionLabel>Filleuls ({user.referrals.length})</SectionLabel>
          {user.referrals.map((r) => (
            <View key={r.id} style={styles.row}>
              <Text style={{ flex: 1 }}>{r.name}</Text>
              <Badge status={r.status} />
            </View>
          ))}
        </Card>
      )}

      {!!error && <Text style={{ color: colors.danger }}>{error}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 10, fontSize: 14,
    backgroundColor: colors.paper,
  },
  row: {
    flexDirection: "row", alignItems: "center", paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: colors.line,
  },
});

import React, { useCallback, useState } from "react";
import { View, Text, TextInput, StyleSheet, FlatList, KeyboardAvoidingView, Platform, ScrollView, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage } from "../../api/client";
import { Card, ScreenTitle, PrimaryButton, EmptyState } from "../../components/ui";
import { colors, money } from "../../theme";

const SETTINGS_FIELDS = [
  { key: "serviceFeePercent", label: "Frais de service (%) — ajoutés au remboursement" },
  { key: "minRepaymentAmount", label: "Montant minimum d'une avance de remboursement (FCFA)" },
  { key: "referralBonus", label: "Bonus de parrainage (FCFA)" },
  { key: "referralPoints", label: "Points de parrainage" },
  { key: "commissionPercent", label: "Commission de parrainage (%)" },
  { key: "minWithdrawal", label: "Retrait minimum (FCFA)" },
  { key: "latePenaltyPoints", label: "Pénalité de retard (points)" },
  { key: "reminderDaysBefore", label: "Rappel avant échéance (jours)" },
];

export default function AdminSettingsScreen() {
  const [settings, setSettings] = useState(null);
  const [tiers, setTiers] = useState([]);
  const [durations, setDurations] = useState([]);
  const [savingSettings, setSavingSettings] = useState(false);
  const [newTier, setNewTier] = useState({ minPoints: "", ceiling: "" });
  const [savingTier, setSavingTier] = useState(false);
  const [newDuration, setNewDuration] = useState("");
  const [savingDuration, setSavingDuration] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api.get("/admin/settings").then(({ data }) => setSettings(data)).catch((e) => setError(apiErrorMessage(e)));
    api.get("/admin/settings/tiers").then(({ data }) => setTiers(data)).catch(() => {});
    api.get("/admin/settings/durations").then(({ data }) => setDurations(data)).catch(() => {});
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function saveSettings() {
    setSavingSettings(true);
    setError("");
    try {
      const payload = {};
      SETTINGS_FIELDS.forEach((f) => { payload[f.key] = Number(settings[f.key]); });
      const { data } = await api.patch("/admin/settings", payload);
      setSettings(data);
      Alert.alert("Enregistré", "Les réglages généraux ont été mis à jour.");
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSavingSettings(false);
    }
  }

  async function addTier() {
    if (!newTier.minPoints || !newTier.ceiling) return;
    setSavingTier(true);
    try {
      await api.put("/admin/settings/tiers", { minPoints: Number(newTier.minPoints), ceiling: Number(newTier.ceiling) });
      setNewTier({ minPoints: "", ceiling: "" });
      load();
    } catch (err) {
      Alert.alert("Erreur", apiErrorMessage(err));
    } finally {
      setSavingTier(false);
    }
  }

  async function deleteTier(id) {
    try {
      await api.delete(`/admin/settings/tiers/${id}`);
      load();
    } catch (err) {
      Alert.alert("Erreur", apiErrorMessage(err));
    }
  }

  async function addDuration() {
    if (!newDuration) return;
    setSavingDuration(true);
    try {
      await api.post("/admin/settings/durations", { days: Number(newDuration) });
      setNewDuration("");
      load();
    } catch (err) {
      Alert.alert("Erreur", apiErrorMessage(err));
    } finally {
      setSavingDuration(false);
    }
  }

  async function deleteDuration(id) {
    try {
      await api.delete(`/admin/settings/durations/${id}`);
      load();
    } catch (err) {
      Alert.alert("Erreur", apiErrorMessage(err));
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.paper }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 60, paddingBottom: 40 }}>
        <ScreenTitle subtitle="Grille de plafonds, taux, durées et réglages généraux">Paramètres</ScreenTitle>

        {!!error && <Card><Text style={{ color: colors.danger }}>{error}</Text></Card>}

        <Card>
          <Text style={styles.cardTitle}>Réglages généraux</Text>
          <Text style={styles.subText}>
            Ex : frais de service à 33% → une aide de 10 000 FCFA reçue devient 13 300 FCFA à rembourser. Le taux est
            figé au moment de chaque demande, le modifier ici n'affecte pas les demandes déjà en cours.
          </Text>
          {!settings ? (
            <Text style={styles.muted}>Chargement...</Text>
          ) : (
            <>
              {SETTINGS_FIELDS.map((f) => (
                <View key={f.key}>
                  <Text style={styles.label}>{f.label}</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={String(settings[f.key] ?? "")}
                    onChangeText={(v) => setSettings({ ...settings, [f.key]: v })}
                  />
                </View>
              ))}
              <PrimaryButton title="Enregistrer" onPress={saveSettings} loading={savingSettings} style={{ marginTop: 12 }} />
            </>
          )}
        </Card>

        <Card>
          <Text style={styles.cardTitle}>Grille : paliers de points → plafonds</Text>
          <Text style={styles.subText}>
            Détermine le plafond d'aide accessible à un client selon ses points de confiance.
          </Text>
          <FlatList
            data={tiers}
            keyExtractor={(t) => t.id}
            scrollEnabled={false}
            ListEmptyComponent={<EmptyState text="Aucun palier configuré." />}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <Text style={styles.rowText}>{item.minPoints}+ points → {money(item.ceiling)} FCFA</Text>
                <PrimaryButton title="Supprimer" variant="outline" onPress={() => deleteTier(item.id)} style={styles.rowBtn} />
              </View>
            )}
          />
          <View style={styles.addRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              keyboardType="numeric"
              placeholder="Points min."
              value={newTier.minPoints}
              onChangeText={(v) => setNewTier({ ...newTier, minPoints: v })}
            />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              keyboardType="numeric"
              placeholder="Plafond FCFA"
              value={newTier.ceiling}
              onChangeText={(v) => setNewTier({ ...newTier, ceiling: v })}
            />
          </View>
          <PrimaryButton title="Ajouter / mettre à jour le palier" variant="outline" onPress={addTier} loading={savingTier} style={{ marginTop: 10 }} />
        </Card>

        <Card>
          <Text style={styles.cardTitle}>Durées de remboursement autorisées</Text>
          <FlatList
            data={durations}
            keyExtractor={(d) => d.id}
            scrollEnabled={false}
            ListEmptyComponent={<EmptyState text="Aucune durée configurée." />}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <Text style={styles.rowText}>{item.days} jours</Text>
                <PrimaryButton title="Supprimer" variant="outline" onPress={() => deleteDuration(item.id)} style={styles.rowBtn} />
              </View>
            )}
          />
          <View style={styles.addRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              keyboardType="numeric"
              placeholder="Nombre de jours"
              value={newDuration}
              onChangeText={setNewDuration}
            />
            <PrimaryButton title="Ajouter" variant="outline" onPress={addDuration} loading={savingDuration} style={{ flex: 1 }} />
          </View>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  cardTitle: { fontSize: 15, fontWeight: "700", color: colors.ink, marginBottom: 4 },
  subText: { fontSize: 12.5, color: colors.inkSoft, marginBottom: 12, lineHeight: 18 },
  muted: { color: colors.inkSoft, fontSize: 13 },
  label: { fontSize: 11.5, fontWeight: "700", color: colors.inkSoft, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 12, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, color: colors.ink, backgroundColor: "#fff",
  },
  row: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  rowText: { fontSize: 14, color: colors.ink, fontWeight: "600" },
  rowBtn: { paddingHorizontal: 10 },
  addRow: { flexDirection: "row", gap: 8, marginTop: 12 },
});

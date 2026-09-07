import React, { useCallback, useState } from "react";
import { View, Text, TextInput, StyleSheet, FlatList, KeyboardAvoidingView, Platform, ScrollView, Alert, Pressable } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
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

const PREMIUM_SETTINGS_FIELDS = [
  { key: "premiumMonthlyPrice", label: "Prix de l'abonnement AIFI+ (FCFA / mois)" },
  { key: "premiumServiceFeePercent", label: "Frais de service AIFI+ (%) — remplace le taux normal" },
  { key: "premiumCeilingMultiplier", label: "Multiplicateur de plafond AIFI+ (ex : 3 = ×3)" },
  { key: "premiumMaxCeiling", label: "Plafond maximum AIFI+, même avec le multiplicateur (FCFA)" },
  { key: "premiumGraceDays", label: "Jours de sursis AIFI+ avant pénalité de retard" },
];

const ALL_SETTINGS_FIELDS = [...SETTINGS_FIELDS, ...PREMIUM_SETTINGS_FIELDS];

export default function AdminSettingsScreen() {
  const [settings, setSettings] = useState(null);
  const [tiers, setTiers] = useState([]);
  const [durationTiers, setDurationTiers] = useState([]);
  const [savingSettings, setSavingSettings] = useState(false);
  const [newTier, setNewTier] = useState({ minPoints: "", ceiling: "" });
  const [savingTier, setSavingTier] = useState(false);
  const [newDurationTier, setNewDurationTier] = useState({ minAmount: "", durationDays: "" });
  const [savingDurationTier, setSavingDurationTier] = useState(false);
  const [error, setError] = useState("");
  const [savingReceiving, setSavingReceiving] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [resetting, setResetting] = useState(false);

  const load = useCallback(() => {
    api.get("/admin/settings").then(({ data }) => setSettings(data)).catch((e) => setError(apiErrorMessage(e)));
    api.get("/admin/settings/tiers").then(({ data }) => setTiers(data)).catch(() => {});
    api.get("/admin/settings/duration-tiers").then(({ data }) => setDurationTiers(data)).catch(() => {});
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function saveSettings() {
    setSavingSettings(true);
    setError("");
    try {
      const payload = {};
      ALL_SETTINGS_FIELDS.forEach((f) => { payload[f.key] = Number(settings[f.key]); });
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

  async function addDurationTier() {
    if (!newDurationTier.minAmount || !newDurationTier.durationDays) return;
    setSavingDurationTier(true);
    try {
      await api.put("/admin/settings/duration-tiers", {
        minAmount: Number(newDurationTier.minAmount),
        durationDays: Number(newDurationTier.durationDays),
      });
      setNewDurationTier({ minAmount: "", durationDays: "" });
      load();
    } catch (err) {
      Alert.alert("Erreur", apiErrorMessage(err));
    } finally {
      setSavingDurationTier(false);
    }
  }

  async function deleteDurationTier(id) {
    try {
      await api.delete(`/admin/settings/duration-tiers/${id}`);
      load();
    } catch (err) {
      Alert.alert("Erreur", apiErrorMessage(err));
    }
  }

  async function saveReceivingInfo() {
    setSavingReceiving(true);
    setError("");
    try {
      const { data } = await api.patch("/admin/settings", {
        repaymentReceivingOperator: settings.repaymentReceivingOperator,
        repaymentReceivingPhone: settings.repaymentReceivingPhone,
        repaymentReceivingName: settings.repaymentReceivingName,
      });
      setSettings(data);
      Alert.alert("Enregistré", "Les clients verront désormais ce numéro pour un remboursement manuel.");
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSavingReceiving(false);
    }
  }

  function confirmReset() {
    Alert.alert(
      "Tout réinitialiser ?",
      "Cette action supprime DÉFINITIVEMENT toutes les demandes d'aide, remboursements, paiements, notifications, messages et TOUS les comptes clients. Les réglages et grilles restent inchangés. Ceci est irréversible.",
      [
        { text: "Annuler", style: "cancel" },
        { text: "Oui, tout supprimer", style: "destructive", onPress: performReset },
      ]
    );
  }

  async function performReset() {
    setResetting(true);
    try {
      const { data } = await api.post("/admin/reset-data", { confirmation: "REINITIALISER" });
      setResetConfirmText("");
      Alert.alert(
        "Terminé",
        `${data.clientsDeleted} compte(s) client, ${data.aidRequestsDeleted} demande(s) d'aide et ${data.paymentsDeleted} transaction(s) supprimés. Base propre pour la production.`
      );
    } catch (err) {
      Alert.alert("Erreur", apiErrorMessage(err));
    } finally {
      setResetting(false);
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

        <Card style={styles.premiumCard}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
            <Ionicons name="sparkles" size={17} color={colors.premium} />
            <Text style={[styles.cardTitle, { marginLeft: 8, marginBottom: 0 }]}>AIFI+</Text>
          </View>
          <Text style={styles.subText}>
            Ces réglages définissent les avantages des membres AIFI+ : frais réduits, plafond majoré (multiplicateur
            plafonné dur), sursis de retard et prix de l'abonnement. Le badge et l'accès sont accordés soit par
            paiement (renouvellement automatique), soit manuellement depuis la fiche d'un client.
          </Text>
          {!settings ? (
            <Text style={styles.muted}>Chargement...</Text>
          ) : (
            <>
              {PREMIUM_SETTINGS_FIELDS.map((f) => (
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
              <PrimaryButton
                title="Enregistrer"
                onPress={saveSettings}
                loading={savingSettings}
                style={{ marginTop: 12, backgroundColor: colors.premium }}
              />
            </>
          )}
        </Card>

        <Card>
          <Text style={styles.cardTitle}>Réception des remboursements manuels</Text>
          <Text style={styles.subText}>
            Numéro affiché au client quand il choisit de rembourser manuellement (hors paiement automatique) — il
            saura exactement où envoyer l'argent avant de déclarer son remboursement.
          </Text>
          {!settings ? (
            <Text style={styles.muted}>Chargement...</Text>
          ) : (
            <>
              <Text style={styles.label}>Opérateur</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {[
                  { code: "AIRTEL_MONEY", label: "Airtel Money" },
                  { code: "MOOV_MONEY", label: "Moov Money" },
                ].map((op) => (
                  <Pressable
                    key={op.code}
                    onPress={() => setSettings({ ...settings, repaymentReceivingOperator: op.code })}
                    style={[styles.chip, settings.repaymentReceivingOperator === op.code && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, settings.repaymentReceivingOperator === op.code && styles.chipTextActive]}>
                      {op.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>Numéro de réception</Text>
              <TextInput
                style={styles.input}
                keyboardType="phone-pad"
                value={settings.repaymentReceivingPhone || ""}
                onChangeText={(v) => setSettings({ ...settings, repaymentReceivingPhone: v })}
                placeholder="ex : 074000000"
              />

              <Text style={styles.label}>Nom sur le compte</Text>
              <TextInput
                style={styles.input}
                value={settings.repaymentReceivingName || ""}
                onChangeText={(v) => setSettings({ ...settings, repaymentReceivingName: v })}
                placeholder="ex : AIFI SARL"
              />

              <PrimaryButton title="Enregistrer" onPress={saveReceivingInfo} loading={savingReceiving} style={{ marginTop: 12 }} />
            </>
          )}
        </Card>

        <Card style={styles.dangerCard}>
          <Text style={[styles.cardTitle, { color: colors.danger }]}>Zone de danger</Text>
          <Text style={styles.subText}>
            Supprime définitivement toutes les demandes d'aide, remboursements, paiements, notifications, messages et
            TOUS les comptes clients — pour repartir d'une base honnête au vrai lancement en production. Les réglages
            et grilles ci-dessus, ainsi que les comptes administrateurs, sont conservés. Action irréversible.
          </Text>
          <Text style={styles.label}>Tape REINITIALISER pour activer le bouton</Text>
          <TextInput
            style={styles.input}
            value={resetConfirmText}
            onChangeText={setResetConfirmText}
            placeholder="REINITIALISER"
            autoCapitalize="characters"
          />
          <PrimaryButton
            title="Tout réinitialiser"
            variant="danger"
            disabled={resetConfirmText.trim().toUpperCase() !== "REINITIALISER"}
            onPress={confirmReset}
            loading={resetting}
            style={{ marginTop: 12 }}
          />
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
          <Text style={styles.cardTitle}>Grille : montant → durée de remboursement</Text>
          <Text style={styles.subText}>
            Le montant demandé est rattaché au palier immédiatement inférieur. Ex : une demande de 1 300 FCFA entre
            dans le palier 1 000 FCFA et suit sa durée. Modifier la grille n'affecte pas les demandes déjà créées.
          </Text>
          <FlatList
            data={durationTiers}
            keyExtractor={(t) => t.id}
            scrollEnabled={false}
            ListEmptyComponent={<EmptyState text="Aucun palier configuré." />}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <Text style={styles.rowText}>{money(item.minAmount)} FCFA → {item.durationDays} jours</Text>
                <PrimaryButton title="Supprimer" variant="outline" onPress={() => deleteDurationTier(item.id)} style={styles.rowBtn} />
              </View>
            )}
          />
          <View style={styles.addRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              keyboardType="numeric"
              placeholder="Montant min. FCFA"
              value={newDurationTier.minAmount}
              onChangeText={(v) => setNewDurationTier({ ...newDurationTier, minAmount: v })}
            />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              keyboardType="numeric"
              placeholder="Durée (jours)"
              value={newDurationTier.durationDays}
              onChangeText={(v) => setNewDurationTier({ ...newDurationTier, durationDays: v })}
            />
          </View>
          <PrimaryButton
            title="Ajouter / mettre à jour le palier"
            variant="outline"
            onPress={addDurationTier}
            loading={savingDurationTier}
            style={{ marginTop: 10 }}
          />
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
  premiumCard: { backgroundColor: colors.premiumSoft },
  dangerCard: { backgroundColor: "#FDEDEC", borderWidth: 1, borderColor: colors.danger },
  chip: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 100, paddingHorizontal: 14, paddingVertical: 9,
    backgroundColor: "#fff",
  },
  chipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.ink },
  chipTextActive: { color: "#fff" },
});

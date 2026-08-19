import React, { useCallback, useState } from "react";
import { View, Text, FlatList, StyleSheet, RefreshControl, Modal, TextInput, TouchableOpacity } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage } from "../../api/client";
import { Card, ScreenTitle, Badge, PrimaryButton, EmptyState } from "../../components/ui";
import ImageAttach from "../../components/ImageAttach";
import { colors, money } from "../../theme";

const FILTERS = [
  { key: "PENDING", label: "En attente" },
  { key: "ACCEPTED", label: "Acceptées" },
  { key: "DISBURSED", label: "En cours" },
  { key: "LATE", label: "En retard" },
  { key: "", label: "Toutes" },
];

export default function AdminAidRequestsScreen() {
  const [filter, setFilter] = useState("PENDING");
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [durations, setDurations] = useState([]);
  const [acceptTarget, setAcceptTarget] = useState(null);
  const [selectedDuration, setSelectedDuration] = useState(null);
  const [depositTarget, setDepositTarget] = useState(null);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositProof, setDepositProof] = useState(null);
  const [disburseTarget, setDisburseTarget] = useState(null);
  const [disburseOperator, setDisburseOperator] = useState("AIRTEL_MONEY");
  const [mypvitAvailable, setMypvitAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/aid-requests", { params: filter ? { status: filter } : {} });
      setRequests(data);
      setError("");
    } catch (err) {
      setError(apiErrorMessage(err));
    }
    api.get("/admin/settings/durations").then(({ data }) => setDurations(data)).catch(() => {});
    api.get("/admin/payments/config").then(({ data }) => setMypvitAvailable(data.available)).catch(() => setMypvitAvailable(false));
  }, [filter]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function accept() {
    if (!selectedDuration) return setFormError("Choisis une durée.");
    setBusy(true);
    setFormError("");
    try {
      await api.post(`/admin/aid-requests/${acceptTarget.id}/accept`, { durationDays: selectedDuration });
      setAcceptTarget(null);
      load();
    } catch (err) {
      setFormError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function reject(item) {
    setBusy(true);
    try {
      await api.post(`/admin/aid-requests/${item.id}/reject`);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function openDisburse(item) {
    setDisburseTarget(item);
    setDisburseOperator(null); // pas de présélection — l'admin choisit explicitement
    setFormError("");
  }

  async function disburseAuto() {
    if (!disburseOperator) return setFormError("Choisis un opérateur.");
    setBusy(true);
    setFormError("");
    try {
      await api.post(`/admin/aid-requests/${disburseTarget.id}/disburse-mypvit`, { operatorCode: disburseOperator });
      setDisburseTarget(null);
      load();
    } catch (err) {
      setFormError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function disburseManual() {
    setBusy(true);
    setFormError("");
    try {
      await api.post(`/admin/aid-requests/${disburseTarget.id}/disburse`);
      setDisburseTarget(null);
      load();
    } catch (err) {
      setFormError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function openDeposit(item) {
    setDepositTarget(item);
    setDepositAmount("");
    setDepositProof(null);
    setFormError("");
  }

  async function submitDeposit() {
    const value = parseInt(depositAmount, 10);
    if (!value || value <= 0) return setFormError("Montant invalide.");
    if (!depositProof?.url) return setFormError("Le justificatif (photo) est obligatoire.");
    setBusy(true);
    setFormError("");
    try {
      await api.post(`/admin/aid-requests/${depositTarget.id}/repayments`, {
        amount: value,
        proofImageUrl: depositProof.url,
      });
      setDepositTarget(null);
      load();
    } catch (err) {
      setFormError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper, paddingTop: 60 }}>
      <View style={{ paddingHorizontal: 20 }}>
        <ScreenTitle subtitle="Demandes d'aide">Aides</ScreenTitle>
      </View>

      <FlatList
        horizontal
        data={FILTERS}
        keyExtractor={(f) => f.key || "ALL"}
        style={{ flexGrow: 0, paddingLeft: 20, marginBottom: 8 }}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item: f }) => (
          <TouchableOpacity
            onPress={() => setFilter(f.key)}
            style={[styles.chip, filter === f.key && styles.chipActive]}
          >
            <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        )}
      />

      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 20, paddingTop: 4 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}
        ListEmptyComponent={<EmptyState text="Aucune demande dans ce filtre." />}
        renderItem={({ item }) => {
          const repaid = item.repayments.reduce((s, r) => s + r.amount, 0);
          return (
            <Card>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "700", fontSize: 15 }}>{item.user.name}</Text>
                  <Text style={{ color: colors.inkSoft, fontSize: 12.5 }}>{item.user.phone}</Text>
                </View>
                <Badge status={item.status} />
              </View>
              <Text style={{ fontSize: 20, fontWeight: "800", marginTop: 8 }}>{money(item.amount)} FCFA</Text>
              {item.dueDate && (
                <Text style={{ color: colors.inkSoft, fontSize: 12.5, marginTop: 2 }}>
                  Échéance : {new Date(item.dueDate).toLocaleDateString("fr-FR")}
                </Text>
              )}
              {repaid > 0 && (
                <Text style={{ color: colors.success, fontSize: 12.5, marginTop: 2 }}>
                  Déjà remboursé : {money(repaid)} FCFA
                </Text>
              )}

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                {item.status === "PENDING" && (
                  <>
                    <PrimaryButton
                      title="Accepter"
                      onPress={() => { setAcceptTarget(item); setSelectedDuration(null); setFormError(""); }}
                      style={styles.smallBtn}
                    />
                    <PrimaryButton title="Refuser" variant="outline" onPress={() => reject(item)} style={styles.smallBtn} />
                  </>
                )}
                {item.status === "ACCEPTED" && (
                  <PrimaryButton title="Envoyer les fonds" onPress={() => openDisburse(item)} style={styles.smallBtn} />
                )}
                {["DISBURSED", "LATE"].includes(item.status) && (
                  <PrimaryButton title="Enregistrer un dépôt" onPress={() => openDeposit(item)} style={styles.smallBtn} />
                )}
              </View>
            </Card>
          );
        }}
      />

      {/* Modal acceptation avec choix de durée */}
      <Modal visible={!!acceptTarget} transparent animationType="fade" onRequestClose={() => setAcceptTarget(null)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Accepter la demande</Text>
            <Text style={{ color: colors.inkSoft, marginBottom: 10 }}>Choisis la durée de remboursement.</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {durations.map((d) => (
                <TouchableOpacity
                  key={d.days}
                  onPress={() => setSelectedDuration(d.days)}
                  style={[styles.chip, selectedDuration === d.days && styles.chipActive]}
                >
                  <Text style={[styles.chipText, selectedDuration === d.days && styles.chipTextActive]}>
                    {d.days} jours
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {!!formError && <Text style={{ color: colors.danger, marginTop: 10 }}>{formError}</Text>}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <PrimaryButton title="Annuler" variant="outline" onPress={() => setAcceptTarget(null)} style={{ flex: 1 }} />
              <PrimaryButton title="Confirmer" onPress={accept} loading={busy} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal dépôt facilité */}
      <Modal visible={!!depositTarget} transparent animationType="fade" onRequestClose={() => setDepositTarget(null)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Enregistrer un dépôt</Text>
            <Text style={{ color: colors.inkSoft, marginBottom: 10 }}>
              Pour {depositTarget?.user?.name} — {depositTarget?.user?.phone}
            </Text>
            <TextInput
              style={styles.input}
              value={depositAmount}
              onChangeText={setDepositAmount}
              placeholder="Montant reçu (FCFA)"
              keyboardType="numeric"
            />
            <ImageAttach
              value={depositProof}
              onChange={(url, previewUri) => setDepositProof({ url, previewUri })}
              label="Photo du justificatif (obligatoire)"
            />
            {!!formError && <Text style={{ color: colors.danger, marginTop: 10 }}>{formError}</Text>}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <PrimaryButton title="Annuler" variant="outline" onPress={() => setDepositTarget(null)} style={{ flex: 1 }} />
              <PrimaryButton title="Enregistrer" onPress={submitDeposit} loading={busy} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal envoi des fonds : automatique MyPVit ou manuel */}
      <Modal visible={!!disburseTarget} transparent animationType="fade" onRequestClose={() => setDisburseTarget(null)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Envoyer les fonds</Text>
            <Text style={{ color: colors.inkSoft, marginBottom: 14 }}>
              {disburseTarget?.user?.name} — {money(disburseTarget?.amount)} FCFA
            </Text>

            {mypvitAvailable && (
              <>
                <Text style={styles.fieldLabel}>Opérateur (envoi automatique)</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
                  {[{ code: "AIRTEL_MONEY", label: "Airtel Money" }, { code: "MOOV_MONEY", label: "Moov Money" }].map((op) => (
                    <TouchableOpacity
                      key={op.code}
                      onPress={() => setDisburseOperator(op.code)}
                      style={[styles.chip, disburseOperator === op.code && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, disburseOperator === op.code && styles.chipTextActive]}>{op.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {!!formError && <Text style={{ color: colors.danger, marginTop: 8 }}>{formError}</Text>}
                <PrimaryButton title="Envoyer automatiquement" onPress={disburseAuto} loading={busy} style={{ marginTop: 14 }} />
                <Text style={styles.orDivider}>— ou —</Text>
              </>
            )}

            <PrimaryButton
              title="J'ai envoyé l'argent moi-même"
              variant="outline"
              onPress={disburseManual}
              loading={busy}
            />
            {!mypvitAvailable && !!formError && <Text style={{ color: colors.danger, marginTop: 10 }}>{formError}</Text>}

            <PrimaryButton title="Annuler" variant="outline" onPress={() => setDisburseTarget(null)} style={{ marginTop: 10 }} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.line, marginRight: 8,
  },
  chipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.ink },
  chipTextActive: { color: colors.white },
  smallBtn: { paddingVertical: 9, paddingHorizontal: 14, flexGrow: 0 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: colors.card, borderRadius: 18, padding: 20 },
  modalTitle: { fontSize: 17, fontWeight: "800", marginBottom: 4 },
  fieldLabel: { fontSize: 11.5, fontWeight: "700", color: colors.inkSoft, textTransform: "uppercase", marginBottom: 8 },
  orDivider: { textAlign: "center", color: colors.inkSoft, fontSize: 12, marginVertical: 12 },
  input: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 12, fontSize: 15,
    marginBottom: 10, backgroundColor: colors.paper,
  },
});

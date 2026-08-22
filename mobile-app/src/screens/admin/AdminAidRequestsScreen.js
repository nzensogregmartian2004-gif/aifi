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

const OPERATOR_LABELS = { AIRTEL_MONEY: "Airtel Money", MOOV_MONEY: "Moov Money" };

export default function AdminAidRequestsScreen({ navigation }) {
  const [filter, setFilter] = useState("PENDING");
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [acceptTarget, setAcceptTarget] = useState(null);
  const [depositTarget, setDepositTarget] = useState(null);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositProof, setDepositProof] = useState(null);
  const [disburseTarget, setDisburseTarget] = useState(null);
  const [disburseNote, setDisburseNote] = useState("");
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
    api.get("/admin/payments/config").then(({ data }) => setMypvitAvailable(data.available)).catch(() => setMypvitAvailable(false));
  }, [filter]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function accept() {
    setBusy(true);
    setFormError("");
    try {
      await api.post(`/admin/aid-requests/${acceptTarget.id}/accept`);
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

  function openDisburse(item) {
    setDisburseTarget(item);
    setDisburseNote("");
    setFormError("");
  }

  async function disburseAuto() {
    setBusy(true);
    setFormError("");
    try {
      await api.post(`/admin/aid-requests/${disburseTarget.id}/disburse-mypvit`);
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
      await api.post(`/admin/aid-requests/${disburseTarget.id}/disburse`, { note: disburseNote || undefined });
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
          const remaining = item.amountDue - repaid;
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
              {item.amountDue !== item.amount && (
                <Text style={{ color: colors.inkSoft, fontSize: 12.5, marginTop: 2 }}>
                  Total à rembourser : {money(item.amountDue)} FCFA
                </Text>
              )}
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 2 }}>
                <Text style={{ color: colors.inkSoft, fontSize: 12.5 }}>
                  Demandée le {new Date(item.createdAt).toLocaleDateString("fr-FR")}
                </Text>
                {item.dueDate && (
                  <Text style={{ color: colors.inkSoft, fontSize: 12.5 }}>
                    Échéance : {new Date(item.dueDate).toLocaleDateString("fr-FR")}
                  </Text>
                )}
              </View>

              {item.receivingOperator && (
                <View style={styles.receivingBox}>
                  <Text style={styles.receivingTitle}>Réception choisie par le client</Text>
                  <Text style={styles.receivingLine}>
                    {OPERATOR_LABELS[item.receivingOperator] || item.receivingOperator} · {item.receivingPhone}
                  </Text>
                  <Text style={styles.receivingLine}>Nom sur le compte : {item.receivingName}</Text>
                </View>
              )}

              {repaid > 0 && (
                <Text style={{ color: colors.success, fontSize: 12.5, marginTop: 8 }}>
                  Déjà remboursé : {money(repaid)} FCFA — reste dû : {money(remaining)} FCFA
                </Text>
              )}

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                {item.status === "PENDING" && (
                  <>
                    <PrimaryButton
                      title="Accepter"
                      onPress={() => { setAcceptTarget(item); setFormError(""); }}
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
                <PrimaryButton
                  title="Voir les informations du client"
                  variant="outline"
                  onPress={() => navigation.navigate("AdminUtilisateurs", { screen: "AdminUserDetail", params: { userId: item.user.id } })}
                  style={styles.smallBtn}
                />
              </View>
            </Card>
          );
        }}
      />

      {/* Modal acceptation — la durée est déjà figée depuis la demande, rien à choisir */}
      <Modal visible={!!acceptTarget} transparent animationType="fade" onRequestClose={() => setAcceptTarget(null)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Accepter la demande</Text>
            <Text style={{ color: colors.inkSoft, marginTop: 6, marginBottom: 4 }}>
              {acceptTarget?.user?.name} — {money(acceptTarget?.amount)} FCFA
            </Text>
            <Text style={{ color: colors.inkSoft, fontSize: 12.5, marginBottom: 14 }}>
              À rembourser : {money(acceptTarget?.amountDue)} FCFA avant le{" "}
              {acceptTarget?.dueDate && new Date(acceptTarget.dueDate).toLocaleDateString("fr-FR")}
            </Text>
            {!!formError && <Text style={{ color: colors.danger, marginBottom: 10 }}>{formError}</Text>}
            <View style={{ flexDirection: "row", gap: 10 }}>
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

      {/* Modal envoi des fonds : vers le compte choisi PAR LE CLIENT — l'admin ne choisit jamais l'opérateur */}
      <Modal visible={!!disburseTarget} transparent animationType="fade" onRequestClose={() => setDisburseTarget(null)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Envoyer les fonds</Text>
            <Text style={{ color: colors.inkSoft, marginTop: 6, marginBottom: 14 }}>
              {disburseTarget?.user?.name} — {money(disburseTarget?.amount)} FCFA
            </Text>

            <View style={styles.receivingBox}>
              <Text style={styles.receivingTitle}>Destination (choisie par le client)</Text>
              <Text style={styles.receivingLine}>
                {OPERATOR_LABELS[disburseTarget?.receivingOperator] || "—"} · {disburseTarget?.receivingPhone || "—"}
              </Text>
              <Text style={styles.receivingLine}>Nom sur le compte : {disburseTarget?.receivingName || "—"}</Text>
            </View>

            {mypvitAvailable && disburseTarget?.receivingOperator && (
              <>
                {!!formError && <Text style={{ color: colors.danger, marginTop: 10 }}>{formError}</Text>}
                <PrimaryButton title="Envoyer automatiquement" onPress={disburseAuto} loading={busy} style={{ marginTop: 14 }} />
                <Text style={styles.orDivider}>— ou —</Text>
              </>
            )}

            <Text style={styles.fieldLabel}>Envoi manuel</Text>
            <TextInput
              style={styles.input}
              value={disburseNote}
              onChangeText={setDisburseNote}
              placeholder="Note (optionnel) — ex : envoyé via agent X"
            />
            {(!mypvitAvailable || !disburseTarget?.receivingOperator) && !!formError && (
              <Text style={{ color: colors.danger, marginTop: 4, marginBottom: 6 }}>{formError}</Text>
            )}
            <PrimaryButton title="J'ai envoyé l'argent moi-même" variant="outline" onPress={disburseManual} loading={busy} />

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
  fieldLabel: { fontSize: 11.5, fontWeight: "700", color: colors.inkSoft, textTransform: "uppercase", marginBottom: 8, marginTop: 4 },
  orDivider: { textAlign: "center", color: colors.inkSoft, fontSize: 12, marginVertical: 12 },
  input: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 12, fontSize: 15,
    marginBottom: 10, backgroundColor: colors.paper,
  },
  receivingBox: { backgroundColor: colors.paper, borderRadius: 10, padding: 10, marginTop: 8 },
  receivingTitle: { fontSize: 10.5, fontWeight: "700", color: colors.inkSoft, textTransform: "uppercase", marginBottom: 4 },
  receivingLine: { fontSize: 12.5, color: colors.ink, fontWeight: "600" },
});

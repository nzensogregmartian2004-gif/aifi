import React, { useCallback, useState } from "react";
import { View, Text, FlatList, StyleSheet, RefreshControl, Modal, TextInput } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage } from "../../api/client";
import { Card, ScreenTitle, PrimaryButton, EmptyState } from "../../components/ui";
import ImageAttach from "../../components/ImageAttach";
import { colors, money } from "../../theme";

const OPERATOR_LABELS = { AIRTEL_MONEY: "Airtel Money", MOOV_MONEY: "Moov Money" };

export default function AdminWithdrawalsScreen() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [approveTarget, setApproveTarget] = useState(null);
  const [mypvitAvailable, setMypvitAvailable] = useState(false);
  const [proof, setProof] = useState(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/withdrawals", { params: { status: "PENDING" } });
      setItems(data);
      setError("");
    } catch (err) {
      setError(apiErrorMessage(err));
    }
    api.get("/admin/payments/config").then(({ data }) => setMypvitAvailable(data.available)).catch(() => setMypvitAvailable(false));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function openApprove(item) {
    setApproveTarget(item);
    setProof(null);
    setFormError("");
  }

  async function approveAuto() {
    setBusy(true);
    setFormError("");
    try {
      await api.post(`/admin/withdrawals/${approveTarget.id}/approve-mypvit`);
      setApproveTarget(null);
      load();
    } catch (err) {
      setFormError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function approveManual() {
    if (!proof?.url) return setFormError("Le justificatif (photo de l'envoi) est obligatoire.");
    setBusy(true);
    setFormError("");
    try {
      await api.post(`/admin/withdrawals/${approveTarget.id}/approve`, { proofImageUrl: proof.url });
      setApproveTarget(null);
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
      await api.post(`/admin/withdrawals/${item.id}/reject`);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper, paddingTop: 60 }}>
      <View style={{ paddingHorizontal: 20 }}>
        <ScreenTitle subtitle="Demandes de retrait du portefeuille de parrainage">Retraits</ScreenTitle>
      </View>

      {!!error && <Text style={{ color: colors.danger, paddingHorizontal: 20 }}>{error}</Text>}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 20, paddingTop: 4 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}
        ListEmptyComponent={<EmptyState text="Aucun retrait en attente." />}
        renderItem={({ item }) => (
          <Card>
            <Text style={{ fontWeight: "700", fontSize: 15 }}>{item.user.name}</Text>
            <Text style={{ color: colors.inkSoft, fontSize: 12.5 }}>{item.user.phone}</Text>
            <Text style={{ fontSize: 20, fontWeight: "800", marginTop: 8 }}>{money(item.amount)} FCFA</Text>

            {item.receivingOperator && (
              <View style={styles.receivingBox}>
                <Text style={styles.receivingTitle}>Réception choisie par le client</Text>
                <Text style={styles.receivingLine}>
                  {OPERATOR_LABELS[item.receivingOperator] || item.receivingOperator} · {item.receivingPhone}
                </Text>
                <Text style={styles.receivingLine}>Nom sur le compte : {item.receivingName}</Text>
              </View>
            )}

            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <PrimaryButton title="Envoyer" onPress={() => openApprove(item)} style={styles.smallBtn} />
              <PrimaryButton title="Refuser" variant="outline" onPress={() => reject(item)} style={styles.smallBtn} />
            </View>
          </Card>
        )}
      />

      <Modal visible={!!approveTarget} transparent animationType="fade" onRequestClose={() => setApproveTarget(null)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Envoyer le retrait</Text>
            <Text style={{ color: colors.inkSoft, marginBottom: 14 }}>
              {approveTarget?.user?.name} — {money(approveTarget?.amount)} FCFA
            </Text>

            <View style={styles.receivingBox}>
              <Text style={styles.receivingTitle}>Destination (choisie par le client)</Text>
              <Text style={styles.receivingLine}>
                {OPERATOR_LABELS[approveTarget?.receivingOperator] || "—"} · {approveTarget?.receivingPhone || "—"}
              </Text>
              <Text style={styles.receivingLine}>Nom sur le compte : {approveTarget?.receivingName || "—"}</Text>
            </View>

            {mypvitAvailable && approveTarget?.receivingOperator && (
              <>
                {!!formError && <Text style={{ color: colors.danger, marginTop: 10 }}>{formError}</Text>}
                <PrimaryButton title="Envoyer automatiquement" onPress={approveAuto} loading={busy} style={{ marginTop: 14 }} />
                <Text style={styles.orDivider}>— ou —</Text>
              </>
            )}

            <Text style={styles.fieldLabel}>Envoi manuel</Text>
            <Text style={{ color: colors.inkSoft, fontSize: 12.5, marginBottom: 10 }}>
              Envoie d'abord l'argent toi-même, puis joins la capture d'écran de l'envoi ici.
            </Text>
            <ImageAttach
              value={proof}
              onChange={(url, previewUri) => setProof({ url, previewUri })}
              label="Photo du justificatif"
            />
            {(!mypvitAvailable || !approveTarget?.receivingOperator) && !!formError && (
              <Text style={{ color: colors.danger, marginTop: 10 }}>{formError}</Text>
            )}
            <PrimaryButton title="J'ai envoyé l'argent moi-même" variant="outline" onPress={approveManual} loading={busy} style={{ marginTop: 10 }} />

            <PrimaryButton title="Annuler" variant="outline" onPress={() => setApproveTarget(null)} style={{ marginTop: 10 }} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  smallBtn: { paddingVertical: 9, paddingHorizontal: 14, flexGrow: 0 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: colors.card, borderRadius: 18, padding: 20 },
  modalTitle: { fontSize: 17, fontWeight: "800", marginBottom: 4 },
  fieldLabel: { fontSize: 11.5, fontWeight: "700", color: colors.inkSoft, textTransform: "uppercase", marginBottom: 8, marginTop: 4 },
  orDivider: { textAlign: "center", color: colors.inkSoft, fontSize: 12, marginVertical: 12 },
  receivingBox: { backgroundColor: colors.paper, borderRadius: 10, padding: 10, marginTop: 8 },
  receivingTitle: { fontSize: 10.5, fontWeight: "700", color: colors.inkSoft, textTransform: "uppercase", marginBottom: 4 },
  receivingLine: { fontSize: 12.5, color: colors.ink, fontWeight: "600" },
});

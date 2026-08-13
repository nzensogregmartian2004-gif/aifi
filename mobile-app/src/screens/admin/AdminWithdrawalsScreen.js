import React, { useCallback, useState } from "react";
import { View, Text, FlatList, StyleSheet, RefreshControl, Modal } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage } from "../../api/client";
import { Card, ScreenTitle, PrimaryButton, EmptyState } from "../../components/ui";
import ImageAttach from "../../components/ImageAttach";
import { colors, money } from "../../theme";

export default function AdminWithdrawalsScreen() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [approveTarget, setApproveTarget] = useState(null);
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

  async function approve() {
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
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <PrimaryButton title="Approuver" onPress={() => openApprove(item)} style={styles.smallBtn} />
              <PrimaryButton title="Refuser" variant="outline" onPress={() => reject(item)} style={styles.smallBtn} />
            </View>
          </Card>
        )}
      />

      <Modal visible={!!approveTarget} transparent animationType="fade" onRequestClose={() => setApproveTarget(null)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Approuver le retrait</Text>
            <Text style={{ color: colors.inkSoft, marginBottom: 10 }}>
              {approveTarget?.user?.name} — {money(approveTarget?.amount)} FCFA. Envoie d'abord l'argent, puis joins la
              capture d'écran de l'envoi ici.
            </Text>
            <ImageAttach
              value={proof}
              onChange={(url, previewUri) => setProof({ url, previewUri })}
              label="Photo du justificatif (obligatoire)"
            />
            {!!formError && <Text style={{ color: colors.danger, marginTop: 10 }}>{formError}</Text>}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <PrimaryButton title="Annuler" variant="outline" onPress={() => setApproveTarget(null)} style={{ flex: 1 }} />
              <PrimaryButton title="Approuver" onPress={approve} loading={busy} style={{ flex: 1 }} />
            </View>
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
});

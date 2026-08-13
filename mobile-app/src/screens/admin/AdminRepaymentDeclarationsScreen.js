import React, { useCallback, useState } from "react";
import { View, Text, FlatList, StyleSheet, RefreshControl, Modal } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage } from "../../api/client";
import { Card, ScreenTitle, PrimaryButton, EmptyState } from "../../components/ui";
import ImageAttach from "../../components/ImageAttach";
import { colors, money } from "../../theme";

export default function AdminRepaymentDeclarationsScreen() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [confirmProof, setConfirmProof] = useState(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/repayment-declarations", { params: { status: "PENDING" } });
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

  function openConfirm(item) {
    setConfirmTarget(item);
    setConfirmProof(null);
    setFormError("");
  }

  async function confirm() {
    setBusy(true);
    setFormError("");
    try {
      await api.post(`/admin/repayment-declarations/${confirmTarget.id}/confirm`, {
        proofImageUrl: confirmProof?.url,
      });
      setConfirmTarget(null);
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
      await api.post(`/admin/repayment-declarations/${item.id}/reject`);
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
        <ScreenTitle subtitle="Déclarations envoyées par les clients, en attente de confirmation">
          Remboursements déclarés
        </ScreenTitle>
      </View>

      {!!error && <Text style={{ color: colors.danger, paddingHorizontal: 20 }}>{error}</Text>}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 20, paddingTop: 4 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}
        ListEmptyComponent={<EmptyState text="Aucune déclaration en attente." />}
        renderItem={({ item }) => (
          <Card>
            <Text style={{ fontWeight: "700", fontSize: 15 }}>{item.user.name}</Text>
            <Text style={{ color: colors.inkSoft, fontSize: 12.5 }}>{item.user.phone}</Text>
            <Text style={{ fontSize: 20, fontWeight: "800", marginTop: 8 }}>{money(item.amount)} FCFA</Text>
            {!!item.note && <Text style={{ color: colors.inkSoft, marginTop: 4, fontStyle: "italic" }}>« {item.note} »</Text>}
            {item.proofImageUrl && (
              <Text style={{ color: colors.success, fontSize: 12.5, marginTop: 6 }}>📎 Le client a joint une photo</Text>
            )}
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <PrimaryButton title="Confirmer" onPress={() => openConfirm(item)} style={styles.smallBtn} />
              <PrimaryButton title="Refuser" variant="outline" onPress={() => reject(item)} style={styles.smallBtn} />
            </View>
          </Card>
        )}
      />

      <Modal visible={!!confirmTarget} transparent animationType="fade" onRequestClose={() => setConfirmTarget(null)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Confirmer le remboursement</Text>
            <Text style={{ color: colors.inkSoft, marginBottom: 10 }}>
              {confirmTarget?.user?.name} — {money(confirmTarget?.amount)} FCFA
            </Text>
            <Text style={{ color: colors.inkSoft, fontSize: 12.5, marginBottom: 6 }}>
              Le justificatif du client sera conservé automatiquement. Tu peux en ajouter un autre si besoin.
            </Text>
            <ImageAttach
              value={confirmProof}
              onChange={(url, previewUri) => setConfirmProof({ url, previewUri })}
              label="Ajouter une photo (optionnel)"
            />
            {!!formError && <Text style={{ color: colors.danger, marginTop: 10 }}>{formError}</Text>}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <PrimaryButton title="Annuler" variant="outline" onPress={() => setConfirmTarget(null)} style={{ flex: 1 }} />
              <PrimaryButton title="Confirmer" onPress={confirm} loading={busy} style={{ flex: 1 }} />
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

import React, { useCallback, useState } from "react";
import { View, Text, FlatList, StyleSheet, RefreshControl, Modal, TouchableOpacity } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage } from "../../api/client";
import { Card, ScreenTitle, PrimaryButton, EmptyState } from "../../components/ui";
import ImageAttach from "../../components/ImageAttach";
import { colors, money } from "../../theme";

const OPERATORS = [
  { code: "AIRTEL_MONEY", label: "Airtel Money" },
  { code: "MOOV_MONEY", label: "Moov Money" },
];

export default function AdminWithdrawalsScreen() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [approveTarget, setApproveTarget] = useState(null);
  const [operator, setOperator] = useState(null);
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
    setOperator(null); // pas de présélection — choix explicite
    setProof(null);
    setFormError("");
  }

  async function approveAuto() {
    if (!operator) return setFormError("Choisis un opérateur.");
    setBusy(true);
    setFormError("");
    try {
      await api.post(`/admin/withdrawals/${approveTarget.id}/approve-mypvit`, { operatorCode: operator });
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

            {mypvitAvailable && (
              <>
                <Text style={styles.fieldLabel}>Opérateur (envoi automatique)</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
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
                {!!formError && <Text style={{ color: colors.danger, marginTop: 8 }}>{formError}</Text>}
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
            {!mypvitAvailable && !!formError && <Text style={{ color: colors.danger, marginTop: 10 }}>{formError}</Text>}
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
  fieldLabel: { fontSize: 11.5, fontWeight: "700", color: colors.inkSoft, textTransform: "uppercase", marginBottom: 8 },
  orDivider: { textAlign: "center", color: colors.inkSoft, fontSize: 12, marginVertical: 12 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.paper,
    borderWidth: 1, borderColor: colors.line,
  },
  chipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.ink },
  chipTextActive: { color: colors.white },
});

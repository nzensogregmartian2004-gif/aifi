import React, { useState } from "react";
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { api, apiErrorMessage } from "../../api/client";
import { Card, ScreenTitle, PrimaryButton, Badge } from "../../components/ui";
import ImageAttach from "../../components/ImageAttach";
import { colors, money } from "../../theme";

export default function AdminQuickDepositScreen() {
  const [phone, setPhone] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [user, setUser] = useState(null);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [amount, setAmount] = useState("");
  const [proof, setProof] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function search() {
    if (!phone.trim()) return;
    setSearching(true);
    setError("");
    setUser(null);
    setSelectedRequest(null);
    setDone(false);
    try {
      const { data } = await api.get("/admin/users/lookup-by-phone", { params: { phone: phone.trim() } });
      setUser(data);
      if (data.aidRequests?.length === 1) setSelectedRequest(data.aidRequests[0]);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSearching(false);
    }
  }

  async function submit() {
    const value = parseInt(amount, 10);
    if (!selectedRequest) return setError("Choisis l'aide concernée.");
    if (!value || value <= 0) return setError("Montant invalide.");
    if (!proof?.url) return setError("Le justificatif (photo) est obligatoire.");
    setBusy(true);
    setError("");
    try {
      await api.post(`/admin/aid-requests/${selectedRequest.id}/repayments`, {
        amount: value,
        proofImageUrl: proof.url,
      });
      setDone(true);
      setSelectedRequest(null);
      setAmount("");
      setProof(null);
      setUser(null);
      setPhone("");
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.paper }} contentContainerStyle={{ padding: 20, paddingTop: 60 }}>
      <ScreenTitle subtitle="Enregistre un dépôt à partir du numéro de la personne">Dépôt facilité</ScreenTitle>

      {done && (
        <Card style={{ borderColor: colors.success, borderWidth: 1.5 }}>
          <Text style={{ color: colors.success, fontWeight: "700" }}>✓ Dépôt enregistré avec succès.</Text>
        </Card>
      )}

      <Card>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={phone}
            onChangeText={setPhone}
            placeholder="Numéro de téléphone"
            keyboardType="phone-pad"
          />
          <PrimaryButton title="Chercher" onPress={search} loading={searching} style={{ paddingHorizontal: 18 }} />
        </View>
      </Card>

      {!!error && <Text style={{ color: colors.danger, marginBottom: 10 }}>{error}</Text>}

      {user && (
        <Card>
          <Text style={{ fontWeight: "700", fontSize: 16 }}>{user.name}</Text>
          <Text style={{ color: colors.inkSoft, fontSize: 12.5, marginBottom: 10 }}>{user.phone}</Text>

          {user.aidRequests.length === 0 ? (
            <Text style={{ color: colors.inkSoft, fontStyle: "italic" }}>
              Aucune aide en cours de remboursement pour cette personne.
            </Text>
          ) : (
            <>
              <Text style={styles.label}>Aide concernée</Text>
              {user.aidRequests.map((r) => {
                const repaid = r.repayments.reduce((s, p) => s + p.amount, 0);
                const active = selectedRequest?.id === r.id;
                return (
                  <TouchableOpacity
                    key={r.id}
                    onPress={() => setSelectedRequest(r)}
                    style={[styles.reqRow, active && styles.reqRowActive]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: "700" }}>{money(r.amount)} FCFA</Text>
                      <Text style={{ fontSize: 12, color: colors.inkSoft }}>Reste dû : {money(r.amountDue - repaid)} FCFA</Text>
                    </View>
                    <Badge status={r.status} />
                  </TouchableOpacity>
                );
              })}
            </>
          )}
        </Card>
      )}

      {selectedRequest && (
        <Card>
          <Text style={styles.label}>Montant reçu (FCFA)</Text>
          <TextInput style={styles.input} value={amount} onChangeText={setAmount} placeholder="Ex: 1500" keyboardType="numeric" />
          <Text style={styles.label}>Justificatif</Text>
          <ImageAttach value={proof} onChange={(url, previewUri) => setProof({ url, previewUri })} label="Photo du paiement reçu (obligatoire)" />
          <PrimaryButton title="Enregistrer le dépôt" onPress={submit} loading={busy} style={{ marginTop: 14 }} />
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 12, fontSize: 15,
    backgroundColor: colors.paper,
  },
  label: { fontSize: 12.5, fontWeight: "700", color: colors.inkSoft, marginTop: 10, marginBottom: 6 },
  reqRow: {
    flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 10, borderWidth: 1,
    borderColor: colors.line, marginBottom: 8, backgroundColor: colors.paper,
  },
  reqRowActive: { borderColor: colors.gold, backgroundColor: colors.goldSoft },
});

import React, { useState } from "react";
import { View, Text, TextInput, StyleSheet, Alert } from "react-native";
import { api, apiErrorMessage } from "../api/client";
import { Card, ScreenTitle, PrimaryButton } from "../components/ui";
import { colors } from "../theme";
import { useAuth } from "../context/AuthContext";

export default function ProfileScreen({ navigation }) {
  const { logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    if (newPassword.length < 6) {
      setError("Le nouveau mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    if (newPassword !== confirm) {
      setError("La confirmation ne correspond pas au nouveau mot de passe.");
      return;
    }
    setLoading(true);
    try {
      await api.post("/account/change-password", { currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      Alert.alert("Mot de passe modifié", "Ton mot de passe a bien été mis à jour.");
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper, padding: 20, paddingTop: 60 }}>
      <ScreenTitle subtitle="Sécurité de ton compte">Mon profil</ScreenTitle>

      <Card>
        <Text style={styles.cardTitle}>Comment fonctionne AIFI ?</Text>
        <Text style={styles.sectionText}>
          Points, plafonds, demandes d'aide, remboursement, parrainage... Retrouve les explications à tout moment.
        </Text>
        <PrimaryButton
          title="Revoir les explications"
          variant="outline"
          onPress={() => navigation.navigate("Onboarding")}
          style={{ marginTop: 12 }}
        />
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Changer mon mot de passe</Text>

        {!!error && <Text style={{ color: colors.danger, marginBottom: 10 }}>{error}</Text>}

        <Text style={styles.label}>Mot de passe actuel</Text>
        <TextInput
          style={styles.input}
          value={currentPassword}
          onChangeText={setCurrentPassword}
          secureTextEntry
          placeholder="••••••••"
          placeholderTextColor={colors.inkSoft}
        />

        <Text style={styles.label}>Nouveau mot de passe</Text>
        <TextInput
          style={styles.input}
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          placeholder="Au moins 6 caractères"
          placeholderTextColor={colors.inkSoft}
        />

        <Text style={styles.label}>Confirmer le nouveau mot de passe</Text>
        <TextInput
          style={styles.input}
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          placeholder="••••••••"
          placeholderTextColor={colors.inkSoft}
        />

        <PrimaryButton title="Mettre à jour" onPress={submit} loading={loading} style={{ marginTop: 16 }} />
      </Card>

      <Text style={styles.hint}>
        Mot de passe oublié ? Contacte l'administrateur : il peut réinitialiser ton mot de passe et t'en communiquer
        un nouveau directement.
      </Text>

      <PrimaryButton title="Se déconnecter" onPress={logout} variant="outline" style={{ marginTop: 24 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  cardTitle: { fontSize: 15, fontWeight: "700", color: colors.ink, marginBottom: 12 },
  sectionText: { fontSize: 13, color: colors.inkSoft, lineHeight: 18 },
  label: { fontSize: 11.5, fontWeight: "700", color: colors.inkSoft, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6, marginTop: 10 },
  input: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12,
    fontSize: 15, backgroundColor: "#fff", color: colors.ink,
  },
  hint: { fontSize: 12.5, color: colors.inkSoft, marginTop: 16, lineHeight: 18 },
});

import React, { useState } from "react";
import { View, Text, TextInput, StyleSheet, Alert, ScrollView, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api, apiErrorMessage } from "../api/client";
import { Card, PrimaryButton, Badge } from "../components/ui";
import { colors, fonts, STATUS_LABELS } from "../theme";
import { useAuth } from "../context/AuthContext";

function InfoRow({ label, value, last }) {
  return (
    <View style={[styles.infoRow, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || "—"}</Text>
    </View>
  );
}

export default function ProfileScreen({ navigation }) {
  const { user, logout, isAdmin } = useAuth();
  const [pwdOpen, setPwdOpen] = useState(true);
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

  function confirmDeleteAccount() {
    Alert.alert(
      "Supprimer mon compte",
      "La suppression d'un compte AIFI doit être traitée par un administrateur, pour protéger tes aides et remboursements en cours. Veux-tu lui envoyer ta demande par message ?",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Contacter l'administrateur",
          style: "destructive",
          onPress: () => navigation.navigate(isAdmin ? "AdminMessages" : "Messages"),
        },
      ]
    );
  }

  const initials = (user?.name || "?").trim().slice(0, 2).toUpperCase();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.paper }}
      contentContainerStyle={{ padding: 20, paddingTop: 60, paddingBottom: 48 }}
    >
      <Text style={styles.title}>Mon profil</Text>
      <Text style={styles.subtitle}>Gestion de tes informations personnelles</Text>

      <View style={styles.identityBlock}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.name}>{user?.name || "..."}</Text>
        <Text style={styles.phone}>{user?.phone}</Text>
        {user?.status && (
          <View style={{ marginTop: 8 }}>
            <Badge status={user.status} />
          </View>
        )}
      </View>

      {isAdmin && (
        <Card>
          <Text style={styles.cardTitle}>Paramètres</Text>
          <Text style={styles.sectionText}>
            Grille de plafonds, taux, durées de remboursement, bonus de parrainage...
          </Text>
          <PrimaryButton
            title="Ouvrir les paramètres"
            variant="outline"
            onPress={() => navigation.navigate("AdminSettings")}
            style={{ marginTop: 12 }}
          />
        </Card>
      )}

      {isAdmin && (
        <Card>
          <Text style={styles.cardTitle}>Administrateurs</Text>
          <Text style={styles.sectionText}>
            Crée un accès direct côté administration pour une autre personne de confiance.
          </Text>
          <PrimaryButton
            title="Gérer les administrateurs"
            variant="outline"
            onPress={() => navigation.navigate("AdminManageAdmins")}
            style={{ marginTop: 12 }}
          />
        </Card>
      )}

      <Card>
        <Text style={styles.cardTitle}>Informations personnelles</Text>
        <View style={{ marginTop: 10 }}>
          <InfoRow label="Numéro de téléphone" value={user?.phone} />
          <InfoRow label="Statut du compte" value={STATUS_LABELS[user?.status] || user?.status} last />
        </View>
      </Card>

      <Card style={{ paddingBottom: pwdOpen ? 16 : 4 }}>
        <Pressable style={styles.cardHeaderRow} onPress={() => setPwdOpen((v) => !v)}>
          <Text style={styles.cardTitle}>Changer mon mot de passe</Text>
          <Ionicons name={pwdOpen ? "chevron-up" : "chevron-down"} size={18} color={colors.inkSoft} />
        </Pressable>

        {pwdOpen && (
          <>
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

            <Text style={styles.hint}>
              Mot de passe oublié ? Contacte l'administrateur : il peut réinitialiser ton mot de passe et t'en
              communiquer un nouveau directement.
            </Text>
          </>
        )}
      </Card>

      <Text style={styles.sectionLabel}>Sécurité et compte</Text>
      <Card style={{ gap: 10 }}>
        <PrimaryButton title="Se déconnecter" onPress={logout} variant="outline" />
        <Pressable onPress={confirmDeleteAccount} hitSlop={6}>
          <Text style={styles.deleteText}>Supprimer mon compte</Text>
        </Pressable>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.display, fontSize: 24, fontWeight: "800", color: colors.ink },
  subtitle: { fontSize: 13.5, color: colors.inkSoft, marginTop: 4, marginBottom: 4 },
  identityBlock: { alignItems: "center", paddingVertical: 22 },
  avatar: {
    width: 76, height: 76, borderRadius: 38, backgroundColor: colors.gold,
    alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: colors.card,
  },
  avatarText: { color: colors.white, fontWeight: "800", fontSize: 24 },
  name: { fontSize: 18, fontWeight: "800", color: colors.ink, marginTop: 12 },
  phone: { fontSize: 13.5, color: colors.inkSoft, marginTop: 2 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: colors.ink },
  cardHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  sectionText: { fontSize: 13, color: colors.inkSoft, lineHeight: 18, marginTop: 6 },
  sectionLabel: {
    fontSize: 12, fontWeight: "700", color: colors.inkSoft, textTransform: "uppercase",
    letterSpacing: 0.5, marginTop: 8, marginBottom: 10,
  },
  infoRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  infoLabel: { fontSize: 13, color: colors.inkSoft },
  infoValue: { fontSize: 13.5, fontWeight: "600", color: colors.ink },
  label: { fontSize: 11.5, fontWeight: "700", color: colors.inkSoft, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6, marginTop: 10 },
  input: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12,
    fontSize: 15, backgroundColor: "#fff", color: colors.ink,
  },
  hint: { fontSize: 12.5, color: colors.inkSoft, marginTop: 16, lineHeight: 18 },
  deleteText: { color: colors.danger, fontSize: 13.5, fontWeight: "700", textAlign: "center", paddingVertical: 6 },
});

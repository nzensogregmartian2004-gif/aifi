import React, { useCallback, useState } from "react";
import { View, Text, TextInput, StyleSheet, Alert, ScrollView, Pressable } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api, apiErrorMessage } from "../api/client";
import { Card, ScreenTitle, PrimaryButton, HelpButton } from "../components/ui";
import HelpDocModal from "../components/HelpDocModal";
import { colors } from "../theme";
import { useAuth } from "../context/AuthContext";

export default function ProfileScreen({ navigation }) {
  const { logout, isAdmin } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [helpVisible, setHelpVisible] = useState(false);
  const [premium, setPremium] = useState(null); // { isPremium, premiumExpiresAt } depuis /client/dashboard

  useFocusEffect(
    useCallback(() => {
      if (isAdmin) return;
      api.get("/client/dashboard")
        .then(({ data }) => setPremium({ isPremium: data.isPremium, premiumExpiresAt: data.premiumExpiresAt }))
        .catch(() => {});
    }, [isAdmin])
  );

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
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.paper }}
      contentContainerStyle={{ padding: 20, paddingTop: 60, paddingBottom: 40 }}
    >
      <ScreenTitle subtitle="Sécurité de ton compte" right={<HelpButton onPress={() => setHelpVisible(true)} />}>
        Mon profil
      </ScreenTitle>

      {!isAdmin && (
        <Pressable onPress={() => navigation.navigate("Premium")}>
          <View style={[styles.premiumCard, premium?.isPremium && { backgroundColor: colors.premium }]}>
            <View style={styles.premiumIconWrap}>
              <Ionicons name="sparkles" size={20} color={premium?.isPremium ? "#fff" : colors.premium} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.premiumTitle, premium?.isPremium && { color: "#fff" }]}>
                {premium?.isPremium ? "AIFI+ actif" : "Passer AIFI+"}
              </Text>
              <Text style={[styles.premiumSubtitle, premium?.isPremium && { color: "rgba(255,255,255,0.9)" }]}>
                {premium?.isPremium
                  ? premium.premiumExpiresAt
                    ? `Valable jusqu'au ${new Date(premium.premiumExpiresAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}`
                    : "Accès à vie"
                  : "Frais réduits, plafond majoré, priorité VIP"}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={premium?.isPremium ? "#fff" : colors.premium} />
          </View>
        </Pressable>
      )}

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
          <Text style={styles.cardTitle}>Analytique</Text>
          <Text style={styles.sectionText}>
            Croissance des clients, volumes décaissés/remboursés et indicateurs de risque.
          </Text>
          <PrimaryButton
            title="Voir les statistiques"
            variant="outline"
            onPress={() => navigation.navigate("AdminAnalytics")}
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

      <HelpDocModal visible={helpVisible} onClose={() => setHelpVisible(false)} navigation={navigation} />
    </ScrollView>
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
  premiumCard: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.premiumSoft,
    borderRadius: 16, padding: 16, marginBottom: 14,
  },
  premiumIconWrap: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.5)",
    alignItems: "center", justifyContent: "center",
  },
  premiumTitle: { fontSize: 14.5, fontWeight: "800", color: colors.premiumInk },
  premiumSubtitle: { fontSize: 12, color: colors.premiumInk, marginTop: 2 },
});

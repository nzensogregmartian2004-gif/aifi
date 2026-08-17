import React, { useCallback, useState } from "react";
import { View, Text, TextInput, StyleSheet, FlatList, Pressable, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { api, apiErrorMessage } from "../../api/client";
import { Card, ScreenTitle, PrimaryButton, EmptyState } from "../../components/ui";
import { colors } from "../../theme";

function generatePassword() {
  // 8 caractères, lisibles à l'oral pour être communiqués par téléphone/SMS
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function AdminManageAdminsScreen() {
  const [admins, setAdmins] = useState([]);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState(generatePassword());
  const [showPassword, setShowPassword] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/admins");
      setAdmins(data);
      setError("");
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function copyCredentials() {
    await Clipboard.setStringAsync(`Téléphone : ${phone}\nMot de passe : ${password}`);
    Alert.alert("Copié", "Identifiants copiés — tu peux les coller dans un SMS ou un message.");
  }

  async function submit() {
    setFormError("");
    if (!name.trim() || !phone.trim()) {
      setFormError("Le nom et le numéro sont obligatoires.");
      return;
    }
    if (password.length < 6) {
      setFormError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/admin/admins", { name, phone, password });
      Alert.alert(
        "Administrateur créé",
        `Communique ces identifiants à ${name} pour qu'il/elle se connecte directement côté admin :\n\nTéléphone : ${phone}\nMot de passe : ${password}`,
        [
          { text: "Copier les identifiants", onPress: copyCredentials },
          { text: "OK" },
        ]
      );
      setName("");
      setPhone("");
      setPassword(generatePassword());
      load();
    } catch (err) {
      setFormError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper, padding: 20, paddingTop: 60 }}>
      <ScreenTitle subtitle="Donne à un membre de confiance un accès direct côté administration">
        Gérer les administrateurs
      </ScreenTitle>

      <Card>
        <Text style={styles.cardTitle}>Créer un nouvel administrateur</Text>
        <Text style={styles.helperText}>
          Le compte créé est actif immédiatement (pas de validation nécessaire). Communique ensuite le numéro et le
          mot de passe à la personne concernée pour qu'elle se connecte directement côté admin.
        </Text>

        {!!formError && <Text style={styles.error}>{formError}</Text>}

        <Text style={styles.label}>Nom complet</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Nom et prénom" />

        <Text style={styles.label}>Téléphone</Text>
        <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="ex : 077000000" />

        <Text style={styles.label}>Mot de passe</Text>
        <View style={styles.passwordRow}>
          <TextInput
            style={styles.passwordInput}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
          />
          <Pressable onPress={() => setShowPassword((v) => !v)} style={styles.eyeButton} hitSlop={10}>
            <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.inkSoft} />
          </Pressable>
        </View>
        <PrimaryButton
          title="Générer un nouveau mot de passe"
          variant="outline"
          onPress={() => setPassword(generatePassword())}
          style={{ marginTop: 10 }}
        />

        <PrimaryButton title="Créer l'administrateur" onPress={submit} loading={submitting} style={{ marginTop: 16 }} />
      </Card>

      <Text style={styles.sectionLabel}>Administrateurs existants</Text>
      {!!error && <Text style={styles.error}>{error}</Text>}
      <FlatList
        data={admins}
        keyExtractor={(item) => item.id}
        style={{ marginTop: 4 }}
        ListEmptyComponent={<EmptyState text="Aucun administrateur trouvé." />}
        renderItem={({ item }) => (
          <Card>
            <Text style={styles.adminName}>{item.name}</Text>
            <Text style={styles.adminMeta}>{item.phone}</Text>
            <Text style={styles.adminMeta}>
              Créé le {new Date(item.createdAt).toLocaleDateString("fr-FR")}
            </Text>
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  cardTitle: { fontSize: 15, fontWeight: "700", color: colors.ink, marginBottom: 6 },
  helperText: { fontSize: 12.5, color: colors.inkSoft, lineHeight: 18, marginBottom: 12 },
  label: { fontSize: 11.5, fontWeight: "700", color: colors.inkSoft, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 11,
    fontSize: 15, backgroundColor: "#fff", color: colors.ink,
  },
  passwordRow: {
    flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.line,
    borderRadius: 8, backgroundColor: "#fff",
  },
  passwordInput: { flex: 1, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: colors.ink },
  eyeButton: { paddingHorizontal: 12, paddingVertical: 11 },
  error: { color: colors.danger, backgroundColor: colors.dangerSoft, padding: 10, borderRadius: 8, marginBottom: 10, fontSize: 13 },
  sectionLabel: { fontSize: 13, fontWeight: "700", color: colors.inkSoft, textTransform: "uppercase", marginTop: 20, marginBottom: 8 },
  adminName: { fontSize: 15, fontWeight: "700", color: colors.ink },
  adminMeta: { fontSize: 12.5, color: colors.inkSoft, marginTop: 2 },
});

import React, { useState } from "react";
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert } from "react-native";
import { useAuth } from "../context/AuthContext";
import { PrimaryButton } from "../components/ui";
import { colors } from "../theme";
import { apiErrorMessage } from "../api/client";

export default function RegisterScreen({ navigation, route }) {
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState(route?.params?.referralCode || "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    setError("");
    setLoading(true);
    try {
      await register(name, phone, password, referralCode);
      Alert.alert(
        "Compte créé",
        "Ton compte est en attente de validation par l'administrateur. Tu pourras te connecter une fois validé.",
        [{ text: "OK", onPress: () => navigation.navigate("Login") }]
      );
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.paper }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Créer un compte</Text>
        <Text style={styles.subtitle}>Ton compte sera activé après validation manuelle.</Text>

        {!!error && <Text style={styles.error}>{error}</Text>}

        <Text style={styles.label}>Nom complet</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Nom et prénom" />

        <Text style={styles.label}>Téléphone</Text>
        <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="ex : 077000000" />

        <Text style={styles.label}>Mot de passe</Text>
        <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" />

        <Text style={styles.label}>Code de parrainage (facultatif)</Text>
        <TextInput style={styles.input} value={referralCode} onChangeText={setReferralCode} autoCapitalize="characters" placeholder="ex : A1B2C3D4" />

        <PrimaryButton title="Créer mon compte" onPress={handleRegister} loading={loading} style={{ marginTop: 18 }} />
        <PrimaryButton title="J'ai déjà un compte" onPress={() => navigation.navigate("Login")} variant="outline" style={{ marginTop: 10 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, paddingTop: 60 },
  title: { fontSize: 24, fontWeight: "700", color: colors.ink },
  subtitle: { color: colors.inkSoft, fontSize: 13.5, marginTop: 4, marginBottom: 18 },
  label: { fontSize: 11.5, fontWeight: "700", color: colors.inkSoft, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 11,
    fontSize: 15, backgroundColor: "#fff", color: colors.ink,
  },
  error: { color: colors.danger, backgroundColor: colors.dangerSoft, padding: 10, borderRadius: 8, marginBottom: 4, fontSize: 13 },
});

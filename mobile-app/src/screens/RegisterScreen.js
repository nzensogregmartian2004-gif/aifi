import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { PrimaryButton } from "../components/ui";
import { colors } from "../theme";
import { apiErrorMessage } from "../api/client";

export default function RegisterScreen({ navigation, route }) {
  const { register, login } = useAuth();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [referralCode, setReferralCode] = useState(
    route?.params?.referralCode || "",
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    setError("");
    setLoading(true);
    try {
      await register(name, phone, password, referralCode);
      // Connexion automatique juste après l'inscription : le client arrive
      // directement sur son tableau de bord (en mode restreint tant que son
      // compte n'est pas validé par un administrateur), plutôt que d'être
      // renvoyé sur l'écran de connexion.
      await login(phone, password);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.paper }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Créer un compte</Text>
        <Text style={styles.subtitle}>
          Ton compte sera activé après validation manuelle.
        </Text>

        {!!error && <Text style={styles.error}>{error}</Text>}

        <Text style={styles.label}>Nom complet</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Nom et prénom"
        />

        <Text style={styles.label}>Téléphone</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="ex : 077000000"
        />

        <Text style={styles.label}>Mot de passe</Text>
        <View style={styles.passwordRow}>
          <TextInput
            style={styles.passwordInput}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            placeholder="••••••••"
          />
          <Pressable
            onPress={() => setShowPassword((v) => !v)}
            style={styles.eyeButton}
            hitSlop={10}
          >
            <Ionicons
              name={showPassword ? "eye-off-outline" : "eye-outline"}
              size={20}
              color={colors.inkSoft}
            />
          </Pressable>
        </View>

        <Text style={styles.label}>Code de parrainage (facultatif)</Text>
        <TextInput
          style={styles.input}
          value={referralCode}
          onChangeText={setReferralCode}
          autoCapitalize="characters"
          placeholder="ex : A1B2C3D4"
        />

        <PrimaryButton
          title="Créer mon compte"
          onPress={handleRegister}
          loading={loading}
          style={{ marginTop: 18 }}
        />
        <PrimaryButton
          title="J'ai déjà un compte"
          onPress={() => navigation.navigate("Login")}
          variant="outline"
          style={{ marginTop: 10 }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, paddingTop: 60 },
  title: { fontSize: 24, fontWeight: "700", color: colors.ink },
  subtitle: {
    color: colors.inkSoft,
    fontSize: 13.5,
    marginTop: 4,
    marginBottom: 18,
  },
  label: {
    fontSize: 11.5,
    fontWeight: "700",
    color: colors.inkSoft,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    backgroundColor: "#fff",
    color: colors.ink,
  },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: colors.ink,
  },
  eyeButton: { paddingHorizontal: 12, paddingVertical: 11 },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    padding: 10,
    borderRadius: 8,
    marginBottom: 4,
    fontSize: 13,
  },
});

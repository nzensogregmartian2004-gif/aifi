import React, { useState } from "react";
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Pressable, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { PrimaryButton } from "../components/ui";
import { colors, fonts } from "../theme";
import { apiErrorMessage } from "../api/client";

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setError("");
    setLoading(true);
    try {
      await login(phone, password);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.ink }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.seal}>
          <Image source={require("../../assets/adaptive-icon.png")} style={styles.sealImage} resizeMode="contain" />
        </View>
        <Text style={styles.title}>AIFI</Text>
        <Text style={styles.subtitle}>Ton cercle d'entraide</Text>

        <View style={styles.card}>
          {!!error && <Text style={styles.error}>{error}</Text>}

          <Text style={styles.label}>Téléphone</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoCapitalize="none"
            placeholder="ex : 077000000"
            placeholderTextColor={colors.inkSoft}
          />

          <Text style={styles.label}>Mot de passe</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={styles.passwordInput}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.inkSoft}
            />
            <Pressable onPress={() => setShowPassword((v) => !v)} style={styles.eyeButton} hitSlop={10}>
              <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.inkSoft} />
            </Pressable>
          </View>

          <PrimaryButton title="Se connecter" onPress={handleLogin} loading={loading} style={{ marginTop: 8 }} />

          <PrimaryButton
            title="Créer un compte"
            onPress={() => navigation.navigate("Register")}
            variant="outline"
            style={{ marginTop: 10 }}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  seal: {
    width: 84, height: 84, borderRadius: 42, borderWidth: 2, borderColor: colors.gold,
    alignItems: "center", justifyContent: "center", marginBottom: 14, backgroundColor: "#fff", overflow: "hidden",
  },
  sealImage: { width: 60, height: 60 },
  title: { fontFamily: fonts.display, fontSize: 30, fontWeight: "700", color: "#fff" },
  subtitle: { color: "#8895ac", fontSize: 13.5, marginTop: 4, marginBottom: 26 },
  card: { backgroundColor: colors.paper, borderRadius: 16, padding: 22, width: "100%" },
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
  error: { color: colors.danger, backgroundColor: colors.dangerSoft, padding: 10, borderRadius: 8, marginBottom: 4, fontSize: 13 },
});

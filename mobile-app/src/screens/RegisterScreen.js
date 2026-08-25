import React, { useRef, useState } from "react";
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Pressable, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { PrimaryButton } from "../components/ui";
import { colors, fonts } from "../theme";
import { apiErrorMessage } from "../api/client";

function Field({ label, children }) {
  return (
    <View style={{ marginTop: 16 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.fieldBox}>{children}</View>
    </View>
  );
}

function PasswordRule({ met, text }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
      <Ionicons
        name={met ? "checkmark-circle" : "ellipse-outline"}
        size={16}
        color={met ? colors.success : colors.inkSoft}
        style={{ marginRight: 8 }}
      />
      <Text style={{ fontSize: 12.5, color: met ? colors.success : colors.inkSoft }}>{text}</Text>
    </View>
  );
}

export default function RegisterScreen({ navigation, route }) {
  const { register, login } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [referralCode, setReferralCode] = useState(route?.params?.referralCode || "");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const fade = useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 380, useNativeDriver: true }).start();
  }, []);

  const hasMinLength = password.length >= 6;
  const hasLetterAndNumber = /[a-zA-Z]/.test(password) && /[0-9]/.test(password);

  async function handleRegister() {
    setError("");
    if (!firstName.trim() || !lastName.trim() || !phone.trim()) {
      return setError("Le prénom, le nom et le numéro sont obligatoires.");
    }
    if (!hasMinLength) {
      return setError("Le mot de passe doit contenir au moins 6 caractères.");
    }
    if (!acceptTerms) {
      return setError("Tu dois accepter les Conditions générales pour continuer.");
    }
    setLoading(true);
    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`;
      await register(fullName, phone.trim(), password, referralCode);
      // Connexion automatique juste après l'inscription : le client arrive
      // directement sur son tableau de bord (en mode restreint tant que son
      // compte n'est pas validé par un administrateur), plutôt que d'être
      // renvoyé sur l'écran de connexion.
      await login(phone.trim(), password);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.paper }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Animated.View style={{ opacity: fade, width: "100%", alignItems: "center" }}>
          <Text style={styles.wordmark}>AIFI</Text>

          <View style={styles.card}>
            <Text style={styles.title}>Créons ton compte</Text>
            <Text style={styles.subtitle}>
              Parle-nous un peu de toi <Text style={styles.subtitleItalic}>(les infos de ta pièce d'identité)</Text>.
            </Text>

            {!!error && <Text style={styles.error}>{error}</Text>}

            <Field label="Prénom">
              <TextInput
                style={styles.input}
                value={firstName}
                onChangeText={setFirstName}
                placeholder="ex : Nze"
                placeholderTextColor="#A3AEC2"
              />
            </Field>

            <Field label="Nom">
              <TextInput
                style={styles.input}
                value={lastName}
                onChangeText={setLastName}
                placeholder="ex : Nso"
                placeholderTextColor="#A3AEC2"
              />
            </Field>

            <Field label="Numéro de téléphone">
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder="ex : 077000000"
                placeholderTextColor="#A3AEC2"
              />
            </Field>

            <Field label="Mot de passe">
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                placeholder="••••••••"
                placeholderTextColor="#A3AEC2"
              />
              <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={10} style={{ paddingHorizontal: 4 }}>
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.inkSoft} />
              </Pressable>
            </Field>
            <View style={{ marginTop: 6 }}>
              <PasswordRule met={hasMinLength} text="Au moins 6 caractères" />
              <PasswordRule met={hasLetterAndNumber} text="Un mélange de lettres et de chiffres (recommandé)" />
            </View>

            <Field label="Code de parrainage (facultatif)">
              <TextInput
                style={styles.input}
                value={referralCode}
                onChangeText={setReferralCode}
                autoCapitalize="characters"
                placeholder="ex : A1B2C3D4"
                placeholderTextColor="#A3AEC2"
              />
            </Field>

            <Pressable style={styles.termsRow} onPress={() => setAcceptTerms((v) => !v)} hitSlop={6}>
              <View style={[styles.checkbox, acceptTerms && styles.checkboxChecked]}>
                {acceptTerms && <Ionicons name="checkmark" size={14} color="#fff" />}
              </View>
              <Text style={styles.termsText}>
                J'accepte les <Text style={styles.termsLink}>Conditions générales</Text>
              </Text>
            </Pressable>

            <PrimaryButton title="Continuer" onPress={handleRegister} loading={loading} style={{ marginTop: 22 }} />
          </View>

          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Tu as déjà un compte ? </Text>
            <Pressable onPress={() => navigation.navigate("Login")}>
              <Text style={styles.footerLink}>Me connecter</Text>
            </Pressable>
          </View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, alignItems: "center", padding: 22, paddingTop: 64, paddingBottom: 40 },
  wordmark: { fontFamily: fonts.display, fontSize: 18, fontWeight: "800", color: colors.ink, letterSpacing: 5, marginBottom: 22 },
  card: {
    width: "100%", backgroundColor: colors.card, borderRadius: 26, padding: 24,
    shadowColor: colors.ink, shadowOpacity: 0.08, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 3,
  },
  title: { fontFamily: fonts.display, fontSize: 22, fontWeight: "800", color: colors.ink },
  subtitle: { color: colors.inkSoft, fontSize: 13.5, marginTop: 6, lineHeight: 18 },
  subtitleItalic: { fontStyle: "italic" },
  label: { fontSize: 11.5, fontWeight: "700", color: colors.inkSoft, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 },
  fieldBox: {
    flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: colors.line, borderRadius: 14,
    backgroundColor: colors.paper, paddingHorizontal: 14,
  },
  input: { flex: 1, paddingVertical: 13, fontSize: 15, color: colors.ink },
  termsRow: { flexDirection: "row", alignItems: "center", marginTop: 18 },
  checkbox: {
    width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: colors.line,
    alignItems: "center", justifyContent: "center", marginRight: 10,
  },
  checkboxChecked: { backgroundColor: colors.gold, borderColor: colors.gold },
  termsText: { fontSize: 13, color: colors.inkSoft, flex: 1 },
  termsLink: { color: colors.gold, fontWeight: "700" },
  footerRow: { flexDirection: "row", justifyContent: "center", marginTop: 22 },
  footerText: { color: colors.inkSoft, fontSize: 14 },
  footerLink: { color: colors.gold, fontSize: 14, fontWeight: "700" },
  error: { color: colors.danger, backgroundColor: colors.dangerSoft, padding: 10, borderRadius: 10, marginTop: 14, fontSize: 13 },
});

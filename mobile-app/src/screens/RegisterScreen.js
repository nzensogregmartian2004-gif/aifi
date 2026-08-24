import React, { useRef, useState } from "react";
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Pressable, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { PrimaryButton } from "../components/ui";
import { colors, fonts } from "../theme";
import { apiErrorMessage } from "../api/client";

function AnimatedField({ label, children, focused }) {
  const anim = useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.timing(anim, { toValue: focused ? 1 : 0, duration: 180, useNativeDriver: false }).start();
  }, [focused]);
  const borderColor = anim.interpolate({ inputRange: [0, 1], outputRange: [colors.line, colors.gold] });
  return (
    <View style={{ marginTop: 18 }}>
      <Text style={styles.label}>{label}</Text>
      <Animated.View style={[styles.fieldBox, { borderColor }]}>{children}</Animated.View>
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

const STEPS = ["Tes informations", "Ton mot de passe"];

export default function RegisterScreen({ navigation, route }) {
  const { register, login } = useAuth();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [referralCode, setReferralCode] = useState(route?.params?.referralCode || "");
  const [focusedField, setFocusedField] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const slide = useRef(new Animated.Value(0)).current;

  function animateTo(nextStep) {
    Animated.timing(slide, { toValue: 1, duration: 140, useNativeDriver: true }).start(() => {
      setStep(nextStep);
      slide.setValue(0);
      Animated.timing(slide, { toValue: 0, duration: 220, useNativeDriver: true }).start();
    });
  }

  function goNext() {
    setError("");
    if (!name.trim() || !phone.trim()) {
      return setError("Le nom et le numéro sont obligatoires.");
    }
    animateTo(1);
  }

  const hasMinLength = password.length >= 6;
  const hasLetterAndNumber = /[a-zA-Z]/.test(password) && /[0-9]/.test(password);

  async function handleRegister() {
    setError("");
    if (!hasMinLength) {
      return setError("Le mot de passe doit contenir au moins 6 caractères.");
    }
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

  const translateX = slide.interpolate({ inputRange: [0, 1], outputRange: [0, 16] });
  const opacity = slide.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.paper }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.header}>
        {step === 1 ? (
          <Pressable onPress={() => animateTo(0)} hitSlop={10}>
            <Ionicons name="arrow-back" size={22} color={colors.ink} />
          </Pressable>
        ) : (
          <View style={{ width: 22 }} />
        )}
        <Text style={styles.wordmark}>AIFI</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: step === 0 ? "50%" : "100%" }]} />
      </View>

      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Animated.View style={{ opacity, transform: [{ translateX }] }}>
          {step === 0 ? (
            <>
              <Text style={styles.title}>Créons ton compte</Text>
              <Text style={styles.subtitle}>Quelques informations pour commencer.</Text>

              {!!error && <Text style={styles.error}>{error}</Text>}

              <AnimatedField label="Nom complet" focused={focusedField === "name"}>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Nom et prénom"
                  placeholderTextColor="#A3AEC2"
                  onFocus={() => setFocusedField("name")}
                  onBlur={() => setFocusedField(null)}
                />
              </AnimatedField>

              <AnimatedField label="Téléphone" focused={focusedField === "phone"}>
                <TextInput
                  style={styles.input}
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  placeholder="ex : 077000000"
                  placeholderTextColor="#A3AEC2"
                  onFocus={() => setFocusedField("phone")}
                  onBlur={() => setFocusedField(null)}
                />
              </AnimatedField>

              <PrimaryButton title="Continuer" onPress={goNext} style={{ marginTop: 28 }} />
            </>
          ) : (
            <>
              <Text style={styles.title}>Merci {name.split(" ")[0] || ""},</Text>
              <Text style={styles.subtitle}>Choisis un mot de passe pour ton compte.</Text>

              {!!error && <Text style={styles.error}>{error}</Text>}

              <AnimatedField label="Mot de passe" focused={focusedField === "password"}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  placeholder="••••••••"
                  placeholderTextColor="#A3AEC2"
                  onFocus={() => setFocusedField("password")}
                  onBlur={() => setFocusedField(null)}
                />
                <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={10} style={{ paddingHorizontal: 4 }}>
                  <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.inkSoft} />
                </Pressable>
              </AnimatedField>

              <View style={{ marginTop: 4 }}>
                <PasswordRule met={hasMinLength} text="Au moins 6 caractères" />
                <PasswordRule met={hasLetterAndNumber} text="Un mélange de lettres et de chiffres (recommandé)" />
              </View>

              <AnimatedField label="Code de parrainage (facultatif)" focused={focusedField === "referral"}>
                <TextInput
                  style={styles.input}
                  value={referralCode}
                  onChangeText={setReferralCode}
                  autoCapitalize="characters"
                  placeholder="ex : A1B2C3D4"
                  placeholderTextColor="#A3AEC2"
                  onFocus={() => setFocusedField("referral")}
                  onBlur={() => setFocusedField(null)}
                />
              </AnimatedField>

              <PrimaryButton title="Créer mon compte" onPress={handleRegister} loading={loading} style={{ marginTop: 28 }} />
            </>
          )}

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
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 14,
  },
  wordmark: { fontFamily: fonts.display, fontSize: 16, fontWeight: "800", color: colors.ink, letterSpacing: 3 },
  progressTrack: { height: 3, backgroundColor: colors.line, marginHorizontal: 20, borderRadius: 2, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.gold, borderRadius: 2 },
  container: { flexGrow: 1, padding: 24, paddingTop: 20 },
  title: { fontFamily: fonts.display, fontSize: 23, fontWeight: "800", color: colors.ink },
  subtitle: { color: colors.inkSoft, fontSize: 14, marginTop: 4 },
  label: { fontSize: 11.5, fontWeight: "700", color: colors.inkSoft, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 },
  fieldBox: {
    flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: 14,
    backgroundColor: "#fff", paddingHorizontal: 14,
  },
  input: { flex: 1, paddingVertical: 14, fontSize: 15.5, color: colors.ink },
  footerRow: { flexDirection: "row", justifyContent: "center", marginTop: 26 },
  footerText: { color: colors.inkSoft, fontSize: 14 },
  footerLink: { color: colors.gold, fontSize: 14, fontWeight: "700" },
  error: { color: colors.danger, backgroundColor: colors.dangerSoft, padding: 10, borderRadius: 10, marginTop: 16, fontSize: 13 },
});

import React, { useRef, useState } from "react";
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Pressable, Image, Animated } from "react-native";
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

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const fade = useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

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
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.paper }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Animated.View style={{ opacity: fade, width: "100%", alignItems: "center" }}>
          <Image source={require("../../assets/adaptive-icon.png")} style={styles.logo} resizeMode="contain" />
          <Text style={styles.wordmark}>AIFI</Text>

          <View style={{ width: "100%", marginTop: 30 }}>
            <Text style={styles.title}>Bonjour, content de te revoir</Text>
            <Text style={styles.subtitle}>Connecte-toi pour continuer</Text>

            {!!error && <Text style={styles.error}>{error}</Text>}

            <AnimatedField label="Téléphone" focused={focusedField === "phone"}>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                autoCapitalize="none"
                placeholder="ex : 077000000"
                placeholderTextColor="#A3AEC2"
                onFocus={() => setFocusedField("phone")}
                onBlur={() => setFocusedField(null)}
              />
            </AnimatedField>

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

            <PrimaryButton title="Se connecter" onPress={handleLogin} loading={loading} style={{ marginTop: 28 }} />

            <View style={styles.footerRow}>
              <Text style={styles.footerText}>Tu n'as pas de compte ? </Text>
              <Pressable onPress={() => navigation.navigate("Register")}>
                <Text style={styles.footerLink}>M'inscrire</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, alignItems: "center", padding: 28, paddingTop: 70 },
  logo: { width: 56, height: 56 },
  wordmark: { fontFamily: fonts.display, fontSize: 18, fontWeight: "800", color: colors.ink, letterSpacing: 3, marginTop: 10 },
  title: { fontFamily: fonts.display, fontSize: 23, fontWeight: "800", color: colors.ink },
  subtitle: { color: colors.inkSoft, fontSize: 14, marginTop: 4 },
  label: { fontSize: 11.5, fontWeight: "700", color: colors.inkSoft, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 },
  fieldBox: {
    flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: 14,
    backgroundColor: "#fff", paddingHorizontal: 14,
  },
  input: { flex: 1, paddingVertical: 14, fontSize: 15.5, color: colors.ink },
  footerRow: { flexDirection: "row", justifyContent: "center", marginTop: 22 },
  footerText: { color: colors.inkSoft, fontSize: 14 },
  footerLink: { color: colors.gold, fontSize: 14, fontWeight: "700" },
  error: { color: colors.danger, backgroundColor: colors.dangerSoft, padding: 10, borderRadius: 10, marginTop: 16, fontSize: 13 },
});

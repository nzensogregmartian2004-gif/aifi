import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api, apiErrorMessage } from "../api/client";
import { PrimaryButton } from "../components/ui";
import PremiumBenefitsList from "../components/PremiumBenefitsList";
import MobileMoneyPayModal from "../components/MobileMoneyPayModal";
import { colors, money, fonts } from "../theme";

export default function PremiumScreen({ navigation }) {
  const [settings, setSettings] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState("");
  const [payVisible, setPayVisible] = useState(false);

  const load = useCallback(async () => {
    try {
      const [{ data: s }, { data: d }] = await Promise.all([
        api.get("/client/settings"),
        api.get("/client/dashboard"),
      ]);
      setSettings(s);
      setDashboard(d);
      setError("");
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const isPremium = !!dashboard?.isPremium;
  const isLifetime = isPremium && !dashboard?.premiumExpiresAt;

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.hero}>
          <View style={styles.heroDecor1} />
          <View style={styles.heroDecor2} />
          <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={8}>
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </Pressable>
          <View style={styles.crownWrap}>
            <Ionicons name="sparkles" size={30} color="#fff" />
          </View>
          <Text style={styles.heroTitle}>AIFI+</Text>
          <Text style={styles.heroSubtitle}>L'abonnement qui te donne le meilleur d'AIFI.</Text>
        </View>

        <View style={{ paddingHorizontal: 20, paddingTop: 22 }}>
          {!!error && <Text style={{ color: colors.danger, marginBottom: 14 }}>{error}</Text>}

          {isPremium ? (
            <View style={styles.statusCard}>
              <Ionicons name="checkmark-circle" size={22} color={colors.premium} />
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={styles.statusTitle}>AIFI+ actif</Text>
                <Text style={styles.statusText}>
                  {isLifetime
                    ? "Accès à vie, offert par l'équipe AIFI."
                    : `Valable jusqu'au ${new Date(dashboard.premiumExpiresAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}.`}
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.priceCard}>
              <Text style={styles.priceLabel}>Abonnement mensuel</Text>
              <Text style={styles.priceValue}>{settings ? `${money(settings.premiumMonthlyPrice)} FCFA` : "…"}</Text>
              <Text style={styles.priceHint}>Sans engagement, résiliable à tout moment.</Text>
            </View>
          )}

          <Text style={styles.sectionLabel}>Tes avantages</Text>
          <View style={styles.benefitsCard}>
            <PremiumBenefitsList settings={settings} />
          </View>

          {!isPremium && (
            <PrimaryButton
              title={settings ? `S'abonner — ${money(settings.premiumMonthlyPrice)} FCFA/mois` : "S'abonner"}
              onPress={() => setPayVisible(true)}
              disabled={!settings}
              style={{ backgroundColor: colors.premium, marginTop: 6 }}
            />
          )}

          {isPremium && !isLifetime && (
            <>
              <PrimaryButton
                title="Renouveler maintenant"
                variant="outline"
                onPress={() => setPayVisible(true)}
                style={{ borderColor: colors.premium, marginTop: 6 }}
              />
              <Text style={styles.renewHint}>
                Un renouvellement anticipé prolonge ton abonnement à partir de sa date d'expiration actuelle : tu ne
                perds aucun jour déjà payé.
              </Text>
            </>
          )}
        </View>
      </ScrollView>

      <MobileMoneyPayModal
        visible={payVisible}
        purpose="premium"
        fixedAmount={settings?.premiumMonthlyPrice}
        onClose={() => setPayVisible(false)}
        onDone={() => { setPayVisible(false); load(); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.premium, paddingTop: 58, paddingBottom: 34, paddingHorizontal: 24,
    alignItems: "center", overflow: "hidden",
  },
  heroDecor1: {
    position: "absolute", width: 180, height: 180, borderRadius: 90,
    backgroundColor: "rgba(255,255,255,0.08)", top: -60, right: -50,
  },
  heroDecor2: {
    position: "absolute", width: 120, height: 120, borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.08)", bottom: -40, left: -30,
  },
  backBtn: {
    position: "absolute", top: 54, left: 20, width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center",
  },
  crownWrap: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center", justifyContent: "center", marginBottom: 12,
  },
  heroTitle: { fontFamily: fonts.display, fontSize: 28, fontWeight: "800", color: "#fff", letterSpacing: 1 },
  heroSubtitle: { fontSize: 13.5, color: "rgba(255,255,255,0.9)", marginTop: 6, textAlign: "center" },
  statusCard: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.premiumSoft,
    borderRadius: 16, padding: 16, marginBottom: 8,
  },
  statusTitle: { fontSize: 15, fontWeight: "800", color: colors.premiumInk },
  statusText: { fontSize: 12.5, color: colors.premiumInk, marginTop: 2, lineHeight: 17 },
  priceCard: {
    alignItems: "center", backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.line,
    padding: 20, marginBottom: 8,
  },
  priceLabel: { fontSize: 12, fontWeight: "700", color: colors.inkSoft, textTransform: "uppercase", letterSpacing: 0.5 },
  priceValue: { fontSize: 30, fontWeight: "800", color: colors.premium, marginTop: 6 },
  priceHint: { fontSize: 12, color: colors.inkSoft, marginTop: 6 },
  sectionLabel: {
    fontSize: 12, fontWeight: "700", color: colors.inkSoft, textTransform: "uppercase",
    letterSpacing: 0.5, marginTop: 18, marginBottom: 10,
  },
  benefitsCard: {
    backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.line,
    padding: 18, paddingBottom: 4, marginBottom: 18,
  },
  renewHint: { fontSize: 12, color: colors.inkSoft, marginTop: 10, lineHeight: 17, textAlign: "center" },
});

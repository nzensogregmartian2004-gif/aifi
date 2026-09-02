import React from "react";
import { View, Text, Modal, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, money, fonts } from "../theme";

const HIGHLIGHTS = [
  { icon: "pricetag", text: "Frais réduits sur chaque aide" },
  { icon: "trending-up", text: "Plafond d'aide majoré" },
  { icon: "flash", text: "Priorité VIP sur tes demandes" },
];

/**
 * `settings` : réponse de GET /client/settings (pour afficher le prix), peut
 * être null pendant le chargement — le prix est alors simplement masqué.
 */
export default function PremiumAdModal({ visible, settings, onClose, onDiscover }) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={12}>
          <Ionicons name="close" size={22} color="#fff" />
        </Pressable>

        <Pressable style={styles.card} onPress={onDiscover}>
          <View style={styles.decor1} />
          <View style={styles.decor2} />

          <View style={styles.crownWrap}>
            <Ionicons name="sparkles" size={34} color="#fff" />
          </View>

          <Text style={styles.eyebrow}>NOUVEAU</Text>
          <Text style={styles.title}>Passe AIFI+</Text>
          <Text style={styles.subtitle}>
            Débloque des frais réduits, un plafond majoré et un traitement VIP de tes demandes.
          </Text>

          <View style={styles.highlights}>
            {HIGHLIGHTS.map((h) => (
              <View key={h.text} style={styles.highlightRow}>
                <Ionicons name={h.icon} size={16} color="#fff" style={{ marginRight: 10 }} />
                <Text style={styles.highlightText}>{h.text}</Text>
              </View>
            ))}
          </View>

          {settings?.premiumMonthlyPrice != null && (
            <Text style={styles.price}>À partir de {money(settings.premiumMonthlyPrice)} FCFA/mois</Text>
          )}

          <View style={styles.ctaBtn}>
            <Text style={styles.ctaText}>Découvrir AIFI+</Text>
          </View>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(15,27,51,0.7)", alignItems: "center", justifyContent: "center", padding: 24 },
  closeBtn: {
    position: "absolute", top: 56, right: 20, width: 38, height: 38, borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center", zIndex: 2,
  },
  card: {
    width: "100%", borderRadius: 26, backgroundColor: colors.premium, padding: 28,
    alignItems: "center", overflow: "hidden",
  },
  decor1: {
    position: "absolute", width: 200, height: 200, borderRadius: 100,
    backgroundColor: "rgba(255,255,255,0.08)", top: -70, right: -60,
  },
  decor2: {
    position: "absolute", width: 140, height: 140, borderRadius: 70,
    backgroundColor: "rgba(255,255,255,0.08)", bottom: -50, left: -40,
  },
  crownWrap: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center", justifyContent: "center", marginBottom: 14,
  },
  eyebrow: { color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  title: { fontFamily: fonts.display, fontSize: 30, fontWeight: "800", color: "#fff", marginTop: 4 },
  subtitle: { color: "rgba(255,255,255,0.92)", fontSize: 13.5, textAlign: "center", marginTop: 10, lineHeight: 19 },
  highlights: { alignSelf: "stretch", marginTop: 20, marginBottom: 6 },
  highlightRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  highlightText: { color: "#fff", fontSize: 13.5, fontWeight: "600" },
  price: { color: "#fff", fontSize: 13, fontWeight: "700", marginTop: 8, marginBottom: 18 },
  ctaBtn: { backgroundColor: "#fff", borderRadius: 100, paddingVertical: 14, paddingHorizontal: 28, marginTop: 4 },
  ctaText: { color: colors.premium, fontWeight: "800", fontSize: 15 },
});

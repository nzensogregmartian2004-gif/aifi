import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../theme";
import { ONBOARDING_SEEN_KEY } from "./OnboardingScreen";

const FAQ = [
  {
    q: "Comment fonctionne AIFI ?",
    a: "AIFI est ton cercle d'entraide. Chaque bon comportement te rapporte des points, qui font grandir ton plafond d'aide. Tu peux demander une aide, la rembourser directement par Mobile Money ou carte, et parrainer d'autres personnes pour gagner des bonus.",
  },
  {
    q: "Combien de temps ai-je pour rembourser ?",
    a: "Le délai dépend du montant demandé — il est indiqué clairement avant que tu ne confirmes ta demande, avec la date limite exacte.",
  },
  {
    q: "Que se passe-t-il si je suis en retard ?",
    a: "Un rappel est envoyé avant l'échéance. En cas de retard, une pénalité de points peut être appliquée à ton compte.",
  },
  {
    q: "Comment mon compte est-il validé ?",
    a: "Un administrateur vérifie ta pièce d'identité et ton selfie envoyés dans la messagerie juste après ton inscription. Tu reçois une notification une fois validé.",
  },
];

function FaqItem({ item }) {
  const [open, setOpen] = useState(false);
  return (
    <Pressable style={styles.faqItem} onPress={() => setOpen((v) => !v)}>
      <View style={styles.faqHeader}>
        <Text style={styles.faqQuestion}>{item.q}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.inkSoft} />
      </View>
      {open && <Text style={styles.faqAnswer}>{item.a}</Text>}
    </Pressable>
  );
}

export default function AideScreen({ navigation }) {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.paper }} contentContainerStyle={{ padding: 20, paddingTop: 60, paddingBottom: 40 }}>
      <Text style={styles.title}>Aide</Text>
      <Text style={styles.subtitle}>Questions, justificatifs, une question à poser ? Tout est ici.</Text>

      <Pressable style={styles.mainCard} onPress={() => navigation.navigate("AideMessages")}>
        <View style={styles.mainCardIcon}>
          <Ionicons name="chatbubbles" size={22} color={colors.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.mainCardTitle}>Discuter avec l'administrateur</Text>
          <Text style={styles.mainCardText}>Justificatifs, questions, suivi de ton dossier</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.inkSoft} />
      </Pressable>

      <Text style={styles.sectionLabel}>Questions fréquentes</Text>
      <View style={styles.faqCard}>
        {FAQ.map((item, i) => (
          <View key={item.q}>
            <FaqItem item={item} />
            {i < FAQ.length - 1 && <View style={styles.faqDivider} />}
          </View>
        ))}
      </View>

      <Pressable
        style={styles.linkRow}
        onPress={() => navigation.navigate("Onboarding")}
      >
        <Ionicons name="play-circle-outline" size={20} color={colors.gold} />
        <Text style={styles.linkText}>Revoir la présentation de l'application</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.display, fontSize: 26, fontWeight: "800", color: colors.ink },
  subtitle: { color: colors.inkSoft, fontSize: 14, marginTop: 4, marginBottom: 22 },
  mainCard: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.ink,
    borderRadius: 18, padding: 16, gap: 14,
  },
  mainCardIcon: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.gold,
    alignItems: "center", justifyContent: "center",
  },
  mainCardTitle: { color: "#fff", fontSize: 15, fontWeight: "700" },
  mainCardText: { color: "#8895ac", fontSize: 12.5, marginTop: 2 },
  sectionLabel: { fontSize: 13, fontWeight: "700", color: colors.inkSoft, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 26, marginBottom: 10 },
  faqCard: { backgroundColor: "#fff", borderRadius: 18, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
  faqItem: { padding: 16 },
  faqHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  faqQuestion: { fontSize: 14.5, fontWeight: "600", color: colors.ink, flex: 1, marginRight: 10 },
  faqAnswer: { fontSize: 13.5, color: colors.inkSoft, marginTop: 10, lineHeight: 19 },
  faqDivider: { height: 1, backgroundColor: colors.line, marginHorizontal: 16 },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 24, justifyContent: "center" },
  linkText: { color: colors.gold, fontSize: 14, fontWeight: "700" },
});

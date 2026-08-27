import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Modal, ScrollView, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api/client";
import { colors, fonts, money } from "../theme";

const FAQ = [
  {
    q: "Comment fonctionne AIFI ?",
    a: "AIFI est ton cercle d'entraide. Chaque bon comportement te rapporte des points, qui font grandir ton plafond d'aide. Tu peux demander une aide, la rembourser directement par Mobile Money ou carte, et parrainer d'autres personnes pour gagner des bonus.",
  },
  {
    q: "Combien de temps ai-je pour rembourser ?",
    a: "Le délai dépend du montant demandé — retrouve-le dans le tableau ci-dessus, ou dans le détail affiché avant que tu ne confirmes ta demande.",
  },
  {
    q: "Que se passe-t-il si je suis en retard ?",
    a: "Un rappel est envoyé avant l'échéance, puis un autre le jour même. En cas de retard, une pénalité de points est ensuite appliquée à ton compte.",
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

/**
 * `navigation` est optionnel : si fourni, un lien permet de revoir la
 * présentation initiale de l'application (écran Onboarding).
 */
export default function HelpDocModal({ visible, onClose, navigation }) {
  const [tiers, setTiers] = useState([]);

  useEffect(() => {
    if (!visible) return;
    api.get("/client/duration-tiers").then(({ data }) => setTiers(data)).catch(() => {});
  }, [visible]);

  const sortedTiers = [...tiers].sort((a, b) => a.minAmount - b.minAmount);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Comment ça marche</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.inkSoft} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 10 }}>
            <Text style={styles.sectionLabel}>Délai de remboursement par montant</Text>
            {sortedTiers.length > 0 ? (
              <View style={styles.table}>
                <View style={[styles.tableRow, styles.tableHeaderRow]}>
                  <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 1.3 }]}>À partir de</Text>
                  <Text style={[styles.tableCell, styles.tableHeaderText]}>Délai</Text>
                </View>
                {sortedTiers.map((t, i) => (
                  <View key={t.id || i} style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}>
                    <Text style={[styles.tableCell, { flex: 1.3, fontWeight: "700" }]}>{money(t.minAmount)} FCFA</Text>
                    <Text style={styles.tableCell}>{t.durationDays} jours</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.faqAnswer}>Le tableau des délais n'est pas disponible pour le moment.</Text>
            )}

            <Text style={[styles.sectionLabel, { marginTop: 22 }]}>Questions fréquentes</Text>
            <View style={styles.faqCard}>
              {FAQ.map((item, i) => (
                <View key={item.q}>
                  <FaqItem item={item} />
                  {i < FAQ.length - 1 && <View style={styles.faqDivider} />}
                </View>
              ))}
            </View>

            {!!navigation && (
              <Pressable
                style={styles.linkRow}
                onPress={() => {
                  onClose?.();
                  navigation.navigate("Onboarding");
                }}
              >
                <Ionicons name="play-circle-outline" size={20} color={colors.gold} />
                <Text style={styles.linkText}>Revoir la présentation de l'application</Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(15,27,51,0.5)", justifyContent: "flex-end" },
  card: {
    backgroundColor: colors.paper, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    padding: 22, paddingTop: 18, maxHeight: "82%",
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  title: { fontFamily: fonts.display, fontSize: 19, fontWeight: "800", color: colors.ink },
  sectionLabel: { fontSize: 12, fontWeight: "700", color: colors.inkSoft, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 10 },
  table: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
  tableRow: { flexDirection: "row", paddingVertical: 10, paddingHorizontal: 14 },
  tableHeaderRow: { backgroundColor: colors.ink },
  tableRowAlt: { backgroundColor: colors.paper },
  tableCell: { flex: 1, fontSize: 13.5, color: colors.ink },
  tableHeaderText: { color: "#fff", fontWeight: "700", fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.3 },
  faqCard: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
  faqItem: { padding: 14 },
  faqHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  faqQuestion: { fontSize: 14, fontWeight: "600", color: colors.ink, flex: 1, marginRight: 10 },
  faqAnswer: { fontSize: 13, color: colors.inkSoft, marginTop: 10, lineHeight: 19 },
  faqDivider: { height: 1, backgroundColor: colors.line, marginHorizontal: 14 },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 22, marginBottom: 8, justifyContent: "center" },
  linkText: { color: colors.gold, fontSize: 14, fontWeight: "700" },
});

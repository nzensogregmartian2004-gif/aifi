import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Modal, ScrollView, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api/client";
import { colors, fonts, money } from "../theme";

const FAQ = [
  {
    q: "Comment est calculé mon délai de remboursement ?",
    a: "Le délai dépend du palier dans lequel se trouve le montant demandé (voir le tableau ci-dessus). Il t'est confirmé, avec la date limite exacte, avant que tu ne valides ta demande.",
  },
  {
    q: "Que se passe-t-il si je suis en retard ?",
    a: "Un rappel est envoyé avant l'échéance. En cas de retard, une pénalité peut être appliquée sur ton niveau de confiance, ce qui réduit ton plafond disponible pour les prochaines demandes.",
  },
  {
    q: "Puis-je rembourser en plusieurs fois ?",
    a: "Oui. Utilise \"Faire une avance\" pour verser une partie du montant dû, puis \"Rembourser\" quand tu es prêt à solder le reste.",
  },
  {
    q: "Comment mon compte est-il validé ?",
    a: "Un administrateur vérifie ton dossier après ton inscription. Tu peux le contacter directement depuis l'onglet Messages pour toute question ou tout justificatif à envoyer.",
  },
];

function FaqItem({ item }) {
  const [open, setOpen] = useState(false);
  return (
    <Pressable style={styles.faqItem} onPress={() => setOpen((v) => !v)}>
      <View style={styles.faqHeader}>
        <Text style={styles.faqQuestion}>{item.q}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={17} color={colors.inkSoft} />
      </View>
      {open && <Text style={styles.faqAnswer}>{item.a}</Text>}
    </Pressable>
  );
}

export default function AidDocumentationModal({ visible, onClose }) {
  const [tiers, setTiers] = useState([]);
  const [feePercent, setFeePercent] = useState(null);

  useEffect(() => {
    if (!visible) return;
    api.get("/client/duration-tiers").then(({ data }) => setTiers(data)).catch(() => {});
    api.get("/client/settings").then(({ data }) => setFeePercent(data.serviceFeePercent)).catch(() => {});
  }, [visible]);

  const sortedTiers = [...tiers].sort((a, b) => a.minAmount - b.minAmount);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>Comment ça marche</Text>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={colors.ink} />
            </Pressable>
          </View>
          <Text style={styles.subtitle}>
            Tout ce qu'il faut savoir sur tes demandes d'aide et tes remboursements.
          </Text>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
            <View style={styles.introCard}>
              <Ionicons name="bulb-outline" size={20} color={colors.gold} style={{ marginBottom: 8 }} />
              <Text style={styles.introText}>
                Chaque demande d'aide est rattachée à un palier selon son montant. Ce palier fixe le délai dont tu
                disposes pour rembourser, avant l'échéance affichée sur ta demande.
                {feePercent != null ? ` Des frais de service de ${feePercent}% sont inclus dans le total à rembourser.` : ""}
              </Text>
            </View>

            {sortedTiers.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Tableau des délais</Text>
                <View style={styles.table}>
                  <View style={[styles.tableRow, styles.tableRowHead]}>
                    <Text style={[styles.th, { flex: 1 }]}>À partir de</Text>
                    <Text style={[styles.th, { flex: 1, textAlign: "right" }]}>Délai</Text>
                  </View>
                  {sortedTiers.map((t, i) => (
                    <View
                      key={t.id || i}
                      style={[styles.tableRow, i === sortedTiers.length - 1 && { borderBottomWidth: 0 }]}
                    >
                      <Text style={[styles.td, { flex: 1 }]}>{money(t.minAmount)} FCFA</Text>
                      <Text style={[styles.td, { flex: 1, textAlign: "right", fontWeight: "700", color: colors.ink }]}>
                        {t.durationDays} jours
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            <Text style={styles.sectionLabel}>Questions fréquentes</Text>
            <View style={styles.faqCard}>
              {FAQ.map((item, i) => (
                <View key={item.q}>
                  <FaqItem item={item} />
                  {i < FAQ.length - 1 && <View style={styles.faqDivider} />}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(15,27,51,0.55)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.paper, borderTopLeftRadius: 26, borderTopRightRadius: 26,
    paddingHorizontal: 20, paddingTop: 10, maxHeight: "86%",
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, alignSelf: "center", marginBottom: 14 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  title: { fontFamily: fonts.display, fontSize: 21, fontWeight: "800", color: colors.ink },
  subtitle: { fontSize: 13, color: colors.inkSoft, marginTop: 4, marginBottom: 18, lineHeight: 18 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.card,
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.line,
  },
  introCard: { backgroundColor: colors.goldSoft, borderRadius: 16, padding: 16, marginBottom: 22 },
  introText: { fontSize: 13.5, color: colors.ink, lineHeight: 19 },
  sectionLabel: {
    fontSize: 12, fontWeight: "700", color: colors.inkSoft, textTransform: "uppercase",
    letterSpacing: 0.5, marginBottom: 10,
  },
  table: {
    backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.line,
    overflow: "hidden", marginBottom: 22,
  },
  tableRow: {
    flexDirection: "row", paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  tableRowHead: { backgroundColor: colors.paper2 },
  th: { fontSize: 11, fontWeight: "700", color: colors.inkSoft, textTransform: "uppercase", letterSpacing: 0.3 },
  td: { fontSize: 14, color: colors.inkSoft },
  faqCard: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
  faqItem: { padding: 16 },
  faqHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  faqQuestion: { fontSize: 13.5, fontWeight: "600", color: colors.ink, flex: 1, marginRight: 10 },
  faqAnswer: { fontSize: 13, color: colors.inkSoft, marginTop: 10, lineHeight: 18 },
  faqDivider: { height: 1, backgroundColor: colors.line, marginHorizontal: 16 },
});

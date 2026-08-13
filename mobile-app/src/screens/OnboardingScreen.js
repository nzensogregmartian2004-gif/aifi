import React from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Card, PrimaryButton } from "../components/ui";
import { colors, fonts } from "../theme";
import { useAuth } from "../context/AuthContext";

export const ONBOARDING_SEEN_KEY = "aifi_onboarding_seen";

const SECTIONS = [
  {
    title: "Bienvenue sur AIFI",
    text: "AIFI est une application privée d'entraide financière entre personnes de confiance. Tout est validé manuellement par un administrateur — aucun paiement automatique.",
  },
  {
    title: "Points et niveau de confiance",
    text: "Chaque action positive (compte validé, remboursement à temps, parrainage validé) te fait gagner des points. Plus tu as de points, plus ton plafond d'aide disponible augmente.",
  },
  {
    title: "Demander une aide",
    text: "Tu peux demander n'importe quel montant tant qu'il ne dépasse pas ton plafond disponible. Un administrateur examine ensuite ta demande et l'accepte, la refuse ou l'envoie manuellement.",
  },
  {
    title: "Rembourser",
    text: "Le remboursement se fait hors application (Mobile Money, en main propre...). Tu déclares ensuite dans l'app le montant remboursé, et l'administrateur le confirme après vérification.",
  },
  {
    title: "Parrainage",
    text: "Partage ton code ou ton lien de parrainage. Quand la personne parrainée est validée, tu reçois un bonus dans ton portefeuille, plus une commission à chacun de ses remboursements.",
  },
];

export default function OnboardingScreen({ navigation }) {
  const { isAuthenticated } = useAuth();

  async function finish(destination) {
    await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, "1");
    navigation.replace(destination);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 60, paddingBottom: 20 }}>
        <Text style={styles.title}>Comment fonctionne AIFI</Text>
        <Text style={styles.subtitle}>Quelques minutes pour comprendre l'essentiel avant de commencer.</Text>

        {SECTIONS.map((s) => (
          <Card key={s.title}>
            <Text style={styles.sectionTitle}>{s.title}</Text>
            <Text style={styles.sectionText}>{s.text}</Text>
          </Card>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        {isAuthenticated ? (
          <PrimaryButton title="Retour" onPress={() => navigation.goBack()} />
        ) : (
          <>
            <PrimaryButton title="Créer un compte" onPress={() => finish("Register")} />
            <PrimaryButton title="J'ai déjà un compte" variant="outline" onPress={() => finish("Login")} style={{ marginTop: 10 }} />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.display, fontSize: 26, fontWeight: "700", color: colors.ink, marginBottom: 6 },
  subtitle: { fontSize: 13.5, color: colors.inkSoft, marginBottom: 18 },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: colors.gold, marginBottom: 6 },
  sectionText: { fontSize: 13.5, color: colors.ink, lineHeight: 19 },
  footer: { padding: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.paper },
});

import React, { useRef, useState } from "react";
import { View, Text, FlatList, StyleSheet, Dimensions, Pressable, Image } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PrimaryButton } from "../components/ui";
import { colors, fonts } from "../theme";
import { useAuth } from "../context/AuthContext";

export const ONBOARDING_SEEN_KEY = "aifi_onboarding_seen";

const { width } = Dimensions.get("window");

const SECTIONS = [
  {
    image: require("../../assets/onboarding/onb_1_bienvenue.png"),
    title: "Bienvenue sur AIFI",
    text: "Ton cercle d'entraide, entre personnes de confiance.",
  },
  {
    image: require("../../assets/onboarding/onb_2_confiance.png"),
    title: "Gagne en confiance",
    text: "Chaque bon comportement te rapporte des points et fait grandir ton plafond.",
  },
  {
    image: require("../../assets/onboarding/onb_3_avance.png"),
    title: "Demande en un instant",
    text: "Choisis un montant, ta demande part directement à l'administrateur.",
  },
  {
    image: require("../../assets/onboarding/onb_4_rembourser.png"),
    title: "Remboursement automatique",
    text: "Par Mobile Money ou carte, en un clic, directement depuis AIFI.",
  },
  {
    image: require("../../assets/onboarding/onb_5_parrainage.png"),
    title: "Parraine, gagne plus",
    text: "Partage ton code, touche un bonus et une commission sur ses remboursements.",
  },
];

function Slide({ item }) {
  return (
    <View style={styles.slide}>
      <Image source={item.image} style={styles.image} resizeMode="contain" />
      <Text style={styles.slideTitle}>{item.title}</Text>
      <Text style={styles.slideText}>{item.text}</Text>
    </View>
  );
}

export default function OnboardingScreen({ navigation }) {
  const { isAuthenticated } = useAuth();
  const [index, setIndex] = useState(0);
  const listRef = useRef(null);

  async function finish(destination) {
    await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, "1");
    navigation.replace(destination);
  }

  function onScrollEnd(e) {
    const newIndex = Math.round(e.nativeEvent.contentOffset.x / width);
    setIndex(newIndex);
  }

  function goTo(i) {
    listRef.current?.scrollToIndex({ index: i, animated: true });
    setIndex(i);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <View style={styles.header}>
        <Text style={styles.wordmark}>AIFI</Text>
      </View>

      <FlatList
        ref={listRef}
        data={SECTIONS}
        keyExtractor={(item) => item.title}
        renderItem={({ item }) => <Slide item={item} />}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        style={{ flexGrow: 0 }}
      />

      <View style={styles.dots}>
        {SECTIONS.map((_, i) => (
          <Pressable key={i} onPress={() => goTo(i)} hitSlop={8}>
            <View style={[styles.dot, i === index && styles.dotActive]} />
          </Pressable>
        ))}
      </View>

      {/* Boutons toujours visibles, quel que soit l'écran du carrousel — pas
          besoin d'attendre la dernière slide pour pouvoir agir. */}
      <View style={styles.footer}>
        {isAuthenticated ? (
          <PrimaryButton title="Retour" onPress={() => navigation.goBack()} />
        ) : (
          <>
            <PrimaryButton title="Ouvrir un compte" onPress={() => finish("Register")} />
            <PrimaryButton title="Me connecter" variant="outline" onPress={() => finish("Login")} style={{ marginTop: 10 }} />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: "center", paddingTop: 56, paddingBottom: 8 },
  wordmark: { fontFamily: fonts.display, fontSize: 20, fontWeight: "800", color: colors.ink, letterSpacing: 3 },
  slide: { width, alignItems: "center", paddingHorizontal: 28, paddingTop: 12 },
  image: { width: width - 56, height: (width - 56) * 0.72 },
  slideTitle: { fontFamily: fonts.display, fontSize: 22, fontWeight: "800", color: colors.ink, textAlign: "center", marginTop: 22, marginBottom: 8 },
  slideText: { fontSize: 14.5, color: colors.inkSoft, textAlign: "center", lineHeight: 21, maxWidth: 300 },
  dots: { flexDirection: "row", justifyContent: "center", alignItems: "center", marginTop: 10, marginBottom: 4 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.line, marginHorizontal: 4 },
  dotActive: { backgroundColor: colors.gold, width: 22 },
  footer: { paddingHorizontal: 24, paddingBottom: 24, paddingTop: 8 },
});

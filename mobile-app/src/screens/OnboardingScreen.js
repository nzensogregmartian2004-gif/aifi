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
    text: "Ton cercle d'entraide, entre personnes de confiance. Simple, rapide, et automatisé de bout en bout.",
  },
  {
    image: require("../../assets/onboarding/onb_2_confiance.png"),
    title: "Gagne en confiance",
    text: "Chaque bon comportement te rapporte des points. Plus tu en as, plus ton plafond d'aide grandit.",
  },
  {
    image: require("../../assets/onboarding/onb_3_avance.png"),
    title: "Demande en un instant",
    text: "Choisis un montant sous ton plafond. Une fois ton compte validé, ta demande part directement à l'administrateur.",
  },
  {
    image: require("../../assets/onboarding/onb_4_rembourser.png"),
    title: "Remboursement 100% automatique",
    text: "Plus besoin de sortir de l'app : rembourse par Mobile Money ou carte, en un clic, directement depuis AIFI.",
  },
  {
    image: require("../../assets/onboarding/onb_5_parrainage.png"),
    title: "Parraine, gagne plus",
    text: "Partage ton code. Dès que ton filleul est validé, tu touches un bonus et une commission sur ses remboursements.",
  },
];

function Slide({ item }) {
  return (
    <View style={styles.slide}>
      <Image source={item.image} style={styles.image} resizeMode="cover" />
      <View style={styles.textBlock}>
        <Text style={styles.slideTitle}>{item.title}</Text>
        <Text style={styles.slideText}>{item.text}</Text>
      </View>
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

  const isLast = index === SECTIONS.length - 1;

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <FlatList
        ref={listRef}
        data={SECTIONS}
        keyExtractor={(item) => item.title}
        renderItem={({ item }) => <Slide item={item} />}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
      />

      <View style={styles.dots}>
        {SECTIONS.map((_, i) => (
          <Pressable key={i} onPress={() => goTo(i)} hitSlop={8}>
            <View style={[styles.dot, i === index && styles.dotActive]} />
          </Pressable>
        ))}
      </View>

      <View style={styles.footer}>
        {isAuthenticated ? (
          <PrimaryButton title="Retour" onPress={() => navigation.goBack()} />
        ) : isLast ? (
          <>
            <PrimaryButton title="Créer un compte" onPress={() => finish("Register")} />
            <PrimaryButton title="J'ai déjà un compte" variant="outline" onPress={() => finish("Login")} style={{ marginTop: 10 }} />
          </>
        ) : (
          <PrimaryButton title="Suivant" onPress={() => goTo(index + 1)} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slide: { width, flex: 1 },
  image: { width, height: "58%" },
  textBlock: { flex: 1, paddingHorizontal: 30, paddingTop: 26, alignItems: "center" },
  slideTitle: { fontFamily: fonts.display, fontSize: 22, fontWeight: "700", color: colors.ink, textAlign: "center", marginBottom: 10 },
  slideText: { fontSize: 14, color: colors.inkSoft, textAlign: "center", lineHeight: 20, maxWidth: 320 },
  dots: { flexDirection: "row", justifyContent: "center", alignItems: "center", marginBottom: 14 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.line, marginHorizontal: 4 },
  dotActive: { backgroundColor: colors.gold, width: 20 },
  footer: { paddingHorizontal: 20, paddingBottom: 20 },
});

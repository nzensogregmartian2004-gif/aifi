import React, { useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Dimensions,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PrimaryButton } from "../components/ui";
import { colors, fonts } from "../theme";
import { useAuth } from "../context/AuthContext";

export const ONBOARDING_SEEN_KEY = "aifi_onboarding_seen";

const { width } = Dimensions.get("window");

const SECTIONS = [
  {
    icon: "shield-checkmark-outline",
    title: "Bienvenue sur AIFI",
    text: "Un cercle d'entraide financière entre personnes de confiance. Tout est validé manuellement par un administrateur.",
  },
  {
    icon: "star-outline",
    title: "Points et confiance",
    text: "Chaque action positive fait gagner des points. Plus tu en as, plus ton plafond d'aide augmente.",
  },
  {
    icon: "cash-outline",
    title: "Demander une aide",
    text: "Demande n'importe quel montant sous ton plafond. Un administrateur examine ensuite ta demande.",
  },
  {
    icon: "repeat-outline",
    title: "Rembourser",
    text: "Rembourse hors application (Mobile Money, en main propre...), puis déclare le montant dans l'app.",
  },
  {
    icon: "people-outline",
    title: "Parrainage",
    text: "Partage ton code. Quand ton filleul est validé, tu reçois un bonus et une commission sur ses remboursements.",
  },
];

function Slide({ item }) {
  return (
    <View style={styles.slide}>
      <View style={styles.iconWrap}>
        <Ionicons name={item.icon} size={96} color={colors.gold} />
      </View>
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
        style={{ flexGrow: 0 }}
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
            <PrimaryButton
              title="Créer un compte"
              onPress={() => finish("Register")}
            />
            <PrimaryButton
              title="J'ai déjà un compte"
              variant="outline"
              onPress={() => finish("Login")}
              style={{ marginTop: 10 }}
            />
          </>
        ) : (
          <PrimaryButton title="Suivant" onPress={() => goTo(index + 1)} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slide: {
    width,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingTop: 70,
    paddingBottom: 10,
  },
  iconWrap: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },
  slideTitle: {
    fontFamily: fonts.display,
    fontSize: 22,
    fontWeight: "700",
    color: colors.ink,
    textAlign: "center",
    marginBottom: 10,
  },
  slideText: {
    fontSize: 14,
    color: colors.inkSoft,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 300,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 18,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.line,
    marginHorizontal: 4,
  },
  dotActive: { backgroundColor: colors.gold, width: 20 },
  footer: { padding: 20, paddingTop: 4 },
});

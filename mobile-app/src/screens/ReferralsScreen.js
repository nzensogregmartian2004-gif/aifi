import React, { useCallback, useState } from "react";
import { View, Text, FlatList, StyleSheet, RefreshControl, Share, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as Clipboard from "expo-clipboard";
import { api, apiErrorMessage } from "../api/client";
import { Card, ScreenTitle, Badge, PrimaryButton, EmptyState } from "../components/ui";
import { colors } from "../theme";

// Adapte ce domaine à celui où sera hébergée l'inscription (deep link ou page web).
const SHARE_BASE_URL = "https://aifi.app/inscription";

export default function ReferralsScreen() {
  const [referralCode, setReferralCode] = useState(null);
  const [referrals, setReferrals] = useState([]);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [{ data: dashboard }, { data: refs }] = await Promise.all([
        api.get("/client/dashboard"),
        api.get("/client/referrals"),
      ]);
      setReferralCode(dashboard.referralCode);
      setReferrals(refs);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const shareLink = referralCode ? `${SHARE_BASE_URL}?code=${referralCode}` : "";

  async function copyCode() {
    await Clipboard.setStringAsync(referralCode);
    Alert.alert("Copié", "Le code de parrainage a été copié.");
  }

  async function shareLinkNow() {
    try {
      await Share.share({ message: `Rejoins-moi sur AIFI avec mon code de parrainage ${referralCode} : ${shareLink}` });
    } catch {
      // partage annulé, rien à faire
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper, paddingTop: 60 }}>
      <View style={{ paddingHorizontal: 20 }}>
        <ScreenTitle subtitle="Invite tes proches et gagne des récompenses">Mon parrainage</ScreenTitle>

        {!!error && <Card><Text style={{ color: colors.danger }}>{error}</Text></Card>}

        <Card>
          <Text style={styles.label}>Ton code de parrainage</Text>
          <Text style={styles.code}>{referralCode || "..."}</Text>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            <PrimaryButton title="Copier le code" onPress={copyCode} variant="outline" style={{ flex: 1 }} />
            <PrimaryButton title="Partager" onPress={shareLinkNow} style={{ flex: 1 }} />
          </View>
        </Card>

        <Text style={[styles.label, { marginTop: 4 }]}>Mes filleuls ({referrals.length})</Text>
      </View>

      <FlatList
        data={referrals}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, paddingTop: 8 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}
        ListEmptyComponent={<EmptyState text="Tu n'as encore parrainé personne." />}
        renderItem={({ item }) => (
          <Card style={{ marginBottom: 8, paddingVertical: 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View>
                <Text style={{ fontSize: 14.5, fontWeight: "600", color: colors.ink }}>{item.name}</Text>
                <Text style={{ fontSize: 11.5, color: colors.inkSoft, marginTop: 2 }}>
                  Inscrit le {new Date(item.createdAt).toLocaleDateString("fr-FR")}
                </Text>
              </View>
              <Badge status={item.status} />
            </View>
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 11.5, fontWeight: "700", color: colors.inkSoft, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 },
  code: { fontSize: 26, fontWeight: "700", color: colors.gold, letterSpacing: 2 },
});

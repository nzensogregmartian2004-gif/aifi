import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api, apiErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { Card, ScreenTitle, StatTile, Seal, PrimaryButton } from "../components/ui";
import { colors, money } from "../theme";

export default function DashboardScreen({ navigation }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const isPending = user?.status === "PENDING";

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/client/dashboard");
      setData(data);
      setError("");
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

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.paper }}
      contentContainerStyle={{ padding: 20, paddingTop: 60 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}
    >
      {data && (
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 18 }}>
          <Seal points={data.points} size={52} />
          <View style={{ marginLeft: 14, flex: 1 }}>
            <Text style={{ fontSize: 12, color: colors.inkSoft, fontWeight: "600", textTransform: "uppercase" }}>
              Niveau de confiance
            </Text>
            <Text style={{ fontSize: 19, fontWeight: "700", color: colors.ink }}>{data.trustLevel}</Text>
          </View>
        </View>
      )}

      <ScreenTitle subtitle={data ? `Bonjour ${data.name}` : ""}>Mon tableau de bord</ScreenTitle>

      {isPending && (
        <View style={styles.pendingBanner}>
          <Ionicons name="time-outline" size={20} color="#8a6100" style={{ marginRight: 8 }} />
          <Text style={styles.pendingText}>
            Ton compte est en attente de validation par un administrateur. Tu peux consulter ton tableau de bord,
            mais tu ne pourras demander une aide qu'une fois ton compte validé.
          </Text>
        </View>
      )}

      {!!error && (
        <Card><Text style={{ color: colors.danger }}>{error}</Text></Card>
      )}

      {data && (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
            <StatTile label="Plafond autorisé" value={`${money(data.ceilingAllowed)} FCFA`} />
            <StatTile label="Plafond disponible" value={`${money(data.ceilingAvailable)} FCFA`} accent />
            <StatTile label="Plafond utilisé" value={`${money(data.ceilingUsed)} FCFA`} />
            <StatTile label="Aides en cours" value={data.aidRequestsCount} />
            <StatTile label="Filleuls" value={data.referralsCount} />
            <StatTile label="Portefeuille" value={`${money(data.walletBalance)} FCFA`} accent />
          </View>

          {data.nextDueDate && (
            <Card>
              <Text style={{ fontSize: 11, fontWeight: "700", color: colors.inkSoft, textTransform: "uppercase" }}>
                Prochaine échéance
              </Text>
              <Text style={{ fontSize: 17, fontWeight: "700", color: colors.ink, marginTop: 4 }}>
                {new Date(data.nextDueDate).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}
              </Text>
            </Card>
          )}

          <View style={{ flexDirection: "row", gap: 10, marginTop: 6, marginBottom: 20 }}>
            <PrimaryButton
              title={isPending ? "Compte non validé" : "Demander une aide"}
              disabled={isPending}
              onPress={() => navigation.navigate("Aides", { screen: "NewAidRequest" })}
              style={{ flex: 1, opacity: isPending ? 0.5 : 1 }}
            />
            {data.aidRequestsCount > 0 && (
              <PrimaryButton
                title="Rembourser"
                variant="outline"
                onPress={() => navigation.navigate("Aides", { screen: "AidRequestsList" })}
                style={{ flex: 1 }}
              />
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pendingBanner: {
    flexDirection: "row", alignItems: "flex-start", backgroundColor: "#fff3d6",
    borderRadius: 10, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: "#f0d99a",
  },
  pendingText: { flex: 1, fontSize: 12.5, color: "#6b4c00", lineHeight: 18 },
});

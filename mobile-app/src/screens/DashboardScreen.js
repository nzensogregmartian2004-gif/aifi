import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage } from "../api/client";
import { Card, ScreenTitle, StatTile, Seal, PrimaryButton } from "../components/ui";
import { colors, money } from "../theme";

export default function DashboardScreen({ navigation }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

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

          <PrimaryButton
            title="Demander une aide financière"
            onPress={() => navigation.navigate("Aides", { screen: "NewAidRequest" })}
            style={{ marginTop: 6, marginBottom: 20 }}
          />
        </>
      )}
    </ScrollView>
  );
}

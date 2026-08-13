import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage } from "../../api/client";
import { Card, ScreenTitle, StatTile, PrimaryButton } from "../../components/ui";
import { colors, money } from "../../theme";

export default function AdminDashboardScreen({ navigation }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/dashboard");
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
      <ScreenTitle subtitle="Vue d'ensemble de l'activité">Administration</ScreenTitle>

      {!!error && <Card><Text style={{ color: colors.danger }}>{error}</Text></Card>}

      {data && (
        <>
          {(data.pendingAccounts > 0 || data.pendingAidRequests > 0 || data.pendingWithdrawals > 0 || data.pendingRepaymentDeclarations > 0) && (
            <Card style={{ borderColor: colors.gold, borderWidth: 1.5 }}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: colors.gold, textTransform: "uppercase", marginBottom: 8 }}>
                À traiter
              </Text>
              {data.pendingAccounts > 0 && <Text style={styles}>• {data.pendingAccounts} compte(s) en attente de validation</Text>}
              {data.pendingAidRequests > 0 && <Text style={styles}>• {data.pendingAidRequests} demande(s) d'aide en attente</Text>}
              {data.pendingRepaymentDeclarations > 0 && <Text style={styles}>• {data.pendingRepaymentDeclarations} déclaration(s) de remboursement à confirmer</Text>}
              {data.pendingWithdrawals > 0 && <Text style={styles}>• {data.pendingWithdrawals} retrait(s) à approuver</Text>}
              {data.pendingRepaymentDeclarations > 0 && (
                <PrimaryButton
                  title="Voir les déclarations"
                  variant="outline"
                  onPress={() => navigation.navigate("AdminDeclarations")}
                  style={{ marginTop: 10 }}
                />
              )}
            </Card>
          )}

          <PrimaryButton
            title="📁 Consulter les archives"
            variant="outline"
            onPress={() => navigation.navigate("AdminArchives")}
            style={{ marginBottom: 14 }}
          />

          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
            <StatTile label="Utilisateurs" value={data.totalUsers} />
            <StatTile label="Aides en cours" value={data.activeAidRequests} />
            <StatTile label="Aides en retard" value={data.lateAidRequests} accent={data.lateAidRequests > 0} />
            <StatTile label="Fonds distribués" value={`${money(data.totalFundsDistributed)} FCFA`} />
            <StatTile label="Remboursements" value={`${money(data.totalRepayments)} FCFA`} />
            <StatTile label="Commissions parrainage" value={`${money(data.totalReferralCommissions)} FCFA`} />
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = { fontSize: 13.5, color: colors.ink, marginBottom: 4 };

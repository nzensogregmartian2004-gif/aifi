import React, { useCallback, useState } from "react";
import { View, Text, FlatList, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage } from "../../api/client";
import { Card, ScreenTitle, EmptyState } from "../../components/ui";
import { colors } from "../../theme";

const ACTION_LABELS = {
  aid_request_accept: "Aide acceptée",
  aid_request_reject: "Aide refusée",
  aid_request_disburse: "Fonds envoyés",
  repayment_record_direct: "Dépôt enregistré",
  repayment_declaration_confirm: "Déclaration confirmée",
  repayment_declaration_reject: "Déclaration refusée",
  withdrawal_approve: "Retrait approuvé",
  withdrawal_reject: "Retrait refusé",
  user_validate: "Compte validé",
  user_suspend: "Compte suspendu",
  user_reactivate: "Compte réactivé",
  user_update_info: "Infos modifiées",
  user_reset_password: "Mot de passe réinitialisé",
  user_anonymize: "Compte anonymisé",
};

export default function AdminAuditLogScreen() {
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/audit-logs");
      setLogs(data);
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
    <View style={{ flex: 1, backgroundColor: colors.paper, paddingTop: 60 }}>
      <View style={{ paddingHorizontal: 20 }}>
        <ScreenTitle subtitle="Historique de toutes les actions administrateur">Archives</ScreenTitle>
      </View>

      {!!error && <Text style={{ color: colors.danger, paddingHorizontal: 20 }}>{error}</Text>}

      <FlatList
        data={logs}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 20, paddingTop: 4 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}
        ListEmptyComponent={<EmptyState text="Aucune action enregistrée pour l'instant." />}
        renderItem={({ item }) => (
          <Card>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontWeight: "700" }}>{ACTION_LABELS[item.action] || item.action}</Text>
              <Text style={{ color: colors.inkSoft, fontSize: 11.5 }}>
                {new Date(item.createdAt).toLocaleString("fr-FR")}
              </Text>
            </View>
            <Text style={{ color: colors.inkSoft, fontSize: 12.5, marginTop: 2 }}>
              Par {item.admin?.name || "—"}
            </Text>
            {!!item.note && <Text style={{ fontSize: 12.5, marginTop: 4, fontStyle: "italic" }}>{item.note}</Text>}
          </Card>
        )}
      />
    </View>
  );
}

import React, { useCallback, useState } from "react";
import { View, Text, FlatList, TextInput, StyleSheet, RefreshControl, TouchableOpacity } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage } from "../../api/client";
import { Card, ScreenTitle, Badge, Seal, EmptyState } from "../../components/ui";
import { colors, money } from "../../theme";

export default function AdminUsersScreen({ navigation }) {
  const [q, setQ] = useState("");
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (query) => {
    try {
      const { data } = await api.get("/admin/users", { params: query ? { q: query } : {} });
      setUsers(data);
      setError("");
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }, []);

  useFocusEffect(useCallback(() => { load(q); }, [load]));

  async function onRefresh() {
    setRefreshing(true);
    await load(q);
    setRefreshing(false);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper, paddingTop: 60 }}>
      <View style={{ paddingHorizontal: 20 }}>
        <ScreenTitle subtitle="Comptes clients">Utilisateurs</ScreenTitle>
        <TextInput
          style={styles.search}
          value={q}
          onChangeText={setQ}
          onSubmitEditing={() => load(q)}
          placeholder="Rechercher un nom, un numéro, un code…"
          returnKeyType="search"
        />
      </View>

      {!!error && <Text style={{ color: colors.danger, paddingHorizontal: 20 }}>{error}</Text>}

      <FlatList
        data={users}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 20, paddingTop: 4 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}
        ListEmptyComponent={<EmptyState text="Aucun utilisateur trouvé." />}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => navigation.navigate("AdminUserDetail", { userId: item.id })}>
            <Card style={{ flexDirection: "row", alignItems: "center" }}>
              <Seal points={item.points} size={40} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontWeight: "700", fontSize: 15 }}>{item.name}</Text>
                <Text style={{ color: colors.inkSoft, fontSize: 12.5 }}>{item.phone}</Text>
                <Text style={{ color: colors.inkSoft, fontSize: 12 }}>Plafond : {money(item.ceiling)} FCFA</Text>
              </View>
              <Badge status={item.status} />
            </Card>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  search: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 12, fontSize: 15,
    backgroundColor: colors.card, marginBottom: 4,
  },
});

import React, { useCallback, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage } from "../../api/client";
import { Card, ScreenTitle, EmptyState } from "../../components/ui";
import { colors } from "../../theme";

export default function AdminConversationsScreen({ navigation }) {
  const [conversations, setConversations] = useState([]);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/conversations");
      setConversations(data);
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
        <ScreenTitle subtitle="Discussions avec les clients">Messages</ScreenTitle>
      </View>

      {!!error && <Text style={{ color: colors.danger, paddingHorizontal: 20 }}>{error}</Text>}

      <FlatList
        data={conversations}
        keyExtractor={(item) => item.clientId}
        contentContainerStyle={{ padding: 20, paddingTop: 4 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}
        ListEmptyComponent={<EmptyState text="Aucune conversation pour le moment." />}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => navigation.navigate("AdminChat", { clientId: item.clientId, name: item.name })}>
            <Card style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "700", fontSize: 15 }}>{item.name}</Text>
                <Text style={{ color: colors.inkSoft, fontSize: 12.5 }} numberOfLines={1}>
                  {item.lastMessage?.imageUrl ? "📎 Photo" : item.lastMessage?.text || "…"}
                </Text>
              </View>
              {item.unreadCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.unreadCount}</Text>
                </View>
              )}
            </Card>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: colors.gold, borderRadius: 12, minWidth: 22, height: 22,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 6,
  },
  badgeText: { color: colors.white, fontWeight: "700", fontSize: 12 },
});

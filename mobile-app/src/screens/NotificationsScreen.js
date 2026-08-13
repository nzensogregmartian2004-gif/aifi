import React, { useCallback, useState } from "react";
import { View, Text, FlatList, StyleSheet, RefreshControl, TouchableOpacity } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, apiErrorMessage } from "../api/client";
import { Card, ScreenTitle, PrimaryButton, EmptyState } from "../components/ui";
import { colors } from "../theme";

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days} j`;
}

export default function NotificationsScreen() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/notifications");
      setItems(data);
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

  async function markRead(id) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    try {
      await api.post(`/notifications/${id}/read`);
    } catch {
      // silencieux
    }
  }

  async function markAllRead() {
    try {
      await api.post("/notifications/read-all");
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper, paddingTop: 60 }}>
      <View style={{ paddingHorizontal: 20 }}>
        <ScreenTitle subtitle="Validations, remboursements, retraits...">Notifications</ScreenTitle>
        {!!error && <Card><Text style={{ color: colors.danger }}>{error}</Text></Card>}
        <PrimaryButton title="Tout marquer comme lu" variant="outline" onPress={markAllRead} style={{ marginBottom: 14 }} />
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}
        ListEmptyComponent={<EmptyState text="Aucune notification pour le moment." />}
        renderItem={({ item }) => (
          <TouchableOpacity disabled={item.read} onPress={() => markRead(item.id)} activeOpacity={0.7}>
            <Card style={!item.read ? styles.unreadCard : undefined}>
              <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                {!item.read && <View style={styles.dot} />}
                <Text style={[styles.message, item.read && { opacity: 0.6 }]}>{item.message}</Text>
              </View>
              <Text style={styles.time}>{timeAgo(item.sentAt)}</Text>
            </Card>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  unreadCard: { borderColor: colors.gold },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.gold, marginTop: 6, marginRight: 8 },
  message: { fontSize: 14.5, color: colors.ink, flex: 1, lineHeight: 20 },
  time: { fontSize: 11.5, color: colors.inkSoft, marginTop: 8 },
});

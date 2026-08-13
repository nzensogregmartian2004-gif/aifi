import React from "react";
import { View, Text } from "react-native";
import ChatThread from "../../components/ChatThread";
import { colors } from "../../theme";

export default function AdminChatScreen({ route }) {
  const { clientId, name } = route.params;
  return (
    <View style={{ flex: 1, backgroundColor: colors.paper, paddingTop: 60 }}>
      <View style={{ paddingHorizontal: 20, marginBottom: 10 }}>
        <Text style={{ fontFamily: "serif", fontSize: 20, fontWeight: "700", color: colors.ink }}>{name}</Text>
      </View>
      <ChatThread
        getUrl={`/admin/conversations/${clientId}/messages`}
        postUrl={`/admin/conversations/${clientId}/messages`}
        myRole="ADMIN"
      />
    </View>
  );
}

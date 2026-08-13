import React from "react";
import { View, Text } from "react-native";
import { ScreenTitle } from "../components/ui";
import ChatThread from "../components/ChatThread";
import { colors } from "../theme";

export default function MessagesScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.paper, paddingTop: 60 }}>
      <View style={{ paddingHorizontal: 20 }}>
        <ScreenTitle subtitle="Une question, un justificatif à envoyer ? Écris à l'administrateur.">
          Messages
        </ScreenTitle>
      </View>
      <ChatThread getUrl="/client/messages" postUrl="/client/messages" myRole="CLIENT" />
    </View>
  );
}

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import { api, apiErrorMessage, uploadImage } from "../api/client";
import { assetUrl } from "../config";
import { colors, radius } from "../theme";

/**
 * Fil de discussion générique. `getUrl`/`postUrl` pointent vers les routes
 * client (/client/messages) ou admin (/admin/conversations/:clientId/messages)
 * selon qui l'utilise. `myRole` sert à aligner les bulles à droite/gauche.
 */
export default function ChatThread({ getUrl, postUrl, myRole }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(getUrl);
      setMessages(data);
      setError("");
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }, [getUrl]);

  useFocusEffect(
    useCallback(() => {
      load();
      const id = setInterval(load, 8000);
      return () => clearInterval(id);
    }, [load]),
  );

  async function send(imageUrl) {
    if (!text.trim() && !imageUrl) return;
    setSending(true);
    try {
      await api.post(postUrl, { text: text.trim() || undefined, imageUrl });
      setText("");
      await load();
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSending(false);
    }
  }

  async function attachImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.6,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (result.canceled) return;
    setSending(true);
    try {
      const url = await uploadImage(result.assets[0]);
      await send(url);
    } catch (err) {
      setError(apiErrorMessage(err));
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
        onContentSizeChange={() =>
          listRef.current?.scrollToEnd({ animated: false })
        }
        renderItem={({ item }) => {
          const mine = item.senderRole === myRole;
          return (
            <View
              style={[
                styles.bubbleRow,
                { justifyContent: mine ? "flex-end" : "flex-start" },
              ]}
            >
              <View
                style={[
                  styles.bubble,
                  mine ? styles.bubbleMine : styles.bubbleTheirs,
                ]}
              >
                {!!item.imageUrl && (
                  <Image
                    source={{ uri: assetUrl(item.imageUrl) }}
                    style={styles.image}
                  />
                )}
                {!!item.text && (
                  <Text
                    style={[styles.bubbleText, mine && { color: colors.white }]}
                  >
                    {item.text}
                  </Text>
                )}
                <Text
                  style={[
                    styles.time,
                    mine && { color: "rgba(255,255,255,0.7)" },
                  ]}
                >
                  {new Date(item.createdAt).toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
            </View>
          );
        }}
      />
      {!!error && (
        <Text
          style={{ color: colors.danger, fontSize: 12, paddingHorizontal: 16 }}
        >
          {error}
        </Text>
      )}
      <View style={styles.inputRow}>
        <TouchableOpacity
          onPress={attachImage}
          style={styles.attachBtn}
          disabled={sending}
        >
          <Text style={{ fontSize: 20 }}>📎</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Écrire un message…"
          multiline
        />
        <TouchableOpacity
          onPress={() => send()}
          style={styles.sendBtn}
          disabled={sending}
        >
          <Text style={{ color: colors.white, fontWeight: "700" }}>
            Envoyer
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  bubbleRow: { flexDirection: "row", marginBottom: 10 },
  bubble: { maxWidth: "78%", borderRadius: radius.md, padding: 10 },
  bubbleMine: { backgroundColor: colors.ink },
  bubbleTheirs: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  bubbleText: { fontSize: 14.5, color: colors.ink },
  image: { width: 200, height: 160, borderRadius: 8, marginBottom: 6 },
  time: {
    fontSize: 10,
    color: colors.inkSoft,
    marginTop: 4,
    textAlign: "right",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.card,
  },
  attachBtn: { padding: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginHorizontal: 6,
    maxHeight: 100,
    fontSize: 14.5,
    color: colors.ink,
  },
  sendBtn: {
    backgroundColor: colors.gold,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
});

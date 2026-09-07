import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import { api, apiErrorMessage, uploadImage } from "../api/client";
import { authedAssetSource } from "../config";
import { colors, radius } from "../theme";

/**
 * Les pièces jointes (/uploads/xxx.jpg) sont maintenant servies derrière une
 * authentification (voir uploads.serve.routes.ts côté backend), donc on ne
 * peut plus se contenter d'une URL simple pour <Image> — il faut résoudre le
 * source (uri + header Authorization) de façon asynchrone au montage.
 */
function MessageImage({ url }) {
  const [source, setSource] = useState(null);

  useEffect(() => {
    let cancelled = false;
    authedAssetSource(url).then((s) => {
      if (!cancelled) setSource(s);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!source)
    return <View style={[styles.image, { backgroundColor: colors.line }]} />;
  return <Image source={source} style={styles.image} />;
}

/**
 * Image en cours d'envoi : contrairement à MessageImage, l'URI est un
 * fichier local (file://), déjà affichable directement sans requête réseau —
 * c'est ce qui donne l'impression immédiate que "le message est bien parti",
 * avec un voile + spinner pour indiquer que l'envoi est encore en cours.
 */
function PendingImage({ uri, failed, onRetry }) {
  return (
    <TouchableOpacity
      activeOpacity={failed ? 0.7 : 1}
      onPress={failed ? onRetry : undefined}
      style={styles.image}
    >
      <Image source={{ uri }} style={styles.image} />
      <View style={[styles.pendingOverlay, failed && styles.pendingOverlayFailed]}>
        {failed ? (
          <Text style={styles.pendingRetryText}>⟳ Réessayer</Text>
        ) : (
          <ActivityIndicator color="#fff" size="small" />
        )}
      </View>
    </TouchableOpacity>
  );
}

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
  // Images en cours d'envoi, affichées tout de suite (voir PendingImage),
  // séparées de `messages` (qui ne vient que du serveur via load()).
  const [pendingUploads, setPendingUploads] = useState([]);
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

  async function uploadAndSend(pendingId, asset) {
    try {
      const url = await uploadImage(asset);
      await api.post(postUrl, { imageUrl: url });
      setPendingUploads((p) => p.filter((m) => m.id !== pendingId));
      await load();
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err) {
      setPendingUploads((p) => p.map((m) => (m.id === pendingId ? { ...m, failed: true } : m)));
      setError(apiErrorMessage(err));
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

    const asset = result.assets[0];
    const pendingId = `pending-${Date.now()}`;
    setPendingUploads((p) => [...p, { id: pendingId, uri: asset.uri, failed: false }]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);

    await uploadAndSend(pendingId, asset);
  }

  function retryPending(item) {
    setPendingUploads((p) => p.map((m) => (m.id === item.id ? { ...m, failed: false } : m)));
    uploadAndSend(item.id, { uri: item.uri });
  }

  // Les envois en cours sont toujours les plus récents : on les affiche à la
  // suite des messages confirmés, dans le même FlatList.
  const combinedData = [
    ...messages,
    ...pendingUploads.map((p) => ({ id: p.id, pending: true, ...p })),
  ];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        ref={listRef}
        data={combinedData}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
        onContentSizeChange={() =>
          listRef.current?.scrollToEnd({ animated: false })
        }
        renderItem={({ item }) => {
          if (item.pending) {
            return (
              <View style={[styles.bubbleRow, { justifyContent: "flex-end" }]}>
                <View style={[styles.bubble, styles.bubbleMine]}>
                  <PendingImage uri={item.uri} failed={item.failed} onRetry={() => retryPending(item)} />
                </View>
              </View>
            );
          }
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
                {!!item.imageUrl && <MessageImage url={item.imageUrl} />}
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
  pendingOverlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 6, borderRadius: 8,
    backgroundColor: "rgba(15,27,51,0.35)", alignItems: "center", justifyContent: "center",
  },
  pendingOverlayFailed: { backgroundColor: "rgba(180,40,40,0.55)" },
  pendingRetryText: { color: "#fff", fontWeight: "700", fontSize: 13 },
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

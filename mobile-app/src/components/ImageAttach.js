import React, { useState } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet, ActionSheetIOS, Platform, Alert, ActivityIndicator } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { colors, radius } from "../theme";
import { uploadImage, apiErrorMessage } from "../api/client";

/**
 * Bouton "joindre une photo" : ouvre caméra ou galerie, uploade tout de suite
 * vers le serveur, et remonte l'URL relative via onChange("/uploads/xxx.jpg").
 * Affiche un aperçu une fois l'image envoyée.
 */
export default function ImageAttach({ value, onChange, label = "Joindre une photo justificative" }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  // Aperçu local affiché tout de suite, avant même que l'upload ne parte —
  // évite l'impression que "rien ne s'est passé" pendant la latence réseau.
  const [localUri, setLocalUri] = useState(null);

  async function pick(fromCamera) {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Autorisation refusée. Active l'accès dans les réglages du téléphone.");
      return;
    }

    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: ImagePicker.MediaTypeOptions.Images });

    if (result.canceled) return;

    setError("");
    setLocalUri(result.assets[0].uri);
    setUploading(true);
    try {
      const url = await uploadImage(result.assets[0]);
      onChange(url, result.assets[0].uri);
    } catch (err) {
      setError(apiErrorMessage(err));
      setLocalUri(null);
    } finally {
      setUploading(false);
    }
  }

  function choose() {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ["Annuler", "Prendre une photo", "Choisir dans la galerie"], cancelButtonIndex: 0 },
        (index) => {
          if (index === 1) pick(true);
          if (index === 2) pick(false);
        }
      );
    } else {
      Alert.alert("Justificatif", "Comment veux-tu ajouter la photo ?", [
        { text: "Annuler", style: "cancel" },
        { text: "Prendre une photo", onPress: () => pick(true) },
        { text: "Galerie", onPress: () => pick(false) },
      ]);
    }
  }

  const previewUri = value?.previewUri || localUri;

  return (
    <View style={{ marginTop: 6 }}>
      <TouchableOpacity style={styles.box} onPress={choose} disabled={uploading} activeOpacity={0.75}>
        {previewUri ? (
          <View style={{ width: "100%" }}>
            <Image source={{ uri: previewUri }} style={styles.preview} />
            {uploading && (
              <View style={styles.uploadOverlay}>
                <ActivityIndicator color="#fff" />
                <Text style={styles.uploadOverlayText}>Envoi en cours…</Text>
              </View>
            )}
          </View>
        ) : (
          <Text style={styles.text}>📎 {label}</Text>
        )}
      </TouchableOpacity>
      {!!error && <Text style={{ color: colors.danger, fontSize: 12, marginTop: 6 }}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.line,
    borderRadius: radius.sm,
    backgroundColor: colors.paper,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 54,
  },
  text: { fontSize: 13.5, color: colors.inkSoft, fontWeight: "600" },
  preview: { width: "100%", height: 160, borderRadius: radius.sm },
  uploadOverlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: radius.sm,
    backgroundColor: "rgba(15,27,51,0.45)", alignItems: "center", justifyContent: "center", gap: 6,
  },
  uploadOverlayText: { color: "#fff", fontSize: 12.5, fontWeight: "700" },
});

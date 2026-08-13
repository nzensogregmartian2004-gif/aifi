import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL } from "../config";

export const TOKEN_KEY = "aifi_client_token";

export const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function apiErrorMessage(err) {
  return err?.response?.data?.error || "Une erreur est survenue. Réessaie.";
}

// Upload d'une image (justificatif ou pièce jointe de message) sélectionnée via
// expo-image-picker. `asset` est le résultat d'ImagePicker (avec .uri). Renvoie
// l'URL relative ("/uploads/xxx.jpg") à stocker/transmettre dans les autres appels.
export async function uploadImage(asset) {
  const form = new FormData();
  const filename = asset.uri.split("/").pop();
  const match = /\.(\w+)$/.exec(filename || "");
  const ext = match ? match[1] : "jpg";
  form.append("file", {
    uri: asset.uri,
    name: filename || `photo.${ext}`,
    type: `image/${ext}`,
  });
  const { data } = await api.post("/uploads", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data.url;
}

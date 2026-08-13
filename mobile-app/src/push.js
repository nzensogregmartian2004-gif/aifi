import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { api } from "./api/client";

// Affiche les notifications reçues même quand l'app est ouverte au premier plan
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Demande la permission et récupère un token de notification push Expo.
 * Retourne null si refusé, sur simulateur/émulateur, ou si le projet Expo
 * n'est pas encore configuré (EAS projectId) — l'app continue de fonctionner
 * normalement sans push dans ce cas, seules les notifications en-app restent actives.
 */
export async function registerForPushNotificationsAsync() {
  try {
    if (!Device.isDevice) {
      return null; // pas de push sur simulateur/émulateur
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") {
      return null;
    }

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    return tokenResponse.data; // ex: "ExponentPushToken[xxxxxxxx]"
  } catch (err) {
    console.warn("Notifications push non disponibles :", err);
    return null;
  }
}

/**
 * À appeler après connexion (et au démarrage si déjà connecté) : récupère le
 * token push et l'enregistre côté serveur pour cet utilisateur.
 */
export async function registerPushTokenWithServer() {
  const token = await registerForPushNotificationsAsync();
  if (!token) return;
  try {
    await api.post("/account/push-token", { token });
  } catch {
    // silencieux : les notifications en-app fonctionnent même si l'enregistrement échoue
  }
}

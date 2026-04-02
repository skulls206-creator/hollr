import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./api";

const PUSH_TOKEN_KEY = "hollr:expo-push-token";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function getExpoPushToken(): Promise<string | null> {
  if (!Constants.isDevice) return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "hollr messages",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#7c3aed",
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") return null;

  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;
    if (!projectId) return null;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    return token;
  } catch {
    return null;
  }
}

export async function getStoredPushToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PUSH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function registerForPushNotifications(): Promise<void> {
  const token = await getExpoPushToken();
  if (!token) return;

  try {
    await api("/push/expo-token", {
      method: "POST",
      body: JSON.stringify({ token, label: Platform.OS === "ios" ? "iPhone" : "Android" }),
    });
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
  } catch {
  }
}

export async function unregisterPushToken(): Promise<void> {
  const token = await getStoredPushToken();
  if (!token) return;
  try {
    await api("/push/expo-token", {
      method: "DELETE",
      body: JSON.stringify({ token }),
    });
    await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
  } catch {
  }
}

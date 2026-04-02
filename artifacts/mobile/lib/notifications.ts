import Constants from "expo-constants";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./api";

const PUSH_TOKEN_KEY = "hollr:expo-push-token";

// expo-notifications remote push support was removed from Expo Go in SDK 53.
// We use require() so we can wrap it in try/catch at runtime instead of
// crashing at module load time on a static import.
const isExpoGo = Constants.appOwnership === "expo";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Notifications: any = null;

if (!isExpoGo) {
  try {
    // Dynamic require so the module load error is catchable.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Notifications = require("expo-notifications");
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch (e) {
    console.warn("[push] expo-notifications unavailable:", e);
    Notifications = null;
  }
}

async function getExpoPushToken(): Promise<string | null> {
  if (isExpoGo || !Notifications) return null;
  if (!Constants.isDevice) return null;

  if (Platform.OS === "android") {
    try {
      await Notifications.setNotificationChannelAsync("default", {
        name: "hollr messages",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#7c3aed",
      });
    } catch (e) {
      console.warn("[push] setNotificationChannelAsync failed:", e);
    }
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") return null;

    const projectId: string | undefined =
      Constants.easConfig?.projectId ??
      (Constants.expoConfig?.extra?.eas?.projectId as string | undefined);
    if (!projectId) {
      console.warn("[push] No EAS project ID configured — push tokens unavailable");
      return null;
    }
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    return token;
  } catch (err) {
    console.warn("[push] Failed to get Expo push token:", err);
    return null;
  }
}

export async function updateBadgeCount(count: number): Promise<void> {
  if (isExpoGo || !Notifications) return;
  try {
    await Notifications.setBadgeCountAsync(Math.max(0, count));
  } catch (e) {
    console.warn("[push] Failed to set badge count:", e);
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
  if (isExpoGo || !Notifications) return;
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
  if (isExpoGo || !Notifications) return;
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

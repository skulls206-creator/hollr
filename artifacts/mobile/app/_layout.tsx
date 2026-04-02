import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as Notifications from "expo-notifications";
import { registerForPushNotifications } from "@/lib/notifications";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { RealtimeProvider } from "@/contexts/RealtimeContext";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000,
    },
  },
});

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="server/[serverId]"
        options={{ headerShown: false, animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="channel"
        options={{ headerShown: false, animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="dm/[threadId]"
        options={{ headerShown: false, animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="server-admin"
        options={{
          headerShown: false,
          presentation: "modal",
          animation: "slide_from_bottom",
        }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const notifListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    registerForPushNotifications().catch(() => {});

    notifListener.current = Notifications.addNotificationReceivedListener(_notification => {});
    responseListener.current = Notifications.addNotificationResponseReceivedListener(_response => {});

    return () => {
      if (notifListener.current) Notifications.removeNotificationSubscription(notifListener.current);
      if (responseListener.current) Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <ThemeProvider>
              <RealtimeProvider>
                <GestureHandlerRootView style={{ flex: 1 }}>
                  <KeyboardProvider>
                    <RootLayoutNav />
                  </KeyboardProvider>
                </GestureHandlerRootView>
              </RealtimeProvider>
            </ThemeProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

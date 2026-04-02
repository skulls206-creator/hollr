import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider, useQuery, useQueries } from "@tanstack/react-query";
import { Stack, router, usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as Notifications from "expo-notifications";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { RealtimeProvider, useRealtime } from "@/contexts/RealtimeContext";
import { NavProvider, useNav } from "@/contexts/NavContext";
import { ServerRail } from "@/components/ServerRail";
import { api } from "@/lib/api";
import { updateBadgeCount } from "@/lib/notifications";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000,
    },
  },
});

function UnreadBadgeSync() {
  const { user } = useAuth();
  const { subscribe } = useRealtime();
  const { data: servers = [] } = useQuery<{ id: string }[]>({
    queryKey: ["servers"],
    queryFn: () => api("/servers"),
    enabled: !!user,
    refetchInterval: 60000,
  });

  const unreadResults = useQueries({
    queries: servers.map((s: { id: string }) => ({
      queryKey: ["server-unread", s.id],
      queryFn: () => api<Array<{ channelId: string; count: number }>>(`/servers/${s.id}/unread`),
      enabled: !!user,
      refetchInterval: 60000,
      staleTime: 15000,
    })),
  });

  const { data: dmUnreadCounts = [] } = useQuery<Array<{ threadId: string; count: number }>>({
    queryKey: ["dm-unread"],
    queryFn: () => api("/dms/unread"),
    enabled: !!user,
    refetchInterval: 60000,
  });

  useEffect(() => {
    if (!user) return;
    const unsubs = [
      subscribe("MESSAGE_CREATE", (payload: { channelId?: string; dmThreadId?: string }) => {
        if (payload.channelId) queryClient.invalidateQueries({ queryKey: ["server-unread"] });
        if (payload.dmThreadId) queryClient.invalidateQueries({ queryKey: ["dm-unread"] });
      }),
      subscribe("MESSAGE_DELETE", (payload: { channelId?: string; dmThreadId?: string }) => {
        if (payload.channelId) queryClient.invalidateQueries({ queryKey: ["server-unread"] });
        if (payload.dmThreadId) queryClient.invalidateQueries({ queryKey: ["dm-unread"] });
      }),
    ];
    return () => unsubs.forEach(u => u());
  }, [subscribe, user]);

  useEffect(() => {
    const totalServer = unreadResults.reduce((sum, r) => {
      const entries = (r.data as Array<{ count: number }> | undefined) ?? [];
      return sum + entries.reduce((s, e) => s + e.count, 0);
    }, 0);
    const totalDm = dmUnreadCounts.reduce((sum, u) => sum + u.count, 0);
    updateBadgeCount(totalServer + totalDm).catch(() => {});
  }, [unreadResults, dmUnreadCounts]);

  return null;
}

const RAIL_HIDDEN_ROUTES = ["/login", "/signup", "/server-admin", "/index"];

function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { railHidden } = useNav();
  const pathname = usePathname();

  const hideRail =
    !user ||
    loading ||
    railHidden ||
    RAIL_HIDDEN_ROUTES.some((r) => pathname === r || pathname.startsWith(r));

  return (
    <View style={{ flex: 1, flexDirection: "row" }}>
      {!hideRail && <ServerRail />}
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

type PushData = {
  navType?: string;
  serverId?: string;
  channelId?: string;
  threadId?: string;
  channelName?: string;
  serverName?: string;
  otherUserName?: string;
  otherDisplayName?: string;
  otherAvatarUrl?: string;
  otherStatus?: string;
};

function handleNotificationNav(data: PushData | undefined) {
  if (!data) return;
  if (data.navType === "dm" && data.threadId) {
    router.push({
      pathname: "/dm/[threadId]",
      params: {
        threadId: data.threadId,
        otherUserName: data.otherUserName ?? undefined,
        otherDisplayName: data.otherDisplayName ?? undefined,
        otherAvatarUrl: data.otherAvatarUrl ?? undefined,
        otherStatus: data.otherStatus ?? undefined,
      },
    });
  } else if (data.navType === "channel" && data.serverId && data.channelId) {
    router.push({
      pathname: "/channel",
      params: {
        channelId: data.channelId,
        serverId: data.serverId,
        channelName: data.channelName ?? undefined,
        serverName: data.serverName ?? undefined,
      },
    });
  }
}

function RootLayoutNav() {
  const notifListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    Notifications.getLastNotificationResponseAsync().then(response => {
      if (response) handleNotificationNav(response.notification.request.content.data as PushData);
    });

    notifListener.current = Notifications.addNotificationReceivedListener(_notification => {});
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      handleNotificationNav(response.notification.request.content.data as PushData);
    });

    return () => {
      notifListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  return (
    <AppShell>
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
    </AppShell>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

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
                <NavProvider>
                  <UnreadBadgeSync />
                  <GestureHandlerRootView style={{ flex: 1 }}>
                    <KeyboardProvider>
                      <RootLayoutNav />
                    </KeyboardProvider>
                  </GestureHandlerRootView>
                </NavProvider>
              </RealtimeProvider>
            </ThemeProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

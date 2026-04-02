import React, { useCallback, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { router, useLocalSearchParams, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { useNav } from "@/contexts/NavContext";
import { api } from "@/lib/api";

interface Channel {
  id: string;
  name: string;
  type: string;
  position: number;
}

interface Server {
  id: string;
  name: string;
  ownerId: string;
  iconUrl: string | null;
  memberCount: number;
}

interface ServerMember {
  userId: string;
  role: string;
}

interface UnreadCount {
  channelId: string;
  count: number;
}

export default function ServerScreen() {
  const { serverId } = useLocalSearchParams<{ serverId: string }>();
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { setActiveSection, setActiveServerId } = useNav();

  useEffect(() => {
    if (serverId) {
      setActiveSection("server");
      setActiveServerId(serverId);
    }
  }, [serverId, setActiveSection, setActiveServerId]);

  const { data: server, isLoading: serverLoading } = useQuery<Server>({
    queryKey: ["server", serverId],
    queryFn: () => api(`/servers/${serverId}`),
    enabled: !!serverId,
  });

  const { data: channels = [], isLoading: channelsLoading, refetch, isRefetching } = useQuery<Channel[]>({
    queryKey: ["channels", serverId],
    queryFn: () => api(`/servers/${serverId}/channels`),
    enabled: !!serverId,
  });

  const { data: members = [] } = useQuery<ServerMember[]>({
    queryKey: ["members", serverId],
    queryFn: () => api(`/servers/${serverId}/members`),
    enabled: !!serverId,
    select: (data: Array<{ userId: string; role: string }>) => data,
  });

  const { data: unreadCounts = [] } = useQuery<UnreadCount[]>({
    queryKey: ["unread", serverId],
    queryFn: () => api(`/servers/${serverId}/unread`),
    enabled: !!serverId,
    refetchInterval: 15000,
  });

  const isOwner = user?.id === server?.ownerId;
  const myMember = members.find(m => m.userId === user?.id);
  const isAdminOrOwner = isOwner || myMember?.role === "admin";

  const unreadMap = new Map(unreadCounts.map(u => [u.channelId, u.count]));

  const textChannels = channels.filter(c => c.type === "text").sort((a, b) => a.position - b.position);

  const s = createStyles(colors);

  const renderChannel = useCallback(({ item }: { item: Channel }) => {
    const unread = unreadMap.get(item.id) ?? 0;
    return (
      <TouchableOpacity
        style={s.channelRow}
        onPress={() => {
          router.push({
            pathname: "/channel",
            params: { channelId: item.id, channelName: item.name, serverId, serverName: server?.name ?? "" },
          });
        }}
        activeOpacity={0.7}
      >
        <Ionicons
          name="chatbubble-outline"
          size={18}
          color={colors.mutedForeground}
        />
        <Text style={[s.channelName, unread > 0 && s.channelNameUnread]}>
          {item.name}
        </Text>
        {unread > 0 && (
          <View style={[s.badgePill, { backgroundColor: colors.primary }]}>
            <Text style={[s.badgeText, { color: colors.primaryForeground }]}>
              {unread > 99 ? "99+" : unread}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }, [colors, serverId, server?.name, unreadMap, s]);

  if (serverLoading) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={s.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </View>
    );
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.header}>
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle} numberOfLines={1}>{server?.name ?? "Server"}</Text>
          <Text style={s.headerSub}>{server?.memberCount} members</Text>
        </View>

        {isAdminOrOwner && (
          <TouchableOpacity
            style={s.settingsBtn}
            onPress={() =>
              router.push({ pathname: "/server-admin", params: { serverId: serverId! } })
            }
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="settings-outline" size={22} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
      </View>

      {channelsLoading ? (
        <View style={s.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={textChannels}
          keyExtractor={item => item.id}
          renderItem={renderChannel}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          ListHeaderComponent={() => (
            <View style={s.sectionHeader}>
              <Text style={s.sectionLabel}>CHANNELS</Text>
            </View>
          )}
          ListEmptyComponent={() => (
            <View style={s.emptyState}>
              <Text style={s.emptyText}>No channels yet</Text>
              {isAdminOrOwner && (
                <Text style={s.emptySubText}>Add channels from the server settings</Text>
              )}
            </View>
          )}
          ItemSeparatorComponent={() => <View style={s.separator} />}
        />
      )}
    </View>
  );
}

function createStyles(colors: {
  background: string; foreground: string; muted: string; mutedForeground: string;
  primary: string; primaryForeground: string; border: string; radius: number;
}) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitle: {
      fontFamily: "Inter_700Bold",
      fontSize: 18,
      color: colors.foreground,
      letterSpacing: -0.3,
    },
    headerSub: {
      fontFamily: "Inter_400Regular",
      fontSize: 12,
      color: colors.mutedForeground,
    },
    settingsBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.muted,
      alignItems: "center",
      justifyContent: "center",
    },
    sectionHeader: {
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 8,
    },
    sectionLabel: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 11,
      color: colors.mutedForeground,
      letterSpacing: 1,
      textTransform: "uppercase",
    },
    channelRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    channelName: {
      flex: 1,
      fontFamily: "Inter_500Medium",
      fontSize: 15,
      color: colors.foreground,
    },
    channelNameUnread: {
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    voiceTag: {
      fontFamily: "Inter_400Regular",
      fontSize: 11,
      color: colors.mutedForeground,
      backgroundColor: colors.muted,
      borderRadius: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    badgePill: {
      borderRadius: 10,
      minWidth: 20,
      height: 20,
      paddingHorizontal: 5,
      alignItems: "center",
      justifyContent: "center",
    },
    badgeText: {
      fontFamily: "Inter_700Bold",
      fontSize: 11,
    },
    separator: { height: 1, backgroundColor: colors.border, marginLeft: 44 },
    emptyState: {
      padding: 32,
      alignItems: "center",
      gap: 6,
    },
    emptyText: {
      fontFamily: "Inter_500Medium",
      fontSize: 15,
      color: colors.mutedForeground,
    },
    emptySubText: {
      fontFamily: "Inter_400Regular",
      fontSize: 13,
      color: colors.mutedForeground,
      textAlign: "center",
    },
  });
}

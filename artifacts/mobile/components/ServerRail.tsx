import React, { useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery, useQueries } from "@tanstack/react-query";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { useNav } from "@/contexts/NavContext";
import { api } from "@/lib/api";

interface Server {
  id: string;
  name: string;
  iconUrl: string | null;
}

const RAIL_WIDTH = 64;

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function ServerRail() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { activeSection, activeServerId, setActiveSection, setActiveServerId } = useNav();

  const { data: servers = [] } = useQuery<Server[]>({
    queryKey: ["servers"],
    queryFn: () => api("/servers"),
    enabled: !!user,
    refetchInterval: 60000,
  });

  const unreadResults = useQueries({
    queries: servers.map((s) => ({
      queryKey: ["server-unread", s.id],
      queryFn: () => api<Array<{ channelId: string; count: number }>>(`/servers/${s.id}/unread`),
      enabled: !!user,
      refetchInterval: 30000,
      staleTime: 15000,
    })),
  });

  const { data: dmUnreadCounts = [] } = useQuery<Array<{ threadId: string; count: number }>>({
    queryKey: ["dm-unread"],
    queryFn: () => api("/dms/unread"),
    enabled: !!user,
    refetchInterval: 30000,
  });

  const totalDmUnread = dmUnreadCounts.reduce((s, u) => s + u.count, 0);

  const getServerUnread = useCallback(
    (serverId: string) => {
      const idx = servers.findIndex((s) => s.id === serverId);
      if (idx === -1) return 0;
      const result = unreadResults[idx];
      if (!result?.data) return 0;
      return (result.data as Array<{ count: number }>).reduce((s, e) => s + e.count, 0);
    },
    [servers, unreadResults]
  );

  function navDms() {
    setActiveSection("dms");
    setActiveServerId(null);
    router.replace("/(tabs)/dms" as never);
  }

  function navServer(id: string) {
    setActiveSection("server");
    setActiveServerId(id);
    router.push({ pathname: "/server/[serverId]", params: { serverId: id } });
  }

  function navKhurk() {
    setActiveSection("khurk");
    setActiveServerId(null);
    router.replace("/(tabs)/khurk" as never);
  }

  function navProfile() {
    setActiveSection("profile");
    setActiveServerId(null);
    router.replace("/(tabs)/profile" as never);
  }

  function navAddServer() {
    setActiveSection("dms");
    router.replace("/(tabs)" as never);
  }

  const bg = colors.background ?? "#0f0f1a";
  const accent = colors.primary ?? "#8b5cf6";

  const styles = StyleSheet.create({
    rail: {
      width: RAIL_WIDTH,
      backgroundColor: colors.background ?? bg,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderRightColor: colors.border ?? "#2a2a3a",
      alignItems: "center",
      paddingTop: insets.top + 8,
      paddingBottom: insets.bottom + 8,
      flexShrink: 0,
    },
    btn: {
      width: 48,
      height: 48,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 4,
    },
    pillWrap: {
      flexDirection: "row",
      alignItems: "center",
      width: RAIL_WIDTH,
      marginBottom: 4,
    },
    pill: {
      width: 4,
      borderRadius: 2,
      backgroundColor: "#ffffff",
      marginRight: 4,
    },
    badge: {
      position: "absolute",
      bottom: 0,
      right: 0,
      backgroundColor: "#ed4245",
      borderRadius: 8,
      minWidth: 16,
      height: 16,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 3,
    },
    badgeText: {
      color: "#fff",
      fontSize: 10,
      fontWeight: "700",
    },
    divider: {
      width: 32,
      height: 2,
      borderRadius: 1,
      backgroundColor: colors.border ?? "#2a2a3a",
      marginVertical: 6,
    },
    spacer: { flex: 1 },
    serverInitials: {
      fontSize: 13,
      fontWeight: "700",
      color: "#fff",
    },
  });

  function isServerActive(id: string) {
    return activeSection === "server" && activeServerId === id;
  }

  function renderServer({ item, index }: { item: Server; index: number }) {
    const active = isServerActive(item.id);
    const unread = getServerUnread(item.id);
    return (
      <View style={styles.pillWrap}>
        <View
          style={[
            styles.pill,
            {
              height: active ? 36 : unread > 0 ? 8 : 0,
              opacity: active || unread > 0 ? 1 : 0,
            },
          ]}
        />
        <TouchableOpacity
          onPress={() => navServer(item.id)}
          style={[
            styles.btn,
            {
              backgroundColor: active ? accent : colors.card,
              borderRadius: active ? 16 : 24,
            },
          ]}
          activeOpacity={0.8}
        >
          {item.iconUrl ? (
            <Image
              source={{ uri: item.iconUrl }}
              style={{ width: 44, height: 44, borderRadius: active ? 14 : 22 }}
            />
          ) : (
            <Text style={styles.serverInitials}>{getInitials(item.name)}</Text>
          )}
          {unread > 0 && !active && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unread > 99 ? "99+" : unread}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.rail}>
      {/* Hollr gem — home / DMs */}
      <View style={styles.pillWrap}>
        <View
          style={[
            styles.pill,
            {
              height: activeSection === "dms" ? 36 : 0,
              opacity: activeSection === "dms" ? 1 : 0,
            },
          ]}
        />
        <TouchableOpacity
          onPress={navDms}
          style={[
            styles.btn,
            {
              backgroundColor:
                activeSection === "dms" ? accent : colors.card,
              borderRadius: activeSection === "dms" ? 16 : 24,
            },
          ]}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name="diamond-stone"
            size={24}
            color={activeSection === "dms" ? "#fff" : (colors.muted ?? "#9ca3af")}
          />
          {totalDmUnread > 0 && activeSection !== "dms" && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {totalDmUnread > 99 ? "99+" : totalDmUnread}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.divider} />

      {/* Server list */}
      <FlatList
        data={servers}
        keyExtractor={(s) => s.id}
        renderItem={renderServer}
        showsVerticalScrollIndicator={false}
        style={{ flexGrow: 0, maxHeight: "55%" }}
      />

      {/* Add server */}
      <TouchableOpacity
        onPress={navAddServer}
        style={[styles.btn, { backgroundColor: colors.card, marginTop: 4 }]}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={24} color={colors.primary ?? accent} />
      </TouchableOpacity>

      <View style={styles.divider} />
      <View style={styles.spacer} />

      {/* KHURK OS */}
      <View style={styles.pillWrap}>
        <View
          style={[
            styles.pill,
            {
              height: activeSection === "khurk" ? 36 : 0,
              opacity: activeSection === "khurk" ? 1 : 0,
            },
          ]}
        />
        <TouchableOpacity
          onPress={navKhurk}
          style={[
            styles.btn,
            {
              backgroundColor:
                activeSection === "khurk" ? accent : colors.card,
              borderRadius: activeSection === "khurk" ? 16 : 24,
            },
          ]}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name="sparkles"
            size={22}
            color={activeSection === "khurk" ? "#fff" : (colors.primary ?? accent)}
          />
        </TouchableOpacity>
      </View>

      {/* Profile */}
      <TouchableOpacity
        onPress={navProfile}
        style={[
          styles.btn,
          {
            borderWidth: activeSection === "profile" ? 2 : 0,
            borderColor: accent,
            marginTop: 4,
          },
        ]}
        activeOpacity={0.8}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: accent,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>
            {(user?.username ?? "?")[0].toUpperCase()}
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

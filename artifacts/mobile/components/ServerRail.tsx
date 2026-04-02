import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { useNav } from "@/contexts/NavContext";
import { api } from "@/lib/api";
import { Avatar } from "@/components/Avatar";

const KHURK_K_LOGO = require("@/assets/images/khurk-k-logo.jpg");

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
  const queryClient = useQueryClient();
  const { activeSection, activeServerId, setActiveSection, setActiveServerId } = useNav();

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "join">("create");
  const [serverName, setServerName] = useState("");
  const [inviteCode, setInviteCode] = useState("");

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

  const createMutation = useMutation({
    mutationFn: (name: string) =>
      api("/servers", { method: "POST", body: JSON.stringify({ name }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["servers"] });
      setAddModalVisible(false);
      setServerName("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: Error) => {
      Alert.alert("Error", e.message || "Failed to create server");
    },
  });

  const joinMutation = useMutation({
    mutationFn: (code: string) =>
      api<Server>(`/invite/${code.trim()}/join`, { method: "POST" }),
    onSuccess: (joinedServer: Server) => {
      queryClient.invalidateQueries({ queryKey: ["servers"] });
      setAddModalVisible(false);
      setInviteCode("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setActiveSection("server");
      setActiveServerId(joinedServer.id);
      router.push({ pathname: "/server/[serverId]", params: { serverId: joinedServer.id } });
    },
    onError: (e: Error) => {
      Alert.alert("Error", e.message || "Invalid invite code");
    },
  });

  function openAddModal(mode: "create" | "join") {
    setModalMode(mode);
    setServerName("");
    setInviteCode("");
    setAddModalVisible(true);
  }

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

  const accent = colors.primary ?? "#8b5cf6";
  const railBg = colors.background;
  const cardBg = colors.card;
  const borderColor = colors.border;
  const mutedFg = colors.mutedForeground;

  function RailBtn({
    onPress,
    active,
    children,
    badge,
  }: {
    onPress: () => void;
    active: boolean;
    children: React.ReactNode;
    badge?: number;
  }) {
    return (
      <View style={styles.pillRow}>
        <View
          style={[
            styles.pill,
            { height: active ? 36 : 0, backgroundColor: "#ffffff", opacity: active ? 1 : 0 },
          ]}
        />
        <TouchableOpacity
          onPress={onPress}
          style={[
            styles.btn,
            {
              backgroundColor: active ? accent : cardBg,
              borderRadius: active ? 16 : 24,
            },
          ]}
          activeOpacity={0.8}
        >
          {children}
          {!!badge && badge > 0 && !active && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge > 99 ? "99+" : badge}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  function renderServer({ item }: { item: Server }) {
    const active = activeSection === "server" && activeServerId === item.id;
    const unread = getServerUnread(item.id);
    return (
      <View style={styles.pillRow}>
        <View
          style={[
            styles.pill,
            {
              height: active ? 36 : unread > 0 ? 8 : 0,
              backgroundColor: "#ffffff",
              opacity: active || unread > 0 ? 1 : 0,
            },
          ]}
        />
        <TouchableOpacity
          onPress={() => navServer(item.id)}
          style={[
            styles.btn,
            {
              backgroundColor: active ? accent : cardBg,
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
            <Text style={[styles.serverInitials, { color: active ? "#fff" : colors.foreground }]}>
              {getInitials(item.name)}
            </Text>
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

  const isMutating = createMutation.isPending || joinMutation.isPending;

  return (
    <>
      <View
        style={[
          styles.rail,
          {
            backgroundColor: railBg,
            borderRightColor: borderColor,
            paddingTop: insets.top + 8,
            paddingBottom: insets.bottom + 8,
          },
        ]}
      >
        {/* ── PROFILE (top) ── */}
        <TouchableOpacity
          onPress={navProfile}
          style={[
            styles.btn,
            {
              borderWidth: activeSection === "profile" ? 2 : 0,
              borderColor: accent,
              backgroundColor: cardBg,
              marginBottom: 4,
            },
          ]}
          activeOpacity={0.8}
        >
          <Avatar
            avatarUrl={user?.avatarUrl}
            username={user?.username}
            displayName={user?.displayName ?? user?.username}
            size={36}
          />
        </TouchableOpacity>

        <View style={[styles.divider, { backgroundColor: borderColor }]} />

        {/* ── SERVER LIST (scrollable middle — grows to fill space) ── */}
        <FlatList
          data={servers}
          keyExtractor={(s) => s.id}
          renderItem={renderServer}
          showsVerticalScrollIndicator={false}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingVertical: 2 }}
        />

        {/* ── ADD SERVER ── */}
        <TouchableOpacity
          onPress={() => openAddModal("create")}
          style={[styles.btn, { backgroundColor: cardBg, marginTop: 4 }]}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={24} color={accent} />
        </TouchableOpacity>

        <View style={[styles.divider, { backgroundColor: borderColor, marginTop: 6 }]} />

        {/* ── KHURK ── */}
        <RailBtn onPress={navKhurk} active={activeSection === "khurk"}>
          <Image
            source={KHURK_K_LOGO}
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              opacity: activeSection === "khurk" ? 1 : 0.85,
            }}
          />
        </RailBtn>

        {/* ── DMs / Hollr gem (bottom) ── */}
        <RailBtn onPress={navDms} active={activeSection === "dms"} badge={totalDmUnread}>
          <Ionicons
            name="chatbubbles"
            size={22}
            color={activeSection === "dms" ? "#fff" : mutedFg}
          />
        </RailBtn>
      </View>

      {/* ── Add / Join Server Modal ── */}
      <Modal
        visible={addModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setAddModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              style={styles.kavWrapper}
              keyboardVerticalOffset={0}
            >
              <TouchableWithoutFeedback>
                <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor }]}>
                  {/* Header */}
                  <View style={styles.modalHeader}>
                    <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                      {modalMode === "create" ? "Create a Server" : "Join a Server"}
                    </Text>
                    <TouchableOpacity onPress={() => setAddModalVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="close" size={22} color={mutedFg} />
                    </TouchableOpacity>
                  </View>

                  {/* Tabs */}
                  <View style={[styles.tabRow, { borderBottomColor: borderColor }]}>
                    <TouchableOpacity
                      style={[styles.tab, modalMode === "create" && { borderBottomColor: accent, borderBottomWidth: 2 }]}
                      onPress={() => setModalMode("create")}
                    >
                      <Text style={[styles.tabText, { color: modalMode === "create" ? accent : mutedFg }]}>Create</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.tab, modalMode === "join" && { borderBottomColor: accent, borderBottomWidth: 2 }]}
                      onPress={() => setModalMode("join")}
                    >
                      <Text style={[styles.tabText, { color: modalMode === "join" ? accent : mutedFg }]}>Join</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Form */}
                  <ScrollView keyboardShouldPersistTaps="handled" style={{ padding: 16 }}>
                    {modalMode === "create" ? (
                      <>
                        <Text style={[styles.label, { color: mutedFg }]}>Server name</Text>
                        <TextInput
                          style={[styles.input, { backgroundColor: colors.muted, color: colors.foreground, borderColor }]}
                          placeholder="My Awesome Server"
                          placeholderTextColor={mutedFg}
                          value={serverName}
                          onChangeText={setServerName}
                          autoCapitalize="words"
                          returnKeyType="done"
                          onSubmitEditing={() => {
                            if (serverName.trim()) createMutation.mutate(serverName.trim());
                          }}
                        />
                        <TouchableOpacity
                          style={[styles.submitBtn, { backgroundColor: accent, opacity: serverName.trim() ? 1 : 0.5 }]}
                          onPress={() => {
                            if (serverName.trim()) createMutation.mutate(serverName.trim());
                          }}
                          disabled={!serverName.trim() || isMutating}
                        >
                          {createMutation.isPending ? (
                            <ActivityIndicator color="#fff" size="small" />
                          ) : (
                            <Text style={styles.submitBtnText}>Create Server</Text>
                          )}
                        </TouchableOpacity>
                      </>
                    ) : (
                      <>
                        <Text style={[styles.label, { color: mutedFg }]}>Invite code</Text>
                        <TextInput
                          style={[styles.input, { backgroundColor: colors.muted, color: colors.foreground, borderColor }]}
                          placeholder="abc123"
                          placeholderTextColor={mutedFg}
                          value={inviteCode}
                          onChangeText={setInviteCode}
                          autoCapitalize="none"
                          autoCorrect={false}
                          returnKeyType="done"
                          onSubmitEditing={() => {
                            if (inviteCode.trim()) joinMutation.mutate(inviteCode.trim());
                          }}
                        />
                        <TouchableOpacity
                          style={[styles.submitBtn, { backgroundColor: accent, opacity: inviteCode.trim() ? 1 : 0.5 }]}
                          onPress={() => {
                            if (inviteCode.trim()) joinMutation.mutate(inviteCode.trim());
                          }}
                          disabled={!inviteCode.trim() || isMutating}
                        >
                          {joinMutation.isPending ? (
                            <ActivityIndicator color="#fff" size="small" />
                          ) : (
                            <Text style={styles.submitBtnText}>Join Server</Text>
                          )}
                        </TouchableOpacity>
                      </>
                    )}
                  </ScrollView>
                </View>
              </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  rail: {
    width: RAIL_WIDTH,
    borderRightWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    flexShrink: 0,
  },
  pillRow: {
    flexDirection: "row",
    alignItems: "center",
    width: RAIL_WIDTH,
    marginBottom: 4,
  },
  pill: {
    width: 4,
    borderRadius: 2,
    marginRight: 4,
  },
  btn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
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
    marginVertical: 6,
  },
  serverInitials: {
    fontSize: 13,
    fontWeight: "700",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  kavWrapper: {
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    maxHeight: "70%",
    paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  tabRow: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    marginBottom: -StyleSheet.hairlineWidth,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  input: {
    height: 48,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    marginBottom: 16,
  },
  submitBtn: {
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  submitBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
});

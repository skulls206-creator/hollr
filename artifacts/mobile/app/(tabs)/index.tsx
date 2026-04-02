import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
  Modal,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { Avatar } from "@/components/Avatar";

interface Server {
  id: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  ownerId: string;
  inviteCode: string;
  memberCount: number;
}

export default function ServersTab() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "join">("create");
  const [serverName, setServerName] = useState("");
  const [inviteCode, setInviteCode] = useState("");

  const { data: servers = [], isLoading, refetch, isRefetching } = useQuery<Server[]>({
    queryKey: ["servers"],
    queryFn: () => api("/servers"),
  });

  const createMutation = useMutation({
    mutationFn: (name: string) =>
      api("/servers", { method: "POST", body: JSON.stringify({ name }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["servers"] });
      setModalVisible(false);
      setServerName("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: any) => {
      Alert.alert("Error", e.message || "Failed to create server");
    },
  });

  const joinMutation = useMutation({
    mutationFn: (code: string) =>
      api(`/invite/${code.trim()}/join`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["servers"] });
      setModalVisible(false);
      setInviteCode("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: any) => {
      Alert.alert("Error", e.message || "Invalid invite code");
    },
  });

  const handleCreate = () => {
    if (!serverName.trim()) return;
    createMutation.mutate(serverName.trim());
  };

  const handleJoin = () => {
    if (!inviteCode.trim()) return;
    joinMutation.mutate(inviteCode.trim());
  };

  const openModal = (mode: "create" | "join") => {
    setModalMode(mode);
    setServerName("");
    setInviteCode("");
    setModalVisible(true);
  };

  const s = createStyles(colors);

  const renderServer = useCallback(({ item }: { item: Server }) => (
    <TouchableOpacity
      style={s.serverRow}
      onPress={() => router.push({ pathname: "/server/[serverId]", params: { serverId: item.id } })}
      activeOpacity={0.7}
    >
      <Avatar
        avatarUrl={item.iconUrl}
        username={item.name}
        displayName={item.name}
        size={44}
      />
      <View style={s.serverInfo}>
        <Text style={s.serverName} numberOfLines={1}>{item.name}</Text>
        <Text style={s.serverMeta}>
          {item.memberCount} {item.memberCount === 1 ? "member" : "members"}
          {item.ownerId === user?.id ? " · Owner" : ""}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
    </TouchableOpacity>
  ), [colors, user?.id, s]);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Servers</Text>
        <TouchableOpacity
          style={s.addBtn}
          onPress={() => openModal("create")}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="add" size={24} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={s.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : servers.length === 0 ? (
        <View style={s.empty}>
          <View style={[s.emptyIcon, { backgroundColor: colors.muted }]}>
            <Ionicons name="grid-outline" size={36} color={colors.mutedForeground} />
          </View>
          <Text style={s.emptyTitle}>No servers yet</Text>
          <Text style={s.emptySubtitle}>Create a server or join one with an invite code</Text>
          <View style={s.emptyActions}>
            <TouchableOpacity style={s.emptyBtn} onPress={() => openModal("create")} activeOpacity={0.8}>
              <Ionicons name="add-circle" size={18} color={colors.primaryForeground} />
              <Text style={s.emptyBtnText}>Create Server</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.emptyBtn, { backgroundColor: colors.secondary }]}
              onPress={() => openModal("join")}
              activeOpacity={0.8}
            >
              <Ionicons name="log-in" size={18} color={colors.foreground} />
              <Text style={[s.emptyBtnText, { color: colors.foreground }]}>Join Server</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <FlatList
          data={servers}
          keyExtractor={item => item.id}
          renderItem={renderServer}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 84 }}
          ItemSeparatorComponent={() => <View style={s.separator} />}
          ListHeaderComponent={() => (
            <TouchableOpacity style={s.joinBtn} onPress={() => openModal("join")} activeOpacity={0.8}>
              <Ionicons name="log-in-outline" size={18} color={colors.primary} />
              <Text style={s.joinBtnText}>Join with invite code</Text>
            </TouchableOpacity>
          )}
        />
      )}

      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setModalVisible(false)}>
          <TouchableOpacity style={s.sheet} activeOpacity={1}>
            <View style={s.sheetHandle} />

            <View style={s.modeRow}>
              <TouchableOpacity
                style={[s.modeBtn, modalMode === "create" && { backgroundColor: colors.primary }]}
                onPress={() => setModalMode("create")}
              >
                <Text style={[s.modeBtnText, modalMode === "create" && { color: colors.primaryForeground }]}>
                  Create
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modeBtn, modalMode === "join" && { backgroundColor: colors.primary }]}
                onPress={() => setModalMode("join")}
              >
                <Text style={[s.modeBtnText, modalMode === "join" && { color: colors.primaryForeground }]}>
                  Join
                </Text>
              </TouchableOpacity>
            </View>

            {modalMode === "create" ? (
              <>
                <Text style={s.sheetTitle}>Create a Server</Text>
                <TextInput
                  style={s.sheetInput}
                  placeholder="Server name"
                  placeholderTextColor={colors.mutedForeground}
                  value={serverName}
                  onChangeText={setServerName}
                  autoFocus
                  returnKeyType="go"
                  onSubmitEditing={handleCreate}
                />
                <TouchableOpacity
                  style={[s.sheetBtn, createMutation.isPending && s.disabled]}
                  onPress={handleCreate}
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? (
                    <ActivityIndicator color={colors.primaryForeground} size="small" />
                  ) : (
                    <Text style={s.sheetBtnText}>Create Server</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={s.sheetTitle}>Join a Server</Text>
                <TextInput
                  style={s.sheetInput}
                  placeholder="Invite code"
                  placeholderTextColor={colors.mutedForeground}
                  value={inviteCode}
                  onChangeText={setInviteCode}
                  autoFocus
                  autoCapitalize="none"
                  returnKeyType="go"
                  onSubmitEditing={handleJoin}
                />
                <TouchableOpacity
                  style={[s.sheetBtn, joinMutation.isPending && s.disabled]}
                  onPress={handleJoin}
                  disabled={joinMutation.isPending}
                >
                  {joinMutation.isPending ? (
                    <ActivityIndicator color={colors.primaryForeground} size="small" />
                  ) : (
                    <Text style={s.sheetBtnText}>Join Server</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      fontFamily: "Inter_700Bold",
      fontSize: 22,
      color: colors.foreground,
      letterSpacing: -0.5,
    },
    addBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.muted,
      alignItems: "center",
      justifyContent: "center",
    },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    empty: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 32,
      gap: 12,
    },
    emptyIcon: {
      width: 72,
      height: 72,
      borderRadius: 36,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 4,
    },
    emptyTitle: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 18,
      color: colors.foreground,
    },
    emptySubtitle: {
      fontFamily: "Inter_400Regular",
      fontSize: 14,
      color: colors.mutedForeground,
      textAlign: "center",
    },
    emptyActions: { flexDirection: "row", gap: 10, marginTop: 8 },
    emptyBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    emptyBtnText: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 14,
      color: colors.primaryForeground,
    },
    serverRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 12,
    },
    serverInfo: { flex: 1 },
    serverName: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 15,
      color: colors.foreground,
    },
    serverMeta: {
      fontFamily: "Inter_400Regular",
      fontSize: 12,
      color: colors.mutedForeground,
      marginTop: 2,
    },
    separator: { height: 1, backgroundColor: colors.border, marginLeft: 72 },
    joinBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      margin: 12,
      padding: 12,
      backgroundColor: colors.primary + "18",
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.primary + "40",
    },
    joinBtnText: {
      fontFamily: "Inter_500Medium",
      fontSize: 14,
      color: colors.primary,
    },
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.6)",
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
      paddingBottom: 40,
      gap: 14,
    },
    sheetHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: "center",
      marginBottom: 4,
    },
    modeRow: {
      flexDirection: "row",
      backgroundColor: colors.muted,
      borderRadius: colors.radius,
      padding: 3,
    },
    modeBtn: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: colors.radius - 2,
      alignItems: "center",
    },
    modeBtnText: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 14,
      color: colors.mutedForeground,
    },
    sheetTitle: {
      fontFamily: "Inter_700Bold",
      fontSize: 18,
      color: colors.foreground,
    },
    sheetInput: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: colors.radius,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontFamily: "Inter_400Regular",
      fontSize: 15,
      color: colors.foreground,
    },
    sheetBtn: {
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      paddingVertical: 14,
      alignItems: "center",
    },
    sheetBtnText: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 15,
      color: colors.primaryForeground,
    },
    disabled: { opacity: 0.6 },
  });
}

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  Share,
  Clipboard,
} from "react-native";
import { router, useLocalSearchParams, Stack } from "expo-router";
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
  inviteCode: string;
  ownerId: string;
  memberCount: number;
}

interface Channel {
  id: string;
  name: string;
  type: string;
}

interface MemberUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  status: string;
}

interface Member {
  userId: string;
  role: string;
  joinedAt: string;
  user: MemberUser;
}

export default function ServerAdminScreen() {
  const { serverId } = useLocalSearchParams<{ serverId: string }>();
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [serverName, setServerName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [addingChannel, setAddingChannel] = useState(false);
  const [renamingChannelId, setRenamingChannelId] = useState<string | null>(null);
  const [renameChannelValue, setRenameChannelValue] = useState("");

  const { data: server, isLoading: serverLoading } = useQuery<Server>({
    queryKey: ["server", serverId],
    queryFn: () => api(`/servers/${serverId}`),
    enabled: !!serverId,
  });

  const { data: channels = [] } = useQuery<Channel[]>({
    queryKey: ["channels", serverId],
    queryFn: () => api(`/servers/${serverId}/channels`),
    enabled: !!serverId,
  });

  const { data: members = [] } = useQuery<Member[]>({
    queryKey: ["members", serverId],
    queryFn: () => api(`/servers/${serverId}/members`),
    enabled: !!serverId,
  });

  useEffect(() => {
    if (server) setServerName(server.name);
  }, [server]);

  const isOwner = user?.id === server?.ownerId;
  const myMember = members.find(m => m.userId === user?.id);
  const isAdmin = isOwner || myMember?.role === "admin";

  const updateServerMutation = useMutation({
    mutationFn: (data: { name?: string; description?: string }) =>
      api(`/servers/${serverId}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["server", serverId] });
      queryClient.invalidateQueries({ queryKey: ["servers"] });
      setEditingName(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const deleteServerMutation = useMutation({
    mutationFn: () => api(`/servers/${serverId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["servers"] });
      router.replace("/(tabs)");
    },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const addChannelMutation = useMutation({
    mutationFn: (name: string) =>
      api(`/servers/${serverId}/channels`, {
        method: "POST",
        body: JSON.stringify({ name, type: "text" }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channels", serverId] });
      setNewChannelName("");
      setAddingChannel(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const renameChannelMutation = useMutation({
    mutationFn: ({ channelId, name }: { channelId: string; name: string }) =>
      api(`/servers/${serverId}/channels/${channelId}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channels", serverId] });
      setRenamingChannelId(null);
      setRenameChannelValue("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const deleteChannelMutation = useMutation({
    mutationFn: (channelId: string) =>
      api(`/servers/${serverId}/channels/${channelId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channels", serverId] });
    },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const kickMemberMutation = useMutation({
    mutationFn: (userId: string) =>
      api(`/servers/${serverId}/members/${userId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members", serverId] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const transferOwnershipMutation = useMutation({
    mutationFn: (newOwnerId: string) =>
      api(`/servers/${serverId}`, {
        method: "PATCH",
        body: JSON.stringify({ ownerId: newOwnerId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["server", serverId] });
      queryClient.invalidateQueries({ queryKey: ["members", serverId] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Ownership Transferred", "The server ownership has been transferred.");
    },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const regenerateInviteMutation = useMutation({
    mutationFn: () => api(`/servers/${serverId}/invite`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["server", serverId] }),
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const handleDeleteServer = () => {
    Alert.alert(
      "Delete Server",
      `Are you sure you want to delete "${server?.name}"? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteServerMutation.mutate(),
        },
      ]
    );
  };

  const handleKick = (member: Member) => {
    const name = member.user.displayName || member.user.username;
    Alert.alert(
      "Remove Member",
      `Remove ${name} from this server?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => kickMemberMutation.mutate(member.userId),
        },
      ]
    );
  };

  const handleTransferOwnership = (member: Member) => {
    const name = member.user.displayName || member.user.username;
    Alert.alert(
      "Transfer Ownership",
      `Transfer server ownership to ${name}? You will become a regular member.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Transfer",
          style: "destructive",
          onPress: () => transferOwnershipMutation.mutate(member.userId),
        },
      ]
    );
  };

  const handleCopyInvite = () => {
    if (!server?.inviteCode) return;
    Clipboard.setString(server.inviteCode);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert("Copied", "Invite code copied to clipboard!");
  };

  const handleShareInvite = async () => {
    if (!server?.inviteCode) return;
    await Share.share({
      message: `Join ${server.name} on hollr! Use invite code: ${server.inviteCode}`,
    });
  };

  const s = createStyles(colors);
  const textChannels = channels.filter(c => c.type === "text");

  if (serverLoading) {
    return (
      <View style={[s.root, s.center, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={s.header}>
        <TouchableOpacity
          style={s.closeBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Server Settings</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      >
        <View style={s.section}>
          <Text style={s.sectionTitle}>Server Info</Text>
          <View style={s.card}>
            {editingName ? (
              <View style={s.editRow}>
                <TextInput
                  style={s.nameInput}
                  value={serverName}
                  onChangeText={setServerName}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={() => updateServerMutation.mutate({ name: serverName })}
                  maxLength={50}
                />
                <TouchableOpacity
                  style={s.saveBtn}
                  onPress={() => updateServerMutation.mutate({ name: serverName })}
                  disabled={updateServerMutation.isPending}
                >
                  {updateServerMutation.isPending ? (
                    <ActivityIndicator color={colors.primaryForeground} size="small" />
                  ) : (
                    <Ionicons name="checkmark" size={18} color={colors.primaryForeground} />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.cancelBtn}
                  onPress={() => { setEditingName(false); setServerName(server?.name ?? ""); }}
                >
                  <Ionicons name="close" size={18} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={s.settingRow} onPress={() => setEditingName(true)}>
                <Ionicons name="text" size={18} color={colors.mutedForeground} />
                <View style={{ flex: 1 }}>
                  <Text style={s.settingLabel}>Server Name</Text>
                  <Text style={s.settingValue}>{server?.name}</Text>
                </View>
                <Ionicons name="pencil" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Invite Link</Text>
          <View style={s.card}>
            <View style={s.inviteRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.inviteCode}>{server?.inviteCode ?? "—"}</Text>
                <Text style={s.inviteHint}>Share this code for others to join</Text>
              </View>
              <TouchableOpacity style={s.iconBtn} onPress={handleCopyInvite}>
                <Ionicons name="copy-outline" size={20} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity style={s.iconBtn} onPress={handleShareInvite}>
                <Ionicons name="share-outline" size={20} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={s.iconBtn}
                onPress={() => regenerateInviteMutation.mutate()}
                disabled={regenerateInviteMutation.isPending}
              >
                {regenerateInviteMutation.isPending ? (
                  <ActivityIndicator color={colors.primary} size="small" />
                ) : (
                  <Ionicons name="refresh" size={20} color={colors.primary} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={s.section}>
          <View style={s.sectionHeaderRow}>
            <Text style={s.sectionTitle}>Channels ({textChannels.length})</Text>
            <TouchableOpacity style={s.addBtn} onPress={() => setAddingChannel(true)}>
              <Ionicons name="add" size={18} color={colors.primary} />
            </TouchableOpacity>
          </View>

          {addingChannel && (
            <View style={s.addChannelRow}>
              <TextInput
                style={s.channelInput}
                placeholder="channel-name"
                placeholderTextColor={colors.mutedForeground}
                value={newChannelName}
                onChangeText={setNewChannelName}
                autoFocus
                autoCapitalize="none"
                returnKeyType="go"
                onSubmitEditing={() => {
                  if (newChannelName.trim()) addChannelMutation.mutate(newChannelName.trim().toLowerCase().replace(/\s+/g, "-"));
                }}
              />
              <TouchableOpacity
                style={s.addChannelBtn}
                onPress={() => {
                  if (newChannelName.trim()) addChannelMutation.mutate(newChannelName.trim().toLowerCase().replace(/\s+/g, "-"));
                }}
                disabled={addChannelMutation.isPending}
              >
                {addChannelMutation.isPending ? (
                  <ActivityIndicator color={colors.primaryForeground} size="small" />
                ) : (
                  <Ionicons name="checkmark" size={18} color={colors.primaryForeground} />
                )}
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelSmallBtn} onPress={() => setAddingChannel(false)}>
                <Ionicons name="close" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
          )}

          <View style={s.card}>
            {textChannels.length === 0 ? (
              <Text style={s.emptyText}>No text channels yet</Text>
            ) : (
              textChannels.map((ch, idx) => (
                <View key={ch.id}>
                  {idx > 0 && <View style={s.sep} />}
                  {renamingChannelId === ch.id ? (
                    <View style={s.addChannelRow}>
                      <TextInput
                        style={s.channelInput}
                        value={renameChannelValue}
                        onChangeText={setRenameChannelValue}
                        autoFocus
                        autoCapitalize="none"
                        returnKeyType="done"
                        onSubmitEditing={() => {
                          if (renameChannelValue.trim()) renameChannelMutation.mutate({ channelId: ch.id, name: renameChannelValue.trim().toLowerCase().replace(/\s+/g, "-") });
                        }}
                      />
                      <TouchableOpacity
                        style={s.addChannelBtn}
                        onPress={() => {
                          if (renameChannelValue.trim()) renameChannelMutation.mutate({ channelId: ch.id, name: renameChannelValue.trim().toLowerCase().replace(/\s+/g, "-") });
                        }}
                        disabled={renameChannelMutation.isPending}
                      >
                        {renameChannelMutation.isPending ? (
                          <ActivityIndicator color={colors.primaryForeground} size="small" />
                        ) : (
                          <Ionicons name="checkmark" size={18} color={colors.primaryForeground} />
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity style={s.cancelSmallBtn} onPress={() => setRenamingChannelId(null)}>
                        <Ionicons name="close" size={18} color={colors.mutedForeground} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={s.channelRow}>
                      <Ionicons name="text" size={16} color={colors.mutedForeground} />
                      <Text style={s.channelName}>{ch.name}</Text>
                      <TouchableOpacity
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        onPress={() => { setRenamingChannelId(ch.id); setRenameChannelValue(ch.name); }}
                        style={{ marginRight: 6 }}
                      >
                        <Ionicons name="pencil-outline" size={16} color={colors.mutedForeground} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        onPress={() => {
                          Alert.alert("Delete Channel", `Delete #${ch.name}?`, [
                            { text: "Cancel", style: "cancel" },
                            { text: "Delete", style: "destructive", onPress: () => deleteChannelMutation.mutate(ch.id) },
                          ]);
                        }}
                      >
                        <Ionicons name="trash-outline" size={16} color={colors.destructive} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))
            )}
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Members ({members.length})</Text>
          <View style={s.card}>
            {members.length === 0 ? (
              <Text style={s.emptyText}>No members</Text>
            ) : (
              members.map((m, idx) => (
                <View key={m.userId}>
                  {idx > 0 && <View style={s.sep} />}
                  <View style={s.memberRow}>
                    <Avatar
                      avatarUrl={m.user.avatarUrl}
                      username={m.user.username}
                      displayName={m.user.displayName}
                      size={36}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={s.memberName}>{m.user.displayName || m.user.username}</Text>
                      <Text style={s.memberRole}>{m.role}</Text>
                    </View>
                    {m.userId !== user?.id && m.role !== "owner" && isAdmin && (
                      <View style={{ flexDirection: "row", gap: 6 }}>
                        {isOwner && (
                          <TouchableOpacity
                            style={s.transferBtn}
                            onPress={() => handleTransferOwnership(m)}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          >
                            <Ionicons name="shield-outline" size={18} color={colors.primary} />
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          style={s.kickBtn}
                          onPress={() => handleKick(m)}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Ionicons name="person-remove-outline" size={18} color={colors.destructive} />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>
        </View>

        {isOwner && (
          <View style={[s.section, { marginTop: 8 }]}>
            <Text style={s.sectionTitle}>Danger Zone</Text>
            <TouchableOpacity
              style={s.deleteBtn}
              onPress={handleDeleteServer}
              disabled={deleteServerMutation.isPending}
              activeOpacity={0.8}
            >
              {deleteServerMutation.isPending ? (
                <ActivityIndicator color={colors.destructive} size="small" />
              ) : (
                <>
                  <Ionicons name="trash" size={18} color={colors.destructive} />
                  <Text style={s.deleteText}>Delete Server</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(colors: {
  background: string; foreground: string; card: string; muted: string; mutedForeground: string;
  primary: string; primaryForeground: string; border: string; destructive: string; radius: number;
}) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    center: { alignItems: "center", justifyContent: "center" },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    closeBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitle: {
      fontFamily: "Inter_700Bold",
      fontSize: 17,
      color: colors.foreground,
    },
    section: {
      paddingHorizontal: 16,
      paddingTop: 20,
      gap: 10,
    },
    sectionHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    sectionTitle: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 12,
      color: colors.mutedForeground,
      letterSpacing: 0.8,
      textTransform: "uppercase",
    },
    addBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.primary + "20",
      alignItems: "center",
      justifyContent: "center",
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    settingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 14,
    },
    settingLabel: {
      fontFamily: "Inter_400Regular",
      fontSize: 12,
      color: colors.mutedForeground,
    },
    settingValue: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 15,
      color: colors.foreground,
    },
    editRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      padding: 10,
    },
    nameInput: {
      flex: 1,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: colors.radius,
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontFamily: "Inter_600SemiBold",
      fontSize: 15,
      color: colors.foreground,
    },
    saveBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    cancelBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.muted,
      alignItems: "center",
      justifyContent: "center",
    },
    inviteRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      padding: 14,
    },
    inviteCode: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 17,
      color: colors.primary,
      letterSpacing: 2,
    },
    inviteHint: {
      fontFamily: "Inter_400Regular",
      fontSize: 12,
      color: colors.mutedForeground,
      marginTop: 2,
    },
    iconBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.primary + "18",
      alignItems: "center",
      justifyContent: "center",
    },
    addChannelRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 4,
    },
    channelInput: {
      flex: 1,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: colors.radius,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontFamily: "Inter_400Regular",
      fontSize: 14,
      color: colors.foreground,
    },
    addChannelBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    cancelSmallBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.muted,
      alignItems: "center",
      justifyContent: "center",
    },
    channelRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      padding: 12,
    },
    channelName: {
      flex: 1,
      fontFamily: "Inter_500Medium",
      fontSize: 14,
      color: colors.foreground,
    },
    memberRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      padding: 12,
    },
    memberName: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 14,
      color: colors.foreground,
    },
    memberRole: {
      fontFamily: "Inter_400Regular",
      fontSize: 12,
      color: colors.mutedForeground,
      textTransform: "capitalize",
    },
    transferBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.primary + "18",
      alignItems: "center",
      justifyContent: "center",
    },
    kickBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.destructive + "18",
      alignItems: "center",
      justifyContent: "center",
    },
    sep: { height: 1, backgroundColor: colors.border, marginLeft: 12 },
    emptyText: {
      fontFamily: "Inter_400Regular",
      fontSize: 14,
      color: colors.mutedForeground,
      padding: 14,
      textAlign: "center",
    },
    deleteBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: colors.destructive + "18",
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.destructive + "40",
      padding: 14,
    },
    deleteText: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 15,
      color: colors.destructive,
    },
  });
}

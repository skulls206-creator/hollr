import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Modal,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { useRealtime } from "@/contexts/RealtimeContext";
import { api } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { getDmSeenMap } from "@/lib/dm-seen-tracker";

interface DmParticipant {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  status: string;
}

interface DmThread {
  id: string;
  participants: DmParticipant[];
  lastMessage: {
    content: string;
    createdAt: string;
    authorId: string;
  } | null;
  createdAt: string;
}

interface UserLookup {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  status: string;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString();
}

export default function DmsTab() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { subscribe } = useRealtime();

  const [newDmVisible, setNewDmVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [lookupResult, setLookupResult] = useState<UserLookup | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [seenMap, setSeenMap] = useState<Record<string, string>>({});

  useFocusEffect(
    useCallback(() => {
      getDmSeenMap().then(setSeenMap).catch(() => {});
    }, [])
  );

  const { data: threads = [], isLoading, refetch, isRefetching } = useQuery<DmThread[]>({
    queryKey: ["dm-threads"],
    queryFn: () => api("/dms"),
    refetchInterval: 30000,
  });

  useEffect(() => {
    const unsub = subscribe("PRESENCE_UPDATE", (payload: { userId: string; status: string }) => {
      queryClient.setQueryData(["dm-threads"], (old: DmThread[] = []) =>
        old.map(thread => ({
          ...thread,
          participants: thread.participants.map(p =>
            p.id === payload.userId ? { ...p, status: payload.status } : p
          ),
        }))
      );
    });
    return unsub;
  }, [subscribe, queryClient]);

  const startDmMutation = useMutation({
    mutationFn: (userId: string) =>
      api<DmThread>("/dms", { method: "POST", body: JSON.stringify({ userId }) }),
    onSuccess: (thread: DmThread) => {
      queryClient.invalidateQueries({ queryKey: ["dm-threads"] });
      setNewDmVisible(false);
      setSearchQuery("");
      const other = thread.participants?.find(p => p.id !== user?.id) ?? thread.participants?.[0];
      setLookupResult(null);
      router.push({
        pathname: "/dm/[threadId]",
        params: {
          threadId: thread.id,
          otherUserId: other?.id ?? "",
          otherUserName: other?.username ?? "",
          otherDisplayName: other?.displayName ?? "",
          otherAvatarUrl: other?.avatarUrl ?? "",
          otherStatus: other?.status ?? "offline",
        },
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    onError: (e: Error) => {
      Alert.alert("Error", e.message || "Failed to start DM");
    },
  });

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setLookupError(null);
    setLookupResult(null);
    try {
      const user = await api<UserLookup>(`/users/lookup?q=${encodeURIComponent(searchQuery.trim())}`);
      setLookupResult(user);
    } catch (e) {
      setLookupError((e instanceof Error ? e.message : null) || "User not found");
    } finally {
      setSearching(false);
    }
  };

  const s = createStyles(colors);

  const renderThread = useCallback(({ item }: { item: DmThread }) => {
    const other = item.participants?.find(p => p.id !== user?.id) ?? item.participants?.[0];
    const isOnline = other?.status === "online";
    const lastMsgId = item.lastMessage ? `${item.id}:${item.lastMessage.createdAt}` : null;
    const hasUnread = !!(lastMsgId && seenMap[item.id] !== lastMsgId);
    return (
      <TouchableOpacity
        style={s.threadRow}
        onPress={() => router.push({
          pathname: "/dm/[threadId]",
          params: {
            threadId: item.id,
            otherUserId: other?.id ?? "",
            otherUserName: other?.username ?? "",
            otherDisplayName: other?.displayName ?? "",
            otherAvatarUrl: other?.avatarUrl ?? "",
            otherStatus: other?.status ?? "offline",
          },
        })}
        activeOpacity={0.7}
      >
        <Avatar
          avatarUrl={other?.avatarUrl ?? null}
          username={other?.username ?? ""}
          displayName={other?.displayName ?? ""}
          size={44}
          online={isOnline}
        />
        <View style={s.threadInfo}>
          <View style={s.threadTopRow}>
            <Text style={[s.threadName, hasUnread && s.threadNameUnread]} numberOfLines={1}>
              {other?.displayName || other?.username}
            </Text>
            <View style={s.threadTimeRow}>
              {item.lastMessage && (
                <Text style={s.threadTime}>{timeAgo(item.lastMessage.createdAt)}</Text>
              )}
              {hasUnread && (
                <View style={[s.unreadDot, { backgroundColor: colors.primary }]} />
              )}
            </View>
          </View>
          <Text style={[s.threadPreview, hasUnread && s.threadPreviewUnread]} numberOfLines={1}>
            {item.lastMessage?.content ?? "No messages yet"}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }, [colors, user?.id, s, seenMap]);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Messages</Text>
        <TouchableOpacity
          style={s.addBtn}
          onPress={() => {
            setNewDmVisible(true);
            setSearchQuery("");
            setLookupResult(null);
            setLookupError(null);
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="create-outline" size={22} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={s.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : threads.length === 0 ? (
        <View style={s.empty}>
          <View style={[s.emptyIcon, { backgroundColor: colors.muted }]}>
            <Ionicons name="chatbubbles-outline" size={36} color={colors.mutedForeground} />
          </View>
          <Text style={s.emptyTitle}>No messages yet</Text>
          <Text style={s.emptySubtitle}>Start a conversation by searching for a user</Text>
          <TouchableOpacity
            style={s.newDmBtn}
            onPress={() => {
              setNewDmVisible(true);
              setSearchQuery("");
              setLookupResult(null);
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="create" size={16} color={colors.primaryForeground} />
            <Text style={s.newDmBtnText}>New Message</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={threads}
          keyExtractor={item => item.id}
          renderItem={renderThread}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 84 }}
          ItemSeparatorComponent={() => <View style={s.separator} />}
        />
      )}

      <Modal
        visible={newDmVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setNewDmVisible(false)}
      >
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setNewDmVisible(false)}>
          <TouchableOpacity style={s.sheet} activeOpacity={1}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>New Message</Text>

            <View style={s.searchRow}>
              <TextInput
                style={s.searchInput}
                placeholder="Search by username or email"
                placeholderTextColor={colors.mutedForeground}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
                autoCapitalize="none"
                returnKeyType="search"
                onSubmitEditing={handleSearch}
              />
              <TouchableOpacity
                style={s.searchBtn}
                onPress={handleSearch}
                disabled={searching}
              >
                {searching ? (
                  <ActivityIndicator color={colors.primaryForeground} size="small" />
                ) : (
                  <Ionicons name="search" size={18} color={colors.primaryForeground} />
                )}
              </TouchableOpacity>
            </View>

            {lookupError && (
              <View style={s.errorBox}>
                <Ionicons name="alert-circle" size={14} color={colors.destructive} />
                <Text style={[s.errorText, { color: colors.destructive }]}>{lookupError}</Text>
              </View>
            )}

            {lookupResult && (
              <TouchableOpacity
                style={s.userResult}
                onPress={() => startDmMutation.mutate(lookupResult.id)}
                activeOpacity={0.8}
              >
                <Avatar
                  avatarUrl={lookupResult.avatarUrl}
                  username={lookupResult.username}
                  displayName={lookupResult.displayName}
                  size={40}
                  online={lookupResult.status === "online"}
                />
                <View style={{ flex: 1 }}>
                  <Text style={s.userResultName}>
                    {lookupResult.displayName || lookupResult.username}
                  </Text>
                  <Text style={s.userResultUsername}>@{lookupResult.username}</Text>
                </View>
                {startDmMutation.isPending ? (
                  <ActivityIndicator color={colors.primary} size="small" />
                ) : (
                  <Ionicons name="arrow-forward-circle" size={26} color={colors.primary} />
                )}
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function createStyles(colors: {
  background: string; foreground: string; muted: string; mutedForeground: string;
  primary: string; primaryForeground: string; secondary: string;
  border: string; card: string; radius: number; destructive?: string;
}) {
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
    newDmBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      paddingHorizontal: 20,
      paddingVertical: 10,
      marginTop: 8,
    },
    newDmBtnText: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 14,
      color: colors.primaryForeground,
    },
    threadRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 12,
    },
    threadInfo: { flex: 1 },
    threadTopRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    threadName: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 15,
      color: colors.foreground,
      flex: 1,
    },
    threadNameUnread: {
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    threadTimeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    threadTime: {
      fontFamily: "Inter_400Regular",
      fontSize: 11,
      color: colors.mutedForeground,
    },
    unreadDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    threadPreview: {
      fontFamily: "Inter_400Regular",
      fontSize: 13,
      color: colors.mutedForeground,
      marginTop: 2,
    },
    threadPreviewUnread: {
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
    separator: { height: 1, backgroundColor: colors.border, marginLeft: 72 },
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
    sheetTitle: {
      fontFamily: "Inter_700Bold",
      fontSize: 18,
      color: colors.foreground,
    },
    searchRow: {
      flexDirection: "row",
      gap: 10,
    },
    searchInput: {
      flex: 1,
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
    searchBtn: {
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      width: 48,
      alignItems: "center",
      justifyContent: "center",
    },
    errorBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.destructive + "18",
      borderRadius: colors.radius,
      padding: 10,
    },
    errorText: {
      fontFamily: "Inter_400Regular",
      fontSize: 13,
      flex: 1,
    },
    userResult: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 12,
      backgroundColor: colors.muted,
      borderRadius: colors.radius,
    },
    userResultName: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 15,
      color: colors.foreground,
    },
    userResultUsername: {
      fontFamily: "Inter_400Regular",
      fontSize: 13,
      color: colors.mutedForeground,
    },
  });
}

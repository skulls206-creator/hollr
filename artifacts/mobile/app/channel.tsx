import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActionSheetIOS,
  Pressable,
} from "react-native";
import { router, useLocalSearchParams, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { useRealtime } from "@/contexts/RealtimeContext";
import { useNav } from "@/contexts/NavContext";
import { api } from "@/lib/api";
import { send as wsSend } from "@/lib/ws";
import { Avatar } from "@/components/Avatar";
import { KhurkSupporterBadge } from "@/components/KhurkSupporterBadge";

interface MessageAuthor {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  status: string;
  isSupporter?: boolean;
}

interface Reaction {
  emojiId: string;
  count: number;
  reactedByCurrentUser: boolean;
}

interface Message {
  id: string;
  content: string;
  authorId: string;
  author: MessageAuthor;
  edited: boolean;
  deleted: boolean;
  reactions: Reaction[];
  createdAt: string;
  updatedAt: string;
}

const COMMON_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "🎉", "✅"];

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function ChannelScreen() {
  const { channelId, channelName, serverId, serverName } = useLocalSearchParams<{
    channelId: string;
    channelName: string;
    serverId: string;
    serverName: string;
  }>();
  const { colors } = useTheme();
  const { user } = useAuth();
  const { subscribe } = useRealtime();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { setActiveSection, setActiveServerId } = useNav();

  useEffect(() => {
    if (serverId) {
      setActiveSection("server");
      setActiveServerId(serverId);
    }
  }, [serverId, setActiveSection, setActiveServerId]);

  const listRef = useRef<FlatList>(null);

  const [content, setContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [emojiTargetId, setEmojiTargetId] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const lastTypingSent = useRef(0);

  const { data: messages = [], isLoading } = useQuery<Message[]>({
    queryKey: ["messages", channelId],
    queryFn: async () => {
      const data: Message[] = await api(`/channels/${channelId}/messages?limit=50`);
      if (data.length < 50) setHasMore(false);
      return data;
    },
    enabled: !!channelId,
  });

  useEffect(() => {
    if (!channelId || messages.length === 0) return;
    api(`/channels/${channelId}/read`, { method: "POST" }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ["server-unread"] });
  }, [channelId, messages.length, queryClient]);

  const loadMore = async () => {
    if (!hasMore || loadingMore || messages.length === 0) return;
    setLoadingMore(true);
    try {
      const oldest = [...messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
      const older: Message[] = await api(`/channels/${channelId}/messages?limit=50&beforeCreatedAt=${encodeURIComponent(oldest.createdAt)}`);
      if (older.length < 50) setHasMore(false);
      queryClient.setQueryData(["messages", channelId], (old: Message[] = []) => {
        const ids = new Set(old.map(m => m.id));
        return [...old, ...older.filter(m => !ids.has(m.id))];
      });
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    return () => {
      typingTimers.current.forEach(t => clearTimeout(t));
      typingTimers.current.clear();
    };
  }, []);

  useEffect(() => {
    const unsubs = [
      subscribe("MESSAGE_CREATE", (payload: { channelId?: string; id: string } & Message) => {
        if (payload.channelId !== channelId) return;
        queryClient.setQueryData(["messages", channelId], (old: Message[] = []) => {
          if (old.find(m => m.id === payload.id)) return old;
          return [...old, payload];
        });
      }),
      subscribe("MESSAGE_UPDATE", (payload: { channelId?: string; id: string } & Partial<Message>) => {
        if (payload.channelId !== channelId) return;
        if (payload.deleted) {
          queryClient.setQueryData(["messages", channelId], (old: Message[] = []) =>
            old.filter(m => m.id !== payload.id)
          );
        } else {
          queryClient.setQueryData(["messages", channelId], (old: Message[] = []) =>
            old.map(m => m.id === payload.id ? { ...m, ...payload } : m)
          );
        }
      }),
      subscribe("MESSAGE_DELETE", (payload: { channelId?: string; id: string }) => {
        if (payload.channelId !== channelId) return;
        queryClient.setQueryData(["messages", channelId], (old: Message[] = []) =>
          old.filter(m => m.id !== payload.id)
        );
      }),
      subscribe("TYPING", (payload: { channelId?: string; userId: string }) => {
        if (payload.channelId !== channelId) return;
        if (payload.userId === user?.id) return;
        setTypingUsers(prev => prev.includes(payload.userId) ? prev : [...prev, payload.userId]);
        const existing = typingTimers.current.get(payload.userId);
        if (existing) clearTimeout(existing);
        const timer = setTimeout(() => {
          setTypingUsers(prev => prev.filter(id => id !== payload.userId));
          typingTimers.current.delete(payload.userId);
        }, 3000);
        typingTimers.current.set(payload.userId, timer);
      }),
    ];
    return () => unsubs.forEach(u => u());
  }, [channelId, subscribe, queryClient, user?.id]);

  const sendMutation = useMutation({
    mutationFn: (text: string) =>
      api(`/channels/${channelId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: text }),
      }),
    onSuccess: () => {
      setContent("");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const editMutation = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      api(`/channels/${channelId}/messages/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ content: text }),
      }),
    onSuccess: () => {
      setEditingId(null);
      setEditContent("");
    },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      api(`/channels/${channelId}/messages/${id}`, { method: "DELETE" }),
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const reactMutation = useMutation({
    mutationFn: ({ id, emoji }: { id: string; emoji: string }) =>
      api(`/channels/${channelId}/messages/${id}/reactions/${encodeURIComponent(emoji)}`, {
        method: "PUT",
      }),
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const handleSend = () => {
    if (!content.trim()) return;
    sendMutation.mutate(content.trim());
  };

  const handleLongPress = (msg: Message) => {
    const isOwn = msg.authorId === user?.id;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setEmojiTargetId(msg.id);

    if (Platform.OS === "ios" && isOwn) {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Cancel", "Edit", "Delete"],
          cancelButtonIndex: 0,
          destructiveButtonIndex: 2,
        },
        (idx) => {
          if (idx === 1) {
            setEditingId(msg.id);
            setEditContent(msg.content);
          } else if (idx === 2) {
            Alert.alert("Delete Message", "Are you sure?", [
              { text: "Cancel", style: "cancel" },
              { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(msg.id) },
            ]);
          }
          setEmojiTargetId(null);
        }
      );
    } else if (isOwn) {
      Alert.alert("Message Options", "", [
        { text: "Edit", onPress: () => { setEditingId(msg.id); setEditContent(msg.content); setEmojiTargetId(null); } },
        { text: "Delete", style: "destructive", onPress: () => { deleteMutation.mutate(msg.id); setEmojiTargetId(null); } },
        { text: "Cancel", style: "cancel", onPress: () => setEmojiTargetId(null) },
      ]);
    }
  };

  const s = createStyles(colors);

  const sorted = [...messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const reversed = [...sorted].reverse();

  const renderMessage = useCallback(({ item, index }: { item: Message; index: number }) => {
    const isOwn = item.authorId === user?.id;
    const prevMsg = reversed[index + 1];
    const nextMsg = reversed[index - 1];
    const isFirst = !prevMsg || prevMsg.authorId !== item.authorId;
    const isLast = !nextMsg || nextMsg.authorId !== item.authorId;
    const showDate = isFirst && (!prevMsg || formatDate(prevMsg.createdAt) !== formatDate(item.createdAt));
    const showAvatar = !isOwn && isLast;
    const showName = !isOwn && isFirst;
    const isSupporter = !!item.author?.isSupporter;
    const glowStyle = isSupporter ? {
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.55,
      shadowRadius: 10,
      elevation: 6,
    } : undefined;

    return (
      <View>
        {showDate && (
          <View style={s.dateSep}>
            <View style={s.dateLine} />
            <Text style={s.dateText}>{formatDate(item.createdAt)}</Text>
            <View style={s.dateLine} />
          </View>
        )}
        <Pressable
          onLongPress={() => handleLongPress(item)}
          delayLongPress={400}
          style={[s.msgRow, isOwn ? s.msgRowOwn : s.msgRowOther]}
        >
          {!isOwn && (
            <View style={[s.avatarPlaceholder, showAvatar && { width: 32 }]}>
              {showAvatar && (
                <Avatar
                  avatarUrl={item.author?.avatarUrl ?? null}
                  username={item.author?.username ?? ""}
                  displayName={item.author?.displayName ?? ""}
                  size={32}
                />
              )}
            </View>
          )}

          <View style={[s.bubbleCol, isOwn && s.bubbleColOwn]}>
            {showName && (
              <View style={s.authorRow}>
                <Text style={s.authorName}>
                  {item.author?.displayName || item.author?.username}
                </Text>
                {isSupporter && <KhurkSupporterBadge size={13} />}
              </View>
            )}
            {isOwn && isFirst && isSupporter && (
              <View style={[s.authorRow, s.authorRowOwn]}>
                <KhurkSupporterBadge size={13} />
              </View>
            )}
            {editingId === item.id ? (
              <View style={[s.bubble, s.editBubble]}>
                <TextInput
                  style={[s.editInput, { color: colors.foreground }]}
                  value={editContent}
                  onChangeText={setEditContent}
                  multiline
                  autoFocus
                />
                <View style={s.editActions}>
                  <TouchableOpacity
                    style={s.editSave}
                    onPress={() => editMutation.mutate({ id: item.id, text: editContent })}
                  >
                    <Text style={[s.editSaveText, { color: colors.primaryForeground }]}>Save</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.editCancel}
                    onPress={() => { setEditingId(null); setEditContent(""); }}
                  >
                    <Text style={[s.editCancelText, { color: colors.mutedForeground }]}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View
                style={[
                  s.bubble,
                  isOwn
                    ? [s.bubbleOwn, {
                        borderTopRightRadius: isFirst ? 4 : 16,
                        borderBottomRightRadius: isLast ? 4 : 16,
                      }]
                    : [s.bubbleOther, {
                        borderTopLeftRadius: isFirst ? 4 : 16,
                        borderBottomLeftRadius: isLast ? 4 : 16,
                      }],
                  glowStyle,
                ]}
              >
                <Text style={[s.msgText, isOwn && { color: colors.primaryForeground }]}>
                  {item.content}
                </Text>
                {item.edited && (
                  <Text style={[s.editedTag, isOwn && { color: colors.primaryForeground + "99" }]}>
                    edited
                  </Text>
                )}
              </View>
            )}

            <View style={[s.metaRow, isOwn && s.metaRowOwn]}>
              {(item.reactions ?? []).filter(r => r.count > 0).map(r => (
                <TouchableOpacity
                  key={r.emojiId}
                  style={[
                    s.reactionPill,
                    r.reactedByCurrentUser && { borderColor: colors.primary, backgroundColor: colors.primary + "20" },
                  ]}
                  onPress={() => reactMutation.mutate({ id: item.id, emoji: r.emojiId })}
                >
                  <Text style={s.reactionEmoji}>{r.emojiId}</Text>
                  <Text style={s.reactionCount}>{r.count}</Text>
                </TouchableOpacity>
              ))}
              {emojiTargetId === item.id && (
                <View style={s.emojiBar}>
                  {COMMON_EMOJIS.map(e => (
                    <TouchableOpacity
                      key={e}
                      style={s.emojiBtn}
                      onPress={() => { reactMutation.mutate({ id: item.id, emoji: e }); setEmojiTargetId(null); }}
                    >
                      <Text style={s.emojiText}>{e}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity style={s.emojiBtn} onPress={() => setEmojiTargetId(null)}>
                    <Ionicons name="close" size={14} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {isLast && (
              <Text style={[s.msgTime, isOwn && s.msgTimeOwn]}>
                {formatTime(item.createdAt)}
              </Text>
            )}
          </View>
        </Pressable>
      </View>
    );
  }, [user?.id, colors, editingId, editContent, emojiTargetId, s, reversed, handleLongPress, editMutation, reactMutation]);

  return (
    <View style={[s.root, { paddingBottom: insets.bottom }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[s.header, { paddingTop: insets.top }]}>
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.channelTitle} numberOfLines={1}>#{channelName}</Text>
          <Text style={s.serverTitle} numberOfLines={1}>{serverName}</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={s.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={reversed}
          keyExtractor={item => item.id}
          renderItem={renderMessage}
          inverted
          contentContainerStyle={[s.listContent, { paddingTop: 12, paddingBottom: 8 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={loadingMore ? () => (
            <ActivityIndicator color={colors.primary} style={{ padding: 12 }} />
          ) : null}
          ListEmptyComponent={() => (
            <View style={s.emptyState}>
              <Ionicons name="chatbubbles-outline" size={40} color={colors.mutedForeground} />
              <Text style={s.emptyText}>No messages yet</Text>
              <Text style={s.emptySubText}>Be the first to say something in #{channelName}</Text>
            </View>
          )}
        />
      )}

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
        {typingUsers.length > 0 && (
          <View style={s.typingBar}>
            <Text style={s.typingText}>{typingUsers.length === 1 ? "Someone is" : `${typingUsers.length} people are`} typing...</Text>
          </View>
        )}
        <View style={s.inputBar}>
          <TextInput
            style={s.textInput}
            placeholder={`Message #${channelName}`}
            placeholderTextColor={colors.mutedForeground}
            value={content}
            onChangeText={(text) => {
              setContent(text);
              const now = Date.now();
              if (now - lastTypingSent.current > 2000 && text.length > 0) {
                lastTypingSent.current = now;
                wsSend({ type: "TYPING_START", payload: { channelId } });
              }
            }}
            multiline
            maxLength={2000}
            returnKeyType="default"
          />
          <TouchableOpacity
            style={[s.sendBtn, (!content.trim() || sendMutation.isPending) && s.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!content.trim() || sendMutation.isPending}
          >
            {sendMutation.isPending ? (
              <ActivityIndicator color={colors.primaryForeground} size="small" />
            ) : (
              <Ionicons name="arrow-up" size={18} color={colors.primaryForeground} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function createStyles(colors: {
  background: string; foreground: string; muted: string; mutedForeground: string;
  primary: string; primaryForeground: string; border: string; card: string;
  radius: number; destructive?: string;
}) {
  return StyleSheet.create({
    typingBar: {
      paddingHorizontal: 16,
      paddingVertical: 4,
      backgroundColor: colors.background,
    },
    typingText: {
      fontFamily: "Inter_400Regular",
      fontSize: 12,
      color: colors.mutedForeground,
      fontStyle: "italic",
    },
    root: { flex: 1, backgroundColor: colors.background },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.background,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
    },
    channelTitle: {
      fontFamily: "Inter_700Bold",
      fontSize: 16,
      color: colors.foreground,
    },
    serverTitle: {
      fontFamily: "Inter_400Regular",
      fontSize: 11,
      color: colors.mutedForeground,
    },
    listContent: { paddingHorizontal: 4 },
    msgRow: {
      flexDirection: "row",
      paddingHorizontal: 12,
      marginBottom: 2,
    },
    msgRowOwn: { justifyContent: "flex-end" },
    msgRowOther: { justifyContent: "flex-start" },
    avatarPlaceholder: { width: 0, alignItems: "flex-end", marginRight: 6, justifyContent: "flex-end" },
    bubbleCol: { maxWidth: "78%", gap: 2 },
    bubbleColOwn: { alignItems: "flex-end" },
    authorRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginLeft: 4,
      marginBottom: 2,
    },
    authorRowOwn: { justifyContent: "flex-end", marginLeft: 0, marginRight: 4 },
    authorName: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 12,
      color: colors.mutedForeground,
    },
    bubble: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 18,
    },
    bubbleOwn: {
      backgroundColor: colors.primary,
    },
    bubbleOther: {
      backgroundColor: colors.card,
    },
    editBubble: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    editInput: {
      fontFamily: "Inter_400Regular",
      fontSize: 15,
      minHeight: 40,
    },
    editActions: {
      flexDirection: "row",
      gap: 8,
      marginTop: 6,
    },
    editSave: {
      backgroundColor: colors.primary,
      borderRadius: 6,
      paddingHorizontal: 12,
      paddingVertical: 4,
    },
    editSaveText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
    editCancel: {
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    editCancelText: { fontFamily: "Inter_400Regular", fontSize: 13 },
    msgText: {
      fontFamily: "Inter_400Regular",
      fontSize: 15,
      color: colors.foreground,
      lineHeight: 21,
    },
    editedTag: {
      fontFamily: "Inter_400Regular",
      fontSize: 10,
      color: colors.mutedForeground,
      marginTop: 2,
    },
    metaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 4,
      marginLeft: 4,
    },
    metaRowOwn: { justifyContent: "flex-end" },
    reactionPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    reactionEmoji: { fontSize: 14 },
    reactionCount: {
      fontFamily: "Inter_500Medium",
      fontSize: 12,
      color: colors.foreground,
    },
    emojiBar: {
      flexDirection: "row",
      gap: 2,
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 4,
      borderWidth: 1,
      borderColor: colors.border,
    },
    emojiBtn: { padding: 4 },
    emojiText: { fontSize: 18 },
    msgTime: {
      fontFamily: "Inter_400Regular",
      fontSize: 10,
      color: colors.mutedForeground,
      marginLeft: 6,
      marginBottom: 2,
    },
    msgTimeOwn: { marginRight: 6 },
    dateSep: {
      flexDirection: "row",
      alignItems: "center",
      marginVertical: 12,
      paddingHorizontal: 16,
      gap: 8,
    },
    dateLine: { flex: 1, height: 1, backgroundColor: colors.border },
    dateText: {
      fontFamily: "Inter_500Medium",
      fontSize: 11,
      color: colors.mutedForeground,
    },
    emptyState: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 32,
      paddingVertical: 60,
      gap: 8,
    },
    emptyText: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 16,
      color: colors.mutedForeground,
    },
    emptySubText: {
      fontFamily: "Inter_400Regular",
      fontSize: 13,
      color: colors.mutedForeground,
      textAlign: "center",
    },
    inputBar: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 8,
      paddingHorizontal: 12,
      paddingTop: 8,
      paddingBottom: 8,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
    },
    textInput: {
      flex: 1,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontFamily: "Inter_400Regular",
      fontSize: 15,
      color: colors.foreground,
      maxHeight: 120,
    },
    sendBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 1,
    },
    sendBtnDisabled: { opacity: 0.4 },
  });
}

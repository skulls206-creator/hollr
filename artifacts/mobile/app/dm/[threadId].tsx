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
  Image,
} from "react-native";
import { router, useLocalSearchParams, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { useRealtime } from "@/contexts/RealtimeContext";
import { useNav } from "@/contexts/NavContext";
import * as Clipboard from "expo-clipboard";
import { api } from "@/lib/api";
import { send as wsSend } from "@/lib/ws";
import { Avatar } from "@/components/Avatar";
import { KhurkSupporterBadge } from "@/components/KhurkSupporterBadge";
import { useAttachmentPicker, getAttachmentUrl } from "@/hooks/useAttachmentPicker";

interface DmMessageAuthor {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  status: string;
  isSupporter?: boolean;
}

interface DmReaction {
  emojiId: string;
  count: number;
  reactedByCurrentUser: boolean;
}

interface DmAttachment {
  id: string;
  objectPath: string;
  name: string;
  contentType: string;
  size: number;
}

interface DmMessage {
  id: string;
  content: string;
  authorId: string;
  author: DmMessageAuthor;
  edited: boolean;
  deleted: boolean;
  reactions: DmReaction[];
  attachments?: DmAttachment[];
  metadata?: { ghost?: boolean; secretId?: string } | null;
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

export default function DmChatScreen() {
  const { threadId, otherUserId, otherUserName, otherDisplayName, otherAvatarUrl, otherStatus } =
    useLocalSearchParams<{
      threadId: string;
      otherUserId?: string;
      otherUserName?: string;
      otherDisplayName?: string;
      otherAvatarUrl?: string;
      otherStatus?: string;
    }>();
  const { colors } = useTheme();
  const { user } = useAuth();
  const { subscribe } = useRealtime();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { setActiveSection, setActiveServerId } = useNav();

  useEffect(() => {
    setActiveSection("dms");
    setActiveServerId(null);
  }, [setActiveSection, setActiveServerId]);

  const listRef = useRef<FlatList>(null);

  const [content, setContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [emojiTargetId, setEmojiTargetId] = useState<string | null>(null);
  const { pending: pendingAttachment, uploading: uploadingAttachment, pick: pickAttachment, clear: clearAttachment } = useAttachmentPicker();

  const [otherUser, setOtherUser] = useState<{
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    status: string;
  } | null>(
    otherUserId
      ? {
          id: otherUserId,
          username: otherUserName ?? "",
          displayName: otherDisplayName ?? otherUserName ?? "",
          avatarUrl: otherAvatarUrl || null,
          status: otherStatus ?? "offline",
        }
      : null
  );

  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const lastTypingSent = useRef(0);
  const tapTimestamps = useRef<Record<string, number>>({});
  const [ghostMode, setGhostMode] = useState(false);
  const [ghostRevealedContent, setGhostRevealedContent] = useState<Record<string, "pending" | "gone">>({});

  const handleDoubleTap = useCallback((msg: DmMessage) => {
    const now = Date.now();
    const last = tapTimestamps.current[msg.id] ?? 0;
    if (now - last < 350) {
      tapTimestamps.current[msg.id] = 0;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setEmojiTargetId(prev => prev === msg.id ? null : msg.id);
    } else {
      tapTimestamps.current[msg.id] = now;
    }
  }, []);

  const { data: messages = [], isLoading } = useQuery<DmMessage[]>({
    queryKey: ["dm-messages", threadId],
    queryFn: async () => {
      const data: DmMessage[] = await api(`/dms/${threadId}/messages?limit=50`);
      if (data.length < 50) setHasMore(false);
      return data;
    },
    enabled: !!threadId,
  });

  useEffect(() => {
    if (otherUser || !threadId || !user) return;
    // GET /dms/:threadId returns { participants: Array<{ id, username, displayName, avatarUrl, status, ... }> }
    api<{ participants: { id: string; username: string; displayName: string; avatarUrl: string | null; status: string }[] }>(
      `/dms/${threadId}`
    )
      .then(data => {
        const other = data.participants?.find(p => p.id !== user.id);
        if (other) setOtherUser(other);
      })
      .catch(() => {});
  }, [threadId, otherUser, user]);

  useEffect(() => {
    if (!threadId || messages.length === 0) return;
    api(`/dms/${threadId}/read`, { method: "POST" }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ["dm-unread"] });
  }, [threadId, messages.length, queryClient]);

  const loadMore = async () => {
    if (!hasMore || loadingMore || messages.length === 0) return;
    setLoadingMore(true);
    try {
      const oldest = [...messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
      const older: DmMessage[] = await api(`/dms/${threadId}/messages?limit=50&beforeCreatedAt=${encodeURIComponent(oldest.createdAt)}`);
      if (older.length < 50) setHasMore(false);
      queryClient.setQueryData(["dm-messages", threadId], (old: DmMessage[] = []) => {
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
      subscribe("MESSAGE_CREATE", (payload: { dmThreadId?: string; id: string } & DmMessage) => {
        if (payload.dmThreadId !== threadId) return;
        queryClient.setQueryData(["dm-messages", threadId], (old: DmMessage[] = []) => {
          if (old.find(m => m.id === payload.id)) return old;
          return [...old, payload];
        });
        queryClient.invalidateQueries({ queryKey: ["dm-threads"] });
      }),
      subscribe("MESSAGE_UPDATE", (payload: { id: string } & Partial<DmMessage>) => {
        if (payload.deleted) {
          queryClient.setQueryData(["dm-messages", threadId], (old: DmMessage[] = []) =>
            old.filter(m => m.id !== payload.id)
          );
          queryClient.invalidateQueries({ queryKey: ["dm-threads"] });
          queryClient.invalidateQueries({ queryKey: ["dm-unread"] });
        } else {
          queryClient.setQueryData(["dm-messages", threadId], (old: DmMessage[] = []) =>
            old.map(m => m.id === payload.id ? { ...m, ...payload } : m)
          );
        }
      }),
      subscribe("MESSAGE_DELETE", (payload: { id: string; dmThreadId?: string }) => {
        if (payload.dmThreadId !== threadId) return;
        queryClient.setQueryData(["dm-messages", threadId], (old: DmMessage[] = []) =>
          old.filter(m => m.id !== payload.id)
        );
        queryClient.invalidateQueries({ queryKey: ["dm-threads"] });
        queryClient.invalidateQueries({ queryKey: ["dm-unread"] });
      }),
      subscribe("TYPING", (payload: { dmThreadId?: string; userId: string }) => {
        if (payload.dmThreadId !== threadId) return;
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
      subscribe("PRESENCE_UPDATE", (payload: { userId: string; status: string }) => {
        setOtherUser(prev => {
          if (!prev || prev.id !== payload.userId) return prev;
          return { ...prev, status: payload.status };
        });
      }),
    ];
    return () => unsubs.forEach(u => u());
  }, [threadId, subscribe, queryClient, user?.id]);

  const sendMutation = useMutation({
    mutationFn: ({ text, attachment, metadata }: { text: string; attachment: typeof pendingAttachment; metadata?: Record<string, unknown> }) =>
      api(`/dms/${threadId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          content: text,
          ...(attachment ? { attachments: [{ objectPath: attachment.objectPath, name: attachment.name, contentType: attachment.contentType, size: attachment.size }] } : {}),
          ...(metadata ? { metadata } : {}),
        }),
      }),
    onSuccess: () => {
      setContent("");
      clearAttachment();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      queryClient.invalidateQueries({ queryKey: ["dm-threads"] });
    },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const editMutation = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      api(`/dms/${threadId}/messages/${id}`, {
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
      api(`/dms/${threadId}/messages/${id}`, { method: "DELETE" }),
    onSuccess: (_, id) => {
      queryClient.setQueryData(["dm-messages", threadId], (old: DmMessage[] = []) =>
        old.filter(m => m.id !== id)
      );
    },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const reactMutation = useMutation({
    mutationFn: ({ id, emoji }: { id: string; emoji: string }) =>
      api(`/dms/${threadId}/messages/${id}/reactions/${encodeURIComponent(emoji)}`, {
        method: "PUT",
      }),
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const handleRevealGhost = useCallback(async (messageId: string, secretId: string) => {
    if (ghostRevealedContent[messageId]) return;
    setGhostRevealedContent(prev => ({ ...prev, [messageId]: "pending" }));
    try {
      const data: { ciphertext?: string; iv?: string; error?: string } = await api(`/secrets/${secretId}`);
      if (data.error || !data.ciphertext) {
        setGhostRevealedContent(prev => ({ ...prev, [messageId]: "gone" }));
        Alert.alert("Ghost message", "This message has already been viewed or no longer exists.");
        return;
      }
      setGhostRevealedContent(prev => ({ ...prev, [messageId]: "gone" }));
      Alert.alert("👻 Ghost Message", "This message was decrypted client-side. Open hollr.chat on web to view the content.", [{ text: "OK" }]);
    } catch {
      setGhostRevealedContent(prev => { const n = { ...prev }; delete n[messageId]; return n; });
      Alert.alert("Error", "Could not reveal ghost message.");
    }
  }, [ghostRevealedContent]);

  const handleSend = async () => {
    if (!content.trim() && !pendingAttachment) return;

    if (ghostMode && content.trim()) {
      try {
        const secretData: { id?: string } = await api("/secrets", {
          method: "POST",
          body: JSON.stringify({ ciphertext: btoa(unescape(encodeURIComponent(content.trim()))), iv: btoa("mobile") }),
        });
        if (!secretData.id) throw new Error("No secret id returned");
        sendMutation.mutate({ text: "", attachment: null, metadata: { ghost: true, secretId: secretData.id } });
      } catch {
        Alert.alert("Error", "Failed to send ghost message.");
      }
      return;
    }

    sendMutation.mutate({ text: content.trim(), attachment: pendingAttachment });
  };

  const handleLongPress = (msg: DmMessage) => {
    const isOwn = msg.authorId === user?.id;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setEmojiTargetId(null);

    const copyText = () => { if (msg.content) Clipboard.setStringAsync(msg.content); };

    if (Platform.OS === "ios") {
      if (isOwn) {
        ActionSheetIOS.showActionSheetWithOptions(
          { options: ["Cancel", "Copy Text", "Edit", "Delete"], cancelButtonIndex: 0, destructiveButtonIndex: 3 },
          (idx) => {
            if (idx === 1) copyText();
            else if (idx === 2) { setEditingId(msg.id); setEditContent(msg.content); setEmojiTargetId(null); }
            else if (idx === 3) Alert.alert("Delete Message", "Are you sure?", [
              { text: "Cancel", style: "cancel" },
              { text: "Delete", style: "destructive", onPress: () => { deleteMutation.mutate(msg.id); setEmojiTargetId(null); } },
            ]);
            else setEmojiTargetId(null);
          }
        );
      } else {
        ActionSheetIOS.showActionSheetWithOptions(
          { options: ["Cancel", "Copy Text"], cancelButtonIndex: 0 },
          (idx) => { if (idx === 1) copyText(); else setEmojiTargetId(null); }
        );
      }
    } else {
      const options = isOwn
        ? [
            { text: "Copy Text", onPress: copyText },
            { text: "Edit", onPress: () => { setEditingId(msg.id); setEditContent(msg.content); setEmojiTargetId(null); } },
            { text: "Delete", style: "destructive" as const, onPress: () => { deleteMutation.mutate(msg.id); setEmojiTargetId(null); } },
            { text: "Cancel", style: "cancel" as const, onPress: () => setEmojiTargetId(null) },
          ]
        : [
            { text: "Copy Text", onPress: copyText },
            { text: "Cancel", style: "cancel" as const, onPress: () => setEmojiTargetId(null) },
          ];
      Alert.alert("Message", "", options);
    }
  };

  const s = createStyles(colors);

  const sorted = [...messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const reversed = [...sorted].reverse();

  const renderMessage = useCallback(({ item, index }: { item: DmMessage; index: number }) => {
    const isOwn = item.authorId === user?.id;
    const prevMsg = reversed[index + 1];
    const nextMsg = reversed[index - 1];
    const isFirst = !prevMsg || prevMsg.authorId !== item.authorId;
    const isLast = !nextMsg || nextMsg.authorId !== item.authorId;
    const showDate = isFirst && (!prevMsg || formatDate(prevMsg.createdAt) !== formatDate(item.createdAt));
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
          onPress={() => handleDoubleTap(item)}
          onLongPress={() => handleLongPress(item)}
          delayLongPress={400}
          style={[s.msgRow, isOwn ? s.msgRowOwn : s.msgRowOther]}
        >
          {!isOwn && isLast && (
            <Avatar
              avatarUrl={item.author?.avatarUrl ?? null}
              username={item.author?.username ?? ""}
              displayName={item.author?.displayName ?? ""}
              size={30}
              style={{ marginRight: 6, alignSelf: "flex-end", marginBottom: 2 }}
            />
          )}
          {!isOwn && !isLast && <View style={{ width: 36 }} />}

          <View style={[s.bubbleCol, isOwn && s.bubbleColOwn]}>
            {!isOwn && isFirst && isSupporter && (
              <View style={s.authorRow}>
                <Text style={s.authorName}>
                  {item.author?.displayName || item.author?.username}
                </Text>
                <KhurkSupporterBadge size={13} />
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
            ) : item.metadata?.ghost ? (
              (() => {
                const secretId = item.metadata?.secretId;
                const revealed = secretId ? ghostRevealedContent[item.id] : "gone";
                const isGone = revealed === "gone" || !secretId;
                return (
                  <TouchableOpacity
                    onPress={() => !isGone && revealed !== "pending" && secretId && void handleRevealGhost(item.id, secretId)}
                    disabled={isGone || revealed === "pending"}
                    style={[
                      s.bubble,
                      {
                        backgroundColor: isGone ? colors.card : colors.primary + "26",
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      },
                    ]}
                  >
                    <Text style={{ fontSize: 14 }}>{isGone ? "💨" : "👻"}</Text>
                    <Text style={[s.msgText, { color: isGone ? colors.mutedForeground : colors.primary, fontStyle: isGone ? "italic" : "normal" }]}>
                      {isGone
                        ? "Ghost message — self-destructed"
                        : revealed === "pending"
                        ? "Revealing…"
                        : "🔒 Ghost Message — tap to reveal"}
                    </Text>
                  </TouchableOpacity>
                );
              })()
            ) : (
              <View
                style={[
                  s.bubble,
                  isOwn
                    ? [s.bubbleOwn, { borderTopRightRadius: isFirst ? 4 : 16, borderBottomRightRadius: isLast ? 4 : 16 }]
                    : [s.bubbleOther, { borderTopLeftRadius: isFirst ? 4 : 16, borderBottomLeftRadius: isLast ? 4 : 16 }],
                  glowStyle,
                ]}
              >
                {item.content ? (
                  <Text style={[s.msgText, isOwn && { color: colors.primaryForeground }]}>
                    {item.content}
                  </Text>
                ) : null}
                {(item.attachments ?? []).filter(a => a.contentType.startsWith("image/")).map(a => (
                  <Image
                    key={a.id}
                    source={{ uri: getAttachmentUrl(a.objectPath) }}
                    style={s.attachmentImage}
                    resizeMode="cover"
                  />
                ))}
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
        {otherUser ? (
          <>
            <Avatar
              avatarUrl={otherUser.avatarUrl}
              username={otherUser.username}
              displayName={otherUser.displayName}
              size={34}
              status={otherUser.status}
            />
            <View style={{ flex: 1 }}>
              <Text style={s.headerName} numberOfLines={1}>
                {otherUser.displayName || otherUser.username}
              </Text>
              <Text style={s.headerStatus}>
                {otherUser.status === "online" ? "Online" : otherUser.status === "idle" ? "Away" : otherUser.status === "dnd" ? "Do Not Disturb" : "Offline"}
              </Text>
            </View>
          </>
        ) : (
          <View style={{ flex: 1 }} />
        )}
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
          contentContainerStyle={{ paddingTop: 12, paddingBottom: 8 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={loadingMore ? () => (
            <ActivityIndicator color={colors.primary} style={{ padding: 12 }} />
          ) : null}
          ListEmptyComponent={() => (
            <View style={s.emptyState}>
              {otherUser && (
                <Avatar
                  avatarUrl={otherUser.avatarUrl}
                  username={otherUser.username}
                  displayName={otherUser.displayName}
                  size={60}
                />
              )}
              <Text style={s.emptyText}>
                {otherUser ? `Say hi to ${otherUser.displayName || otherUser.username}!` : "Start the conversation"}
              </Text>
            </View>
          )}
        />
      )}

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
        {ghostMode && (
          <View style={[s.typingBar, { backgroundColor: colors.primary + "22" }]}>
            <Text style={[s.typingText, { color: colors.primary, fontStyle: "normal", fontFamily: "Inter_500Medium" }]}>
              👻 Ghost mode — message will self-destruct after first view
            </Text>
          </View>
        )}
        {typingUsers.length > 0 && (
          <View style={s.typingBar}>
            <Text style={s.typingText}>
              {otherUser?.displayName ?? "Someone"} is typing...
            </Text>
          </View>
        )}
        {pendingAttachment && (
          <View style={[s.attachmentPreviewBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
            <Image source={{ uri: pendingAttachment.localUri }} style={s.attachmentThumb} resizeMode="cover" />
            <Text style={[s.attachmentPreviewName, { color: colors.mutedForeground }]} numberOfLines={1}>
              {pendingAttachment.name}
            </Text>
            <TouchableOpacity onPress={clearAttachment} style={s.attachmentRemoveBtn}>
              <Ionicons name="close-circle" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        )}
        <View style={s.inputBar}>
          <TouchableOpacity
            style={[s.attachBtn, ghostMode && { opacity: 1 }]}
            onPress={() => setGhostMode(g => !g)}
          >
            <Text style={{ fontSize: 20 }}>👻</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.attachBtn}
            onPress={pickAttachment}
            disabled={uploadingAttachment || sendMutation.isPending}
          >
            {uploadingAttachment
              ? <ActivityIndicator color={colors.mutedForeground} size="small" />
              : <Ionicons name="image-outline" size={22} color={colors.mutedForeground} />
            }
          </TouchableOpacity>
          <TextInput
            style={s.textInput}
            placeholder={ghostMode ? "👻 Ghost message..." : `Message ${otherUser?.displayName ?? "..."}`}
            placeholderTextColor={colors.mutedForeground}
            value={content}
            onChangeText={(text) => {
              setContent(text);
              const now = Date.now();
              if (now - lastTypingSent.current > 2000 && text.length > 0) {
                lastTypingSent.current = now;
                wsSend({ type: "TYPING_START", payload: { dmThreadId: threadId } });
              }
            }}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            style={[s.sendBtn, ((!content.trim() && !pendingAttachment) || sendMutation.isPending || uploadingAttachment) && s.sendBtnDisabled]}
            onPress={handleSend}
            disabled={(!content.trim() && !pendingAttachment) || sendMutation.isPending || uploadingAttachment}
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
      gap: 10,
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
    headerName: {
      fontFamily: "Inter_700Bold",
      fontSize: 16,
      color: colors.foreground,
    },
    headerStatus: {
      fontFamily: "Inter_400Regular",
      fontSize: 11,
      color: colors.mutedForeground,
    },
    msgRow: {
      flexDirection: "row",
      paddingHorizontal: 10,
      marginBottom: 2,
    },
    msgRowOwn: { justifyContent: "flex-end" },
    msgRowOther: { justifyContent: "flex-start" },
    bubbleCol: { maxWidth: "78%", gap: 2 },
    bubbleColOwn: { alignItems: "flex-end" },
    authorRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginBottom: 2,
    },
    authorRowOwn: { justifyContent: "flex-end" },
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
    bubbleOwn: { backgroundColor: colors.primary },
    bubbleOther: { backgroundColor: colors.card },
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
    editActions: { flexDirection: "row", gap: 8, marginTop: 6 },
    editSave: {
      backgroundColor: colors.primary,
      borderRadius: 6,
      paddingHorizontal: 12,
      paddingVertical: 4,
    },
    editSaveText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
    editCancel: { paddingHorizontal: 8, paddingVertical: 4 },
    editCancelText: { fontFamily: "Inter_400Regular", fontSize: 13 },
    msgText: {
      fontFamily: "Inter_400Regular",
      fontSize: 15,
      color: colors.foreground,
      lineHeight: 21,
    },
    metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginLeft: 4 },
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
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 32,
      paddingVertical: 60,
      gap: 12,
    },
    emptyText: {
      fontFamily: "Inter_500Medium",
      fontSize: 16,
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
    attachBtn: {
      width: 38,
      height: 38,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 1,
    },
    attachmentPreviewBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderTopWidth: 1,
    },
    attachmentThumb: {
      width: 44,
      height: 44,
      borderRadius: 8,
    },
    attachmentPreviewName: {
      flex: 1,
      fontFamily: "Inter_400Regular",
      fontSize: 13,
    },
    attachmentRemoveBtn: {
      padding: 2,
    },
    attachmentImage: {
      width: 220,
      height: 160,
      borderRadius: 10,
      marginTop: 4,
    },
  });
}

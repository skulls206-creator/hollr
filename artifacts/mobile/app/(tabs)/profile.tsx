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
  Switch,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { api, getSessionId } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { THEMES, THEME_LABELS, ThemeId } from "@/constants/colors";

interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  status: string;
  customStatus: string | null;
  isSupporter: boolean;
}

const STATUS_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: "online", label: "Online", color: "#22c55e" },
  { value: "idle", label: "Idle", color: "#eab308" },
  { value: "dnd", label: "Do Not Disturb", color: "#ef4444" },
  { value: "invisible", label: "Invisible", color: "#6b7280" },
];

const THEME_IDS: ThemeId[] = ["void", "ember", "bloom", "slate", "blueapple", "light"];

export default function ProfileTab() {
  const { colors, themeId, setTheme } = useTheme();
  const { user, logout, refreshUser } = useAuth();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [editingName, setEditingName] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [editingPassword, setEditingPassword] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const { data: profile, isLoading } = useQuery<UserProfile>({
    queryKey: ["profile", "me"],
    queryFn: () => api("/users/me"),
  });

  useEffect(() => {
    if (profile) setDisplayName(profile.displayName || "");
  }, [profile]);

  const updateProfileMutation = useMutation({
    mutationFn: (data: Partial<{ displayName: string; status: string }>) =>
      api("/users/me", { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", "me"] });
      refreshUser();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: Error) => {
      Alert.alert("Error", e.message || "Failed to update profile");
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: ({ current, next }: { current: string; next: string }) =>
      api("/auth/password", {
        method: "PATCH",
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      }),
    onSuccess: () => {
      setEditingPassword(false);
      setCurrentPw("");
      setNewPw("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Password Changed", "Your password has been updated.");
    },
    onError: (e: Error) => {
      Alert.alert("Error", e.message || "Failed to change password");
    },
  });

  const handleSaveName = () => {
    if (!displayName.trim()) return;
    updateProfileMutation.mutate({ displayName: displayName.trim() });
    setEditingName(false);
  };

  const handleAvatarUpload = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Required", "Please allow access to your photo library to change your avatar.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    setUploadingAvatar(true);
    try {
      const asset = result.assets[0];
      const ext = asset.uri.split(".").pop() ?? "jpg";
      const mimeType = asset.mimeType ?? `image/${ext}`;
      const fileName = `avatar-${Date.now()}.${ext}`;

      const fileData = await fetch(asset.uri);
      const blob = await fileData.blob();
      const fileSize = blob.size || asset.fileSize || 1;

      const { uploadURL, objectPath } = await api<{ uploadURL: string; objectPath: string }>(
        "/storage/uploads/request-url",
        { method: "POST", body: JSON.stringify({ name: fileName, size: fileSize, contentType: mimeType }) }
      );

      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": mimeType },
        body: blob,
      });
      if (!uploadRes.ok) throw new Error("Upload failed");

      await api("/users/me", {
        method: "PATCH",
        body: JSON.stringify({ avatarUrl: objectPath }),
      });

      queryClient.invalidateQueries({ queryKey: ["profile", "me"] });
      refreshUser();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Avatar Updated", "Your profile picture has been updated.");
    } catch (e) {
      Alert.alert("Error", (e instanceof Error ? e.message : null) ?? "Failed to upload avatar");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          setLoggingOut(true);
          try {
            await logout();
            router.replace("/login");
          } catch {
            setLoggingOut(false);
          }
        },
      },
    ]);
  };

  const s = createStyles(colors);

  if (isLoading) {
    return (
      <View style={[s.root, { paddingTop: insets.top }, s.center]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const currentStatus = profile?.status ?? "online";
  const statusInfo = STATUS_OPTIONS.find(o => o.value === currentStatus) ?? STATUS_OPTIONS[0];

  return (
    <ScrollView
      style={[s.root, { paddingTop: insets.top }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={s.header}>
        <Text style={s.headerTitle}>Profile</Text>
      </View>

      <View style={s.avatarSection}>
        <TouchableOpacity onPress={handleAvatarUpload} disabled={uploadingAvatar} style={s.avatarWrapper}>
          <Avatar
            avatarUrl={profile?.avatarUrl}
            username={profile?.username}
            displayName={profile?.displayName}
            size={80}
          />
          <View style={[s.avatarEditBadge, { backgroundColor: colors.primary }]}>
            {uploadingAvatar
              ? <ActivityIndicator color={colors.primaryForeground} size="small" />
              : <Ionicons name="camera" size={14} color={colors.primaryForeground} />
            }
          </View>
        </TouchableOpacity>
        <View style={s.nameCol}>
          {editingName ? (
            <View style={s.editNameRow}>
              <TextInput
                style={s.nameInput}
                value={displayName}
                onChangeText={setDisplayName}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleSaveName}
                maxLength={50}
              />
              <TouchableOpacity onPress={handleSaveName} style={s.saveBtn}>
                <Ionicons name="checkmark" size={20} color={colors.primaryForeground} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setEditingName(false)} style={s.cancelBtn}>
                <Ionicons name="close" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={s.nameRow} onPress={() => setEditingName(true)}>
              <Text style={s.displayName} numberOfLines={1}>
                {profile?.displayName || profile?.username}
              </Text>
              <Ionicons name="pencil" size={14} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
          <Text style={s.username}>@{profile?.username}</Text>
          {profile?.isSupporter && (
            <View style={s.supporterBadge}>
              <Ionicons name="star" size={11} color={colors.primary} />
              <Text style={[s.supporterText, { color: colors.primary }]}>Supporter</Text>
            </View>
          )}
        </View>
      </View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>Status</Text>
        <View style={s.statusRow}>
          {STATUS_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.value}
              style={[
                s.statusPill,
                currentStatus === opt.value && { borderColor: opt.color, backgroundColor: opt.color + "20" },
              ]}
              onPress={() => updateProfileMutation.mutate({ status: opt.value })}
              activeOpacity={0.8}
            >
              <View style={[s.statusDot, { backgroundColor: opt.color }]} />
              <Text style={[
                s.statusLabel,
                currentStatus === opt.value && { color: opt.color },
              ]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>Theme</Text>
        <View style={s.themeGrid}>
          {THEME_IDS.map(tid => {
            const tc = THEMES[tid];
            const isActive = themeId === tid;
            return (
              <TouchableOpacity
                key={tid}
                style={[
                  s.themeChip,
                  { backgroundColor: tc.card, borderColor: isActive ? tc.primary : tc.border },
                ]}
                onPress={() => {
                  setTheme(tid);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                activeOpacity={0.8}
              >
                <View style={[s.themeDot, { backgroundColor: tc.primary }]} />
                <Text style={[s.themeLabel, { color: isActive ? tc.primary : tc.mutedForeground }]}>
                  {THEME_LABELS[tid]}
                </Text>
                {isActive && (
                  <Ionicons name="checkmark-circle" size={14} color={tc.primary} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>Security</Text>

        {editingPassword ? (
          <View style={s.passwordForm}>
            <TextInput
              style={s.input}
              placeholder="Current password"
              placeholderTextColor={colors.mutedForeground}
              value={currentPw}
              onChangeText={setCurrentPw}
              secureTextEntry
            />
            <TextInput
              style={s.input}
              placeholder="New password (min 6 chars)"
              placeholderTextColor={colors.mutedForeground}
              value={newPw}
              onChangeText={setNewPw}
              secureTextEntry
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                style={[s.actionBtn, { flex: 1 }]}
                onPress={() => changePasswordMutation.mutate({ current: currentPw, next: newPw })}
                disabled={changePasswordMutation.isPending}
              >
                {changePasswordMutation.isPending ? (
                  <ActivityIndicator color={colors.primaryForeground} size="small" />
                ) : (
                  <Text style={s.actionBtnText}>Save Password</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.secondaryBtn, { flex: 1 }]}
                onPress={() => { setEditingPassword(false); setCurrentPw(""); setNewPw(""); }}
              >
                <Text style={s.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={s.settingRow} onPress={() => setEditingPassword(true)}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.mutedForeground} />
            <Text style={s.settingLabel}>Change Password</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
      </View>

      <View style={[s.section, { marginTop: 8 }]}>
        <TouchableOpacity
          style={s.logoutBtn}
          onPress={handleLogout}
          disabled={loggingOut}
          activeOpacity={0.8}
        >
          {loggingOut ? (
            <ActivityIndicator color={colors.destructive} size="small" />
          ) : (
            <>
              <Ionicons name="log-out-outline" size={20} color={colors.destructive} />
              <Text style={[s.logoutText, { color: colors.destructive }]}>Sign Out</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function createStyles(colors: {
  background: string; foreground: string; muted: string; mutedForeground: string;
  primary: string; primaryForeground: string; secondary: string;
  border: string; card: string; radius: number; destructive?: string;
}) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    center: { alignItems: "center", justifyContent: "center" },
    header: {
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
    avatarWrapper: {
      position: "relative",
    },
    avatarEditBadge: {
      position: "absolute",
      bottom: 0,
      right: 0,
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderColor: colors.background,
    },
    avatarSection: {
      flexDirection: "row",
      alignItems: "center",
      gap: 16,
      padding: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    nameCol: { flex: 1, gap: 4 },
    editNameRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    nameInput: {
      flex: 1,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: colors.radius,
      paddingHorizontal: 10,
      paddingVertical: 6,
      fontFamily: "Inter_600SemiBold",
      fontSize: 17,
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
    nameRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    displayName: {
      fontFamily: "Inter_700Bold",
      fontSize: 19,
      color: colors.foreground,
      letterSpacing: -0.3,
    },
    username: {
      fontFamily: "Inter_400Regular",
      fontSize: 14,
      color: colors.mutedForeground,
    },
    supporterBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.primary + "20",
      borderRadius: 12,
      paddingHorizontal: 8,
      paddingVertical: 3,
      alignSelf: "flex-start",
    },
    supporterText: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 11,
    },
    section: {
      paddingHorizontal: 16,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 10,
    },
    sectionTitle: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 12,
      color: colors.mutedForeground,
      letterSpacing: 0.8,
      textTransform: "uppercase",
    },
    statusRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    statusPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 100,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    statusLabel: {
      fontFamily: "Inter_500Medium",
      fontSize: 13,
      color: colors.mutedForeground,
    },
    themeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    themeChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 100,
      borderWidth: 1.5,
    },
    themeDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    themeLabel: {
      fontFamily: "Inter_500Medium",
      fontSize: 13,
    },
    settingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 14,
    },
    settingLabel: {
      flex: 1,
      fontFamily: "Inter_500Medium",
      fontSize: 15,
      color: colors.foreground,
    },
    passwordForm: { gap: 10 },
    input: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: colors.radius,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontFamily: "Inter_400Regular",
      fontSize: 15,
      color: colors.foreground,
    },
    actionBtn: {
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      paddingVertical: 12,
      alignItems: "center",
    },
    actionBtnText: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 14,
      color: colors.primaryForeground,
    },
    secondaryBtn: {
      backgroundColor: colors.muted,
      borderRadius: colors.radius,
      paddingVertical: 12,
      alignItems: "center",
    },
    secondaryBtnText: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 14,
      color: colors.foreground,
    },
    logoutBtn: {
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
    logoutText: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 15,
    },
  });
}

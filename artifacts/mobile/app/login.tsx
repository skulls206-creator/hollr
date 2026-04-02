import React, { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  TextInput as RNTextInput,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";

export default function LoginScreen() {
  const { colors } = useTheme();
  const { login } = useAuth();
  const insets = useSafeAreaInsets();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordRef = useRef<RNTextInput>(null);

  const handleLogin = async () => {
    if (!identifier.trim() || !password) {
      setError("Please enter your username and password.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await login(identifier.trim(), password);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } catch (e) {
      setError((e instanceof Error ? e.message : null) || "Login failed. Please try again.");
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const s = createStyles(colors);

  return (
    <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={s.logoRow}>
            <View style={s.logoCircle}>
              <Text style={s.logoText}>H</Text>
            </View>
          </View>

          <Text style={s.title}>Welcome back</Text>
          <Text style={s.subtitle}>Sign in to hollr.chat</Text>

          <View style={s.form}>
            <View style={s.inputGroup}>
              <Text style={s.label}>Username or Email</Text>
              <TextInput
                style={s.input}
                placeholder="your_username"
                placeholderTextColor={colors.mutedForeground}
                value={identifier}
                onChangeText={setIdentifier}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                blurOnSubmit={false}
              />
            </View>

            <View style={s.inputGroup}>
              <Text style={s.label}>Password</Text>
              <View style={s.passwordRow}>
                <TextInput
                  ref={passwordRef}
                  style={[s.input, s.passwordInput]}
                  placeholder="••••••••"
                  placeholderTextColor={colors.mutedForeground}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  returnKeyType="go"
                  onSubmitEditing={handleLogin}
                />
                <TouchableOpacity
                  style={s.eyeBtn}
                  onPress={() => setShowPassword(!showPassword)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name={showPassword ? "eye-off" : "eye"}
                    size={20}
                    color={colors.mutedForeground}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {error && (
              <View style={s.errorBox}>
                <Ionicons name="alert-circle" size={14} color={colors.destructive} />
                <Text style={[s.errorText, { color: colors.destructive }]}>{error}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[s.loginBtn, loading && s.loginBtnDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color={colors.primaryForeground} size="small" />
              ) : (
                <Text style={s.loginBtnText}>Sign In</Text>
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={s.signupLink}
            onPress={() => router.push("/signup")}
          >
            <Text style={s.signupText}>
              {"Don't have an account? "}
              <Text style={[s.signupText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                Create one
              </Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function createStyles(colors: {
  background: string; foreground: string; muted: string; mutedForeground: string;
  primary: string; primaryForeground: string; secondary?: string;
  border: string; card: string; radius: number; destructive?: string;
}) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scroll: {
      flexGrow: 1,
      paddingHorizontal: 24,
      justifyContent: "center",
      minHeight: 500,
    },
    logoRow: {
      alignItems: "center",
      marginBottom: 28,
    },
    logoCircle: {
      width: 72,
      height: 72,
      borderRadius: 20,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.45,
      shadowRadius: 16,
      elevation: 12,
    },
    logoText: {
      fontFamily: "Inter_700Bold",
      fontSize: 32,
      color: colors.primaryForeground,
      letterSpacing: -1,
    },
    title: {
      fontFamily: "Inter_700Bold",
      fontSize: 28,
      color: colors.foreground,
      textAlign: "center",
      letterSpacing: -0.5,
    },
    subtitle: {
      fontFamily: "Inter_400Regular",
      fontSize: 15,
      color: colors.mutedForeground,
      textAlign: "center",
      marginTop: 6,
      marginBottom: 36,
    },
    form: {
      gap: 16,
    },
    inputGroup: {
      gap: 6,
    },
    label: {
      fontFamily: "Inter_500Medium",
      fontSize: 13,
      color: colors.mutedForeground,
      letterSpacing: 0.3,
      textTransform: "uppercase",
    },
    input: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: colors.radius,
      paddingHorizontal: 14,
      paddingVertical: 13,
      fontFamily: "Inter_400Regular",
      fontSize: 15,
      color: colors.foreground,
    },
    passwordRow: {
      position: "relative",
    },
    passwordInput: {
      paddingRight: 48,
    },
    eyeBtn: {
      position: "absolute",
      right: 14,
      top: 0,
      bottom: 0,
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
    loginBtn: {
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      paddingVertical: 14,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 4,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35,
      shadowRadius: 10,
      elevation: 8,
    },
    loginBtnDisabled: {
      opacity: 0.6,
    },
    loginBtnText: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 16,
      color: colors.primaryForeground,
    },
    signupLink: {
      marginTop: 28,
      alignItems: "center",
    },
    signupText: {
      fontFamily: "Inter_400Regular",
      fontSize: 14,
      color: colors.mutedForeground,
    },
  });
}

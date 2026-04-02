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

export default function SignupScreen() {
  const { colors } = useTheme();
  const { signup } = useAuth();
  const insets = useSafeAreaInsets();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordRef = useRef<RNTextInput>(null);

  const handleSignup = async () => {
    if (!username.trim() || !password) {
      setError("Please fill in all fields.");
      return;
    }
    if (!/^[a-zA-Z0-9_]{3,32}$/.test(username.trim())) {
      setError("Username must be 3–32 characters (letters, numbers, underscores).");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await signup(username.trim(), password);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e.message || "Signup failed. Please try again.");
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
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color={colors.foreground} />
          </TouchableOpacity>

          <View style={s.logoRow}>
            <View style={s.logoCircle}>
              <Text style={s.logoText}>H</Text>
            </View>
          </View>

          <Text style={s.title}>Join hollr</Text>
          <Text style={s.subtitle}>Create your account</Text>

          <View style={s.form}>
            <View style={s.inputGroup}>
              <Text style={s.label}>Username</Text>
              <TextInput
                style={s.input}
                placeholder="your_username"
                placeholderTextColor={colors.mutedForeground}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                blurOnSubmit={false}
              />
              <Text style={s.hint}>3–32 characters. Letters, numbers, underscores only.</Text>
            </View>

            <View style={s.inputGroup}>
              <Text style={s.label}>Password</Text>
              <View style={s.passwordRow}>
                <TextInput
                  ref={passwordRef}
                  style={[s.input, s.passwordInput]}
                  placeholder="At least 6 characters"
                  placeholderTextColor={colors.mutedForeground}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  returnKeyType="go"
                  onSubmitEditing={handleSignup}
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
              style={[s.signupBtn, loading && s.disabled]}
              onPress={handleSignup}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color={colors.primaryForeground} size="small" />
              ) : (
                <Text style={s.signupBtnText}>Create Account</Text>
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={s.loginLink}
            onPress={() => router.back()}
          >
            <Text style={s.loginText}>
              {"Already have an account? "}
              <Text style={[s.loginText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                Sign in
              </Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scroll: {
      flexGrow: 1,
      paddingHorizontal: 24,
      justifyContent: "center",
      minHeight: 560,
    },
    backBtn: {
      position: "absolute",
      top: 0,
      left: 0,
      padding: 4,
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
    hint: {
      fontFamily: "Inter_400Regular",
      fontSize: 11,
      color: colors.mutedForeground,
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
    signupBtn: {
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
    disabled: {
      opacity: 0.6,
    },
    signupBtnText: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 16,
      color: colors.primaryForeground,
    },
    loginLink: {
      marginTop: 28,
      alignItems: "center",
    },
    loginText: {
      fontFamily: "Inter_400Regular",
      fontSize: 14,
      color: colors.mutedForeground,
    },
  });
}

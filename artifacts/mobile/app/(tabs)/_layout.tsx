import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SymbolView, type SFSymbol } from "expo-symbols";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { Redirect } from "expo-router";

import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";

function TabIcon({
  sf,
  ionicon,
  color,
  size,
}: {
  sf: SFSymbol;
  ionicon: keyof typeof Ionicons.glyphMap;
  color: string;
  size: number;
}) {
  if (Platform.OS === "ios") {
    return <SymbolView name={sf} tintColor={color} size={size} />;
  }
  return <Ionicons name={ionicon} size={size} color={color} />;
}

export default function TabLayout() {
  const { colors } = useTheme();
  const { user, loading } = useAuth();

  if (!loading && !user) {
    return <Redirect href="/login" />;
  }

  const isIOS = Platform.OS === "ios";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 0,
          height: isIOS ? 84 : 60,
        },
        tabBarLabelStyle: {
          fontFamily: "Inter_500Medium",
          fontSize: 11,
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={80}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.card }]} />
          ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Servers",
          tabBarIcon: ({ color, size }) => (
            <TabIcon sf="square.grid.2x2" ionicon="grid" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="dms"
        options={{
          title: "Messages",
          tabBarIcon: ({ color, size }) => (
            <TabIcon sf="message" ionicon="chatbubbles" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <TabIcon sf="person.crop.circle" ionicon="person-circle" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}

import React, { useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as WebBrowser from "expo-web-browser";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/contexts/ThemeContext";
import { KHURK_APPS, type KhurkApp } from "@/lib/khurk-apps";

function AppCard({ app, colors }: { app: KhurkApp; colors: any }) {
  const handleOpenInApp = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await WebBrowser.openBrowserAsync(app.url, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      toolbarColor: colors.card,
      controlsColor: colors.primary,
      dismissButtonStyle: "close",
    });
  }, [app.url, colors.card, colors.primary]);

  const handleOpenExternal = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Linking.openURL(app.url);
  }, [app.url]);

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={handleOpenInApp}
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={styles.cardTop}>
        <LinearGradient
          colors={app.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.iconTile}
        >
          <Text style={styles.iconInitials}>{app.initials}</Text>
        </LinearGradient>

        <View style={styles.cardText}>
          <Text style={[styles.appName, { color: colors.foreground }]} numberOfLines={1}>
            {app.name}
          </Text>
          <Text style={[styles.appTagline, { color: colors.primary }]} numberOfLines={1}>
            {app.tagline}
          </Text>
          <Text style={[styles.appDescription, { color: colors.mutedForeground }]} numberOfLines={2}>
            {app.description}
          </Text>
        </View>
      </View>

      <View style={[styles.cardActions, { borderTopColor: colors.border }]}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleOpenInApp}
          style={[styles.openButton, { backgroundColor: colors.primary }]}
        >
          <Ionicons name="globe-outline" size={14} color="#fff" style={{ marginRight: 5 }} />
          <Text style={styles.openButtonText}>Open in App</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleOpenExternal}
          style={[styles.externalButton, { borderColor: colors.border }]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="open-outline" size={16} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

export default function KhurkTab() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const renderItem = useCallback(
    ({ item }: { item: KhurkApp }) => <AppCard app={item} colors={colors} />,
    [colors]
  );

  const keyExtractor = useCallback((item: KhurkApp) => item.id, []);

  const ListHeader = (
    <View style={styles.listHeader}>
      <LinearGradient
        colors={["#8b5cf6", "#6366f1", "#3b82f6"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.headerAccentBar}
      />

      <View style={styles.headerContent}>
        <LinearGradient
          colors={["#a78bfa", "#818cf8"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gemIcon}
        >
          <Ionicons name="diamond" size={20} color="#fff" />
        </LinearGradient>

        <View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            KHURK OS
          </Text>
          <Text style={[styles.headerSubtitle, { color: colors.mutedForeground }]}>
            Your apps, everywhere.
          </Text>
        </View>
      </View>

      <View style={[styles.sectionDivider, { borderBottomColor: colors.border }]}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          APPS
        </Text>
        <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={KHURK_APPS}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 80 },
        ]}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
  },
  listHeader: {
    marginBottom: 8,
  },
  headerAccentBar: {
    height: 3,
    borderRadius: 2,
    marginBottom: 20,
    opacity: 0.8,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 24,
  },
  gemIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    letterSpacing: 2,
  },
  headerSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  sectionDivider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    letterSpacing: 1.5,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  separator: {
    height: 10,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 14,
    gap: 14,
  },
  iconTile: {
    width: 62,
    height: 62,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  iconInitials: {
    color: "rgba(255,255,255,0.95)",
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
  cardText: {
    flex: 1,
    justifyContent: "center",
    gap: 3,
  },
  appName: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  appTagline: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.3,
  },
  appDescription: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
    marginTop: 2,
  },
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    gap: 10,
  },
  openButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: 8,
  },
  openButtonText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  externalButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});

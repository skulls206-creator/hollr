import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Image,
  Modal,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import * as WebBrowser from "expo-web-browser";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useTheme } from "@/contexts/ThemeContext";
import { useNav } from "@/contexts/NavContext";
import { useFocusEffect } from "expo-router";
import type { ThemeColors } from "@/constants/colors";
import { KHURK_APPS, type KhurkApp } from "@/lib/khurk-apps";

const KHURK_K_LOGO = require("@/assets/images/khurk-k-logo.jpg");

const PWA_SEEN_PREFIX = "pwa_guide_seen_";

function GradientTitle() {
  return (
    <Svg height={34} width={170}>
      <Defs>
        <SvgLinearGradient id="khurkTitleGrad" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#a78bfa" />
          <Stop offset="0.5" stopColor="#818cf8" />
          <Stop offset="1" stopColor="#60a5fa" />
        </SvgLinearGradient>
      </Defs>
      <SvgText
        fill="url(#khurkTitleGrad)"
        fontSize={26}
        fontWeight="bold"
        fontFamily="Inter_700Bold"
        letterSpacing={2}
        x={0}
        y={28}
      >
        KHURK OS
      </SvgText>
    </Svg>
  );
}

function AppCard({
  app,
  colors,
  onPress,
}: {
  app: KhurkApp;
  colors: ThemeColors;
  onPress: (app: KhurkApp) => void;
}) {
  const handleOpenInBrowser = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await WebBrowser.openBrowserAsync(app.url, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      toolbarColor: colors.card,
      controlsColor: colors.primary,
      dismissButtonStyle: "close",
      enableBarCollapsing: true,
    });
  }, [app.url, colors.card, colors.primary]);

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() => onPress(app)}
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={styles.cardTop}>
        <LinearGradient
          colors={app.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.iconTile}
        >
          <Image
            source={app.icon}
            style={styles.iconImage}
            resizeMode="cover"
          />
        </LinearGradient>

        <View style={styles.cardText}>
          <Text style={[styles.appName, { color: colors.foreground }]} numberOfLines={1}>
            {app.name}
          </Text>
          <Text style={[styles.appTagline, { color: colors.primary }]} numberOfLines={1}>
            {app.tagline}
          </Text>
          <Text
            style={[styles.appDescription, { color: colors.mutedForeground }]}
            numberOfLines={2}
          >
            {app.description}
          </Text>
        </View>
      </View>

      <View style={[styles.cardActions, { borderTopColor: colors.border }]}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => onPress(app)}
          style={[styles.openButton, { backgroundColor: colors.primary }]}
        >
          {app.pwa ? (
            <>
              <Ionicons name="add-circle-outline" size={14} color="#fff" style={{ marginRight: 5 }} />
              <Text style={styles.openButtonText}>Get App</Text>
            </>
          ) : (
            <>
              <Ionicons name="globe-outline" size={14} color="#fff" style={{ marginRight: 5 }} />
              <Text style={styles.openButtonText}>Open in App</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleOpenInBrowser}
          style={[styles.externalButton, { borderColor: colors.border }]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="globe-outline" size={16} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

function PwaInstallSheet({
  app,
  colors,
  insetBottom,
  onOpenSafari,
  onNotNow,
}: {
  app: KhurkApp;
  colors: ThemeColors;
  insetBottom: number;
  onOpenSafari: () => void;
  onNotNow: () => void;
}) {
  const steps = [
    {
      icon: "safari-outline" as const,
      label: 'Tap "Open in Safari" below',
    },
    {
      icon: "share-outline" as const,
      label: "Tap the Share icon at the bottom of Safari",
    },
    {
      icon: "add-square-outline" as const,
      label: 'Tap "Add to Home Screen"',
    },
  ];

  return (
    <View style={[sheetStyles.sheet, { backgroundColor: colors.card, paddingBottom: insetBottom + 20 }]}>
      <View style={[sheetStyles.handle, { backgroundColor: colors.border }]} />

      <View style={sheetStyles.appHeader}>
        <LinearGradient
          colors={app.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={sheetStyles.appIcon}
        >
          <Image source={app.icon} style={sheetStyles.appIconImage} resizeMode="cover" />
        </LinearGradient>
        <View>
          <Text style={[sheetStyles.appName, { color: colors.foreground }]}>{app.name}</Text>
          <Text style={[sheetStyles.appTagline, { color: colors.primary }]}>{app.tagline}</Text>
        </View>
      </View>

      <Text style={[sheetStyles.title, { color: colors.foreground }]}>
        Add to Home Screen
      </Text>
      <Text style={[sheetStyles.subtitle, { color: colors.mutedForeground }]}>
        Install {app.name} as an app on your iPhone for the best experience — no App Store needed.
      </Text>

      <View style={[sheetStyles.stepsCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
        {steps.map((step, i) => (
          <View key={i}>
            <View style={sheetStyles.step}>
              <View style={[sheetStyles.stepNum, { backgroundColor: colors.primary }]}>
                <Text style={sheetStyles.stepNumText}>{i + 1}</Text>
              </View>
              <Ionicons name={step.icon} size={20} color={colors.primary} style={{ marginRight: 10 }} />
              <Text style={[sheetStyles.stepLabel, { color: colors.foreground }]}>{step.label}</Text>
            </View>
            {i < steps.length - 1 && (
              <View style={[sheetStyles.stepDivider, { backgroundColor: colors.border }]} />
            )}
          </View>
        ))}
      </View>

      <TouchableOpacity
        style={[sheetStyles.safariBtn, { backgroundColor: colors.primary }]}
        onPress={onOpenSafari}
        activeOpacity={0.85}
      >
        <Ionicons name="safari" size={18} color="#fff" style={{ marginRight: 8 }} />
        <Text style={sheetStyles.safariBtnText}>Open in Safari</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={onNotNow} activeOpacity={0.7} style={sheetStyles.notNow}>
        <Text style={[sheetStyles.notNowText, { color: colors.mutedForeground }]}>Not now</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function KhurkTab() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { setActiveSection, setActiveServerId } = useNav();
  const [sheetApp, setSheetApp] = useState<KhurkApp | null>(null);

  useFocusEffect(
    useCallback(() => {
      setActiveSection("khurk");
      setActiveServerId(null);
    }, [setActiveSection, setActiveServerId])
  );

  const handleAppPress = useCallback(async (app: KhurkApp) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!app.pwa) {
      await WebBrowser.openBrowserAsync(app.url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
        toolbarColor: colors.card,
        controlsColor: colors.primary,
        dismissButtonStyle: "close",
        enableBarCollapsing: true,
      });
      return;
    }
    const seen = await AsyncStorage.getItem(`${PWA_SEEN_PREFIX}${app.id}`);
    if (seen) {
      Linking.openURL(app.url);
    } else {
      setSheetApp(app);
    }
  }, [colors.card, colors.primary]);

  const handleOpenSafari = useCallback(async () => {
    if (!sheetApp) return;
    await AsyncStorage.setItem(`${PWA_SEEN_PREFIX}${sheetApp.id}`, "1");
    setSheetApp(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Linking.openURL(sheetApp.url);
  }, [sheetApp]);

  const handleNotNow = useCallback(() => {
    setSheetApp(null);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: KhurkApp }) => (
      <AppCard app={item} colors={colors} onPress={handleAppPress} />
    ),
    [colors, handleAppPress]
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
        <View style={styles.kLogoGlow}>
          <View style={styles.kLogoCircle}>
            <Image source={KHURK_K_LOGO} style={styles.kLogoImage} resizeMode="cover" />
          </View>
        </View>

        <View>
          <GradientTitle />
          <Text style={[styles.headerSubtitle, { color: colors.mutedForeground }]}>
            Your apps, everywhere.
          </Text>
        </View>
      </View>

      <View style={styles.sectionDivider}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          KHURK OS
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

      <Modal
        visible={!!sheetApp}
        transparent
        animationType="slide"
        onRequestClose={handleNotNow}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={handleNotNow}
        >
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            {sheetApp && (
              <PwaInstallSheet
                app={sheetApp}
                colors={colors}
                insetBottom={insets.bottom}
                onOpenSafari={handleOpenSafari}
                onNotNow={handleNotNow}
              />
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { paddingHorizontal: 16 },
  listHeader: { marginBottom: 8 },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
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
    gap: 14,
    marginBottom: 24,
  },
  kLogoGlow: {
    borderRadius: 36,
    shadowColor: "#8b5cf6",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 18,
    elevation: 18,
  },
  kLogoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: "rgba(139,92,246,0.5)",
  },
  kLogoImage: { width: 72, height: 72 },
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
  dividerLine: { flex: 1, height: 1 },
  separator: { height: 10 },
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
    overflow: "hidden",
  },
  iconImage: { width: 62, height: 62 },
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

const sheetStyles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 20,
    gap: 16,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 4,
  },
  appHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  appIcon: {
    width: 52,
    height: 52,
    borderRadius: 12,
    overflow: "hidden",
  },
  appIconImage: { width: 52, height: 52 },
  appName: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    letterSpacing: 0.3,
  },
  appTagline: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    marginTop: 2,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    lineHeight: 20,
    marginTop: -4,
  },
  stepsCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  step: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  stepNumText: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 12,
  },
  stepLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
  stepDivider: {
    height: 1,
    marginLeft: 16,
  },
  safariBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
  },
  safariBtnText: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 16,
  },
  notNow: {
    alignItems: "center",
    paddingVertical: 4,
    marginTop: -4,
  },
  notNowText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
});

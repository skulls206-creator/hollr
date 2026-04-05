import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Platform,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";

interface GhostRevealSheetProps {
  visible: boolean;
  content: string;
  onClose: () => void;
  colors: {
    background: string;
    card: string;
    foreground: string;
    mutedForeground: string;
    primary: string;
    primaryForeground: string;
    border: string;
  };
}

export function GhostRevealSheet({ visible, content, onClose, colors }: GhostRevealSheetProps) {
  const handleCopy = async () => {
    await Clipboard.setStringAsync(content);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent={Platform.OS === "android"}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>
      <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.handle, { backgroundColor: colors.border }]} />
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.foreground }]}>👻 Ghost Message</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            This message will self-destruct after closing
          </Text>
        </View>
        <View style={[styles.contentBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Text style={[styles.contentText, { color: colors.foreground }]} selectable>
            {content}
          </Text>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.button, styles.copyButton, { borderColor: colors.primary }]}
            onPress={handleCopy}
          >
            <Text style={[styles.buttonText, { color: colors.primary }]}>Copy</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.closeButton, { backgroundColor: colors.primary }]}
            onPress={onClose}
          >
            <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 12,
    gap: 16,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 4,
  },
  header: {
    gap: 4,
  },
  title: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  contentBox: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  contentText: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: "Inter_400Regular",
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  button: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  copyButton: {
    borderWidth: 1.5,
  },
  closeButton: {},
  buttonText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});

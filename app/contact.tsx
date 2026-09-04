import { Ionicons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import {
  Alert,
  Clipboard,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useThemeColors, type ThemeColors } from "../constants/theme";

const phoneDigits = "5013510651";
const phoneDisplay = "(501) 351-0651";
const messageBody = "I am interested in learning more about Jesus";

export default function ContactScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleCall = () => {
    Linking.openURL(`tel:${phoneDigits}`).catch(() => {
      Alert.alert("Unable to call", "Please try again, or copy the number below.");
    });
  };

  const handleText = () => {
    const separator = Platform.OS === "ios" ? "&" : "?";
    Linking.openURL(`sms:${phoneDigits}${separator}body=${encodeURIComponent(messageBody)}`).catch(() => {
      Alert.alert("Unable to message", "Please try again, or copy the number below.");
    });
  };

  const handleCopyPhone = async () => {
    try {
      await Clipboard.setString(phoneDigits);
      Alert.alert("Copied", `${phoneDisplay} copied.`);
    } catch {
      Alert.alert("Unable to copy", "Please try again.");
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <View style={styles.heartWrap}>
          <Ionicons name="heart" size={22} color={colors.primary} />
        </View>
        <Text style={styles.title}>You are welcome here</Text>
        <Text style={styles.subtitle}>We're glad you're using Speak the Word.</Text>
      </View>

      <Text style={styles.sectionLabel}>Why this app exists</Text>
      <View style={styles.card}>
        <Text style={styles.body}>
          Speak the Word helps you memorize Scripture by speaking it. The point isn't a score —
          it's knowing God's Word well enough to live it and share it.
        </Text>
      </View>

      <Text style={styles.sectionLabel}>Want to know Jesus?</Text>
      <View style={styles.card}>
        <Text style={styles.body}>
          If you want to know Jesus, you are not alone. He loves you, and the Bible is how we
          meet Him. If you'd like to talk with someone — about Jesus, Scripture, or finding a
          church — we'd be glad to hear from you.
        </Text>

        <Pressable
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: colors.primary, transform: [{ scale: pressed ? 0.98 : 1 }] },
          ]}
          onPress={handleText}
          accessibilityRole="button"
          accessibilityLabel="Send a message"
        >
          <Ionicons name="chatbubble" size={18} color={colors.primaryText} />
          <Text style={styles.primaryBtnText}>Send a message</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.secondaryBtn, { opacity: pressed ? 0.7 : 1 }]}
          onPress={handleCall}
          accessibilityRole="button"
          accessibilityLabel="Call"
        >
          <Ionicons name="call-outline" size={16} color={colors.primary} />
          <Text style={styles.secondaryBtnText}>Call instead</Text>
        </Pressable>

        <Pressable
          style={styles.phoneRow}
          onPress={handleCopyPhone}
          accessibilityRole="button"
          accessibilityLabel={`Phone number ${phoneDisplay}`}
        >
          <Text style={styles.phoneNumber}>{phoneDisplay}</Text>
        </Pressable>
      </View>

      <Text style={styles.verse}>
        "Thy word have I laid up in my heart, That I might not sin against thee."
      </Text>
      <Text style={styles.verseRef}>— Psalm 119:11</Text>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 20, paddingBottom: 40 },
    header: { alignItems: "center", marginBottom: 28 },
    heartWrap: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
      marginBottom: 14,
    },
    title: {
      fontSize: 26,
      fontWeight: "700",
      color: colors.text,
      textAlign: "center",
    },
    subtitle: {
      fontSize: 15,
      color: colors.textMuted,
      marginTop: 8,
      textAlign: "center",
      lineHeight: 22,
    },
    sectionLabel: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textMuted,
      marginBottom: 10,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 20,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    body: {
      fontSize: 16,
      color: colors.textSecondary,
      lineHeight: 24,
    },
    primaryBtn: {
      marginTop: 20,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
    },
    primaryBtnText: { fontSize: 16, fontWeight: "600", color: colors.primaryText },
    secondaryBtn: {
      paddingVertical: 14,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 6,
    },
    secondaryBtnText: { fontSize: 15, fontWeight: "600", color: colors.primary },
    phoneRow: {
      alignItems: "center",
      paddingTop: 8,
      marginTop: 4,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    phoneNumber: {
      fontSize: 17,
      fontWeight: "700",
      color: colors.text,
    },
    verse: {
      fontSize: 15,
      color: colors.textMuted,
      textAlign: "center",
      fontStyle: "italic",
      lineHeight: 22,
    },
    verseRef: {
      fontSize: 13,
      color: colors.textMuted,
      textAlign: "center",
      marginTop: 8,
    },
  });
}

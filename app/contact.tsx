import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import {
  Alert,
  Clipboard,
  Dimensions,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useThemeColors, type ThemeColors } from "../constants/theme";

const { width, height } = Dimensions.get("window");
const isSmallScreen = width < 400 || height < 700;
const isVerySmallScreen = width < 350 || height < 600;
const phoneNumber = "5013510651";

export default function ContactScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleCall = () => {
    Linking.openURL(`tel:${phoneNumber}`).catch(() => {
      Alert.alert("Error", "Unable to make call");
    });
  };

  const handleText = () => {
    const separator = Platform.OS === "ios" ? "&" : "?";
    Linking.openURL(
      `sms:${phoneNumber}${separator}body=${encodeURIComponent("I am interested in learning more about Jesus")}`
    ).catch(() => {
      Alert.alert("Error", "Unable to open messaging app");
    });
  };

  const handleCopyPhone = async () => {
    try {
      await Clipboard.setString(phoneNumber);
      Alert.alert("Copied", "Phone number copied to clipboard");
    } catch {
      Alert.alert("Error", "Unable to copy phone number");
    }
  };

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
        <Ionicons name="close" size={28} color={colors.text} />
      </TouchableOpacity>
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Ionicons name="heart" size={isVerySmallScreen ? 40 : isSmallScreen ? 50 : 60} color={colors.primary} />
          <Text style={styles.title}>Thank You!</Text>
          <Text style={styles.subtitle}>
            Thank you for using Speak the Word. We're glad you're here to internalize and share God's Word.
          </Text>
        </View>
        <View style={styles.goalSection}>
          <Text style={styles.sectionTitle}>Our goal</Text>
          <Text style={styles.goalText}>
            Speak the Word isn't only about memorizing verses—it's about internalizing Scripture so you can live it, share the message of Jesus with others, and grow in your faith. We speak the Word to keep it in our hearts and to spread it to the world.
          </Text>
        </View>
        <View style={styles.content}>
          <Text style={styles.sectionTitle}>Get in Touch</Text>
          <Text style={styles.description}>
            If you'd like to learn more about Jesus, the Bible, or how to be part of a church family, we'd love to hear from you.
          </Text>
          <View style={styles.contactButtons}>
            <TouchableOpacity style={styles.contactButton} onPress={handleCall}>
              <Ionicons name="call" size={isVerySmallScreen ? 18 : 22} color="#fff" />
              <Text style={styles.buttonText}>Call Us</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.contactButton, styles.textButton]} onPress={handleText}>
              <Ionicons name="chatbubble" size={isVerySmallScreen ? 18 : 22} color="#fff" />
              <Text style={styles.buttonText}>Send Message</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.phoneInfo}>
            <Text style={styles.phoneLabel}>Phone Number:</Text>
            <TouchableOpacity onLongPress={handleCopyPhone}>
              <Text style={styles.phoneNumber}>{phoneNumber}</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            "Thy word have I laid up in my heart, That I might not sin against thee."{"\n"}— Psalm 119:11
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrapper: { flex: 1, backgroundColor: colors.background },
    closeBtn: {
      position: "absolute",
      top: 56,
      right: 20,
      zIndex: 10,
      padding: 8,
    },
    container: { flex: 1 },
    scrollContent: {
      flexGrow: 1,
      padding: isVerySmallScreen ? 10 : 20,
      paddingTop: isVerySmallScreen ? 60 : 80,
    },
    header: {
      alignItems: "center",
      marginBottom: isVerySmallScreen ? 20 : 40,
    },
    title: {
      fontSize: isVerySmallScreen ? 24 : 32,
      fontWeight: "bold",
      color: colors.text,
      marginTop: isVerySmallScreen ? 10 : 20,
      marginBottom: isVerySmallScreen ? 8 : 15,
      textAlign: "center",
    },
    subtitle: {
      fontSize: isVerySmallScreen ? 12 : 16,
      color: colors.textMuted,
      textAlign: "center",
      lineHeight: isVerySmallScreen ? 18 : 24,
      paddingHorizontal: isVerySmallScreen ? 5 : 20,
    },
    goalSection: {
      marginBottom: isVerySmallScreen ? 20 : 28,
    },
    goalText: {
      fontSize: isVerySmallScreen ? 12 : 15,
      color: colors.textSecondary,
      textAlign: "center",
      lineHeight: isVerySmallScreen ? 18 : 22,
      paddingHorizontal: isVerySmallScreen ? 8 : 24,
    },
    content: {
      flex: 1,
    },
    sectionTitle: {
      fontSize: isVerySmallScreen ? 18 : 24,
      fontWeight: "bold",
      color: colors.text,
      textAlign: "center",
      marginBottom: isVerySmallScreen ? 8 : 15,
    },
    description: {
      fontSize: isVerySmallScreen ? 12 : 16,
      color: colors.textMuted,
      textAlign: "center",
      lineHeight: isVerySmallScreen ? 18 : 24,
      marginBottom: isVerySmallScreen ? 15 : 30,
      paddingHorizontal: isVerySmallScreen ? 5 : 20,
    },
    contactButtons: {
      flexDirection: isSmallScreen ? "column" : "row",
      justifyContent: "space-between",
      marginBottom: isVerySmallScreen ? 15 : 30,
      gap: 12,
    },
    contactButton: {
      backgroundColor: colors.primary,
      paddingVertical: isVerySmallScreen ? 10 : 15,
      paddingHorizontal: isVerySmallScreen ? 15 : 25,
      borderRadius: 12,
      alignItems: "center",
      flexDirection: "row",
      flex: isSmallScreen ? 0 : 1,
      justifyContent: "center",
    },
    textButton: { backgroundColor: colors.success },
    buttonText: {
      color: colors.primaryText,
      fontSize: isVerySmallScreen ? 12 : 16,
      fontWeight: "600",
      marginLeft: 8,
    },
    phoneInfo: {
      alignItems: "center",
      backgroundColor: colors.surface,
      padding: isVerySmallScreen ? 12 : 20,
      borderRadius: 12,
      marginHorizontal: isVerySmallScreen ? 5 : 20,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    phoneLabel: {
      fontSize: isVerySmallScreen ? 10 : 14,
      color: colors.textMuted,
      marginBottom: 5,
    },
    phoneNumber: {
      fontSize: isVerySmallScreen ? 14 : 18,
      fontWeight: "bold",
      color: colors.text,
    },
    footer: {
      alignItems: "center",
      marginBottom: 30,
    },
    footerText: {
      fontSize: isVerySmallScreen ? 10 : 14,
      color: colors.textMuted,
      textAlign: "center",
      fontStyle: "italic",
      lineHeight: isVerySmallScreen ? 16 : 20,
    },
  });
}

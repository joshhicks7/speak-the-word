import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useThemeColors, type ThemeColors } from "../constants/theme";
import { setTutorialDone } from "../utils/onboarding";

const INTRO_VERSE = "Thy word have I laid up in my heart, That I might not sin against thee.";
const INTRO_REF = "Psalm 119:11";

export default function IntroScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleGetStarted = async () => {
    await setTutorialDone();
    router.replace("/(tabs)");
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.welcome}>Welcome to Speak the Word</Text>
        <Text style={styles.tagline}>Memorize Scripture by speaking or typing</Text>
        <View style={styles.verseCard}>
          <Text style={styles.verseText}>"{INTRO_VERSE}"</Text>
          <Text style={styles.verseRef}>— {INTRO_REF}</Text>
        </View>
        <Text style={styles.tutorial}>
          Each day you'll get a Verse of the Day. Tap it to practice by speaking or typing. Your progress is saved. In the Practice tab you can work through your favorite verses.
        </Text>
      </View>
      <TouchableOpacity style={styles.button} onPress={handleGetStarted}>
        <Text style={styles.buttonText}>Get Started</Text>
      </TouchableOpacity>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      padding: 24,
      justifyContent: "space-between",
    },
    content: { flex: 1, justifyContent: "center" },
    welcome: {
      fontSize: 28,
      fontWeight: "700",
      color: colors.text,
      textAlign: "center",
      marginBottom: 8,
    },
    tagline: {
      fontSize: 16,
      color: colors.textMuted,
      textAlign: "center",
      marginBottom: 32,
    },
    verseCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 24,
      marginBottom: 28,
      borderLeftWidth: 4,
      borderLeftColor: colors.primary,
    },
    verseText: {
      fontSize: 18,
      color: colors.textSecondary,
      lineHeight: 28,
      fontStyle: "italic",
      marginBottom: 12,
    },
    verseRef: {
      fontSize: 14,
      color: colors.textMuted,
    },
    tutorial: {
      fontSize: 15,
      color: colors.textMuted,
      lineHeight: 24,
      textAlign: "center",
      paddingHorizontal: 8,
    },
    button: {
      backgroundColor: colors.primary,
      paddingVertical: 16,
      borderRadius: 12,
      alignItems: "center",
    },
    buttonText: {
      fontSize: 18,
      fontWeight: "600",
      color: colors.primaryText,
    },
  });
}

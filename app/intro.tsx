import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors, type ThemeColors } from "../constants/theme";
import { getVerseByBookChapterVerse } from "../database/queries";
import { setTutorialDone } from "../utils/onboarding";

const INTRO_VERSE = "Thy word have I laid up in my heart, That I might not sin against thee.";
const INTRO_REF = "Psalm 119:11";
const INTRO_BOOK = 19;
const INTRO_CHAPTER = 119;
const INTRO_VERSE_NUM = 11;

export default function IntroScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [opening, setOpening] = useState(false);

  const goHome = async () => {
    await setTutorialDone();
    router.replace("/(tabs)");
  };

  const handleSpeakVerse = async () => {
    if (opening) return;
    setOpening(true);
    try {
      const verse = await getVerseByBookChapterVerse(INTRO_BOOK, INTRO_CHAPTER, INTRO_VERSE_NUM);
      if (!verse) {
        Alert.alert("Verse unavailable", "We couldn't open Psalm 119:11. Continuing to home.");
        await goHome();
        return;
      }
      await setTutorialDone();
      router.replace({
        pathname: "/practice-game",
        params: { verseId: verse.id, mode: "speech", source: "intro" },
      });
    } catch {
      setOpening(false);
      Alert.alert("Something went wrong", "Please try again, or continue to home.");
    }
  };

  return (
    <View
      style={[
        styles.container,
        { paddingTop: Math.max(insets.top, 24), paddingBottom: Math.max(insets.bottom, 16) },
      ]}
    >
      <View style={styles.content}>
        <Text style={styles.welcome}>Welcome to Speak the Word</Text>
        <Text style={styles.tagline}>Memorize by speaking so the Word lives in you.</Text>
        <View style={styles.verseCard}>
          <Text style={styles.verseText}>"{INTRO_VERSE}"</Text>
          <Text style={styles.verseRef}>— {INTRO_REF}</Text>
        </View>
        <Text style={styles.invitation}>This Word is for your heart. Begin by speaking it.</Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.button, opening && { opacity: colors.disabledOpacity }]}
          onPress={handleSpeakVerse}
          activeOpacity={0.85}
          disabled={opening}
        >
          {opening ? (
            <ActivityIndicator color={colors.primaryText} />
          ) : (
            <Text style={styles.buttonText}>Speak this verse</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={goHome} activeOpacity={0.7}>
          <Text style={styles.secondaryBtnText}>Continue to home</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: 24,
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
      lineHeight: 24,
      marginBottom: 32,
      paddingHorizontal: 8,
    },
    verseCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 28,
      marginBottom: 24,
      borderLeftWidth: 4,
      borderLeftColor: colors.primary,
    },
    verseText: {
      fontSize: 22,
      color: colors.textSecondary,
      lineHeight: 34,
      fontStyle: "italic",
      marginBottom: 16,
    },
    verseRef: {
      fontSize: 15,
      color: colors.textMuted,
    },
    invitation: {
      fontSize: 15,
      color: colors.textMuted,
      lineHeight: 22,
      textAlign: "center",
      paddingHorizontal: 12,
    },
    actions: { gap: 8 },
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
    secondaryBtn: {
      paddingVertical: 14,
      alignItems: "center",
    },
    secondaryBtnText: {
      fontSize: 16,
      color: colors.textMuted,
      fontWeight: "500",
    },
  });
}

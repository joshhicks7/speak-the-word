import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors, type ThemeColors } from "../../constants/theme";
import {
  getNextUncompletedVerse,
  getCompletedVersesOrdered,
  getLearningStats,
} from "../../database/queries";
import type { GameVerse } from "../../types/verse";

export default function LevelsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [nextVerse, setNextVerse] = useState<GameVerse | null>(null);
  const [completed, setCompleted] = useState<GameVerse[]>([]);
  const [stats, setStats] = useState({ completed: 0, percent: 0 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [next, completedList, learning] = await Promise.all([
      getNextUncompletedVerse(),
      getCompletedVersesOrdered(100),
      getLearningStats(),
    ]);
    setNextVerse(next);
    setCompleted(completedList);
    setStats({ completed: learning.completed, percent: learning.percent });
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openVerse = useCallback(
    (verseId: string) => {
      router.push({
        pathname: "/practice-game",
        params: { verseId, mode: "speech" },
      });
    },
    [router]
  );

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const progressWidth = Math.min(100, Math.max(0, stats.percent));
  const progressLabel =
    stats.completed === 0
      ? "Ready to begin"
      : stats.completed === 1
        ? "1 verse completed"
        : `${stats.completed} verses completed`;
  const nextLevelNumber = stats.completed + 1;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 16) }]}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Levels</Text>
        <Text style={styles.progressLabel}>{progressLabel}</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressWidth}%` }]} />
        </View>
      </View>

      <Text style={styles.sectionLabel}>Your next verse</Text>
      {nextVerse ? (
        <TouchableOpacity
          style={styles.nextCard}
          onPress={() => openVerse(nextVerse.id)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Level ${nextLevelNumber}. ${nextVerse.reference}. Speak this verse`}
        >
          <Text style={styles.levelBadge}>Level {nextLevelNumber}</Text>
          <Text style={styles.nextRef}>{nextVerse.reference}</Text>
          <Text style={styles.nextPreview} numberOfLines={3}>
            {nextVerse.text}
          </Text>
          <View style={styles.ctaRow}>
            <Text style={styles.cta}>Speak this verse</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.primary} />
          </View>
        </TouchableOpacity>
      ) : (
        <View style={styles.emptyCard}>
          <Ionicons name="checkmark-circle" size={40} color={colors.success} />
          <Text style={styles.emptyText}>You've spoken every verse</Text>
          <Text style={styles.emptyHint}>
            Keep practicing them, or add verses about Jesus in My Challenges.
          </Text>
        </View>
      )}

      {completed.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>Completed</Text>
          {completed.map((v) => (
            <TouchableOpacity
              key={v.id}
              style={styles.levelRow}
              onPress={() => openVerse(v.id)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${v.reference}. Speak again`}
            >
              <Ionicons
                name="checkmark-circle"
                size={20}
                color={colors.success}
                style={styles.completedIcon}
              />
              <Text style={styles.levelRef}>{v.reference}</Text>
              {v.completionScore != null && (
                <Text style={styles.levelScore}>{v.completionScore}%</Text>
              )}
              <Text style={styles.levelPreview} numberOfLines={1}>
                {v.text}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          ))}
        </>
      )}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 20, paddingBottom: 40 },
    centered: { flex: 1, justifyContent: "center", alignItems: "center" },
    header: { marginBottom: 28 },
    title: { fontSize: 26, fontWeight: "700", color: colors.text },
    progressLabel: {
      fontSize: 15,
      color: colors.textMuted,
      marginTop: 8,
      marginBottom: 12,
    },
    progressTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.border,
      overflow: "hidden",
    },
    progressFill: {
      height: "100%",
      borderRadius: 3,
      backgroundColor: colors.primary,
    },
    sectionLabel: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textMuted,
      marginBottom: 10,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    nextCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 20,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
      borderLeftWidth: 4,
      borderLeftColor: colors.primary,
    },
    levelBadge: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.textMuted,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 8,
    },
    nextRef: { fontSize: 15, fontWeight: "600", color: colors.primary, marginBottom: 8 },
    nextPreview: { fontSize: 16, color: colors.textSecondary, lineHeight: 24, marginBottom: 16 },
    ctaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    cta: { fontSize: 15, fontWeight: "600", color: colors.primary },
    emptyCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 24,
      marginBottom: 24,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    emptyText: { fontSize: 16, color: colors.text, fontWeight: "600", marginTop: 12, textAlign: "center" },
    emptyHint: {
      fontSize: 14,
      color: colors.textMuted,
      marginTop: 8,
      textAlign: "center",
      lineHeight: 20,
    },
    levelRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      padding: 14,
      borderRadius: 12,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    completedIcon: { marginRight: 8 },
    levelRef: { fontSize: 14, fontWeight: "600", color: colors.primary, width: 90 },
    levelScore: { fontSize: 13, fontWeight: "600", color: colors.successText, marginRight: 8 },
    levelPreview: { flex: 1, fontSize: 13, color: colors.textMuted, marginHorizontal: 4 },
  });
}

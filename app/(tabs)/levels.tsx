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
import { useThemeColors, type ThemeColors } from "../../constants/theme";
import { getNextUncompletedVerse, getCompletedVersesOrdered } from "../../database/queries";
import type { GameVerse } from "../../types/verse";

export default function LevelsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [nextVerse, setNextVerse] = useState<GameVerse | null>(null);
  const [completed, setCompleted] = useState<GameVerse[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [next, completedList] = await Promise.all([
      getNextUncompletedVerse(),
      getCompletedVersesOrdered(100),
    ]);
    setNextVerse(next);
    setCompleted(completedList);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Levels</Text>
        <Text style={styles.subtitle}>Shortest verses first. Tap to practice.</Text>
      </View>

      <Text style={styles.sectionLabel}>Next level</Text>
      {nextVerse ? (
        <TouchableOpacity
          style={styles.nextCard}
          onPress={() =>
            router.push({
              pathname: "/practice-game",
              params: { verseId: nextVerse.id, mode: "speech" },
            })
          }
          activeOpacity={0.85}
        >
          <Text style={styles.nextRef}>{nextVerse.reference}</Text>
          <Text style={styles.nextPreview} numberOfLines={2}>{nextVerse.text}</Text>
          <View style={styles.ctaRow}>
            <Text style={styles.cta}>Start</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.primary} />
          </View>
        </TouchableOpacity>
      ) : (
        <View style={styles.emptyCard}>
          <Ionicons name="checkmark-circle" size={40} color={colors.success} />
          <Text style={styles.emptyText}>You've completed all levels so far!</Text>
          <Text style={styles.emptyHint}>Complete verses to unlock more levels.</Text>
        </View>
      )}

      {completed.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>Completed</Text>
          {completed.map((v) => (
            <TouchableOpacity
              key={v.id}
              style={styles.levelRow}
              onPress={() =>
                router.push({
                  pathname: "/practice-game",
                  params: { verseId: v.id, mode: "speech" },
                })
              }
              activeOpacity={0.7}
            >
              <Ionicons name="checkmark-circle" size={20} color={colors.success} style={styles.completedIcon} />
              <Text style={styles.levelRef}>{v.reference}</Text>
              {v.completionScore != null && (
                <Text style={styles.levelScore}>{v.completionScore}%</Text>
              )}
              <Text style={styles.levelPreview} numberOfLines={1}>{v.text}</Text>
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
    header: { marginBottom: 24 },
    title: { fontSize: 26, fontWeight: "700", color: colors.text, marginBottom: 6 },
    subtitle: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
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
    nextRef: { fontSize: 15, fontWeight: "600", color: colors.primary, marginBottom: 8 },
    nextPreview: { fontSize: 14, color: colors.textMuted, lineHeight: 20, marginBottom: 12 },
    ctaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    cta: { fontSize: 14, color: colors.primary, fontWeight: "500" },
    emptyCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 24,
      marginBottom: 24,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    emptyText: { fontSize: 16, color: colors.text, fontWeight: "500", marginTop: 12 },
    emptyHint: { fontSize: 14, color: colors.textMuted, marginTop: 6 },
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

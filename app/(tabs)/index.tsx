import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useThemeColors, type ThemeColors } from "../../constants/theme";
import { getVerseById, getNextUncompletedVerse, getLearningStats, getStreakStats } from "../../database/queries";
import { getTodayDate, getStoredVerseOfTheDay, setVerseOfTheDay } from "../../utils/verseOfTheDay";
import type { GameVerse } from "../../types/verse";

export default function HomeScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const [verse, setVerse] = useState<GameVerse | null>(null);
  const [stats, setStats] = useState<{ totalVerses: number; completed: number; percent: number; mostLearnedBook: string | null; perfectCount: number }>({ totalVerses: 0, completed: 0, percent: 0, mostLearnedBook: null, perfectCount: 0 });
  const [streaks, setStreaks] = useState<{ currentStreak: number; longestStreak: number }>({ currentStreak: 0, longestStreak: 0 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const today = getTodayDate();
    const stored = await getStoredVerseOfTheDay(today);
    if (stored?.verseId) {
      const v = await getVerseById(stored.verseId);
      if (v) {
        setVerse(v);
        const [s, streakData] = await Promise.all([getLearningStats(), getStreakStats()]);
        setStats(s);
        setStreaks(streakData);
        setLoading(false);
        return;
      }
    }
    const next = await getNextUncompletedVerse();
    if (next) {
      setVerse(next);
      await setVerseOfTheDay(today, next.id);
    }
    const [s, streakData] = await Promise.all([getLearningStats(), getStreakStats()]);
    setStats(s);
    setStreaks(streakData);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const styles = useMemo(() => createStyles(colors), [colors]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const votdCompleted = verse?.isCompleted ?? false;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Speak the Word</Text>
        <TouchableOpacity
          style={styles.helpBtn}
          onPress={() => router.push("/contact")}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="help-circle" size={28} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionLabel}>Verse of the Day</Text>
      {verse ? (
        <TouchableOpacity
          style={styles.votdCard}
          onPress={() =>
            router.push({
              pathname: "/practice-game",
              params: { verseId: verse.id, mode: "speech", source: "votd" },
            })
          }
          activeOpacity={0.85}
        >
          {votdCompleted && (
            <View style={styles.completedBadge}>
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <Text style={styles.completedBadgeText}>Completed</Text>
            </View>
          )}
          <Text style={styles.ref}>{verse.reference}</Text>
          <Text style={styles.verseText} numberOfLines={4}>
            {verse.text}
          </Text>
          <View style={styles.ctaRow}>
            <Text style={styles.cta}>{votdCompleted ? "Tap to practice again" : "Tap to practice"}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.primary} />
          </View>
        </TouchableOpacity>
      ) : (
        <View style={styles.votdCard}>
          <Text style={styles.empty}>All set for today. Come back tomorrow for a new verse!</Text>
        </View>
      )}

      <Text style={styles.sectionLabel}>Your stats</Text>
      <View style={styles.statsCard}>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Percentage of Bible learned</Text>
          <Text style={styles.statValue}>{stats.percent}%</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Total verses learned</Text>
          <Text style={styles.statValue}>{stats.completed}</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Perfect lessons (100%)</Text>
          <Text style={styles.statValue}>{stats.perfectCount}</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Current streak (days)</Text>
          <Text style={styles.statValue}>{streaks.currentStreak}</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Longest streak (days)</Text>
          <Text style={styles.statValue}>{streaks.longestStreak}</Text>
        </View>
        {stats.mostLearnedBook !== null && (
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Most learned book</Text>
            <Text style={styles.statValue}>{stats.mostLearnedBook}</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 20, paddingBottom: 40 },
    centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 24,
    },
    title: { fontSize: 26, fontWeight: "700", color: colors.text },
    helpBtn: { padding: 4 },
    sectionLabel: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textMuted,
      marginBottom: 10,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    votdCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 20,
      marginBottom: 28,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 3,
      elevation: 2,
    },
    completedBadge: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
    completedBadgeText: { fontSize: 13, fontWeight: "600", color: colors.successText },
    ref: { fontSize: 15, fontWeight: "600", color: colors.primary, marginBottom: 10 },
    verseText: { fontSize: 16, color: colors.textSecondary, lineHeight: 24, marginBottom: 14 },
    ctaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    cta: { fontSize: 14, color: colors.primary, fontWeight: "500" },
    empty: { fontSize: 15, color: colors.textMuted, textAlign: "center" },
    statsCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 20,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    statRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    statLabel: { fontSize: 15, color: colors.textMuted },
    statValue: { fontSize: 16, color: colors.text, fontWeight: "600" },
  });
}

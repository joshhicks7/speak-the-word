import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors, type ThemeColors } from "../../constants/theme";
import { CommandMicListener } from "../../components/CommandMicListener";
import { HubPendingVerseBanner } from "../../components/HubPendingVerseBanner";
import { useAppVoice } from "../../context/AppVoiceProvider";
import {
  getVerseById,
  getNextUncompletedVerse,
  getLearningStats,
  getStreakStats,
  getBooks,
  type BibleBook,
} from "../../database/queries";
import speechWrapper from "../../lib/speechRecognitionWrapper";
import { processHubVerseVoice } from "../../lib/hubVerseVoice";
import { pickBestReferenceTranscript } from "../../lib/parseScriptureReference";
import { parseGlobalCommand } from "../../lib/voiceCommands";
import { getTodayDate, getStoredVerseOfTheDay, setVerseOfTheDay } from "../../utils/verseOfTheDay";
import type { GameVerse } from "../../types/verse";

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const [verse, setVerse] = useState<GameVerse | null>(null);
  const [nextVerse, setNextVerse] = useState<GameVerse | null>(null);
  const [stats, setStats] = useState<{ totalVerses: number; completed: number; percent: number; mostLearnedBook: string | null; perfectCount: number }>({ totalVerses: 0, completed: 0, percent: 0, mostLearnedBook: null, perfectCount: 0 });
  const [streaks, setStreaks] = useState<{ currentStreak: number; longestStreak: number }>({ currentStreak: 0, longestStreak: 0 });
  const [loading, setLoading] = useState(true);
  const [homeVoiceListen, setHomeVoiceListen] = useState(false);
  const [pendingVerse, setPendingVerse] = useState<GameVerse | null>(null);
  const [pendingPracticeVerseIds, setPendingPracticeVerseIds] = useState<string[] | null>(null);
  const [bibleBooks, setBibleBooks] = useState<BibleBook[]>([]);
  const { prefs, setEnabled, speak, stopSpeak, speechActive } = useAppVoice();
  const handsFree = prefs.handsFreeEnabled && speechWrapper.available;

  const announceHome = useCallback(
    async (v: GameVerse) => {
      if (!handsFree) return;
      if (prefs.speakScreenContext) {
        await speak(
          `Home. Today's verse is ${v.reference}. Say a reference like Matthew 6 33, today's verse, levels, or settings.`
        );
      }
      setHomeVoiceListen(true);
    },
    [handsFree, prefs.speakScreenContext, speak]
  );

  const load = useCallback(async () => {
    const today = getTodayDate();
    const stored = await getStoredVerseOfTheDay(today);
    if (stored?.verseId) {
      const v = await getVerseById(stored.verseId);
      if (v) {
        setVerse(v);
        const [s, streakData, next] = await Promise.all([
          getLearningStats(),
          getStreakStats(),
          getNextUncompletedVerse(),
        ]);
        setStats(s);
        setStreaks(streakData);
        setNextVerse(next && next.id !== v.id ? next : null);
        setLoading(false);
        void announceHome(v);
        return;
      }
    }
    const nextUncompleted = await getNextUncompletedVerse();
    if (nextUncompleted) {
      setVerse(nextUncompleted);
      await setVerseOfTheDay(today, nextUncompleted.id);
    } else {
      setVerse(null);
    }
    const [s, streakData] = await Promise.all([getLearningStats(), getStreakStats()]);
    setStats(s);
    setStreaks(streakData);
    setNextVerse(null);
    setLoading(false);
    if (nextUncompleted) void announceHome(nextUncompleted);
  }, [announceHome]);

  useEffect(() => {
    void getBooks().then(setBibleBooks);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      return () => {
        stopSpeak();
        setHomeVoiceListen(false);
        setPendingVerse(null);
        setPendingPracticeVerseIds(null);
      };
    }, [load, stopSpeak])
  );

  const handleHomeVoice = useCallback(
    async (text: string) => {
      await processHubVerseVoice(text, {
        bibleBooks,
        pendingVerse,
        setPendingVerse,
        pendingPracticeVerseIds,
        setPendingPracticeVerseIds,
        router,
        speak,
        stopSpeak,
        setListening: setHomeVoiceListen,
        practiceAsChallenge: true,
        onHandsFreeOff: async () => {
          await setEnabled(false);
        },
        handleBeforeFallback: async (spoken) => {
          if (parseGlobalCommand(spoken) === "today" && verse) {
            router.push({
              pathname: "/practice-game",
              params: { session: "level", verseId: verse.id, mode: "speech", source: "votd" },
            });
            return true;
          }
          return false;
        },
      });
    },
    [bibleBooks, pendingVerse, pendingPracticeVerseIds, router, verse, speak, stopSpeak, setEnabled]
  );

  const pickReferenceTranscript = useCallback(
    (primary: string, alternatives: string[]) =>
      pickBestReferenceTranscript(primary, alternatives, bibleBooks),
    [bibleBooks]
  );

  const styles = useMemo(() => createStyles(colors), [colors]);

  const openTodayVerse = useCallback(() => {
    if (!verse) return;
    router.push({
      pathname: "/practice-game",
      params: { session: "level", verseId: verse.id, mode: "speech", source: "votd" },
    });
  }, [router, verse]);

  const practiceAnother = useCallback(() => {
    if (nextVerse) {
      router.push({
        pathname: "/practice-game",
        params: { session: "level", verseId: nextVerse.id, mode: "speech" },
      });
      return;
    }
    router.push("/(tabs)/levels");
  }, [nextVerse, router]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const votdCompleted = verse?.isCompleted ?? false;
  const progressWidth = Math.min(100, Math.max(0, stats.percent));
  const streakTitle = "Streak";
  const streakHint =
    streaks.currentStreak === 0
      ? "Speak today's verse to start."
      : streaks.currentStreak === 1
        ? "1 day — back tomorrow."
        : `${streaks.currentStreak} days — back tomorrow.`;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 16) }]}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Speak the Word</Text>
          <Text style={styles.welcome}>
            {votdCompleted ? "Nice work today." : "Your verse for today."}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => router.push("/settings")}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Settings"
          >
            <Ionicons name="settings-outline" size={22} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.aboutBtn}
            onPress={() => router.push("/contact")}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="About Jesus"
          >
            <Ionicons name="heart" size={18} color={colors.primary} />
            <Text style={styles.aboutBtnText}>About</Text>
          </TouchableOpacity>
        </View>
      </View>

      {pendingVerse ? <HubPendingVerseBanner reference={pendingVerse.reference} /> : null}

      {verse ? (
        <View style={[styles.votdCard, votdCompleted && styles.votdCardDone]}>
          {votdCompleted ? (
            <View style={styles.doneBanner}>
              <Ionicons name="checkmark-circle" size={22} color={colors.success} />
              <View style={styles.doneBannerCopy}>
                <Text style={styles.faithfulnessNote}>Completed today</Text>
                {verse.completionScore != null ? (
                  <Text style={styles.doneScore}>{verse.completionScore}%</Text>
                ) : null}
              </View>
            </View>
          ) : null}
          <Text style={styles.ref}>{verse.reference}</Text>
          <Text style={[styles.verseText, votdCompleted && styles.verseTextDone]}>{verse.text}</Text>
          {votdCompleted ? (
            <>
              <Pressable
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { backgroundColor: colors.primary, transform: [{ scale: pressed ? 0.98 : 1 }] },
                ]}
                onPress={practiceAnother}
                accessibilityRole="button"
                accessibilityLabel="Practice another verse"
              >
                <Text style={styles.primaryBtnText}>Practice another verse</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.secondaryBtn, { opacity: pressed ? 0.7 : 1 }]}
                onPress={openTodayVerse}
                accessibilityRole="button"
                accessibilityLabel="Speak it again"
              >
                <Text style={styles.secondaryBtnText}>Speak it again</Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: colors.primary, transform: [{ scale: pressed ? 0.98 : 1 }] },
              ]}
              onPress={openTodayVerse}
              accessibilityRole="button"
              accessibilityLabel="Speak today's verse"
            >
              <Text style={styles.primaryBtnText}>Speak today's verse</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <View style={styles.votdCard}>
          <Text style={styles.empty}>Come back tomorrow for a new verse.</Text>
        </View>
      )}

      <Text style={styles.sectionLabel}>Your progress</Text>
      <View style={styles.statsCard}>
        <View style={styles.streakRow}>
          <View style={[styles.streakIcon, streaks.currentStreak > 0 && styles.streakIconActive]}>
            <Ionicons
              name="flame"
              size={22}
              color={streaks.currentStreak > 0 ? colors.warning : colors.textMuted}
            />
          </View>
          <View style={styles.streakCopy}>
            <Text style={styles.streakTitle}>{streakTitle}</Text>
            <Text style={styles.streakHint}>{streakHint}</Text>
          </View>
        </View>
        <View style={styles.statGrid}>
          <View style={[styles.statCell, styles.statCellBorderRight, styles.statCellBorderBottom]}>
            <Text style={styles.statPillValue}>{stats.completed}</Text>
            <Text style={styles.statPillLabel}>Completed</Text>
          </View>
          <View style={[styles.statCell, styles.statCellBorderBottom]}>
            <Text style={styles.statPillValue}>{stats.perfectCount}</Text>
            <Text style={styles.statPillLabel}>Perfect</Text>
          </View>
          <View style={[styles.statCell, styles.statCellBorderRight]}>
            <Text style={styles.statPillValue}>{streaks.longestStreak}</Text>
            <Text style={styles.statPillLabel}>Longest streak</Text>
          </View>
          <View style={styles.statCell}>
            <Text style={styles.statPillValue}>{stats.percent}%</Text>
            <Text style={styles.statPillLabel}>Progress</Text>
          </View>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressWidth}%` }]} />
        </View>
        {stats.mostLearnedBook != null ? (
          <Text style={styles.bookHint}>Most practiced: {stats.mostLearnedBook}</Text>
        ) : null}
      </View>
      <CommandMicListener
        active={handsFree && homeVoiceListen && !speechActive}
        verseMenuPending={pendingVerse != null}
        pickReferenceTranscript={pickReferenceTranscript}
        onTranscript={(t) => void handleHomeVoice(t)}
      />
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
      alignItems: "flex-start",
      justifyContent: "space-between",
      marginBottom: 24,
    },
    headerText: { flex: 1, marginRight: 12 },
    title: { fontSize: 26, fontWeight: "700", color: colors.text },
    welcome: { fontSize: 15, color: colors.textMuted, marginTop: 6, lineHeight: 22 },
    headerActions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
    headerIconBtn: {
      padding: 8,
      borderRadius: 20,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    aboutBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 20,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    aboutBtnText: { fontSize: 14, fontWeight: "600", color: colors.primary },
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
      borderLeftWidth: 4,
      borderLeftColor: colors.primary,
    },
    votdCardDone: {
      borderLeftColor: colors.success,
    },
    doneBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 14,
    },
    doneBannerCopy: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
    faithfulnessNote: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.successText,
      flex: 1,
    },
    doneScore: { fontSize: 15, fontWeight: "700", color: colors.successText },
    ref: { fontSize: 15, fontWeight: "600", color: colors.primary, marginBottom: 10 },
    verseText: { fontSize: 17, color: colors.textSecondary, lineHeight: 26, marginBottom: 20 },
    verseTextDone: { color: colors.textMuted },
    primaryBtn: {
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: "center",
    },
    primaryBtnText: { fontSize: 16, fontWeight: "600", color: colors.primaryText },
    secondaryBtn: { paddingVertical: 14, alignItems: "center" },
    secondaryBtnText: { fontSize: 15, fontWeight: "600", color: colors.primary },
    empty: { fontSize: 15, color: colors.textMuted, textAlign: "center" },
    statsCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    streakRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingBottom: 16,
      marginBottom: 4,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    streakIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.border,
    },
    streakIconActive: {
      backgroundColor: colors.warning + "22",
    },
    streakCopy: { flex: 1 },
    streakTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
    streakHint: { fontSize: 13, color: colors.textMuted, marginTop: 2, lineHeight: 18 },
    statGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
    },
    statCell: {
      width: "50%",
      paddingVertical: 14,
      alignItems: "center",
    },
    statCellBorderRight: {
      borderRightWidth: 1,
      borderRightColor: colors.border,
    },
    statCellBorderBottom: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    statPillValue: { fontSize: 22, fontWeight: "700", color: colors.text },
    statPillLabel: { fontSize: 12, color: colors.textMuted, marginTop: 4, textAlign: "center" },
    progressTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.border,
      overflow: "hidden",
      marginTop: 12,
    },
    progressFill: {
      height: "100%",
      borderRadius: 3,
      backgroundColor: colors.primary,
    },
    bookHint: {
      fontSize: 13,
      color: colors.textMuted,
      marginTop: 12,
      textAlign: "center",
    },
  });
}

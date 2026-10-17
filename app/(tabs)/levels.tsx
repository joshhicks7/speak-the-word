import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  getBooks,
  type BibleBook,
} from "../../database/queries";
import type { GameVerse } from "../../types/verse";
import { CommandMicListener } from "../../components/CommandMicListener";
import { HubPendingVerseBanner } from "../../components/HubPendingVerseBanner";
import { useAppVoice } from "../../context/AppVoiceProvider";
import speechWrapper from "../../lib/speechRecognitionWrapper";
import { processHubVerseVoice } from "../../lib/hubVerseVoice";
import {
  isBareLevelsStartCommand,
  parseGlobalCommand,
} from "../../lib/voiceCommands";
import {
  looksLikeScriptureReferenceAttempt,
  pickBestReferenceTranscript,
  utteranceContainsScriptureReference,
} from "../../lib/parseScriptureReference";

export default function LevelsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [nextVerse, setNextVerse] = useState<GameVerse | null>(null);
  const [completed, setCompleted] = useState<GameVerse[]>([]);
  const [stats, setStats] = useState({ completed: 0, percent: 0 });
  const [loading, setLoading] = useState(true);
  const [levelsVoiceListen, setLevelsVoiceListen] = useState(false);
  const [pendingVerse, setPendingVerse] = useState<GameVerse | null>(null);
  const [pendingPracticeVerseIds, setPendingPracticeVerseIds] = useState<string[] | null>(null);
  const [bibleBooks, setBibleBooks] = useState<BibleBook[]>([]);
  const { prefs, refreshPrefs, speak, stopSpeak, setEnabled, speechActive } = useAppVoice();
  const handsFree = prefs.handsFreeEnabled && speechWrapper.available;

  const announceLevels = useCallback(
    async (next: GameVerse | null, completedCount: number) => {
      if (!handsFree) return;
      if (prefs.speakScreenContext) {
        const progress =
          completedCount === 0
            ? "Ready to begin."
            : completedCount === 1
              ? "1 verse completed."
              : `${completedCount} verses completed.`;
        const nextLine = next
          ? `Next level: ${next.reference}. Say play or start, tap the card, or say a verse reference.`
          : "You have completed every verse.";
        await speak(
          `Levels. ${progress} ${nextLine} Or say a verse reference, like Matthew 6 33. Say home, my challenges, or settings.`
        );
      }
      setLevelsVoiceListen(true);
    },
    [handsFree, prefs.speakScreenContext, speak]
  );

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
    void announceLevels(next, learning.completed);
  }, [announceLevels]);

  useEffect(() => {
    void getBooks().then(setBibleBooks);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshPrefs();
      load();
      return () => {
        stopSpeak();
        setLevelsVoiceListen(false);
        setPendingVerse(null);
        setPendingPracticeVerseIds(null);
      };
    }, [load, stopSpeak, refreshPrefs])
  );

  const openVerse = useCallback(
    (verseId: string) => {
      router.push({
        pathname: "/practice-game",
        params: { session: "level", verseId, mode: "speech" },
      });
    },
    [router]
  );

  const handleLevelsVoice = useCallback(
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
        setListening: setLevelsVoiceListen,
        practiceAsChallenge: false,
        onAddToChallenges: async (v, verseIds) => {
          const { upsertChallengeFromVerses, setChallengeKind } = await import(
            "../../database/challenges"
          );
          const { getVerseById } = await import("../../database/queries");
          const ids = verseIds?.length ? verseIds : [v.id];
          const verses = (await Promise.all(ids.map((id) => getVerseById(id)))).filter(
            (x): x is NonNullable<typeof x> => x != null
          );
          const row = await upsertChallengeFromVerses(verses);
          if (row) await setChallengeKind(row.id, "custom");
        },
        onHandsFreeOff: async () => {
          await setEnabled(false);
        },
        handleBeforeFallback: async (spoken) => {
          const refOpts = { defaultBook: pendingVerse?.book };
          const hasReference =
            utteranceContainsScriptureReference(spoken, bibleBooks, refOpts) ||
            looksLikeScriptureReferenceAttempt(spoken);
          if (!hasReference && isBareLevelsStartCommand(spoken)) {
            if (nextVerse) openVerse(nextVerse.id);
            else await speak("No next verse. Try my challenges.");
            setLevelsVoiceListen(true);
            return true;
          }
          if (parseGlobalCommand(spoken) === "today") {
            router.push("/(tabs)");
            return true;
          }
          return false;
        },
      });
    },
    [bibleBooks, pendingVerse, pendingPracticeVerseIds, nextVerse, openVerse, router, speak, stopSpeak, setEnabled]
  );

  const pickReferenceTranscript = useCallback(
    (primary: string, alternatives: string[]) =>
      pickBestReferenceTranscript(primary, alternatives, bibleBooks),
    [bibleBooks]
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
      accessibilityLiveRegion="polite"
    >
      <CommandMicListener
        active={handsFree && levelsVoiceListen && !speechActive}
        verseMenuPending={pendingVerse != null}
        pickReferenceTranscript={pickReferenceTranscript}
        onTranscript={(t) => void handleLevelsVoice(t)}
      />
      {pendingVerse ? <HubPendingVerseBanner reference={pendingVerse.reference} /> : null}
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

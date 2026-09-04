import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter, useNavigation } from "expo-router";
import { useHeaderHeight } from "@react-navigation/elements";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Dimensions,
  Modal,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ConfettiCannon from "react-native-confetti-cannon";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors, type ThemeColors } from "../constants/theme";
import {
  getVerseById,
  getNextGameVerse,
  markVerseCompleted,
  updateVerseScore,
  getStreakActionDates,
  getStreakStats,
  recordUserAction,
  toggleFavorite,
  setFavorite,
} from "../database/queries";
import speechWrapper from "../lib/speechRecognitionWrapper";
import { computeAccuracy, type AccuracyResult } from "../utils/accuracy";
import type { GameVerse } from "../types/verse";

type Phase = "memorize" | "recite" | "result";

function getWords(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

function getTodayDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** After marking completion, returns streak info if today was a new streak day. */
async function checkNewStreakDay(
  mark: () => Promise<unknown>
): Promise<{ currentStreak: number } | null> {
  const dates = await getStreakActionDates();
  const hadToday = dates.includes(getTodayDateString());
  await mark();
  if (hadToday) return null;
  const { currentStreak } = await getStreakStats();
  return currentStreak >= 1 ? { currentStreak } : null;
}

export default function PracticeGameScreen() {
  const params = useLocalSearchParams<{
    verseId: string;
    mode: string;
    verseIds?: string;
    currentIndex?: string;
    source?: string;
  }>();
  const router = useRouter();
  const navigation = useNavigation();
  const headerHeight = useHeaderHeight();
  const { verseId, mode, verseIds, currentIndex, source } = params;
  /** Preserved when chaining Next so deep links can prefer type if we add it later. */
  const navigationMode = mode === "type" ? "type" : "speech";
  const isVotd = source === "votd";
  const isIntro = source === "intro";
  const passPercent = isIntro ? 75 : 80;
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const verseIdsList = verseIds ? verseIds.split(",").filter(Boolean) : [];
  const currentIdx = currentIndex != null ? parseInt(currentIndex, 10) : 0;

  const [verse, setVerse] = useState<GameVerse | null>(null);
  const [rangeVerses, setRangeVerses] = useState<GameVerse[] | null>(null);
  const [practiceEntireRange, setPracticeEntireRange] = useState(false);
  /** When set, we're in verse-by-verse and this is the index we're on (so Next uses it). */
  const [selectedRangeIndex, setSelectedRangeIndex] = useState<number | null>(null);
  const [showVerseByVersePicker, setShowVerseByVersePicker] = useState(false);
  const [phase, setPhase] = useState<Phase>("memorize");
  const [loading, setLoading] = useState(true);
  const [score, setScore] = useState<AccuracyResult | null>(null);
  const [whatYouSaid, setWhatYouSaid] = useState("");
  const [hintCount, setHintCount] = useState(0);
  const [streakCongrats, setStreakCongrats] = useState<{ currentStreak: number } | null>(null);
  const startTime = useRef<number>(0);
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const resultScale = useRef(new Animated.Value(0.85)).current;
  const resultOpacity = useRef(new Animated.Value(0)).current;
  const reviewCardOpacity = useRef(new Animated.Value(0)).current;

  const { width: screenWidth, height: screenHeight } = Dimensions.get("window");
  /** Android: lift bottom composer above keyboard (resize often fails with stack + edge-to-edge). */
  const [androidKeyboardInset, setAndroidKeyboardInset] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const showSub = Keyboard.addListener("keyboardDidShow", (e) => {
      setAndroidKeyboardInset(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setAndroidKeyboardInset(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const words = useMemo(() => (verse ? getWords(verse.text) : []), [verse]);
  const hintText = hintCount > 0 ? words.slice(0, hintCount).join(" ") : "";
  const canHint = hintCount < words.length;

  const buildCombinedVerse = useCallback((verses: GameVerse[]): GameVerse => {
    const first = verses[0];
    const last = verses[verses.length - 1];
    const rangeRef =
      first.chapter === last.chapter
        ? `${first.reference.split(":")[0]}:${first.verse}-${last.verse}`
        : `${first.reference}-${last.chapter}:${last.verse}`;
    return {
      ...first,
      id: verses.map((v) => v.id).join(","),
      reference: rangeRef,
      text: verses.map((v) => v.text).join(" "),
    };
  }, []);

  useEffect(() => {
    if (!verseId) {
      setLoading(false);
      return;
    }
    if (verseIdsList.length > 1) {
      Promise.all(verseIdsList.map((id) => getVerseById(id))).then((vs) => {
        const valid = vs.filter((v): v is GameVerse => v != null);
        if (valid.length > 1) {
          setRangeVerses(valid);
          const idx = currentIdx >= 0 && currentIdx < valid.length ? currentIdx : 0;
          const cameFromVerseByVerseNext = currentIdx > 0;
          if (cameFromVerseByVerseNext) {
            setVerse(valid[idx]);
            setPracticeEntireRange(false);
          } else {
            setVerse(buildCombinedVerse(valid));
            setPracticeEntireRange(true);
          }
        } else if (valid.length === 1) {
          setVerse(valid[0]);
        }
        setLoading(false);
      });
    } else {
      getVerseById(verseId).then((v) => {
        setVerse(v);
        setLoading(false);
      });
    }
  }, [verseId, verseIdsList.join(","), buildCombinedVerse]);

  const leaveIntroToHome = useCallback(() => {
    router.replace("/(tabs)");
  }, [router]);

  useEffect(() => {
    if (isVotd) {
      navigation.setOptions({ title: "Verse of the Day" });
    } else if (isIntro) {
      navigation.setOptions({
        title: "Your first verse",
        headerLeft: () => (
          <Pressable
            onPress={leaveIntroToHome}
            hitSlop={12}
            style={{ paddingHorizontal: 4, marginLeft: Platform.OS === "ios" ? 0 : 4 }}
            accessibilityRole="button"
            accessibilityLabel="Continue to home"
          >
            <Ionicons name="chevron-back" size={28} color={colors.text} />
          </Pressable>
        ),
      });
    }
  }, [isVotd, isIntro, navigation, leaveIntroToHome, colors.text]);

  useEffect(() => {
    if (phase === "result") {
      resultScale.setValue(0.85);
      resultOpacity.setValue(0);
      reviewCardOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(resultScale, {
          toValue: 1,
          useNativeDriver: true,
          friction: 8,
          tension: 80,
        }),
        Animated.timing(resultOpacity, {
          toValue: 1,
          duration: 320,
          useNativeDriver: true,
          easing: Easing.out(Easing.cubic),
        }),
      ]).start();
      Animated.timing(reviewCardOpacity, {
        toValue: 1,
        duration: 400,
        delay: 180,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }).start();
    }
  }, [phase, resultScale, resultOpacity, reviewCardOpacity]);

  const handleReady = useCallback(() => {
    contentOpacity.setValue(1);
    Animated.timing(contentOpacity, {
      toValue: 0,
      duration: 120,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setPhase("recite");
        setHintCount(0);
        startTime.current = Date.now();
        Animated.timing(contentOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      }
    });
  }, [contentOpacity]);

  const handlePracticeVerseByVerse = useCallback(() => {
    if (!rangeVerses?.length) return;
    setShowVerseByVersePicker(true);
  }, [rangeVerses]);

  const handlePickStartVerse = useCallback(
    (index: number) => {
      if (!rangeVerses?.length) return;
      setVerse(rangeVerses[index]);
      setPracticeEntireRange(false);
      setSelectedRangeIndex(index);
      setShowVerseByVersePicker(false);
    },
    [rangeVerses]
  );

  const handlePracticeEntireRange = useCallback(() => {
    if (!rangeVerses || rangeVerses.length < 2) return;
    setVerse(buildCombinedVerse(rangeVerses));
    setPracticeEntireRange(true);
    setSelectedRangeIndex(null);
  }, [rangeVerses, buildCombinedVerse]);

  const handleToggleFavorite = useCallback(async () => {
    if (!verse) return;
    if (practiceEntireRange && rangeVerses && rangeVerses.length > 1) {
      const allFavorited = rangeVerses.every((v) => v.isFavorite);
      const next = !allFavorited;
      await Promise.all(rangeVerses.map((v) => setFavorite(v.id, next)));
      const updatedRange = rangeVerses.map((v) => ({ ...v, isFavorite: next }));
      setRangeVerses(updatedRange);
      setVerse(buildCombinedVerse(updatedRange));
      return;
    }
    const verseId = verse.id.includes(",") ? verse.id.split(",")[0] : verse.id;
    await toggleFavorite(verseId);
    const updated = await getVerseById(verseId);
    if (updated) setVerse(updated);
  }, [verse, practiceEntireRange, rangeVerses, buildCombinedVerse]);

  const handleNext = useCallback(async () => {
    if (isIntro) {
      leaveIntroToHome();
      return;
    }
    if (practiceEntireRange) {
      router.back();
      return;
    }
    // From My Challenges (verseIds passed): only go to next verse in this challenge, then back
    if (verseIdsList.length > 0) {
      const idx = selectedRangeIndex ?? currentIdx;
      if (idx < verseIdsList.length - 1) {
        const nextId = verseIdsList[idx + 1];
        router.replace({
          pathname: "/practice-game",
          params: { verseId: nextId, mode: navigationMode, verseIds, currentIndex: String(idx + 1) },
        });
      } else {
        router.back();
      }
      return;
    }
    // From Levels (no verseIds): use global next-verse progression
    if (verse) {
      const v = await getNextGameVerse(verse.id);
      if (v) {
        router.replace({
          pathname: "/practice-game",
          params: { verseId: v.id, mode: navigationMode },
        });
      } else {
        router.back();
      }
    } else {
      router.back();
    }
  }, [verse, verseIdsList, currentIdx, selectedRangeIndex, verseIds, navigationMode, practiceEntireRange, isIntro, leaveIntroToHome, router]);

  const handleSpeechResult = useCallback(
    (s: AccuracyResult, transcript: string, inputMode: "speech" | "type") => {
      if (!verse) return;
      setWhatYouSaid(transcript);
      setScore(s);
      setPhase("result");
      const elapsed = Math.round((Date.now() - startTime.current) / 1000);
      const passed = s.percent >= passPercent;
      const actionVerseIds =
        practiceEntireRange && rangeVerses?.length ? rangeVerses.map((v) => v.id) : [verse.id];
      const metadata = {
        reference: verse.reference,
        source: isVotd ? "votd" : isIntro ? "intro" : verseIdsList.length > 0 ? "challenge" : "level",
        practiceEntireRange,
      };
      const recordAttempt = async () => {
        for (const id of actionVerseIds) {
          await recordUserAction({ actionType: "attempted_verse", verseId: id, scorePercent: s.percent, metadata });
          await recordUserAction({
            actionType: inputMode === "speech" ? "spoke_verse" : "wrote_verse",
            verseId: id,
            scorePercent: s.percent,
            metadata,
          });
          if (passed) {
            await recordUserAction({ actionType: "completed_verse", verseId: id, scorePercent: s.percent, metadata });
          }
          if (s.percent === 100) {
            await recordUserAction({ actionType: "perfect_score", verseId: id, scorePercent: s.percent, metadata });
          }
        }
        if (passed) {
          if (practiceEntireRange && rangeVerses?.length) {
            await Promise.all(rangeVerses.map((v) => markVerseCompleted(v.id, elapsed, s.percent)));
          } else {
            await markVerseCompleted(verse.id, elapsed, s.percent);
          }
        } else if (practiceEntireRange && rangeVerses?.length) {
          await Promise.all(rangeVerses.map((v) => updateVerseScore(v.id, s.percent)));
        } else {
          await updateVerseScore(verse.id, s.percent);
        }
      };
      checkNewStreakDay(recordAttempt).then((streak) => {
        if (streak) setStreakCongrats(streak);
      });
      if (passed) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      }
    },
    [verse, practiceEntireRange, rangeVerses, isVotd, isIntro, passPercent, verseIdsList.length]
  );

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!verse) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background, padding: 24 }]}>
        <Text style={{ fontSize: 16, color: colors.text, textAlign: "center", marginBottom: 16 }}>
          This verse could not be loaded.
        </Text>
        <Pressable
          onPress={() => (isIntro ? leaveIntroToHome() : router.back())}
          style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.primaryBtnText}>{isIntro ? "Continue to home" : "Go back"}</Text>
        </Pressable>
      </View>
    );
  }

  const passedThisRound = score !== null && score.percent >= passPercent;
  const showConfetti = phase === "result" && passedThisRound;
  const isFavorited =
    practiceEntireRange && rangeVerses && rangeVerses.length > 1
      ? rangeVerses.every((v) => v.isFavorite)
      : verse.isFavorite;

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoid}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? headerHeight : 0}
    >
    <View style={[styles.container, { backgroundColor: colors.background, flex: 1 }]}>
    <ScrollView
      style={styles.scrollInner}
      contentContainerStyle={[styles.content, phase === "recite" && styles.contentRecitePad]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <Animated.View style={{ opacity: contentOpacity }}>
      {phase === "memorize" ? (
        <View style={styles.memorizeHeaderRow}>
          <Text style={[styles.ref, styles.refInRow, { color: colors.primary }]}>{verse.reference}</Text>
          <Pressable
            onPress={() => void handleToggleFavorite()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={styles.favoriteBtn}
            accessibilityRole="button"
            accessibilityLabel={isFavorited ? "Remove from My Challenges" : "Save to My Challenges"}
          >
            <Ionicons
              name={isFavorited ? "heart" : "heart-outline"}
              size={28}
              color={isFavorited ? colors.primary : colors.textMuted}
            />
          </Pressable>
        </View>
      ) : (
        <Text style={[styles.ref, { color: colors.primary }]}>{verse.reference}</Text>
      )}
      {phase === "memorize" && (
        <>
          <Text style={[styles.verseText, { color: colors.textSecondary }]}>{verse.text}</Text>
          <Pressable
            style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.primary, transform: [{ scale: pressed ? 0.96 : 1 }] }]}
            onPress={handleReady}
            accessibilityRole="button"
            accessibilityLabel="Speak the Word"
          >
            <Text style={styles.primaryBtnText}>Speak the Word</Text>
          </Pressable>
          {rangeVerses && rangeVerses.length > 1 && (
            <Pressable
              style={({ pressed }) => [styles.rangeModeBtn, { opacity: pressed ? 0.85 : 1 }]}
              onPress={practiceEntireRange ? handlePracticeVerseByVerse : handlePracticeEntireRange}
            >
              <Text style={styles.rangeModeBtnText}>
                {practiceEntireRange
                  ? "One verse at a time"
                  : `Speak the whole passage (${rangeVerses.length} verses)`}
              </Text>
            </Pressable>
          )}
        </>
      )}
      <Modal visible={showVerseByVersePicker} transparent animationType="fade">
        <View style={styles.versePickerBackdrop}>
          <View style={[styles.versePickerCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.versePickerTitle, { color: colors.text }]}>Start from which verse?</Text>
            <ScrollView style={styles.versePickerList} nestedScrollEnabled>
              {rangeVerses?.map((v, i) => (
                <Pressable
                  key={v.id}
                  style={({ pressed }) => [
                    styles.versePickerRow,
                    { backgroundColor: pressed ? colors.primary + "18" : "transparent" },
                  ]}
                  onPress={() => handlePickStartVerse(i)}
                >
                  <Text style={[styles.versePickerRef, { color: colors.primary }]}>{v.reference}</Text>
                  <Text style={[styles.versePickerPreview, { color: colors.textMuted }]} numberOfLines={2}>
                    {v.text}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              style={({ pressed }) => [styles.versePickerCancel, { opacity: pressed ? 0.7 : 1 }]}
              onPress={() => setShowVerseByVersePicker(false)}
            >
              <Text style={[styles.versePickerCancelText, { color: colors.textMuted }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      {phase === "recite" && (
        <>
          <Text style={styles.reciteHint}>
            Speak this verse. It's okay to use a hint.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.hintBtn, !canHint && styles.hintBtnDisabled, { opacity: canHint && pressed ? 0.8 : 1 }]}
            onPress={() => canHint && setHintCount((c) => c + 1)}
            disabled={!canHint}
          >
            <Text style={styles.hintBtnText}>
              {canHint ? "Show next word" : "No more hints"}
            </Text>
          </Pressable>
          {hintText.length > 0 && (
            <View style={styles.hintBox}>
              <Text style={styles.hintLabel}>Hint:</Text>
              <Text style={styles.hintReveal}>{hintText}</Text>
            </View>
          )}
          {!speechWrapper.available ? (
            <View style={[styles.unsupported, { marginBottom: 16 }]}>
              <Text style={styles.unsupportedText}>
                Voice input is not available in Expo Go. Use a development build, or type your answer below.
              </Text>
            </View>
          ) : null}
        </>
      )}
      {phase === "result" && score !== null && verse && (
        <>
          <Animated.View
            style={[
              styles.scoreCard,
              score.percent >= passPercent ? styles.scoreGood : score.percent >= 50 ? styles.scoreOkay : styles.scoreLow,
              { opacity: resultOpacity, transform: [{ scale: resultScale }] },
            ]}
          >
            <Text style={[styles.resultLabel, score.percent >= passPercent ? styles.resultLabelSuccess : styles.resultLabelFail]}>
              {score.percent === 100 ? "Perfect" : score.percent >= passPercent ? "Completed" : "Keep going"}
            </Text>
            <Text style={styles.scoreTitle}>
              {score.percent === 100
                ? "Well done."
                : score.percent >= passPercent
                  ? "Nice work."
                  : "Try again. The Word is worth it."}
            </Text>
            <Text style={styles.scoreText}>{score.correct}/{score.total} words ({score.percent}%)</Text>
          </Animated.View>
          <Animated.View style={[styles.reviewCard, { opacity: reviewCardOpacity }]}>
            <Text style={styles.reviewSection}>The verse ({verse.reference})</Text>
            <Text style={styles.reviewVerse}>
              {verse.text.trim().split(/\s+/).filter(Boolean).map((word, i) => {
                const wrong = (score.wrongExpectedIndices ?? []).includes(i);
                return (
                  <Text key={i} style={wrong ? [styles.reviewVerseWord, styles.reviewVerseMiss] : styles.reviewVerseWord}>
                    {word}{" "}
                  </Text>
                );
              })}
            </Text>
            {whatYouSaid.length > 0 && (
              <>
                <Text style={styles.reviewSection}>What you said</Text>
                <Text style={styles.whatYouSaid}>{whatYouSaid}</Text>
              </>
            )}
            <Text style={styles.liveIt}>Memorizing is the start. Live this Word.</Text>
            {isIntro && passedThisRound ? (
              <Pressable
                onPress={() => router.push("/contact")}
                accessibilityRole="button"
                accessibilityLabel="This Word is about Jesus"
              >
                <Text style={styles.jesusDoor}>This Word is about Jesus. Want to talk with someone?</Text>
              </Pressable>
            ) : null}
          </Animated.View>
          <View style={styles.resultButtonsCol}>
            <Pressable
              style={({ pressed }) => [styles.retryBtn, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
              onPress={() => {
                setPhase("memorize");
                setScore(null);
                setWhatYouSaid("");
                setHintCount(0);
              }}
            >
              <Text style={styles.retryBtnText}>{passedThisRound ? "Speak it again" : "Try again"}</Text>
            </Pressable>
            {passedThisRound ? (
              <Pressable
                style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.primary, transform: [{ scale: pressed ? 0.96 : 1 }] }]}
                onPress={handleNext}
              >
                <Text style={styles.primaryBtnText}>{isIntro ? "Continue to home" : "Next verse"}</Text>
              </Pressable>
            ) : null}
            <Pressable
              style={({ pressed }) => [styles.quitBtn, { opacity: pressed ? 0.7 : 1 }]}
              onPress={() => (isIntro ? leaveIntroToHome() : router.back())}
              accessibilityRole="button"
              accessibilityLabel="Done"
            >
              <Text style={styles.quitBtnText}>Done</Text>
            </Pressable>
          </View>
        </>
      )}
      </Animated.View>
    </ScrollView>
    {phase === "recite" && (
      <View
        style={
          Platform.OS === "android" && androidKeyboardInset > 0
            ? { marginBottom: androidKeyboardInset }
            : undefined
        }
      >
        {speechWrapper.available ? (
          <ReciteComposerWithSpeech key={verse.id} verse={verse} onResult={handleSpeechResult} colors={colors} />
        ) : (
          <ReciteComposerTypeOnly key={verse.id} verse={verse} onResult={handleSpeechResult} colors={colors} />
        )}
      </View>
    )}
    {showConfetti && (
      <View style={styles.confettiOverlay} pointerEvents="none">
        <ConfettiCannon
          count={180}
          origin={{ x: screenWidth / 2, y: screenHeight * 0.3 }}
          explosionSpeed={350}
          fallSpeed={3200}
          fadeOut={true}
          autoStart={true}
          colors={["#10b981", "#2563eb", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4"]}
        />
      </View>
    )}
    <Modal visible={streakCongrats !== null} transparent animationType="fade">
      <View style={styles.streakModalBackdrop}>
        <View style={[styles.streakModalCard, { backgroundColor: colors.surface, borderColor: colors.primary + "40" }]}>
          <Text style={[styles.streakModalEmoji, { color: colors.primary }]}>🔥</Text>
          <Text style={[styles.streakModalTitle, { color: colors.text }]}>
            {streakCongrats?.currentStreak === 1
              ? "You started your streak!"
              : `${streakCongrats?.currentStreak} day streak!`}
          </Text>
          <Text style={[styles.streakModalSubtitle, { color: colors.textMuted }]}>
            {streakCongrats?.currentStreak === 1
              ? "Come back tomorrow to keep it going."
              : "Keep it going—you're on a roll!"}
          </Text>
          <Pressable
            style={({ pressed }) => [styles.streakModalBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.9 : 1 }]}
            onPress={() => setStreakCongrats(null)}
          >
            <Text style={styles.streakModalBtnText}>Awesome!</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
    </View>
    </KeyboardAvoidingView>
  );
}

function ReciteComposerTypeOnly({
  verse,
  onResult,
  colors,
}: {
  verse: GameVerse;
  onResult: (score: AccuracyResult, transcript: string, inputMode: "speech" | "type") => void;
  colors: ThemeColors;
}) {
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [text, setText] = useState("");
  const canCheck = text.trim().length > 0;
  const submit = () => {
    const t = text.trim();
    onResult(computeAccuracy(verse.text, t), t, "type");
  };
  return (
    <View
      style={[
        styles.composerBar,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingBottom: Math.max(insets.bottom, 10),
        },
      ]}
    >
      <View style={styles.composerRow}>
        <TextInput
          style={[
            styles.composerInput,
            {
              backgroundColor: colors.inputBg,
              borderColor: colors.inputBorder,
              color: colors.text,
            },
          ]}
          placeholder="Type the verse…"
          placeholderTextColor={colors.textMuted}
          value={text}
          onChangeText={setText}
          multiline
          spellCheck={false}
          autoCorrect={false}
        />
        <Pressable
          onPress={submit}
          disabled={!canCheck}
          style={({ pressed }) => [
            styles.composerIconBtn,
            {
              backgroundColor: colors.primary,
              opacity: !canCheck ? colors.disabledOpacity : pressed ? 0.9 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Check"
        >
          <Ionicons name="checkmark" size={24} color={colors.primaryText} />
        </Pressable>
      </View>
    </View>
  );
}

function ReciteComposerWithSpeech({
  verse,
  onResult,
  colors,
}: {
  verse: GameVerse;
  onResult: (score: AccuracyResult, transcript: string, inputMode: "speech" | "type") => void;
  colors: ThemeColors;
}) {
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [transcript, setTranscript] = useState("");
  const [editableTranscript, setEditableTranscript] = useState("");
  const [reviewMode, setReviewMode] = useState(false);
  const [isListening, setListening] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const transcriptRef = useRef("");
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseActive = useRef(false);

  const speech = speechWrapper.module!;
  const { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } = speech;

  useSpeechRecognitionEvent("start", () => {
    transcriptRef.current = "";
    setReviewMode(false);
    setListening(true);
    setStatus("Listening — speak the Word");
    pulseActive.current = true;
    const pulse = () => {
      if (!pulseActive.current) return;
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.04, duration: 600, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ]).start(({ finished }) => { if (finished && pulseActive.current) pulse(); });
    };
    pulseAnim.setValue(1);
    pulse();
  });

  useSpeechRecognitionEvent("end", () => {
    pulseActive.current = false;
    pulseAnim.stopAnimation();
    pulseAnim.setValue(1);
    setListening(false);
    setStatus("Stopped");
    const spoken = transcriptRef.current.trim();
    setEditableTranscript(spoken);
    setReviewMode(true);
  });

  useSpeechRecognitionEvent("result", (event: { results: { transcript: string }[]; isFinal?: boolean }) => {
    const last = event.results[event.results.length - 1];
    const text = last?.transcript?.trim() ?? "";
    if (!text) return;
    const current = transcriptRef.current.trim();
    if (event.isFinal) {
      if (current.length === 0 || text.toLowerCase().startsWith(current.toLowerCase())) {
        transcriptRef.current = text;
      } else {
        transcriptRef.current = (current + " " + text).trim();
      }
      setTranscript(transcriptRef.current);
    } else {
      setTranscript(current ? current + " " + text : text);
    }
  });

  useSpeechRecognitionEvent("error", (event: { error: string; message?: string }) => {
    setListening(false);
    setStatus("Error");
    if (event.error !== "aborted" && event.error !== "no-speech") {
      Alert.alert("Speech error", event.message ?? event.error);
    }
  });

  const requestPermissions = useCallback(async () => {
    setStatus("Requesting...");
    const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    setPermissionGranted(result.granted);
    setStatus(result.granted ? "Ready" : "Permission denied");
    if (!result.granted) Alert.alert("Permission required", "Microphone access is needed for speech mode.");
    return result.granted;
  }, []);

  const handleStart = useCallback(async () => {
    if (permissionGranted === false) return;
    if (permissionGranted !== true && !(await requestPermissions())) return;
    setReviewMode(false);
    setEditableTranscript("");
    setTranscript("");
    transcriptRef.current = "";
    setStatus("Starting...");
    try {
      ExpoSpeechRecognitionModule.start({ lang: "en-US", interimResults: true, continuous: true });
    } catch (e) {
      setStatus("Error");
      Alert.alert("Error", String(e));
    }
  }, [permissionGranted, requestPermissions]);

  const handleStop = useCallback(() => {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      setListening(false);
      setStatus("Stopped");
    }
  }, []);

  const handleSubmit = useCallback(() => {
    const text = (reviewMode ? editableTranscript : transcript).trim();
    const result = computeAccuracy(verse.text, text);
    onResult(result, text, "speech");
  }, [verse, reviewMode, editableTranscript, transcript, onResult]);

  const displayText = reviewMode ? editableTranscript : transcript;
  const onChangeComposerText = (t: string) => {
    if (reviewMode) setEditableTranscript(t);
    else setTranscript(t);
  };

  const onMicPress = useCallback(() => {
    if (isListening) handleStop();
    else void handleStart();
  }, [isListening, handleStop, handleStart]);

  const canCheckSpeech =
    !isListening && (reviewMode ? editableTranscript : transcript).trim().length > 0;
  const placeholder = isListening
    ? "Listening — speak the Word"
    : reviewMode
      ? "Edit if needed…"
      : "Tap the mic to speak, or type here";

  return (
    <View
      style={[
        styles.composerBar,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingBottom: Math.max(insets.bottom, 10),
        },
      ]}
    >
      {status !== "Ready" && status !== "Stopped" ? (
        <Text style={[styles.composerStatus, { color: colors.textMuted }]}>{status}</Text>
      ) : null}
      <View style={styles.composerRow}>
        <TextInput
          style={[
            styles.composerInput,
            {
              backgroundColor: colors.inputBg,
              borderColor: colors.inputBorder,
              color: colors.text,
            },
          ]}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          value={displayText}
          onChangeText={onChangeComposerText}
          multiline
          editable={!isListening}
          spellCheck={false}
          autoCorrect={false}
        />
        <Pressable
          onPress={handleSubmit}
          disabled={!canCheckSpeech}
          style={({ pressed }) => [
            styles.composerIconBtn,
            {
              backgroundColor: colors.primary,
              opacity: !canCheckSpeech ? colors.disabledOpacity : pressed ? 0.9 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Check"
        >
          <Ionicons name="checkmark" size={24} color={colors.primaryText} />
        </Pressable>
        <Animated.View style={isListening ? { transform: [{ scale: pulseAnim }] } : undefined}>
          <Pressable
            onPress={onMicPress}
            style={({ pressed }) => [
              styles.composerMicBtn,
              {
                backgroundColor: isListening ? colors.error : colors.primary,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={reviewMode ? "Record again" : isListening ? "Stop recording" : "Start recording"}
          >
            <Ionicons name={isListening ? "stop" : "mic"} size={22} color={colors.primaryText} />
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    keyboardAvoid: { flex: 1 },
    container: { flex: 1, backgroundColor: colors.background },
    scrollInner: { flex: 1 },
    content: { padding: 24 },
    contentRecitePad: { paddingBottom: 120 },
    composerBar: {
      borderTopWidth: 1,
      paddingTop: 10,
      paddingHorizontal: 16,
    },
    composerStatus: { fontSize: 12, marginBottom: 6 },
    composerRow: { flexDirection: "row", alignItems: "flex-end", gap: 10 },
    composerInput: {
      flex: 1,
      minHeight: 44,
      maxHeight: 120,
      borderWidth: 1,
      borderRadius: 22,
      paddingHorizontal: 16,
      paddingVertical: Platform.OS === "ios" ? 10 : 8,
      fontSize: 16,
      textAlignVertical: "top",
    },
    composerIconBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 0,
    },
    composerMicBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
    },
    confettiOverlay: { ...StyleSheet.absoluteFillObject },
    streakModalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
    },
    streakModalCard: {
      width: "100%",
      maxWidth: 320,
      borderRadius: 20,
      padding: 28,
      alignItems: "center",
      borderWidth: 2,
    },
    streakModalEmoji: { fontSize: 48, marginBottom: 12 },
    streakModalTitle: { fontSize: 22, fontWeight: "700", textAlign: "center", marginBottom: 8 },
    streakModalSubtitle: { fontSize: 15, textAlign: "center", marginBottom: 24, lineHeight: 22 },
    streakModalBtn: { paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12 },
    streakModalBtnText: { fontSize: 16, fontWeight: "600", color: colors.primaryText },
    versePickerBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
    },
    versePickerCard: {
      width: "100%",
      maxWidth: 400,
      maxHeight: "80%",
      borderRadius: 16,
      padding: 16,
    },
    versePickerTitle: { fontSize: 18, fontWeight: "600", marginBottom: 12 },
    versePickerList: { maxHeight: 320, marginBottom: 12 },
    versePickerRow: { paddingVertical: 12, paddingHorizontal: 8, borderRadius: 10, marginBottom: 4 },
    versePickerRef: { fontSize: 15, fontWeight: "600", marginBottom: 2 },
    versePickerPreview: { fontSize: 14, lineHeight: 20 },
    versePickerCancel: { paddingVertical: 12, alignItems: "center" },
    versePickerCancelText: { fontSize: 16 },
    centered: { flex: 1, justifyContent: "center", alignItems: "center" },
    ref: { fontSize: 18, fontWeight: "600", color: colors.primary, marginBottom: 16 },
    refInRow: { flex: 1, marginBottom: 0, marginRight: 12 },
    memorizeHeaderRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      marginBottom: 20,
    },
    favoriteBtn: { padding: 4, marginTop: -2 },
    verseText: { fontSize: 22, color: colors.textSecondary, lineHeight: 34, marginBottom: 32 },
    rangeModeBtn: {
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: "center",
      marginBottom: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    rangeModeBtnText: { fontSize: 15, fontWeight: "600", color: colors.primary },
    reciteHint: { fontSize: 16, color: colors.textSecondary, lineHeight: 24, marginBottom: 16 },
    hintBtn: {
      alignSelf: "flex-start",
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 8,
      backgroundColor: colors.primary + "18",
      marginBottom: 12,
    },
    hintBtnDisabled: { opacity: 0.5 },
    hintBtnText: { fontSize: 14, color: colors.primary, fontWeight: "500" },
    hintBox: {
      backgroundColor: colors.surface,
      borderRadius: 10,
      padding: 14,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
      borderLeftWidth: 4,
      borderLeftColor: colors.primary,
    },
    hintLabel: { fontSize: 12, color: colors.textMuted, marginBottom: 4 },
    hintReveal: { fontSize: 15, color: colors.textSecondary, fontStyle: "italic" },
    reviewCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 20,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    reviewSection: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textMuted,
      marginBottom: 8,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    reviewVerse: { fontSize: 16, color: colors.textSecondary, lineHeight: 26, marginBottom: 16 },
    reviewVerseWord: { fontSize: 16, lineHeight: 26 },
    reviewVerseMiss: {
      backgroundColor: colors.warning + "33",
      color: colors.text,
    },
    whatYouSaid: { fontSize: 15, color: colors.textMuted, lineHeight: 24, fontStyle: "italic", marginBottom: 16 },
    liveIt: {
      fontSize: 14,
      color: colors.textMuted,
      fontStyle: "italic",
      lineHeight: 22,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    jesusDoor: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.primary,
      lineHeight: 22,
      marginTop: 14,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: 10,
      padding: 14,
      fontSize: 16,
      minHeight: 120,
      textAlignVertical: "top",
      backgroundColor: colors.inputBg,
      marginBottom: 16,
    },
    primaryBtn: {
      backgroundColor: colors.primary,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: "center",
      marginBottom: 12,
    },
    primaryBtnText: { fontSize: 16, fontWeight: "600", color: colors.primaryText },
    secondaryBtn: { paddingVertical: 14, alignItems: "center", marginBottom: 12 },
    secondaryBtnText: { fontSize: 16, color: colors.textMuted },
    scoreCard: { padding: 20, borderRadius: 16, marginBottom: 20, alignItems: "center" },
    scoreGood: {
      backgroundColor: colors.success + "22",
      borderWidth: 2,
      borderColor: colors.success,
    },
    scoreOkay: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    scoreLow: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    resultLabel: { fontSize: 14, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 },
    resultLabelSuccess: { color: colors.successText },
    resultLabelFail: { color: colors.textMuted },
    scoreTitle: { fontSize: 20, fontWeight: "700", color: colors.text, marginBottom: 4, textAlign: "center" },
    scoreText: { fontSize: 16, color: colors.textSecondary },
    resultButtonsCol: { marginBottom: 12 },
    retryBtn: {
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: "center",
      marginBottom: 10,
      backgroundColor: colors.border,
    },
    retryBtnText: { fontSize: 16, fontWeight: "600", color: colors.textSecondary },
    quitBtn: { paddingVertical: 14, alignItems: "center", marginBottom: 10 },
    quitBtnText: { fontSize: 16, color: colors.textMuted },
    unsupported: {
      padding: 16,
      backgroundColor: colors.warning + "22",
      borderRadius: 10,
      marginBottom: 16,
    },
    unsupportedText: { fontSize: 14, color: colors.textSecondary },
  });
}

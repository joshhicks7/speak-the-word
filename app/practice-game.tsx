import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter, useNavigation } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
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
} from "react-native";
import ConfettiCannon from "react-native-confetti-cannon";
import { useThemeColors, type ThemeColors } from "../constants/theme";
import {
  getVerseById,
  getNextGameVerse,
  markVerseCompleted,
  updateVerseScore,
  getCompletionDates,
  getStreakStats,
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
  const dates = await getCompletionDates();
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
  const { verseId, mode, verseIds, currentIndex, source } = params;
  const isVotd = source === "votd";
  const colors = useThemeColors();
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
  const [typed, setTyped] = useState("");
  const [hintCount, setHintCount] = useState(0);
  const [effectiveMode, setEffectiveMode] = useState<"speech" | "type">("speech");
  const [streakCongrats, setStreakCongrats] = useState<{ currentStreak: number } | null>(null);
  const startTime = useRef<number>(0);
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const resultScale = useRef(new Animated.Value(0.85)).current;
  const resultOpacity = useRef(new Animated.Value(0)).current;
  const reviewCardOpacity = useRef(new Animated.Value(0)).current;

  const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

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
        if (isVotd && v) {
          setPhase("recite");
          startTime.current = Date.now();
        }
        setLoading(false);
      });
    }
  }, [verseId, verseIdsList.join(","), buildCombinedVerse, isVotd]);

  useEffect(() => {
    if (isVotd) {
      navigation.setOptions({ title: "Verse of the Day" });
    }
  }, [isVotd, navigation]);

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

  const handleCheckType = useCallback(() => {
    if (!verse) return;
    const result = computeAccuracy(verse.text, typed);
    setWhatYouSaid(typed.trim());
    setScore(result);
    setPhase("result");
    const elapsed = Math.round((Date.now() - startTime.current) / 1000);
    if (result.percent >= 80) {
      const doMark = () =>
        practiceEntireRange && rangeVerses?.length
          ? Promise.all(rangeVerses.map((v) => markVerseCompleted(v.id, elapsed, result.percent)))
          : markVerseCompleted(verse.id, elapsed, result.percent);
      checkNewStreakDay(doMark).then((streak) => {
        if (streak) setStreakCongrats(streak);
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else {
      if (practiceEntireRange && rangeVerses?.length) {
        rangeVerses.forEach((v) => updateVerseScore(v.id, result.percent).catch(() => {}));
      } else {
        updateVerseScore(verse.id, result.percent).catch(() => {});
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    }
  }, [verse, typed, practiceEntireRange, rangeVerses]);

  const handleNext = useCallback(async () => {
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
          params: { verseId: nextId, mode: effectiveMode, verseIds, currentIndex: String(idx + 1) },
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
          params: { verseId: v.id, mode: effectiveMode },
        });
      } else {
        router.back();
      }
    } else {
      router.back();
    }
  }, [verse, verseIdsList, currentIdx, selectedRangeIndex, verseIds, effectiveMode, practiceEntireRange, router]);

  if (loading || !verse) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const isSpeech = effectiveMode === "speech";
  const showConfetti = phase === "result" && score !== null && score.percent >= 80;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, flex: 1 }]}>
    <ScrollView style={styles.scrollInner} contentContainerStyle={styles.content}>
      <Animated.View style={{ opacity: contentOpacity }}>
      <Text style={[styles.ref, { color: colors.primary }]}>{verse.reference}</Text>
      {phase === "recite" && isVotd && (
        <Text style={[styles.verseText, { color: colors.textSecondary }]}>{verse.text}</Text>
      )}
      {phase === "memorize" && (
        <>
          <Text style={[styles.verseText, { color: colors.textSecondary }]}>{verse.text}</Text>
          <Pressable
            style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.primary, transform: [{ scale: pressed ? 0.96 : 1 }] }]}
            onPress={handleReady}
          >
            <Text style={styles.primaryBtnText}>Play</Text>
          </Pressable>
          {rangeVerses && rangeVerses.length > 1 && (
            <Pressable
              style={({ pressed }) => [styles.rangeModeBtn, { opacity: pressed ? 0.85 : 1 }]}
              onPress={practiceEntireRange ? handlePracticeVerseByVerse : handlePracticeEntireRange}
            >
              <Text style={styles.rangeModeBtnText}>
                {practiceEntireRange
                  ? "Practice verse by verse"
                  : `Practice entire range (${rangeVerses.length} verses)`}
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
          <View style={styles.reciteModeRow}>
            <Pressable
              style={({ pressed }) => [
                styles.reciteModeBtn,
                effectiveMode === "speech" && styles.reciteModeBtnActive,
                { transform: [{ scale: pressed ? 0.97 : 1 }] },
              ]}
              onPress={() => setEffectiveMode("speech")}
            >
              <Text style={[styles.reciteModeBtnText, effectiveMode === "speech" && styles.reciteModeBtnTextActive]}>
                Speak
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.reciteModeBtn,
                effectiveMode === "type" && styles.reciteModeBtnActive,
                { transform: [{ scale: pressed ? 0.97 : 1 }] },
              ]}
              onPress={() => setEffectiveMode("type")}
            >
              <Text style={[styles.reciteModeBtnText, effectiveMode === "type" && styles.reciteModeBtnTextActive]}>
                Type
              </Text>
            </Pressable>
          </View>
          <Text style={styles.reciteHint}>
            {isSpeech ? "Tap Start, then recite. Tap Stop, edit if needed, then Submit." : "Type the verse from memory."}
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
          {isSpeech ? (
            <SpeechBlock
              verse={verse}
              onResult={(s, transcript) => {
                setWhatYouSaid(transcript);
                setScore(s);
                setPhase("result");
                const elapsed = Math.round((Date.now() - startTime.current) / 1000);
                if (s.percent >= 80) {
                  const doMark = () =>
                    practiceEntireRange && rangeVerses?.length
                      ? Promise.all(rangeVerses.map((v) => markVerseCompleted(v.id, elapsed, s.percent)))
                      : markVerseCompleted(verse.id, elapsed, s.percent);
                  checkNewStreakDay(doMark).then((streak) => {
                    if (streak) setStreakCongrats(streak);
                  });
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                } else {
                  if (practiceEntireRange && rangeVerses?.length) {
                    rangeVerses.forEach((v) => updateVerseScore(v.id, s.percent).catch(() => {}));
                  } else {
                    updateVerseScore(verse.id, s.percent).catch(() => {});
                  }
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
                }
              }}
            />
          ) : (
            <>
              <TextInput
                style={styles.input}
                placeholder="Type the verse..."
                placeholderTextColor="#94a3b8"
                multiline
                value={typed}
                onChangeText={setTyped}
                spellCheck={false}
                autoCorrect={false}
              />
              <Pressable
                style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.primary, transform: [{ scale: pressed ? 0.96 : 1 }] }]}
                onPress={handleCheckType}
              >
                <Text style={styles.primaryBtnText}>Check</Text>
              </Pressable>
            </>
          )}
        </>
      )}
      {phase === "result" && score !== null && verse && (
        <>
          <Animated.View
            style={[
              styles.scoreCard,
              score.percent >= 80 ? styles.scoreGood : score.percent >= 50 ? styles.scoreOkay : styles.scoreLow,
              { opacity: resultOpacity, transform: [{ scale: resultScale }] },
            ]}
          >
            <Text style={[styles.resultLabel, score.percent >= 80 ? styles.resultLabelSuccess : styles.resultLabelFail]}>
              {score.percent === 100 ? "Perfect!" : score.percent >= 80 ? "Completed" : "Failed"}
            </Text>
            <Text style={styles.scoreTitle}>
              {score.percent === 100 ? "Flawless!" : score.percent >= 80 ? "Well done!" : score.percent >= 50 ? "Good try!" : "Keep practicing!"}
            </Text>
            <Text style={styles.scoreText}>{score.correct}/{score.total} words ({score.percent}%)</Text>
          </Animated.View>
          <Animated.View style={[styles.reviewCard, { opacity: reviewCardOpacity }]}>
            <Text style={styles.reviewSection}>The verse ({verse.reference})</Text>
            <Text style={styles.reviewVerse}>
              {verse.text.trim().split(/\s+/).filter(Boolean).map((word, i) => {
                const wrong = (score.wrongExpectedIndices ?? []).includes(i);
                return (
                  <Text key={i} style={wrong ? [styles.reviewVerseWord, { backgroundColor: colors.error + "33", color: colors.error }] : styles.reviewVerseWord}>
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
            <Text style={styles.liveIt}>
              The goal isn't just to memorize—it's to hide God's Word in your heart and live it.
            </Text>
          </Animated.View>
          <View style={styles.resultButtonsCol}>
            <Pressable
              style={({ pressed }) => [styles.retryBtn, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
              onPress={() => {
                setPhase("memorize");
                setScore(null);
                setWhatYouSaid("");
                setTyped("");
                setHintCount(0);
              }}
            >
              <Text style={styles.retryBtnText}>Retry</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.primary, transform: [{ scale: pressed ? 0.96 : 1 }] }]}
              onPress={handleNext}
            >
              <Text style={styles.primaryBtnText}>Next</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [styles.quitBtn, { opacity: pressed ? 0.7 : 1 }]} onPress={() => router.back()}>
              <Text style={styles.quitBtnText}>Quit</Text>
            </Pressable>
          </View>
        </>
      )}
      </Animated.View>
    </ScrollView>
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
  );
}

function SpeechBlock({
  verse,
  onResult,
}: {
  verse: GameVerse;
  onResult: (score: AccuracyResult, transcript: string) => void;
}) {
  const [transcript, setTranscript] = useState("");
  const [editableTranscript, setEditableTranscript] = useState("");
  const [reviewMode, setReviewMode] = useState(false);
  const [isListening, setListening] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const transcriptRef = useRef("");
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseActive = useRef(false);

  if (!speechWrapper.available) {
    return (
      <View style={styles.unsupported}>
        <Text style={styles.unsupportedText}>Speech not available in Expo Go. Use a development build or switch to Type mode.</Text>
      </View>
    );
  }

  const speech = speechWrapper.module!;
  const { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } = speech;

  useSpeechRecognitionEvent("start", () => {
    transcriptRef.current = "";
    setListening(true);
    setStatus("Listening...");
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
    setTranscript("");
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
    const text = editableTranscript.trim();
    const result = computeAccuracy(verse.text, text);
    onResult(result, text);
  }, [verse, editableTranscript, onResult]);

  const handleRecordAgain = useCallback(() => {
    setReviewMode(false);
    setTranscript("");
    setEditableTranscript("");
    transcriptRef.current = "";
    setStatus("Ready");
  }, []);

  if (reviewMode) {
    return (
      <>
        <Text style={styles.reviewLabel}>Edit if needed, then submit</Text>
        <TextInput
          style={styles.input}
          placeholder="What you said (edit recognition if wrong)..."
          placeholderTextColor="#94a3b8"
          multiline
          value={editableTranscript}
          onChangeText={setEditableTranscript}
          spellCheck={false}
          autoCorrect={false}
        />
        <Pressable style={({ pressed }) => [styles.primaryBtn, { transform: [{ scale: pressed ? 0.96 : 1 }] }]} onPress={handleSubmit}>
          <Text style={styles.primaryBtnText}>Submit</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [styles.secondaryBtn, { opacity: pressed ? 0.7 : 1 }]} onPress={handleRecordAgain}>
          <Text style={styles.secondaryBtnText}>Record again</Text>
        </Pressable>
      </>
    );
  }

  return (
    <>
      <ScrollView style={styles.transcriptBox}>
        <Text style={styles.transcriptText}>{transcript || " (your words will appear here)"}</Text>
      </ScrollView>
      <Text style={styles.statusText}>{status}</Text>
      <Animated.View style={isListening ? { transform: [{ scale: pulseAnim }] } : undefined}>
        <Pressable
          style={({ pressed }) => [
            styles.btn,
            isListening ? styles.stopBtn : styles.startBtn,
            { transform: [{ scale: pressed ? 0.96 : 1 }] },
          ]}
          onPress={isListening ? handleStop : handleStart}
        >
          <Text style={styles.btnText}>{isListening ? "Stop" : "Start"}</Text>
        </Pressable>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  scrollInner: { flex: 1 },
  content: { padding: 24 },
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
  streakModalBtnText: { fontSize: 16, fontWeight: "600", color: "#fff" },
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
  ref: { fontSize: 18, fontWeight: "600", color: "#2563eb", marginBottom: 16 },
  verseText: { fontSize: 16, color: "#334155", lineHeight: 24, marginBottom: 24 },
  rangeModeBtn: { paddingVertical: 14, borderRadius: 10, alignItems: "center", marginBottom: 12, backgroundColor: "#f0fdf4", borderWidth: 1, borderColor: "#bbf7d0" },
  rangeModeBtnText: { fontSize: 15, fontWeight: "600", color: "#15803d" },
  reciteModeRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  reciteModeBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center", backgroundColor: "#e2e8f0" },
  reciteModeBtnActive: { backgroundColor: "#2563eb" },
  reciteModeBtnText: { fontSize: 15, fontWeight: "600", color: "#475569" },
  reciteModeBtnTextActive: { color: "#fff" },
  reciteHint: { fontSize: 14, color: "#64748b", marginBottom: 12 },
  hintBtn: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: "#e0e7ff",
    marginBottom: 12,
  },
  hintBtnDisabled: { opacity: 0.5 },
  hintBtnText: { fontSize: 14, color: "#3730a3", fontWeight: "500" },
  hintBox: {
    backgroundColor: "#f1f5f9",
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#94a3b8",
  },
  hintLabel: { fontSize: 12, color: "#64748b", marginBottom: 4 },
  hintReveal: { fontSize: 15, color: "#334155", fontStyle: "italic" },
  reviewLabel: { fontSize: 14, color: "#64748b", marginBottom: 8 },
  reviewCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  reviewSection: { fontSize: 13, fontWeight: "600", color: "#64748b", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  reviewVerse: { fontSize: 16, color: "#334155", lineHeight: 26, marginBottom: 16 },
  reviewVerseWord: { fontSize: 16, lineHeight: 26 },
  whatYouSaid: { fontSize: 15, color: "#475569", lineHeight: 24, fontStyle: "italic", marginBottom: 16 },
  liveIt: {
    fontSize: 14,
    color: "#64748b",
    fontStyle: "italic",
    lineHeight: 22,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    minHeight: 120,
    textAlignVertical: "top",
    backgroundColor: "#fff",
    marginBottom: 16,
  },
  primaryBtn: { backgroundColor: "#2563eb", paddingVertical: 14, borderRadius: 10, alignItems: "center", marginBottom: 12 },
  primaryBtnText: { fontSize: 16, fontWeight: "600", color: "#fff" },
  secondaryBtn: { paddingVertical: 14, alignItems: "center", marginBottom: 12 },
  secondaryBtnText: { fontSize: 16, color: "#64748b" },
  scoreCard: { padding: 20, borderRadius: 16, marginBottom: 20, alignItems: "center" },
  scoreGood: { backgroundColor: "#d1fae5", borderWidth: 2, borderColor: "#10b981" },
  scoreOkay: { backgroundColor: "#fef3c7", borderWidth: 2, borderColor: "#f59e0b" },
  scoreLow: { backgroundColor: "#fee2e2", borderWidth: 2, borderColor: "#ef4444" },
  resultLabel: { fontSize: 14, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 },
  resultLabelSuccess: { color: "#047857" },
  resultLabelFail: { color: "#b91c1c" },
  scoreTitle: { fontSize: 20, fontWeight: "700", color: "#0f172a", marginBottom: 4 },
  scoreText: { fontSize: 16, color: "#334155" },
  resultButtonsCol: { marginBottom: 12 },
  retryBtn: { paddingVertical: 14, borderRadius: 10, alignItems: "center", marginBottom: 10, backgroundColor: "#e2e8f0" },
  retryBtnText: { fontSize: 16, fontWeight: "600", color: "#475569" },
  quitBtn: { paddingVertical: 14, alignItems: "center", marginBottom: 10 },
  quitBtnText: { fontSize: 16, color: "#64748b" },
  unsupported: { padding: 16, backgroundColor: "#fef3c7", borderRadius: 10, marginBottom: 16 },
  unsupportedText: { fontSize: 14, color: "#78350f" },
  transcriptBox: { maxHeight: 120, backgroundColor: "#fff", borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: "#e2e8f0" },
  transcriptText: { fontSize: 15, color: "#334155" },
  statusText: { fontSize: 14, color: "#64748b", marginBottom: 12 },
  buttonRow: { flexDirection: "row", gap: 12 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: "center" },
  startBtn: { backgroundColor: "#2563eb" },
  stopBtn: { backgroundColor: "#dc2626" },
  btnDisabled: { opacity: 0.5 },
  btnText: { fontSize: 16, fontWeight: "600", color: "#fff" },
});

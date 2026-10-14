import * as Haptics from "expo-haptics";
import { useFocusEffect, useLocalSearchParams, useRouter, useNavigation } from "expo-router";
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
  recordUserActions,
  type RecordUserActionInput,
} from "../database/queries";
import {
  getChallengeById,
  getNextIncompleteChallenge,
  loadVersesForChallenge,
  recordChallengeAttempt,
  setChallengeKind,
  type ChallengeRow,
} from "../database/challenges";
import { CoachBanner } from "../components/CoachBanner";
import { CommandMicListener } from "../components/CommandMicListener";
import { useAppVoice } from "../context/AppVoiceProvider";
import {
  retryDelayMsForSpeechError,
  userMessageForSpeechError,
} from "../lib/speechMicRecovery";
import speechWrapper from "../lib/speechRecognitionWrapper";
import { ensureVoiceAudioMode } from "../lib/voiceCue";
import { isSpeaking } from "../lib/voiceFeedback";
import {
  isPracticeExitPhrase,
  isPracticeRestartPhrase,
  parseInterruptSpeechCommand,
  parsePracticeResultCommand,
  parseVoiceCommand,
  type VoiceIntent,
} from "../lib/voiceCommands";
import { shouldAutoSubmit, DEFAULT_RECITE_LISTENING_CONFIG } from "../lib/reciteListening";
import { buildVerseContextualStrings } from "../lib/verseContextualStrings";
import { computeAccuracy, type AccuracyResult } from "../utils/accuracy";
import { setWelcomeComplete } from "../utils/onboarding";
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
    rangeMode?: string;
    session?: string;
    challengeId?: string;
  }>();
  const router = useRouter();
  const navigation = useNavigation();
  const headerHeight = useHeaderHeight();
  const { verseId, mode, verseIds, currentIndex, source, rangeMode: rangeModeParam, session, challengeId } =
    params;
  const isChallengeSession = session === "challenge" && !!challengeId;
  /** Explicit verse-by-verse entry (e.g. next verse in a split passage). Default is whole passage. */
  const openedVerseByVerse = rangeModeParam === "verse";
  /** Preserved when chaining Next so deep links can prefer type if we add it later. */
  const navigationMode = mode === "type" ? "type" : "speech";
  const isVotd = source === "votd";
  const isIntro = source === "intro";
  const isWelcomeDemo = source === "welcome-demo";
  const passPercent = isIntro || isWelcomeDemo ? 75 : 80;
  const { prefs: voicePrefs, speak, playCue, stopSpeak, getSpeechGeneration, speechActive, setEnabled } =
    useAppVoice();
  const handsFree = voicePrefs.handsFreeEnabled && speechWrapper.available;
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const verseIdsList = verseIds ? verseIds.split(",").filter(Boolean) : [];
  const currentIdx = currentIndex != null ? parseInt(currentIndex, 10) : 0;

  const [verse, setVerse] = useState<GameVerse | null>(null);
  const [challengeRow, setChallengeRow] = useState<ChallengeRow | null>(null);
  const [rangeVerses, setRangeVerses] = useState<GameVerse[] | null>(null);
  const [practiceEntireRange, setPracticeEntireRange] = useState(false);
  /** When set, we're in verse-by-verse and this is the index we're on (so Next uses it). */
  const [selectedRangeIndex, setSelectedRangeIndex] = useState<number | null>(null);
  const [showVerseByVersePicker, setShowVerseByVersePicker] = useState(false);
  const [phase, setPhase] = useState<Phase>("memorize");
  const phaseRef = useRef<Phase>("memorize");
  phaseRef.current = phase;
  const [loading, setLoading] = useState(true);
  const [score, setScore] = useState<AccuracyResult | null>(null);
  const [whatYouSaid, setWhatYouSaid] = useState("");
  const [hintCount, setHintCount] = useState(0);
  const [streakCongrats, setStreakCongrats] = useState<{ currentStreak: number } | null>(null);
  const [coachMessage, setCoachMessage] = useState<string | null>(null);
  const [commandListen, setCommandListen] = useState(false);
  const [reciteListeningReady, setReciteListeningReady] = useState(false);
  const [reciteUseType, setReciteUseType] = useState(navigationMode === "type");
  const [reciteSession, setReciteSession] = useState(0);
  const handsFreeFlowStarted = useRef(false);
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
    if (isChallengeSession && challengeId) {
      void getChallengeById(challengeId).then(setChallengeRow);
    } else {
      setChallengeRow(null);
    }
  }, [isChallengeSession, challengeId]);

  useEffect(() => {
    if (!verseId) {
      setLoading(false);
      return;
    }
    const loadFromChallenge = async (): Promise<GameVerse[] | null> => {
      if (!isChallengeSession || !challengeId || verseIdsList.length > 0) return null;
      const row = await getChallengeById(challengeId);
      if (!row) return null;
      setChallengeRow(row);
      return loadVersesForChallenge(row);
    };

    const applyRangeVerses = (valid: GameVerse[]) => {
      if (valid.length > 1) {
        setRangeVerses(valid);
        const idx = currentIdx >= 0 && currentIdx < valid.length ? currentIdx : 0;
        const verseByVerse = openedVerseByVerse || currentIdx > 0;
        if (verseByVerse) {
          setVerse(valid[idx] ?? valid[0]!);
          setPracticeEntireRange(false);
          setSelectedRangeIndex(idx);
        } else {
          setVerse(buildCombinedVerse(valid));
          setPracticeEntireRange(true);
          setSelectedRangeIndex(null);
        }
      } else if (valid.length === 1) {
        setVerse(valid[0]!);
      }
      setLoading(false);
    };

    void (async () => {
      const fromChallenge = await loadFromChallenge();
      if (fromChallenge && fromChallenge.length > 0) {
        applyRangeVerses(fromChallenge);
        return;
      }
      if (verseIdsList.length > 1) {
        const vs = await Promise.all(verseIdsList.map((id) => getVerseById(id)));
        const valid = vs.filter((v): v is GameVerse => v != null);
        applyRangeVerses(valid);
        return;
      }
      const v = await getVerseById(verseId);
      setVerse(v);
      setLoading(false);
    })();
  }, [
    verseId,
    verseIdsList.join(","),
    buildCombinedVerse,
    openedVerseByVerse,
    isChallengeSession,
    challengeId,
    currentIdx,
  ]);

  const leaveIntroToHome = useCallback(async () => {
    if (isWelcomeDemo) await setWelcomeComplete();
    router.replace("/(tabs)");
  }, [router, isWelcomeDemo]);

  const exitPractice = useCallback(() => {
    setStreakCongrats(null);
    if (isIntro || isWelcomeDemo) {
      void leaveIntroToHome();
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)");
    }
  }, [isIntro, isWelcomeDemo, leaveIntroToHome, router]);

  useEffect(() => {
    handsFreeFlowStarted.current = false;
    setCommandListen(false);
    stopSpeak();
  }, [verse?.id, stopSpeak]);

  useEffect(() => {
    if (!isWelcomeDemo) return;
    if (phase === "memorize") {
      setCoachMessage("Here's your first verse. Read it, then tap Speak the Word when you're ready to recite.");
    } else if (phase === "recite") {
      setCoachMessage(null);
    } else if (phase === "result") {
      setCoachMessage("Nice! That's how practice works. Continue to Home when ready.");
    }
  }, [isWelcomeDemo, phase]);

  useEffect(() => {
    if (isVotd) {
      navigation.setOptions({ title: "Verse of the Day" });
    } else if (isIntro || isWelcomeDemo) {
      navigation.setOptions({
        title: "Your first verse",
        headerLeft: () => (
          <Pressable
            onPress={() => void leaveIntroToHome()}
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
  }, [isVotd, isIntro, isWelcomeDemo, navigation, leaveIntroToHome, colors.text]);

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
    if (phaseRef.current !== "memorize") return;
    stopSpeak();
    setCommandListen(false);
    handsFreeFlowStarted.current = true;
    contentOpacity.setValue(1);
    Animated.timing(contentOpacity, {
      toValue: 0,
      duration: 120,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setReciteSession((s) => s + 1);
        setReciteUseType(navigationMode === "type");
        setPhase("recite");
        setHintCount(0);
        startTime.current = Date.now();
        Animated.timing(contentOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      }
    });
  }, [contentOpacity, stopSpeak, navigationMode]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        stopSpeak();
        setCommandListen(false);
      };
    }, [stopSpeak])
  );

  const speakPassagePreview = useCallback(
    async (runGen: number) => {
      const alive = () => getSpeechGeneration() === runGen;
      if (!alive() || !verse) return;

      const isMultiPassage =
        practiceEntireRange && rangeVerses != null && rangeVerses.length > 1;

      if (isMultiPassage) {
        if (!voicePrefs.readFullVerse) {
          await speak(`${verse.reference}.`);
          return;
        }
        if (voicePrefs.announceEachVerseWhenReading) {
          for (const v of rangeVerses) {
            if (!alive()) return;
            await speak(`${v.reference}. ${v.text}`);
          }
          return;
        }
        await speak(`${verse.reference}. ${verse.text}`);
        return;
      }

      const preview = voicePrefs.readFullVerse
        ? `${verse.reference}. ${verse.text}`
        : `${verse.reference}.`;
      await speak(preview);
    },
    [
      practiceEntireRange,
      rangeVerses,
      verse,
      voicePrefs.readFullVerse,
      voicePrefs.announceEachVerseWhenReading,
      speak,
      getSpeechGeneration,
    ]
  );

  useEffect(() => {
    if (isWelcomeDemo || !handsFree || !verse || loading || phase !== "memorize") return;
    if (handsFreeFlowStarted.current) return;
    handsFreeFlowStarted.current = true;
    void (async () => {
      const runGen = getSpeechGeneration();
      await speakPassagePreview(runGen);
      if (getSpeechGeneration() !== runGen) {
        handsFreeFlowStarted.current = false;
        if (phaseRef.current === "memorize") setCommandListen(true);
        return;
      }
      if (voicePrefs.micStartMode === "startPhrase") {
        await speak("Say begin when ready.");
        if (getSpeechGeneration() !== runGen) {
          handsFreeFlowStarted.current = false;
          if (phaseRef.current === "memorize") setCommandListen(true);
          return;
        }
        setCommandListen(true);
        return;
      }
      await playCue();
      if (getSpeechGeneration() !== runGen) {
        handsFreeFlowStarted.current = false;
        return;
      }
      if (phaseRef.current !== "memorize") return;
      handleReady();
    })();
  }, [
    isWelcomeDemo,
    handsFree,
    verse,
    loading,
    phase,
    voicePrefs.micStartMode,
    speak,
    playCue,
    handleReady,
    speakPassagePreview,
    getSpeechGeneration,
  ]);

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
    if (!isChallengeSession || !challengeId) return;
    const row = challengeRow ?? (await getChallengeById(challengeId));
    if (!row) return;
    const nextKind = row.kind === "custom" ? "default" : "custom";
    await setChallengeKind(challengeId, nextKind);
    setChallengeRow({ ...row, kind: nextKind });
  }, [isChallengeSession, challengeId, challengeRow]);

  const handleNext = useCallback(async () => {
    setStreakCongrats(null);
    if (isIntro || isWelcomeDemo) {
      await leaveIntroToHome();
      return;
    }
    if (practiceEntireRange) {
      exitPractice();
      return;
    }
    if (isChallengeSession && challengeId) {
      const ids =
        verseIdsList.length > 0
          ? verseIdsList
          : rangeVerses?.map((v) => v.id) ?? [];
      const idx = selectedRangeIndex ?? currentIdx;
      if (ids.length > 1 && !practiceEntireRange && idx < ids.length - 1) {
        const nextId = ids[idx + 1]!;
        router.replace({
          pathname: "/practice-game",
          params: {
            session: "challenge",
            challengeId,
            verseId: nextId,
            mode: navigationMode,
            verseIds: ids.join(","),
            currentIndex: String(idx + 1),
            rangeMode: "verse",
          },
        });
        return;
      }
      const nextChallenge = await getNextIncompleteChallenge(challengeId);
      if (nextChallenge) {
        const verses = await loadVersesForChallenge(nextChallenge);
        const first = verses[0];
        if (!first) {
          exitPractice();
          return;
        }
        router.replace({
          pathname: "/practice-game",
          params: {
            session: "challenge",
            challengeId: nextChallenge.id,
            verseId: first.id,
            mode: navigationMode,
            ...(verses.length > 1
              ? {
                  verseIds: verses.map((v) => v.id).join(","),
                  currentIndex: "0",
                  rangeMode: "entire",
                }
              : {}),
          },
        });
        return;
      }
      exitPractice();
      return;
    }
    // Level session: global next-verse progression
    if (verse) {
      const v = await getNextGameVerse(verse.id);
      if (v) {
        router.replace({
          pathname: "/practice-game",
          params: { verseId: v.id, mode: navigationMode },
        });
      } else {
        exitPractice();
      }
    } else {
      exitPractice();
    }
  }, [
    verse,
    verseIdsList,
    rangeVerses,
    currentIdx,
    selectedRangeIndex,
    verseIds,
    navigationMode,
    practiceEntireRange,
    isIntro,
    isWelcomeDemo,
    isChallengeSession,
    challengeId,
    leaveIntroToHome,
    exitPractice,
    router,
  ]);

  const resetToMemorize = useCallback(() => {
    setStreakCongrats(null);
    setPhase("memorize");
    setScore(null);
    setWhatYouSaid("");
    setHintCount(0);
    handsFreeFlowStarted.current = false;
    setCommandListen(false);
    setReciteUseType(navigationMode === "type");
  }, [navigationMode]);

  const switchReciteToType = useCallback(() => {
    stopSpeak();
    setCommandListen(false);
    setReciteUseType(true);
    setReciteSession((s) => s + 1);
  }, [stopSpeak]);

  const switchReciteToSpeech = useCallback(() => {
    setReciteUseType(false);
    setReciteSession((s) => s + 1);
  }, []);

  useEffect(() => {
    if (phase !== "result") {
      setStreakCongrats(null);
    }
  }, [phase]);

  useEffect(() => {
    if (phase === "recite") {
      setCommandListen(false);
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== "recite") {
      setReciteListeningReady(false);
      return;
    }
    if (speechActive) {
      setReciteListeningReady(false);
      return;
    }
    const timer = setTimeout(() => setReciteListeningReady(true), 500);
    return () => clearTimeout(timer);
  }, [phase, speechActive]);

  const handleVoiceCommand = useCallback(
    async (text: string) => {
      if (parseInterruptSpeechCommand(text, { allowBareStop: speechActive })) {
        stopSpeak();
        handsFreeFlowStarted.current = false;
        setCommandListen(true);
        return;
      }
      const intent: VoiceIntent =
        phase === "result" ? parsePracticeResultCommand(text) : parseVoiceCommand(text);
      setCommandListen(false);
      stopSpeak();
      setStreakCongrats(null);
      if (intent === "handsFreeOff") {
        await setEnabled(false);
        return;
      }
      if (intent === "begin" && phase === "memorize") {
        handleReady();
        return;
      }
      if (intent === "home") {
        exitPractice();
        return;
      }
      if (intent === "restart" || intent === "again") {
        resetToMemorize();
        return;
      }
      if (intent === "tryMore" || intent === "repeat") {
        if (intent === "repeat" && verse) {
          await speakPassagePreview(getSpeechGeneration());
          await playCue();
        } else {
          await playCue();
        }
        setStreakCongrats(null);
        setReciteSession((s) => s + 1);
        setReciteUseType(navigationMode === "type");
        setPhase("recite");
        setScore(null);
        startTime.current = Date.now();
        return;
      }
      if (intent === "advance" || intent === "next" || intent === "continue") {
        if (score && score.percent < passPercent) {
          await speak("Pass this verse first, or say try again.");
          setCommandListen(true);
          return;
        }
        await handleNext();
        return;
      }
      setCommandListen(false);
      requestAnimationFrame(() => setCommandListen(true));
    },
    [
      phase,
      verse,
      score,
      passPercent,
      handleNext,
      handleReady,
      exitPractice,
      resetToMemorize,
      speak,
      playCue,
      stopSpeak,
      speechActive,
      speakPassagePreview,
      getSpeechGeneration,
      setEnabled,
    ]
  );

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
        source: isVotd ? "votd" : isIntro ? "intro" : isChallengeSession ? "challenge" : "level",
        practiceEntireRange,
        challengeId: isChallengeSession ? challengeId : undefined,
      };
      const recordAttempt = async () => {
        const actions: RecordUserActionInput[] = [];
        for (const id of actionVerseIds) {
          actions.push({ actionType: "attempted_verse", verseId: id, scorePercent: s.percent, metadata });
          actions.push({
            actionType: inputMode === "speech" ? "spoke_verse" : "wrote_verse",
            verseId: id,
            scorePercent: s.percent,
            metadata,
          });
          if (passed) {
            actions.push({ actionType: "completed_verse", verseId: id, scorePercent: s.percent, metadata });
          }
          if (s.percent === 100) {
            actions.push({ actionType: "perfect_score", verseId: id, scorePercent: s.percent, metadata });
          }
        }
        await recordUserActions(actions);
        if (isChallengeSession && challengeId) {
          const updated = await recordChallengeAttempt(challengeId, s.percent);
          if (updated) setChallengeRow(updated);
          return;
        }
        if (passed) {
          if (practiceEntireRange && rangeVerses?.length) {
            await Promise.all(rangeVerses.map((v) => markVerseCompleted(v.id, elapsed, s.percent)));
          } else {
            const levelVerseId = verse.id.includes(",") ? verse.id.split(",")[0]! : verse.id;
            await markVerseCompleted(levelVerseId, elapsed, s.percent);
          }
        } else if (practiceEntireRange && rangeVerses?.length) {
          await Promise.all(rangeVerses.map((v) => updateVerseScore(v.id, s.percent)));
        } else {
          const levelVerseId = verse.id.includes(",") ? verse.id.split(",")[0]! : verse.id;
          await updateVerseScore(levelVerseId, s.percent);
        }
      };
      void checkNewStreakDay(recordAttempt)
        .then((streak) => {
          if (streak && phaseRef.current === "result") {
            setStreakCongrats(streak);
          }
        })
        .catch(() => {
          // Avoid unhandled rejection if SQLite was busy; data may retry on next attempt.
        });
      if (passed) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      }
    },
    [
      verse,
      practiceEntireRange,
      rangeVerses,
      isVotd,
      isIntro,
      passPercent,
      isChallengeSession,
      challengeId,
    ]
  );

  useEffect(() => {
    if (!handsFree || phase !== "result" || score == null) return;
    void (async () => {
      const passed = score.percent >= passPercent;
      const summary = passed
        ? `Nice work. ${score.percent} percent. ${score.correct} of ${score.total} words.`
        : `Keep going. ${score.percent} percent.`;
      const prompt = passed
        ? "Say advance, try more, or done."
        : "Say try again, try more, or done.";
      await speak(`${summary} ${prompt}`);
      setCommandListen(true);
    })();
  }, [handsFree, phase, score, passPercent, speak]);

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
          onPress={() => exitPractice()}
          style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.primaryBtnText}>
            {isIntro || isWelcomeDemo ? "Continue to home" : "Go back"}
          </Text>
        </Pressable>
      </View>
    );
  }

  const passedThisRound = score !== null && score.percent >= passPercent;
  const showConfetti = phase === "result" && passedThisRound;
  const isFavorited = isChallengeSession && challengeRow?.kind === "custom";
  const showChallengeFavorite = isChallengeSession && !!challengeId;

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
      {phase === "memorize" || phase === "result" ? (
        <View style={styles.memorizeHeaderRow}>
          <Text style={[styles.ref, styles.refInRow, { color: colors.primary }]}>{verse.reference}</Text>
          {showChallengeFavorite ? (
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
          ) : null}
        </View>
      ) : (
        <Text style={[styles.ref, { color: colors.primary }]}>{verse.reference}</Text>
      )}
      {coachMessage && (phase === "memorize" || phase === "recite" || phase === "result") ? (
        <CoachBanner message={coachMessage} colors={colors} />
      ) : null}
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
            <>
              <Pressable
                style={({ pressed }) => [styles.rangeModeBtn, { opacity: pressed ? 0.85 : 1 }]}
                onPress={practiceEntireRange ? handlePracticeVerseByVerse : handlePracticeEntireRange}
              >
                <Text style={styles.rangeModeBtnText}>
                  {practiceEntireRange
                    ? "Practice one verse at a time"
                    : `Speak the whole passage (${rangeVerses.length} verses)`}
                </Text>
              </Pressable>
            </>
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
          {isWelcomeDemo ? (
            <Text style={[styles.verseText, { color: colors.textSecondary }]}>{verse.text}</Text>
          ) : (
            <>
              <Text style={styles.reciteHint}>Speak this verse. It's okay to use a hint.</Text>
              <Pressable
                style={({ pressed }) => [
                  styles.hintBtn,
                  !canHint && styles.hintBtnDisabled,
                  { opacity: canHint && pressed ? 0.8 : 1 },
                ]}
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
            </>
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
              onPress={() => resetToMemorize()}
            >
              <Text style={styles.retryBtnText}>Try again</Text>
            </Pressable>
            {passedThisRound ? (
              <Pressable
                style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.primary, transform: [{ scale: pressed ? 0.96 : 1 }] }]}
                onPress={handleNext}
              >
                <Text style={styles.primaryBtnText}>
                  {isIntro || isWelcomeDemo ? "Continue to home" : "Next verse"}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              style={({ pressed }) => [styles.quitBtn, { opacity: pressed ? 0.7 : 1 }]}
              onPress={() => exitPractice()}
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
        {reciteUseType || !speechWrapper.available ? (
          <ReciteComposerTypeOnly
            key={`${verse.id}-${reciteSession}-type`}
            verse={verse}
            onResult={handleSpeechResult}
            colors={colors}
            onSwitchToSpeech={
              speechWrapper.available && !isWelcomeDemo ? switchReciteToSpeech : undefined
            }
          />
        ) : (
          <ReciteComposerWithSpeech
            key={`${verse.id}-${reciteSession}-speech`}
            verse={verse}
            onResult={handleSpeechResult}
            onExit={exitPractice}
            onRestart={resetToMemorize}
            colors={colors}
            autoStart={
              !isWelcomeDemo && voicePrefs.autoSubmitOnSilence && reciteListeningReady
            }
            smartMic={isWelcomeDemo ? false : voicePrefs.autoSubmitOnSilence}
            minimalUI={handsFree && !isWelcomeDemo}
            silenceTimeoutMs={voicePrefs.silenceTimeoutMs}
            maxListenMs={voicePrefs.maxListenMs}
            onSwitchToType={switchReciteToType}
          />
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
    <CommandMicListener
      active={handsFree && commandListen && !speechActive}
      onTranscript={(t) => void handleVoiceCommand(t)}
    />
    </View>
    </KeyboardAvoidingView>
  );
}

function ReciteComposerTypeOnly({
  verse,
  onResult,
  colors,
  onSwitchToSpeech,
}: {
  verse: GameVerse;
  onResult: (score: AccuracyResult, transcript: string, inputMode: "speech" | "type") => void;
  colors: ThemeColors;
  onSwitchToSpeech?: () => void;
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
      {onSwitchToSpeech ? (
        <Pressable
          onPress={onSwitchToSpeech}
          style={({ pressed }) => [styles.composerModeSwitch, { opacity: pressed ? 0.7 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Use voice instead"
        >
          <Ionicons name="mic-outline" size={16} color={colors.primary} />
          <Text style={[styles.composerModeSwitchText, { color: colors.primary }]}>Use voice</Text>
        </Pressable>
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
  onExit,
  onRestart,
  colors,
  autoStart = false,
  smartMic = false,
  minimalUI = false,
  silenceTimeoutMs = DEFAULT_RECITE_LISTENING_CONFIG.silenceTimeoutMs,
  maxListenMs = DEFAULT_RECITE_LISTENING_CONFIG.maxListenMs,
  onSwitchToType,
}: {
  verse: GameVerse;
  onResult: (score: AccuracyResult, transcript: string, inputMode: "speech" | "type") => void;
  onExit?: () => void;
  onRestart?: () => void;
  colors: ThemeColors;
  autoStart?: boolean;
  smartMic?: boolean;
  minimalUI?: boolean;
  silenceTimeoutMs?: number;
  maxListenMs?: number;
  onSwitchToType?: () => void;
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
  const listenStartedAt = useRef(0);
  const lastFinalAt = useRef(0);
  const hasFinalChunk = useRef(false);
  const submittedRef = useRef(false);
  const autoStarted = useRef(false);
  const listenRetryRef = useRef(0);
  const lastErrorAtRef = useRef(0);
  const speechErrorAlertShownRef = useRef(false);
  const pendingReconnectRef = useRef(false);

  const speech = speechWrapper.module!;
  const { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } = speech;

  const contextualStrings = useMemo(
    () => buildVerseContextualStrings(verse.text),
    [verse.text]
  );

  useSpeechRecognitionEvent("start", () => {
    if (!pendingReconnectRef.current) {
      transcriptRef.current = "";
    }
    pendingReconnectRef.current = false;
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

  const stopListeningForBailOut = useCallback(() => {
    submittedRef.current = true;
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // ignore
    }
    setListening(false);
  }, [ExpoSpeechRecognitionModule]);

  const bailOutIfRestartPhrase = useCallback(
    (spoken: string) => {
      if (!onRestart || !isPracticeRestartPhrase(spoken)) return false;
      stopListeningForBailOut();
      onRestart();
      return true;
    },
    [onRestart, stopListeningForBailOut]
  );

  const bailOutIfExitPhrase = useCallback(
    (spoken: string) => {
      if (!onExit || !isPracticeExitPhrase(spoken)) return false;
      stopListeningForBailOut();
      onExit();
      return true;
    },
    [onExit, stopListeningForBailOut]
  );

  const submitTranscript = useCallback(() => {
    if (submittedRef.current) return;
    const text = transcriptRef.current.trim();
    if (bailOutIfRestartPhrase(text)) return;
    if (bailOutIfExitPhrase(text)) return;
    if (text.length < 2) return;
    submittedRef.current = true;
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // ignore
    }
    setListening(false);
    setStatus("Checking…");
    const result = computeAccuracy(verse.text, text);
    onResult(result, text, "speech");
  }, [verse.text, onResult, bailOutIfRestartPhrase, bailOutIfExitPhrase, ExpoSpeechRecognitionModule]);

  useSpeechRecognitionEvent("end", () => {
    pulseActive.current = false;
    pulseAnim.stopAnimation();
    pulseAnim.setValue(1);
    setListening(false);
    if (smartMic) {
      if (Date.now() - lastErrorAtRef.current < 600) return;
      submitTranscript();
      return;
    }
    setStatus("Stopped");
    const spoken = transcriptRef.current.trim();
    setEditableTranscript(spoken);
    setReviewMode(true);
  });

  useSpeechRecognitionEvent("result", (event: { results: { transcript: string }[]; isFinal?: boolean }) => {
    const results = event.results ?? [];
    if (results.length === 0) return;

    let text = results[results.length - 1]?.transcript?.trim() ?? "";
    if (results.length > 1) {
      let bestPercent = -1;
      for (const r of results) {
        const candidate = r.transcript?.trim() ?? "";
        if (!candidate) continue;
        const { percent } = computeAccuracy(verse.text, candidate);
        if (percent > bestPercent || (percent === bestPercent && candidate.length > text.length)) {
          bestPercent = percent;
          text = candidate;
        }
      }
    }
    if (!text) return;

    const current = transcriptRef.current.trim();
    if (event.isFinal) {
      hasFinalChunk.current = true;
      lastFinalAt.current = Date.now();
      if (current.length === 0 || text.toLowerCase().startsWith(current.toLowerCase())) {
        transcriptRef.current = text;
      } else {
        transcriptRef.current = (current + " " + text).trim();
      }
      setTranscript(transcriptRef.current);
      const spoken = transcriptRef.current.trim();
      if (bailOutIfRestartPhrase(spoken)) return;
      if (bailOutIfExitPhrase(spoken)) return;
    } else {
      setTranscript(current ? current + " " + text : text);
    }
  });

  useSpeechRecognitionEvent("error", (event: { error: string; message?: string }) => {
    pulseActive.current = false;
    pulseAnim.stopAnimation();
    pulseAnim.setValue(1);
    setListening(false);
    lastErrorAtRef.current = Date.now();
    if (event.error === "aborted" || event.error === "no-speech") {
      setStatus("Ready");
      return;
    }
    const delay = retryDelayMsForSpeechError(event.error, listenRetryRef.current);
    const recoverable = smartMic && !submittedRef.current && delay != null;
    if (recoverable) {
      listenRetryRef.current += 1;
      setStatus(isSpeaking() ? "Waiting…" : "Reconnecting…");
      setTimeout(() => {
        if (!submittedRef.current) void handleStart({ reconnect: true });
      }, isSpeaking() ? 500 : delay);
      return;
    }
    setStatus("Tap mic to try again");
    if (event.error !== "aborted" && !speechErrorAlertShownRef.current) {
      speechErrorAlertShownRef.current = true;
      Alert.alert("Speech error", userMessageForSpeechError(event.error, event.message));
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

  const handleStart = useCallback(async (opts?: { reconnect?: boolean }) => {
    const reconnect = opts?.reconnect === true;
    if (permissionGranted === false) return;
    if (isSpeaking()) {
      setStatus("Waiting…");
      setTimeout(() => {
        if (!submittedRef.current) void handleStart(opts);
      }, 400);
      return;
    }
    if (permissionGranted !== true && !(await requestPermissions())) return;
    if (!reconnect) {
      listenRetryRef.current = 0;
      speechErrorAlertShownRef.current = false;
      submittedRef.current = false;
      hasFinalChunk.current = false;
      listenStartedAt.current = Date.now();
      lastFinalAt.current = Date.now();
      setReviewMode(false);
      setEditableTranscript("");
      setTranscript("");
      transcriptRef.current = "";
    }
    pendingReconnectRef.current = reconnect;
    setStatus(reconnect ? "Reconnecting…" : "Starting...");
    try {
      await ensureVoiceAudioMode();
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {
        // ignore — release mic before starting again
      }
      ExpoSpeechRecognitionModule.start({
        lang: "en-US",
        interimResults: true,
        continuous: true,
        maxAlternatives: 5,
        contextualStrings,
      });
    } catch (e) {
      setListening(false);
      setStatus("Tap mic to try again");
      if (!speechErrorAlertShownRef.current) {
        speechErrorAlertShownRef.current = true;
        Alert.alert("Error", String(e));
      }
    }
  }, [permissionGranted, requestPermissions, ExpoSpeechRecognitionModule, contextualStrings]);

  useEffect(() => {
    return () => {
      pulseActive.current = false;
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {
        // ignore
      }
    };
  }, [ExpoSpeechRecognitionModule]);

  useEffect(() => {
    if (!autoStart || autoStarted.current) return;
    autoStarted.current = true;
    void handleStart();
  }, [autoStart, handleStart]);

  useEffect(() => {
    if (!smartMic || !isListening) return;
    const tick = setInterval(() => {
      const now = Date.now();
      const msSinceFinal = now - lastFinalAt.current;
      const msListening = now - listenStartedAt.current;
      if (
        shouldAutoSubmit(transcriptRef.current, hasFinalChunk.current, msSinceFinal, msListening, {
          silenceTimeoutMs,
          maxListenMs,
          minTranscriptLength: 2,
        })
      ) {
        submitTranscript();
      }
    }, 400);
    return () => clearInterval(tick);
  }, [smartMic, isListening, silenceTimeoutMs, maxListenMs, submitTranscript]);

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
    if (bailOutIfRestartPhrase(text)) return;
    if (bailOutIfExitPhrase(text)) return;
    const result = computeAccuracy(verse.text, text);
    onResult(result, text, "speech");
  }, [verse, reviewMode, editableTranscript, transcript, onResult, bailOutIfRestartPhrase, bailOutIfExitPhrase]);

  const displayText = reviewMode ? editableTranscript : transcript;
  const onChangeComposerText = (t: string) => {
    if (reviewMode) setEditableTranscript(t);
    else setTranscript(t);
  };

  const onMicPress = useCallback(() => {
    if (smartMic) {
      if (isListening) submitTranscript();
      return;
    }
    if (isListening) handleStop();
    else void handleStart();
  }, [smartMic, isListening, handleStop, handleStart, submitTranscript]);

  const canCheckSpeech =
    !smartMic && !isListening && (reviewMode ? editableTranscript : transcript).trim().length > 0;
  const placeholder = isListening
    ? "Listening — speak the Word"
    : reviewMode
      ? "Edit if needed…"
      : "Speak the Word…";

  if (minimalUI) {
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
        accessibilityLiveRegion="polite"
      >
        <Text style={[styles.composerStatus, { color: colors.textMuted, fontSize: 16 }]}>
          {isListening ? "Listening…" : status}
        </Text>
        {!isListening && transcriptRef.current.length > 0 ? (
          <Pressable onPress={submitTranscript} style={{ marginTop: 8 }}>
            <Text style={{ color: colors.primary, fontWeight: "600" }}>Done speaking</Text>
          </Pressable>
        ) : null}
        {onSwitchToType ? (
          <Pressable
            onPress={() => {
              try {
                ExpoSpeechRecognitionModule.stop();
              } catch {
                // ignore
              }
              pulseActive.current = false;
              setListening(false);
              onSwitchToType();
            }}
            style={({ pressed }) => [styles.composerModeSwitch, { opacity: pressed ? 0.7 : 1, marginTop: 10 }]}
            accessibilityRole="button"
            accessibilityLabel="Type instead"
          >
            <Ionicons name="create-outline" size={16} color={colors.primary} />
            <Text style={[styles.composerModeSwitchText, { color: colors.primary }]}>Type instead</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

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
      {onSwitchToType ? (
        <Pressable
          onPress={() => {
            if (isListening) {
              try {
                ExpoSpeechRecognitionModule.stop();
              } catch {
                // ignore
              }
            }
            pulseActive.current = false;
            setListening(false);
            onSwitchToType();
          }}
          style={({ pressed }) => [styles.composerModeSwitch, { opacity: pressed ? 0.7 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Type instead"
        >
          <Ionicons name="create-outline" size={16} color={colors.primary} />
          <Text style={[styles.composerModeSwitchText, { color: colors.primary }]}>Type instead</Text>
        </Pressable>
      ) : null}
      <View style={styles.composerRow}>
        {!smartMic ? (
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
        ) : (
          <View style={[styles.composerInput, { justifyContent: "center", borderWidth: 0 }]}>
            <Text style={{ color: colors.textMuted }}>{isListening ? "Listening…" : "Speak the verse"}</Text>
          </View>
        )}
        {!smartMic ? (
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
        ) : (
          <Pressable
            onPress={onMicPress}
            style={({ pressed }) => [
              styles.composerIconBtn,
              {
                backgroundColor: colors.primary,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Done speaking"
          >
            <Text style={{ color: colors.primaryText, fontWeight: "600", fontSize: 12 }}>Done</Text>
          </Pressable>
        )}
        {!smartMic ? (
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
              accessibilityLabel={isListening ? "Stop recording" : "Start recording"}
            >
              <Ionicons name={isListening ? "stop" : "mic"} size={22} color={colors.primaryText} />
            </Pressable>
          </Animated.View>
        ) : null}
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
    composerModeSwitch: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: 6,
      marginBottom: 8,
      paddingVertical: 4,
    },
    composerModeSwitchText: { fontSize: 14, fontWeight: "600" },
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

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { playReciteCue, ensureVoiceAudioMode } from "../lib/voiceCue";
import { setTtsPreferences, speakText, stopSpeaking, subscribeSpeechActivity } from "../lib/voiceFeedback";
import { SpeechStopBar } from "../components/SpeechStopBar";
import {
  getHandsFreePreferences,
  setHandsFreeEnabled,
  updateHandsFreePreferences,
  type HandsFreePreferences,
  type AutoCueType,
  type MicStartMode,
} from "../utils/preferences";

type AppVoiceContextValue = {
  prefs: HandsFreePreferences;
  refreshPrefs: () => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
  updatePrefs: (partial: Partial<HandsFreePreferences>) => Promise<void>;
  speak: (text: string) => Promise<void>;
  stopSpeak: () => void;
  playCue: () => Promise<void>;
  speechActive: boolean;
  /** Bumps when the user stops speech; compare to cancel multi-step read-aloud flows. */
  getSpeechGeneration: () => number;
};

const AppVoiceContext = createContext<AppVoiceContextValue | null>(null);

export function AppVoiceProvider({ children }: { children: ReactNode }) {
  const [speechActive, setSpeechActive] = useState(false);
  const speechGenerationRef = useRef(0);

  const [prefs, setPrefs] = useState<HandsFreePreferences>({
    handsFreeEnabled: false,
    micStartMode: "autoCue",
    autoCueType: "beep",
    autoSubmitOnSilence: true,
    silenceTimeoutMs: 2500,
    maxListenMs: 90000,
    readFullVerse: true,
    announceEachVerseWhenReading: false,
    speakScreenContext: true,
    ttsVoiceId: null,
    ttsSpeechRate: 0.92,
  });

  const refreshPrefs = useCallback(async () => {
    const next = await getHandsFreePreferences();
    setPrefs(next);
  }, []);

  useEffect(() => {
    void refreshPrefs();
    void ensureVoiceAudioMode();
  }, [refreshPrefs]);

  useEffect(() => {
    setTtsPreferences({
      voiceId: prefs.ttsVoiceId,
      rate: prefs.ttsSpeechRate,
    });
  }, [prefs.ttsVoiceId, prefs.ttsSpeechRate]);

  useEffect(() => {
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    return subscribeSpeechActivity((active) => {
      if (active) {
        if (idleTimer != null) {
          clearTimeout(idleTimer);
          idleTimer = null;
        }
        setSpeechActive(true);
        return;
      }
      idleTimer = setTimeout(() => {
        idleTimer = null;
        setSpeechActive(false);
      }, 450);
    });
  }, []);

  const setEnabled = useCallback(
    async (enabled: boolean) => {
      await setHandsFreeEnabled(enabled);
      await refreshPrefs();
    },
    [refreshPrefs]
  );

  const updatePrefs = useCallback(
    async (partial: Partial<HandsFreePreferences>) => {
      await updateHandsFreePreferences(partial);
      await refreshPrefs();
    },
    [refreshPrefs]
  );

  const speak = useCallback(async (text: string) => {
    await speakText(text);
  }, []);

  const stopSpeak = useCallback(() => {
    stopSpeaking();
    speechGenerationRef.current += 1;
  }, []);

  const getSpeechGeneration = useCallback(() => speechGenerationRef.current, []);

  const playCue = useCallback(async () => {
    await playReciteCue(prefs.autoCueType);
  }, [prefs.autoCueType]);

  const value = useMemo(
    () => ({
      prefs,
      refreshPrefs,
      setEnabled,
      updatePrefs,
      speak,
      stopSpeak,
      playCue,
      speechActive,
      getSpeechGeneration,
    }),
    [prefs, refreshPrefs, setEnabled, updatePrefs, speak, stopSpeak, playCue, speechActive, getSpeechGeneration]
  );

  return (
    <AppVoiceContext.Provider value={value}>
      {children}
      <SpeechStopBar />
    </AppVoiceContext.Provider>
  );
}

export function useAppVoice(): AppVoiceContextValue {
  const ctx = useContext(AppVoiceContext);
  if (!ctx) throw new Error("useAppVoice must be used within AppVoiceProvider");
  return ctx;
}

export function useHandsFreeEnabled(): boolean {
  const { prefs } = useAppVoice();
  return prefs.handsFreeEnabled;
}

export type { MicStartMode, AutoCueType, HandsFreePreferences };

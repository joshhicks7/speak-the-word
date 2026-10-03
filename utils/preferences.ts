import AsyncStorage from "@react-native-async-storage/async-storage";

const KEYS = {
  handsFreeEnabled: "speak-hands-free-enabled",
  handsFreeDisclaimerSeen: "speak-hands-free-disclaimer-seen",
  micStartMode: "speak-mic-start-mode",
  autoCueType: "speak-auto-cue-type",
  autoSubmitOnSilence: "speak-auto-submit-silence",
  silenceTimeoutMs: "speak-silence-timeout-ms",
  maxListenMs: "speak-max-listen-ms",
  readFullVerse: "speak-read-full-verse",
  announceEachVerseWhenReading: "speak-announce-each-verse",
  speakScreenContext: "speak-screen-context",
} as const;

export type MicStartMode = "autoCue" | "startPhrase";
export type AutoCueType = "beep" | "spokenPrompt";

export type HandsFreePreferences = {
  handsFreeEnabled: boolean;
  micStartMode: MicStartMode;
  autoCueType: AutoCueType;
  autoSubmitOnSilence: boolean;
  silenceTimeoutMs: number;
  maxListenMs: number;
  readFullVerse: boolean;
  /** When on, multi-verse read-aloud says each reference (23:1, 23:2…) before its text. */
  announceEachVerseWhenReading: boolean;
  speakScreenContext: boolean;
};

const DEFAULTS: HandsFreePreferences = {
  handsFreeEnabled: false,
  micStartMode: "autoCue",
  autoCueType: "beep",
  autoSubmitOnSilence: true,
  silenceTimeoutMs: 2500,
  maxListenMs: 90000,
  readFullVerse: true,
  announceEachVerseWhenReading: false,
  speakScreenContext: true,
};

export async function getHandsFreePreferences(): Promise<HandsFreePreferences> {
  try {
    const entries = await AsyncStorage.multiGet(Object.values(KEYS));
    const map = Object.fromEntries(entries);
    return {
      handsFreeEnabled: map[KEYS.handsFreeEnabled] === "true",
      micStartMode: (map[KEYS.micStartMode] as MicStartMode) ?? DEFAULTS.micStartMode,
      autoCueType: (map[KEYS.autoCueType] as AutoCueType) ?? DEFAULTS.autoCueType,
      autoSubmitOnSilence: map[KEYS.autoSubmitOnSilence] !== "false",
      silenceTimeoutMs: parseInt(map[KEYS.silenceTimeoutMs] ?? "", 10) || DEFAULTS.silenceTimeoutMs,
      maxListenMs: parseInt(map[KEYS.maxListenMs] ?? "", 10) || DEFAULTS.maxListenMs,
      readFullVerse: map[KEYS.readFullVerse] !== "false",
      announceEachVerseWhenReading: map[KEYS.announceEachVerseWhenReading] === "true",
      speakScreenContext: map[KEYS.speakScreenContext] !== "false",
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function setHandsFreeEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(KEYS.handsFreeEnabled, enabled ? "true" : "false");
}

export async function hasSeenHandsFreeDisclaimer(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEYS.handsFreeDisclaimerSeen)) === "true";
}

export async function setHandsFreeDisclaimerSeen(): Promise<void> {
  await AsyncStorage.setItem(KEYS.handsFreeDisclaimerSeen, "true");
}

export async function updateHandsFreePreferences(
  partial: Partial<HandsFreePreferences>
): Promise<void> {
  const pairs: [string, string][] = [];
  if (partial.handsFreeEnabled != null) {
    pairs.push([KEYS.handsFreeEnabled, partial.handsFreeEnabled ? "true" : "false"]);
  }
  if (partial.micStartMode != null) pairs.push([KEYS.micStartMode, partial.micStartMode]);
  if (partial.autoCueType != null) pairs.push([KEYS.autoCueType, partial.autoCueType]);
  if (partial.autoSubmitOnSilence != null) {
    pairs.push([KEYS.autoSubmitOnSilence, partial.autoSubmitOnSilence ? "true" : "false"]);
  }
  if (partial.silenceTimeoutMs != null) {
    pairs.push([KEYS.silenceTimeoutMs, String(partial.silenceTimeoutMs)]);
  }
  if (partial.maxListenMs != null) pairs.push([KEYS.maxListenMs, String(partial.maxListenMs)]);
  if (partial.readFullVerse != null) {
    pairs.push([KEYS.readFullVerse, partial.readFullVerse ? "true" : "false"]);
  }
  if (partial.announceEachVerseWhenReading != null) {
    pairs.push([
      KEYS.announceEachVerseWhenReading,
      partial.announceEachVerseWhenReading ? "true" : "false",
    ]);
  }
  if (partial.speakScreenContext != null) {
    pairs.push([KEYS.speakScreenContext, partial.speakScreenContext ? "true" : "false"]);
  }
  if (pairs.length > 0) await AsyncStorage.multiSet(pairs);
}

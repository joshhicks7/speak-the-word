import * as Speech from "expo-speech";
import { VoiceQuality, type Voice } from "expo-speech";

export type TtsPreferences = {
  /** Empty / null = pick best enhanced English voice on device. */
  voiceId: string | null;
  /** 1.0 = platform normal rate (see expo-speech). */
  rate: number;
};

export const DEFAULT_TTS_RATE = 0.92;

let voicesCache: Voice[] | null = null;
let cachedAutoVoiceId: string | undefined;

function isEnglishVoice(v: Voice): boolean {
  return (v.language ?? "").toLowerCase().startsWith("en");
}

function voiceNaturalnessScore(v: Voice): number {
  let score = 0;
  if (v.quality === VoiceQuality.Enhanced) score += 100;
  const name = v.name.toLowerCase();
  if (name.includes("enhanced") || name.includes("premium")) score += 25;
  if (name.includes("samantha") || name.includes("ava") || name.includes("allison")) score += 15;
  if (name.includes("compact") || name.includes("novelty")) score -= 80;
  return score;
}

export async function loadAvailableVoices(): Promise<Voice[]> {
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    voicesCache = voices;
    return voices;
  } catch {
    voicesCache = [];
    return [];
  }
}

export function englishVoicesForPicker(voices: Voice[]): Voice[] {
  return voices
    .filter(isEnglishVoice)
    .sort((a, b) => {
      const byScore = voiceNaturalnessScore(b) - voiceNaturalnessScore(a);
      if (byScore !== 0) return byScore;
      return a.name.localeCompare(b.name);
    });
}

export async function resolveAutoEnglishVoiceId(): Promise<string | undefined> {
  if (cachedAutoVoiceId) return cachedAutoVoiceId;
  const voices = voicesCache ?? (await loadAvailableVoices());
  const pick = englishVoicesForPicker(voices)[0];
  cachedAutoVoiceId = pick?.identifier;
  return pick?.identifier;
}

export function clearAutoVoiceCache(): void {
  cachedAutoVoiceId = undefined;
}

export async function resolveSpeakOptions(
  prefs: TtsPreferences
): Promise<Pick<Speech.SpeechOptions, "language" | "voice" | "rate" | "pitch">> {
  const explicit = prefs.voiceId?.trim();
  const voice = explicit || (await resolveAutoEnglishVoiceId());
  return {
    language: "en-US",
    rate: prefs.rate,
    pitch: 1,
    ...(voice ? { voice } : {}),
  };
}

export function labelForTtsVoice(voiceId: string | null | undefined, voices: Voice[]): string {
  if (!voiceId?.trim()) return "Automatic (best on device)";
  const match = voices.find((v) => v.identifier === voiceId);
  if (!match) return "Automatic (best on device)";
  const enhanced = match.quality === VoiceQuality.Enhanced ? " · Enhanced" : "";
  return `${match.name}${enhanced}`;
}

export const TTS_RATE_PRESETS: { label: string; rate: number }[] = [
  { label: "Calm", rate: 0.88 },
  { label: "Natural", rate: DEFAULT_TTS_RATE },
  { label: "Normal", rate: 1 },
];

export function labelForTtsRate(rate: number): string {
  const preset = TTS_RATE_PRESETS.find((p) => Math.abs(p.rate - rate) < 0.001);
  return preset?.label ?? `${rate.toFixed(2)}×`;
}

import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";
import { speakText } from "./voiceFeedback";

let audioModeReady = false;

export async function ensureVoiceAudioMode(): Promise<void> {
  if (audioModeReady) return;
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
    audioModeReady = true;
  } catch {
    // ignore
  }
}

/** Cue before recite listening (voicemail-style). */
export async function playReciteCue(autoCueType: "beep" | "spokenPrompt"): Promise<void> {
  await ensureVoiceAudioMode();
  if (autoCueType === "spokenPrompt") {
    await speakText("Speak after the tone.");
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    return;
  }
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  await new Promise((r) => setTimeout(r, 350));
}

import * as Speech from "expo-speech";

let speaking = false;
const queue: { text: string; resolve: () => void }[] = [];

type SpeechActivityListener = (active: boolean) => void;
const activityListeners = new Set<SpeechActivityListener>();

function isSpeechActive(): boolean {
  return speaking || queue.length > 0;
}

function notifySpeechActivity(): void {
  const active = isSpeechActive();
  for (const listener of activityListeners) {
    listener(active);
  }
}

export function subscribeSpeechActivity(listener: SpeechActivityListener): () => void {
  activityListeners.add(listener);
  listener(isSpeechActive());
  return () => activityListeners.delete(listener);
}

function drainQueue(): void {
  if (speaking || queue.length === 0) return;
  const next = queue.shift()!;
  speaking = true;
  notifySpeechActivity();
  Speech.speak(next.text, {
    language: "en-US",
    onDone: () => {
      speaking = false;
      next.resolve();
      notifySpeechActivity();
      drainQueue();
    },
    onStopped: () => {
      speaking = false;
      next.resolve();
      notifySpeechActivity();
      drainQueue();
    },
    onError: () => {
      speaking = false;
      next.resolve();
      notifySpeechActivity();
      drainQueue();
    },
  });
}

export function speakText(text: string): Promise<void> {
  return new Promise((resolve) => {
    queue.push({ text, resolve });
    notifySpeechActivity();
    drainQueue();
  });
}

export function stopSpeaking(): void {
  Speech.stop();
  speaking = false;
  while (queue.length > 0) {
    queue.shift()!.resolve();
  }
  notifySpeechActivity();
}

export function isSpeaking(): boolean {
  return isSpeechActive();
}

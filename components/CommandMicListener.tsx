import React, { useCallback, useEffect, useRef } from "react";
import { logVoiceCommand, logVoicePhrase } from "../lib/voiceCommandLog";
import { ensureVoiceAudioMode } from "../lib/voiceCue";
import { looksLikeScriptureReferenceAttempt } from "../lib/parseScriptureReference";
import { parseStrictVerseMenuCommand, parseVoiceCommand } from "../lib/voiceCommands";
import speechWrapper from "../lib/speechRecognitionWrapper";

const COMMAND_CONTEXTUAL_STRINGS = [
  "advance",
  "next verse",
  "continue",
  "try again",
  "try more",
  "read",
  "add",
  "home",
  "done",
  "quit",
  "finish",
  "exit",
  "begin",
  "ready",
  "practice",
  "play",
  "start",
  "levels",
  "challenges",
  "settings",
  "find verse",
  "stop speaking",
  "stop reading",
  "quiet",
  "stop",
];

type Props = {
  active: boolean;
  onTranscript: (text: string) => void;
  /** When a hub verse is loaded, accept interim STT for exact "read" / "practice" / "add". */
  verseMenuPending?: boolean;
};

/**
 * Accept interim STT only when the tail looks like a reference (e.g. "practice jon 3").
 * Do not accept bare "practice" / "home" on partial results — that stops the mic mid-phrase.
 */
function shouldAcceptCommandTranscript(
  text: string,
  isFinal: boolean,
  verseMenuPending: boolean
): boolean {
  if (isFinal) return true;
  if (looksLikeScriptureReferenceAttempt(text)) return true;
  if (verseMenuPending && parseStrictVerseMenuCommand(text) !== "unknown") return true;
  return false;
}

function CommandMicListenerInner({ active, onTranscript, verseMenuPending = false }: Props) {
  const speech = speechWrapper.module!;
  const { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } = speech;

  const activeRef = useRef(active);
  const verseMenuPendingRef = useRef(verseMenuPending);
  const onTranscriptRef = useRef(onTranscript);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFiredRef = useRef("");

  activeRef.current = active;
  verseMenuPendingRef.current = verseMenuPending;
  onTranscriptRef.current = onTranscript;

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current != null) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const startListeningRef = useRef<(() => Promise<void>) | null>(null);

  const scheduleRestart = useCallback(
    (delayMs = 350) => {
      clearRestartTimer();
      if (!activeRef.current) return;
      restartTimerRef.current = setTimeout(() => {
        restartTimerRef.current = null;
        void startListeningRef.current?.();
      }, delayMs);
    },
    [clearRestartTimer]
  );

  const startListening = useCallback(async () => {
    if (!activeRef.current) return;
    clearRestartTimer();
    try {
      await ensureVoiceAudioMode();
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted || !activeRef.current) return;
      ExpoSpeechRecognitionModule.start({
        lang: "en-US",
        interimResults: true,
        continuous: true,
        maxAlternatives: 3,
        contextualStrings: COMMAND_CONTEXTUAL_STRINGS,
        iosTaskHint: "confirmation",
      });
    } catch {
      scheduleRestart(500);
    }
  }, [ExpoSpeechRecognitionModule, clearRestartTimer, scheduleRestart]);

  startListeningRef.current = startListening;

  const stopListening = useCallback(() => {
    clearRestartTimer();
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // ignore
    }
  }, [ExpoSpeechRecognitionModule, clearRestartTimer]);

  useSpeechRecognitionEvent("result", (event: { results: { transcript: string }[]; isFinal?: boolean }) => {
    if (!activeRef.current) return;
    const alternatives = event.results.map((r) => r.transcript?.trim() ?? "").filter(Boolean);
    const last = event.results[event.results.length - 1];
    const text = last?.transcript?.trim() ?? "";
    if (!text) return;

    logVoicePhrase(text, {
      isFinal: event.isFinal ?? false,
      alternatives: alternatives.length > 1 ? alternatives : undefined,
    });

    const isFinal = event.isFinal ?? false;
    if (!shouldAcceptCommandTranscript(text, isFinal, verseMenuPendingRef.current)) return;
    if (text === lastFiredRef.current) return;
    lastFiredRef.current = text;
    logVoiceCommand(text, {
      isFinal,
      intent: parseVoiceCommand(text),
    });
    onTranscriptRef.current(text);
  });

  useSpeechRecognitionEvent("end", () => {
    scheduleRestart();
  });

  useSpeechRecognitionEvent("nomatch", () => {
    scheduleRestart();
  });

  useSpeechRecognitionEvent("error", (event: { error: string }) => {
    if (event.error === "aborted" || event.error === "not-allowed") return;
    scheduleRestart(event.error === "busy" ? 800 : 350);
  });

  useSpeechRecognitionEvent("start", () => {
    lastFiredRef.current = "";
  });

  useEffect(() => {
    if (!active) {
      stopListening();
      return;
    }
    void startListening();
    return () => stopListening();
  }, [active, startListening, stopListening]);

  return null;
}

export function CommandMicListener(props: Props) {
  if (!speechWrapper.available || !props.active) return null;
  return <CommandMicListenerInner {...props} />;
}

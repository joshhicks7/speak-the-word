import React, { useCallback, useEffect, useRef } from "react";
import { logVoiceCommand, logVoicePhrase } from "../lib/voiceCommandLog";
import { ensureVoiceAudioMode } from "../lib/voiceCue";
import {
  isBarePartialReferenceTail,
  looksLikeScriptureReferenceAttempt,
} from "../lib/parseScriptureReference";
import {
  pickBestVoiceCommandTranscript,
  parseStrictVerseMenuCommand,
  parseVoiceCommand,
} from "../lib/voiceCommands";
import { isSpeaking } from "../lib/voiceFeedback";
import {
  retryDelayMsForSpeechError,
  shouldRetrySpeechError,
} from "../lib/speechMicRecovery";
import speechWrapper from "../lib/speechRecognitionWrapper";

const COMMAND_CONTEXTUAL_STRINGS = [
  "advance",
  "next verse",
  "next challenge",
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
  "back",
  "restart",
  "start over",
  "mic off",
  "microphone off",
  "manual mode",
  "hands free off",
  "begin",
  "ready",
  "practice",
  "play",
  "start",
  "levels",
  "challenges",
  "settings",
  "find verse",
  "next verse",
  "last verse",
  "last",
  "blast",
  "previous verse",
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
  /** Prefer a hypothesis that parses as Scripture when the engine sends multiple transcripts. */
  pickReferenceTranscript?: (primary: string, alternatives: string[]) => string;
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
  if (isBarePartialReferenceTail(text)) return false;
  if (isFinal) return true;
  if (looksLikeScriptureReferenceAttempt(text)) return true;
  if (verseMenuPending && parseStrictVerseMenuCommand(text) !== "unknown") return true;
  return false;
}

function CommandMicListenerInner({
  active,
  onTranscript,
  verseMenuPending = false,
  pickReferenceTranscript,
}: Props) {
  const speech = speechWrapper.module!;
  const { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } = speech;

  const activeRef = useRef(active);
  const verseMenuPendingRef = useRef(verseMenuPending);
  const onTranscriptRef = useRef(onTranscript);
  const pickReferenceTranscriptRef = useRef(pickReferenceTranscript);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFiredRef = useRef("");
  const listenAttemptRef = useRef(0);
  const micUnavailableRef = useRef(false);
  const lastErrorAtRef = useRef(0);

  activeRef.current = active;
  verseMenuPendingRef.current = verseMenuPending;
  onTranscriptRef.current = onTranscript;
  pickReferenceTranscriptRef.current = pickReferenceTranscript;

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
      if (!activeRef.current || isSpeaking() || micUnavailableRef.current) return;
      restartTimerRef.current = setTimeout(() => {
        restartTimerRef.current = null;
        if (!activeRef.current || isSpeaking() || micUnavailableRef.current) return;
        void startListeningRef.current?.();
      }, delayMs);
    },
    [clearRestartTimer]
  );

  const startListening = useCallback(async () => {
    if (!activeRef.current || micUnavailableRef.current) return;
    clearRestartTimer();
    try {
      await ensureVoiceAudioMode();
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {
        // ignore — ensure prior session is torn down before restart
      }
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
      const delay = retryDelayMsForSpeechError("unknown", listenAttemptRef.current);
      if (delay == null) {
        micUnavailableRef.current = true;
        return;
      }
      listenAttemptRef.current += 1;
      scheduleRestart(delay);
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
    if (!activeRef.current || isSpeaking()) return;
    const alternatives = event.results.map((r) => r.transcript?.trim() ?? "").filter(Boolean);
    const last = event.results[event.results.length - 1];
    const primary = last?.transcript?.trim() ?? "";
    if (!primary) return;

    const commandAwarePrimary = pickBestVoiceCommandTranscript(primary, alternatives);
    const text = pickReferenceTranscriptRef.current
      ? pickReferenceTranscriptRef.current(commandAwarePrimary, alternatives)
      : commandAwarePrimary;

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
    listenAttemptRef.current = 0;
    micUnavailableRef.current = false;
  });

  useSpeechRecognitionEvent("end", () => {
    if (isSpeaking()) return;
    if (Date.now() - lastErrorAtRef.current < 600) return;
    scheduleRestart();
  });

  useSpeechRecognitionEvent("nomatch", () => {
    if (micUnavailableRef.current) return;
    scheduleRestart();
  });

  useSpeechRecognitionEvent("error", (event: { error: string }) => {
    if (event.error === "aborted" || event.error === "not-allowed") return;
    lastErrorAtRef.current = Date.now();
    const delay = retryDelayMsForSpeechError(event.error, listenAttemptRef.current);
    if (delay == null || !shouldRetrySpeechError(event.error, listenAttemptRef.current)) {
      micUnavailableRef.current = true;
      clearRestartTimer();
      return;
    }
    listenAttemptRef.current += 1;
    scheduleRestart(delay);
  });

  useSpeechRecognitionEvent("start", () => {
    lastFiredRef.current = "";
  });

  useEffect(() => {
    if (!active) {
      stopListening();
      listenAttemptRef.current = 0;
      micUnavailableRef.current = false;
      lastErrorAtRef.current = 0;
      return;
    }
    listenAttemptRef.current = 0;
    micUnavailableRef.current = false;
    void startListening();
    return () => stopListening();
  }, [active, startListening, stopListening]);

  return null;
}

export function CommandMicListener(props: Props) {
  if (!speechWrapper.available || !props.active) return null;
  return <CommandMicListenerInner {...props} />;
}

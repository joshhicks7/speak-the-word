/** Errors that usually mean the mic or recognizer is unavailable (often another app holds the mic). */
const MIC_CONTENTION_ERRORS = new Set(["busy", "audio-capture"]);

const BENIGN_NO_RETRY_ERRORS = new Set(["aborted", "not-allowed", "no-speech"]);

export function isMicContentionError(error: string): boolean {
  return MIC_CONTENTION_ERRORS.has(error);
}

export function shouldRetrySpeechError(error: string, attempt: number): boolean {
  if (BENIGN_NO_RETRY_ERRORS.has(error)) return false;
  const maxAttempts = isMicContentionError(error) ? 4 : 6;
  return attempt < maxAttempts;
}

/** Delay before retry; null means do not retry. */
export function retryDelayMsForSpeechError(error: string, attempt: number): number | null {
  if (!shouldRetrySpeechError(error, attempt)) return null;
  const base = isMicContentionError(error) ? 1400 : 400;
  return Math.min(Math.round(base * Math.pow(1.45, attempt)), 10_000);
}

export function userMessageForSpeechError(error: string, message?: string): string {
  if (isMicContentionError(error)) {
    return (
      message?.trim() ||
      "The microphone is in use by another app or service. Close it and try again."
    );
  }
  if (error === "network") {
    return message?.trim() || "Speech recognition could not connect. Check your connection and try again.";
  }
  return message?.trim() || error;
}

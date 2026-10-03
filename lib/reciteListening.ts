export type ReciteListeningConfig = {
  silenceTimeoutMs: number;
  maxListenMs: number;
  minTranscriptLength: number;
};

export const DEFAULT_RECITE_LISTENING_CONFIG: ReciteListeningConfig = {
  silenceTimeoutMs: 2500,
  maxListenMs: 90000,
  minTranscriptLength: 2,
};

export function shouldAutoSubmit(
  transcript: string,
  hasFinalChunk: boolean,
  msSinceLastFinal: number,
  msListening: number,
  config: ReciteListeningConfig
): boolean {
  const trimmed = transcript.trim();
  if (trimmed.length < config.minTranscriptLength) return false;
  if (!hasFinalChunk) return false;
  if (msListening >= config.maxListenMs) return true;
  return msSinceLastFinal >= config.silenceTimeoutMs;
}

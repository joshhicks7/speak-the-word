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

/**
 * Merge STT hypotheses without duplicating cumulative updates (common on Android:
 * "thy" → "thy word" → "thy word have"). Only append when the new chunk is not
 * an extension of what we already have.
 */
export function mergeSttHypothesis(current: string, incoming: string): string {
  const c = current.trim();
  const t = incoming.trim();
  if (!t) return c;
  if (!c) return t;
  const cl = c.toLowerCase();
  const tl = t.toLowerCase();
  if (tl.startsWith(cl)) return t;
  if (cl.startsWith(tl)) return c;
  return `${c} ${t}`.trim();
}

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

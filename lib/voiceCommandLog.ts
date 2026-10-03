/** Flip to true to log voice commands in non-dev builds while testing. */
const FORCE_VOICE_COMMAND_LOG = false;

function enabled(): boolean {
  return FORCE_VOICE_COMMAND_LOG || (typeof __DEV__ !== "undefined" && __DEV__);
}

/** Raw STT phrase(s) as the engine hears them (interim + final). */
export function logVoicePhrase(
  fullPhrase: string,
  meta?: { isFinal?: boolean; alternatives?: string[] }
): void {
  if (!enabled()) return;
  console.log("[voice phrase]", fullPhrase);
  if (meta && (meta.isFinal != null || (meta.alternatives?.length ?? 0) > 0)) {
    console.log("[voice phrase detail]", meta);
  }
}

/** Log a finalized or accepted command-mic transcript (Metro / device logs). */
export function logVoiceCommand(transcript: string, meta?: Record<string, unknown>): void {
  if (!enabled()) return;
  console.log("[voice command]", transcript);
  if (meta && Object.keys(meta).length > 0) {
    console.log("[voice command detail]", meta);
  }
}

/** Log hub voice handling (parse result, route, etc.). */
export function logVoiceHub(message: string, meta?: Record<string, unknown>): void {
  if (!enabled()) return;
  if (meta && Object.keys(meta).length > 0) {
    console.log(`[voice hub] ${message}`, meta);
  } else {
    console.log(`[voice hub] ${message}`);
  }
}

const MAX_CONTEXTUAL_STRINGS = 100;

/** Short verse as a single bias phrase (Apple recommends brief phrases). */
const MAX_PHRASE_WORDS = 8;

/**
 * Build contextualStrings for expo-speech-recognition from the expected verse.
 * Prioritizes longer / distinctive words; caps at platform limits (~100).
 */
export function buildVerseContextualStrings(verseText: string): string[] {
  const trimmed = verseText.replace(/\s+/g, " ").trim();
  const tokens = trimmed.match(/[a-zA-Z']+/g) ?? [];
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const w of tokens) {
    const key = w.toLowerCase().replace(/'/g, "");
    if (key.length < 2) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(w);
  }

  unique.sort((a, b) => b.length - a.length);

  const out: string[] = [];
  const wordCount = tokens.length;
  if (wordCount > 0 && wordCount <= MAX_PHRASE_WORDS && trimmed.length <= 120) {
    out.push(trimmed);
  }
  for (const w of unique) {
    if (out.length >= MAX_CONTEXTUAL_STRINGS) break;
    if (!out.includes(w)) out.push(w);
  }
  return out.slice(0, MAX_CONTEXTUAL_STRINGS);
}

/**
 * Common speech-to-text variants for words in ASV / biblical English.
 * Each group's first string is the canonical form (matches the verse DB).
 * Lookup is a plain object map — O(1) per token at compare time.
 */
export const STT_WORD_GROUPS: readonly (readonly string[])[] = [
  ["yea", "yay", "yeah"],
  ["lo", "low"],
  ["o", "oh"],
  ["hath", "has"],
  ["doth", "does"],
  ["saith", "says"],
  ["spake", "spoke"],
  ["verily", "verbally"],
  /** STT often returns "blast" when the user says "last". */
  ["last", "blast"],
];

function buildSttWordAliasIndex(groups: readonly (readonly string[])[]): Readonly<Record<string, string>> {
  const index: Record<string, string> = {};
  for (const group of groups) {
    if (group.length === 0) continue;
    const canonical = group[0].toLowerCase().replace(/\s+/g, " ").trim();
    index[canonical] = canonical;
    for (let i = 1; i < group.length; i++) {
      const variant = group[i].toLowerCase().replace(/\s+/g, " ").trim();
      if (variant) index[variant] = canonical;
    }
  }
  return index;
}

/** variant (spoken or typed) -> canonical ASV token */
export const STT_WORD_ALIASES: Readonly<Record<string, string>> = buildSttWordAliasIndex(STT_WORD_GROUPS);

export function canonicalizeSttWord(word: string): string | undefined {
  return STT_WORD_ALIASES[word];
}

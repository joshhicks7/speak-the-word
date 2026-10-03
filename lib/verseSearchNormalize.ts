/** Normalize typed or STT search input for verse lookup. */
export function normalizeSearchQuery(raw: string): string {
  return raw
    .trim()
    .replace(/[^\w\s':]/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** Build an FTS5 MATCH string (token AND). */
export function buildFtsMatchQuery(normalized: string): string | null {
  const tokens = normalized.split(" ").filter((t) => t.length > 1);
  if (tokens.length === 0) return null;
  return tokens.map((t) => `"${t.replace(/"/g, "")}"`).join(" AND ");
}

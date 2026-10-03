import * as Linking from "expo-linking";

/** Custom URL scheme (`app.json` → expo.scheme). */
export const APP_SCHEME = "speaktheword";

/**
 * Build an in-app deep link, e.g. `speaktheword:///verse/40/6/33`.
 * @param path Route path without leading slash (e.g. `settings`, `verse/40/6/33`).
 */
export function buildAppLink(
  path: string,
  query?: Record<string, string | number | boolean | undefined | null>
): string {
  const trimmed = path.replace(/^\/+/, "");
  const params: Record<string, string> = {};
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        params[key] = String(value);
      }
    }
  }
  return Linking.createURL(trimmed, { scheme: APP_SCHEME, queryParams: params });
}

/** Deep link to practice a verse by internal verse id. */
export function practiceVerseLink(verseId: string): string {
  return buildAppLink("practice-game", { verseId, mode: "speech" });
}

/** Deep link by ASV book number, chapter, and verse (Matthew 6:33 → 40, 6, 33). */
export function scriptureReferenceLink(book: number, chapter: number, verse: number): string {
  return buildAppLink(`verse/${book}/${chapter}/${verse}`);
}

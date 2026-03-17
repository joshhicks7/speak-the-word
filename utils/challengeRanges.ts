import type { GameVerse } from "../types/verse";

/** Single verse challenge */
export type SingleChallenge = { type: "single"; verse: GameVerse };

/** Multi-verse range challenge (consecutive in same book/chapter) */
export type RangeChallenge = {
  type: "range";
  verses: GameVerse[];
  reference: string;
};

export type ChallengeItem = SingleChallenge | RangeChallenge;

/**
 * Group favorite verses into challenge items. Consecutive verses in the same
 * book and chapter (e.g. Hebrews 12:1 and 12:2) become one range challenge.
 */
export function groupFavoriteVersesIntoChallenges(verses: GameVerse[]): ChallengeItem[] {
  if (verses.length === 0) return [];

  const items: ChallengeItem[] = [];
  let run: GameVerse[] = [verses[0]];

  for (let i = 1; i < verses.length; i++) {
    const prev = verses[i - 1];
    const curr = verses[i];
    const sameBook = prev.book === curr.book;
    const sameChapter = prev.chapter === curr.chapter;
    const consecutiveVerse = curr.verse === prev.verse + 1;

    if (sameBook && sameChapter && consecutiveVerse) {
      run.push(curr);
    } else {
      if (run.length === 1) {
        items.push({ type: "single", verse: run[0] });
      } else {
        items.push({
          type: "range",
          verses: run,
          reference: formatRangeReference(run),
        });
      }
      run = [curr];
    }
  }

  if (run.length === 1) {
    items.push({ type: "single", verse: run[0] });
  } else {
    items.push({
      type: "range",
      verses: run,
      reference: formatRangeReference(run),
    });
  }

  return items;
}

function formatRangeReference(verses: GameVerse[]): string {
  const first = verses[0];
  const last = verses[verses.length - 1];
  if (first.chapter === last.chapter) {
    return `${first.reference.split(":")[0]}:${first.verse}-${last.verse}`;
  }
  return `${first.reference}-${last.chapter}:${last.verse}`;
}

/** Get the verse IDs for a challenge item (for practice-game verseIds param). */
export function getChallengeVerseIds(item: ChallengeItem): string[] {
  return item.type === "single" ? [item.verse.id] : item.verses.map((v) => v.id);
}

/** Get the first verse for a challenge (for practice-game verseId param). */
export function getChallengeFirstVerse(item: ChallengeItem): GameVerse {
  return item.type === "single" ? item.verse : item.verses[0];
}

/** Get display reference for a challenge. */
export function getChallengeReference(item: ChallengeItem): string {
  return item.type === "single" ? item.verse.reference : item.reference;
}

/** Get preview text (first verse text or "N verses"). */
export function getChallengePreview(item: ChallengeItem): string {
  if (item.type === "single") return item.verse.text;
  if (item.verses.length === 1) return item.verses[0].text;
  return `${item.verses.length} verses`;
}

/** Best completion score in the range, or single verse score. */
export function getChallengeScore(item: ChallengeItem): number | null {
  if (item.type === "single") return item.verse.completionScore ?? null;
  const scores = item.verses
    .map((v) => v.completionScore)
    .filter((s): s is number => s != null);
  return scores.length === 0 ? null : Math.max(...scores);
}

/** True if every verse in the challenge is completed. */
export function isChallengeCompleted(item: ChallengeItem): boolean {
  if (item.type === "single") return item.verse.isCompleted;
  return item.verses.every((v) => v.isCompleted);
}


import type { VersePosition } from "../database/queries";

export type GlobalChallenge = {
  id: string;
  title: string;
  type: "weekly" | "monthly";
  start: VersePosition;
  end: VersePosition;
};

export const GLOBAL_CHALLENGES: GlobalChallenge[] = [
  {
    id: "weekly-john-1-3",
    title: "This week: John 1–3",
    type: "weekly",
    start: { book: 43, chapter: 1, verse: 1 },
    end: { book: 43, chapter: 3, verse: 36 },
  },
  {
    id: "monthly-romans-1-8",
    title: "This month: Romans 1–8",
    type: "monthly",
    start: { book: 45, chapter: 1, verse: 1 },
    end: { book: 45, chapter: 8, verse: 39 },
  },
];

export function getChallengeById(id: string): GlobalChallenge | undefined {
  return GLOBAL_CHALLENGES.find((c) => c.id === id);
}

export function parseRangeParam(
  range: string
): { start: VersePosition; end: VersePosition } | null {
  const parts = range.split(",").map(Number);
  if (parts.length !== 6 || parts.some(isNaN)) return null;
  return {
    start: { book: parts[0], chapter: parts[1], verse: parts[2] },
    end: { book: parts[3], chapter: parts[4], verse: parts[5] },
  };
}

export function encodeRangeParam(start: VersePosition, end: VersePosition): string {
  return `${start.book},${start.chapter},${start.verse},${end.book},${end.chapter},${end.verse}`;
}

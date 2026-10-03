import AsyncStorage from "@react-native-async-storage/async-storage";
import { getVerseById } from "../database/queries";
import {
  buildChallengeItemFromVerses,
  type ChallengeItem,
} from "./challengeRanges";

const KEY = "speak-recent-practice-v1";
const MAX_ENTRIES = 25;

export type RecentPracticeRecord = {
  verseIds: string[];
  reference: string;
  lastPracticedAt: number;
};

function entryKey(verseIds: readonly string[]): string {
  return [...verseIds].sort().join("|");
}

async function readRecords(): Promise<RecentPracticeRecord[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is RecentPracticeRecord =>
        row != null &&
        typeof row === "object" &&
        Array.isArray((row as RecentPracticeRecord).verseIds) &&
        (row as RecentPracticeRecord).verseIds.every((id) => typeof id === "string") &&
        typeof (row as RecentPracticeRecord).reference === "string" &&
        typeof (row as RecentPracticeRecord).lastPracticedAt === "number"
    );
  } catch {
    return [];
  }
}

async function writeRecords(list: RecentPracticeRecord[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(list));
}

/** Bump a passage to the top of Recent (My Challenges), without adding to favorites. */
export async function touchRecentPracticeChallenge(
  verseIds: string[],
  reference: string
): Promise<void> {
  const ids = verseIds.filter(Boolean);
  if (ids.length === 0 || !reference.trim()) return;

  const list = await readRecords();
  const key = entryKey(ids);
  const next = list.filter((e) => entryKey(e.verseIds) !== key);
  next.unshift({
    verseIds: [...ids],
    reference: reference.trim(),
    lastPracticedAt: Date.now(),
  });
  await writeRecords(next.slice(0, MAX_ENTRIES));
}

export async function removeRecentPracticeChallenge(verseIds: string[]): Promise<void> {
  if (verseIds.length === 0) return;
  const key = entryKey(verseIds);
  const list = await readRecords();
  const next = list.filter((e) => entryKey(e.verseIds) !== key);
  if (next.length === list.length) return;
  await writeRecords(next);
}

export async function loadRecentPracticeChallengeItems(): Promise<ChallengeItem[]> {
  const records = await readRecords();
  const items: ChallengeItem[] = [];

  for (const rec of records) {
    const loaded = await Promise.all(rec.verseIds.map((id) => getVerseById(id)));
    const byId = new Map<string, NonNullable<(typeof loaded)[number]>>();
    for (const v of loaded) {
      if (v) byId.set(v.id, v);
    }
    const ordered = rec.verseIds.map((id) => byId.get(id)).filter(Boolean) as NonNullable<
      (typeof loaded)[number]
    >[];
    if (ordered.length === 0) continue;
    const item = buildChallengeItemFromVerses(ordered);
    if (item) items.push(item);
  }

  return items;
}

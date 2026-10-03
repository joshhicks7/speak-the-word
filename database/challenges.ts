import { defaultFavorites, type DefaultFavoriteRange } from "./defaultFavorites";
import { getDatabase, rowToGameVerse } from "./setup";
import { getVersesInRange, type VersePosition } from "./queries";
import type { GameVerse } from "../types/verse";
import {
  buildChallengeItemFromVerses,
  type ChallengeItem,
} from "../utils/challengeRanges";

export type ChallengeKind = "default" | "custom";

export type ChallengeBounds = {
  startBook: number;
  startChapter: number;
  startVerse: number;
  endBook: number;
  endChapter: number;
  endVerse: number;
};

export type ChallengeRow = ChallengeBounds & {
  id: string;
  reference: string;
  kind: ChallengeKind;
  bestEver: number | null;
  lastAttemptedAt: number | null;
  createdAt: number;
};

export type StoredChallenge = {
  challengeId: string;
  kind: ChallengeKind;
  bestEver: number | null;
  lastAttemptedAt: number | null;
  reference: string;
  item: ChallengeItem;
};

export function storedChallengeFromRow(row: ChallengeRow, verses: GameVerse[]): StoredChallenge | null {
  const item = buildChallengeItemFromVerses(verses);
  if (!item) return null;
  return {
    challengeId: row.id,
    kind: row.kind,
    bestEver: row.bestEver,
    lastAttemptedAt: row.lastAttemptedAt,
    reference: row.reference,
    item,
  };
}

function getUnixSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function makeChallengeId(): string {
  return `ch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeEnd(bounds: Omit<ChallengeBounds, "endBook" | "endChapter" | "endVerse"> & {
  endBook?: number;
  endChapter?: number;
  endVerse?: number;
}): ChallengeBounds {
  return {
    startBook: bounds.startBook,
    startChapter: bounds.startChapter,
    startVerse: bounds.startVerse,
    endBook: bounds.endBook ?? bounds.startBook,
    endChapter: bounds.endChapter ?? bounds.startChapter,
    endVerse: bounds.endVerse ?? bounds.startVerse,
  };
}

function boundsKey(b: ChallengeBounds): string {
  return [
    b.startBook,
    b.startChapter,
    b.startVerse,
    b.endBook,
    b.endChapter,
    b.endVerse,
  ].join(":");
}

function rowToChallenge(row: Record<string, unknown>): ChallengeRow {
  return {
    id: row.id as string,
    reference: row.reference as string,
    kind: row.kind as ChallengeKind,
    bestEver: row.best_ever != null ? (row.best_ever as number) : null,
    lastAttemptedAt: row.last_attempted_at != null ? (row.last_attempted_at as number) : null,
    createdAt: row.created_at as number,
    startBook: row.start_book as number,
    startChapter: row.start_chapter as number,
    startVerse: row.start_verse as number,
    endBook: row.end_book as number,
    endChapter: row.end_chapter as number,
    endVerse: row.end_verse as number,
  };
}

export function formatChallengeReference(
  start: VersePosition & { book_name?: string },
  end: VersePosition & { book_name?: string },
  startLabel: string,
  endLabel?: string
): string {
  const samePoint =
    start.book === end.book && start.chapter === end.chapter && start.verse === end.verse;
  if (samePoint) return startLabel;
  if (start.book === end.book && start.chapter === end.chapter) {
    const head = startLabel.split(":")[0];
    return `${head}:${start.verse}-${end.verse}`;
  }
  if (endLabel) return `${startLabel}-${endLabel.replace(/^[^ ]+\s/, "")}`;
  return `${startLabel}-${end.chapter}:${end.verse}`;
}

async function referenceForBounds(b: ChallengeBounds): Promise<string> {
  const db = await getDatabase();
  const startRow = await db.getFirstAsync(
    "SELECT * FROM verses WHERE book = ? AND chapter = ? AND verse = ?",
    [b.startBook, b.startChapter, b.startVerse]
  );
  const endRow = await db.getFirstAsync(
    "SELECT * FROM verses WHERE book = ? AND chapter = ? AND verse = ?",
    [b.endBook, b.endChapter, b.endVerse]
  );
  const startV = startRow ? rowToGameVerse(startRow as Record<string, unknown>) : null;
  const endV = endRow ? rowToGameVerse(endRow as Record<string, unknown>) : null;
  if (!startV || !endV) return `${b.startBook}:${b.startChapter}:${b.startVerse}`;
  return formatChallengeReference(startV, endV, startV.reference, endV.reference);
}

export async function ensureChallengesSchema(): Promise<void> {
  const db = await getDatabase();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS challenges (
      id TEXT PRIMARY KEY,
      reference TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'custom',
      best_ever INTEGER,
      last_attempted_at INTEGER,
      created_at INTEGER NOT NULL,
      start_book INTEGER NOT NULL,
      start_chapter INTEGER NOT NULL,
      start_verse INTEGER NOT NULL,
      end_book INTEGER NOT NULL,
      end_chapter INTEGER NOT NULL,
      end_verse INTEGER NOT NULL,
      UNIQUE(start_book, start_chapter, start_verse, end_book, end_chapter, end_verse)
    );
    CREATE INDEX IF NOT EXISTS idx_challenges_last_attempt ON challenges(last_attempted_at DESC);
    CREATE INDEX IF NOT EXISTS idx_challenges_kind ON challenges(kind);
  `);
}

async function resolveDefaultRangeBounds(range: DefaultFavoriteRange): Promise<ChallengeBounds | null> {
  const startV = await getVerseByBookChapterVerseFromName(
    range.start.book_name,
    range.start.chapter,
    range.start.verse
  );
  if (!startV) return null;
  const endV = await getVerseByBookChapterVerseFromName(
    range.end.book_name,
    range.end.chapter,
    range.end.verse
  );
  if (!endV) return null;
  return normalizeEnd({
    startBook: startV.book,
    startChapter: startV.chapter,
    startVerse: startV.verse,
    endBook: endV.book,
    endChapter: endV.chapter,
    endVerse: endV.verse,
  });
}

async function getVerseByBookChapterVerseFromName(
  bookName: string,
  chapter: number,
  verse: number
): Promise<GameVerse | null> {
  const db = await getDatabase();
  const normalized = bookName === "Psalm" ? "Psalm" : bookName;
  const result = await db.getFirstAsync(
    "SELECT * FROM verses WHERE book_name = ? AND chapter = ? AND verse = ?",
    [normalized, chapter, verse]
  );
  if (!result && bookName === "Psalm") {
    const psalms = await db.getFirstAsync(
      "SELECT * FROM verses WHERE book_name = ? AND chapter = ? AND verse = ?",
      ["Psalms", chapter, verse]
    );
    return psalms ? rowToGameVerse(psalms as Record<string, unknown>) : null;
  }
  return result ? rowToGameVerse(result as Record<string, unknown>) : null;
}

export async function seedDefaultChallengesIfEmpty(): Promise<void> {
  const db = await getDatabase();
  const count = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) as count FROM challenges");
  if ((count?.count ?? 0) > 0) return;

  const now = getUnixSeconds();
  for (const range of defaultFavorites) {
    const bounds = await resolveDefaultRangeBounds(range);
    if (!bounds) continue;
    const reference = await referenceForBounds(bounds);
    await db.runAsync(
      `INSERT OR IGNORE INTO challenges (
        id, reference, kind, best_ever, last_attempted_at, created_at,
        start_book, start_chapter, start_verse, end_book, end_chapter, end_verse
      ) VALUES (?, ?, 'default', NULL, NULL, ?, ?, ?, ?, ?, ?, ?)`,
      [
        makeChallengeId(),
        reference,
        now,
        bounds.startBook,
        bounds.startChapter,
        bounds.startVerse,
        bounds.endBook,
        bounds.endChapter,
        bounds.endVerse,
      ]
    );
  }
}

export async function getChallengeById(id: string): Promise<ChallengeRow | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync("SELECT * FROM challenges WHERE id = ?", [id]);
  return row ? rowToChallenge(row as Record<string, unknown>) : null;
}

export async function findChallengeByBounds(bounds: ChallengeBounds): Promise<ChallengeRow | null> {
  const b = normalizeEnd(bounds);
  const db = await getDatabase();
  const row = await db.getFirstAsync(
    `SELECT * FROM challenges WHERE start_book = ? AND start_chapter = ? AND start_verse = ?
     AND end_book = ? AND end_chapter = ? AND end_verse = ?`,
    [b.startBook, b.startChapter, b.startVerse, b.endBook, b.endChapter, b.endVerse]
  );
  return row ? rowToChallenge(row as Record<string, unknown>) : null;
}

export async function upsertChallengeForBounds(
  bounds: ChallengeBounds,
  options?: { kind?: ChallengeKind }
): Promise<ChallengeRow> {
  const b = normalizeEnd(bounds);
  const existing = await findChallengeByBounds(b);
  if (existing) return existing;

  const db = await getDatabase();
  const id = makeChallengeId();
  const reference = await referenceForBounds(b);
  const now = getUnixSeconds();
  await db.runAsync(
    `INSERT INTO challenges (
      id, reference, kind, best_ever, last_attempted_at, created_at,
      start_book, start_chapter, start_verse, end_book, end_chapter, end_verse
    ) VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      reference,
      options?.kind ?? "custom",
      now,
      b.startBook,
      b.startChapter,
      b.startVerse,
      b.endBook,
      b.endChapter,
      b.endVerse,
    ]
  );
  return (await getChallengeById(id))!;
}

export async function upsertChallengeFromVerses(verses: GameVerse[]): Promise<ChallengeRow | null> {
  if (verses.length === 0) return null;
  const first = verses[0]!;
  const last = verses[verses.length - 1]!;
  return upsertChallengeForBounds({
    startBook: first.book,
    startChapter: first.chapter,
    startVerse: first.verse,
    endBook: last.book,
    endChapter: last.chapter,
    endVerse: last.verse,
  });
}

export async function loadVersesForChallenge(challenge: ChallengeRow): Promise<GameVerse[]> {
  return getVersesInRange(
    {
      book: challenge.startBook,
      chapter: challenge.startChapter,
      verse: challenge.startVerse,
    },
    {
      book: challenge.endBook,
      chapter: challenge.endChapter,
      verse: challenge.endVerse,
    }
  );
}

export type ChallengeListOptions = {
  /** When true, only custom + anything with a last attempt (hides untouched defaults). */
  hideUntouchedDefaults?: boolean;
};

export async function loadStoredChallenges(options?: ChallengeListOptions): Promise<StoredChallenge[]> {
  const rows = await listChallenges(options);
  const out: StoredChallenge[] = [];
  for (const row of rows) {
    const verses = await loadVersesForChallenge(row);
    const stored = storedChallengeFromRow(row, verses);
    if (stored) out.push(stored);
  }
  return out;
}

export async function listChallenges(options?: ChallengeListOptions): Promise<ChallengeRow[]> {
  const db = await getDatabase();
  let sql = "SELECT * FROM challenges";
  if (options?.hideUntouchedDefaults) {
    sql += " WHERE kind = 'custom' OR last_attempted_at IS NOT NULL";
  }
  sql += " ORDER BY (last_attempted_at IS NULL), last_attempted_at DESC, created_at DESC";
  const rows = await db.getAllAsync(sql);
  return rows.map((r) => rowToChallenge(r as Record<string, unknown>));
}

export async function saveChallengeAsCustom(bounds: ChallengeBounds): Promise<ChallengeRow> {
  const row = await upsertChallengeForBounds(bounds);
  await setChallengeKind(row.id, "custom");
  return (await getChallengeById(row.id))!;
}

export async function setChallengeKind(id: string, kind: ChallengeKind): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE challenges SET kind = ? WHERE id = ?", [kind, id]);
}

export async function deleteChallenge(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM challenges WHERE id = ?", [id]);
}

export async function recordChallengeAttempt(
  id: string,
  scorePercent: number
): Promise<ChallengeRow | null> {
  const db = await getDatabase();
  const now = getUnixSeconds();
  const row = await getChallengeById(id);
  if (!row) return null;
  const best = row.bestEver == null ? scorePercent : Math.max(row.bestEver, scorePercent);
  await db.runAsync(
    "UPDATE challenges SET best_ever = ?, last_attempted_at = ? WHERE id = ?",
    [best, now, id]
  );
  return getChallengeById(id);
}

export function isChallengeCompleted(row: Pick<ChallengeRow, "bestEver">): boolean {
  return row.bestEver === 100;
}

export function isStoredChallengeSaved(stored: StoredChallenge): boolean {
  return stored.kind === "custom";
}

export async function getNextChallengeAfter(currentId: string): Promise<ChallengeRow | null> {
  const list = await listChallenges();
  const idx = list.findIndex((c) => c.id === currentId);
  if (idx === -1 || idx >= list.length - 1) return null;
  return list[idx + 1] ?? null;
}

export function boundsFromChallengeRow(row: ChallengeRow): ChallengeBounds {
  return {
    startBook: row.startBook,
    startChapter: row.startChapter,
    startVerse: row.startVerse,
    endBook: row.endBook,
    endChapter: row.endChapter,
    endVerse: row.endVerse,
  };
}

export { boundsKey };

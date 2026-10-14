import { defaultFavorites, type DefaultFavoriteRange } from "./defaultFavorites";
import { getDatabase, rowToGameVerse, runExclusiveDb } from "./setup";
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

async function referenceForBoundsOnDb(
  db: Awaited<ReturnType<typeof getDatabase>>,
  b: ChallengeBounds
): Promise<string> {
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

async function referenceForBounds(b: ChallengeBounds): Promise<string> {
  const db = await getDatabase();
  return referenceForBoundsOnDb(db, b);
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

/** Match list row when voice span is contained in stored bounds (e.g. same Psalms 23 passage). */
export async function findChallengeContainingVerses(verses: GameVerse[]): Promise<ChallengeRow | null> {
  if (verses.length === 0) return null;
  const first = verses[0]!;
  const last = verses[verses.length - 1]!;
  const exact = await findChallengeByBounds({
    startBook: first.book,
    startChapter: first.chapter,
    startVerse: first.verse,
    endBook: last.book,
    endChapter: last.chapter,
    endVerse: last.verse,
  });
  if (exact) return exact;

  // One verse requested — do not attach a larger saved passage (e.g. Gen 1:1 vs Gen 1:1–31).
  if (verses.length === 1) return null;

  const db = await getDatabase();
  const row = await db.getFirstAsync(
    `SELECT * FROM challenges
     WHERE start_book = ? AND end_book = ?
       AND start_chapter <= ? AND end_chapter >= ?
       AND (start_chapter < ? OR start_verse <= ?)
       AND (end_chapter > ? OR end_verse >= ?)
     ORDER BY (end_verse - start_verse) DESC, created_at DESC
     LIMIT 1`,
    [
      first.book,
      last.book,
      first.chapter,
      last.chapter,
      first.chapter,
      first.verse,
      last.chapter,
      last.verse,
    ]
  );
  return row ? rowToChallenge(row as Record<string, unknown>) : null;
}

function isSqliteLockedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.toLowerCase().includes("database is locked");
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function upsertChallengeForBoundsOnce(
  bounds: ChallengeBounds,
  options?: { kind?: ChallengeKind; reference?: string }
): Promise<ChallengeRow> {
  const b = normalizeEnd(bounds);
  return runExclusiveDb(async (db) => {
    const boundsSql = `SELECT * FROM challenges WHERE start_book = ? AND start_chapter = ? AND start_verse = ?
       AND end_book = ? AND end_chapter = ? AND end_verse = ?`;
    const boundsArgs = [
      b.startBook,
      b.startChapter,
      b.startVerse,
      b.endBook,
      b.endChapter,
      b.endVerse,
    ];

    const existingRow = await db.getFirstAsync(boundsSql, boundsArgs);
    if (existingRow) {
      return rowToChallenge(existingRow as Record<string, unknown>);
    }

    const id = makeChallengeId();
    const reference = options?.reference ?? (await referenceForBoundsOnDb(db, b));
    const now = getUnixSeconds();
    try {
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
    } catch (insertErr) {
      const raced = await db.getFirstAsync(boundsSql, boundsArgs);
      if (raced) return rowToChallenge(raced as Record<string, unknown>);
      throw insertErr;
    }

    const row = await db.getFirstAsync("SELECT * FROM challenges WHERE id = ?", [id]);
    return rowToChallenge(row as Record<string, unknown>);
  }, "upsertChallengeForBounds");
}

export async function upsertChallengeForBounds(
  bounds: ChallengeBounds,
  options?: { kind?: ChallengeKind; /** Skip extra verse lookups when caller already has labels (voice practice). */ reference?: string }
): Promise<ChallengeRow> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await upsertChallengeForBoundsOnce(bounds, options);
    } catch (err) {
      lastErr = err;
      if (!isSqliteLockedError(err) || attempt === 3) throw err;
      await sleep(40 * (attempt + 1));
    }
  }
  throw lastErr;
}

export async function upsertChallengeFromVerses(verses: GameVerse[]): Promise<ChallengeRow | null> {
  if (verses.length === 0) return null;
  const first = verses[0]!;
  const last = verses[verses.length - 1]!;
  const reference = formatChallengeReference(first, last, first.reference, last.reference);
  return upsertChallengeForBounds(
    {
      startBook: first.book,
      startChapter: first.chapter,
      startVerse: first.verse,
      endBook: last.book,
      endChapter: last.chapter,
      endVerse: last.verse,
    },
    { reference }
  );
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
  /** When false, include challenges that were never practiced (default: practiced only). */
  practicedOnly?: boolean;
  /** When true, only custom + anything with a last attempt (only if practicedOnly is false). */
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

const CHALLENGE_NAVIGATION_ORDER =
  "start_book, start_chapter, start_verse, end_book, end_chapter, end_verse, created_at ASC, id ASC";

export async function listChallenges(options?: ChallengeListOptions): Promise<ChallengeRow[]> {
  const db = await getDatabase();
  const practicedOnly = options?.practicedOnly !== false;
  let sql = "SELECT * FROM challenges";
  if (practicedOnly) {
    sql += " WHERE last_attempted_at IS NOT NULL";
  } else if (options?.hideUntouchedDefaults) {
    sql += " WHERE kind = 'custom' OR last_attempted_at IS NOT NULL";
  }
  sql += " ORDER BY (last_attempted_at IS NULL), last_attempted_at DESC, created_at DESC";
  const rows = await db.getAllAsync(sql);
  return rows.map((r) => rowToChallenge(r as Record<string, unknown>));
}

/** Stable order for “next challenge” — must not depend on last_attempted_at (that reorder causes ping-pong). */
export async function listChallengesForNavigation(): Promise<ChallengeRow[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync(`SELECT * FROM challenges ORDER BY ${CHALLENGE_NAVIGATION_ORDER}`);
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
  return runExclusiveDb(async (db) => {
    const now = getUnixSeconds();
    const existing = await db.getFirstAsync("SELECT * FROM challenges WHERE id = ?", [id]);
    if (!existing) return null;
    const row = rowToChallenge(existing as Record<string, unknown>);
    const best = row.bestEver == null ? scorePercent : Math.max(row.bestEver, scorePercent);
    await db.runAsync(
      "UPDATE challenges SET best_ever = ?, last_attempted_at = ? WHERE id = ?",
      [best, now, id]
    );
    return { ...row, bestEver: best, lastAttemptedAt: now };
  }, "recordChallengeAttempt");
}

export function isChallengeCompleted(row: Pick<ChallengeRow, "bestEver">): boolean {
  return row.bestEver === 100;
}

export function isStoredChallengeSaved(stored: StoredChallenge): boolean {
  return stored.lastAttemptedAt != null;
}

export function isChallengeInMyList(row: Pick<ChallengeRow, "lastAttemptedAt">): boolean {
  return row.lastAttemptedAt != null;
}

/**
 * Next incomplete challenge (bestEver !== 100) in navigation order after `anchorChallengeId`,
 * wrapping to the start of the list. Hub voice omits anchor and uses the most recently attempted.
 */
export async function getNextIncompleteChallenge(
  anchorChallengeId?: string | null
): Promise<ChallengeRow | null> {
  return runExclusiveDb(async (db) => {
    const navRows = await db.getAllAsync(
      `SELECT * FROM challenges WHERE last_attempted_at IS NOT NULL ORDER BY ${CHALLENGE_NAVIGATION_ORDER}`
    );
    const list = navRows.map((r) => rowToChallenge(r as Record<string, unknown>));
    if (list.length === 0) return null;

    const incomplete = list.filter((c) => !isChallengeCompleted(c));
    if (incomplete.length === 0) return null;
    if (incomplete.length === 1) return incomplete[0]!;

    let anchorId = anchorChallengeId ?? null;
    if (anchorId == null) {
      const recent = await db.getFirstAsync<{ id: string }>(
        "SELECT id FROM challenges WHERE last_attempted_at IS NOT NULL ORDER BY last_attempted_at DESC LIMIT 1"
      );
      anchorId = recent?.id ?? null;
    }

    if (anchorId == null) return incomplete[0] ?? null;

    const anchorIdx = list.findIndex((c) => c.id === anchorId);
    if (anchorIdx === -1) return incomplete[0] ?? null;

    for (let i = anchorIdx + 1; i < list.length; i++) {
      const c = list[i]!;
      if (!isChallengeCompleted(c)) return c;
    }
    for (let i = 0; i < anchorIdx; i++) {
      const c = list[i]!;
      if (!isChallengeCompleted(c)) return c;
    }
    return null;
  }, "getNextIncompleteChallenge");
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

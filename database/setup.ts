import * as SQLite from "expo-sqlite";
import { GameVerse } from "../types/verse";
import { isDefaultFavorite } from "./defaultFavorites";

type BibleVerse = {
  book_name: string;
  book: number;
  chapter: number;
  verse: number;
  text: string;
};

let database: SQLite.SQLiteDatabase | null = null;

async function openSeededDatabase(): Promise<SQLite.SQLiteDatabase> {
  try {
    await SQLite.importDatabaseFromAssetAsync("bible.db", {
      assetId: require("./bible-seed.db") as number,
    });
  } catch {
    // Asset missing, web, or copy unsupported — JSON populate is the fallback.
  }
  return SQLite.openDatabaseAsync("bible.db");
}

export const getDatabase = async (): Promise<SQLite.SQLiteDatabase> => {
  if (!database) {
    database = await openSeededDatabase();
  }
  return database;
};

export const setupDatabase = async (): Promise<SQLite.SQLiteDatabase> => {
  const db = await getDatabase();
  await createTables(db);
  await ensureVerseProgressColumns(db);
  const count = await getVerseCount(db);
  if (count === 0) {
    await populateVerses(db);
  }
  await createIndexes(db);
  return db;
};

const createTables = async (db: SQLite.SQLiteDatabase): Promise<void> => {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS verses (
      id TEXT PRIMARY KEY,
      book_name TEXT NOT NULL,
      book INTEGER NOT NULL,
      chapter INTEGER NOT NULL,
      verse INTEGER NOT NULL,
      text TEXT NOT NULL,
      is_favorite INTEGER DEFAULT 0,
      completion_time INTEGER DEFAULT NULL,
      completed_at INTEGER DEFAULT NULL,
      completion_duration_seconds INTEGER DEFAULT NULL,
      completion_score INTEGER DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS user_actions (
      id TEXT PRIMARY KEY,
      action_type TEXT NOT NULL,
      verse_id TEXT,
      score_percent INTEGER,
      created_at INTEGER NOT NULL,
      metadata TEXT
    )
  `);
};

const ensureVerseProgressColumns = async (db: SQLite.SQLiteDatabase): Promise<void> => {
  try {
    const info = await db.getAllAsync<{ name: string }>("PRAGMA table_info(verses)");
    const columnNames = new Set(info.map((c) => c.name));
    if (!columnNames.has("completion_score")) {
      await db.execAsync("ALTER TABLE verses ADD COLUMN completion_score INTEGER DEFAULT NULL");
    }
    if (!columnNames.has("completed_at")) {
      await db.execAsync("ALTER TABLE verses ADD COLUMN completed_at INTEGER DEFAULT NULL");
    }
    if (!columnNames.has("completion_duration_seconds")) {
      await db.execAsync("ALTER TABLE verses ADD COLUMN completion_duration_seconds INTEGER DEFAULT NULL");
    }
    await db.execAsync(`
      UPDATE verses
      SET
        completed_at = COALESCE(completed_at, CAST(strftime('%s', 'now') AS INTEGER)),
        completion_duration_seconds = COALESCE(completion_duration_seconds, completion_time)
      WHERE completion_time IS NOT NULL
    `);
  } catch {
    // columns may already exist or table empty
  }
};

const createIndexes = async (db: SQLite.SQLiteDatabase): Promise<void> => {
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_book_chapter_verse ON verses(book, chapter, verse);
    CREATE INDEX IF NOT EXISTS idx_favorites ON verses(is_favorite);
    CREATE INDEX IF NOT EXISTS idx_completed_at ON verses(completed_at);
    CREATE INDEX IF NOT EXISTS idx_user_actions_type_created ON user_actions(action_type, created_at);
    CREATE INDEX IF NOT EXISTS idx_user_actions_verse ON user_actions(verse_id);
  `);
};

const getVerseCount = async (db: SQLite.SQLiteDatabase): Promise<number> => {
  const result = await db.getAllAsync<{ count: number }>("SELECT COUNT(*) as count FROM verses");
  return result[0]?.count ?? 0;
};

function loadBibleVerses(): BibleVerse[] {
  try {
    const bibleData = require("./ASV.json") as { verses: BibleVerse[] };
    return bibleData.verses ?? [];
  } catch {
    return [];
  }
}

const ROWS_PER_INSERT = 50;

const populateVerses = async (db: SQLite.SQLiteDatabase): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 50));
  const verses = loadBibleVerses();
  if (verses.length === 0) return;

  const rows: (string | number)[][] = [];
  for (const verse of verses) {
    if (verse.text.toLowerCase() === "(ommitted)" || verse.text.length < 1) continue;
    rows.push([
      `${verse.book_name.toLowerCase()}-${verse.chapter}-${verse.verse}`,
      verse.book_name,
      verse.book,
      verse.chapter,
      verse.verse,
      verse.text,
      isDefaultFavorite(verse.book_name, verse.chapter, verse.verse) ? 1 : 0,
    ]);
  }

  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = OFF;
    PRAGMA temp_store = MEMORY;
  `);

  try {
    await db.withTransactionAsync(async () => {
      for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) {
        const batch = rows.slice(i, i + ROWS_PER_INSERT);
        const placeholders = batch.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(",");
        await db.runAsync(
          `INSERT OR IGNORE INTO verses (id, book_name, book, chapter, verse, text, is_favorite) VALUES ${placeholders}`,
          batch.flat()
        );
      }
    });
  } finally {
    await db.execAsync("PRAGMA synchronous = NORMAL;");
  }
};

export const rowToGameVerse = (row: Record<string, unknown>): GameVerse => ({
  id: row.id as string,
  reference: `${row.book_name} ${row.chapter}:${row.verse}`,
  text: row.text as string,
  isCompleted: Boolean(row.completed_at ?? row.completion_time),
  isFavorite: Boolean(row.is_favorite),
  book: row.book as number,
  verse: row.verse as number,
  chapter: row.chapter as number,
  completedAt: (row.completed_at as number) ?? null,
  completionDurationSeconds: (row.completion_duration_seconds as number) ?? (row.completion_time as number) ?? null,
  completionScore: (row.completion_score as number) ?? null,
});

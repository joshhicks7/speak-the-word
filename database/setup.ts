import * as SQLite from "expo-sqlite";
import { GameVerse } from "../types/verse";
import { isDefaultFavorite } from "./defaultFavorites";

// Use full ASV from bible-memory (copy ASV.json into this folder) or fallback
let bibleData: { verses: Array<{ book_name: string; book: number; chapter: number; verse: number; text: string }> };
try {
  bibleData = require("./ASV.json");
} catch {
  bibleData = { verses: [] };
}

let database: SQLite.SQLiteDatabase | null = null;

export const getDatabase = async (): Promise<SQLite.SQLiteDatabase> => {
  if (!database) {
    database = await SQLite.openDatabaseAsync("bible.db");
  }
  return database;
};

export const setupDatabase = async (): Promise<SQLite.SQLiteDatabase> => {
  const db = await getDatabase();
  await createTables(db);
  await createIndexes(db);
  const count = await getVerseCount(db);
  if (count === 0 && bibleData.verses.length > 0) {
    await populateVerses(db);
  }
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
  await ensureVerseProgressColumns(db);
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
  await db.execAsync("CREATE INDEX IF NOT EXISTS idx_verse_id ON verses(id)");
  await db.execAsync("CREATE INDEX IF NOT EXISTS idx_book_chapter_verse ON verses(book, chapter, verse)");
  await db.execAsync("CREATE INDEX IF NOT EXISTS idx_favorites ON verses(is_favorite)");
  await db.execAsync("CREATE INDEX IF NOT EXISTS idx_completed_at ON verses(completed_at)");
  await db.execAsync("CREATE INDEX IF NOT EXISTS idx_text ON verses(text)");
  await db.execAsync("CREATE INDEX IF NOT EXISTS idx_user_actions_type_created ON user_actions(action_type, created_at)");
  await db.execAsync("CREATE INDEX IF NOT EXISTS idx_user_actions_verse ON user_actions(verse_id)");
};

const getVerseCount = async (db: SQLite.SQLiteDatabase): Promise<number> => {
  const result = await db.getAllAsync<{ count: number }>("SELECT COUNT(*) as count FROM verses");
  return result[0]?.count ?? 0;
};

const populateVerses = async (db: SQLite.SQLiteDatabase): Promise<void> => {
  const batchSize = 1000;
  const totalVerses = bibleData.verses.length;
  for (let i = 0; i < totalVerses; i += batchSize) {
    const batch = bibleData.verses.slice(i, i + batchSize);
    await db.withTransactionAsync(async () => {
      for (const verse of batch) {
        if (verse.text.toLowerCase() === "(ommitted)" || verse.text.length < 1) continue;
        const verseId = `${verse.book_name.toLowerCase()}-${verse.chapter}-${verse.verse}`;
        const favorite = isDefaultFavorite(verse.book_name, verse.chapter, verse.verse);
        await db.runAsync(
          `INSERT OR IGNORE INTO verses (id, book_name, book, chapter, verse, text, is_favorite) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [verseId, verse.book_name, verse.book, verse.chapter, verse.verse, verse.text, favorite ? 1 : 0]
        );
      }
    });
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

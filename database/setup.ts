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
      completion_score INTEGER DEFAULT NULL
    )
  `);
  await ensureCompletionScoreColumn(db);
};

const ensureCompletionScoreColumn = async (db: SQLite.SQLiteDatabase): Promise<void> => {
  try {
    const info = await db.getAllAsync<{ name: string }>("PRAGMA table_info(verses)");
    if (info.some((c) => c.name === "completion_score")) return;
    await db.execAsync("ALTER TABLE verses ADD COLUMN completion_score INTEGER DEFAULT NULL");
  } catch {
    // column may already exist or table empty
  }
};

const createIndexes = async (db: SQLite.SQLiteDatabase): Promise<void> => {
  await db.execAsync("CREATE INDEX IF NOT EXISTS idx_verse_id ON verses(id)");
  await db.execAsync("CREATE INDEX IF NOT EXISTS idx_book_chapter_verse ON verses(book, chapter, verse)");
  await db.execAsync("CREATE INDEX IF NOT EXISTS idx_favorites ON verses(is_favorite)");
  await db.execAsync("CREATE INDEX IF NOT EXISTS idx_completion_time ON verses(completion_time)");
  await db.execAsync("CREATE INDEX IF NOT EXISTS idx_text ON verses(text)");
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
          `INSERT OR IGNORE INTO verses (id, book_name, book, chapter, verse, text, is_favorite, completion_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [verseId, verse.book_name, verse.book, verse.chapter, verse.verse, verse.text, favorite ? 1 : 0, null]
        );
      }
    });
  }
};

export const rowToGameVerse = (row: Record<string, unknown>): GameVerse => ({
  id: row.id as string,
  reference: `${row.book_name} ${row.chapter}:${row.verse}`,
  text: row.text as string,
  isCompleted: Boolean(row.completion_time),
  isFavorite: Boolean(row.is_favorite),
  book: row.book as number,
  verse: row.verse as number,
  chapter: row.chapter as number,
  completionTime: (row.completion_time as number) ?? null,
  completionScore: (row.completion_score as number) ?? null,
});

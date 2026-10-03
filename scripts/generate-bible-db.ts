import fs from "fs";
import path from "path";
import initSqlJs from "sql.js";
import { isPracticeEligible } from "../database/verseEligibility";

type BibleVerse = {
  book_name: string;
  book: number;
  chapter: number;
  verse: number;
  text: string;
};

async function main(): Promise<void> {
  const root = path.resolve(__dirname, "..");
  const asvPath = path.join(root, "database", "ASV.json");
  const outPath = path.join(root, "database", "bible-seed.db");
  const wasmPath = path.join(root, "node_modules", "sql.js", "dist", "sql-wasm.wasm");

  const bibleData = JSON.parse(fs.readFileSync(asvPath, "utf8")) as { verses: BibleVerse[] };
  const verses = bibleData.verses ?? [];

  const SQL = await initSqlJs({
    wasmBinary: fs.readFileSync(wasmPath),
  });
  const db = new SQL.Database();

  db.run(`
    CREATE TABLE verses (
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
      completion_score INTEGER DEFAULT NULL,
      is_practice_eligible INTEGER DEFAULT 1
    );
    CREATE TABLE user_actions (
      id TEXT PRIMARY KEY,
      action_type TEXT NOT NULL,
      verse_id TEXT,
      score_percent INTEGER,
      created_at INTEGER NOT NULL,
      metadata TEXT
    );
  `);

  db.run("BEGIN");
  const insert = db.prepare(
    `INSERT OR IGNORE INTO verses (id, book_name, book, chapter, verse, text, is_favorite, is_practice_eligible) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  let count = 0;
  for (const verse of verses) {
    if (verse.text.toLowerCase() === "(ommitted)" || verse.text.length < 1) continue;
    insert.run([
      `${verse.book_name.toLowerCase()}-${verse.chapter}-${verse.verse}`,
      verse.book_name,
      verse.book,
      verse.chapter,
      verse.verse,
      verse.text,
      0,
      isPracticeEligible(verse) ? 1 : 0,
    ]);
    insert.reset();
    count += 1;
  }
  insert.free();
  db.run("COMMIT");

  db.run(`
    CREATE INDEX idx_book_chapter_verse ON verses(book, chapter, verse);
    CREATE INDEX idx_favorites ON verses(is_favorite);
    CREATE INDEX idx_completed_at ON verses(completed_at);
    CREATE INDEX idx_practice_eligible ON verses(is_practice_eligible);
    CREATE INDEX idx_user_actions_type_created ON user_actions(action_type, created_at);
    CREATE INDEX idx_user_actions_verse ON user_actions(verse_id);
    VACUUM;
  `);

  const data = db.export();
  fs.writeFileSync(outPath, Buffer.from(data));
  db.close();
  console.log(`Wrote ${count} verses to ${outPath} (${(data.length / 1024 / 1024).toFixed(2)} MB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

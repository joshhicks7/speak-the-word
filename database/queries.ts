import { GameVerse } from "../types/verse";
import { getDatabase, rowToGameVerse } from "./setup";

export const getVerseById = async (id: string): Promise<GameVerse | null> => {
  const db = await getDatabase();
  const result = await db.getFirstAsync("SELECT * FROM verses WHERE id = ?", [id]);
  return result ? rowToGameVerse(result as Record<string, unknown>) : null;
};

export const getSortedVerses = async (): Promise<GameVerse[]> => {
  const db = await getDatabase();
  const result = await db.getAllAsync(
    "SELECT * FROM verses ORDER BY length(text), book, chapter, verse"
  );
  return result.map((r) => rowToGameVerse(r as Record<string, unknown>));
};

export const getFavoriteVerses = async (): Promise<GameVerse[]> => {
  const db = await getDatabase();
  const result = await db.getAllAsync(
    "SELECT * FROM verses WHERE is_favorite = 1 ORDER BY book, chapter, verse"
  );
  return result.map((r) => rowToGameVerse(r as Record<string, unknown>));
};

export const getNextUncompletedVerse = async (): Promise<GameVerse | null> => {
  const db = await getDatabase();
  const result = await db.getFirstAsync(
    "SELECT * FROM verses WHERE completion_time IS NULL ORDER BY length(text), book, chapter, verse LIMIT 1"
  );
  return result ? rowToGameVerse(result as Record<string, unknown>) : null;
};

export const getUncompletedVersesOrdered = async (limit: number = 50): Promise<GameVerse[]> => {
  const db = await getDatabase();
  const result = await db.getAllAsync(
    "SELECT * FROM verses WHERE completion_time IS NULL ORDER BY length(text), book, chapter, verse LIMIT ?",
    [limit]
  );
  return result.map((r) => rowToGameVerse(r as Record<string, unknown>));
};

export const getCompletedVersesOrdered = async (limit: number = 100): Promise<GameVerse[]> => {
  const db = await getDatabase();
  const result = await db.getAllAsync(
    "SELECT * FROM verses WHERE completion_time IS NOT NULL ORDER BY length(text), book, chapter, verse LIMIT ?",
    [limit]
  );
  return result.map((r) => rowToGameVerse(r as Record<string, unknown>));
};

export const markVerseCompleted = async (
  id: string,
  completionTime: number,
  scorePercent: number
): Promise<void> => {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE verses SET completion_time = ?, completion_score = ? WHERE id = ?",
    [completionTime, scorePercent, id]
  );
};

/** Store the percentage from a challenge attempt (e.g. failed run) so we can show "Last: 65%" */
export const updateVerseScore = async (id: string, scorePercent: number): Promise<void> => {
  const db = await getDatabase();
  await db.runAsync("UPDATE verses SET completion_score = ? WHERE id = ?", [scorePercent, id]);
};

export const getCompletionStats = async (): Promise<{
  total: number;
  completed: number;
}> => {
  const db = await getDatabase();
  const result = await db.getFirstAsync<{ total: number; completed: number }>(
    "SELECT COUNT(*) as total, SUM(CASE WHEN completion_time IS NOT NULL THEN 1 ELSE 0 END) as completed FROM verses"
  );
  return { total: result?.total ?? 0, completed: result?.completed ?? 0 };
};

export const getLearningStats = async (): Promise<{
  totalVerses: number;
  completed: number;
  percent: number;
  mostLearnedBook: string | null;
  perfectCount: number;
}> => {
  const db = await getDatabase();
  const [countResult, mostBookResult, perfectResult] = await Promise.all([
    db.getFirstAsync<{ total: number; completed: number }>(
      "SELECT COUNT(*) as total, SUM(CASE WHEN completion_time IS NOT NULL THEN 1 ELSE 0 END) as completed FROM verses"
    ),
    db.getFirstAsync<{ book_name: string }>(
      "SELECT book_name FROM verses WHERE completion_time IS NOT NULL GROUP BY book ORDER BY COUNT(*) DESC LIMIT 1"
    ),
    db.getFirstAsync<{ perfect: number }>(
      "SELECT COUNT(*) as perfect FROM verses WHERE completion_time IS NOT NULL AND completion_score = 100"
    ),
  ]);
  const total = countResult?.total ?? 0;
  const completed = countResult?.completed ?? 0;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return {
    totalVerses: total,
    completed,
    percent,
    mostLearnedBook: mostBookResult?.book_name ?? null,
    perfectCount: perfectResult?.perfect ?? 0,
  };
};

/** Get distinct completion dates (local YYYY-MM-DD) from completion_time timestamps. */
export const getCompletionDates = async (): Promise<string[]> => {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ completion_time: number }>(
    "SELECT DISTINCT completion_time FROM verses WHERE completion_time IS NOT NULL"
  );
  const dates = new Set<string>();
  for (const row of rows) {
    const d = new Date(row.completion_time * 1000);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    dates.add(`${yyyy}-${mm}-${dd}`);
  }
  return Array.from(dates).sort();
};

/** Current streak = consecutive days with a completion ending today (or yesterday if today none). Longest = max consecutive days. */
export const getStreakStats = async (): Promise<{ currentStreak: number; longestStreak: number }> => {
  const dates = await getCompletionDates();
  if (dates.length === 0) return { currentStreak: 0, longestStreak: 0 };

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const dateSet = new Set(dates);

  let currentStreak = 0;
  const checkDate = new Date(today);
  for (let i = 0; i < 365; i++) {
    const s = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, "0")}-${String(checkDate.getDate()).padStart(2, "0")}`;
    if (dateSet.has(s)) {
      currentStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      if (i === 0) {
        checkDate.setDate(checkDate.getDate() - 1);
        continue;
      }
      break;
    }
  }

  let longestStreak = 1;
  let run = 1;
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1] + "T12:00:00").getTime();
    const curr = new Date(dates[i] + "T12:00:00").getTime();
    const diffDays = (curr - prev) / (24 * 60 * 60 * 1000);
    if (diffDays === 1) {
      run++;
      if (run > longestStreak) longestStreak = run;
    } else {
      run = 1;
    }
  }

  return { currentStreak, longestStreak };
};

export type VersePosition = { book: number; chapter: number; verse: number };

export const getVersesInRange = async (
  start: VersePosition,
  end: VersePosition,
  limit?: number
): Promise<GameVerse[]> => {
  const db = await getDatabase();
  const sql = `SELECT * FROM verses
     WHERE (book > ? OR (book = ? AND chapter > ?) OR (book = ? AND chapter = ? AND verse >= ?))
       AND (book < ? OR (book = ? AND chapter < ?) OR (book = ? AND chapter = ? AND verse <= ?))
     ORDER BY book, chapter, verse${limit != null ? " LIMIT ?" : ""}`;
  const args = [
    start.book, start.book, start.chapter, start.book, start.chapter, start.verse,
    end.book, end.book, end.chapter, end.book, end.chapter, end.verse,
  ];
  if (limit != null) args.push(limit);
  const result = await db.getAllAsync(sql, args);
  return result.map((r) => rowToGameVerse(r as Record<string, unknown>));
};

export const getNextGameVerse = async (currentVerseId: string): Promise<GameVerse | null> => {
  const db = await getDatabase();
  const allVerses = await db.getAllAsync(
    "SELECT * FROM verses ORDER BY length(text), book, chapter, verse"
  );
  const currentIndex = allVerses.findIndex((v) => (v as Record<string, unknown>).id === currentVerseId);
  if (currentIndex === -1 || currentIndex === allVerses.length - 1) return null;
  return rowToGameVerse(allVerses[currentIndex + 1] as Record<string, unknown>);
};

export type BibleBook = { book: number; book_name: string };

export const getBooks = async (): Promise<BibleBook[]> => {
  const db = await getDatabase();
  return db.getAllAsync<BibleBook>("SELECT DISTINCT book, book_name FROM verses ORDER BY book");
};

export const getChaptersForBook = async (book: number): Promise<number[]> => {
  const db = await getDatabase();
  const result = await db.getAllAsync<{ chapter: number }>(
    "SELECT DISTINCT chapter FROM verses WHERE book = ? ORDER BY chapter",
    [book]
  );
  return result.map((r) => r.chapter);
};

export const getVersesByChapter = async (
  book: number,
  chapter: number
): Promise<GameVerse[]> => {
  const db = await getDatabase();
  const result = await db.getAllAsync(
    "SELECT * FROM verses WHERE book = ? AND chapter = ? ORDER BY verse",
    [book, chapter]
  );
  return result.map((r) => rowToGameVerse(r as Record<string, unknown>));
};

export const toggleFavorite = async (id: string): Promise<void> => {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE verses SET is_favorite = CASE WHEN is_favorite = 1 THEN 0 ELSE 1 END WHERE id = ?",
    [id]
  );
};

export const setFavorite = async (id: string, isFavorite: boolean): Promise<void> => {
  const db = await getDatabase();
  await db.runAsync("UPDATE verses SET is_favorite = ? WHERE id = ?", [isFavorite ? 1 : 0, id]);
};

export const setChapterFavorites = async (book: number, chapter: number, isFavorite: boolean): Promise<void> => {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE verses SET is_favorite = ? WHERE book = ? AND chapter = ?",
    [isFavorite ? 1 : 0, book, chapter]
  );
};

export const setRangeFavorites = async (
  start: VersePosition,
  end: VersePosition,
  isFavorite: boolean
): Promise<void> => {
  const verses = await getVersesInRange(start, end);
  const db = await getDatabase();
  for (const v of verses) {
    await db.runAsync("UPDATE verses SET is_favorite = ? WHERE id = ?", [isFavorite ? 1 : 0, v.id]);
  }
};

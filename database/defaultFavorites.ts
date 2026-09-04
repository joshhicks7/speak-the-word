/**
 * Default favorite verses as ranges. Supports same-book, cross-chapter, and cross-book.
 * Consecutive verses are combined (e.g. Joshua 1:8–9). Single verse = start and end same.
 */
export interface VersePosition {
  book_name: string;
  chapter: number;
  verse: number;
}

export interface DefaultFavoriteRange {
  start: VersePosition;
  end: VersePosition;
}

/** Bible book order for comparing positions (cross-book ranges). */
const BOOK_ORDER = [
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth",
  "1 Samuel", "2 Samuel", "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah",
  "Esther", "Job", "Psalm", "Proverbs", "Ecclesiastes", "Song of Solomon", "Isaiah", "Jeremiah",
  "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah",
  "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi", "Matthew", "Mark", "Luke",
  "John", "Acts", "Romans", "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians", "Philippians",
  "Colossians", "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus", "Philemon",
  "Hebrews", "James", "1 Peter", "2 Peter", "1 John", "2 John", "3 John", "Jude", "Revelation",
] as const;

function bookIndex(book_name: string): number {
  const normalized = book_name === "Psalms" ? "Psalm" : book_name;
  const i = BOOK_ORDER.indexOf(normalized as (typeof BOOK_ORDER)[number]);
  return i === -1 ? 999 : i;
}

/** Returns -1 if a < b, 0 if a === b, 1 if a > b (by book, then chapter, then verse). */
function comparePosition(
  aBook: string, aCh: number, aVerse: number,
  bBook: string, bCh: number, bVerse: number
): number {
  const aBi = bookIndex(aBook);
  const bBi = bookIndex(bBook);
  if (aBi !== bBi) return aBi < bBi ? -1 : 1;
  if (aCh !== bCh) return aCh < bCh ? -1 : 1;
  if (aVerse !== bVerse) return aVerse < bVerse ? -1 : 1;
  return 0;
}

function range(
  book_name: string,
  chapter: number,
  verseStart: number,
  verseEnd: number
): DefaultFavoriteRange {
  return {
    start: { book_name, chapter, verse: verseStart },
    end: { book_name, chapter, verse: verseEnd },
  };
}

/** Cross-chapter range (same book). */
function rangeCrossChapter(
  book_name: string,
  startChapter: number,
  startVerse: number,
  endChapter: number,
  endVerse: number
): DefaultFavoriteRange {
  return {
    start: { book_name, chapter: startChapter, verse: startVerse },
    end: { book_name, chapter: endChapter, verse: endVerse },
  };
}

/** Cross-book range. */
function rangeCrossBook(
  startBook: string, startCh: number, startVerse: number,
  endBook: string, endCh: number, endVerse: number
): DefaultFavoriteRange {
  return {
    start: { book_name: startBook, chapter: startCh, verse: startVerse },
    end: { book_name: endBook, chapter: endCh, verse: endVerse },
  };
}

function single(book_name: string, chapter: number, verse: number): DefaultFavoriteRange {
  return range(book_name, chapter, verse, verse);
}

export const defaultFavorites: DefaultFavoriteRange[] = [
  single("Genesis", 1, 1),
  single("Genesis", 1, 26),
  single("Genesis", 9, 13),
  range("Joshua", 1, 8, 9),
  range("Psalm", 37, 3, 4),
  single("Psalm", 119, 11),
  single("Psalm", 133, 1),
  range("Proverbs", 3, 5, 7),
  single("Proverbs", 3, 27),
  single("Proverbs", 11, 2),
  single("Isaiah", 26, 4),
  single("Isaiah", 40, 31),
  single("Isaiah", 41, 10),
  range("Isaiah", 53, 4, 6),
  range("Isaiah", 55, 7, 8),
  single("Jeremiah", 29, 11),
  single("Micah", 6, 8),
  single("Matthew", 5, 16),
  range("Matthew", 11, 28, 30),
  single("Matthew", 22, 37),
  range("Matthew", 28, 18, 20),
  single("John", 1, 1),
  single("John", 1, 12),
  single("John", 3, 16),
  single("John", 5, 24),
  single("John", 10, 10),
  single("John", 11, 25),
  single("John", 13, 35),
  single("John", 14, 6),
  single("John", 14, 27),
  single("John", 15, 13),
  single("John", 16, 33),
  single("Acts", 1, 8),
  single("Acts", 2, 38),
  single("Acts", 4, 12),
  single("Acts", 17, 11),
  single("Romans", 3, 23),
  single("Romans", 8, 28),
  range("Romans", 8, 38, 39),
  range("Romans", 10, 9, 10),
  single("Romans", 10, 17),
  single("Romans", 12, 2),
  single("Romans", 15, 13),
  single("1 Corinthians", 6, 19),
  single("1 Corinthians", 10, 13),
  single("1 Corinthians", 13, 13),
  single("2 Corinthians", 5, 21),
  single("2 Corinthians", 12, 9),
  single("Galatians", 2, 20),
  range("Galatians", 5, 22, 23),
  range("Ephesians", 2, 8, 10),
  range("Ephesians", 3, 20, 21),
  single("Philippians", 1, 6),
  single("Philippians", 2, 3),
  range("Philippians", 4, 6, 7),
  single("Philippians", 4, 8),
  single("Philippians", 4, 13),
  single("Philippians", 4, 19),
  single("Colossians", 3, 12),
  range("Colossians", 3, 23, 24),
  range("2 Timothy", 3, 16, 17),
  single("Hebrews", 4, 12),
  range("Hebrews", 4, 15, 16),
  range("Hebrews", 10, 24, 25),
  single("Hebrews", 11, 1),
  single("Hebrews", 11, 6),
  range("Hebrews", 12, 1, 2),
  single("Hebrews", 13, 5),
  range("James", 1, 2, 3),
  single("James", 5, 16),
  single("1 Peter", 2, 24),
  range("1 Peter", 3, 15, 16),
  single("1 Peter", 5, 7),
  single("1 John", 1, 9),
  single("1 John", 3, 16),
];

/** Check if (book_name, chapter, verse) is between range.start and range.end inclusive. */
function verseInRange(
  book_name: string,
  chapter: number,
  verse: number,
  start: VersePosition,
  end: VersePosition
): boolean {
  const cmpStart = comparePosition(book_name, chapter, verse, start.book_name, start.chapter, start.verse);
  const cmpEnd = comparePosition(book_name, chapter, verse, end.book_name, end.chapter, end.verse);
  return cmpStart >= 0 && cmpEnd <= 0;
}

export function isDefaultFavorite(
  book_name: string,
  chapter: number,
  verse: number
): boolean {
  return defaultFavorites.some((r) => verseInRange(book_name, chapter, verse, r.start, r.end));
}

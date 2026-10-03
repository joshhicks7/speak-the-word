type VerseLike = {
  book_name: string;
  book: number;
  chapter: number;
  verse: number;
};

/** Full chapters excluded from Levels / VOTD auto progression (genealogies, censuses). */
const EXCLUDED_CHAPTER_KEYS: ReadonlySet<string> = new Set([]);

  /*
  "Genesis:5",
  "Genesis:10",
  "Genesis:11",
  "Genesis:36",
  "1 Chronicles:1",
  "1 Chronicles:2",
  "1 Chronicles:3",
  "1 Chronicles:4",
  "1 Chronicles:5",
  "1 Chronicles:6",
  "1 Chronicles:7",
  "1 Chronicles:8",
  "1 Chronicles:9",
  "Matthew:1",
  "Luke:3",
  "Ezra:2",
  "Nehemiah:7",
  "Nehemiah:10",
  "Nehemiah:11",
  "Nehemiah:12",
]);
*/

function chapterKey(bookName: string, chapter: number): string {
  return `${bookName}:${chapter}`;
}

export function isPracticeEligible(verse: VerseLike): boolean {
  return !EXCLUDED_CHAPTER_KEYS.has(chapterKey(verse.book_name, verse.chapter));
}

export const PRACTICE_ELIGIBLE_WHERE = "is_practice_eligible = 1";

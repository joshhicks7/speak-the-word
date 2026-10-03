import {
  getChaptersForBook,
  getVerseByBookChapterVerse,
  type BibleBook,
} from "../database/queries";

export type ParsedScriptureReference = {
  book: number;
  chapter: number;
  /** When null, the user named a whole chapter (e.g. "Psalm 23"). */
  verse: number | null;
  /** Inclusive end verse in the same chapter (e.g. Psalm 23:1–6). */
  verseEnd?: number;
  /** Digits glued without space (e.g. "316" → 3:16 after DB check). */
  compactNumber?: string;
};

const SPOKEN_NUMBERS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
};

function normalizeSpoken(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^\w\s':]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenToInt(token: string): number | null {
  if (/^\d+$/.test(token)) return parseInt(token, 10);
  return SPOKEN_NUMBERS[token] ?? null;
}

function bookAliases(bookName: string): string[] {
  const lower = bookName.toLowerCase();
  const set = new Set<string>([lower]);
  if (lower.endsWith("s")) set.add(lower.slice(0, -1));
  if (lower === "psalms") set.add("psalm");
  if (lower === "john") {
    set.add("jon");
    set.add("jn");
    set.add("jhn");
  }
  if (lower === "song of solomon") {
    set.add("song of songs");
    set.add("songs");
  }
  if (lower.startsWith("1 ")) set.add(lower.replace(/^1 /, "first "));
  if (lower.startsWith("2 ")) set.add(lower.replace(/^2 /, "second "));
  if (lower.startsWith("3 ")) set.add(lower.replace(/^3 /, "third "));
  return [...set];
}

/** STT / casual speech -> full book name before alias index lookup. */
const BOOK_SPOKEN_NICKNAMES: Readonly<Record<string, string>> = {
  jon: "john",
  jn: "john",
  jhn: "john",
  matt: "matthew",
  mat: "matthew",
  mk: "mark",
  gen: "genesis",
  ps: "psalm",
  psa: "psalm",
  pro: "proverbs",
  prov: "proverbs",
  rev: "revelation",
  rom: "romans",
  luk: "luke",
  ex: "exodus",
  deut: "deuteronomy",
};

function resolveBook(bookPart: string, books: BibleBook[]): number | null {
  let q = bookPart.replace(/\s+/g, " ").trim().toLowerCase();
  if (!q) return null;

  const nick = BOOK_SPOKEN_NICKNAMES[q];
  if (nick) q = nick;

  const byName = new Map<string, number>();
  for (const b of books) {
    for (const alias of bookAliases(b.book_name)) {
      byName.set(alias, b.book);
    }
  }

  if (byName.has(q)) return byName.get(q)!;

  let prefixMatch: { book: number; len: number } | null = null;
  for (const [alias, book] of byName.entries()) {
    if (alias.startsWith(q) && q.length >= 3) {
      if (!prefixMatch || alias.length < prefixMatch.len) {
        prefixMatch = { book, len: alias.length };
      }
    }
  }
  if (prefixMatch) return prefixMatch.book;

  for (const [alias, book] of byName.entries()) {
    if (q.startsWith(alias)) return book;
  }

  return null;
}

const DIRECT_PRACTICE_LEADING =
  /^(please\s+)?(start\s+)?practice(\s+(this|the)?(\s+verse)?)?\s+(the\s+)?/i;

/** True when the user asked to practice a specific reference (e.g. "practice Matthew 6 33"). */
export function utteranceRequestsDirectPractice(spoken: string): boolean {
  return DIRECT_PRACTICE_LEADING.test(normalizeSpoken(spoken));
}

const DIRECT_READ_LEADING =
  /^(please\s+)?((what\s+is|what\s+are|what's|whats)|(tell\s+me|give\s+me|show\s+me)|(say|read(\s+me)?|recite))\s+(the\s+)?/i;

/** True when the user asked to hear a reference read aloud (e.g. "read Matthew 6 33"). */
export function utteranceRequestsDirectRead(spoken: string): boolean {
  return DIRECT_READ_LEADING.test(normalizeSpoken(spoken));
}

/** Strip leading conversational phrases before book/chapter/verse tokens. */
function stripLeadingReferencePrefixes(text: string): string {
  let t = text;
  t = t.replace(DIRECT_PRACTICE_LEADING, "");
  t = t.replace(/^(please\s+)?(what\s+is|what\s+are|what's|whats)\s+(the\s+)?/i, "");
  t = t.replace(/^(please\s+)?(tell\s+me|give\s+me|show\s+me)\s+(the\s+)?/i, "");
  t = t.replace(
    /^(please\s+)?(say|read(\s+me)?|recite|look\s+up|look\s+at|open|go\s+to)\s+(the\s+)?/i,
    ""
  );
  return t.replace(/\s+/g, " ").trim();
}

/** Text left after stripping command prefixes (book/chapter/verse tokens only). */
export function getSpokenReferenceTail(spoken: string): string {
  if (!spoken.trim()) return "";

  let t = normalizeSpoken(spoken);
  t = stripLeadingReferencePrefixes(t);
  t = t.replace(/^(please\s+)?(add( a)? verse|add)\s+/i, "");
  t = t.replace(
    /^(switch to|change to|another verse|different verse|new verse)\s+/i,
    ""
  );
  t = t.replace(/\bchapter\b/g, " ");
  t = t.replace(/\bverse(s)?\b/g, " ");
  t = t.replace(/:/g, " ");
  t = t.replace(/\s*-\s*/g, " - ");
  return t.replace(/\s+/g, " ").trim();
}

const RANGE_SEPARATORS = new Set(["through", "thru", "to", "until", "til", "-"]);

function isRangeSeparator(token: string): boolean {
  return RANGE_SEPARATORS.has(token.toLowerCase());
}

function findRangeSeparatorIndex(tokens: string[]): number {
  for (let i = 1; i < tokens.length - 1; i++) {
    if (isRangeSeparator(tokens[i])) return i;
  }
  return -1;
}

/** Book name tokens + trailing chapter number (never "psalms 23" as a book name). */
function parseBookChapterFromPrefix(
  prefixTokens: string[],
  books: BibleBook[],
  defaultBook?: number
): { book: number; chapter: number } | null {
  if (prefixTokens.length === 0) return null;
  if (prefixTokens.length === 1) {
    const chapter = tokenToInt(prefixTokens[0]);
    if (chapter != null && chapter >= 1 && defaultBook != null) {
      return { book: defaultBook, chapter };
    }
    return null;
  }
  const chapter = tokenToInt(prefixTokens[prefixTokens.length - 1]!);
  if (chapter == null || chapter < 1) return null;
  const bookPart = prefixTokens.slice(0, -1).join(" ");
  const book = resolveBook(bookPart, books);
  if (book == null) return null;
  return { book, chapter };
}

/**
 * True when the user likely said a reference but parsing failed (e.g. "practice jon 3").
 * Prevents generic "practice" from opening the first challenge / next level.
 */
export function looksLikeScriptureReferenceAttempt(spoken: string): boolean {
  const tail = getSpokenReferenceTail(spoken);
  if (!tail) return false;
  if (/\d/.test(tail)) return true;
  return tail.split(" ").filter(Boolean).length >= 2;
}

/**
 * Parse spoken or typed references like "Genesis 1:1", "genesis 1 1", "add john 3 16",
 * "say matthew 6 33", "what is john 3 16", or "practice matthew 6 33".
 */
export type ParseScriptureReferenceOptions = {
  /** When set, "3 16" / "chapter 3 verse 16" can resolve without repeating the book name. */
  defaultBook?: number;
};

/** "john316" → ["john", "316"] */
function expandGluedBookNumberTokens(tokens: string[]): string[] {
  const out: string[] = [];
  for (const tok of tokens) {
    const m = tok.match(/^([a-z][a-z0-9']*)(\d+)$/i);
    if (m) {
      out.push(m[1], m[2]);
    } else {
      out.push(tok);
    }
  }
  return out;
}

function splitCompactChapterVerseCandidates(digits: string): { chapter: number; verse: number }[] {
  const out: { chapter: number; verse: number }[] = [];
  for (let i = 1; i < digits.length; i++) {
    const chapter = parseInt(digits.slice(0, i), 10);
    const verse = parseInt(digits.slice(i), 10);
    if (chapter >= 1 && verse >= 1) out.push({ chapter, verse });
  }
  out.sort((a, b) => a.chapter - b.chapter || a.verse - b.verse);
  return out;
}

/** If chapter 316 exists use whole chapter; else try splits like 3:16. */
export async function resolveCompactScriptureNumber(
  book: number,
  compactNumber: string
): Promise<{ chapter: number; verse: number | null } | null> {
  const chapters = await getChaptersForBook(book);
  const asChapter = parseInt(compactNumber, 10);
  if (!Number.isNaN(asChapter) && chapters.includes(asChapter)) {
    return { chapter: asChapter, verse: null };
  }
  for (const { chapter, verse } of splitCompactChapterVerseCandidates(compactNumber)) {
    const row = await getVerseByBookChapterVerse(book, chapter, verse);
    if (row) return { chapter, verse };
  }
  return null;
}

function parseReferenceTokens(
  tokens: string[],
  books: BibleBook[],
  defaultBook?: number
): ParsedScriptureReference | null {
  if (tokens.length === 1 && defaultBook != null) {
    const chapter = tokenToInt(tokens[0]!);
    if (chapter != null && chapter >= 1) {
      return { book: defaultBook, chapter, verse: null };
    }
    return null;
  }

  const rangeSep = findRangeSeparatorIndex(tokens);
  if (rangeSep >= 0) {
    const verseStart = tokenToInt(tokens[rangeSep - 1]!);
    const verseEnd = tokenToInt(tokens[rangeSep + 1]!);
    const prefix = tokens.slice(0, rangeSep - 1);
    const bc = parseBookChapterFromPrefix(prefix, books, defaultBook);
    if (
      bc &&
      verseStart != null &&
      verseEnd != null &&
      verseStart >= 1 &&
      verseEnd >= verseStart
    ) {
      return {
        book: bc.book,
        chapter: bc.chapter,
        verse: verseStart,
        verseEnd,
      };
    }
  }

  if (tokens.length >= 4) {
    const verseEnd = tokenToInt(tokens[tokens.length - 1]!);
    const verseStart = tokenToInt(tokens[tokens.length - 2]!);
    const chapter = tokenToInt(tokens[tokens.length - 3]!);
    if (
      verseEnd != null &&
      verseStart != null &&
      chapter != null &&
      chapter >= 1 &&
      verseStart >= 1 &&
      verseEnd >= verseStart
    ) {
      const bookPart = tokens.slice(0, -3).join(" ");
      const book = resolveBook(bookPart, books);
      if (book != null) {
        return { book, chapter, verse: verseStart, verseEnd };
      }
    }
  }

  if (tokens.length === 3) {
    const verse = tokenToInt(tokens[2]!);
    const chapter = tokenToInt(tokens[1]!);
    if (verse != null && chapter != null && chapter >= 1 && verse >= 1) {
      const book = resolveBook(tokens[0]!, books);
      if (book != null) return { book, chapter, verse };
    }
  }

  if (tokens.length === 2 && defaultBook != null) {
    const chapter = tokenToInt(tokens[0]!);
    const verse = tokenToInt(tokens[1]!);
    if (chapter != null && verse != null && chapter >= 1 && verse >= 1) {
      return { book: defaultBook, chapter, verse };
    }
  }

  if (tokens.length === 2) {
    const book = resolveBook(tokens[0]!, books);
    const chapter = tokenToInt(tokens[1]!);
    if (book != null && chapter != null && chapter >= 1) {
      return { book, chapter, verse: null };
    }
  }

  if (tokens.length >= 2) {
    const lastTok = tokens[tokens.length - 1]!;
    const bookPart = tokens.slice(0, -1).join(" ");
    const book = bookPart ? resolveBook(bookPart, books) : null;
    if (book != null && /^\d+$/.test(lastTok)) {
      if (lastTok.length >= 3) {
        return { book, chapter: 0, verse: null, compactNumber: lastTok };
      }
      const chapterOnly = parseInt(lastTok, 10);
      if (chapterOnly >= 1) {
        return { book, chapter: chapterOnly, verse: null };
      }
    }
  }

  return null;
}

export function parseScriptureReference(
  spoken: string,
  books: BibleBook[],
  options?: ParseScriptureReferenceOptions
): ParsedScriptureReference | null {
  if (!spoken.trim() || books.length === 0) return null;

  const t = getSpokenReferenceTail(spoken);
  if (!t) return null;

  const tokens = expandGluedBookNumberTokens(t.split(" ").filter(Boolean));
  return parseReferenceTokens(tokens, books, options?.defaultBook);
}

/** True when the utterance includes a parseable book/chapter or book/chapter/verse reference. */
export function utteranceContainsScriptureReference(
  spoken: string,
  books: BibleBook[],
  options?: ParseScriptureReferenceOptions
): boolean {
  return parseScriptureReference(spoken, books, options) != null;
}

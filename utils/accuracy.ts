import { STT_WORD_ALIASES } from "./sttWordAliases";

/** Digit / ordinal forms speech-to-text and typing often produce instead of spelled numbers. */
const NUMBER_WORDS: Record<string, string> = {
  "0": "zero",
  "1": "one",
  "2": "two",
  "3": "three",
  "4": "four",
  "5": "five",
  "6": "six",
  "7": "seven",
  "8": "eight",
  "9": "nine",
  "10": "ten",
  "11": "eleven",
  "12": "twelve",
  "13": "thirteen",
  "14": "fourteen",
  "15": "fifteen",
  "16": "sixteen",
  "17": "seventeen",
  "18": "eighteen",
  "19": "nineteen",
  "20": "twenty",
  "30": "thirty",
  "40": "forty",
  "50": "fifty",
  "60": "sixty",
  "70": "seventy",
  "80": "eighty",
  "90": "ninety",
  "100": "hundred",
  "1000": "thousand",
  "1st": "first",
  "2nd": "second",
  "3rd": "third",
  "4th": "fourth",
  "5th": "fifth",
  "6th": "sixth",
  "7th": "seventh",
  "8th": "eighth",
  "9th": "ninth",
  "10th": "tenth",
  "11th": "eleventh",
  "12th": "twelfth",
};

/** Same word, different spelling — canonicalize to the left form. */
const SPELLING_ALIASES: Record<string, string> = {
  savior: "saviour",
  honor: "honour",
  honors: "honours",
  honored: "honoured",
  honorable: "honourable",
  neighbor: "neighbour",
  neighbors: "neighbours",
  favor: "favour",
  favors: "favours",
  favored: "favoured",
  labor: "labour",
  labors: "labours",
  color: "colour",
  colors: "colours",
  toward: "towards",
};

function expandContractions(text: string): string {
  return text
    .replace(/\bwon't\b/g, "will not")
    .replace(/\bcan't\b/g, "can not")
    .replace(/\bshan't\b/g, "shall not")
    .replace(/\bain't\b/g, "am not")
    .replace(/\blet's\b/g, "let us")
    .replace(/\bi'm\b/g, "i am")
    .replace(/n't/g, " not")
    .replace(/\b(i|you|we|they)'re\b/g, "$1 are")
    .replace(/\b(i|you|we|they)'ve\b/g, "$1 have")
    .replace(/\b(i|you|he|she|we|they|it)'ll\b/g, "$1 will")
    .replace(/\b(i|you|he|she|we|they|it)'d\b/g, "$1 would")
    .replace(/\b(he|she|it|that|there|here|what|who)'s\b/g, "$1 is");
}

function canonicalWord(word: string): string {
  if (NUMBER_WORDS[word]) return NUMBER_WORDS[word];
  const stt = STT_WORD_ALIASES[word];
  if (stt) return stt;
  if (SPELLING_ALIASES[word]) return SPELLING_ALIASES[word];
  return word;
}

export function normalizeForCompare(text: string): string[] {
  const prepared = expandContractions(
    text
      .toLowerCase()
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/&/g, " and ")
      .replace(/\+/g, " and ")
      .replace(/[-–—]/g, "")
  );

  return prepared
    .replace(/\b's\b/g, " ") // leftover possessives: "Jesus's" -> "Jesus"
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map(canonicalWord);
}

/** Levenshtein (edit) distance between two strings. */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

const MAX_EDIT_DISTANCE = 1;
const MIN_LENGTH_FOR_FUZZY = 4;

/** Max extra words allowed in spoken vs expected, as a fraction of expected word count (e.g. 0.2 = 20%). */
const EXTRA_WORD_TOLERANCE_RATIO = 0.2;

/** True if spoken word counts as correct for expected (exact or within typo tolerance). */
function wordsMatch(expected: string, spoken: string): boolean {
  if (expected === spoken) return true;
  if (Math.abs(expected.length - spoken.length) > MAX_EDIT_DISTANCE) return false;
  const longer = Math.max(expected.length, spoken.length);
  if (longer < 3) return false;
  if (expected.length >= MIN_LENGTH_FOR_FUZZY && spoken.length >= MIN_LENGTH_FOR_FUZZY) {
    return levenshtein(expected, spoken) <= MAX_EDIT_DISTANCE;
  }
  // STT homophones / drop letter: e.g. wept vs wet
  return levenshtein(expected, spoken) <= MAX_EDIT_DISTANCE;
}

export type AccuracyResult = {
  correct: number;
  total: number;
  percent: number;
  /** Indices of expected words that did not match (for highlighting). */
  wrongExpectedIndices: number[];
};

function matchAt(
  expectedWords: string[],
  expectedIdx: number,
  spokenWords: string[],
  spokenIdx: number
): { expectedConsumed: number; spokenConsumed: number } | null {
  const expected = expectedWords[expectedIdx];
  const spoken = spokenWords[spokenIdx];
  if (wordsMatch(expected, spoken)) {
    return { expectedConsumed: 1, spokenConsumed: 1 };
  }
  // "cannot" vs "can not", "today" vs "to day", "wellbeloved" vs "well beloved"
  if (
    spokenIdx + 1 < spokenWords.length &&
    wordsMatch(expected, spokenWords[spokenIdx] + spokenWords[spokenIdx + 1])
  ) {
    return { expectedConsumed: 1, spokenConsumed: 2 };
  }
  // "for ever" vs "forever"
  if (
    expectedIdx + 1 < expectedWords.length &&
    wordsMatch(expectedWords[expectedIdx] + expectedWords[expectedIdx + 1], spoken)
  ) {
    return { expectedConsumed: 2, spokenConsumed: 1 };
  }
  return null;
}

export function computeAccuracy(expected: string, spoken: string): AccuracyResult {
  const expectedWords = normalizeForCompare(expected);
  const spokenWords = normalizeForCompare(spoken);
  if (expectedWords.length === 0) return { correct: 0, total: 0, percent: 0, wrongExpectedIndices: [] };

  // Match in order but allow extra words (e.g. "God I created") up to tolerance.
  const maxExtraWords = Math.floor(expectedWords.length * EXTRA_WORD_TOLERANCE_RATIO);
  let correct = 0;
  let spokenIdx = 0;
  let skipsUsed = 0;
  const wrongExpectedIndices: number[] = [];
  for (let i = 0; i < expectedWords.length; ) {
    let matched: { expectedConsumed: number; spokenConsumed: number } | null = null;
    while (spokenIdx < spokenWords.length) {
      matched = matchAt(expectedWords, i, spokenWords, spokenIdx);
      if (matched) {
        correct += matched.expectedConsumed;
        spokenIdx += matched.spokenConsumed;
        break;
      }
      if (skipsUsed >= maxExtraWords) break;
      spokenIdx++;
      skipsUsed++;
    }
    if (!matched) {
      wrongExpectedIndices.push(i);
      i += 1;
    } else {
      i += matched.expectedConsumed;
    }
  }

  return {
    correct,
    total: expectedWords.length,
    percent: Math.round((correct / expectedWords.length) * 100),
    wrongExpectedIndices,
  };
}

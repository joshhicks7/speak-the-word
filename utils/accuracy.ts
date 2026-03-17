export function normalizeForCompare(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/\b's\b/g, " ") // "Jesus's" -> "Jesus " so we don't get an extra "s" word
    .replace(/[.,;:!?'"]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
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
  if (expected.length < MIN_LENGTH_FOR_FUZZY || spoken.length < MIN_LENGTH_FOR_FUZZY) return false;
  if (Math.abs(expected.length - spoken.length) > MAX_EDIT_DISTANCE) return false;
  return levenshtein(expected, spoken) <= MAX_EDIT_DISTANCE;
}

export type AccuracyResult = {
  correct: number;
  total: number;
  percent: number;
  /** Indices of expected words that did not match (for highlighting). */
  wrongExpectedIndices: number[];
};

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
  for (let i = 0; i < expectedWords.length; i++) {
    const exp = expectedWords[i];
    let matched = false;
    while (spokenIdx < spokenWords.length) {
      if (wordsMatch(exp, spokenWords[spokenIdx])) {
        correct++;
        spokenIdx++;
        matched = true;
        break;
      }
      if (skipsUsed >= maxExtraWords) break; // no more skips allowed, count this expected word as wrong
      spokenIdx++;
      skipsUsed++;
    }
    if (!matched) wrongExpectedIndices.push(i);
  }

  return {
    correct,
    total: expectedWords.length,
    percent: Math.round((correct / expectedWords.length) * 100),
    wrongExpectedIndices,
  };
}

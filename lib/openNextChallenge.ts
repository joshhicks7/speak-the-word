import type { Router } from "expo-router";
import {
  getNextIncompleteChallenge,
  loadVersesForChallenge,
  storedChallengeFromRow,
} from "../database/challenges";
import { getChallengeFirstVerse, getChallengeVerseIds } from "../utils/challengeRanges";

export async function navigateToNextIncompleteChallenge(
  router: Router,
  options?: {
    anchorChallengeId?: string | null;
    speak?: (text: string) => Promise<void>;
    reenableListen?: () => void;
  }
): Promise<boolean> {
  const row = await getNextIncompleteChallenge(options?.anchorChallengeId ?? null);
  if (!row) {
    if (options?.speak) {
      await options.speak("No incomplete challenges left. Add one or keep practicing.");
    }
    options?.reenableListen?.();
    return false;
  }

  const verses = await loadVersesForChallenge(row);
  const stored = storedChallengeFromRow(row, verses);
  if (!stored) {
    if (options?.speak) {
      await options.speak("Couldn't open that challenge. Try again.");
    }
    options?.reenableListen?.();
    return false;
  }

  const verseIds = getChallengeVerseIds(stored.item);
  const firstVerse = getChallengeFirstVerse(stored.item);
  router.push({
    pathname: "/practice-game",
    params: {
      session: "challenge",
      challengeId: stored.challengeId,
      verseId: firstVerse.id,
      mode: "speech",
      ...(verseIds.length > 1
        ? { verseIds: verseIds.join(","), currentIndex: "0", rangeMode: "entire" }
        : {}),
    },
  });
  return true;
}

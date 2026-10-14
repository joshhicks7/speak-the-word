import type { Router } from "expo-router";
import {
  getAdjacentVerse,
  getVerseByBookChapterVerse,
  getVersesByChapter,
  searchVersesByText,
  type BibleBook,
} from "../database/queries";
import type { GameVerse } from "../types/verse";
import {
  getSpokenReferenceTail,
  isBarePartialReferenceTail,
  looksLikeScriptureReferenceAttempt,
  parseScriptureReference,
  resolveCompactScriptureNumber,
  utteranceRequestsDirectPractice,
  utteranceRequestsDirectRead,
} from "./parseScriptureReference";
import {
  findChallengeContainingVerses,
  upsertChallengeFromVerses,
} from "../database/challenges";
import { logVoiceHub } from "./voiceCommandLog";
import {
  extractFindVerseQuery,
  parseGlobalCommand,
  parseInterruptSpeechCommand,
  parseStrictVerseMenuCommand,
  parseVerseStepCommand,
  parseVerseMenuCommand,
  parseVoiceCommand,
} from "./voiceCommands";
import { navigateToNextIncompleteChallenge } from "./openNextChallenge";
import { isSpeaking, waitForSpeechIdle } from "./voiceFeedback";

async function reenableListening(setListening: (active: boolean) => void): Promise<void> {
  await waitForSpeechIdle();
  setListening(true);
}

const CHAPTER_READ_VERSE_LIMIT = 8;

export type HubVerseVoiceDeps = {
  bibleBooks: BibleBook[];
  pendingVerse: GameVerse | null;
  setPendingVerse: (verse: GameVerse | null) => void;
  /** When set, "practice" from the pending menu opens the full list (e.g. whole chapter). */
  pendingPracticeVerseIds: string[] | null;
  setPendingPracticeVerseIds: (ids: string[] | null) => void;
  router: Router;
  speak: (text: string) => Promise<void>;
  stopSpeak: () => void;
  setListening: (active: boolean) => void;
  /** When false, voice practice uses level session (Levels tab). */
  practiceAsChallenge?: boolean;
  onHandsFreeOff?: () => Promise<void>;
  /** Opens the next challenge in list order (My Challenges voice). */
  onOpenNextChallenge?: () => Promise<void>;
  /** Screen-specific commands (e.g. today's verse, levels next). Return true if handled. */
  handleBeforeFallback?: (text: string) => Promise<boolean>;
};

type ResolvedScripture =
  | { kind: "verse"; verse: GameVerse }
  | { kind: "chapter"; verses: GameVerse[]; label: string };

function chapterLabelFromVerse(verse: GameVerse, verseCount: number): string {
  const space = verse.reference.lastIndexOf(" ");
  const bookPart = space >= 0 ? verse.reference.slice(0, space) : verse.reference;
  const chapterPart = space >= 0 ? verse.reference.slice(space + 1).split(":")[0] : String(verse.chapter);
  return `${bookPart} ${chapterPart} (${verseCount} verses)`;
}

function verseRangeLabel(verses: GameVerse[]): string {
  if (verses.length === 0) return "";
  const first = verses[0]!;
  const last = verses[verses.length - 1]!;
  const head = first.reference.split(":")[0];
  if (verses.length === 1) return first.reference;
  return `${head}:${first.verse}-${last.verse}`;
}

async function resolveSpokenScripture(
  text: string,
  books: BibleBook[],
  contextBook?: number
): Promise<ResolvedScripture | null> {
  const parsed = parseScriptureReference(text, books, { defaultBook: contextBook });
  if (!parsed) return null;

  if (parsed.compactNumber) {
    const resolved = await resolveCompactScriptureNumber(parsed.book, parsed.compactNumber);
    if (!resolved) return null;
    if (resolved.verse != null) {
      const verse = await getVerseByBookChapterVerse(parsed.book, resolved.chapter, resolved.verse);
      return verse ? { kind: "verse", verse } : null;
    }
    const verses = await getVersesByChapter(parsed.book, resolved.chapter);
    if (verses.length === 0) return null;
    return {
      kind: "chapter",
      verses,
      label: chapterLabelFromVerse(verses[0], verses.length),
    };
  }

  if (parsed.verse != null && parsed.verseEnd != null) {
    const chapterVerses = await getVersesByChapter(parsed.book, parsed.chapter);
    const verses = chapterVerses.filter(
      (v) => v.verse >= parsed.verse! && v.verse <= parsed.verseEnd!
    );
    if (verses.length === 0) return null;
    if (verses.length === 1) return { kind: "verse", verse: verses[0]! };
    return {
      kind: "chapter",
      verses,
      label: `${verseRangeLabel(verses)} (${verses.length} verses)`,
    };
  }

  if (parsed.verse != null) {
    const verse = await getVerseByBookChapterVerse(parsed.book, parsed.chapter, parsed.verse);
    return verse ? { kind: "verse", verse } : null;
  }

  const verses = await getVersesByChapter(parsed.book, parsed.chapter);
  if (verses.length === 0) return null;
  return {
    kind: "chapter",
    verses,
    label: chapterLabelFromVerse(verses[0], verses.length),
  };
}

async function pushPractice(
  router: Router,
  verseId: string,
  versesForChallenge: GameVerse[],
  verseIds?: string[],
  /** Voice-opened multi-verse: read and recite the full passage in hands-free. */
  rangeMode?: "entire",
  /** When false, practice as level progression (e.g. Levels tab). */
  asChallenge = true
): Promise<void> {
  const multiVerse = !!(verseIds && verseIds.length > 1);
  let challengeId: string | undefined;
  if (asChallenge && versesForChallenge.length > 0) {
    let row = await findChallengeContainingVerses(versesForChallenge);
    if (!row) {
      try {
        row = await upsertChallengeFromVerses(versesForChallenge);
      } catch (err) {
        console.warn("[voice hub] challenge upsert failed; opening practice without challenge row", err);
      }
    }
    challengeId = row?.id;
  }
  router.push({
    pathname: "/practice-game",
    params: {
      verseId,
      mode: "speech",
      ...(asChallenge && challengeId ? { session: "challenge", challengeId } : { session: "level" }),
      ...(multiVerse
        ? {
            verseIds: verseIds!.join(","),
            currentIndex: "0",
            rangeMode: rangeMode ?? "entire",
          }
        : asChallenge
          ? { verseIds: verseId, currentIndex: "0", rangeMode: "verse" }
          : {}),
    },
  });
}

function routeGlobalNav(router: Router, intent: ReturnType<typeof parseGlobalCommand>): boolean {
  if (intent === "home") {
    router.push("/(tabs)");
    return true;
  }
  if (intent === "levels") {
    router.push("/(tabs)/levels");
    return true;
  }
  if (intent === "challenges") {
    router.push("/(tabs)/practice");
    return true;
  }
  if (intent === "settings") {
    router.push("/settings");
    return true;
  }
  if (intent === "addVerse") {
    router.push("/add-to-challenges");
    return true;
  }
  return false;
}

async function speakChapterRead(deps: Pick<HubVerseVoiceDeps, "speak">, resolved: Extract<ResolvedScripture, { kind: "chapter" }>): Promise<void> {
  const { verses, label } = resolved;
  if (verses.length <= CHAPTER_READ_VERSE_LIMIT) {
    const body = verses.map((v) => `${v.reference}. ${v.text}`).join(" ");
    await deps.speak(body);
    return;
  }
  await deps.speak(
    `${label}. Here is ${verses[0].reference}. ${verses[0].text} Say practice to recite the chapter verse by verse.`
  );
}

/**
 * Shared My Challenges–style voice: references, read/practice shortcuts, pending verse menu, navigation.
 */
export async function processHubVerseVoice(text: string, deps: HubVerseVoiceDeps): Promise<void> {
  const {
    bibleBooks,
    pendingVerse,
    setPendingVerse,
    pendingPracticeVerseIds,
    setPendingPracticeVerseIds,
    router,
    speak,
    stopSpeak,
    setListening,
    practiceAsChallenge = true,
    onHandsFreeOff,
    onOpenNextChallenge,
    handleBeforeFallback,
  } = deps;

  if (parseInterruptSpeechCommand(text, { allowBareStop: isSpeaking() })) {
    setListening(false);
    stopSpeak();
    void reenableListening(setListening);
    return;
  }

  if (isBarePartialReferenceTail(text)) {
    return;
  }

  setListening(false);
  stopSpeak();

  const globalEarly = parseGlobalCommand(text);
  if (globalEarly === "nextChallenge") {
    setPendingVerse(null);
    setPendingPracticeVerseIds(null);
    if (onOpenNextChallenge) {
      await onOpenNextChallenge();
      return;
    }
    const opened = await navigateToNextIncompleteChallenge(router, {
      speak,
      reenableListen: () => void reenableListening(setListening),
    });
    if (!opened) void reenableListening(setListening);
    return;
  }

  logVoiceHub("input", {
    fullPhrase: text,
    tail: getSpokenReferenceTail(text),
    parsed: parseScriptureReference(text, bibleBooks, { defaultBook: pendingVerse?.book }),
    looksLikeRef: looksLikeScriptureReferenceAttempt(text),
    directPractice: utteranceRequestsDirectPractice(text),
    directRead: utteranceRequestsDirectRead(text),
    practiceAsChallenge,
    pending: pendingVerse?.reference ?? null,
  });

  const clearPending = () => {
    setPendingVerse(null);
    setPendingPracticeVerseIds(null);
  };

  const speakVerseMenuPrompt = async (verse: GameVerse, chapterLabel?: string) => {
    const ref = chapterLabel ?? verse.reference;
    await speak(`${ref}. What would you like to do? Practice or read.`);
  };

  const beginScriptureVoiceMenu = async (resolved: ResolvedScripture) => {
    if (resolved.kind === "verse") {
      setPendingVerse(resolved.verse);
      setPendingPracticeVerseIds([resolved.verse.id]);
      await speakVerseMenuPrompt(resolved.verse);
    } else {
      const first = resolved.verses[0];
      const ids = resolved.verses.map((v) => v.id);
      setPendingVerse(first);
      setPendingPracticeVerseIds(ids);
      await speakVerseMenuPrompt(first, resolved.label);
    }
    void reenableListening(setListening);
  };

  const versesFromIds = async (ids: string[]): Promise<GameVerse[]> => {
    const { getVerseById } = await import("../database/queries");
    const loaded = await Promise.all(ids.map((id) => getVerseById(id)));
    return loaded.filter((v): v is GameVerse => v != null);
  };

  const handleVerseStep = async (step: "next" | "previous"): Promise<boolean> => {
    if (!pendingVerse) return false;
    const adjacent = await getAdjacentVerse(
      pendingVerse.book,
      pendingVerse.chapter,
      pendingVerse.verse,
      step
    );
    if (!adjacent) {
      await speak(step === "next" ? "There is no next verse." : "There is no previous verse.");
      void reenableListening(setListening);
      return true;
    }
    setPendingVerse(adjacent);
    setPendingPracticeVerseIds([adjacent.id]);
    await speak(`${adjacent.reference}. ${adjacent.text}`);
    await speakVerseMenuPrompt(adjacent);
    void reenableListening(setListening);
    return true;
  };

  const handlePendingVerseMenu = async (menuIntent: ReturnType<typeof parseVerseMenuCommand>): Promise<boolean> => {
    if (menuIntent === "practice" || menuIntent === "addToChallenges") {
      const ids = pendingPracticeVerseIds?.length ? pendingPracticeVerseIds : [pendingVerse!.id];
      clearPending();
      const verses = await versesFromIds(ids);
      await pushPractice(
        router,
        ids[0]!,
        verses,
        ids.length > 1 ? ids : undefined,
        undefined,
        practiceAsChallenge
      );
      return true;
    }
    if (menuIntent === "read") {
      if (pendingPracticeVerseIds && pendingPracticeVerseIds.length > 1) {
        const verses = pendingPracticeVerseIds.length;
        await speak(
          `${chapterLabelFromVerse(pendingVerse!, verses)}. ${pendingVerse!.reference}. ${pendingVerse!.text}`
        );
      } else {
        await speak(`${pendingVerse!.reference}. ${pendingVerse!.text}`);
      }
      await speakVerseMenuPrompt(
        pendingVerse!,
        pendingPracticeVerseIds && pendingPracticeVerseIds.length > 1
          ? chapterLabelFromVerse(pendingVerse!, pendingPracticeVerseIds.length)
          : undefined
      );
      void reenableListening(setListening);
      return true;
    }
    return false;
  };

  if (pendingVerse) {
    const step = parseVerseStepCommand(text);
    if (step) {
      logVoiceHub("pending verse step", { step });
      if (await handleVerseStep(step)) return;
    }
    const strictMenu = parseStrictVerseMenuCommand(text);
    if (strictMenu !== "unknown") {
      logVoiceHub("pending menu (strict)", { menuIntent: strictMenu });
      if (await handlePendingVerseMenu(strictMenu)) return;
    }
  }

  const spoken = await resolveSpokenScripture(text, bibleBooks, pendingVerse?.book);
  if (spoken) {
    logVoiceHub("resolved", {
      kind: spoken.kind,
      reference:
        spoken.kind === "verse"
          ? spoken.verse.reference
          : spoken.label,
    });
    if (utteranceRequestsDirectPractice(text)) {
      clearPending();
      if (spoken.kind === "verse") {
        await pushPractice(router, spoken.verse.id, [spoken.verse], undefined, undefined, practiceAsChallenge);
      } else {
        const ids = spoken.verses.map((v) => v.id);
        await pushPractice(
          router,
          spoken.verses[0]!.id,
          spoken.verses,
          ids,
          "entire",
          practiceAsChallenge
        );
      }
      return;
    }
    if (utteranceRequestsDirectRead(text)) {
      if (spoken.kind === "verse") {
        setPendingVerse(spoken.verse);
        setPendingPracticeVerseIds([spoken.verse.id]);
        await speak(`${spoken.verse.reference}. ${spoken.verse.text}`);
        await speakVerseMenuPrompt(spoken.verse);
      } else {
        setPendingVerse(spoken.verses[0]);
        setPendingPracticeVerseIds(spoken.verses.map((v) => v.id));
        await speakChapterRead({ speak }, spoken);
        await speakVerseMenuPrompt(spoken.verses[0], spoken.label);
      }
      void reenableListening(setListening);
      return;
    }
    await beginScriptureVoiceMenu(spoken);
    return;
  }

  if (pendingVerse) {
    const menuIntent = parseVerseMenuCommand(text);
    logVoiceHub("pending menu", { menuIntent });
    if (menuIntent !== "unknown" && (await handlePendingVerseMenu(menuIntent))) {
      return;
    }

    const nav = parseVoiceCommand(text);
    if (routeGlobalNav(router, nav)) return;

    await speak(
      "Say practice or read. Say next or last for another verse. Or say a new reference, like John 3 16."
    );
    void reenableListening(setListening);
    return;
  }

  if (handleBeforeFallback && (await handleBeforeFallback(text))) {
    return;
  }

  const intent = parseGlobalCommand(text);
  logVoiceHub("fallback", { globalIntent: intent });
  if (intent === "findVerse") {
    const q = extractFindVerseQuery(text);
    const results = await searchVersesByText(q, 3);
    if (results[0]) {
      await beginScriptureVoiceMenu({ kind: "verse", verse: results[0] });
    } else {
      await speak("No verse found.");
      void reenableListening(setListening);
    }
    return;
  }
  if (intent === "handsFreeOff") {
    if (onHandsFreeOff) await onHandsFreeOff();
    return;
  }
  if (routeGlobalNav(router, intent)) return;

  if (looksLikeScriptureReferenceAttempt(text)) {
    await speak("I couldn't find that reference. Try John 3 16, or say the book, chapter, and verse.");
  } else {
    await speak("Say a verse reference, like Genesis 1 1 or Psalm 23.");
  }
  void reenableListening(setListening);
}

import type { Router } from "expo-router";
import {
  getVerseByBookChapterVerse,
  getVersesByChapter,
  searchVersesByText,
  type BibleBook,
} from "../database/queries";
import type { GameVerse } from "../types/verse";
import {
  getSpokenReferenceTail,
  looksLikeScriptureReferenceAttempt,
  parseScriptureReference,
  resolveCompactScriptureNumber,
  utteranceRequestsDirectPractice,
  utteranceRequestsDirectRead,
} from "./parseScriptureReference";
import { logVoiceHub } from "./voiceCommandLog";
import {
  extractFindVerseQuery,
  parseGlobalCommand,
  parseInterruptSpeechCommand,
  parseStrictVerseMenuCommand,
  parseVerseMenuCommand,
  parseVoiceCommand,
} from "./voiceCommands";
import { isSpeaking } from "./voiceFeedback";

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
  /** Route param for practice-game `source`. */
  practiceSource?: string;
  onAddToChallenges?: (verse: GameVerse, verseIds?: string[]) => Promise<void>;
  onHandsFreeOff?: () => Promise<void>;
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

function pushPractice(
  router: Router,
  verseId: string,
  practiceSource?: string,
  verseIds?: string[],
  /** Voice-opened multi-verse: read and recite the full passage in hands-free. */
  rangeMode?: "entire"
): void {
  const ids = verseIds && verseIds.length > 1 ? verseIds : undefined;
  router.push({
    pathname: "/practice-game",
    params: {
      verseId,
      mode: "speech",
      ...(ids ? { verseIds: ids.join(","), currentIndex: "0", rangeMode: rangeMode ?? "entire" } : {}),
      ...(practiceSource ? { source: practiceSource } : {}),
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
    practiceSource = "challenge",
    onAddToChallenges,
    onHandsFreeOff,
    handleBeforeFallback,
  } = deps;

  if (parseInterruptSpeechCommand(text, { allowBareStop: isSpeaking() })) {
    setListening(false);
    stopSpeak();
    setListening(true);
    return;
  }

  setListening(false);
  stopSpeak();

  logVoiceHub("input", {
    fullPhrase: text,
    tail: getSpokenReferenceTail(text),
    parsed: parseScriptureReference(text, bibleBooks, { defaultBook: pendingVerse?.book }),
    looksLikeRef: looksLikeScriptureReferenceAttempt(text),
    directPractice: utteranceRequestsDirectPractice(text),
    directRead: utteranceRequestsDirectRead(text),
    practiceSource,
    pending: pendingVerse?.reference ?? null,
  });

  const clearPending = () => {
    setPendingVerse(null);
    setPendingPracticeVerseIds(null);
  };

  const speakVerseMenuPrompt = async (verse: GameVerse, chapterLabel?: string) => {
    const ref = chapterLabel ?? verse.reference;
    await speak(`${ref}. What would you like to do? Practice, read, or add.`);
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
    setListening(true);
  };

  const handlePendingVerseMenu = async (menuIntent: ReturnType<typeof parseVerseMenuCommand>): Promise<boolean> => {
    if (menuIntent === "practice") {
      const ids = pendingPracticeVerseIds?.length ? pendingPracticeVerseIds : [pendingVerse!.id];
      clearPending();
      pushPractice(router, ids[0], practiceSource, ids.length > 1 ? ids : undefined);
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
      setListening(true);
      return true;
    }
    if (menuIntent === "addToChallenges") {
      if (onAddToChallenges) {
        const ids =
          pendingPracticeVerseIds && pendingPracticeVerseIds.length > 0
            ? pendingPracticeVerseIds
            : [pendingVerse!.id];
        await onAddToChallenges(pendingVerse!, ids);
      }
      await speak("Added to My Challenges.");
      await speakVerseMenuPrompt(
        pendingVerse!,
        pendingPracticeVerseIds && pendingPracticeVerseIds.length > 1
          ? chapterLabelFromVerse(pendingVerse!, pendingPracticeVerseIds.length)
          : undefined
      );
      setListening(true);
      return true;
    }
    return false;
  };

  if (pendingVerse) {
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
        pushPractice(router, spoken.verse.id, practiceSource);
      } else {
        const ids = spoken.verses.map((v) => v.id);
        pushPractice(router, spoken.verses[0].id, practiceSource, ids);
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
      setListening(true);
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

    await speak("Say practice, read, or add. Or say a new reference, like John 3 16.");
    setListening(true);
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
      setListening(true);
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
  setListening(true);
}

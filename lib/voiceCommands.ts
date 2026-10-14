export type VoiceIntent =
  | "begin"
  | "hint"
  | "again"
  | "tryMore"
  | "advance"
  | "next"
  | "home"
  | "repeat"
  | "practice"
  | "findVerse"
  | "today"
  | "levels"
  | "challenges"
  | "nextChallenge"
  | "handsFreeOff"
  | "restart"
  | "addVerse"
  | "settings"
  | "read"
  | "addToChallenges"
  | "continue"
  | "unknown";

const GLOBAL: { intent: VoiceIntent; phrases: string[] }[] = [
  { intent: "home", phrases: ["home", "go home", "done", "exit", "quit", "go back", "back", "stop", "cancel"] },
  { intent: "levels", phrases: ["levels", "go to levels"] },
  { intent: "nextChallenge", phrases: ["next challenge", "open next challenge"] },
  { intent: "challenges", phrases: ["my challenges", "challenges"] },
  { intent: "today", phrases: ["today's verse", "verse of the day", "todays verse"] },
  {
    intent: "handsFreeOff",
    phrases: [
      "hands free off",
      "hands-free off",
      "manual mode",
      "mic off",
      "microphone off",
      "turn off mic",
      "turn off microphone",
    ],
  },
  { intent: "findVerse", phrases: ["find verse", "search for verse", "verse that says"] },
  { intent: "addVerse", phrases: ["add verse", "add a verse"] },
  { intent: "settings", phrases: ["settings", "open settings", "go to settings"] },
];

const PRACTICE: { intent: VoiceIntent; phrases: string[] }[] = [
  { intent: "begin", phrases: ["begin", "ready", "go", "start"] },
  { intent: "hint", phrases: ["hint", "help", "next word"] },
  { intent: "again", phrases: ["try again", "again", "retry"] },
  { intent: "restart", phrases: ["restart", "start over"] },
  { intent: "tryMore", phrases: ["try more", "once more", "more"] },
  { intent: "advance", phrases: ["advance", "next challenge", "next verse", "next", "continue"] },
  { intent: "repeat", phrases: ["repeat", "read again", "say that again"] },
  { intent: "practice", phrases: ["practice", "start practice", "play", "play it", "lets play", "let's play"] },
  { intent: "home", phrases: ["home", "go home", "done", "exit", "quit", "go back", "back", "stop", "cancel"] },
];

/** Short bail-out utterances while reciting (not substring matches inside a verse). */
const PRACTICE_EXIT_EXACT = [
  "exit",
  "quit",
  "stop",
  "cancel",
  "done",
  "go back",
  "back",
  "go home",
  "home",
  "leave",
  "get out",
];

const PRACTICE_RESTART_EXACT = ["restart", "start over", "start again"];

export function isPracticeExitPhrase(text: string): boolean {
  const n = normalize(text);
  if (!n) return false;
  if (isPracticeRestartPhrase(n)) return false;
  for (const phrase of PRACTICE_EXIT_EXACT) {
    if (n === phrase || n === `${phrase} please`) return true;
  }
  const words = n.split(" ").filter(Boolean);
  if (words.length <= 4 && parsePracticeCommand(n) === "home") return true;
  return false;
}

export function isPracticeRestartPhrase(text: string): boolean {
  const n = normalize(text);
  if (!n) return false;
  for (const phrase of PRACTICE_RESTART_EXACT) {
    if (n === phrase || n === `${phrase} please`) return true;
  }
  if (parsePracticeCommand(n) === "restart") return true;
  return false;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\w\s']/g, " ").replace(/\s+/g, " ").trim();
}

const INTERRUPT_SPEECH_PHRASES = [
  "stop speaking",
  "stop reading",
  "stop talking",
  "be quiet",
  "quiet",
  "silence",
];

/** Stop TTS without leaving the screen. Bare "stop" only when `allowBareStop` (speech is playing). */
export function parseInterruptSpeechCommand(
  text: string,
  options?: { allowBareStop?: boolean }
): boolean {
  const n = normalize(text);
  if (!n) return false;
  for (const phrase of INTERRUPT_SPEECH_PHRASES) {
    if (n === phrase || n === `${phrase} please`) return true;
  }
  if (options?.allowBareStop && (n === "stop" || n === "stop please")) return true;
  return false;
}

function matchIntent(text: string, rules: { intent: VoiceIntent; phrases: string[] }[]): VoiceIntent {
  const n = normalize(text);
  for (const rule of rules) {
    for (const phrase of rule.phrases) {
      if (n === phrase) return rule.intent;
    }
  }
  const byPhraseLength = rules.flatMap((rule) => rule.phrases.map((phrase) => ({ rule, phrase })));
  byPhraseLength.sort((a, b) => b.phrase.length - a.phrase.length);
  for (const { rule, phrase } of byPhraseLength) {
    if (phrase.length >= 3 && n.includes(phrase)) return rule.intent;
  }
  for (const { rule, phrase } of byPhraseLength) {
    if (n.includes(phrase)) return rule.intent;
  }
  return "unknown";
}

const RESULT_HOME_PHRASES = [
  "done",
  "home",
  "exit",
  "quit",
  "finish",
  "go back",
  "back",
  "go home",
  "stop",
  "cancel",
  "leave",
];

/** Score screen: prefer exit phrases so "done" is not lost to "try more" / prompt echo. */
export function parsePracticeResultCommand(text: string): VoiceIntent {
  const n = normalize(text);
  if (!n) return "unknown";

  for (const phrase of RESULT_HOME_PHRASES) {
    if (n === phrase || n === `${phrase} please`) return "home";
  }
  if (/\bdone\b/.test(n) && !n.includes("try more")) return "home";

  if (n.includes("try again") || n === "again" || n === "retry") return "again";
  if (n === "restart" || n.includes("start over")) return "restart";
  if (n.includes("try more") || n === "once more" || n === "more") return "tryMore";
  if (
    n.includes("next challenge") ||
    n.includes("advance") ||
    n.includes("next verse") ||
    n === "next" ||
    n === "continue"
  ) {
    return "advance";
  }
  if (n.includes("repeat") || n.includes("read again") || n.includes("say that again")) {
    return "repeat";
  }

  return parseVoiceCommand(text);
}

export function parseGlobalCommand(text: string): VoiceIntent {
  const n = normalize(text);
  if (n.includes("next challenge") || n.includes("open next challenge")) {
    return "nextChallenge";
  }
  const intent = matchIntent(text, GLOBAL);
  if (intent === "challenges" && n.includes("next")) {
    return "nextChallenge";
  }
  return intent;
}

export function parsePracticeCommand(text: string): VoiceIntent {
  return matchIntent(text, PRACTICE);
}

/** Exact phrases only — avoids matching "practice john 3" via substring. */
const LEVELS_START_EXACT = new Set([
  "play",
  "play it",
  "lets play",
  "let's play",
  "start",
  "begin",
  "practice",
  "go",
  "ready",
  "next level",
  "start level",
  "speak this verse",
]);

/** Levels tab: start the next level verse when the user did not name a reference. */
export function isBareLevelsStartCommand(text: string): boolean {
  const n = normalize(text);
  return LEVELS_START_EXACT.has(n);
}

/** Practice screen: practice intents first, then global navigation. */
export function parseVoiceCommand(text: string): VoiceIntent {
  const practice = parsePracticeCommand(text);
  if (practice !== "unknown") return practice;
  return parseGlobalCommand(text);
}

const VERSE_MENU: { intent: VoiceIntent; phrases: string[] }[] = [
  { intent: "practice", phrases: ["practice", "start practice", "speak it", "recite", "speak"] },
  { intent: "read", phrases: ["read", "read it", "read verse", "read aloud", "read the verse"] },
  {
    intent: "addToChallenges",
    phrases: ["add", "add it", "add to challenges", "save", "save it", "add challenge"],
  },
];

export function parseVerseMenuCommand(text: string): VoiceIntent {
  return matchIntent(text, VERSE_MENU);
}

/** Exact menu phrases only (e.g. "read") — avoids "read john 3 16" matching via substring. */
/** After a verse is loaded (e.g. read aloud), step to adjacent verse. */
export function parseVerseStepCommand(text: string): "next" | "previous" | null {
  const n = normalize(text);
  if (!n) return null;
  if (n === "next" || n === "next verse" || n === "next please") return "next";
  if (
    n === "last" ||
    n === "last verse" ||
    n === "previous" ||
    n === "previous verse" ||
    n === "prior" ||
    n === "prior verse"
  ) {
    return "previous";
  }
  return null;
}

export function parseStrictVerseMenuCommand(text: string): VoiceIntent {
  const n = normalize(text);
  if (!n) return "unknown";
  for (const rule of VERSE_MENU) {
    for (const phrase of rule.phrases) {
      if (n === phrase || n === `${phrase} please`) return rule.intent;
    }
  }
  if (n === "red" || n === "reed") return "read";
  return "unknown";
}

export function extractFindVerseQuery(text: string): string {
  const n = normalize(text);
  const prefixes = ["find verse", "search for verse", "verse that says", "verse about"];
  for (const p of prefixes) {
    const idx = n.indexOf(p);
    if (idx >= 0) return n.slice(idx + p.length).trim();
  }
  return n;
}

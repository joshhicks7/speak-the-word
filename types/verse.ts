export type GameVerse = {
  id: string;
  reference: string;
  text: string;
  isCompleted: boolean;
  isFavorite: boolean;
  book: number;
  verse: number;
  chapter: number;
  /** Unix seconds when this verse was first marked complete. */
  completedAt: number | null;
  /** Duration, in seconds, from the latest completing attempt. */
  completionDurationSeconds: number | null;
  /** Percentage (0–100) from last challenge attempt; set on complete or any attempt */
  completionScore: number | null;
};

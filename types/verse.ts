export type GameVerse = {
  id: string;
  reference: string;
  text: string;
  isCompleted: boolean;
  isFavorite: boolean;
  book: number;
  verse: number;
  chapter: number;
  completionTime: number | null;
  /** Percentage (0–100) from last challenge attempt; set on complete or any attempt */
  completionScore: number | null;
};

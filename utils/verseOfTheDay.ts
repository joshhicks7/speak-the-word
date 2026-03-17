import AsyncStorage from "@react-native-async-storage/async-storage";

export const getVerseOfTheDayKey = (date: string) => `verse-of-day-${date}`;

export const getTodayDate = (): string => {
  return new Date().toISOString().split("T")[0];
};

export const getStoredVerseOfTheDay = async (date: string): Promise<{ verseId: string; date: string } | null> => {
  try {
    const key = getVerseOfTheDayKey(date);
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const setVerseOfTheDay = async (date: string, verseId: string): Promise<void> => {
  await AsyncStorage.setItem(
    getVerseOfTheDayKey(date),
    JSON.stringify({ verseId, date })
  );
};

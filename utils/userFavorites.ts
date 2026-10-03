import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "speak-user-favorite-verse-ids";
const MIGRATED_KEY = "speak-user-favorite-ids-migrated-v1";

export async function getUserFavoriteIds(): Promise<Set<string>> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

async function persist(ids: Set<string>): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify([...ids]));
}

export async function addUserFavoriteIds(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const set = await getUserFavoriteIds();
  for (const id of ids) set.add(id);
  await persist(set);
}

export async function removeUserFavoriteIds(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const set = await getUserFavoriteIds();
  for (const id of ids) set.delete(id);
  await persist(set);
}

/** One-time: treat existing non–starter-default favorites as user-added. */
export async function migrateLegacyUserFavorites(
  verseIdsNotInStarterDefaults: string[]
): Promise<void> {
  if (verseIdsNotInStarterDefaults.length === 0) return;
  const done = await AsyncStorage.getItem(MIGRATED_KEY);
  if (done === "1") return;
  await addUserFavoriteIds(verseIdsNotInStarterDefaults);
  await AsyncStorage.setItem(MIGRATED_KEY, "1");
}

import AsyncStorage from "@react-native-async-storage/async-storage";

const TUTORIAL_DONE_KEY = "speak-to-me-tutorial-done";

export async function hasSeenTutorial(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(TUTORIAL_DONE_KEY);
    return value === "true";
  } catch {
    return false;
  }
}

export async function setTutorialDone(): Promise<void> {
  await AsyncStorage.setItem(TUTORIAL_DONE_KEY, "true");
}

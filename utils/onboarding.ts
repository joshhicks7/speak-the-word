import AsyncStorage from "@react-native-async-storage/async-storage";

const TUTORIAL_DONE_KEY = "speak-to-me-tutorial-done";
const WELCOME_DONE_KEY = "speak-welcome-done";

export async function hasSeenTutorial(): Promise<boolean> {
  try {
    const welcome = await AsyncStorage.getItem(WELCOME_DONE_KEY);
    if (welcome === "true") return true;
    const value = await AsyncStorage.getItem(TUTORIAL_DONE_KEY);
    return value === "true";
  } catch {
    return false;
  }
}

export async function setTutorialDone(): Promise<void> {
  await AsyncStorage.setItem(TUTORIAL_DONE_KEY, "true");
}

export async function hasSeenWelcome(): Promise<boolean> {
  try {
    const welcome = await AsyncStorage.getItem(WELCOME_DONE_KEY);
    if (welcome === "true") return true;
    return hasSeenTutorial();
  } catch {
    return false;
  }
}

export async function setWelcomeComplete(): Promise<void> {
  await AsyncStorage.multiSet([
    [WELCOME_DONE_KEY, "true"],
    [TUTORIAL_DONE_KEY, "true"],
  ]);
}

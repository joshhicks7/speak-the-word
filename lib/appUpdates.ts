import * as Updates from "expo-updates";

/** Check Expo for a newer JS bundle and reload if one is available (store builds only). */
export async function applyAvailableUpdateIfAny(): Promise<void> {
  if (__DEV__ || !Updates.isEnabled) return;
  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) return;
    await Updates.fetchUpdateAsync();
    await Updates.reloadAsync();
  } catch {
    // Offline, misconfigured channel/runtime, or updates disabled in this binary.
  }
}

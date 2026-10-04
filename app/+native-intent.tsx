import { APP_SCHEME } from "../constants/deepLinking";

/**
 * Rewrites incoming native URLs to Expo Router paths.
 * @see https://docs.expo.dev/router/advanced/native-intent/
 */
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}): string {
  try {
    let routePath = path.trim();
    if (!routePath) return "/(tabs)";

    if (routePath.includes("://")) {
      const url = new URL(routePath, `${APP_SCHEME}://`);
      routePath = `${url.pathname}${url.search}`.replace(/^\/+/, "");
    } else {
      routePath = routePath.replace(/^\/+/, "");
    }

    const pathOnly = routePath.split("?")[0] ?? routePath;

    const verseMatch = pathOnly.match(/^verse\/(\d+)\/(\d+)\/(\d+)$/);
    if (verseMatch) {
      const [, book, chapter, verse] = verseMatch;
      return `/open?book=${book}&chapter=${chapter}&verse=${verse}`;
    }

    const practiceMatch = pathOnly.match(/^practice\/(\d+)\/(\d+)\/(\d+)$/);
    if (practiceMatch) {
      const [, book, chapter, verse] = practiceMatch;
      return `/open?book=${book}&chapter=${chapter}&verse=${verse}&practice=1`;
    }

    // Route through app/index so first-time welcome is not skipped.
    if (pathOnly === "home" || pathOnly === "") {
      return "/";
    }
    if (pathOnly === "challenges") {
      return "/(tabs)/practice";
    }
    if (pathOnly === "levels") {
      return "/(tabs)/levels";
    }

    return routePath.startsWith("/") ? routePath : `/${routePath}`;
  } catch {
    return "/";
  }
}

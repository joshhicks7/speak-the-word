import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect } from "react";
import { ActivityIndicator, View, StyleSheet } from "react-native";
import { useThemeColors } from "../constants/theme";
import { getVerseByBookChapterVerse } from "../database/queries";

type OpenParams = {
  verseId?: string;
  book?: string;
  chapter?: string;
  verse?: string;
  practice?: string;
  tab?: string;
};

export default function OpenDeepLinkScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const params = useLocalSearchParams<OpenParams>();

  useEffect(() => {
    void (async () => {
      const tab = typeof params.tab === "string" ? params.tab : undefined;
      if (tab === "levels") {
        router.replace("/(tabs)/levels");
        return;
      }
      if (tab === "challenges" || tab === "practice") {
        router.replace("/(tabs)/practice");
        return;
      }
      if (tab === "settings") {
        router.replace("/settings");
        return;
      }
      if (tab === "home") {
        router.replace("/(tabs)");
        return;
      }

      const verseId = typeof params.verseId === "string" ? params.verseId : undefined;
      if (verseId) {
        router.replace({
          pathname: "/practice-game",
          params: { verseId, mode: "speech", source: "deeplink" },
        });
        return;
      }

      const book = parseInt(typeof params.book === "string" ? params.book : "", 10);
      const chapter = parseInt(typeof params.chapter === "string" ? params.chapter : "", 10);
      const verse = parseInt(typeof params.verse === "string" ? params.verse : "", 10);
      if (Number.isFinite(book) && Number.isFinite(chapter) && Number.isFinite(verse)) {
        const found = await getVerseByBookChapterVerse(book, chapter, verse);
        if (found) {
          router.replace({
            pathname: "/practice-game",
            params: { verseId: found.id, mode: "speech", source: "deeplink" },
          });
          return;
        }
      }

      router.replace("/(tabs)");
    })();
  }, [params, router]);

  return (
    <View style={[styles.centered, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
});

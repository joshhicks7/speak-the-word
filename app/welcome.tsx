import { useRouter } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WelcomeSlide } from "../components/WelcomeSlide";
import { useThemeColors, type ThemeColors } from "../constants/theme";
import { getVerseByBookChapterVerse } from "../database/queries";

const DEMO_BOOK = 19;
const DEMO_CHAPTER = 119;
const DEMO_VERSE = 11;

const SLIDES = [
  {
    title: "Welcome to Speak the Word",
    body: "Memorize Scripture by speaking it aloud. The goal is hiding God's Word in your heart—not just a score.",
    icon: "book" as const,
  },
  {
    title: "How practice works",
    body: "Preview the verse, speak it from memory—the app listens and knows when you're done. No start/stop button.",
    icon: "mic" as const,
  },
  {
    title: "Manual & Hands-Free",
    body: "Manual mode: read on screen, tap Speak the Word, then talk. Hands-Free mode: the app reads the verse, cues you with a tone, and listens automatically.",
    icon: "headset" as const,
  },
  {
    title: "Explore the app",
    body: "Home—Verse of the Day. Levels—short verses in order. My Challenges—verses you choose.",
    icon: "compass" as const,
  },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList>(null);
  const width = Dimensions.get("window").width;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index) setIndex(i);
  };

  const goDemo = async () => {
    const verse = await getVerseByBookChapterVerse(DEMO_BOOK, DEMO_CHAPTER, DEMO_VERSE);
    if (!verse) {
      router.replace("/(tabs)");
      return;
    }
    router.replace({
      pathname: "/practice-game",
      params: {
        verseId: verse.id,
        mode: "speech",
        source: "welcome-demo",
      },
    });
  };

  const skip = () => void goDemo();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      <Pressable onPress={skip} style={styles.skip} accessibilityRole="button">
        <Text style={[styles.skipText, { color: colors.textMuted }]}>Skip</Text>
      </Pressable>
      <FlatList
        ref={listRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <View style={{ width }}>
            <WelcomeSlide title={item.title} body={item.body} icon={item.icon} colors={colors} />
          </View>
        )}
      />
      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, { backgroundColor: i === index ? colors.primary : colors.border }]}
          />
        ))}
      </View>
      {index < SLIDES.length - 1 ? (
        <Pressable
          style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.9 : 1 }]}
          onPress={() => listRef.current?.scrollToIndex({ index: index + 1, animated: true })}
        >
          <Text style={styles.primaryBtnText}>Next</Text>
        </Pressable>
      ) : (
        <Pressable
          style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.9 : 1 }]}
          onPress={() => void goDemo()}
        >
          <Text style={styles.primaryBtnText}>Try it now</Text>
        </Pressable>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    skip: { alignSelf: "flex-end", paddingHorizontal: 20, paddingVertical: 8 },
    skipText: { fontSize: 16 },
    dots: { flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 20 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    primaryBtn: {
      marginHorizontal: 24,
      paddingVertical: 16,
      borderRadius: 14,
      alignItems: "center",
    },
    primaryBtnText: { color: colors.primaryText, fontSize: 17, fontWeight: "600" },
  });
}

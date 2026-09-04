import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors, type ThemeColors } from "../../constants/theme";
import { getFavoriteVerses, getVerseByBookChapterVerse, setFavorite } from "../../database/queries";
import {
  groupFavoriteVersesIntoChallenges,
  getChallengeReference,
  getChallengePreview,
  getChallengeScore,
  isChallengeCompleted,
  getChallengeVerseIds,
  getChallengeFirstVerse,
  type ChallengeItem,
} from "../../utils/challengeRanges";

type CompletionFilter = "all" | "completed" | "not_completed";

const JESUS_STARTERS = [
  { label: "John 3:16", book: 43, chapter: 3, verse: 16 },
  { label: "John 14:6", book: 43, chapter: 14, verse: 6 },
  { label: "Romans 10:9", book: 45, chapter: 10, verse: 9 },
] as const;

export default function PracticeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [challenges, setChallenges] = useState<ChallengeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [completionFilter, setCompletionFilter] = useState<CompletionFilter>("all");
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [openingStarter, setOpeningStarter] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const list = await getFavoriteVerses();
    setChallenges(groupFavoriteVersesIntoChallenges(list));
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleRemove = useCallback(
    (item: ChallengeItem) => {
      const ref = getChallengeReference(item);
      const ids = getChallengeVerseIds(item);
      Alert.alert(
        "Remove this verse?",
        `Remove "${ref}" from My Challenges?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: async () => {
              for (const id of ids) await setFavorite(id, false);
              load();
            },
          },
        ]
      );
    },
    [load]
  );

  const startJesusVerse = useCallback(
    async (book: number, chapter: number, verse: number) => {
      if (openingStarter) return;
      setOpeningStarter(true);
      try {
        const found = await getVerseByBookChapterVerse(book, chapter, verse);
        if (!found) {
          Alert.alert("Verse unavailable", "We couldn't open that verse. Try adding one instead.");
          return;
        }
        await setFavorite(found.id, true);
        router.push({
          pathname: "/practice-game",
          params: { verseId: found.id, mode: "speech" },
        });
      } catch {
        Alert.alert("Something went wrong", "Please try again.");
      } finally {
        setOpeningStarter(false);
      }
    },
    [openingStarter, router]
  );

  const filteredChallenges = useMemo(() => {
    let list = challenges;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((item) => {
        const ref = getChallengeReference(item).toLowerCase();
        const preview = getChallengePreview(item).toLowerCase();
        return ref.includes(q) || preview.includes(q);
      });
    }
    if (completionFilter === "completed") {
      list = list.filter((item) => isChallengeCompleted(item));
    } else if (completionFilter === "not_completed") {
      list = list.filter((item) => !isChallengeCompleted(item));
    }
    return list;
  }, [challenges, searchQuery, completionFilter]);

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <Text style={styles.title}>My Challenges</Text>
        <Text style={styles.subtitle}>Your verses. Tap one to speak it.</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push("/add-to-challenges")}
          accessibilityRole="button"
          accessibilityLabel="Add a verse"
        >
          <Ionicons name="add" size={18} color={colors.primary} />
          <Text style={styles.addBtnText}>Add a verse</Text>
        </TouchableOpacity>
        {challenges.length > 0 && (
          <View style={styles.searchRow}>
            <TextInput
              style={[styles.searchInput, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder, color: colors.text }]}
              placeholder="Search by verse text or reference..."
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              clearButtonMode="while-editing"
              spellCheck={false}
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.filterBtn, { backgroundColor: completionFilter !== "all" ? colors.primary + "20" : colors.surface, borderColor: colors.surfaceBorder }]}
              onPress={() => setFilterSheetVisible(true)}
            >
              <Ionicons name="filter" size={22} color={completionFilter !== "all" ? colors.primary : colors.textMuted} />
            </TouchableOpacity>
          </View>
        )}
      </View>
      <Modal visible={filterSheetVisible} transparent animationType="slide">
        <Pressable style={styles.sheetBackdrop} onPress={() => setFilterSheetVisible(false)}>
          <Pressable style={[styles.sheetContent, { backgroundColor: colors.surface }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Filter by completion</Text>
            {(["all", "completed", "not_completed"] as const).map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[styles.sheetOption, completionFilter === opt && { backgroundColor: colors.primary + "18" }]}
                onPress={() => {
                  setCompletionFilter(opt);
                  setFilterSheetVisible(false);
                }}
              >
                <Text style={[styles.sheetOptionText, { color: colors.text }]}>
                  {opt === "all" ? "All" : opt === "completed" ? "Completed" : "Still practicing"}
                </Text>
                {completionFilter === opt && <Ionicons name="checkmark" size={20} color={colors.primary} />}
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
      {challenges.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons name="heart" size={22} color={colors.primary} />
          </View>
          <Text style={styles.emptyText}>Start with a verse about Jesus</Text>
          <Text style={styles.emptyHint}>Pick one to speak, or add any verse you want.</Text>
          <View style={styles.starterList}>
            {JESUS_STARTERS.map((starter) => (
              <Pressable
                key={starter.label}
                style={({ pressed }) => [
                  styles.starterBtn,
                  { opacity: openingStarter ? colors.disabledOpacity : pressed ? 0.85 : 1 },
                ]}
                onPress={() => startJesusVerse(starter.book, starter.chapter, starter.verse)}
                disabled={openingStarter}
                accessibilityRole="button"
                accessibilityLabel={`Speak ${starter.label}`}
              >
                <Text style={styles.starterBtnText}>{starter.label}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.primary} />
              </Pressable>
            ))}
          </View>
        </View>
      ) : filteredChallenges.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="search-outline" size={40} color={colors.textMuted} />
          <Text style={styles.emptyText}>Nothing matches</Text>
          <Text style={styles.emptyHint}>Try a different search or filter.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredChallenges}
          keyExtractor={(item) =>
            item.type === "single" ? item.verse.id : item.verses.map((v) => v.id).join(",")
          }
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const ref = getChallengeReference(item);
            const score = getChallengeScore(item);
            const completed = isChallengeCompleted(item);
            const verseIds = getChallengeVerseIds(item);
            const firstVerse = getChallengeFirstVerse(item);
            return (
              <TouchableOpacity
                style={[styles.card, completed && styles.cardDone]}
                onPress={() =>
                  router.push({
                    pathname: "/practice-game",
                    params: {
                      verseId: firstVerse.id,
                      mode: "speech",
                      verseIds: verseIds.join(","),
                      currentIndex: "0",
                    },
                  })
                }
                onLongPress={() => handleRemove(item)}
                delayLongPress={400}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`${ref}. ${completed ? "Speak again" : "Practice"}`}
                accessibilityHint="Long press to remove"
              >
                <View style={styles.cardTop}>
                  <Text style={styles.ref}>{ref}</Text>
                  <View style={styles.badgeRow}>
                    {score != null && (
                      <Text style={[styles.scoreBadge, completed && styles.scoreBadgeDone]}>{score}%</Text>
                    )}
                    {completed && (
                      <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                    )}
                  </View>
                </View>
                <Text style={styles.preview} numberOfLines={2}>
                  {getChallengePreview(item)}
                </Text>
                <View style={styles.ctaRow}>
                  <Text style={styles.cta}>{completed ? "Speak again" : "Practice"}</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.primary} />
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, justifyContent: "center", alignItems: "center" },
    header: { paddingHorizontal: 20, paddingBottom: 12 },
    title: { fontSize: 26, fontWeight: "700", color: colors.text },
    subtitle: { fontSize: 15, color: colors.textMuted, lineHeight: 22, marginTop: 6, marginBottom: 14 },
    addBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      alignSelf: "flex-start",
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 20,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    addBtnText: { fontSize: 14, fontWeight: "600", color: colors.primary },
    searchRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 },
    searchInput: {
      flex: 1,
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 15,
    },
    filterBtn: {
      width: 44,
      height: 44,
      borderRadius: 10,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    sheetBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.4)",
      justifyContent: "flex-end",
    },
    sheetContent: {
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 34,
    },
    sheetHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.textMuted,
      opacity: 0.5,
      alignSelf: "center",
      marginBottom: 20,
    },
    sheetTitle: { fontSize: 18, fontWeight: "700", marginBottom: 12 },
    sheetOption: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 12,
      marginBottom: 8,
    },
    sheetOptionText: { fontSize: 16 },
    list: { padding: 20, paddingTop: 8, paddingBottom: 40 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 18,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
      borderLeftWidth: 4,
      borderLeftColor: colors.primary,
    },
    cardDone: {
      borderLeftColor: colors.success,
    },
    cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
    ref: { fontSize: 15, fontWeight: "600", color: colors.primary, flex: 1, marginRight: 8 },
    badgeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    scoreBadge: { fontSize: 13, fontWeight: "600", color: colors.textMuted },
    scoreBadgeDone: { color: colors.successText },
    preview: { fontSize: 14, color: colors.textMuted, lineHeight: 20, marginBottom: 12 },
    ctaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    cta: { fontSize: 14, color: colors.primary, fontWeight: "500" },
    empty: { flex: 1, justifyContent: "center", alignItems: "center", padding: 28 },
    emptyIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    emptyText: { fontSize: 18, fontWeight: "700", color: colors.text, marginTop: 16, textAlign: "center" },
    emptyHint: { fontSize: 14, color: colors.textMuted, marginTop: 6, textAlign: "center", lineHeight: 20 },
    starterList: { width: "100%", maxWidth: 320, marginTop: 20, gap: 10 },
    starterBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.surface,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    starterBtnText: { fontSize: 16, fontWeight: "600", color: colors.text },
  });
}

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
import { useThemeColors, type ThemeColors } from "../../constants/theme";
import { getFavoriteVerses, setFavorite } from "../../database/queries";
import type { GameVerse } from "../../types/verse";
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

export default function PracticeScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [challenges, setChallenges] = useState<ChallengeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [completionFilter, setCompletionFilter] = useState<CompletionFilter>("all");
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);

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
        "Remove from challenges",
        `Are you sure you want to remove "${ref}" from your challenges?`,
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
      <View style={styles.header}>
        <Text style={styles.title}>My Challenges</Text>
        <Text style={styles.subtitle}>
          Verses you're working on. Tap to practice by speech or type.
        </Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push("/add-to-challenges")}
        >
          <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
          <Text style={styles.addBtnText}>Add verse or chapter</Text>
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
                  {opt === "all" ? "All" : opt === "completed" ? "Completed only" : "Not completed only"}
                </Text>
                {completionFilter === opt && <Ionicons name="checkmark" size={20} color={colors.primary} />}
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
      {challenges.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="book-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyText}>No verses in your list yet.</Text>
          <Text style={styles.emptyHint}>Default favorites are loaded from the app.</Text>
        </View>
      ) : filteredChallenges.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="search-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyText}>No challenges match your filters.</Text>
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
                style={styles.card}
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
                activeOpacity={0.8}
              >
                <View style={styles.cardTop}>
                  <Text style={styles.ref}>{ref}</Text>
                  <View style={styles.badgeRow}>
                    {score != null && (
                      <Text style={styles.scoreBadge}>{score}%</Text>
                    )}
                    {completed && (
                      <View style={styles.badge}>
                        <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                      </View>
                    )}
                    <TouchableOpacity
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      onPress={() => handleRemove(item)}
                      style={styles.removeBtn}
                    >
                      <Ionicons name="trash-outline" size={20} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                </View>
                <Text style={styles.preview} numberOfLines={2}>
                  {getChallengePreview(item)}
                </Text>
                <View style={styles.ctaRow}>
                  <Text style={styles.cta}>Practice</Text>
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
    header: { padding: 20, paddingBottom: 12 },
    title: { fontSize: 26, fontWeight: "700", color: colors.text, marginBottom: 6 },
    subtitle: { fontSize: 14, color: colors.textMuted, lineHeight: 20, marginBottom: 14 },
    addBtn: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start" },
    addBtnText: { fontSize: 15, color: colors.primary, fontWeight: "600" },
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
    },
    cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
    ref: { fontSize: 15, fontWeight: "600", color: colors.primary },
    badgeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    scoreBadge: { fontSize: 13, fontWeight: "600", color: colors.textMuted },
    badge: {},
    removeBtn: { padding: 4 },
    preview: { fontSize: 14, color: colors.textMuted, lineHeight: 20, marginBottom: 12 },
    ctaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    cta: { fontSize: 14, color: colors.primary, fontWeight: "500" },
    empty: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
    emptyText: { fontSize: 16, color: colors.textMuted, marginTop: 12 },
    emptyHint: { fontSize: 13, color: colors.textMuted, marginTop: 6 },
  });
}

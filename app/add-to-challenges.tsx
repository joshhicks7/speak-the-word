import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  ScrollView,
  Alert,
  Pressable,
  TextInput,
} from "react-native";
import { useThemeColors, type ThemeColors } from "../constants/theme";
import {
  getBooks,
  getChaptersForBook,
  getVersesByChapter,
  toggleFavorite,
  setChapterFavorites,
  setRangeFavorites,
  setFavorite,
  type BibleBook,
  type VersePosition,
  searchVersesByText,
} from "../database/queries";
import type { GameVerse } from "../types/verse";

function toPos(v: GameVerse): VersePosition {
  return { book: v.book, chapter: v.chapter, verse: v.verse };
}

function comparePos(a: VersePosition, b: VersePosition): number {
  if (a.book !== b.book) return a.book - b.book;
  if (a.chapter !== b.chapter) return a.chapter - b.chapter;
  return a.verse - b.verse;
}

function orderedRange(a: VersePosition, b: VersePosition): { start: VersePosition; end: VersePosition } {
  return comparePos(a, b) <= 0 ? { start: a, end: b } : { start: b, end: a };
}

function formatPos(pos: VersePosition, books: BibleBook[]): string {
  const name = books.find((b) => b.book === pos.book)?.book_name ?? "";
  return `${name} ${pos.chapter}:${pos.verse}`;
}

function isInSelectedRange(
  v: GameVerse,
  start: VersePosition | null,
  end: VersePosition | null
): boolean {
  if (!start) return false;
  const p = toPos(v);
  if (!end) return comparePos(p, start) === 0;
  const { start: s, end: e } = orderedRange(start, end);
  return comparePos(p, s) >= 0 && comparePos(p, e) <= 0;
}

export default function AddToChallengesScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [books, setBooks] = useState<BibleBook[]>([]);
  const [chapters, setChapters] = useState<number[]>([]);
  const [verses, setVerses] = useState<GameVerse[]>([]);
  const [selectedBook, setSelectedBook] = useState<BibleBook | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [loadingVerses, setLoadingVerses] = useState(false);
  const [rangeMode, setRangeMode] = useState(false);
  const [rangeStart, setRangeStart] = useState<VersePosition | null>(null);
  const [rangeEnd, setRangeEnd] = useState<VersePosition | null>(null);
  const [savingRange, setSavingRange] = useState(false);
  const [verseSearch, setVerseSearch] = useState("");
  const [verseSearchResults, setVerseSearchResults] = useState<GameVerse[]>([]);
  const [verseSearchLoading, setVerseSearchLoading] = useState(false);

  useEffect(() => {
    const q = verseSearch.trim();
    if (q.length < 2) {
      setVerseSearchResults([]);
      setVerseSearchLoading(false);
      return;
    }
    let cancelled = false;
    setVerseSearchLoading(true);
    const timer = setTimeout(() => {
      void searchVersesByText(q, 30).then((rows) => {
        if (!cancelled) {
          setVerseSearchResults(rows);
          setVerseSearchLoading(false);
        }
      });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [verseSearch]);

  useEffect(() => {
    let cancelled = false;
    getBooks().then((b) => {
      if (!cancelled) setBooks(b);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const clearRange = useCallback(() => {
    setRangeMode(false);
    setRangeStart(null);
    setRangeEnd(null);
  }, []);

  const onSelectBook = useCallback((book: BibleBook) => {
    setSelectedBook(book);
    setSelectedChapter(null);
    setVerses([]);
    clearRange();
    setLoadingChapters(true);
    getChaptersForBook(book.book).then((ch) => {
      setChapters(ch);
      setLoadingChapters(false);
    });
  }, [clearRange]);

  const onSelectChapter = useCallback((chapter: number) => {
    if (!selectedBook) return;
    setSelectedChapter(chapter);
    setLoadingVerses(true);
    getVersesByChapter(selectedBook.book, chapter).then((v) => {
      setVerses(v);
      setLoadingVerses(false);
    });
  }, [selectedBook]);

  const onToggleVerse = useCallback(async (id: string) => {
    await toggleFavorite(id);
    if (selectedBook !== null && selectedChapter !== null) {
      const updated = await getVersesByChapter(selectedBook.book, selectedChapter);
      setVerses(updated);
    }
  }, [selectedBook, selectedChapter]);

  const onAddEntireChapter = useCallback(async () => {
    if (selectedBook === null || selectedChapter === null) return;
    await setChapterFavorites(selectedBook.book, selectedChapter, true);
    const updated = await getVersesByChapter(selectedBook.book, selectedChapter);
    setVerses(updated);
  }, [selectedBook, selectedChapter]);

  const onAddRange = useCallback(async () => {
    if (!rangeStart || !rangeEnd) return;
    const { start, end } = orderedRange(rangeStart, rangeEnd);
    setSavingRange(true);
    try {
      await setRangeFavorites(start, end, true);
      if (selectedBook !== null && selectedChapter !== null) {
        const updated = await getVersesByChapter(selectedBook.book, selectedChapter);
        setVerses(updated);
      }
      clearRange();
    } catch {
      Alert.alert("Couldn't add that passage", "Please try again.");
    } finally {
      setSavingRange(false);
    }
  }, [rangeStart, rangeEnd, selectedBook, selectedChapter, clearRange]);

  const onPickRangeVerse = useCallback((v: GameVerse) => {
    const pos = toPos(v);
    if (!rangeStart) {
      setRangeStart(pos);
      return;
    }
    setRangeEnd(pos);
  }, [rangeStart]);

  const goBack = useCallback(() => {
    if (selectedChapter !== null) {
      setSelectedChapter(null);
      setVerses([]);
    } else if (selectedBook !== null) {
      setSelectedBook(null);
      setChapters([]);
      clearRange();
    } else {
      router.back();
    }
  }, [selectedBook, selectedChapter, router, clearRange]);

  const currentChapterIndex = selectedBook && selectedChapter !== null ? chapters.indexOf(selectedChapter) : -1;
  const hasPrevChapter = currentChapterIndex > 0;
  const hasNextChapter = currentChapterIndex >= 0 && currentChapterIndex < chapters.length - 1;

  const goToPrevChapter = useCallback(() => {
    if (!hasPrevChapter || !selectedBook) return;
    const prevChapter = chapters[currentChapterIndex - 1];
    onSelectChapter(prevChapter);
  }, [hasPrevChapter, selectedBook, chapters, currentChapterIndex, onSelectChapter]);

  const goToNextChapter = useCallback(() => {
    if (!hasNextChapter || !selectedBook) return;
    const nextChapter = chapters[currentChapterIndex + 1];
    onSelectChapter(nextChapter);
  }, [hasNextChapter, selectedBook, chapters, currentChapterIndex, onSelectChapter]);

  const openPractice = useCallback(
    (id: string) => {
      router.push({ pathname: "/practice-game", params: { verseId: id, mode: "speech" } });
    },
    [router]
  );

  const addVerseToChallenges = useCallback(async (v: GameVerse) => {
    await setFavorite(v.id, true);
    setVerseSearchResults((prev) =>
      prev.map((row) => (row.id === v.id ? { ...row, isFavorite: true } : row))
    );
  }, []);

  const searchActive = selectedBook === null && verseSearch.trim().length >= 2;

  const searchHeader = (
    <View style={styles.searchBlock}>
      <TextInput
        style={[styles.searchInput, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder, color: colors.text }]}
        placeholder="Search verse text…"
        placeholderTextColor={colors.textMuted}
        value={verseSearch}
        onChangeText={setVerseSearch}
        autoCorrect={false}
        spellCheck={false}
        clearButtonMode="while-editing"
        accessibilityLabel="Search verse text"
      />
      {verseSearchLoading ? (
        <ActivityIndicator size="small" color={colors.primary} style={styles.searchSpinner} />
      ) : null}
      {searchActive && !verseSearchLoading && verseSearchResults.length === 0 ? (
        <Text style={styles.searchEmpty}>No verses match. Try different words.</Text>
      ) : null}
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.breadcrumb}>
        <TouchableOpacity onPress={goBack} style={styles.breadcrumbBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
          <Text style={styles.breadcrumbText}>
            {selectedChapter !== null
              ? `${selectedBook?.book_name} ${selectedChapter}`
              : selectedBook
                ? selectedBook.book_name
                : "Books"}
          </Text>
        </TouchableOpacity>
      </View>

      {selectedBook === null ? (
        searchActive ? (
          <FlatList
            data={verseSearchResults}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            ListHeaderComponent={searchHeader}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <View style={styles.searchResultRow}>
                <View style={styles.verseInfo}>
                  <Text style={styles.verseRef}>{item.reference}</Text>
                  <Text style={styles.verseText} numberOfLines={3}>
                    {item.text}
                  </Text>
                </View>
                <View style={styles.searchActions}>
                  <TouchableOpacity
                    style={styles.searchActionBtn}
                    onPress={() => openPractice(item.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Practice ${item.reference}`}
                  >
                    <Text style={styles.searchActionText}>Practice</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.searchActionBtn, item.isFavorite && styles.searchActionBtnDone]}
                    onPress={() => void addVerseToChallenges(item)}
                    disabled={item.isFavorite}
                    accessibilityRole="button"
                    accessibilityLabel={item.isFavorite ? "Already in challenges" : `Add ${item.reference}`}
                  >
                    <Text style={styles.searchActionText}>{item.isFavorite ? "Added" : "Add"}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
        ) : (
          <FlatList
            data={books}
            keyExtractor={(item) => String(item.book)}
            contentContainerStyle={styles.list}
            ListHeaderComponent={
              <View>
                {searchHeader}
                <Text style={styles.listHint}>Pick a book, or add a longer passage.</Text>
                <TouchableOpacity
                  style={styles.addRangeBtn}
                  onPress={() => router.push("/add-range")}
                  accessibilityRole="button"
                  accessibilityLabel="Add a passage"
                >
                  <Ionicons name="book-outline" size={22} color={colors.primary} />
                  <Text style={styles.addRangeText}>Add a passage</Text>
                </TouchableOpacity>
              </View>
            }
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.row}
                onPress={() => onSelectBook(item)}
                activeOpacity={0.7}
              >
                <Text style={styles.rowTitle}>{item.book_name}</Text>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          />
        )
      ) : selectedChapter === null ? (
        <>
          {loadingChapters ? (
            <View style={[styles.centered, { backgroundColor: colors.background }]}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <FlatList
              data={chapters}
              keyExtractor={(item) => String(item)}
              contentContainerStyle={styles.list}
              ListHeaderComponent={
                rangeMode && rangeStart ? (
                  <Text style={styles.rangeHint}>
                    {formatPos(rangeStart, books)} selected. Open the chapter for the last verse.
                  </Text>
                ) : null
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => onSelectChapter(item)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.rowTitle}>Chapter {item}</Text>
                  <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            />
          )}
        </>
      ) : (
        <>
          {loadingVerses ? (
            <View style={[styles.centered, { backgroundColor: colors.background }]}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <>
              <View style={styles.chapterNav}>
                <TouchableOpacity
                  style={[styles.chapterNavBtn, !hasPrevChapter && styles.chapterNavBtnDisabled]}
                  onPress={goToPrevChapter}
                  disabled={!hasPrevChapter}
                >
                  <Ionicons name="chevron-back" size={22} color={hasPrevChapter ? colors.primary : colors.textMuted} />
                  <Text style={[styles.chapterNavBtnText, !hasPrevChapter && styles.chapterNavBtnTextDisabled]}>
                    Previous
                  </Text>
                </TouchableOpacity>
                <Text style={styles.chapterNavTitle} numberOfLines={1}>
                  {selectedBook?.book_name} {selectedChapter}
                </Text>
                <TouchableOpacity
                  style={[styles.chapterNavBtn, !hasNextChapter && styles.chapterNavBtnDisabled]}
                  onPress={goToNextChapter}
                  disabled={!hasNextChapter}
                >
                  <Text style={[styles.chapterNavBtnText, !hasNextChapter && styles.chapterNavBtnTextDisabled]}>
                    Next
                  </Text>
                  <Ionicons name="chevron-forward" size={22} color={hasNextChapter ? colors.primary : colors.textMuted} />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.scroll} contentContainerStyle={styles.verseList}>
              {rangeMode ? (
                <View style={styles.rangeBanner}>
                  <Text style={styles.rangeHint}>
                    {!rangeStart
                      ? "Tap the first verse, then the last. You can open another chapter in between."
                      : !rangeEnd
                        ? `${formatPos(rangeStart, books)} selected. Tap the last verse.`
                        : `${formatPos(orderedRange(rangeStart, rangeEnd).start, books)} – ${formatPos(orderedRange(rangeStart, rangeEnd).end, books)}`}
                  </Text>
                  <TouchableOpacity onPress={clearRange} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.rangeCancel}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.chapterActions}>
                  <TouchableOpacity style={styles.addChapterBtn} onPress={onAddEntireChapter}>
                    <Ionicons name="add-circle" size={22} color={colors.primary} />
                    <Text style={styles.addChapterText}>Add this chapter</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.selectRangeBtn}
                    onPress={() => setRangeMode(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Select a range of verses"
                  >
                    <Ionicons name="swap-vertical" size={20} color={colors.primary} />
                    <Text style={styles.addChapterText}>Select a range</Text>
                  </TouchableOpacity>
                </View>
              )}
              {verses.map((v) => {
                const selected = rangeMode && isInSelectedRange(v, rangeStart, rangeEnd);
                return (
                  <TouchableOpacity
                    key={v.id}
                    style={[styles.verseRow, selected && styles.verseRowSelected]}
                    onPress={() => (rangeMode ? onPickRangeVerse(v) : onToggleVerse(v.id))}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={
                      rangeMode
                        ? `Select ${v.reference}`
                        : v.isFavorite
                          ? `Remove ${v.reference}`
                          : `Add ${v.reference}`
                    }
                  >
                    <View style={styles.verseInfo}>
                      <Text style={styles.verseRef}>{v.reference}</Text>
                      <Text style={styles.verseText}>{v.text}</Text>
                    </View>
                    {rangeMode ? (
                      <Ionicons
                        name={selected ? "checkmark-circle" : "ellipse-outline"}
                        size={24}
                        color={selected ? colors.primary : colors.textMuted}
                      />
                    ) : (
                      <Ionicons
                        name={v.isFavorite ? "heart" : "heart-outline"}
                        size={26}
                        color={v.isFavorite ? colors.primary : colors.textMuted}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
              </ScrollView>
              {rangeMode && rangeStart && rangeEnd ? (
                <View style={styles.rangeCtaBar}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.rangeCta,
                      { opacity: savingRange || pressed ? 0.85 : 1 },
                    ]}
                    onPress={() => void onAddRange()}
                    disabled={savingRange}
                    accessibilityRole="button"
                    accessibilityLabel="Add this passage"
                  >
                    {savingRange ? (
                      <ActivityIndicator color={colors.primaryText} />
                    ) : (
                      <Text style={styles.rangeCtaText}>Add this passage</Text>
                    )}
                  </Pressable>
                </View>
              ) : null}
            </>
          )}
        </>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, justifyContent: "center", alignItems: "center" },
    breadcrumb: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    breadcrumbBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
    breadcrumbText: { fontSize: 16, color: colors.primary, fontWeight: "500" },
    searchBlock: { marginBottom: 14 },
    searchInput: {
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
    },
    searchSpinner: { marginTop: 10 },
    searchEmpty: { marginTop: 10, fontSize: 15, color: colors.textMuted },
    searchResultRow: {
      backgroundColor: colors.surface,
      padding: 14,
      borderRadius: 12,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    searchActions: { flexDirection: "row", gap: 10, marginTop: 12 },
    searchActionBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 10,
      alignItems: "center",
      backgroundColor: colors.primary + "18",
      borderWidth: 1,
      borderColor: colors.primary + "40",
    },
    searchActionBtnDone: { opacity: 0.6 },
    searchActionText: { fontSize: 14, fontWeight: "600", color: colors.primary },
    listHint: {
      fontSize: 15,
      color: colors.textMuted,
      lineHeight: 22,
      marginBottom: 14,
    },
    addRangeBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: colors.primary + "12",
      padding: 14,
      borderRadius: 12,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.primary + "40",
    },
    addRangeText: { fontSize: 15, color: colors.primary, fontWeight: "600" },
    list: { padding: 16, paddingBottom: 40 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.surface,
      padding: 16,
      borderRadius: 12,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    rowTitle: { fontSize: 16, color: colors.text, fontWeight: "500" },
    chapterNav: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface,
    },
    chapterNavBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingVertical: 8,
      paddingHorizontal: 10,
      minWidth: 90,
    },
    chapterNavBtnDisabled: { opacity: 0.5 },
    chapterNavBtnText: { fontSize: 15, color: colors.primary, fontWeight: "600" },
    chapterNavBtnTextDisabled: { color: colors.textMuted },
    chapterNavTitle: {
      flex: 1,
      fontSize: 16,
      fontWeight: "600",
      color: colors.text,
      textAlign: "center",
      marginHorizontal: 8,
    },
    scroll: { flex: 1 },
    verseList: { padding: 16, paddingBottom: 40 },
    chapterActions: { flexDirection: "row", gap: 10, marginBottom: 16 },
    addChapterBtn: {
      flex: 1,
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor: colors.primary + "12",
      paddingVertical: 12,
      paddingHorizontal: 8,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.primary + "40",
    },
    selectRangeBtn: {
      flex: 1,
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor: colors.surface,
      paddingVertical: 12,
      paddingHorizontal: 8,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    addChapterText: { fontSize: 13, color: colors.primary, fontWeight: "600", textAlign: "center" },
    rangeBanner: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
      marginBottom: 16,
    },
    rangeHint: {
      flex: 1,
      fontSize: 15,
      color: colors.textSecondary,
      lineHeight: 22,
      marginBottom: 12,
    },
    rangeCancel: { fontSize: 15, fontWeight: "600", color: colors.primary, marginTop: 2 },
    verseRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      padding: 14,
      borderRadius: 12,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    verseRowSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primary + "12",
    },
    verseInfo: { flex: 1, marginRight: 12 },
    verseRef: { fontSize: 14, fontWeight: "600", color: colors.primary, marginBottom: 4 },
    verseText: { fontSize: 15, color: colors.text, lineHeight: 22 },
    favBtn: { padding: 4 },
    rangeCtaBar: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 24,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
    },
    rangeCta: {
      backgroundColor: colors.primary,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: "center",
    },
    rangeCtaText: { fontSize: 16, fontWeight: "600", color: colors.primaryText },
  });
}

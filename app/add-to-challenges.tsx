import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Modal,
} from "react-native";
import { useThemeColors, type ThemeColors } from "../constants/theme";
import {
  getBooks,
  getChaptersForBook,
  getVersesByChapter,
  getVerseById,
  getVersesInRange,
  type BibleBook,
  type VersePosition,
  searchVersesByText,
} from "../database/queries";
import type { GameVerse } from "../types/verse";
import {
  findChallengeByBounds,
  isChallengeInMyList,
  upsertChallengeFromVerses,
} from "../database/challenges";

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
  const [highlightVerseId, setHighlightVerseId] = useState<string | null>(null);
  const [savedChallengeVerseIds, setSavedChallengeVerseIds] = useState<Set<string>>(() => new Set());
  const [verseActionTarget, setVerseActionTarget] = useState<GameVerse | null>(null);
  const chapterScrollRef = useRef<ScrollView>(null);
  const verseLayoutY = useRef<Map<string, number>>(new Map());
  const highlightScrollDone = useRef<string | null>(null);

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
    setHighlightVerseId(null);
    verseLayoutY.current.clear();
    setLoadingVerses(true);
    getVersesByChapter(selectedBook.book, chapter).then((v) => {
      setVerses(v);
      setLoadingVerses(false);
    });
  }, [selectedBook]);

  const openVerseInContext = useCallback(
    async (v: GameVerse) => {
      const book = books.find((b) => b.book === v.book);
      if (!book) return;
      setHighlightVerseId(v.id);
      clearRange();
      verseLayoutY.current.clear();
      setSelectedBook(book);
      setSelectedChapter(v.chapter);
      setLoadingChapters(true);
      setLoadingVerses(true);
      const [ch, chapterVerses] = await Promise.all([
        getChaptersForBook(book.book),
        getVersesByChapter(v.book, v.chapter),
      ]);
      setChapters(ch);
      setVerses(chapterVerses);
      setLoadingChapters(false);
      setLoadingVerses(false);
    },
    [books, clearRange]
  );

  const scrollToHighlightedVerse = useCallback(() => {
    if (!highlightVerseId) return;
    const y = verseLayoutY.current.get(highlightVerseId);
    if (y == null) return;
    chapterScrollRef.current?.scrollTo({ y: Math.max(0, y - 24), animated: true });
  }, [highlightVerseId]);

  const refreshSavedVersesInChapter = useCallback(async (chapterVerses: GameVerse[]) => {
    const saved = new Set<string>();
    await Promise.all(
      chapterVerses.map(async (v) => {
        const existing = await findChallengeByBounds({
          startBook: v.book,
          startChapter: v.chapter,
          startVerse: v.verse,
          endBook: v.book,
          endChapter: v.chapter,
          endVerse: v.verse,
        });
        if (existing && isChallengeInMyList(existing)) saved.add(v.id);
      })
    );
    setSavedChallengeVerseIds(saved);
  }, []);

  useEffect(() => {
    highlightScrollDone.current = null;
    verseLayoutY.current.clear();
  }, [highlightVerseId, selectedChapter, selectedBook?.book]);

  useEffect(() => {
    if (verses.length === 0) {
      setSavedChallengeVerseIds(new Set());
      return;
    }
    void refreshSavedVersesInChapter(verses);
  }, [verses, refreshSavedVersesInChapter]);

  const openPracticeForVerses = useCallback(
    async (practiceVerses: GameVerse[], rangeMode: "entire" | "verse" = "entire") => {
      if (practiceVerses.length === 0) return;
      const first = practiceVerses[0]!;
      const row = await upsertChallengeFromVerses(practiceVerses);
      router.push({
        pathname: "/practice-game",
        params: {
          session: "challenge",
          ...(row ? { challengeId: row.id } : {}),
          verseId: first.id,
          mode: "speech",
          ...(practiceVerses.length > 1
            ? {
                verseIds: practiceVerses.map((v) => v.id).join(","),
                currentIndex: "0",
                rangeMode,
              }
            : { verseIds: first.id, currentIndex: "0", rangeMode: "verse" }),
        },
      });
    },
    [router]
  );

  const onPracticeEntireChapter = useCallback(async () => {
    if (selectedBook === null || selectedChapter === null) return;
    const chapterVerses = await getVersesByChapter(selectedBook.book, selectedChapter);
    if (chapterVerses.length === 0) return;
    await openPracticeForVerses(chapterVerses, "entire");
  }, [selectedBook, selectedChapter, openPracticeForVerses]);

  const onPracticeRange = useCallback(async () => {
    if (!rangeStart || !rangeEnd) return;
    const { start, end } = orderedRange(rangeStart, rangeEnd);
    setSavingRange(true);
    try {
      const rangeVerses = await getVersesInRange(start, end);
      if (rangeVerses.length === 0) {
        Alert.alert("No verses in range", "Pick a valid first and last verse.");
        return;
      }
      await openPracticeForVerses(rangeVerses, "entire");
      clearRange();
    } catch {
      Alert.alert("Couldn't open practice", "Please try again.");
    } finally {
      setSavingRange(false);
    }
  }, [rangeStart, rangeEnd, clearRange, openPracticeForVerses]);

  const onPickRangeVerse = useCallback((v: GameVerse) => {
    const pos = toPos(v);
    if (!rangeStart) {
      setRangeStart(pos);
      return;
    }
    setRangeEnd(pos);
  }, [rangeStart]);

  const onVerseRowPress = useCallback(
    (v: GameVerse) => {
      if (rangeMode) {
        onPickRangeVerse(v);
        return;
      }
      setHighlightVerseId(v.id);
    },
    [rangeMode, onPickRangeVerse]
  );

  const goBack = useCallback(() => {
    if (selectedChapter !== null) {
      setSelectedChapter(null);
      setVerses([]);
      setHighlightVerseId(null);
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

  const openPracticeForVerse = useCallback(
    async (v: GameVerse) => {
      await openPracticeForVerses([v], "verse");
    },
    [openPracticeForVerses]
  );

  const openVerseActionSheet = useCallback((v: GameVerse) => {
    setVerseActionTarget(v);
  }, []);

  const closeVerseActionSheet = useCallback(() => {
    setVerseActionTarget(null);
  }, []);

  const onActionSheetPractice = useCallback(() => {
    const v = verseActionTarget;
    closeVerseActionSheet();
    if (v) void openPracticeForVerse(v);
  }, [verseActionTarget, closeVerseActionSheet, openPracticeForVerse]);

  const isActionTargetSaved =
    verseActionTarget != null && savedChallengeVerseIds.has(verseActionTarget.id);

  const searchActive = selectedBook === null && verseSearch.trim().length >= 2;

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
        <View style={styles.searchResultsShell}>
          <View
            style={[styles.stickySearchBar, { borderBottomColor: colors.border, backgroundColor: colors.background }]}
          >
            <TextInput
              style={[
                styles.searchInput,
                { backgroundColor: colors.surface, borderColor: colors.surfaceBorder, color: colors.text },
              ]}
              placeholder="Search verse text…"
              placeholderTextColor={colors.textMuted}
              value={verseSearch}
              onChangeText={setVerseSearch}
              autoCorrect={false}
              spellCheck={false}
              clearButtonMode="while-editing"
              accessibilityLabel="Search verse text"
            />
            {searchActive && verseSearchLoading ? (
              <ActivityIndicator size="small" color={colors.primary} style={styles.searchSpinner} />
            ) : null}
            {searchActive && !verseSearchLoading && verseSearchResults.length === 0 ? (
              <Text style={styles.searchEmpty}>No verses match. Try different words.</Text>
            ) : null}
          </View>
          {searchActive ? (
            <FlatList
              data={verseSearchResults}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.list}
              style={styles.searchResultsList}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <View style={styles.searchResultRow}>
                  <Pressable
                    style={({ pressed }) => [styles.searchResultMain, pressed && { opacity: 0.85 }]}
                    onPress={() => void openVerseInContext(item)}
                    onLongPress={() => openVerseActionSheet(item)}
                    delayLongPress={400}
                    accessibilityRole="button"
                    accessibilityLabel={`View ${item.reference} in chapter`}
                  >
                    <Text style={styles.verseRef}>{item.reference}</Text>
                    <Text style={styles.verseText} numberOfLines={3}>
                      {item.text}
                    </Text>
                  </Pressable>
                  <View style={styles.searchActions}>
                    <TouchableOpacity
                      style={styles.searchActionBtn}
                      onPress={() => void openPracticeForVerse(item)}
                      accessibilityRole="button"
                      accessibilityLabel={`Practice ${item.reference}`}
                    >
                      <Text style={styles.searchActionText}>Practice</Text>
                    </TouchableOpacity>
                    {savedChallengeVerseIds.has(item.id) ? (
                      <View style={[styles.searchActionBtn, styles.searchActionBtnDone]}>
                        <Text style={styles.searchActionText}>Practiced</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              )}
            />
          ) : (
            <FlatList
              data={books}
              keyExtractor={(item) => String(item.book)}
              contentContainerStyle={styles.list}
              style={styles.searchResultsList}
              ListHeaderComponent={
                <View>
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
          )}
        </View>
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
              <ScrollView
                ref={chapterScrollRef}
                style={styles.scroll}
                contentContainerStyle={styles.verseList}
                keyboardShouldPersistTaps="handled"
              >
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
                  <TouchableOpacity style={styles.addChapterBtn} onPress={() => void onPracticeEntireChapter()}>
                    <Ionicons name="mic-outline" size={22} color={colors.primary} />
                    <Text style={styles.addChapterText}>Practice this chapter</Text>
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
                const highlighted = !rangeMode && v.id === highlightVerseId;
                const saved = savedChallengeVerseIds.has(v.id);
                return (
                  <View
                    key={v.id}
                    onLayout={(e) => {
                      verseLayoutY.current.set(v.id, e.nativeEvent.layout.y);
                      if (
                        v.id === highlightVerseId &&
                        highlightScrollDone.current !== highlightVerseId
                      ) {
                        highlightScrollDone.current = highlightVerseId;
                        requestAnimationFrame(() => scrollToHighlightedVerse());
                      }
                    }}
                    style={[
                      styles.verseRow,
                      selected && styles.verseRowSelected,
                      highlighted && styles.verseRowHighlighted,
                    ]}
                  >
                    <Pressable
                      style={({ pressed }) => [styles.verseInfo, pressed && { opacity: 0.85 }]}
                      onPress={() => onVerseRowPress(v)}
                      onLongPress={() => openVerseActionSheet(v)}
                      delayLongPress={400}
                      accessibilityRole="button"
                      accessibilityLabel={
                        rangeMode ? `Select ${v.reference}` : `View ${v.reference}`
                      }
                    >
                      <Text style={styles.verseRef}>{v.reference}</Text>
                      <Text style={styles.verseText}>{v.text}</Text>
                    </Pressable>
                    {rangeMode ? (
                      <Pressable
                        onPress={() => onPickRangeVerse(v)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel={`Select ${v.reference}`}
                      >
                        <Ionicons
                          name={selected ? "checkmark-circle" : "ellipse-outline"}
                          size={24}
                          color={selected ? colors.primary : colors.textMuted}
                        />
                      </Pressable>
                    ) : (
                      <Pressable
                        onPress={() => void openPracticeForVerse(v)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={styles.favBtn}
                        accessibilityRole="button"
                        accessibilityLabel={
                          saved
                            ? `Practice ${v.reference} again (in My Challenges)`
                            : `Practice ${v.reference}`
                        }
                      >
                        <Ionicons
                          name={saved ? "heart" : "mic-outline"}
                          size={saved ? 26 : 24}
                          color={saved ? colors.primary : colors.textMuted}
                        />
                      </Pressable>
                    )}
                  </View>
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
                    onPress={() => void onPracticeRange()}
                    disabled={savingRange}
                    accessibilityRole="button"
                    accessibilityLabel="Practice this passage"
                  >
                    {savingRange ? (
                      <ActivityIndicator color={colors.primaryText} />
                    ) : (
                      <Text style={styles.rangeCtaText}>Practice this passage</Text>
                    )}
                  </Pressable>
                </View>
              ) : null}
            </>
          )}
        </>
      )}

      <Modal visible={verseActionTarget != null} transparent animationType="fade" onRequestClose={closeVerseActionSheet}>
        <Pressable style={styles.actionSheetBackdrop} onPress={closeVerseActionSheet}>
          <Pressable
            style={[styles.actionSheetCard, { backgroundColor: colors.surface }]}
            onPress={(e) => e.stopPropagation()}
          >
            {verseActionTarget ? (
              <>
                <Text style={[styles.actionSheetRef, { color: colors.primary }]}>
                  {verseActionTarget.reference}
                </Text>
                <Text style={[styles.actionSheetPreview, { color: colors.textMuted }]} numberOfLines={3}>
                  {verseActionTarget.text}
                </Text>
                <Pressable
                  style={[styles.actionSheetBtn, { backgroundColor: colors.primary }]}
                  onPress={onActionSheetPractice}
                  accessibilityRole="button"
                  accessibilityLabel={`Practice ${verseActionTarget.reference}`}
                >
                  <Ionicons name="mic-outline" size={20} color={colors.primaryText} />
                  <Text style={[styles.actionSheetBtnText, { color: colors.primaryText }]}>Practice</Text>
                </Pressable>
                {isActionTargetSaved ? (
                  <Text style={[styles.actionSheetPreview, { color: colors.textMuted, marginBottom: 4 }]}>
                    Already in My Challenges after you practiced it.
                  </Text>
                ) : null}
                <Pressable
                  style={styles.actionSheetCancel}
                  onPress={closeVerseActionSheet}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <Text style={[styles.actionSheetCancelText, { color: colors.textMuted }]}>Cancel</Text>
                </Pressable>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
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
    searchResultsShell: { flex: 1 },
    searchResultsList: { flex: 1 },
    stickySearchBar: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 12,
      borderBottomWidth: 1,
    },
    searchResultMain: { marginBottom: 4 },
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
    verseRowHighlighted: {
      borderColor: colors.primary,
      borderWidth: 2,
      backgroundColor: colors.primary + "18",
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
    actionSheetBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.45)",
      justifyContent: "center",
      paddingHorizontal: 24,
    },
    actionSheetCard: {
      borderRadius: 16,
      padding: 20,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    actionSheetRef: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
    actionSheetPreview: { fontSize: 15, lineHeight: 22, marginBottom: 20 },
    actionSheetBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 14,
      borderRadius: 12,
      marginBottom: 10,
    },
    actionSheetBtnSecondary: { borderWidth: 1 },
    actionSheetBtnText: { fontSize: 16, fontWeight: "600" },
    actionSheetCancel: { alignItems: "center", paddingVertical: 10, marginTop: 4 },
    actionSheetCancelText: { fontSize: 16, fontWeight: "500" },
  });
}

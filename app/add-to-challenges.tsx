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
} from "react-native";
import { useThemeColors, type ThemeColors } from "../constants/theme";
import {
  getBooks,
  getChaptersForBook,
  getVersesByChapter,
  toggleFavorite,
  setChapterFavorites,
  type BibleBook,
} from "../database/queries";
import type { GameVerse } from "../types/verse";

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

  useEffect(() => {
    let cancelled = false;
    getBooks().then((b) => {
      if (!cancelled) setBooks(b);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const onSelectBook = useCallback((book: BibleBook) => {
    setSelectedBook(book);
    setSelectedChapter(null);
    setVerses([]);
    setLoadingChapters(true);
    getChaptersForBook(book.book).then((ch) => {
      setChapters(ch);
      setLoadingChapters(false);
    });
  }, []);

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

  const goBack = useCallback(() => {
    if (selectedChapter !== null) {
      setSelectedChapter(null);
      setVerses([]);
    } else if (selectedBook !== null) {
      setSelectedBook(null);
      setChapters([]);
    } else {
      router.back();
    }
  }, [selectedBook, selectedChapter, router]);

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
        <FlatList
          data={books}
          keyExtractor={(item) => String(item.book)}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <TouchableOpacity
              style={styles.addRangeBtn}
              onPress={() => router.push("/add-range")}
            >
              <Ionicons name="git-branch-outline" size={22} color={colors.primary} />
              <Text style={styles.addRangeText}>Add a range (e.g. Genesis 1:1–1:5)</Text>
            </TouchableOpacity>
          }
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
              <TouchableOpacity
                style={styles.addChapterBtn}
                onPress={onAddEntireChapter}
              >
                <Ionicons name="add-circle" size={22} color={colors.primary} />
                <Text style={styles.addChapterText}>Add entire chapter to challenges</Text>
              </TouchableOpacity>
              {verses.map((v) => (
                <View key={v.id} style={styles.verseRow}>
                  <View style={styles.verseInfo}>
                    <Text style={styles.verseRef}>{v.reference}</Text>
                    <Text style={styles.verseText}>{v.text}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => onToggleVerse(v.id)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    style={styles.favBtn}
                  >
                    <Ionicons
                      name={v.isFavorite ? "heart" : "heart-outline"}
                      size={26}
                      color={v.isFavorite ? colors.error : colors.textMuted}
                    />
                  </TouchableOpacity>
                </View>
              ))}
              </ScrollView>
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
    addChapterBtn: {
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
    addChapterText: { fontSize: 15, color: colors.primary, fontWeight: "600" },
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
    verseInfo: { flex: 1, marginRight: 12 },
    verseRef: { fontSize: 14, fontWeight: "600", color: colors.primary, marginBottom: 4 },
    verseText: { fontSize: 15, color: colors.text, lineHeight: 22 },
    favBtn: { padding: 4 },
  });
}

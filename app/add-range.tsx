import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  FlatList,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useThemeColors, type ThemeColors } from "../constants/theme";
import {
  getBooks,
  getChaptersForBook,
  getVersesByChapter,
  getVersesInRange,
  setRangeFavorites,
  type BibleBook,
} from "../database/queries";
import type { GameVerse } from "../types/verse";
import type { VersePosition } from "../database/queries";

function formatPosition(
  pos: VersePosition,
  books: BibleBook[]
): string {
  const name = books.find((b) => b.book === pos.book)?.book_name ?? "?";
  return `${name} ${pos.chapter}:${pos.verse}`;
}

function positionLessOrEqual(a: VersePosition, b: VersePosition): boolean {
  if (a.book !== b.book) return a.book < b.book;
  if (a.chapter !== b.chapter) return a.chapter < b.chapter;
  return a.verse <= b.verse;
}

const defaultPosition: VersePosition = { book: 1, chapter: 1, verse: 1 };
const PREVIEW_LIMIT = 20;

export default function AddRangeScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [books, setBooks] = useState<BibleBook[]>([]);
  const [start, setStart] = useState<VersePosition>(defaultPosition);
  const [end, setEnd] = useState<VersePosition>(defaultPosition);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<"start" | "end" | null>(null);
  const [step, setStep] = useState<"book" | "chapter" | "verse">("book");
  const [pickerTarget, setPickerTarget] = useState<"start" | "end">("start");
  const [chapters, setChapters] = useState<number[]>([]);
  const [verses, setVerses] = useState<number[]>([]);
  const [loadingPicker, setLoadingPicker] = useState(false);
  const [previewVerses, setPreviewVerses] = useState<GameVerse[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewHasMore, setPreviewHasMore] = useState(false);

  useEffect(() => {
    getBooks().then((b) => {
      setBooks(b);
      setLoading(false);
    });
  }, []);

  const openPicker = useCallback((target: "start" | "end") => {
    setPickerTarget(target);
    setModal(target);
    setStep("book");
    const pos = target === "start" ? start : end;
    setLoadingPicker(true);
    getChaptersForBook(pos.book).then((ch) => {
      setChapters(ch);
      return getVersesByChapter(pos.book, pos.chapter);
    }).then((v) => {
      setVerses(v.map((x) => x.verse));
      setLoadingPicker(false);
    });
  }, [start, end]);

  useEffect(() => {
    if (modal == null) return;
    const pos = pickerTarget === "start" ? start : end;
    if (step === "book") {
      setChapters([]);
      setVerses([]);
      return;
    }
    setLoadingPicker(true);
    if (step === "chapter") {
      getChaptersForBook(pos.book).then((ch) => {
        setChapters(ch);
        setLoadingPicker(false);
      });
      return;
    }
    getVersesByChapter(pos.book, pos.chapter).then((v) => {
      setVerses(v.map((x) => x.verse));
      setLoadingPicker(false);
    });
  }, [modal, pickerTarget, step, pickerTarget === "start" ? start.book : end.book, pickerTarget === "start" ? start.chapter : end.chapter]);

  useEffect(() => {
    if (modal !== null) return;
    if (!positionLessOrEqual(start, end)) {
      setPreviewVerses([]);
      setPreviewHasMore(false);
      return;
    }
    setPreviewLoading(true);
    getVersesInRange(start, end, PREVIEW_LIMIT)
      .then((verses) => {
        setPreviewVerses(verses);
        setPreviewHasMore(verses.length >= PREVIEW_LIMIT);
      })
      .finally(() => setPreviewLoading(false));
  }, [start, end, modal]);

  const applyBook = useCallback((book: number) => {
    const pos = pickerTarget === "start" ? { ...start } : { ...end };
    pos.book = book;
    pos.chapter = 1;
    pos.verse = 1;
    if (pickerTarget === "start") setStart(pos);
    else setEnd(pos);
    setStep("chapter");
    getChaptersForBook(book).then(setChapters);
  }, [pickerTarget, start, end]);

  const applyChapter = useCallback((chapter: number) => {
    const pos = pickerTarget === "start" ? { ...start } : { ...end };
    pos.chapter = chapter;
    pos.verse = 1;
    if (pickerTarget === "start") setStart(pos);
    else setEnd(pos);
    setStep("verse");
    getVersesByChapter(pos.book, chapter).then((v) => setVerses(v.map((x) => x.verse)));
  }, [pickerTarget, start, end]);

  const applyVerse = useCallback((verse: number) => {
    const pos = pickerTarget === "start" ? { ...start } : { ...end };
    pos.verse = verse;
    if (pickerTarget === "start") setStart(pos);
    else setEnd(pos);
    setModal(null);
  }, [pickerTarget, start, end]);

  const handleAddRange = useCallback(async () => {
    if (!positionLessOrEqual(start, end)) {
      Alert.alert("Invalid range", "From must be before or equal to To.");
      return;
    }
    setSaving(true);
    try {
      await setRangeFavorites(start, end, true);
      Alert.alert("Done", "Range added to your challenges.", [{ text: "OK", onPress: () => router.back() }]);
    } catch {
      Alert.alert("Error", "Could not add range.");
    } finally {
      setSaving(false);
    }
  }, [start, end, router]);

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topSection}>
        <TouchableOpacity style={styles.fromToCell} onPress={() => openPicker("start")} activeOpacity={0.7}>
          <Text style={styles.fromToLabel}>From</Text>
          <Text style={styles.fromToValue} numberOfLines={1}>{formatPosition(start, books)}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>
        <View style={styles.fromToDivider} />
        <TouchableOpacity style={styles.fromToCell} onPress={() => openPicker("end")} activeOpacity={0.7}>
          <Text style={styles.fromToLabel}>To</Text>
          <Text style={styles.fromToValue} numberOfLines={1}>{formatPosition(end, books)}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollSection}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        <Text style={styles.previewTitle}>Preview</Text>
        {!positionLessOrEqual(start, end) ? (
          <Text style={styles.previewInvalid}>From must be before or equal to To.</Text>
        ) : previewLoading ? (
          <View style={styles.previewLoading}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.previewLoadingText}>Loading verses…</Text>
          </View>
        ) : previewVerses.length === 0 ? (
          <Text style={styles.previewEmpty}>No verses in range.</Text>
        ) : (
          <View style={styles.previewList}>
            {previewVerses.map((v) => (
              <View key={v.id} style={styles.previewRow}>
                <Text style={styles.previewRef}>{v.reference}</Text>
                <Text style={styles.previewText} numberOfLines={2}>{v.text}</Text>
              </View>
            ))}
            {previewHasMore && (
              <Text style={styles.previewMore}>…and more verses in range (first {PREVIEW_LIMIT} shown)</Text>
            )}
          </View>
        )}
      </ScrollView>

      <View style={styles.ctaSection}>
        <TouchableOpacity
          style={[styles.addBtn, saving && styles.addBtnDisabled]}
          onPress={handleAddRange}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.primaryText} />
          ) : (
            <>
              <Ionicons name="add-circle" size={22} color={colors.primaryText} />
              <Text style={styles.addBtnText}>Add range to challenges</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <Modal visible={modal !== null} transparent animationType="slide">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModal(null)}
        />
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {pickerTarget === "start" ? "From" : "To"} – {step}
            </Text>
            <TouchableOpacity onPress={() => setModal(null)}>
              <Text style={styles.modalClose}>Done</Text>
            </TouchableOpacity>
          </View>
          {loadingPicker ? (
            <View style={[styles.centered, { backgroundColor: colors.surface }]}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : step === "book" ? (
            <FlatList
              data={books}
              keyExtractor={(item) => String(item.book)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalRow}
                  onPress={() => applyBook(item.book)}
                >
                  <Text style={styles.modalRowText}>{item.book_name}</Text>
                </TouchableOpacity>
              )}
            />
          ) : step === "chapter" ? (
            <FlatList
              data={chapters}
              keyExtractor={(item) => String(item)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalRow}
                  onPress={() => applyChapter(item)}
                >
                  <Text style={styles.modalRowText}>Chapter {item}</Text>
                </TouchableOpacity>
              )}
            />
          ) : (
            <FlatList
              data={verses}
              keyExtractor={(item) => String(item)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalRow}
                  onPress={() => applyVerse(item)}
                >
                  <Text style={styles.modalRowText}>Verse {item}</Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, justifyContent: "center", alignItems: "center", minHeight: 200 },
    topSection: {
      flexDirection: "row",
      alignItems: "stretch",
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.surfaceBorder,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    fromToCell: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      gap: 6,
    },
    fromToLabel: { fontSize: 13, color: colors.textMuted, width: 32 },
    fromToValue: { flex: 1, fontSize: 15, color: colors.text, fontWeight: "500" },
    fromToDivider: { width: 1, backgroundColor: colors.border, marginVertical: 4 },
    scrollSection: { flex: 1 },
    scrollContent: { padding: 20, paddingBottom: 24 },
    ctaSection: {
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 34,
      backgroundColor: colors.background,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    addBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      backgroundColor: colors.primary,
      padding: 16,
      borderRadius: 12,
    },
    addBtnDisabled: { opacity: 0.7 },
    addBtnText: { fontSize: 16, fontWeight: "600", color: colors.primaryText },
    previewTitle: { fontSize: 14, fontWeight: "600", color: colors.textMuted, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 },
    previewInvalid: { fontSize: 14, color: colors.error, marginBottom: 12 },
    previewLoading: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 16 },
    previewLoadingText: { fontSize: 14, color: colors.textMuted },
    previewEmpty: { fontSize: 14, color: colors.textMuted, marginBottom: 12 },
    previewList: { marginBottom: 8 },
    previewRow: {
      backgroundColor: colors.surface,
      padding: 12,
      borderRadius: 10,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    previewRef: { fontSize: 13, fontWeight: "600", color: colors.primary, marginBottom: 4 },
    previewText: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
    previewMore: { fontSize: 13, color: colors.textMuted, marginTop: 4, marginBottom: 12 },
    modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
    modalContent: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      maxHeight: "70%",
      paddingBottom: 24,
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalTitle: { fontSize: 18, fontWeight: "600", color: colors.text },
    modalClose: { fontSize: 16, color: colors.primary, fontWeight: "500" },
    modalRow: {
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalRowText: { fontSize: 16, color: colors.text },
  });
}

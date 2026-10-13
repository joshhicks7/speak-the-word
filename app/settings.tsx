import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors, type ThemeColors } from "../constants/theme";
import { useAppVoice } from "../context/AppVoiceProvider";
import {
  applyAvailableUpdateIfAny,
  getUpdateDiagnostics,
  type UpdateDiagnostics,
} from "../lib/appUpdates";
import { OptionPickerModal } from "../components/OptionPickerModal";
import {
  DEFAULT_TTS_RATE,
  TTS_RATE_PRESETS,
  displayLabelForVoice,
  englishVoicesForPicker,
  labelForTtsRate,
  labelForTtsVoice,
  loadAvailableVoices,
} from "../lib/ttsVoice";
import speechWrapper from "../lib/speechRecognitionWrapper";
import {
  hasSeenHandsFreeDisclaimer,
  setHandsFreeDisclaimerSeen,
  type MicStartMode,
} from "../utils/preferences";

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { prefs, setEnabled, updatePrefs } = useAppVoice();
  const handsFree = prefs.handsFreeEnabled && speechWrapper.available;
  const [openCommandSections, setOpenCommandSections] = useState<Record<string, boolean>>({});
  const [ttsVoices, setTtsVoices] = useState<Awaited<ReturnType<typeof loadAvailableVoices>>>([]);
  const [updateInfo, setUpdateInfo] = useState<UpdateDiagnostics>(() => getUpdateDiagnostics());
  const [voicePickerOpen, setVoicePickerOpen] = useState(false);
  const [ratePickerOpen, setRatePickerOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setUpdateInfo(getUpdateDiagnostics());
      void loadAvailableVoices().then(setTtsVoices);
    }, [])
  );

  const checkForAppUpdate = useCallback(() => {
    const before = getUpdateDiagnostics();
    void applyAvailableUpdateIfAny().finally(() => {
      setUpdateInfo(getUpdateDiagnostics());
      if (!before.updatesEnabled) {
        Alert.alert(
          "App update",
          "Over-the-air updates are off in this install. Submit a new production store build, then publish updates on Expo."
        );
      }
    });
  }, []);

  const ttsVoiceOptions = useMemo(() => {
    const english = englishVoicesForPicker(ttsVoices);
    return [
      { value: null as string | null, label: "Automatic (best on device)" },
      ...english.map((v) => ({
        value: v.identifier,
        label: displayLabelForVoice(v),
        detail: v.language,
      })),
    ];
  }, [ttsVoices]);

  const ttsRateOptions = useMemo(
    () =>
      TTS_RATE_PRESETS.map((p) => ({
        value: String(p.rate),
        label: p.label,
        detail: `${p.rate}×`,
      })),
    []
  );

  const toggleCommandSection = useCallback((id: string) => {
    setOpenCommandSections((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const toggleHandsFree = useCallback(
    async (next: boolean) => {
      if (next) {
        const seen = await hasSeenHandsFreeDisclaimer();
        if (!seen) {
          Alert.alert(
            "Hands-Free Mode",
            "Use only when it is safe and legal. Keep your eyes on the road.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Enable",
                onPress: async () => {
                  await setHandsFreeDisclaimerSeen();
                  await setEnabled(true);
                },
              },
            ]
          );
          return;
        }
      }
      await setEnabled(next);
    },
    [setEnabled]
  );

  return (
    <>
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 8) }]}
    >
      <Text style={styles.sectionTitle}>Hands-Free & voice</Text>
      <Text style={styles.sectionHint}>
        {speechWrapper.available
          ? "Voice navigation and spoken practice across the app."
          : "Speech recognition requires a development build (not Expo Go)."}
      </Text>

      <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Hands-Free Mode</Text>
          <Switch
            value={handsFree}
            onValueChange={(v) => void toggleHandsFree(v)}
            disabled={!speechWrapper.available}
            accessibilityLabel="Hands-Free Mode"
          />
        </View>

        {handsFree ? (
          <>
            <Pressable
              style={styles.rowPressable}
              onPress={() =>
                void updatePrefs({
                  micStartMode: prefs.micStartMode === "autoCue" ? "startPhrase" : ("autoCue" as MicStartMode),
                })
              }
            >
              <Text style={styles.rowLabel}>Mic start</Text>
              <Text style={styles.rowValue}>
                {prefs.micStartMode === "autoCue" ? "Auto cue" : "Say begin"}
              </Text>
            </Pressable>
            <View style={styles.row}>
              <Text style={[styles.rowLabel, { flex: 1 }]}>Auto-submit after silence</Text>
              <Switch
                value={prefs.autoSubmitOnSilence}
                onValueChange={(v) => void updatePrefs({ autoSubmitOnSilence: v })}
              />
            </View>
            <View style={styles.row}>
              <Text style={[styles.rowLabel, { flex: 1 }]}>Read full verse before recite</Text>
              <Switch
                value={prefs.readFullVerse}
                onValueChange={(v) => void updatePrefs({ readFullVerse: v })}
              />
            </View>
            <View style={styles.row}>
              <Text style={[styles.rowLabel, { flex: 1 }]}>Announce each verse when reading</Text>
              <Switch
                value={prefs.announceEachVerseWhenReading}
                onValueChange={(v) => void updatePrefs({ announceEachVerseWhenReading: v })}
              />
            </View>
            <Text style={[styles.settingHint, { color: colors.textMuted }]}>
              Off: say the passage once (e.g. Psalms 23:1–6), then read all text. On: Psalms 23:1, text,
              Psalms 23:2…
            </Text>
            <View style={styles.row}>
              <Text style={[styles.rowLabel, { flex: 1 }]}>Speak screen summaries</Text>
              <Switch
                value={prefs.speakScreenContext}
                onValueChange={(v) => void updatePrefs({ speakScreenContext: v })}
              />
            </View>
            <Pressable
              style={styles.rowPressable}
              onPress={() => {
                const next =
                  prefs.silenceTimeoutMs <= 2000 ? 3500 : prefs.silenceTimeoutMs <= 3500 ? 5000 : 2000;
                void updatePrefs({ silenceTimeoutMs: next });
              }}
            >
              <Text style={styles.rowLabel}>Silence before submit</Text>
              <Text style={styles.rowValue}>{prefs.silenceTimeoutMs / 1000}s</Text>
            </Pressable>
          </>
        ) : null}
      </View>

      <Text style={[styles.sectionTitle, { marginTop: 28 }]}>Read-aloud voice</Text>
      <Text style={styles.sectionHint}>
        Tap Voice or Speaking pace to open a list (▼). Scripture and prompts use your phone&apos;s
        text-to-speech. On iPhone, download Enhanced voices under Settings → Accessibility → Spoken
        Content → Voices.
      </Text>
      <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <Pressable
          style={styles.rowPressable}
          onPress={() => setVoicePickerOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Choose read-aloud voice"
        >
          <Text style={styles.rowLabel}>Voice</Text>
          <View style={styles.rowValueWithChevron}>
            <Text style={[styles.rowValue, styles.rowValueFlex]} numberOfLines={2}>
              {labelForTtsVoice(prefs.ttsVoiceId, ttsVoices)}
            </Text>
            <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
          </View>
        </Pressable>
        <Pressable
          style={styles.rowPressable}
          onPress={() => setRatePickerOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Choose speaking pace"
        >
          <Text style={styles.rowLabel}>Speaking pace</Text>
          <View style={styles.rowValueWithChevron}>
            <Text style={styles.rowValue}>{labelForTtsRate(prefs.ttsSpeechRate)}</Text>
            <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
          </View>
        </Pressable>
      </View>

      <Text style={[styles.sectionTitle, { marginTop: 28 }]}>Voice commands</Text>
      <Text style={styles.sectionHint}>
        {speechWrapper.available
          ? "Spoken shortcuts when Hands-Free is on. The mic listens on each screen that supports voice."
          : "Requires a development build with speech recognition."}
      </Text>
      <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <CollapsibleVoiceSection
          id="anywhere"
          title="Anywhere"
          open={!!openCommandSections.anywhere}
          onToggle={toggleCommandSection}
        >
          <VoiceCommandLine
            example="Matthew 6 33 · Genesis 1 1"
            detail="Say a reference (numbers or colons work). Then practice, read, or add."
          />
          <VoiceCommandLine example="Practice Matthew 6 33" detail="Start practice for that verse." />
          <VoiceCommandLine
            example="Practice Psalm 23 1 through 6"
            detail="Start a verse range in the same chapter (through, to, or 23 1 6)."
          />
          <VoiceCommandLine
            example="Read Matthew 6 33 · Say … · What is …"
            detail="Hear the reference and full verse, then choose next step."
          />
          <VoiceCommandLine example="Practice · Read · Add" detail="After a reference is loaded." />
          <VoiceCommandLine
            example="Find verse …"
            detail='Search by words, e.g. "find verse for God so loved".'
          />
          <VoiceCommandLine
            example="Home · Levels · My challenges · Settings"
            detail="Open a main screen or Settings."
          />
          <VoiceCommandLine
            example="Hands-free off · Mic off · Microphone off"
            detail="Switch to manual mode."
          />
          <VoiceCommandLine
            example="Stop · Stop speaking"
            detail="When the command mic is on. While it is reading aloud, tap Stop on screen."
          />
        </CollapsibleVoiceSection>

        <CollapsibleVoiceSection
          id="home"
          title="Home"
          open={!!openCommandSections.home}
          onToggle={toggleCommandSection}
        >
          <VoiceCommandLine example="Today's verse" detail="Open verse of the day practice." />
        </CollapsibleVoiceSection>

        <CollapsibleVoiceSection
          id="levels"
          title="Levels"
          open={!!openCommandSections.levels}
          onToggle={toggleCommandSection}
        >
          <VoiceCommandLine
            example="Play · Start · Practice"
            detail="Start your next level verse (exact phrase, no reference)."
          />
          <VoiceCommandLine
            example="Matthew 6 33 · Practice Matthew 6 33"
            detail="Say a reference to open that verse instead."
          />
        </CollapsibleVoiceSection>

        <CollapsibleVoiceSection
          id="challenges"
          title="My Challenges"
          open={!!openCommandSections.challenges}
          onToggle={toggleCommandSection}
        >
          <VoiceCommandLine
            example="John 3 16 · Practice John 3 16"
            detail="Say a reference to practice. Tap a challenge card to open it."
          />
          <VoiceCommandLine example="Next challenge" detail="Open the next incomplete challenge in your list." />
        </CollapsibleVoiceSection>

        <CollapsibleVoiceSection
          id="practice-game"
          title="Practice game"
          open={!!openCommandSections["practice-game"]}
          onToggle={toggleCommandSection}
          isLast
        >
          <VoiceCommandLine example="Begin · Ready" detail="When asked to say begin before reciting." />
          <VoiceCommandLine example="Hint · Next word" detail="Memorize phase." />
          <VoiceCommandLine
            example="Exit · Back · Quit · Done"
            detail="Leave practice (go back). During recite: short phrase only, not part of the verse."
          />
          <VoiceCommandLine
            example="Restart · Start over"
            detail="Return to the memorize screen from recite, memorize, or results."
          />
          <VoiceCommandLine
            example="Try again · Try more · Advance"
            detail="On the score screen after you recite."
          />
          <VoiceCommandLine example="Repeat" detail="Hear the verse again." />
        </CollapsibleVoiceSection>
      </View>

      <Text style={[styles.sectionTitle, { marginTop: 28 }]}>General</Text>
      <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <Pressable
          style={styles.rowPressable}
          onPress={() => router.push("/welcome")}
          accessibilityRole="button"
          accessibilityLabel="Replay welcome tour"
        >
          <Text style={styles.rowLabel}>Replay welcome tour</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Pressable>
      </View>

      <Text style={[styles.sectionTitle, { marginTop: 28 }]}>App update (diagnostics)</Text>
      <Text style={styles.sectionHint}>
        Over-the-air updates never appear in the App Store or Play Console. If Read-aloud voice is missing,
        compare runtime and channel here with your publish on expo.dev.
      </Text>
      <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <Pressable style={styles.rowPressable} onPress={checkForAppUpdate}>
          <Text style={styles.rowLabel}>Check for update now</Text>
          <Ionicons name="refresh" size={20} color={colors.primary} />
        </Pressable>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>OTA enabled</Text>
          <Text style={styles.rowValue}>{updateInfo.updatesEnabled ? "Yes" : "No"}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Channel</Text>
          <Text style={styles.rowValue}>{updateInfo.channel ?? "—"}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Runtime</Text>
          <Text style={styles.rowValue}>{updateInfo.runtimeVersion ?? "—"}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>App version</Text>
          <Text style={styles.rowValue}>{updateInfo.appVersion ?? "—"}</Text>
        </View>
        <View style={styles.row}>
          <Text style={[styles.rowLabel, { flex: 1 }]}>Update ID</Text>
          <Text style={[styles.rowValue, { flex: 1, textAlign: "right" }]} numberOfLines={2}>
            {updateInfo.updateId?.slice(0, 8) ?? "embedded"}
          </Text>
        </View>
        <View style={[styles.row, { borderBottomWidth: 0 }]}>
          <Text style={styles.rowLabel}>Using embedded bundle</Text>
          <Text style={styles.rowValue}>{updateInfo.embeddedLaunch ? "Yes" : "No"}</Text>
        </View>
      </View>
    </ScrollView>

    <OptionPickerModal
      visible={voicePickerOpen}
      title="Read-aloud voice"
      options={ttsVoiceOptions}
      selectedValue={prefs.ttsVoiceId}
      onSelect={(value) => void updatePrefs({ ttsVoiceId: value })}
      onClose={() => setVoicePickerOpen(false)}
    />
    <OptionPickerModal
      visible={ratePickerOpen}
      title="Speaking pace"
      options={ttsRateOptions}
      selectedValue={
        TTS_RATE_PRESETS.find((p) => Math.abs(p.rate - prefs.ttsSpeechRate) < 0.001)?.rate.toString() ??
        String(prefs.ttsSpeechRate)
      }
      onSelect={(value) => {
        const rate = value != null ? parseFloat(value) : DEFAULT_TTS_RATE;
        if (!Number.isNaN(rate)) void updatePrefs({ ttsSpeechRate: rate });
      }}
      onClose={() => setRatePickerOpen(false)}
    />
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 20, paddingBottom: 40 },
    sectionTitle: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textMuted,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 8,
    },
    sectionHint: { fontSize: 15, color: colors.textMuted, lineHeight: 22, marginBottom: 14 },
    card: {
      borderWidth: 1,
      borderRadius: 14,
      overflow: "hidden",
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    settingHint: {
      fontSize: 13,
      lineHeight: 18,
      paddingHorizontal: 16,
      paddingBottom: 12,
      marginTop: -6,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    rowPressable: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    rowLabel: { fontSize: 16, color: colors.text, fontWeight: "500" },
    rowValue: { fontSize: 15, color: colors.textMuted },
    rowValueFlex: { flexShrink: 1, textAlign: "right" },
    rowValueWithChevron: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      maxWidth: "58%",
    },
    commandSectionBody: {
      paddingHorizontal: 16,
      paddingBottom: 14,
      gap: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    commandSectionBodyLast: {
      borderBottomWidth: 0,
    },
    commandSectionTitle: { fontSize: 15, fontWeight: "600", color: colors.text, flex: 1, paddingRight: 8 },
    commandExample: { fontSize: 15, fontWeight: "600", color: colors.text, lineHeight: 21 },
    commandDetail: { fontSize: 14, color: colors.textMuted, lineHeight: 20, marginTop: 2 },
  });
}

function CollapsibleVoiceSection({
  id,
  title,
  open,
  onToggle,
  isLast = false,
  children,
}: {
  id: string;
  title: string;
  open: boolean;
  onToggle: (id: string) => void;
  isLast?: boolean;
  children: React.ReactNode;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View>
      <Pressable
        style={[styles.rowPressable, isLast && !open ? { borderBottomWidth: 0 } : null]}
        onPress={() => onToggle(id)}
        accessibilityRole="button"
        accessibilityLabel={`${title} voice commands`}
        accessibilityState={{ expanded: open }}
      >
        <Text style={styles.commandSectionTitle}>{title}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={20} color={colors.textMuted} />
      </Pressable>
      {open ? (
        <View style={[styles.commandSectionBody, isLast && styles.commandSectionBodyLast]}>{children}</View>
      ) : null}
    </View>
  );
}

function VoiceCommandLine({ example, detail }: { example: string; detail: string }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View>
      <Text style={styles.commandExample}>{example}</Text>
      <Text style={styles.commandDetail}>{detail}</Text>
    </View>
  );
}

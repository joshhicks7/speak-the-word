import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors, type ThemeColors } from "../constants/theme";
import { useAppVoice } from "../context/AppVoiceProvider";

export function SpeechStopBar() {
  const { speechActive, stopSpeak } = useAppVoice();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = createStyles(colors);

  if (!speechActive) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]}
    >
      <View style={[styles.bar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="volume-high" size={20} color={colors.primary} />
        <Text style={[styles.label, { color: colors.text }]}>Speaking…</Text>
        <Pressable
          onPress={stopSpeak}
          style={({ pressed }) => [
            styles.stopBtn,
            { backgroundColor: colors.error, opacity: pressed ? 0.88 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Stop speaking"
        >
          <Ionicons name="stop" size={16} color={colors.primaryText} />
          <Text style={[styles.stopText, { color: colors.primaryText }]}>Stop</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: "center",
      paddingHorizontal: 16,
      zIndex: 1000,
      elevation: 8,
    },
    bar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 999,
      borderWidth: 1,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12,
      shadowRadius: 8,
    },
    label: { flex: 1, fontSize: 15, fontWeight: "600" },
    stopBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 999,
    },
    stopText: { fontSize: 14, fontWeight: "700" },
  });
}

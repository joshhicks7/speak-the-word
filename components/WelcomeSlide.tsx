import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ThemeColors } from "../constants/theme";

type Props = {
  title: string;
  body: string;
  icon: keyof typeof Ionicons.glyphMap;
  colors: ThemeColors;
};

export function WelcomeSlide({ title, body, icon, colors }: Props) {
  return (
    <View style={styles.slide}>
      <Ionicons name={icon} size={56} color={colors.primary} style={styles.icon} />
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  slide: { flex: 1, justifyContent: "center", paddingHorizontal: 28, paddingBottom: 48 },
  icon: { marginBottom: 24, alignSelf: "center" },
  title: { fontSize: 26, fontWeight: "700", textAlign: "center", marginBottom: 16 },
  body: { fontSize: 17, lineHeight: 26, textAlign: "center" },
});

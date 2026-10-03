import React from "react";
import { View, Text, StyleSheet } from "react-native";
import type { ThemeColors } from "../constants/theme";

type Props = {
  message: string;
  colors: ThemeColors;
};

export function CoachBanner({ message, colors }: Props) {
  return (
    <View style={[styles.banner, { backgroundColor: colors.primary + "18", borderColor: colors.primary }]}>
      <Text style={[styles.text, { color: colors.text }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  text: { fontSize: 15, lineHeight: 22 },
});

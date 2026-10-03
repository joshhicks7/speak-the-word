import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useThemeColors, type ThemeColors } from "../constants/theme";

type Props = {
  reference: string;
};

export function HubPendingVerseBanner({ reference }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.banner, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
      <Text style={[styles.ref, { color: colors.primary }]}>{reference}</Text>
      <Text style={[styles.hint, { color: colors.textMuted }]}>
        Say practice, read, or add. Say a new reference to switch (e.g. John 3 16, or 3 16 for same book).
      </Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    banner: {
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      marginBottom: 16,
    },
    ref: { fontSize: 17, fontWeight: "700", marginBottom: 4 },
    hint: { fontSize: 14, lineHeight: 20 },
  });
}

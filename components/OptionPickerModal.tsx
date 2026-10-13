import React, { useMemo } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColors, type ThemeColors } from "../constants/theme";

export type OptionPickerItem = {
  value: string | null;
  label: string;
  detail?: string;
};

type Props = {
  visible: boolean;
  title: string;
  options: OptionPickerItem[];
  selectedValue: string | null;
  onSelect: (value: string | null) => void;
  onClose: () => void;
};

export function OptionPickerModal({
  visible,
  title,
  options,
  selectedValue,
  onSelect,
  onClose,
}: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.card, { backgroundColor: colors.surface }]} onPress={() => {}}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <ScrollView style={styles.list} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {options.map((opt) => {
              const selected =
                (opt.value ?? null) === (selectedValue ?? null) ||
                (opt.value != null && opt.value === selectedValue);
              return (
                <Pressable
                  key={opt.value ?? "__auto__"}
                  style={({ pressed }) => [
                    styles.row,
                    {
                      backgroundColor: selected ? colors.primary + "18" : pressed ? colors.border + "40" : "transparent",
                    },
                  ]}
                  onPress={() => {
                    onSelect(opt.value);
                    onClose();
                  }}
                >
                  <View style={styles.rowText}>
                    <Text style={[styles.rowLabel, { color: colors.text }]}>{opt.label}</Text>
                    {opt.detail ? (
                      <Text style={[styles.rowDetail, { color: colors.textMuted }]} numberOfLines={2}>
                        {opt.detail}
                      </Text>
                    ) : null}
                  </View>
                  {selected ? <Ionicons name="checkmark" size={22} color={colors.primary} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable style={styles.cancel} onPress={onClose} accessibilityRole="button">
            <Text style={[styles.cancelText, { color: colors.textMuted }]}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(_colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
    },
    card: {
      width: "100%",
      maxWidth: 400,
      maxHeight: "80%",
      borderRadius: 16,
      padding: 16,
    },
    title: { fontSize: 18, fontWeight: "600", marginBottom: 12 },
    list: { maxHeight: 360, marginBottom: 8 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      paddingHorizontal: 10,
      borderRadius: 10,
      marginBottom: 4,
    },
    rowText: { flex: 1, paddingRight: 8 },
    rowLabel: { fontSize: 16, fontWeight: "500" },
    rowDetail: { fontSize: 13, marginTop: 2, lineHeight: 18 },
    cancel: { paddingVertical: 12, alignItems: "center" },
    cancelText: { fontSize: 16 },
  });
}

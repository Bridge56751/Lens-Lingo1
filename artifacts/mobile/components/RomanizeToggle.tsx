import React from "react";
import { StyleSheet, Text, TouchableOpacity, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";
import { isNonLatinLanguage } from "@/lib/romanize";

// A compact, self-contained toggle that shows/hides the romanization reading aid
// for a section. Renders nothing for Latin-script languages, so callers can drop
// it anywhere without their own non-Latin check.
export function RomanizeToggle({
  language,
  active,
  onToggle,
  style,
}: {
  language: string;
  active: boolean;
  onToggle: () => void;
  style?: ViewStyle;
}) {
  const colors = useColors();
  const t = useT();
  if (!isNonLatinLanguage(language)) return null;
  return (
    <TouchableOpacity
      onPress={() => {
        Haptics.selectionAsync();
        onToggle();
      }}
      activeOpacity={0.8}
      hitSlop={8}
      style={[
        styles.pill,
        { backgroundColor: active ? colors.primary : colors.primarySoft },
        style,
      ]}
    >
      <Ionicons name="text" size={14} color={active ? "#FFFFFF" : colors.primary} />
      <Text
        style={[
          styles.label,
          { color: active ? "#FFFFFF" : colors.primary, fontFamily: "Inter_600SemiBold" },
        ]}
      >
        {active ? t("conv.hideRomanization") : t("conv.romanize")}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  label: { fontSize: 13 },
});

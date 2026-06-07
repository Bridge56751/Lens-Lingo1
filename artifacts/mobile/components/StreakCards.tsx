import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useT } from "@/hooks/useT";

function StreakCard({
  emoji,
  trophy,
  value,
  label,
  gradient,
  numColor,
  labelColor,
  watermarkIcon,
  watermarkColor,
  sparkleColor,
}: {
  emoji?: string;
  trophy?: boolean;
  value: number;
  label: string;
  gradient: [string, string];
  numColor: string;
  labelColor: string;
  watermarkIcon: keyof typeof Ionicons.glyphMap;
  watermarkColor: string;
  sparkleColor: string;
}) {
  return (
    <LinearGradient
      colors={gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      {/* Background graphic */}
      <View style={styles.watermark} pointerEvents="none">
        <Ionicons name={watermarkIcon} size={138} color={watermarkColor} />
      </View>
      {/* Sparkles */}
      <View pointerEvents="none">
        <Ionicons name="sparkles" size={16} color={sparkleColor} style={styles.sparkle1} />
        <Ionicons name="sparkles" size={11} color={sparkleColor} style={styles.sparkle2} />
        <Ionicons name="star" size={9} color={sparkleColor} style={styles.sparkle3} />
      </View>

      <View style={styles.iconBox}>
        {trophy ? (
          <Ionicons name="trophy" size={26} color={numColor} />
        ) : (
          <Text style={{ fontSize: 26 }}>{emoji}</Text>
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.num, { color: numColor, fontFamily: "Inter_700Bold" }]}>
          {value}
        </Text>
        <Text
          style={[styles.label, { color: labelColor, fontFamily: "Inter_700Bold" }]}
          numberOfLines={2}
        >
          {label}
        </Text>
      </View>
    </LinearGradient>
  );
}

export function StreakCards({
  streak,
  bestStreak,
}: {
  streak: number;
  bestStreak: number;
}) {
  const t = useT();
  return (
    <View style={styles.row}>
      <StreakCard
        emoji="🔥"
        value={streak}
        label={t("home.dailyStreak")}
        gradient={["#FFF1DA", "#FFD8A8"]}
        numColor="#C2410C"
        labelColor="#9A3412"
        watermarkIcon="flame"
        watermarkColor="rgba(245,158,11,0.28)"
        sparkleColor="rgba(234,88,12,0.45)"
      />
      <StreakCard
        trophy
        value={bestStreak}
        label={t("home.bestStreak")}
        gradient={["#E3F8EC", "#BFEFD2"]}
        numColor="#047857"
        labelColor="#15803D"
        watermarkIcon="trophy"
        watermarkColor="rgba(4,120,87,0.22)"
        sparkleColor="rgba(21,128,61,0.45)"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12 },
  card: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 20,
    overflow: "hidden",
  },
  watermark: {
    position: "absolute",
    right: -28,
    bottom: -34,
  },
  sparkle1: { position: "absolute", top: 8, right: 14 },
  sparkle2: { position: "absolute", top: 30, right: 40 },
  sparkle3: { position: "absolute", bottom: 14, right: 22 },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  num: { fontSize: 28, letterSpacing: -0.5, lineHeight: 32 },
  label: { fontSize: 12.5, lineHeight: 15, marginTop: 1 },
});

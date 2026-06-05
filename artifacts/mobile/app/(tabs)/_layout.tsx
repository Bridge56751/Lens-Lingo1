import { Tabs, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";

function ScanTabButton() {
  const colors = useColors();
  return (
    <View style={styles.scanWrap} pointerEvents="box-none">
      <Pressable
        style={({ pressed }) => [
          styles.scanButton,
          {
            backgroundColor: colors.primary,
            transform: [{ scale: pressed ? 0.94 : 1 }],
          },
        ]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          router.push("/scan");
        }}
      >
        <Ionicons name="scan" size={26} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

export default function TabLayout() {
  const t = useT();
  const colors = useColors();

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.mutedForeground,
          headerShown: false,
          tabBarStyle: {
            position: "absolute",
            backgroundColor: colors.card,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            elevation: 0,
            ...(Platform.OS === "web" ? { height: 84 } : {}),
          },
          tabBarBackground: () => (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.card }]} />
          ),
          tabBarLabelStyle: {
            fontFamily: "Inter_500Medium",
            fontSize: 11,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: t("tabs.home"),
            tabBarIcon: ({ color }) => (
              <Ionicons name="home-outline" size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="history"
          options={{
            title: t("tabs.history"),
            tabBarIcon: ({ color }) => (
              <Ionicons name="time-outline" size={24} color={color} />
            ),
          }}
        />
      </Tabs>
      <ScanTabButton />
    </View>
  );
}

const styles = StyleSheet.create({
  scanWrap: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 28 : 18,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  scanButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#7C5CFF",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
});

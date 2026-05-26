import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  ScrollView,
  Platform,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

const LANGUAGES = [
  "Spanish",
  "French",
  "German",
  "Italian",
  "Portuguese",
  "Japanese",
  "Chinese",
  "Korean",
  "Arabic",
  "Russian",
  "Hindi",
  "Dutch",
];

export default function ScanScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [selectedLanguage, setSelectedLanguage] = useState("Spanish");
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [scannedImage, setScannedImage] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{
    itemName: string;
    itemNameTranslated: string;
    conversationId: number;
    initialMessage: string;
  } | null>(null);

  const pulseAnim = useSharedValue(1);
  const rotateAnim = useSharedValue(0);

  const startScanAnimation = () => {
    pulseAnim.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
    rotateAnim.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.linear }),
      -1,
      false,
    );
  };

  const stopScanAnimation = () => {
    pulseAnim.value = withTiming(1, { duration: 300 });
    rotateAnim.value = withTiming(0, { duration: 300 });
  };

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnim.value }],
  }));

  const rotateStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotateAnim.value * 360}deg` }],
  }));

  const pickImage = async (fromCamera: boolean) => {
    let result;

    if (fromCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission required", "Camera access is needed to scan items.");
        return;
      }
      result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.7,
        base64: true,
        allowsEditing: true,
        aspect: [4, 3],
      });
    } else {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.7,
        base64: true,
        allowsEditing: true,
        aspect: [4, 3],
      });
    }

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const base64 = asset.base64;
      if (!base64) return;

      setScannedImage(asset.uri);
      setScanResult(null);
      await scanItem(base64);
    }
  };

  const scanItem = async (imageBase64: string) => {
    setIsScanning(true);
    startScanAnimation();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const baseUrl =
        process.env.EXPO_PUBLIC_DOMAIN
          ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
          : "";

      const response = await fetch(`${baseUrl}/api/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64,
          targetLanguage: selectedLanguage,
          nativeLanguage: "English",
        }),
      });

      if (!response.ok) {
        throw new Error(`Scan failed: ${response.status}`);
      }

      const data = (await response.json()) as {
        conversationId: number;
        itemName: string;
        itemNameTranslated: string;
        initialMessage: string;
      };

      setScanResult(data);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Scan failed", "Could not identify the item. Please try again.");
      setScannedImage(null);
    } finally {
      setIsScanning(false);
      stopScanAnimation();
    }
  };

  const openConversation = () => {
    if (!scanResult) return;
    router.push(`/conversation/${scanResult.conversationId}`);
  };

  const reset = () => {
    setScannedImage(null);
    setScanResult(null);
  };

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 + 84 : insets.bottom + 80;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPadding + 12 }]}>
        <Text style={[styles.appTitle, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>
          LinguaScan
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Scan anything. Learn any language.
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Language Selector */}
        <View style={styles.languageSection}>
          <Text style={[styles.label, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            Learning
          </Text>
          <TouchableOpacity
            style={[styles.languageButton, { backgroundColor: colors.card, borderColor: colors.primary }]}
            onPress={() => setShowLanguagePicker(!showLanguagePicker)}
            activeOpacity={0.7}
          >
            <Text style={[styles.languageText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
              {selectedLanguage}
            </Text>
            <Ionicons
              name={showLanguagePicker ? "chevron-up" : "chevron-down"}
              size={18}
              color={colors.primary}
            />
          </TouchableOpacity>

          {showLanguagePicker && (
            <View style={[styles.languagePicker, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                {LANGUAGES.map((lang) => (
                  <TouchableOpacity
                    key={lang}
                    style={[
                      styles.languageOption,
                      selectedLanguage === lang && { backgroundColor: colors.scanOverlay },
                    ]}
                    onPress={() => {
                      setSelectedLanguage(lang);
                      setShowLanguagePicker(false);
                      Haptics.selectionAsync();
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.languageOptionText,
                        { color: selectedLanguage === lang ? colors.primary : colors.foreground },
                        { fontFamily: selectedLanguage === lang ? "Inter_600SemiBold" : "Inter_400Regular" },
                      ]}
                    >
                      {lang}
                    </Text>
                    {selectedLanguage === lang && (
                      <Ionicons name="checkmark" size={18} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        {/* Image Preview Area */}
        <Animated.View style={[styles.imageContainer, pulseStyle]}>
          {scannedImage ? (
            <View style={styles.imageWrapper}>
              <Image source={{ uri: scannedImage }} style={styles.previewImage} />
              {isScanning && (
                <View style={styles.scanningOverlay}>
                  <Animated.View style={rotateStyle}>
                    <Ionicons name="scan-outline" size={60} color={colors.primary} />
                  </Animated.View>
                  <Text style={[styles.scanningText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                    Identifying...
                  </Text>
                </View>
              )}
              {!isScanning && (
                <TouchableOpacity style={styles.resetButton} onPress={reset}>
                  <Ionicons name="close-circle" size={28} color="#FFFFFF" />
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View
              style={[
                styles.placeholder,
                { backgroundColor: colors.card, borderColor: colors.scanBorder },
              ]}
            >
              <View style={styles.scanIcon}>
                <Ionicons name="camera-outline" size={56} color={colors.primary} />
              </View>
              <Text style={[styles.placeholderText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                Point your camera at any object
              </Text>
            </View>
          )}
        </Animated.View>

        {/* Scan Result */}
        {scanResult && !isScanning && (
          <View style={[styles.resultCard, { backgroundColor: colors.card, borderColor: colors.primary }]}>
            <View style={styles.resultHeader}>
              <View>
                <Text style={[styles.resultItem, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
                  {scanResult.itemName}
                </Text>
                <View style={styles.translationRow}>
                  <Text style={[styles.translationArrow, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                    in {selectedLanguage}:
                  </Text>
                  <Text style={[styles.translatedWord, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>
                    {scanResult.itemNameTranslated}
                  </Text>
                </View>
              </View>
              <View style={[styles.successBadge, { backgroundColor: colors.primary }]}>
                <Ionicons name="checkmark" size={20} color="#FFFFFF" />
              </View>
            </View>
            <TouchableOpacity
              style={[styles.startButton, { backgroundColor: colors.accent }]}
              onPress={openConversation}
              activeOpacity={0.8}
            >
              <Text style={[styles.startButtonText, { fontFamily: "Inter_600SemiBold" }]}>
                Start Conversation
              </Text>
              <Ionicons name="chatbubbles-outline" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        )}

        {/* Action Buttons */}
        {!scanResult && !isScanning && (
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.primary }]}
              onPress={() => pickImage(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="camera" size={24} color="#FFFFFF" />
              <Text style={[styles.actionBtnText, { fontFamily: "Inter_600SemiBold" }]}>
                Take Photo
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, styles.secondaryBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => pickImage(false)}
              activeOpacity={0.8}
            >
              <Ionicons name="images-outline" size={24} color={colors.foreground} />
              <Text style={[styles.actionBtnText, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                Gallery
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {isScanning && (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Analyzing image...
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  appTitle: {
    fontSize: 28,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 20,
  },
  languageSection: {
    gap: 8,
  },
  label: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  languageButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  languageText: {
    fontSize: 16,
  },
  languagePicker: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  languageOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  languageOptionText: {
    fontSize: 15,
  },
  imageContainer: {
    borderRadius: 20,
    overflow: "hidden",
  },
  imageWrapper: {
    position: "relative",
    borderRadius: 20,
    overflow: "hidden",
  },
  previewImage: {
    width: "100%",
    height: 260,
    borderRadius: 20,
  },
  scanningOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(244, 247, 249, 0.85)",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    borderRadius: 20,
  },
  scanningText: {
    fontSize: 16,
  },
  resetButton: {
    position: "absolute",
    top: 12,
    right: 12,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 20,
  },
  placeholder: {
    height: 220,
    borderRadius: 20,
    borderWidth: 2,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  scanIcon: {
    opacity: 0.7,
  },
  placeholderText: {
    fontSize: 14,
  },
  resultCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 20,
    gap: 16,
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  resultItem: {
    fontSize: 22,
  },
  translationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  translationArrow: {
    fontSize: 14,
  },
  translatedWord: {
    fontSize: 20,
  },
  successBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  startButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  startButtonText: {
    fontSize: 16,
    color: "#FFFFFF",
  },
  actionButtons: {
    flexDirection: "row",
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
  },
  secondaryBtn: {
    borderWidth: 1,
  },
  actionBtnText: {
    fontSize: 15,
    color: "#FFFFFF",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingText: {
    fontSize: 14,
  },
  scanOverlay: {
    backgroundColor: "rgba(26, 155, 138, 0.12)",
  },
  scanBorder: {
    borderColor: "#1A9B8A",
  },
});

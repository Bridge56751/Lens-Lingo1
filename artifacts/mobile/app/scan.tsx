import React, { useState, useRef, useCallback } from "react";
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
  Modal,
  Pressable,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { CameraView, useCameraPermissions } from "expo-camera";
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
import { usePreferences, DIFFICULTIES, type Difficulty } from "@/hooks/usePreferences";
import { useRomanizations } from "@/hooks/useRomanizations";
import { RomanizeToggle } from "@/components/RomanizeToggle";
import { useT } from "@/hooks/useT";
import { getDeviceIdSync } from "@/lib/device";
import { speakWord, stopSpeaking, prefetchSpeech } from "@/lib/speech";

export default function ScanScreen() {
  const t = useT();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const { prefs, update } = usePreferences();
  const selectedLanguage = prefs.targetLanguage;
  const [levelPickerOpen, setLevelPickerOpen] = useState(false);
  const [scannedImage, setScannedImage] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{
    itemName: string;
    itemNameTranslated: string;
    conversationId: number;
    initialMessage: string;
  } | null>(null);
  const [showRoman, setShowRoman] = useState(false);
  const itemRoman = useRomanizations(
    scanResult ? [scanResult.itemNameTranslated] : [],
    selectedLanguage,
    showRoman,
  );

  const pulseAnim = useSharedValue(1);

  const startScanAnimation = () => {
    pulseAnim.value = withRepeat(
      withSequence(
        withTiming(1.04, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  };

  const stopScanAnimation = () => {
    pulseAnim.value = withTiming(1, { duration: 300 });
  };

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnim.value }],
  }));

  const handleCapture = async () => {
    if (!cameraRef.current || isScanning) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: true,
        skipProcessing: true,
      });
      if (!photo?.base64) return;
      setScannedImage(photo.uri);
      setScanResult(null);
      await scanItem(photo.base64);
    } catch (err) {
      Alert.alert(t("scan.captureFailedTitle"), t("scan.captureFailedBody"));
    }
  };

  const handleGallery = async () => {
    if (isScanningRef.current) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.7,
        base64: true,
        allowsEditing: true,
        aspect: [4, 3],
      });
      if (!result.canceled && result.assets[0]?.base64) {
        setScannedImage(result.assets[0].uri);
        setScanResult(null);
        await scanItem(result.assets[0].base64);
      }
    } catch (err) {
      Alert.alert(t("scan.scanFailedTitle"), t("scan.scanFailedBody"));
    }
  };

  const isScanningRef = useRef(false);

  const scanItem = async (imageBase64: string) => {
    if (isScanningRef.current) return;
    isScanningRef.current = true;
    setIsScanning(true);
    startScanAnimation();

    try {
      const baseUrl = process.env.EXPO_PUBLIC_DOMAIN
        ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
        : "";

      const response = await fetch(`${baseUrl}/api/scan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(getDeviceIdSync() ? { "x-device-id": getDeviceIdSync()! } : {}),
        },
        body: JSON.stringify({
          imageBase64,
          targetLanguage: selectedLanguage,
          nativeLanguage: prefs.nativeLanguage,
          difficulty: prefs.difficulty,
        }),
      });

      if (!response.ok) throw new Error(`Scan failed: ${response.status}`);

      const data = (await response.json()) as {
        conversationId: number;
        itemName: string;
        itemNameTranslated: string;
        initialMessage: string;
      };

      setScanResult(data);
      // Warm the TTS cache so the "tap to hear" button plays instantly.
      prefetchSpeech(data.itemNameTranslated, selectedLanguage);
      prefetchSpeech(data.initialMessage, selectedLanguage);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(t("scan.scanFailedTitle"), t("scan.scanFailedBody"));
      setScannedImage(null);
    } finally {
      isScanningRef.current = false;
      setIsScanning(false);
      stopScanAnimation();
    }
  };

  const isOpeningRef = useRef(false);
  const [isOpening, setIsOpening] = useState(false);
  // Unmount the live camera whenever the screen is not focused. Native camera
  // previews render above overlying React views, so without this the camera
  // bleeds through on top of any screen we navigate to (e.g. "Just chat").
  const [screenFocused, setScreenFocused] = useState(true);

  useFocusEffect(
    useCallback(() => {
      isOpeningRef.current = false;
      setIsOpening(false);
      setScreenFocused(true);
      return () => {
        setScreenFocused(false);
        stopSpeaking();
      };
    }, []),
  );

  const openConversation = () => {
    if (!scanResult || isOpeningRef.current) return;
    isOpeningRef.current = true;
    setIsOpening(true);
    // Unmount the live camera before navigating. The native camera preview
    // renders above all RN views, so if the scan modal stays mounted under the
    // conversation (router.push) the camera bleeds through on top of the chat.
    // Replacing the route tears the scan screen (and its camera) down entirely
    // and drops us straight into the conversation.
    setScreenFocused(false);
    router.replace(`/conversation/${scanResult.conversationId}`);
  };

  const reset = () => {
    stopSpeaking();
    isOpeningRef.current = false;
    setIsOpening(false);
    setScannedImage(null);
    setScanResult(null);
  };

  const speakTranslation = () => {
    if (!scanResult) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    speakWord(scanResult.itemNameTranslated, selectedLanguage);
  };

  const speakSample = () => {
    if (!scanResult) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    speakWord(scanResult.initialMessage, selectedLanguage);
  };

  const topPadding = Platform.OS === "web" ? 16 : insets.top;
  // The scan screen is a pushed route with no bottom tab bar, so the controls
  // sit right at the very bottom edge (just clear of the home indicator).
  const bottomPadding = Platform.OS === "web" ? 24 : insets.bottom + 16;

  // Full-bleed camera with a centered scan frame (corner brackets). The frame
  // is clamped to leave room for the top guidance and bottom controls.
  const { width: screenW, height: screenH } = useWindowDimensions();
  const frameWidth = Math.min(screenW - 48, 420);
  const frameHeight = Math.max(
    220,
    Math.min(Math.round(frameWidth * 1.3), screenH - (topPadding + 170) - (bottomPadding + 190)),
  );

  // RESULT SCREEN
  if (scannedImage && scanResult && !isScanning) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.resultHeader, { paddingTop: topPadding + 8 }]}>
          <TouchableOpacity onPress={reset} style={styles.iconButton} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={26} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.resultHeaderTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
            {t("scan.identified")}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          contentContainerStyle={[styles.resultScroll, { paddingBottom: bottomPadding + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.resultCardNew, { backgroundColor: colors.card }]}>
            <Image source={{ uri: scannedImage }} style={styles.resultImage} />
            <View style={styles.resultBody}>
              <View style={styles.resultTitleRow}>
                <Text style={[styles.resultEnglish, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
                  {scanResult.itemName}
                </Text>
                <TouchableOpacity
                  style={[styles.speakerDot, { backgroundColor: colors.primarySoft }]}
                  onPress={speakTranslation}
                  activeOpacity={0.7}
                  hitSlop={8}
                >
                  <Ionicons name="volume-medium" size={16} color={colors.primary} />
                </TouchableOpacity>
              </View>
              <Text style={[styles.resultTranslation, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>
                {scanResult.itemNameTranslated}
              </Text>
              {itemRoman.get(scanResult.itemNameTranslated) ? (
                <Text style={[styles.resultLanguage, { color: colors.primary, fontStyle: "italic", fontFamily: "Inter_500Medium" }]}>
                  {itemRoman.get(scanResult.itemNameTranslated)}
                </Text>
              ) : null}
              <Text style={[styles.resultLanguage, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                {selectedLanguage}
              </Text>

              <RomanizeToggle
                language={selectedLanguage}
                active={showRoman}
                onToggle={() => setShowRoman((v) => !v)}
                style={{ marginTop: 10 }}
              />

              <View style={[styles.exampleBox, { backgroundColor: colors.primarySoft }]}>
                <View style={styles.exampleHeader}>
                  <Text style={[styles.exampleLabel, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                    {t("scan.tutorSays")}
                  </Text>
                  <TouchableOpacity
                    style={[styles.speakerDot, { backgroundColor: colors.card }]}
                    onPress={speakSample}
                    activeOpacity={0.7}
                    hitSlop={8}
                  >
                    <Ionicons name="volume-medium" size={16} color={colors.primary} />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.exampleText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                  {scanResult.initialMessage}
                </Text>
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: isOpening ? 0.6 : 1 }]}
            onPress={openConversation}
            disabled={isOpening}
            activeOpacity={0.85}
          >
            {isOpening ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="chatbubbles" size={20} color="#FFFFFF" />
            )}
            <Text style={[styles.primaryButtonText, { fontFamily: "Inter_600SemiBold" }]}>
              {t("scan.startConversation")}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={reset} activeOpacity={0.7} style={styles.linkButton}>
            <Text style={[styles.linkButtonText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
              {t("scan.scanAnother")}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // CAMERA / SCAN SCREEN
  const hasCameraPermission = permission?.granted;
  const canUseCamera = Platform.OS !== "web" && hasCameraPermission;

  return (
    <View style={[styles.container, { backgroundColor: "#0A0A12" }]}>
      {/* Viewfinder */}
      <View style={styles.viewfinder}>
        {canUseCamera && !scannedImage && screenFocused ? (
          <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
        ) : scannedImage ? (
          <Image source={{ uri: scannedImage }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.cameraPlaceholder]}>
            <Ionicons name="camera-outline" size={64} color="rgba(255,255,255,0.4)" />
            <Text style={[styles.placeholderText, { fontFamily: "Inter_500Medium" }]}>
              {Platform.OS === "web" ? t("scan.cameraUnavailableWeb") : t("scan.cameraNeeded")}
            </Text>
            {Platform.OS !== "web" && !hasCameraPermission && (
              <TouchableOpacity
                style={[styles.permissionButton, { backgroundColor: colors.primary }]}
                onPress={requestPermission}
                activeOpacity={0.8}
              >
                <Text style={[styles.permissionButtonText, { fontFamily: "Inter_600SemiBold" }]}>
                  {t("scan.enableCamera")}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Scanning indicator, centered over the live camera */}
        <View style={styles.frameLayer}>
          <Animated.View style={[styles.scanFrame, { width: frameWidth, height: frameHeight }, pulseStyle]}>
            {isScanning && (
              <View style={styles.scanningBadge}>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={[styles.scanningBadgeText, { fontFamily: "Inter_600SemiBold" }]}>
                  {t("scan.identifying")}
                </Text>
              </View>
            )}
          </Animated.View>
        </View>
      </View>

      {/* Top zone: close + level/language chips + guidance */}
      <View style={[styles.topZone, { paddingTop: topPadding + 8, pointerEvents: "box-none" }]}>
        <View style={styles.topRow}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.topChips}>
            <TouchableOpacity
              style={styles.topIconButton}
              onPress={() => setLevelPickerOpen(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="school-outline" size={18} color="#FFFFFF" />
              <Text style={[styles.topIconText, { fontFamily: "Inter_600SemiBold" }]}>
                {t(`difficulty.${prefs.difficulty}` as const)}
              </Text>
              <Ionicons name="chevron-down" size={15} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>

            <View style={styles.langBadge}>
              <Ionicons name="globe-outline" size={18} color="rgba(255,255,255,0.85)" />
              <Text style={[styles.langBadgeText, { fontFamily: "Inter_600SemiBold" }]}>
                {selectedLanguage}
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.guidance, { pointerEvents: "none" }]}>
          <Text style={[styles.scanTitle, { fontFamily: "Inter_700Bold" }]}>
            {t("scan.title")}
          </Text>
          <Text style={[styles.scanSubtitle, { fontFamily: "Inter_500Medium" }]}>
            {t("scan.hint")}
          </Text>
        </View>
      </View>

      {/* Difficulty picker */}
      <Modal
        visible={levelPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLevelPickerOpen(false)}
      >
        <Pressable style={styles.levelBackdrop} onPress={() => setLevelPickerOpen(false)}>
          <Pressable
            style={[styles.levelCard, { backgroundColor: colors.card }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.levelTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              {t("scan.chooseLevel")}
            </Text>
            {DIFFICULTIES.map((level) => {
              const active = level === prefs.difficulty;
              return (
                <TouchableOpacity
                  key={level}
                  style={[styles.levelOption, active && { backgroundColor: colors.primarySoft }]}
                  onPress={() => {
                    update("difficulty", level as Difficulty);
                    setLevelPickerOpen(false);
                    Haptics.selectionAsync();
                  }}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.levelOptionText,
                        {
                          color: active ? colors.primary : colors.foreground,
                          fontFamily: active ? "Inter_600SemiBold" : "Inter_500Medium",
                        },
                      ]}
                    >
                      {t(`difficulty.${level}` as const)}
                    </Text>
                    <Text
                      style={[
                        styles.levelOptionSub,
                        { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
                      ]}
                    >
                      {t(`difficulty.${level}Desc` as const)}
                    </Text>
                  </View>
                  {active && <Ionicons name="checkmark" size={20} color={colors.primary} />}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Bottom controls: capture row */}
      <View style={[styles.bottomArea, { paddingBottom: bottomPadding }]}>
        <View style={styles.bottomRow}>
          <TouchableOpacity
            style={styles.sideButton}
            onPress={() => router.dismissTo("/(tabs)/history")}
            activeOpacity={0.7}
          >
            <Ionicons name="time-outline" size={22} color="#FFFFFF" />
            <Text style={[styles.sideButtonText, { fontFamily: "Inter_500Medium" }]}>
              {t("scan.history")}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleCapture}
            activeOpacity={0.85}
            disabled={isScanning || !canUseCamera}
            style={styles.captureWrap}
          >
            <View style={[styles.captureOuter, { opacity: !canUseCamera ? 0.4 : 1 }]}>
              <View style={[styles.captureInner, { backgroundColor: isScanning ? colors.primary : "#FFFFFF" }]}>
                {isScanning ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="scan" size={26} color={colors.primary} />
                )}
              </View>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.sideButton}
            onPress={handleGallery}
            activeOpacity={0.7}
          >
            <Ionicons name="images-outline" size={22} color="#FFFFFF" />
            <Text style={[styles.sideButtonText, { fontFamily: "Inter_500Medium" }]}>
              {t("scan.gallery")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  viewfinder: { ...StyleSheet.absoluteFillObject },
  cameraPlaceholder: {
    backgroundColor: "#1A1B2E",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  placeholderText: { color: "rgba(255,255,255,0.6)", fontSize: 14 },
  permissionButton: {
    marginTop: 8,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 22,
  },
  permissionButtonText: { color: "#FFFFFF", fontSize: 14 },

  frameLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
  },
  scanFrame: {
    alignItems: "center",
    justifyContent: "center",
  },

  scanningBadge: {
    position: "absolute",
    bottom: -44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(124,92,255,0.95)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  scanningBadgeText: { color: "#FFFFFF", fontSize: 13 },

  topZone: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  topChips: {
    flexDirection: "row",
    gap: 8,
  },
  guidance: {
    marginTop: 28,
    alignItems: "center",
    gap: 6,
  },
  scanTitle: {
    color: "#FFFFFF",
    fontSize: 28,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  scanSubtitle: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 15,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  topIconButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 22,
  },
  topIconText: { color: "#FFFFFF", fontSize: 13 },
  langBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.3)",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 22,
  },
  langBadgeText: { color: "rgba(255,255,255,0.85)", fontSize: 13 },
  levelBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  levelCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 20,
    padding: 16,
    gap: 4,
  },
  levelTitle: { fontSize: 18, paddingHorizontal: 8, paddingTop: 4, paddingBottom: 8 },
  levelOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
  },
  levelOptionText: { fontSize: 15 },
  levelOptionSub: { fontSize: 11, marginTop: 2 },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },

  bottomArea: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    gap: 18,
    paddingTop: 16,
    pointerEvents: "box-none",
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    paddingHorizontal: 32,
  },
  sideButton: { alignItems: "center", gap: 4, width: 64 },
  sideButtonText: { color: "#FFFFFF", fontSize: 11 },
  captureWrap: { alignItems: "center", justifyContent: "center" },
  captureOuter: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.85)",
    padding: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  captureInner: {
    flex: 1,
    width: "100%",
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },

  // Result screen
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  iconButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  resultHeaderTitle: { flex: 1, textAlign: "center", fontSize: 16 },
  resultScroll: { paddingHorizontal: 20, paddingTop: 8, gap: 16 },
  resultCardNew: {
    borderRadius: 22,
    overflow: "hidden",
    shadowColor: "#1A1B2E",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 3,
  },
  resultImage: { width: "100%", height: 240, backgroundColor: "#F0F0F5" },
  resultBody: { padding: 20, gap: 4 },
  resultTitleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  resultEnglish: { fontSize: 24 },
  speakerDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  resultTranslation: { fontSize: 22, marginTop: 6 },
  resultLanguage: { fontSize: 13, marginTop: 2 },
  exampleBox: {
    marginTop: 16,
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  exampleHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  exampleLabel: { fontSize: 11, textTransform: "uppercase", letterSpacing: 1 },
  exampleText: { fontSize: 14, lineHeight: 20 },

  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 16,
  },
  primaryButtonText: { color: "#FFFFFF", fontSize: 16 },
  linkButton: { alignItems: "center", paddingVertical: 8 },
  linkButtonText: { fontSize: 14 },
});

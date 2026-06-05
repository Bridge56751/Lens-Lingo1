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
import { usePreferences, LANGUAGES, type Language } from "@/hooks/usePreferences";
import { useT } from "@/hooks/useT";
import { getDeviceIdSync } from "@/lib/device";
import { speakWord, stopSpeaking } from "@/lib/speech";

function CornerBrackets({ color }: { color: string }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.corner, styles.cornerTL, { borderColor: color }]} />
      <View style={[styles.corner, styles.cornerTR, { borderColor: color }]} />
      <View style={[styles.corner, styles.cornerBL, { borderColor: color }]} />
      <View style={[styles.corner, styles.cornerBR, { borderColor: color }]} />
    </View>
  );
}

export default function ScanScreen() {
  const t = useT();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const { prefs, update } = usePreferences();
  const selectedLanguage = prefs.targetLanguage;
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

  useFocusEffect(
    useCallback(() => {
      isOpeningRef.current = false;
      setIsOpening(false);
      return () => {
        stopSpeaking();
      };
    }, []),
  );

  const openConversation = () => {
    if (!scanResult || isOpeningRef.current) return;
    isOpeningRef.current = true;
    setIsOpening(true);
    router.push(`/conversation/${scanResult.conversationId}`);
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

  const topPadding = Platform.OS === "web" ? 16 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 + 84 : insets.bottom + 90;

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
              <Text style={[styles.resultLanguage, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                {selectedLanguage}
              </Text>

              <View style={[styles.exampleBox, { backgroundColor: colors.primarySoft }]}>
                <Text style={[styles.exampleLabel, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                  {t("scan.tutorSays")}
                </Text>
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
        {canUseCamera && !scannedImage ? (
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

        {/* Dim overlay around frame */}
        <View pointerEvents="none" style={styles.dimOverlay}>
          <View style={styles.dimSide} />
          <View style={styles.dimMiddle}>
            <View style={styles.dimSide} />
            <Animated.View style={[styles.scanFrame, pulseStyle]}>
              <CornerBrackets color="#FFFFFF" />
              {isScanning && (
                <View style={styles.scanningBadge}>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={[styles.scanningBadgeText, { fontFamily: "Inter_600SemiBold" }]}>
                    {t("scan.identifying")}
                  </Text>
                </View>
              )}
            </Animated.View>
            <View style={styles.dimSide} />
          </View>
          <View style={styles.dimSide} />
        </View>
      </View>

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: topPadding + 8 }]} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <Ionicons name="close" size={22} color="#FFFFFF" />
        </TouchableOpacity>

        <View style={{ flex: 1 }} />

        <TouchableOpacity
          style={styles.topIconButton}
          onPress={() => setShowLanguagePicker(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="globe-outline" size={18} color="#FFFFFF" />
          <Text style={[styles.topIconText, { fontFamily: "Inter_600SemiBold" }]}>
            {selectedLanguage}
          </Text>
          <Ionicons name="chevron-down" size={16} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Hint text */}
      <View pointerEvents="none" style={[styles.hintWrap, { top: "38%" }]}>
        <View style={styles.hintPill}>
          <Text style={[styles.hintText, { fontFamily: "Inter_500Medium" }]}>
            {t("scan.hint")}
          </Text>
        </View>
      </View>

      {/* Bottom controls */}
      <View
        style={[
          styles.bottomBar,
          { paddingBottom: bottomPadding },
        ]}
      >
        <TouchableOpacity
          style={styles.sideButton}
          onPress={() => router.push("/history")}
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

      {/* Language picker modal */}
      <Modal
        visible={showLanguagePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLanguagePicker(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowLanguagePicker(false)}>
          <Pressable
            style={[styles.modalCard, { backgroundColor: colors.card }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              {t("scan.chooseLanguage")}
            </Text>
            <ScrollView style={{ maxHeight: 380 }}>
              {LANGUAGES.map((lang) => {
                const active = lang === selectedLanguage;
                return (
                  <TouchableOpacity
                    key={lang}
                    style={[
                      styles.langOption,
                      active && { backgroundColor: colors.primarySoft },
                    ]}
                    onPress={() => {
                      update("targetLanguage", lang as Language);
                      setShowLanguagePicker(false);
                      Haptics.selectionAsync();
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.langOptionText,
                        {
                          color: active ? colors.primary : colors.foreground,
                          fontFamily: active ? "Inter_600SemiBold" : "Inter_400Regular",
                        },
                      ]}
                    >
                      {lang}
                    </Text>
                    {active && <Ionicons name="checkmark" size={20} color={colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const FRAME_SIZE = 280;

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

  dimOverlay: { ...StyleSheet.absoluteFillObject },
  dimSide: { flex: 1, backgroundColor: "rgba(10,10,18,0.55)" },
  dimMiddle: { flexDirection: "row", height: FRAME_SIZE },
  scanFrame: {
    width: FRAME_SIZE,
    height: FRAME_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },

  corner: {
    position: "absolute",
    width: 36,
    height: 36,
    borderColor: "#FFFFFF",
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 12 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 12 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 12 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 12 },

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

  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
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
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },

  hintWrap: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  hintPill: {
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
  },
  hintText: { color: "#FFFFFF", fontSize: 13 },

  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 32,
    paddingTop: 20,
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

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 20,
    padding: 16,
    gap: 8,
  },
  modalTitle: { fontSize: 18, paddingHorizontal: 8, paddingTop: 4, paddingBottom: 8 },
  langOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 12,
  },
  langOptionText: { fontSize: 15 },
});

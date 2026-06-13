import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Modal,
  Pressable,
  Switch,
  TextInput,
  Alert,
  ActivityIndicator,
  LayoutAnimation,
  UIManager,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import {
  usePreferences,
  LANGUAGES,
  LANGUAGE_FLAGS,
  DIFFICULTIES,
  type Language,
  type Difficulty,
} from "@/hooks/usePreferences";
import { useT } from "@/hooks/useT";
import {
  useSubscription,
  REVENUECAT_ENTITLEMENT_IDENTIFIER,
  openManageSubscriptions,
} from "@/lib/revenuecat";
import { LOCALE_NATIVE_NAMES, type Locale } from "@/constants/translations";
import { useListOpenaiConversations, useDeleteAccount, setDeviceId } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth, useClerk, useUser } from "@clerk/expo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { resetDeviceId } from "@/lib/device";
import { computeStreak, computeBestStreak } from "@/lib/streak";
import { useActivity } from "@/hooks/useActivity";
import { StreakCards } from "@/components/StreakCards";
import { LinearGradient } from "expo-linear-gradient";
import {
  downloadOfflinePack,
  getPackState,
  type OfflineProgress,
  type PackState,
} from "@/lib/offlinePack";

function Row({
  icon,
  iconBg,
  iconColor,
  title,
  subtitle,
  right,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
}) {
  const colors = useColors();
  const Wrapper: any = onPress ? TouchableOpacity : View;
  return (
    <Wrapper
      style={[styles.row, { backgroundColor: colors.card }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.rowIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.rowSubtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </Wrapper>
  );
}

// Collapsible accordion section. Tapping the header expands/collapses its rows
// with a smooth layout animation. Keeps the Settings screen tidy and scales as
// more groups get added later.
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function Section({
  title,
  icon,
  iconBg,
  iconColor,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const colors = useColors();
  const [open, setOpen] = useState(defaultOpen);
  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((o) => !o);
    Haptics.selectionAsync();
  };
  return (
    <View style={{ gap: 8 }}>
      <TouchableOpacity
        style={[styles.sectionHeader, { backgroundColor: colors.card }]}
        onPress={toggle}
        activeOpacity={0.7}
      >
        <View style={[styles.sectionHeaderIcon, { backgroundColor: iconBg }]}>
          <Ionicons name={icon} size={17} color={iconColor} />
        </View>
        <Text
          style={[styles.sectionHeaderTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}
        >
          {title}
        </Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={18}
          color={colors.mutedForeground}
        />
      </TouchableOpacity>
      {open ? <View style={{ gap: 8 }}>{children}</View> : null}
    </View>
  );
}

type PickerKind = "learning" | "difficulty" | null;

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { prefs, update } = usePreferences();
  const { isSubscribed, isLoading: subLoading, restore, isRestoring, customerInfo } = useSubscription();
  const { data: conversations } = useListOpenaiConversations();
  const { events: activityEvents } = useActivity();
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();
  const accountEmail =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    null;

  // Streaks are derived from conversation activity. Best streak is a high-water
  // mark that must never drop even if conversations are deleted, so persist it
  // in preferences (this used to live on the home screen).
  const { streak, bestStreak } = useMemo(() => {
    // Count ANY practice toward the streak: merge server conversation
    // timestamps with the local practice-activity log.
    const dates = [
      ...(conversations ?? []).map((c) => c.createdAt),
      ...activityEvents,
    ];
    const current = computeStreak(dates);
    const best = Math.max(computeBestStreak(dates), current, prefs.bestStreak ?? 0);
    return { streak: current, bestStreak: best };
  }, [conversations, activityEvents, prefs.bestStreak]);

  useEffect(() => {
    if (bestStreak > (prefs.bestStreak ?? 0)) {
      update("bestStreak", bestStreak);
    }
  }, [bestStreak, prefs.bestStreak, update]);

  const [picker, setPicker] = useState<PickerKind>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(prefs.displayName);
  const [deleting, setDeleting] = useState(false);
  const [restoreResult, setRestoreResult] = useState<
    "restored" | "nothing" | "error" | null
  >(null);

  const handleRestore = async () => {
    if (isRestoring) return;
    Haptics.selectionAsync();
    try {
      const info = await restore();
      const active =
        info?.entitlements?.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER] !== undefined;
      setRestoreResult(active ? "restored" : "nothing");
    } catch {
      setRestoreResult("error");
    }
  };

  // Send subscribers to the OS subscription management sheet (App Store / Play
  // Store) where plan changes (monthly → annual) and cancellation actually
  // happen — the app never cancels a subscription itself. If nothing can be
  // opened (e.g. the web preview), tell the user to manage it from the store.
  const handleManagePlan = async () => {
    Haptics.selectionAsync();
    let opened = false;
    try {
      opened = await openManageSubscriptions(customerInfo?.managementURL ?? null);
    } catch {
      opened = false;
    }
    if (!opened) {
      Alert.alert(t("pro.manageUnavailableTitle"), t("pro.manageUnavailableBody"));
    }
  };

  // Offline download state, scoped to the current language pair.
  const queryClient = useQueryClient();
  const { mutateAsync: deleteAccountMutation } = useDeleteAccount();

  // Permanently removes the account/device data both server-side (cascades all
  // conversations, messages, and vocab) and locally (Clerk user, sign-out, every
  // @linguascan/* AsyncStorage key, cached queries), then re-provisions a fresh
  // anonymous device id so the session continues as a brand-new empty user.
  // Apple guideline 5.1.1(v) requires this be available in-app.
  const performDeleteAccount = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      // Delete server data first, while the Clerk session token is still valid,
      // so the row removed is the account row (resolved by Clerk user id) and not
      // the anonymous device row the server would fall back to once the token is
      // revoked by user.delete() below.
      await deleteAccountMutation();

      // Delete the Clerk user itself. A failure here is fatal: we must not report
      // success while the account still exists (Apple 5.1.1(v)).
      if (isSignedIn && user) {
        await user.delete();
        try {
          await signOut();
        } catch {
          // The user is already deleted; sign-out is best effort.
        }
      }

      // Wipe every local key, then re-provision a fresh anonymous identity and
      // push it to the API client so subsequent requests use the new device id
      // (not the just-deleted one) for the rest of this session.
      try {
        const keys = await AsyncStorage.getAllKeys();
        const ours = keys.filter((k) => k.startsWith("@linguascan/"));
        if (ours.length) await AsyncStorage.multiRemove(ours);
      } catch {
        // ignore — best effort
      }
      const freshId = await resetDeviceId();
      setDeviceId(freshId);
      queryClient.clear();

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/");
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(t("settings.deleteFailedTitle"), t("settings.deleteFailedBody"));
    } finally {
      setDeleting(false);
    }
  };

  const confirmDeleteAccount = () => {
    if (deleting) return;
    Haptics.selectionAsync();
    Alert.alert(t("settings.deleteAccountTitle"), t("settings.deleteAccountConfirm"), [
      { text: t("settings.deleteCancel"), style: "cancel" },
      {
        text: t("settings.deleteConfirmCta"),
        style: "destructive",
        onPress: () => {
          void performDeleteAccount();
        },
      },
    ]);
  };
  const [packState, setPackState] = useState<PackState | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<OfflineProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Identifies the current in-flight download so a stale async tail (e.g. after
  // cancel + restart) can't clobber a newer run's UI state.
  const runIdRef = useRef(0);

  useEffect(() => {
    let alive = true;
    getPackState(prefs.targetLanguage, prefs.nativeLanguage).then((s) => {
      if (alive) setPackState(s);
    });
    return () => {
      alive = false;
    };
  }, [prefs.targetLanguage, prefs.nativeLanguage]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const startDownload = async () => {
    if (downloading) return;
    Haptics.selectionAsync();
    const controller = new AbortController();
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    abortRef.current = controller;
    const isCurrent = () => runIdRef.current === runId;
    setDownloading(true);
    setProgress({ phase: "content", completed: 0, total: 1 });
    try {
      await downloadOfflinePack({
        queryClient,
        target: prefs.targetLanguage,
        native: prefs.nativeLanguage,
        signal: controller.signal,
        onProgress: (p) => {
          if (isCurrent()) setProgress(p);
        },
      });
      if (isCurrent() && !controller.signal.aborted) {
        const s = await getPackState(prefs.targetLanguage, prefs.nativeLanguage);
        setPackState(s);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      if (isCurrent() && !controller.signal.aborted) {
        Alert.alert(t("offline.errorTitle"), t("offline.errorBody"));
      }
    } finally {
      // Only the current run may reset shared UI state — a stale tail must not
      // clobber a newer download started after cancel.
      if (isCurrent()) {
        setDownloading(false);
        setProgress(null);
        abortRef.current = null;
      }
    }
  };

  const cancelDownload = () => {
    runIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setDownloading(false);
    setProgress(null);
  };

  const progressPct =
    progress && progress.total > 0 ? progress.completed / progress.total : 0;

  const topPadding = Platform.OS === "web" ? 16 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom + 16;

  const saveName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed) update("displayName", trimmed);
    setEditingName(false);
    Haptics.selectionAsync();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          {t("settings.title")}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 18, paddingBottom: bottomPadding, gap: 14 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Profile card */}
        <LinearGradient
          colors={["#7C5CFF", "#5326CC"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.profileCard}
        >
          {/* Decorative globe */}
          <View style={styles.profileGlobe} pointerEvents="none">
            <Ionicons name="earth" size={104} color="rgba(255,255,255,0.16)" />
          </View>

          <View style={styles.profileTop}>
            {/* Avatar */}
            <View style={styles.avatarWrap}>
              <View style={styles.avatarLg}>
                <Ionicons name="person" size={24} color={colors.primary} />
              </View>
            </View>

            {/* Name + language + subtitle */}
            <View style={styles.profileMid}>
              {editingName ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <TextInput
                    value={nameDraft}
                    onChangeText={setNameDraft}
                    autoFocus
                    style={[styles.nameInput, { color: "#FFFFFF", borderColor: "rgba(255,255,255,0.7)", fontFamily: "Inter_700Bold" }]}
                    placeholderTextColor="rgba(255,255,255,0.6)"
                    onSubmitEditing={saveName}
                    returnKeyType="done"
                    maxLength={20}
                  />
                  <TouchableOpacity onPress={saveName} activeOpacity={0.7}>
                    <Ionicons name="checkmark-circle" size={26} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.nameRow}>
                  <Text style={[styles.profileName, { color: "#FFFFFF", fontFamily: "Inter_700Bold" }]} numberOfLines={1}>
                    {prefs.displayName}
                  </Text>
                  <TouchableOpacity
                    style={styles.nameEdit}
                    onPress={() => {
                      setNameDraft(prefs.displayName);
                      setEditingName(true);
                      Haptics.selectionAsync();
                    }}
                    activeOpacity={0.8}
                    hitSlop={8}
                  >
                    <Ionicons name="pencil" size={12} color={colors.primary} />
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity
                onPress={() => setPicker("learning")}
                activeOpacity={0.8}
                style={styles.learningPill}
              >
                <Ionicons name="globe" size={14} color={colors.primary} />
                <Text style={[styles.learningPillText, { color: colors.primary, fontFamily: "Inter_700Bold" }]} numberOfLines={1}>
                  {t("settings.learningSub", { lang: prefs.targetLanguage })}
                </Text>
                <Ionicons name="chevron-down" size={14} color={colors.primary} />
              </TouchableOpacity>

              {isSignedIn && accountEmail ? (
                <View style={styles.accountEmailRow}>
                  <Ionicons name="checkmark-circle" size={15} color="#FFFFFF" />
                  <Text style={[styles.profileSignInSub, { color: "rgba(255,255,255,0.92)", fontFamily: "Inter_600SemiBold" }]} numberOfLines={1}>
                    {accountEmail}
                  </Text>
                </View>
              ) : (
                <Text style={[styles.profileSignInSub, { color: "rgba(255,255,255,0.82)", fontFamily: "Inter_400Regular" }]}>
                  {isSignedIn ? t("settings.signedInAs") : t("settings.signInSub")}
                </Text>
              )}
            </View>
          </View>

          {isSignedIn ? (
            <TouchableOpacity
              style={styles.profileSignOut}
              onPress={async () => {
                Haptics.selectionAsync();
                await signOut();
              }}
              activeOpacity={0.85}
            >
              <Ionicons name="log-out-outline" size={16} color="#FFFFFF" />
              <Text style={[styles.profileSignOutText, { color: "#FFFFFF", fontFamily: "Inter_700Bold" }]}>
                {t("settings.signOut")}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.profileSignIn}
              onPress={() => {
                Haptics.selectionAsync();
                router.push("/auth");
              }}
              activeOpacity={0.9}
            >
              <Ionicons name="mail" size={18} color={colors.primary} />
              <Text style={[styles.profileSignInText, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>
                {t("settings.signInCta")}
              </Text>
            </TouchableOpacity>
          )}
        </LinearGradient>

        {/* Activity */}
        <StreakCards streak={streak} bestStreak={bestStreak} />

        {/* Membership */}
        <Section
          title={t("pro.section")}
          icon="sparkles"
          iconBg={colors.primary}
          iconColor="#FFFFFF"
          defaultOpen
        >
          <Row
            icon={isSubscribed ? "checkmark-circle" : "sparkles"}
            iconBg={colors.primary}
            iconColor="#FFFFFF"
            title={isSubscribed ? t("pro.statusActiveTitle") : t("pro.upgradeTitle")}
            subtitle={isSubscribed ? t("pro.statusActiveSub") : t("pro.upgradeSub")}
            right={
              isSubscribed ? undefined : (
                <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
              )
            }
            onPress={
              isSubscribed
                ? undefined
                : () => {
                    Haptics.selectionAsync();
                    router.push("/paywall");
                  }
            }
          />
          {isSubscribed && (
            <Row
              icon="swap-horizontal"
              iconBg="#0EA5E9"
              iconColor="#FFFFFF"
              title={t("pro.manageTitle")}
              subtitle={t("pro.manageSub")}
              right={<Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />}
              onPress={handleManagePlan}
            />
          )}
          <Row
            icon="refresh"
            iconBg="#64748B"
            iconColor="#FFFFFF"
            title={t("pro.restoreTitle")}
            subtitle={t("pro.restoreSub")}
            right={
              isRestoring ? (
                <ActivityIndicator size="small" color={colors.mutedForeground} />
              ) : (
                <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
              )
            }
            onPress={handleRestore}
          />
        </Section>

        {/* Restore result (custom modal, not Alert) */}
        <Modal
          visible={restoreResult !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setRestoreResult(null)}
        >
          <Pressable
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.45)",
              justifyContent: "center",
              paddingHorizontal: 36,
            }}
            onPress={() => setRestoreResult(null)}
          >
            <Pressable
              style={{
                borderRadius: 22,
                padding: 22,
                alignItems: "center",
                gap: 10,
                backgroundColor: colors.card,
              }}
              onPress={(e) => e.stopPropagation()}
            >
              <View
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 30,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: restoreResult === "error" ? "#FEE2E2" : colors.primarySoft,
                }}
              >
                <Ionicons
                  name={
                    restoreResult === "restored"
                      ? "checkmark-circle"
                      : restoreResult === "error"
                        ? "alert-circle"
                        : "information-circle"
                  }
                  size={32}
                  color={restoreResult === "error" ? "#DC2626" : colors.primary}
                />
              </View>
              <Text
                style={{
                  fontSize: 17,
                  textAlign: "center",
                  color: colors.foreground,
                  fontFamily: "Inter_700Bold",
                }}
              >
                {restoreResult === "restored"
                  ? t("paywall.restoredTitle")
                  : restoreResult === "nothing"
                    ? t("paywall.nothingTitle")
                    : t("paywall.errorTitle")}
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  textAlign: "center",
                  lineHeight: 20,
                  color: colors.mutedForeground,
                  fontFamily: "Inter_400Regular",
                }}
              >
                {restoreResult === "restored"
                  ? t("paywall.restoredBody")
                  : restoreResult === "nothing"
                    ? t("paywall.nothingBody")
                    : t("paywall.errorBody")}
              </Text>
              <TouchableOpacity
                style={{
                  alignSelf: "stretch",
                  height: 46,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: 8,
                  backgroundColor: colors.primary,
                }}
                onPress={() => setRestoreResult(null)}
                activeOpacity={0.9}
              >
                <Text style={{ fontSize: 15, color: "#FFFFFF", fontFamily: "Inter_700Bold" }}>
                  {t("paywall.gotIt")}
                </Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Daily goal */}
        <Row
          icon="checkmark-circle"
          iconBg="#16A34A"
          iconColor="#FFFFFF"
          title={t("home.dailyGoal")}
          subtitle={t("settings.dailyGoalSub")}
          right={<Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />}
          onPress={() => {
            Haptics.selectionAsync();
            router.push("/progress");
          }}
        />

        {/* Preferences */}
        <Section
          title={t("settings.preferences")}
          icon="options"
          iconBg="#F59E0B"
          iconColor="#FFFFFF"
        >
          <Row
            icon="phone-portrait"
            iconBg="#F59E0B"
            iconColor="#FFFFFF"
            title={t("settings.haptics")}
            subtitle={t("settings.hapticsSub")}
            right={
              <Switch
                value={prefs.hapticsEnabled}
                onValueChange={(v) => {
                  update("hapticsEnabled", v);
                  if (v) Haptics.selectionAsync();
                }}
                trackColor={{ false: colors.muted, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            }
          />
          <Row
            icon="school"
            iconBg="#8B5CF6"
            iconColor="#FFFFFF"
            title={t("settings.difficulty")}
            subtitle={t(`difficulty.${prefs.difficulty}` as const)}
            right={<Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />}
            onPress={() => setPicker("difficulty")}
          />
          <Row
            icon="notifications"
            iconBg="#EC4899"
            iconColor="#FFFFFF"
            title={t("settings.daily")}
            subtitle={t("settings.dailySub")}
            right={
              <Switch
                value={prefs.notificationsEnabled}
                onValueChange={(v) => update("notificationsEnabled", v)}
                trackColor={{ false: colors.muted, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            }
          />
        </Section>

        {/* Offline */}
        <Section
          title={t("offline.title")}
          icon="cloud-download"
          iconBg="#3B82F6"
          iconColor="#FFFFFF"
        >
          <View style={[styles.offlineCard, { backgroundColor: colors.card }]}>
            <View style={styles.offlineHeadRow}>
              <View style={[styles.rowIcon, { backgroundColor: "#3B82F6" }]}>
                <Ionicons name="cloud-download" size={18} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                  {t("offline.download", { lang: prefs.targetLanguage })}
                </Text>
                <Text style={[styles.rowSubtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  {downloading
                    ? t(`offline.phase.${progress?.phase ?? "content"}` as const)
                    : packState
                      ? t("offline.downloaded", { count: packState.clips })
                      : t("offline.subtitle")}
                </Text>
              </View>
              {!downloading && packState ? (
                <Ionicons name="checkmark-circle" size={22} color="#22C55E" />
              ) : null}
            </View>

            {downloading && progress ? (
              <>
                <View style={[styles.offlineTrack, { backgroundColor: colors.muted }]}>
                  <View
                    style={[
                      styles.offlineFill,
                      { backgroundColor: colors.primary, width: `${Math.round(progressPct * 100)}%` },
                    ]}
                  />
                </View>
                <View style={styles.offlineProgressRow}>
                  <Text style={[styles.offlineProgressText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                    {progress.total > 1
                      ? t("offline.progress", { current: progress.completed, total: progress.total })
                      : ""}
                  </Text>
                  <TouchableOpacity onPress={cancelDownload} activeOpacity={0.7} hitSlop={8}>
                    <Text style={[styles.offlineCancel, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                      {t("offline.cancel")}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <TouchableOpacity
                style={[styles.offlineBtn, { backgroundColor: colors.primary }]}
                onPress={startDownload}
                activeOpacity={0.85}
              >
                <Ionicons name={packState ? "refresh" : "cloud-download"} size={16} color="#FFFFFF" />
                <Text style={[styles.offlineBtnText, { fontFamily: "Inter_600SemiBold" }]}>
                  {packState ? t("offline.redownload") : t("offline.start")}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </Section>

        {/* About */}
        <Section
          title={t("settings.about")}
          icon="information-circle"
          iconBg="#64748B"
          iconColor="#FFFFFF"
        >
          <Row
            icon="help-circle"
            iconBg="#16A34A"
            iconColor="#FFFFFF"
            title={t("settings.help")}
            right={<Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />}
            onPress={() =>
              Alert.alert(t("settings.helpAlertTitle"), t("settings.helpAlertBody"))
            }
          />
          <Row
            icon="information-circle"
            iconBg="#64748B"
            iconColor="#FFFFFF"
            title={t("settings.version")}
            subtitle="1.0.0"
          />
        </Section>

        {/* Danger zone — Apple guideline 5.1.1(v) in-app account deletion */}
        <Section
          title={t("settings.dangerZone")}
          icon="warning"
          iconBg="#DC2626"
          iconColor="#FFFFFF"
        >
          <Row
            icon="trash"
            iconBg="#DC2626"
            iconColor="#FFFFFF"
            title={t("settings.deleteAccountTitle")}
            subtitle={t("settings.deleteAccountSub")}
            right={
              deleting ? (
                <ActivityIndicator size="small" color="#DC2626" />
              ) : (
                <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
              )
            }
            onPress={deleting ? undefined : confirmDeleteAccount}
          />
        </Section>
      </ScrollView>

      {/* Learning-language picker modal (also reused for difficulty) */}
      <Modal
        visible={picker !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPicker(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setPicker(null)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              {picker === "difficulty"
                ? t("settings.chooseDifficulty")
                : t("settings.chooseLearning")}
            </Text>
            {picker === "difficulty" ? (
              <View>
                {DIFFICULTIES.map((level) => {
                  const active = level === prefs.difficulty;
                  return (
                    <TouchableOpacity
                      key={level}
                      style={[
                        styles.langOption,
                        active && { backgroundColor: colors.primarySoft },
                      ]}
                      onPress={() => {
                        update("difficulty", level as Difficulty);
                        setPicker(null);
                        Haptics.selectionAsync();
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.langOptionText,
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
                            styles.langOptionSub,
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
              </View>
            ) : (
            <ScrollView style={{ maxHeight: 420 }}>
              {LANGUAGES.map((lang) => {
                const active = lang === prefs.targetLanguage;
                const nativeName =
                  LOCALE_NATIVE_NAMES[lang as Locale] ?? lang;
                // Free users keep English + their current language unlocked; the rest are Pro-gated.
                const locked = !isSubscribed && !subLoading && lang !== "English" && !active;
                return (
                  <TouchableOpacity
                    key={lang}
                    style={[
                      styles.langOption,
                      active && { backgroundColor: colors.primarySoft },
                    ]}
                    onPress={() => {
                      if (active) {
                        setPicker(null);
                        return;
                      }
                      // Tier still resolving — no-op so a free user can't slip a
                      // paid switch and a Pro user isn't wrongly gated; retry once loaded.
                      if (subLoading) {
                        return;
                      }
                      // Locked languages route to the paywall; English and the
                      // current language stay free to select.
                      if (locked) {
                        setPicker(null);
                        router.push({ pathname: "/paywall", params: { feature: "langs" } });
                        return;
                      }
                      const apply = () => {
                        update("targetLanguage", lang as Language);
                        setPicker(null);
                        Haptics.selectionAsync();
                      };
                      if (lang === prefs.nativeLanguage) {
                        const title = t("settings.sameLangTitle");
                        const body = t("settings.sameLangBody", { lang });
                        if (Platform.OS === "web") {
                          if (typeof window !== "undefined" && window.confirm(`${title}\n\n${body}`)) {
                            apply();
                          } else {
                            setPicker(null);
                          }
                        } else {
                          Alert.alert(title, body, [
                            { text: t("history.cancel"), style: "cancel" },
                            {
                              text: t("settings.continueAnyway"),
                              style: "destructive",
                              onPress: apply,
                            },
                          ]);
                        }
                        return;
                      }
                      apply();
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.langFlag, locked && { opacity: 0.45 }]}>
                      {LANGUAGE_FLAGS[lang as Language]}
                    </Text>
                    <View style={[{ flex: 1 }, locked && { opacity: 0.45 }]}>
                      <Text
                        style={[
                          styles.langOptionText,
                          {
                            color: active ? colors.primary : colors.foreground,
                            fontFamily: active ? "Inter_600SemiBold" : "Inter_500Medium",
                            textAlign: "left",
                            writingDirection: "ltr",
                          },
                        ]}
                      >
                        {nativeName}
                      </Text>
                      {nativeName !== lang && (
                        <Text
                          style={[
                            styles.langOptionSub,
                            {
                              color: colors.mutedForeground,
                              fontFamily: "Inter_400Regular",
                              textAlign: "left",
                              writingDirection: "ltr",
                            },
                          ]}
                        >
                          {lang}
                        </Text>
                      )}
                    </View>
                    {active ? (
                      <Ionicons name="checkmark" size={20} color={colors.primary} />
                    ) : locked ? (
                      <Ionicons name="lock-closed" size={16} color={colors.mutedForeground} />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17 },

  profileCard: {
    padding: 18,
    borderRadius: 24,
    gap: 14,
    overflow: "hidden",
  },
  profileGlobe: {
    position: "absolute",
    right: -16,
    top: 8,
  },
  profileTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatarWrap: {
    width: 46,
    height: 46,
  },
  avatarLg: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  nameEdit: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  profileMid: {
    flex: 1,
    minWidth: 0,
    gap: 8,
    paddingRight: 40,
  },
  profileName: { fontSize: 24, letterSpacing: -0.4, flexShrink: 1 },
  learningPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  learningPillText: { fontSize: 11.5, flexShrink: 1 },
  profileSignInSub: { fontSize: 13, flexShrink: 1 },
  profileSignIn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 15,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
  },
  profileSignInText: { fontSize: 16 },
  profileSignOut: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  profileSignOutText: { fontSize: 15 },
  accountEmailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  nameInput: {
    fontSize: 22,
    borderBottomWidth: 1.5,
    paddingVertical: 2,
    paddingHorizontal: 2,
    minWidth: 120,
    flexShrink: 1,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  sectionHeaderIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionHeaderTitle: { flex: 1, fontSize: 15 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    gap: 12,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: { fontSize: 15 },
  rowSubtitle: { fontSize: 12, marginTop: 2 },

  offlineCard: { borderRadius: 16, padding: 14, gap: 12 },
  offlineHeadRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  offlineTrack: { height: 8, borderRadius: 4, overflow: "hidden" },
  offlineFill: { height: "100%", borderRadius: 4 },
  offlineProgressRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  offlineProgressText: { fontSize: 12 },
  offlineCancel: { fontSize: 14 },
  offlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
  },
  offlineBtnText: { color: "#FFFFFF", fontSize: 15 },

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
    paddingVertical: 12,
    borderRadius: 12,
  },
  langFlag: { fontSize: 24, marginRight: 12 },
  langOptionText: { fontSize: 15 },
  langOptionSub: { fontSize: 11, marginTop: 2 },
});

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
  DIFFICULTIES,
  type Language,
  type Difficulty,
} from "@/hooks/usePreferences";
import { useT } from "@/hooks/useT";
import { LOCALE_NATIVE_NAMES, type Locale } from "@/constants/translations";
import { useListOpenaiConversations } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { computeStreak, computeBestStreak } from "@/lib/streak";
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
  const { data: conversations } = useListOpenaiConversations();

  // Streaks are derived from conversation activity. Best streak is a high-water
  // mark that must never drop even if conversations are deleted, so persist it
  // in preferences (this used to live on the home screen).
  const { streak, bestStreak } = useMemo(() => {
    const dates = (conversations ?? []).map((c) => c.createdAt);
    const current = computeStreak(dates);
    const best = Math.max(computeBestStreak(dates), current, prefs.bestStreak ?? 0);
    return { streak: current, bestStreak: best };
  }, [conversations, prefs.bestStreak]);

  useEffect(() => {
    if (bestStreak > (prefs.bestStreak ?? 0)) {
      update("bestStreak", bestStreak);
    }
  }, [bestStreak, prefs.bestStreak, update]);

  const [picker, setPicker] = useState<PickerKind>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(prefs.displayName);

  // Offline download state, scoped to the current language pair.
  const queryClient = useQueryClient();
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
      >
        {/* Profile card */}
        <View style={[styles.profileCard, { backgroundColor: colors.card }]}>
          <View style={[styles.avatarLg, { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}>
            <Ionicons name="person" size={32} color={colors.primary} />
          </View>
          {editingName ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <TextInput
                value={nameDraft}
                onChangeText={setNameDraft}
                autoFocus
                style={[
                  styles.nameInput,
                  {
                    color: colors.foreground,
                    borderColor: colors.primary,
                    fontFamily: "Inter_700Bold",
                  },
                ]}
                onSubmitEditing={saveName}
                returnKeyType="done"
                maxLength={20}
              />
              <TouchableOpacity onPress={saveName} activeOpacity={0.7}>
                <Ionicons name="checkmark-circle" size={28} color={colors.primary} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => {
                setNameDraft(prefs.displayName);
                setEditingName(true);
              }}
              activeOpacity={0.7}
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <Text style={[styles.profileName, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
                {prefs.displayName}
              </Text>
              <Ionicons name="pencil" size={14} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
          <Text style={[styles.profileSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {t("settings.learningSub", { lang: prefs.targetLanguage })}
          </Text>
        </View>

        {/* Languages */}
        <Row
          icon="globe"
          iconBg={colors.primary}
          iconColor="#FFFFFF"
          title={t("settings.learning")}
          subtitle={prefs.targetLanguage}
          right={<Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />}
          onPress={() => setPicker("learning")}
        />

        {/* Activity */}
        <View style={styles.streakRow}>
          <View style={[styles.streakCard, { backgroundColor: "rgba(251,191,36,0.18)" }]}>
            <Text style={{ fontSize: 22 }}>🔥</Text>
            <Text style={[styles.streakNum, { color: "#B45309", fontFamily: "Inter_700Bold" }]}>
              {streak}
            </Text>
            <Text style={[styles.streakLabel, { color: "#92400E", fontFamily: "Inter_600SemiBold" }]}>
              {t("home.dailyStreak")}
            </Text>
          </View>
          <View style={[styles.streakCard, { backgroundColor: "rgba(4,120,87,0.14)" }]}>
            <Ionicons name="trophy" size={20} color="#047857" />
            <Text style={[styles.streakNum, { color: "#047857", fontFamily: "Inter_700Bold" }]}>
              {bestStreak}
            </Text>
            <Text style={[styles.streakLabel, { color: "#15803D", fontFamily: "Inter_600SemiBold" }]}>
              {t("home.bestStreak")}
            </Text>
          </View>
        </View>
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
                    <View style={{ flex: 1 }}>
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
                    {active && <Ionicons name="checkmark" size={20} color={colors.primary} />}
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
    alignItems: "center",
    padding: 22,
    borderRadius: 22,
    gap: 8,
  },
  avatarLg: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  profileName: { fontSize: 20 },
  profileSub: { fontSize: 13 },
  nameInput: {
    fontSize: 20,
    borderBottomWidth: 1.5,
    paddingVertical: 2,
    paddingHorizontal: 4,
    minWidth: 160,
    textAlign: "center",
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
  streakRow: { flexDirection: "row", gap: 10 },
  streakCard: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 16,
    borderRadius: 16,
    gap: 4,
  },
  streakNum: { fontSize: 26 },
  streakLabel: { fontSize: 12 },
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
  langOptionText: { fontSize: 15 },
  langOptionSub: { fontSize: 11, marginTop: 2 },
});

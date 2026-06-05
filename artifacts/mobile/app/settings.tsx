import React, { useState } from "react";
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
import { LOCALE_NATIVE_NAMES, LOCALES, type Locale } from "@/constants/translations";

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

type PickerKind = "learning" | "native" | "difficulty" | null;

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { prefs, update } = usePreferences();
  const [picker, setPicker] = useState<PickerKind>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(prefs.displayName);

  const topPadding = Platform.OS === "web" ? 16 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom + 16;

  const saveName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed) update("displayName", trimmed);
    setEditingName(false);
    Haptics.selectionAsync();
  };

  const nativeLabel =
    LOCALE_NATIVE_NAMES[(prefs.nativeLanguage as Locale) ?? "English"] ?? prefs.nativeLanguage;

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
        contentContainerStyle={{ padding: 18, paddingBottom: bottomPadding, gap: 22 }}
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
        <View style={{ gap: 8 }}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
            {t("settings.languages")}
          </Text>
          <Row
            icon="globe"
            iconBg={colors.primarySoft}
            iconColor={colors.primary}
            title={t("settings.learning")}
            subtitle={prefs.targetLanguage}
            right={<Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />}
            onPress={() => setPicker("learning")}
          />
          <Row
            icon="language"
            iconBg="#DBEAFE"
            iconColor="#3B82F6"
            title={t("settings.iSpeak")}
            subtitle={nativeLabel}
            right={<Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />}
            onPress={() => setPicker("native")}
          />
        </View>

        {/* Preferences */}
        <View style={{ gap: 8 }}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
            {t("settings.preferences")}
          </Text>
          <Row
            icon="phone-portrait"
            iconBg="#FEF3C7"
            iconColor="#F59E0B"
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
            iconBg="#EDE9FE"
            iconColor="#8B5CF6"
            title={t("settings.difficulty")}
            subtitle={t(`difficulty.${prefs.difficulty}` as const)}
            right={<Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />}
            onPress={() => setPicker("difficulty")}
          />
          <Row
            icon="text"
            iconBg="#FEF9C3"
            iconColor="#CA8A04"
            title={t("settings.alphabetCard")}
            subtitle={t("settings.alphabetCardSub", { lang: prefs.targetLanguage })}
            right={
              <Switch
                value={!prefs.alphabetCardHidden[prefs.targetLanguage]}
                onValueChange={(v) => {
                  update("alphabetCardHidden", {
                    ...prefs.alphabetCardHidden,
                    [prefs.targetLanguage]: !v,
                  });
                  if (v) Haptics.selectionAsync();
                }}
                trackColor={{ false: colors.muted, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            }
          />
          <Row
            icon="notifications"
            iconBg="#FCE7F3"
            iconColor="#EC4899"
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
        </View>

        {/* Activity */}
        <View style={{ gap: 8 }}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
            {t("settings.activity")}
          </Text>
          <Row
            icon="checkmark-circle"
            iconBg="#DCFCE7"
            iconColor="#22C55E"
            title={t("home.dailyGoal")}
            subtitle={t("settings.dailyGoalSub")}
            right={<Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />}
            onPress={() => {
              Haptics.selectionAsync();
              router.push("/progress");
            }}
          />
          <Row
            icon="trophy"
            iconBg="#DBEAFE"
            iconColor="#3B82F6"
            title={t("home.challenges")}
            subtitle={t("settings.challengesSub")}
            right={<Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />}
            onPress={() => {
              Haptics.selectionAsync();
              router.push("/challenges");
            }}
          />
        </View>

        {/* About */}
        <View style={{ gap: 8 }}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
            {t("settings.about")}
          </Text>
          <Row
            icon="help-circle"
            iconBg="#DCFCE7"
            iconColor="#22C55E"
            title={t("settings.help")}
            right={<Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />}
            onPress={() =>
              Alert.alert(t("settings.helpAlertTitle"), t("settings.helpAlertBody"))
            }
          />
          <Row
            icon="information-circle"
            iconBg={colors.muted}
            iconColor={colors.mutedForeground}
            title={t("settings.version")}
            subtitle="1.0.0"
          />
        </View>
      </ScrollView>

      {/* Language picker modal (used for both learning & native) */}
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
                : picker === "native"
                  ? t("settings.chooseNative")
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
              {(picker === "native" ? LOCALES : LANGUAGES).map((lang) => {
                const active =
                  picker === "native"
                    ? lang === prefs.nativeLanguage
                    : lang === prefs.targetLanguage;
                const comingSoon = picker === "native" && lang !== "English";
                const nativeName =
                  LOCALE_NATIVE_NAMES[lang as Locale] ?? lang;
                return (
                  <TouchableOpacity
                    key={lang}
                    disabled={comingSoon}
                    style={[
                      styles.langOption,
                      active && { backgroundColor: colors.primarySoft },
                      comingSoon && { opacity: 0.45 },
                    ]}
                    onPress={() => {
                      const isNative = picker === "native";
                      const other = isNative ? prefs.targetLanguage : prefs.nativeLanguage;
                      const apply = () => {
                        if (isNative) {
                          update("nativeLanguage", lang);
                        } else {
                          update("targetLanguage", lang as Language);
                        }
                        setPicker(null);
                        Haptics.selectionAsync();
                      };
                      if (lang === other) {
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
                    {comingSoon ? (
                      <View style={[styles.comingSoonBadge, { backgroundColor: colors.muted }]}>
                        <Text
                          style={[
                            styles.comingSoonText,
                            { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" },
                          ]}
                        >
                          {t("settings.nativeComingSoonTitle")}
                        </Text>
                      </View>
                    ) : (
                      active && <Ionicons name="checkmark" size={20} color={colors.primary} />
                    )}
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

  sectionLabel: { fontSize: 11, letterSpacing: 1, paddingHorizontal: 4 },
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
  comingSoonBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  comingSoonText: { fontSize: 11 },
});

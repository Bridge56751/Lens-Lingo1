import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  useListVocabSelections,
  type VocabSelection,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { usePreferences } from "@/hooks/usePreferences";
import { useT } from "@/hooks/useT";
import VocabBank from "@/components/VocabBank";
import VocabSearch from "@/components/VocabSearch";

type Tab = "myWords" | "bank" | "search";

export default function VocabularyScreen() {
  const t = useT();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { prefs } = usePreferences();
  const { data: selections } = useListVocabSelections({
    targetLanguage: prefs.targetLanguage,
  });
  const pickedWords = useMemo(
    () => (selections ?? []) as VocabSelection[],
    [selections],
  );
  const pickedCount = pickedWords.length;

  // Which picked words are checked for the next study session. Newly picked
  // words default to selected; the user can narrow the set down (e.g. 5/22).
  const [studyIds, setStudyIds] = useState<Set<number>>(new Set());
  const prevIds = useRef<Set<number>>(new Set());
  useEffect(() => {
    setStudyIds((prev) => {
      const next = new Set<number>();
      for (const w of pickedWords) {
        if (prev.has(w.id) || !prevIds.current.has(w.id)) next.add(w.id);
      }
      return next;
    });
    prevIds.current = new Set(pickedWords.map((w) => w.id));
  }, [pickedWords]);

  const allSelected = pickedCount > 0 && studyIds.size === pickedCount;

  const toggleStudy = (id: number) =>
    setStudyIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setStudyIds(allSelected ? new Set() : new Set(pickedWords.map((w) => w.id)));

  const startStudy = () => {
    if (studyIds.size === 0) return;
    const ids = pickedWords
      .filter((w) => studyIds.has(w.id))
      .map((w) => w.id)
      .join(",");
    router.push(`/vocab-study?ids=${ids}`);
  };

  const [activeTab, setActiveTab] = useState<Tab>(
    params.tab === "bank" ? "bank" : params.tab === "search" ? "search" : "myWords",
  );

  const topPadding = Platform.OS === "web" ? 16 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom + 16;

  const showMyWords = activeTab === "myWords";
  const showBank = activeTab === "bank";
  const showSearch = activeTab === "search";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          {t("vocab.title")}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.segment}>
        <SegmentButton
          label={t("vocab.myWords")}
          active={showMyWords}
          onPress={() => setActiveTab("myWords")}
          badge={pickedCount}
        />
        <SegmentButton
          label={t("vocab.bankTitle")}
          active={showBank}
          onPress={() => setActiveTab("bank")}
        />
        <SegmentButton
          label={t("vocab.search")}
          active={showSearch}
          onPress={() => setActiveTab("search")}
        />
      </View>

      {/* My Words tab — the words you picked from the bank, ready to study */}
      <View style={[styles.flex, !showMyWords && styles.hidden, { pointerEvents: showMyWords ? "auto" : "none" }]}>
        {pickedCount === 0 ? (
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="albums" size={32} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              {t("vocab.studyEmpty")}
            </Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {t("vocab.studyEmptySub", { lang: prefs.targetLanguage })}
            </Text>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              onPress={() => setActiveTab("bank")}
              activeOpacity={0.85}
            >
              <Ionicons name="book" size={18} color="#FFFFFF" />
              <Text style={[styles.primaryBtnText, { fontFamily: "Inter_600SemiBold" }]}>
                {t("vocab.openBank")}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <TouchableOpacity
              style={[
                styles.studyBtn,
                { backgroundColor: colors.primary, opacity: studyIds.size > 0 ? 1 : 0.5 },
              ]}
              onPress={startStudy}
              activeOpacity={0.85}
              disabled={studyIds.size === 0}
            >
              <Ionicons name="albums" size={18} color="#FFFFFF" />
              <Text style={[styles.studyBtnText, { fontFamily: "Inter_600SemiBold" }]}>
                {t("vocab.studySelected")}
              </Text>
              <View style={styles.studyCountPill}>
                <Text style={styles.studyCountText}>
                  {studyIds.size}/{pickedCount}
                </Text>
              </View>
            </TouchableOpacity>

            <View style={styles.selectBar}>
              <Text style={[styles.selectHint, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                {t("vocab.tapToSelect")}
              </Text>
              <TouchableOpacity onPress={toggleAll} activeOpacity={0.7} hitSlop={8}>
                <Text style={[styles.selectAll, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                  {allSelected ? t("vocab.clearSel") : t("vocab.selectAll")}
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={{ padding: 18, paddingTop: 4, paddingBottom: bottomPadding, gap: 8 }}
              showsVerticalScrollIndicator={false}
            >
              {pickedWords.map((w) => {
                const checked = studyIds.has(w.id);
                return (
                  <TouchableOpacity
                    key={w.id}
                    style={[styles.wordRow, { backgroundColor: colors.card }]}
                    onPress={() => toggleStudy(w.id)}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        checked
                          ? { backgroundColor: colors.primary, borderColor: colors.primary }
                          : { borderColor: colors.border ?? colors.mutedForeground },
                      ]}
                    >
                      {checked && <Ionicons name="checkmark" size={15} color="#FFFFFF" />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.word, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
                        {w.word}
                      </Text>
                      <Text
                        style={[styles.wordSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}
                        numberOfLines={1}
                      >
                        {w.translation}
                      </Text>
                    </View>
                    <View style={[styles.levelPill, { backgroundColor: colors.primarySoft }]}>
                      <Text style={[styles.levelText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                        {w.level}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}
      </View>

      {/* Word Bank tab — kept mounted so its selected level persists across switches */}
      <View style={[styles.flex, !showBank && styles.hidden, { pointerEvents: showBank ? "auto" : "none" }]}>
        <VocabBank />
      </View>

      {/* Search tab — find any word and add it to My Words to study later */}
      <View style={[styles.flex, !showSearch && styles.hidden, { pointerEvents: showSearch ? "auto" : "none" }]}>
        <VocabSearch />
      </View>
    </View>
  );
}

function SegmentButton({
  label,
  active,
  onPress,
  badge,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  badge?: number;
}) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.segmentBtn,
        { backgroundColor: active ? colors.card : "transparent" },
      ]}
    >
      <View style={styles.segmentInner}>
        <Text
          style={[
            styles.segmentText,
            {
              color: active ? colors.foreground : colors.mutedForeground,
              fontFamily: active ? "Inter_700Bold" : "Inter_600SemiBold",
            },
          ]}
        >
          {label}
        </Text>
        {badge != null && badge > 0 && (
          <View style={[styles.segBadge, { backgroundColor: colors.primary }]}>
            <Text style={styles.segBadgeText}>{badge}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  hidden: { display: "none" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17 },
  segment: {
    flexDirection: "row",
    marginHorizontal: 18,
    marginBottom: 12,
    padding: 4,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.05)",
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentText: { fontSize: 14 },
  segmentInner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  segBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  segBadgeText: { color: "#FFFFFF", fontSize: 11, fontFamily: "Inter_700Bold" },

  studyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginHorizontal: 18,
    marginBottom: 10,
    paddingVertical: 14,
    borderRadius: 16,
  },
  studyBtnText: { color: "#FFFFFF", fontSize: 16 },
  studyCountPill: {
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  studyCountText: { color: "#FFFFFF", fontSize: 13, fontFamily: "Inter_700Bold" },

  selectBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
  },
  selectHint: { fontSize: 12 },
  selectAll: { fontSize: 13 },

  wordRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  word: { fontSize: 16, textTransform: "capitalize" },
  wordSub: { fontSize: 13, marginTop: 2 },
  levelPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  levelText: { fontSize: 11, textTransform: "capitalize" },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 18 },
  emptySub: { fontSize: 14, textAlign: "center", maxWidth: 280 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 16,
    marginTop: 6,
  },
  primaryBtnText: { color: "#FFFFFF", fontSize: 16 },
});

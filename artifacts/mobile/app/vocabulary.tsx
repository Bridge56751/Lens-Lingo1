import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListVocabSelections,
  useBulkUpdateVocabSelections,
  getListVocabSelectionsQueryKey,
  type VocabSelection,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { usePreferences } from "@/hooks/usePreferences";
import { useT } from "@/hooks/useT";
import { ProGuard } from "@/components/ProGuard";
import VocabBank from "@/components/VocabBank";
import VocabSearch from "@/components/VocabSearch";
import { MODULE_ACCENTS } from "@/constants/colors";

const accent = MODULE_ACCENTS.vocab;

type Tab = "myWords" | "mastered" | "bank" | "search";

export default function VocabularyScreen() {
  return (
    <ProGuard>
      <VocabularyScreenInner />
    </ProGuard>
  );
}

function VocabularyScreenInner() {
  const t = useT();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { prefs } = usePreferences();
  const queryClient = useQueryClient();

  const { data: selections } = useListVocabSelections({
    targetLanguage: prefs.targetLanguage,
  });
  const pickedWords = useMemo(
    () => (selections ?? []) as VocabSelection[],
    [selections],
  );

  // Words split into the two buckets the UI moves them between.
  const learningWords = useMemo(
    () => pickedWords.filter((w) => !w.mastered),
    [pickedWords],
  );
  const masteredWords = useMemo(
    () => pickedWords.filter((w) => w.mastered),
    [pickedWords],
  );

  const [activeTab, setActiveTab] = useState<Tab>(
    params.tab === "myWords"
      ? "myWords"
      : params.tab === "mastered"
        ? "mastered"
        : params.tab === "search"
          ? "search"
          : "bank",
  );

  // Ticked words drive every bulk action. Selection is bucket-local: it is
  // cleared whenever the tab changes so a Mastered action can never run on
  // learning-word ids (and vice versa).
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    setSelectedIds(new Set());
  }, [activeTab]);

  // Drop ids that no longer exist (deleted / moved away under us).
  useEffect(() => {
    const valid = new Set(pickedWords.map((w) => w.id));
    setSelectedIds((prev) => {
      let changed = false;
      const next = new Set<number>();
      for (const id of prev) {
        if (valid.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [pickedWords]);

  const showMyWords = activeTab === "myWords";
  const showMastered = activeTab === "mastered";
  const showBank = activeTab === "bank";
  const showSearch = activeTab === "search";

  const visibleWords = showMastered ? masteredWords : learningWords;
  const selectedCount = selectedIds.size;
  const allSelected =
    visibleWords.length > 0 && visibleWords.every((w) => selectedIds.has(w.id));

  const toggleOne = (id: number) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelectedIds(
      allSelected ? new Set() : new Set(visibleWords.map((w) => w.id)),
    );

  const selectionsKey = getListVocabSelectionsQueryKey({
    targetLanguage: prefs.targetLanguage,
  });
  const bulkMutation = useBulkUpdateVocabSelections({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: selectionsKey });
        setSelectedIds(new Set());
      },
      onError: () => Alert.alert(t("vocab.actionError")),
    },
  });

  const runBulk = (action: "master" | "unmaster" | "delete") => {
    if (selectedIds.size === 0) return;
    bulkMutation.mutate({ data: { ids: [...selectedIds], action } });
  };

  const confirmDelete = () => {
    if (selectedIds.size === 0) return;
    Alert.alert(t("vocab.deleteTitle"), t("vocab.deleteMsg"), [
      { text: t("history.cancel"), style: "cancel" },
      {
        text: t("history.delete"),
        style: "destructive",
        onPress: () => runBulk("delete"),
      },
    ]);
  };

  const studySelected = () => {
    if (selectedIds.size === 0) return;
    router.push(`/vocab-study?ids=${[...selectedIds].join(",")}`);
  };

  const topPadding = Platform.OS === "web" ? 16 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom + 16;
  const barPadding = Platform.OS === "web" ? 16 : insets.bottom + 12;

  const renderBucket = (kind: "myWords" | "mastered") => {
    const words = kind === "mastered" ? masteredWords : learningWords;

    if (words.length === 0) {
      if (kind === "mastered") {
        return (
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: accent.soft }]}>
              <Ionicons name="ribbon" size={32} color={accent.color} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              {t("vocab.masteredEmptyTitle")}
            </Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {t("vocab.masteredEmptySub")}
            </Text>
          </View>
        );
      }
      return (
        <View style={styles.empty}>
          <View style={[styles.emptyIcon, { backgroundColor: accent.soft }]}>
            <Ionicons name="albums" size={32} color={accent.color} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            {t("vocab.studyEmpty")}
          </Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {t("vocab.studyEmptySub", { lang: prefs.targetLanguage })}
          </Text>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: accent.color }]}
            onPress={() => setActiveTab("bank")}
            activeOpacity={0.85}
          >
            <Ionicons name="book" size={18} color="#FFFFFF" />
            <Text style={[styles.primaryBtnText, { fontFamily: "Inter_600SemiBold" }]}>
              {t("vocab.openBank")}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <>
        <View style={styles.selectBar}>
          <Text style={[styles.selectHint, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            {selectedCount > 0
              ? t("vocab.selectedCount", { count: selectedCount })
              : t("vocab.tapToSelect")}
          </Text>
          <TouchableOpacity onPress={toggleAll} activeOpacity={0.7} hitSlop={8}>
            <Text style={[styles.selectAll, { color: accent.color, fontFamily: "Inter_600SemiBold" }]}>
              {allSelected ? t("vocab.clearSel") : t("vocab.selectAll")}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={{ padding: 18, paddingTop: 4, paddingBottom: bottomPadding, gap: 8 }}
          showsVerticalScrollIndicator={false}
        >
          {words.map((w) => (
            <WordRow
              key={w.id}
              word={w}
              checked={selectedIds.has(w.id)}
              onPress={() => toggleOne(w.id)}
              colors={colors}
            />
          ))}
        </ScrollView>

        {selectedCount > 0 && (
          <View
            style={[
              styles.actionBar,
              { backgroundColor: colors.card, paddingBottom: barPadding, borderTopColor: colors.border ?? "rgba(0,0,0,0.06)" },
            ]}
          >
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: accent.color }]}
              onPress={studySelected}
              activeOpacity={0.85}
            >
              <Ionicons name={kind === "mastered" ? "refresh" : "albums"} size={17} color="#FFFFFF" />
              <Text style={[styles.actionBtnText, { color: "#FFFFFF", fontFamily: "Inter_600SemiBold" }]}>
                {kind === "mastered" ? t("vocab.bulkReview") : t("vocab.bulkStudy")}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: accent.soft }]}
              onPress={() => runBulk(kind === "mastered" ? "unmaster" : "master")}
              activeOpacity={0.85}
              disabled={bulkMutation.isPending}
            >
              <Ionicons
                name={kind === "mastered" ? "arrow-undo" : "ribbon"}
                size={17}
                color={accent.color}
              />
              <Text style={[styles.actionBtnText, { color: accent.color, fontFamily: "Inter_600SemiBold" }]}>
                {kind === "mastered" ? t("vocab.myWords") : t("vocab.mastered")}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: "#FEE2E2" }]}
              onPress={confirmDelete}
              activeOpacity={0.85}
              disabled={bulkMutation.isPending}
            >
              <Ionicons name="trash" size={17} color="#DC2626" />
              <Text style={[styles.actionBtnText, { color: "#DC2626", fontFamily: "Inter_600SemiBold" }]}>
                {t("history.delete")}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </>
    );
  };

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

      <View style={[styles.segment, { backgroundColor: accent.soft }]}>
        <SegmentButton
          label={t("vocab.myWords")}
          active={showMyWords}
          onPress={() => setActiveTab("myWords")}
          badge={learningWords.length}
        />
        <SegmentButton
          label={t("vocab.mastered")}
          active={showMastered}
          onPress={() => setActiveTab("mastered")}
          badge={masteredWords.length}
        />
        <SegmentButton
          label={t("vocab.bankTab")}
          active={showBank}
          onPress={() => setActiveTab("bank")}
        />
        <SegmentButton
          label={t("vocab.search")}
          active={showSearch}
          onPress={() => setActiveTab("search")}
        />
      </View>

      {/* My Words — words you're still learning, ready to study or master */}
      <View style={[styles.flex, !showMyWords && styles.hidden, { pointerEvents: showMyWords ? "auto" : "none" }]}>
        {renderBucket("myWords")}
      </View>

      {/* Mastered — a "done" archive you can review or move back to My Words */}
      <View style={[styles.flex, !showMastered && styles.hidden, { pointerEvents: showMastered ? "auto" : "none" }]}>
        {renderBucket("mastered")}
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

function WordRow({
  word,
  checked,
  onPress,
  colors,
}: {
  word: VocabSelection;
  checked: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <TouchableOpacity
      style={[styles.wordRow, { backgroundColor: colors.card }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View
        style={[
          styles.checkbox,
          checked
            ? { backgroundColor: accent.color, borderColor: accent.color }
            : { borderColor: colors.border ?? colors.mutedForeground },
        ]}
      >
        {checked && <Ionicons name="checkmark" size={15} color="#FFFFFF" />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.word, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          {word.word}
        </Text>
        <Text
          style={[styles.wordSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}
          numberOfLines={1}
        >
          {word.translation}
        </Text>
      </View>
      <View style={[styles.levelPill, { backgroundColor: accent.soft }]}>
        <Text style={[styles.levelText, { color: accent.color, fontFamily: "Inter_600SemiBold" }]}>
          {word.level}
        </Text>
      </View>
    </TouchableOpacity>
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
        { backgroundColor: active ? accent.color : "transparent" },
      ]}
    >
      <View style={styles.segmentInner}>
        <Text
          numberOfLines={1}
          style={[
            styles.segmentText,
            {
              color: active ? accent.on : colors.mutedForeground,
              fontFamily: active ? "Inter_700Bold" : "Inter_600SemiBold",
            },
          ]}
        >
          {label}
        </Text>
        {badge != null && badge > 0 && (
          <View style={[styles.segBadge, { backgroundColor: active ? accent.on : accent.color }]}>
            <Text style={[styles.segBadgeText, { color: active ? accent.color : "#FFFFFF" }]}>
              {badge}
            </Text>
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
    marginHorizontal: 14,
    marginBottom: 12,
    padding: 4,
    borderRadius: 999,
    gap: 3,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 2,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentText: { fontSize: 12, flexShrink: 1 },
  segmentInner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  segBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  segBadgeText: { color: "#FFFFFF", fontSize: 10, fontFamily: "Inter_700Bold" },

  selectBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingTop: 2,
  },
  selectHint: { fontSize: 12 },
  selectAll: { fontSize: 13 },

  actionBar: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 13,
    borderRadius: 14,
  },
  actionBtnText: { fontSize: 14 },

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

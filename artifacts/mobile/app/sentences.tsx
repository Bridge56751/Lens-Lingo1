import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  useGetSentenceBank,
  getGetSentenceBankQueryKey,
  type SentencePhrase,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { usePreferences } from "@/hooks/usePreferences";
import { useRomanizations } from "@/hooks/useRomanizations";
import { RomanizeToggle } from "@/components/RomanizeToggle";
import { useT } from "@/hooks/useT";
import { speakWord, prefetchSpeech, stopSpeaking } from "@/lib/speech";
import { getBundledSentenceBank } from "@/lib/offlineAssets";
import { recordPractice } from "@/lib/activity";
import { MODULE_ACCENTS } from "@/constants/colors";

const accent = MODULE_ACCENTS.sentences;

const CATEGORIES = [
  "greetings",
  "basics",
  "directions",
  "dining",
  "shopping",
  "emergency",
] as const;
type Category = (typeof CATEGORIES)[number];

const CATEGORY_COLORS: Record<Category, { bg: string; fg: string }> = {
  greetings: { bg: "#DBEAFE", fg: "#2563EB" },
  basics: { bg: "#DCFCE7", fg: "#16A34A" },
  directions: { bg: "#FEF3C7", fg: "#D97706" },
  dining: { bg: "#FFE4E6", fg: "#E11D48" },
  shopping: { bg: "#EDE9FE", fg: "#7C3AED" },
  emergency: { bg: "#FEE2E2", fg: "#DC2626" },
};

export default function SentencesScreen() {
  const t = useT();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { prefs } = usePreferences();

  const target = prefs.targetLanguage;
  const native = prefs.nativeLanguage;

  const bundled = useMemo(
    () => getBundledSentenceBank(target, native),
    [target, native],
  );

  const { data, isLoading, isError, refetch } = useGetSentenceBank(
    { targetLanguage: target, nativeLanguage: native },
    {
      query: {
        initialData: bundled,
        queryKey: getGetSentenceBankQueryKey({
          targetLanguage: target,
          nativeLanguage: native,
        }),
      },
    },
  );

  const grouped = useMemo(() => {
    const out: Record<Category, SentencePhrase[]> = {
      greetings: [],
      basics: [],
      directions: [],
      dining: [],
      shopping: [],
      emergency: [],
    };
    for (const s of data?.sentences ?? []) {
      if ((CATEGORIES as readonly string[]).includes(s.category)) {
        out[s.category as Category].push(s);
      }
    }
    return out;
  }, [data]);

  useFocusEffect(
    React.useCallback(() => {
      return () => stopSpeaking();
    }, []),
  );

  const topPadding = Platform.OS === "web" ? 16 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 100 : insets.bottom + 100;

  const [selectedCategory, setSelectedCategory] = useState<Category>("greetings");
  const visible = grouped[selectedCategory];
  const [showRoman, setShowRoman] = useState(false);
  const roman = useRomanizations(
    (visible ?? []).map((s) => s.phrase),
    target,
    showRoman,
  );
  const isEmptyBank = CATEGORIES.every((c) => grouped[c].length === 0);

  // Warm the TTS cache for every phrase in the open category so the first tap on
  // any of them plays instantly instead of waiting on a cold synth.
  useEffect(() => {
    for (const s of visible) prefetchSpeech(s.phrase, target);
  }, [visible, target]);

  const [loadingPhrase, setLoadingPhrase] = useState<string | null>(null);
  const speakReq = React.useRef(0);

  const hear = async (phrase: string) => {
    Haptics.selectionAsync();
    void recordPractice();
    const id = ++speakReq.current;
    setLoadingPhrase(phrase);
    try {
      await speakWord(phrase, target);
    } finally {
      if (speakReq.current === id) setLoadingPhrase(null);
    }
  };

  const Header = (
    <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
      <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} activeOpacity={0.7}>
        <Ionicons name="chevron-back" size={26} color={colors.foreground} />
      </TouchableOpacity>
      <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
        {t("sentences.title")}
      </Text>
      <View style={styles.iconBtn} />
    </View>
  );

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {Header}
        <View style={styles.center}>
          <ActivityIndicator color={accent.color} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            {t("sentences.sub", { lang: target })}
          </Text>
        </View>
      </View>
    );
  }

  // Data-first: only show the error screen when we have nothing cached. A
  // background refetch that fails offline must not hide already-cached content.
  if (isError && !data) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {Header}
        <View style={styles.center}>
          <Text style={[styles.bigSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {t("sentences.error")}
          </Text>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: accent.color }]}
            onPress={() => refetch()}
            activeOpacity={0.85}
          >
            <Ionicons name="refresh" size={18} color="#FFFFFF" />
            <Text style={[styles.primaryBtnText, { fontFamily: "Inter_600SemiBold" }]}>
              {t("vocab.tryAgain")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {Header}
      <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        {t("sentences.sub", { lang: target })}
      </Text>
      <RomanizeToggle
        language={target}
        active={showRoman}
        onToggle={() => setShowRoman((v) => !v)}
        style={{ marginHorizontal: 20, marginBottom: 4 }}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsRow}
        style={styles.tabsScroll}
      >
        {CATEGORIES.map((category) => {
          const active = category === selectedCategory;
          const cc = CATEGORY_COLORS[category];
          return (
            <TouchableOpacity
              key={category}
              style={[styles.tab, { backgroundColor: active ? cc.bg : colors.card }]}
              onPress={() => {
                Haptics.selectionAsync();
                setSelectedCategory(category);
              }}
              activeOpacity={0.85}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.tabText,
                  {
                    color: active ? cc.fg : colors.mutedForeground,
                    fontFamily: "Inter_600SemiBold",
                  },
                ]}
              >
                {t(`sentences.${category}` as "sentences.greetings")}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView
        style={styles.list}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottomPadding }}
        showsVerticalScrollIndicator={false}
      >
        {isEmptyBank || visible.length === 0 ? (
          <Text style={[styles.bigSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 40 }]}>
            {t("sentences.empty")}
          </Text>
        ) : (
          visible.map((s, i) => (
            <TouchableOpacity
              key={`${selectedCategory}:${i}:${s.phrase}`}
              style={[styles.phraseCard, { backgroundColor: colors.card }]}
              onPress={() => hear(s.phrase)}
              activeOpacity={0.8}
            >
              <View style={styles.phraseTextWrap}>
                <Text
                  style={[styles.phrase, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}
                >
                  {s.phrase}
                </Text>
                {roman.get(s.phrase) ? (
                  <Text
                    style={[styles.translation, { color: accent.color, fontStyle: "italic", fontFamily: "Inter_400Regular" }]}
                  >
                    {roman.get(s.phrase)}
                  </Text>
                ) : null}
                <Text
                  style={[styles.translation, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}
                >
                  {s.translation}
                </Text>
              </View>
              <View
                style={[styles.speaker, { backgroundColor: accent.soft }]}
              >
                {loadingPhrase === s.phrase ? (
                  <ActivityIndicator size="small" color={accent.color} />
                ) : (
                  <Ionicons name="volume-high" size={20} color={accent.color} />
                )}
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
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
  subtitle: { paddingHorizontal: 20, paddingBottom: 12, fontSize: 14 },

  tabsScroll: { flexGrow: 0 },
  tabsRow: { gap: 8, paddingHorizontal: 16, paddingBottom: 14 },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  tabText: { fontSize: 13 },

  list: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 14 },
  loadingText: { fontSize: 14, textAlign: "center" },
  bigSub: { fontSize: 14, textAlign: "center", maxWidth: 300, lineHeight: 20, alignSelf: "center" },

  phraseCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    marginBottom: 8,
  },
  phraseTextWrap: { flex: 1 },
  phrase: { fontSize: 16, lineHeight: 22 },
  translation: { fontSize: 13, marginTop: 3, lineHeight: 18 },
  speaker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },

  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 16,
  },
  primaryBtnText: { color: "#FFFFFF", fontSize: 16 },
});

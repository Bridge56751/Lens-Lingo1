import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useListVocabulary } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { usePreferences } from "@/hooks/usePreferences";
import { useT } from "@/hooks/useT";
import { ProGuard } from "@/components/ProGuard";
import { speakWord, stopSpeaking } from "@/lib/speech";

type Entry = {
  word: string;
  language: string;
  count: number;
  firstSeenAt: string;
  conversationId: number;
  conversationTitle: string;
};

const DECK_SIZE = 20;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const cardKey = (e: Entry) => `${e.language}::${e.word}`;

export default function PracticeScreen() {
  return (
    <ProGuard>
      <PracticeScreenInner />
    </ProGuard>
  );
}

function PracticeScreenInner() {
  const t = useT();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { prefs } = usePreferences();
  const { data, isLoading } = useListVocabulary();

  const allEntries = useMemo(() => (data ?? []) as Entry[], [data]);

  // Practice the language the user is currently learning.
  const pool = useMemo(
    () => allEntries.filter((e) => e.language === prefs.targetLanguage),
    [allEntries, prefs.targetLanguage],
  );

  const [round, setRound] = useState(0);
  const [deck, setDeck] = useState<Entry[]>([]);
  const [originalTotal, setOriginalTotal] = useState(0);
  const [pos, setPos] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [knownKeys, setKnownKeys] = useState<Set<string>>(new Set());

  // Build the deck only on an explicit restart (round), a language change, or the
  // first time vocabulary loads — NOT on every refetch, so progress isn't lost
  // when the query refreshes mid-session.
  const builtKeyRef = useRef<string>("");
  useEffect(() => {
    const key = `${prefs.targetLanguage}::${round}`;
    if (builtKeyRef.current === key && deck.length > 0) return;
    if (pool.length === 0) return; // wait for data before building
    builtKeyRef.current = key;
    const d = shuffle(pool).slice(0, DECK_SIZE);
    setDeck(d);
    setOriginalTotal(d.length);
    setPos(0);
    setRevealed(false);
    setKnownKeys(new Set());
  }, [pool, prefs.targetLanguage, round, deck.length]);

  const card = deck[pos];
  const finished = deck.length > 0 && pos >= deck.length;

  // Auto-play the word when a new card appears so the user can listen first.
  useEffect(() => {
    if (card) speakWord(card.word, prefs.targetLanguage);
  }, [pos, card, prefs.targetLanguage]);

  // Stop any speech when leaving the screen.
  useFocusEffect(
    React.useCallback(() => {
      return () => {
        stopSpeaking();
      };
    }, []),
  );

  const topPadding = Platform.OS === "web" ? 16 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom + 16;

  const replay = () => {
    if (!card) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    speakWord(card.word, prefs.targetLanguage);
  };

  const reveal = () => {
    Haptics.selectionAsync();
    setRevealed(true);
  };

  const advance = (known: boolean) => {
    if (!card) return;
    stopSpeaking();
    Haptics.impactAsync(
      known ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
    );
    if (known) {
      setKnownKeys((prev) => new Set(prev).add(cardKey(card)));
    } else {
      // Re-queue the card so the user sees it again later this session.
      setDeck((prev) => [...prev, card]);
    }
    setRevealed(false);
    setPos((p) => p + 1);
  };

  const restart = () => {
    Haptics.selectionAsync();
    setRound((r) => r + 1);
  };

  const Header = (
    <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
      <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} activeOpacity={0.7}>
        <Ionicons name="chevron-back" size={26} color={colors.foreground} />
      </TouchableOpacity>
      <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
        {t("practice.title")}
      </Text>
      <View style={{ width: 40 }} />
    </View>
  );

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {Header}
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </View>
    );
  }

  if (pool.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {Header}
        <View style={styles.center}>
          <View style={[styles.bigIcon, { backgroundColor: colors.primarySoft }]}>
            <Ionicons name="school" size={32} color={colors.primary} />
          </View>
          <Text style={[styles.bigTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            {t("practice.empty")}
          </Text>
          <Text style={[styles.bigSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {t("practice.emptySub", { lang: prefs.targetLanguage })}
          </Text>
        </View>
      </View>
    );
  }

  if (finished) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {Header}
        <View style={styles.center}>
          <View style={[styles.bigIcon, { backgroundColor: "#DCFCE7" }]}>
            <Ionicons name="checkmark-circle" size={36} color="#22C55E" />
          </View>
          <Text style={[styles.bigTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            {t("practice.doneTitle")}
          </Text>
          <Text style={[styles.bigSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {t("practice.doneBody", { known: knownKeys.size, total: originalTotal })}
          </Text>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={restart}
            activeOpacity={0.85}
          >
            <Ionicons name="refresh" size={18} color="#FFFFFF" />
            <Text style={[styles.primaryBtnText, { fontFamily: "Inter_600SemiBold" }]}>
              {t("practice.restart")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.linkBtn}>
            <Text style={[styles.linkBtnText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
              {t("practice.close")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!card) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {Header}
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </View>
    );
  }

  const progress = (pos + 1) / deck.length;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {Header}

      <View style={[styles.progressWrap, { paddingBottom: 4 }]}>
        <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
          <View
            style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: colors.primary }]}
          />
        </View>
        <Text style={[styles.progressText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
          {t("practice.progress", { current: pos + 1, total: deck.length })}
        </Text>
      </View>

      <View style={[styles.cardArea, { paddingBottom: bottomPadding }]}>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={[styles.langTag, { backgroundColor: colors.primarySoft }]}>
            <Text style={[styles.langTagText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
              {prefs.targetLanguage}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.speaker, { backgroundColor: colors.primary }]}
            onPress={replay}
            activeOpacity={0.85}
            hitSlop={10}
          >
            <Ionicons name="volume-high" size={40} color="#FFFFFF" />
          </TouchableOpacity>

          {revealed ? (
            <>
              <Text style={[styles.word, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
                {card.word}
              </Text>
              <Text
                style={[styles.wordSource, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}
                numberOfLines={1}
              >
                {t("practice.from", { title: card.conversationTitle.split(" • ")[0] ?? "" })}
              </Text>
            </>
          ) : (
            <Text style={[styles.prompt, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
              {t("practice.listen")}
            </Text>
          )}

          <TouchableOpacity onPress={replay} activeOpacity={0.7} style={styles.replayLink}>
            <Ionicons name="refresh" size={14} color={colors.primary} />
            <Text style={[styles.replayText, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
              {t("practice.tapHear")}
            </Text>
          </TouchableOpacity>
        </View>

        {revealed ? (
          <View style={styles.rateRow}>
            <TouchableOpacity
              style={[styles.rateBtn, { backgroundColor: colors.card, borderColor: colors.border ?? "#E5E7EB" }]}
              onPress={() => advance(false)}
              activeOpacity={0.85}
            >
              <Ionicons name="reload" size={18} color={colors.mutedForeground} />
              <Text style={[styles.rateText, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                {t("practice.again")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.rateBtn, { backgroundColor: "#DCFCE7", borderColor: "#DCFCE7" }]}
              onPress={() => advance(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark" size={18} color="#16A34A" />
              <Text style={[styles.rateText, { color: "#16A34A", fontFamily: "Inter_600SemiBold" }]}>
                {t("practice.gotIt")}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={reveal}
            activeOpacity={0.85}
          >
            <Ionicons name="eye" size={18} color="#FFFFFF" />
            <Text style={[styles.primaryBtnText, { fontFamily: "Inter_600SemiBold" }]}>
              {t("practice.showWord")}
            </Text>
          </TouchableOpacity>
        )}
      </View>
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

  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 14 },
  bigIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  bigTitle: { fontSize: 20, textAlign: "center" },
  bigSub: { fontSize: 14, textAlign: "center", maxWidth: 300, lineHeight: 20 },

  progressWrap: { paddingHorizontal: 20, gap: 6 },
  progressTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3 },
  progressText: { fontSize: 12, textAlign: "right" },

  cardArea: { flex: 1, paddingHorizontal: 20, paddingTop: 16, justifyContent: "space-between" },
  card: {
    flex: 1,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 18,
    marginBottom: 16,
  },
  langTag: {
    position: "absolute",
    top: 16,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
  },
  langTagText: { fontSize: 12 },
  speaker: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  prompt: { fontSize: 18, textAlign: "center", maxWidth: 260 },
  word: { fontSize: 34, textAlign: "center", textTransform: "capitalize" },
  wordSource: { fontSize: 13, textAlign: "center" },
  replayLink: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 },
  replayText: { fontSize: 13 },

  rateRow: { flexDirection: "row", gap: 12 },
  rateBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  rateText: { fontSize: 15 },

  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 16,
  },
  primaryBtnText: { color: "#FFFFFF", fontSize: 16 },
  linkBtn: { alignItems: "center", paddingVertical: 8 },
  linkBtnText: { fontSize: 14 },
});

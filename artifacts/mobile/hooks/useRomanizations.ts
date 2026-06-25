import { useQuery } from "@tanstack/react-query";
import { romanizeBatch, isNonLatinLanguage } from "@/lib/romanize";
import { getBundledRomanizations } from "@/lib/offlineAssets";

// Batch-romanize a set of target-language strings (a vocab/sentence list).
// Returns a `get(text)` lookup so each row can render its own romanization.
// Only runs when the user has opted in and the language is non-Latin.
//
// Offline-first: any text already covered by the pre-bundled romanization map
// (or a caller-supplied `extra` map, e.g. a downloaded example sentence) is
// resolved locally with no network. Only the remaining, uncovered texts trigger
// a single batched request — so on a fully bundled screen there is no fetch at
// all and the aid works with no connection.
export function useRomanizations(
  texts: string[],
  language: string,
  enabled: boolean,
  extra?: Record<string, string>,
) {
  const clean = Array.from(
    new Set(texts.map((t) => (t ?? "").trim()).filter(Boolean)),
  );
  const active = enabled && isNonLatinLanguage(language) && clean.length > 0;

  const bundled = active ? getBundledRomanizations(language) : undefined;
  const resolveLocal = (text: string): string | undefined =>
    extra?.[text] ?? bundled?.[text];

  // Only the texts not already covered locally need a network fetch.
  const missing = active ? clean.filter((t) => resolveLocal(t) === undefined) : [];
  // Sorted key so a reordered list reuses the same cache entry.
  const cacheKey = missing.slice().sort();

  const query = useQuery({
    queryKey: ["romanize", language, cacheKey],
    queryFn: async () => {
      const results = await romanizeBatch(missing, language);
      const map: Record<string, string> = {};
      missing.forEach((text, i) => {
        map[text] = results[i] ?? text;
      });
      return map;
    },
    enabled: active && missing.length > 0,
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60,
  });

  // Return nothing when disabled so a previously-fetched (still-cached) result
  // never leaks back into the UI after the user turns the setting off.
  const get = (text: string): string | undefined => {
    if (!active) return undefined;
    const key = (text ?? "").trim();
    return resolveLocal(key) ?? query.data?.[key];
  };

  return { get, isLoading: active && missing.length > 0 && query.isLoading };
}

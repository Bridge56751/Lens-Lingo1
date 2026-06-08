import { useQuery } from "@tanstack/react-query";
import { romanizeBatch, isNonLatinLanguage } from "@/lib/romanize";

// Batch-romanize a set of target-language strings (a vocab/sentence list) with a
// single request, cached by (language, set of texts). Returns a `get(text)`
// lookup so each row can render its own romanization. Only runs when the user
// has opted in and the language is non-Latin.
export function useRomanizations(texts: string[], language: string, enabled: boolean) {
  const clean = Array.from(
    new Set(texts.map((t) => (t ?? "").trim()).filter(Boolean)),
  );
  const active = enabled && isNonLatinLanguage(language) && clean.length > 0;
  // Sorted key so a reordered list reuses the same cache entry.
  const cacheKey = clean.slice().sort();

  const query = useQuery({
    queryKey: ["romanize", language, cacheKey],
    queryFn: async () => {
      const results = await romanizeBatch(clean, language);
      const map: Record<string, string> = {};
      clean.forEach((text, i) => {
        map[text] = results[i] ?? text;
      });
      return map;
    },
    enabled: active,
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60,
  });

  // Return nothing when disabled so a previously-fetched (still-cached) result
  // never leaks back into the UI after the user turns the setting off.
  const get = (text: string): string | undefined =>
    active ? query.data?.[(text ?? "").trim()] : undefined;

  return { get, isLoading: active && query.isLoading };
}

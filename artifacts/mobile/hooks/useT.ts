import { useCallback } from "react";
import { translate, type Locale, type TKey } from "@/constants/translations";
import { usePreferences } from "@/hooks/usePreferences";

export function useT() {
  const { prefs } = usePreferences();
  const locale = (prefs.nativeLanguage as Locale) || "English";
  return useCallback(
    (key: TKey, vars?: Record<string, string | number>) =>
      translate(locale, key, vars),
    [locale],
  );
}

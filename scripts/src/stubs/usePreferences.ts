// Type-only stub so the generation script can import mobile constants/helpers
// (which `import type { Language } from "@/hooks/usePreferences"`) without pulling
// React Native into the Node script's typecheck. Keep this union in sync with
// artifacts/mobile/hooks/usePreferences.ts LANGUAGES.
export type Language =
  | "English"
  | "Spanish"
  | "French"
  | "German"
  | "Italian"
  | "Portuguese"
  | "Japanese"
  | "Chinese"
  | "Korean"
  | "Arabic"
  | "Russian"
  | "Hindi"
  | "Dutch";

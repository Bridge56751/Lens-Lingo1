// Languages the app supports. Used to validate client-supplied target/native
// languages before they are interpolated into high-priority system prompts.
// An allowlist prevents prompt-injection via an arbitrary language string,
// including via values persisted on the conversation and used later as a
// fallback (e.g. when grading).
export const SUPPORTED_LANGUAGES = new Set([
  "English",
  "Spanish",
  "French",
  "German",
  "Italian",
  "Portuguese",
  "Japanese",
  "Chinese",
  "Korean",
  "Arabic",
  "Russian",
  "Hindi",
  "Dutch",
]);

// Returns the trimmed language if it is supported, otherwise undefined. Use this
// when resolving a fallback from a stored/persisted value so an unvalidated
// string can never reach a prompt.
export function safeLanguage(value: string | undefined | null): string | undefined {
  const trimmed = (value ?? "").trim();
  return SUPPORTED_LANGUAGES.has(trimmed) ? trimmed : undefined;
}

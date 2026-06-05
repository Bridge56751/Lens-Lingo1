---
name: Web text-to-speech reliability
description: Why expo-speech is silent on web and how the shared speech helper works around it.
---

# Web TTS goes through SpeechSynthesis, not expo-speech

`expo-speech`'s `Speech.speak` is unreliable on **web**: it frequently makes no
sound when (a) no installed voice matches the requested BCP-47 locale, or (b)
voices haven't finished loading yet — `speechSynthesis.getVoices()` returns an
empty array on the first call and only populates after the `voiceschanged` event.

**Fix (centralized in `lib/speech.ts`):** on `Platform.OS === "web"`, drive
`window.speechSynthesis` directly — build an utterance, pick the best matching
voice (exact locale → language-prefix → first available), and if `getVoices()`
is still empty, speak on the `voiceschanged` event with a `setTimeout` fallback
(guarded by a `spoken` flag so it never double-speaks). Native still uses
`Speech.speak`.

**Stopping:** `Speech.stop()` does NOT cancel web synth utterances. Use the
shared `stopSpeaking()` which calls `speechSynthesis.cancel()` on web.

**Rule:** all screens (scan, conversation, practice, etc.) must call the shared
`speakWord` / `stopSpeaking` helpers — do not call `expo-speech` directly in a
screen, or web audio silently breaks again.

**Why:** users reported "it won't speak to me" on scan + conversation; root cause
was screens calling bare `Speech.speak`, which is a no-op on web for non-English
locales / cold voice lists. Note TTS is also genuinely unreliable inside the
Replit web-preview iframe regardless — real verification must happen on a device
via Expo Go.

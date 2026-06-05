---
name: Text-to-speech architecture
description: Why TTS is server-synthesized (OpenAI) with on-device fallback, and the non-obvious platform constraints.
---

# TTS is OpenAI-synthesized, with on-device synth only as fallback

**Decision:** speech is synthesized server-side via OpenAI (`/api/openai/tts`),
not the on-device voices. The client helper plays the returned MP3 and only falls
back to the system synth when the network call fails.

**Why:** on-device voices sound robotic, and `expo-speech` is additionally silent
on web (no matching voice / voices not loaded yet). Users complained the voice was
robotic and (earlier) silent on web. All speech must go through the shared
`speakWord` / `stopSpeaking` in `lib/speech.ts` — calling `expo-speech` or
`speechSynthesis` directly in a screen re-introduces both problems.

**Non-obvious constraints (not derivable from reading the happy path):**
- The standard `openai.audio.speech.create` (gpt-4o-mini-tts) DOES work through the
  Replit AI-Integrations proxy — verified. You do NOT need the `gpt-audio`
  chat-completions workaround in `integrations-openai-ai-server/audio`.
- Native playback is silent on a muted iPhone unless
  `setAudioModeAsync({ playsInSilentMode: true })` is set before playing.
- Native temp MP3 files (written to cache for the player) leak unless deleted
  deterministically — on stop, on `didJustFinish`, and on every stale/abandoned
  path. A monotonic play-token discards stale playback after rapid re-taps.
- Web `audio.play()` can reject under autoplay/user-gesture policy; revoke the
  object URL on rejection or it leaks.
- Audio is unreliable in the Replit web-preview iframe regardless — verify on a
  device via Expo Go.

## Latency: cache + prefetch, not server-side

**Symptom:** "tap to hear" felt like a 3-5s delay. Server synthesis is actually
sub-second; the lag is the round-trip to the phone over the Replit dev tunnel plus
generation. Switching TTS models does NOT fix this — the tunnel dominates.

**Fix:** `lib/speech.ts` keeps an in-memory LRU (web caches the Blob, native caches
the written MP3 path) so repeat taps are instant, plus a `prefetchSpeech(text)` that
warms the cache. Screens call it the moment the text is known (scan result arrives,
alphabet letter changes) so the first tap is already ready. Cached native files are
deliberately NOT deleted on playback teardown — only on LRU eviction.

**Gotcha that bit us:** when `playCached` swallows a web `audio.play()` rejection it
must return `false` so `speakWord` can still fall back to the device voice; returning
`true` unconditionally silently breaks the fallback on web autoplay/decoder failures.

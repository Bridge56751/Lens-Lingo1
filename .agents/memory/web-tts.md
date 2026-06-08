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

**Prefetch must never flood the single TTS endpoint.** Naive prefetch-on-every-change
(e.g. alphabet firing 2 requests per letter) produced bursts where some requests took
6-7s instead of ~1s — the *tap* then waited behind the prefetch pile-up, which is the
"still slow when I switch pages and tap quick" complaint. The fix is a priority model
in `lib/speech.ts`: prefetch is debounced + serialized (one at a time) and PAUSES
while a tap is active (`activeTaps` counter); a tap aborts in-flight prefetches AND
stale taps (AbortController per request); every screen calls `stopSpeaking()` on blur
(`useFocusEffect`, not just unmount — a stack screen can blur without unmounting) to
clear the queue and abort pending requests. **Why:** with one shared, rate-limited TTS
route, concurrency is the enemy of latency — fewer concurrent requests beats a faster
model.

**Server-side cache is the cross-session/cross-user win.** The client LRU is
per-session (lost on reload) and per-device, so the same small fixed word set (bank,
flashcards, alphabet) was re-synthesized by OpenAI on every cold start — measured
963-2012ms per `/api/openai/tts` call, and it sent `Cache-Control: no-store`. The
route now keeps its own in-memory LRU (`Map<string,Buffer>`, key now
`${voice}:${lang ?? "auto"}:${input}` — see the language section below, cap 400) plus
in-flight de-dup (`Map<string,Promise<Buffer>>`) so concurrent first-time
misses for the same clip collapse to ONE synth. Responses set `Cache-Control: private,
max-age=86400` and an `X-TTS-Cache: hit|miss` header. Measured: miss ~1.1s, hit ~7ms.
**Why:** HTTP caching can't help (endpoint is POST — browsers don't cache POST), so the
server cache + the client cache are complementary, not redundant. The client sends
`{text, language}` (voice still defaults to "nova") → one canonical key per word+language
→ high hit rate. Flashcard screens (`vocab-study.tsx`) prefetch the next 3 cards to warm both caches
before the user advances.

**Native client cache is now PERSISTENT across app restarts (chosen over device synth).**
When asked to make sentence/vocab audio "instant," the user explicitly chose keeping the
natural OpenAI voice but caching it permanently on device — NOT switching to the phone's
built-in voice. True bundling isn't possible: the sentence/vocab TEXT is server-generated,
not hardcoded. So on native the rendered MP3s persist in a `tts-cache` subdir of **Caches**
(not Documents — the audio is always re-downloadable, so OS may purge it and Apple keeps
re-downloadable data out of backups), plus a debounced `manifest.json` of clip keys.
`ensureCacheLoaded()` rehydrates the in-memory index from the manifest on the first fetch
(load-once promise), checking each file still exists. Web stays in-memory only (blobs aren't
cheaply persistable + web preview isn't the target). **The on-disk filename is derived from
the clip key by a hash and MUST be injective** — two concatenated variable-length base36
hashes need a delimiter (`_`), or distinct keys can collide onto one MP3 (wrong audio +
unsafe eviction deleting a file another key still references). **Why:** cold synth + tunnel
latency is a hard floor; persisting the result means each phrase is paid for once, then
instant and offline forever.

## No stacked/doubled voices: a per-clip re-entrancy lock in speakWord

**Symptom:** mashing a speaker button (vocab especially) "while loading" stacked
several plays that overlapped into doubled voices. The monotonic play-token +
`teardownPlayback` alone did NOT prevent it — on native, `remove()`/pause on a
still-loading player doesn't reliably halt deferred playback, so superseded clips
still started.

**Fix:** `speakWord` holds an `activeSpeakKey` (= `clipKey(text,language)`) +
`activeSpeakPromise`. A repeat tap for the clip already loading/playing is ignored
(returns the in-flight promise); a DIFFERENT word still supersedes via the token
path. The lock is released by the playback-finished handlers (web `onended`,
native `didJustFinish`) when real audio played, else in the `speakWord` finally
when no playback started (no clip / failure / device fallback) — both guarded by
`token === playToken` so a newer tap that took ownership is never clobbered.
`stopSpeaking` clears it. **Why:** the guard MUST live in `speakWord` so every
voice line inherits it; per-screen button-disabling can't cover the whole app and
the token race needs a single owner. **Edge:** if a platform never emits a finish
event the lock can stick for that one clip, but it self-heals (any different word
or a screen blur's `stopSpeaking` clears it).

## Pronunciation must be language-anchored or shared scripts read wrong

**Symptom:** Japanese words "sounded Chinese." `gpt-4o-mini-tts` guesses pronunciation
from the script, and Japanese kanji ≈ Chinese hanzi (and accented Latin overlaps), so it
defaults to the wrong accent.

**Fix:** the client `speakWord`/`prefetchSpeech` already know the `Language`, so thread it
to `/api/openai/tts` in the body; the route validates it against the allowlist and passes an
`instructions` string telling the model to read as a native speaker of that language. **The
language MUST be part of both the client and server cache keys** (`${voice}:${lang}:${input}`
client-side `clipKey(text,language)`), or the same characters reuse a clip rendered with
another language's accent. Without language the server falls back to `auto` (no instructions).

**There is no reliable model/format trick for COLD (uncached) latency — don't re-chase it.**
Benchmarked OpenAI TTS direct (the server uses the user's `OPENAI_API_KEY`, so calls already
bypass the AI-Integrations proxy): a cold single-word synth is ~0.7–1.5s and *noisy*. `tts-1`
(the "low-latency" model) was sometimes faster but spiked to 6s on individual calls; `opus`
format is smaller but not consistently faster to first byte; for one-word clips TTFB ≈ full
response, so HTTP streaming buys almost nothing. **Conclusion:** kept `gpt-4o-mini-tts` / `mp3`
for quality + consistency. The only real lever for not-yet-cached audio is **prefetching ahead**
on every screen the user steps through (alphabet warms current+next letter, sentences warms the
open category, vocab bank warms visible words, flashcards warm next 3) so it's a cache hit by
tap time. **Why:** cold synth time is a hard floor we can't shrink — move the work earlier
instead of trying to make it faster.

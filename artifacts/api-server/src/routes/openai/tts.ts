import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

// Natural-sounding OpenAI voices. Validated against this allowlist before being
// passed to the API (defends against arbitrary client-supplied values).
const VOICES = new Set([
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "nova",
  "onyx",
  "sage",
  "shimmer",
  "verse",
]);

// Cap input so a runaway payload can't generate minutes of audio.
const MAX_TTS_CHARS = 1200;

// Synthesis is the slow part (~1-2s per call to OpenAI). The app replays a small,
// fixed set of words/phrases (word bank, flashcards, alphabet) over and over, so
// we cache each rendered MP3 in memory keyed by voice+text. Repeat requests —
// across reloads and across users — then return in a few ms instead of 1-2s.
// Short clips; a few hundred entries is only a few MB. LRU eviction keeps it bounded.
const MAX_CACHE_ENTRIES = 400;
const audioCache = new Map<string, Buffer>();

// Collapse concurrent first-time requests for the same clip into a single OpenAI
// synth (e.g. a tap racing a prefetch, or several users hitting a new word at once)
// so we never pay for — or wait on — duplicate generations.
const inflight = new Map<string, Promise<Buffer>>();

function cacheGet(key: string): Buffer | undefined {
  const buf = audioCache.get(key);
  if (buf !== undefined) {
    // Mark most-recently-used (Map preserves insertion order).
    audioCache.delete(key);
    audioCache.set(key, buf);
  }
  return buf;
}

function cacheSet(key: string, buf: Buffer): void {
  audioCache.set(key, buf);
  while (audioCache.size > MAX_CACHE_ENTRIES) {
    const oldest = audioCache.keys().next().value;
    if (oldest === undefined) break;
    audioCache.delete(oldest);
  }
}

function sendAudio(res: import("express").Response, buffer: Buffer, cacheState: "hit" | "miss"): void {
  res.setHeader("Content-Type", "audio/mpeg");
  // For a given voice+text the audio is effectively stable, so let clients reuse it.
  res.setHeader("Cache-Control", "private, max-age=86400");
  res.setHeader("Content-Length", buffer.length.toString());
  res.setHeader("X-TTS-Cache", cacheState);
  res.send(buffer);
}

function synthesize(voice: string, input: string, cacheKey: string): Promise<Buffer> {
  const existing = inflight.get(cacheKey);
  if (existing) return existing;

  const job = (async (): Promise<Buffer> => {
    try {
      const speech = await openai.audio.speech.create({
        model: "gpt-4o-mini-tts",
        voice,
        input,
        response_format: "mp3",
      });
      const buffer = Buffer.from(await speech.arrayBuffer());
      cacheSet(cacheKey, buffer);
      return buffer;
    } finally {
      inflight.delete(cacheKey);
    }
  })();

  inflight.set(cacheKey, job);
  return job;
}

// POST /openai/tts - synthesize natural speech for the given text, returns MP3.
// Used by the app's "tap to hear" buttons and chat auto-play. Far smoother than
// the on-device system voices, which sound robotic.
router.post("/openai/tts", async (req, res) => {
  const { text, voice } = req.body as { text?: unknown; voice?: unknown };

  if (typeof text !== "string" || !text.trim()) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  const input = text.trim().slice(0, MAX_TTS_CHARS);
  const chosenVoice = typeof voice === "string" && VOICES.has(voice) ? voice : "nova";
  const cacheKey = `${chosenVoice}:${input}`;

  const cached = cacheGet(cacheKey);
  if (cached) {
    sendAudio(res, cached, "hit");
    return;
  }

  try {
    const buffer = await synthesize(chosenVoice, input, cacheKey);
    sendAudio(res, buffer, "miss");
  } catch (err) {
    req.log.error({ err }, "TTS failed");
    res.status(502).json({ error: "TTS failed" });
  }
});

export default router;

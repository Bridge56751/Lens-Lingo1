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

  try {
    const speech = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: chosenVoice,
      input,
      response_format: "mp3",
    });

    const buffer = Buffer.from(await speech.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Length", buffer.length.toString());
    res.send(buffer);
  } catch (err) {
    req.log.error({ err }, "TTS failed");
    res.status(502).json({ error: "TTS failed" });
  }
});

export default router;

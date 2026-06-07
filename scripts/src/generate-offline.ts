/**
 * Pre-generates ALL offline learning content + TTS audio for every target
 * language and emits them into the mobile app bundle so the app works fully
 * offline on first launch (no "Download" tap).
 *
 * Outputs (under artifacts/mobile/):
 *   - assets/offline/content/<Language>.json  { sentences, words }
 *   - assets/offline/audio/<fileKey>.mp3      one MP3 per spoken clip
 *   - lib/offlineAssets.generated.ts          require()-map consumed at runtime
 *
 * Idempotent + resumable: existing content JSON and MP3 files are skipped, so a
 * run interrupted by a timeout can simply be re-run to continue.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run gen-offline                # all languages
 *   pnpm --filter @workspace/scripts run gen-offline -- --lang Spanish
 *   pnpm --filter @workspace/scripts run gen-offline -- --manifest  # rebuild map only
 *   pnpm --filter @workspace/scripts run gen-offline -- --force     # regenerate
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { openai } from "@workspace/integrations-openai-ai-server";
import type { Language } from "./stubs/usePreferences";

// The mobile package is CommonJS (no "type":"module"), so tsx transpiles these
// files to CJS — ESM named imports won't link. Load them via createRequire and
// recover full types with `typeof import(...)`. The "@/" imports inside these
// files are type-only and erased at runtime.
const nodeRequire = createRequire(import.meta.url);
const { ALPHABETS } = nodeRequire(
  "../../artifacts/mobile/constants/alphabets",
) as typeof import("../../artifacts/mobile/constants/alphabets");
const { letterSpoken, exampleSpoken } = nodeRequire(
  "../../artifacts/mobile/lib/alphabetSpeech",
) as typeof import("../../artifacts/mobile/lib/alphabetSpeech");

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const MOBILE = join(ROOT, "artifacts", "mobile");
const AUDIO_DIR = join(MOBILE, "assets", "offline", "audio");
const CONTENT_DIR = join(MOBILE, "assets", "offline", "content");
const GENERATED_TS = join(MOBILE, "lib", "offlineAssets.generated.ts");

const NATIVE: Language = "English";
const TARGETS: Language[] = [
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
];

// ---------------------------------------------------------------------------
// Key/hash helpers — MUST stay byte-for-byte in sync with artifacts/mobile/
// lib/speech.ts (clipKey + fileKey) so generated filenames match what a runtime
// tap looks up.
// ---------------------------------------------------------------------------
function clipKey(text: string, language: string): string {
  return `${language}\u0001${text}`;
}
function fileKey(s: string): string {
  let h1 = 5381;
  let h2 = 52711;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = ((h1 << 5) + h1 + c) | 0;
    h2 = ((h2 << 5) + h2 + c) | 0;
  }
  return `${(h1 >>> 0).toString(36)}_${(h2 >>> 0).toString(36)}`;
}

// ---------------------------------------------------------------------------
// Prompt building — mirrors artifacts/api-server/src/routes/{sentences,vocab}.ts
// and src/lib/languages.ts so bundled content matches the on-demand server output.
// ---------------------------------------------------------------------------
function accuracyRules(targetLanguage: string, nativeLanguage: string): string {
  return `Accuracy is critical — this is study material, so every entry must be correct:
- Use the exact word a native ${targetLanguage} speaker genuinely uses in everyday life, spelled and written correctly in standard modern ${targetLanguage}.
- Write each word in ${targetLanguage}'s own correct script and orthography (including any required diacritics, accents, or characters). Do NOT substitute a word, character, spelling, or reading from another language — even when ${targetLanguage} shares a script or characters with that language. The entry must be ${targetLanguage}, never a look-alike from a different language.
- Give the genuine, idiomatic ${targetLanguage} word for the meaning, not a literal character-by-character borrowing from ${nativeLanguage} or any other language.
- Make the ${nativeLanguage} translation precise and unambiguous for the intended meaning.
- If you are unsure a word is correct natural ${targetLanguage}, replace it with a common word you are certain about. Never guess or invent words.`;
}

const CATEGORIES = [
  "greetings",
  "basics",
  "directions",
  "dining",
  "shopping",
  "emergency",
] as const;
type Category = (typeof CATEGORIES)[number];
const CATEGORY_BRIEF: Record<Category, string> = {
  greetings: "greetings and farewells (good morning, hello, goodbye, good night)",
  basics:
    "core politeness and essentials (please, thank you, excuse me, sorry, yes, no, I don't understand)",
  directions:
    "getting around and asking where things are (where is the bathroom, how do I get to the station, is it far, turn left)",
  dining: "eating out (a table for two, the menu please, water please, the check please)",
  shopping: "shopping and money (how much is this, too expensive, I'll take it, do you accept cards)",
  emergency: "emergencies and help (I need help, call a doctor, I'm lost, where is the hospital)",
};

const LEVELS = ["beginner", "intermediate", "advanced", "expert"] as const;
type Level = (typeof LEVELS)[number];

// Exact bank cardinality the app expects (6 phrases per category, 12 words per
// level). The model occasionally over-produces, so parsed entries are capped to
// these to keep every bundled bank identical in shape across all languages.
const SENTENCES_PER_CATEGORY = 6;
const WORDS_PER_LEVEL = 12;

function sanitize(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function extractJson(content: string): Record<string, unknown> {
  const match = content.match(/\{[\s\S]*\}/);
  return match ? (JSON.parse(match[0]) as Record<string, unknown>) : {};
}

type SentenceEntry = { category: Category; phrase: string; translation: string };
type WordEntry = { word: string; translation: string; level: Level };
type LanguageContent = { sentences: SentenceEntry[]; words: WordEntry[] };

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let attempt = 0;
  const max = 6;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt >= max) throw err;
      const delay = Math.min(30000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 500);
      console.warn(`  retry ${attempt}/${max} for ${label} after ${delay}ms: ${String(err)}`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

// Hard deadline: rejects if the wrapped promise has not settled in `ms`, even if
// the underlying request/stream hangs forever (an abort signal alone does not
// rescue a stalled response-body read). The orphaned promise is allowed to leak.
function deadline<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`deadline ${ms}ms exceeded: ${label}`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function chatJson(prompt: string, maxTokens: number) {
  return deadline(
    (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 90_000);
      try {
        return await openai.chat.completions.create(
          {
            model: "gpt-4o",
            max_completion_tokens: maxTokens,
            messages: [{ role: "user", content: prompt }],
          },
          { signal: controller.signal, maxRetries: 0 },
        );
      } finally {
        clearTimeout(timer);
      }
    })(),
    100_000,
    "chat",
  );
}

async function generateSentences(target: string): Promise<SentenceEntry[]> {
  const categoryLines = CATEGORIES.map((c) => `- ${c}: 6 phrases for ${CATEGORY_BRIEF[c]}`).join("\n");
  const prompt = `Create a list of simple, everyday "survival" phrases for a native ${NATIVE} speaker learning ${target}.
These are short, practical full sentences a beginner traveller would actually say. Keep them natural and easy.
Provide phrases in these categories:
${categoryLines}

${accuracyRules(target, NATIVE)}

For each entry give the phrase written in ${target} and its accurate translation in ${NATIVE}.
Respond with ONLY valid JSON in exactly this shape (one key per category):
{"greetings":[{"phrase":"...","translation":"..."}],"basics":[...],"directions":[...],"dining":[...],"shopping":[...],"emergency":[...]}`;

  const response = await withRetry(`sentences:${target}`, () => chatJson(prompt, 1800));
  const parsed = extractJson(response.choices[0]?.message?.content ?? "{}");
  const out: SentenceEntry[] = [];
  for (const category of CATEGORIES) {
    const raw = Array.isArray(parsed[category]) ? (parsed[category] as unknown[]) : [];
    let kept = 0;
    for (const item of raw) {
      if (kept >= SENTENCES_PER_CATEGORY) break;
      const obj = item as { phrase?: unknown; translation?: unknown };
      const phrase = sanitize(obj.phrase, 160);
      const translation = sanitize(obj.translation, 200);
      if (phrase && translation) {
        out.push({ category, phrase, translation });
        kept++;
      }
    }
  }
  return out;
}

async function generateVocab(target: string): Promise<WordEntry[]> {
  const prompt = `Create a vocabulary study list for a native ${NATIVE} speaker learning ${target}.
Provide common, genuinely useful single words or short phrases at four difficulty levels:
- beginner: 12 of the most essential everyday words
- intermediate: 12 useful words a learner meets after the basics
- advanced: 12 richer, less common words
- expert: 12 sophisticated, nuanced words a near-fluent speaker would learn

${accuracyRules(target, NATIVE)}

For each entry give the word written in ${target} and its accurate translation in ${NATIVE}.
Respond with ONLY valid JSON in exactly this shape:
{"beginner":[{"word":"...","translation":"..."}],"intermediate":[{"word":"...","translation":"..."}],"advanced":[{"word":"...","translation":"..."}],"expert":[{"word":"...","translation":"..."}]}`;

  const response = await withRetry(`vocab:${target}`, () => chatJson(prompt, 1500));
  const parsed = extractJson(response.choices[0]?.message?.content ?? "{}");
  const out: WordEntry[] = [];
  for (const level of LEVELS) {
    const raw = Array.isArray(parsed[level]) ? (parsed[level] as unknown[]) : [];
    let kept = 0;
    for (const item of raw) {
      if (kept >= WORDS_PER_LEVEL) break;
      const obj = item as { word?: unknown; translation?: unknown };
      const word = sanitize(obj.word, 60);
      const translation = sanitize(obj.translation, 80);
      if (word && translation) {
        out.push({ word, translation, level });
        kept++;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// TTS — mirrors artifacts/api-server/src/routes/openai/tts.ts (voice + model +
// pronunciation instructions) so a bundled clip is identical to a live one.
// ---------------------------------------------------------------------------
function pronunciationInstructions(language: string): string {
  return `Read the text as a fluent native ${language} speaker. Use natural, correct ${language} pronunciation, rhythm, and intonation throughout. The text is ${language} — never read it with the accent or pronunciation of any other language, even where characters look similar to those used in other languages.`;
}

async function synthesize(text: string, language: string): Promise<Buffer> {
  const label = `tts:${language}:${text.slice(0, 24)}`;
  return withRetry(label, () =>
    deadline(
      (async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 60_000);
        try {
          const speech = await openai.audio.speech.create(
            {
              model: "gpt-4o-mini-tts",
              voice: "nova",
              input: text.slice(0, 1200),
              response_format: "mp3",
              instructions: pronunciationInstructions(language),
            },
            { signal: controller.signal, maxRetries: 0 },
          );
          return Buffer.from(await speech.arrayBuffer());
        } finally {
          clearTimeout(timer);
        }
      })(),
      70_000,
      label,
    ),
  );
}

// All spoken clips for a language: sentence phrases + vocab words + alphabet
// letters/examples. Deduped by clip key.
function clipsForLanguage(target: Language, content: LanguageContent): string[] {
  const set = new Set<string>();
  for (const s of content.sentences) if (s.phrase.trim()) set.add(s.phrase.trim());
  for (const w of content.words) if (w.word.trim()) set.add(w.word.trim());
  for (const script of ALPHABETS[target] ?? []) {
    for (const letter of script.letters) {
      const ls = letterSpoken(letter, target).trim();
      if (ls) set.add(ls);
      const ex = exampleSpoken(letter).trim();
      if (ex) set.add(ex);
    }
  }
  return [...set];
}

async function pool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const run = async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      await worker(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
}

function ensureDirs(): void {
  for (const d of [AUDIO_DIR, CONTENT_DIR]) if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

// Crash-safe write: this script is run in the foreground in bounded chunks and
// gets SIGKILLed at the tool timeout, which can land mid-write. Writing to a temp
// file then renaming makes each finished file atomic, so a kill never leaves a
// truncated mp3/JSON that would later be treated as "already done".
function writeFileAtomic(file: string, data: Buffer | string): void {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, file);
}

function contentPath(lang: Language): string {
  return join(CONTENT_DIR, `${lang}.json`);
}

function loadOrGenerateContent(lang: Language, force: boolean): Promise<LanguageContent> {
  const path = contentPath(lang);
  if (!force && existsSync(path)) {
    return Promise.resolve(JSON.parse(readFileSync(path, "utf8")) as LanguageContent);
  }
  return (async () => {
    console.log(`[${lang}] generating content (sentences + vocab)…`);
    const [sentences, words] = await Promise.all([generateSentences(lang), generateVocab(lang)]);
    const content: LanguageContent = { sentences, words };
    writeFileAtomic(path, JSON.stringify(content, null, 2));
    console.log(`[${lang}] content: ${sentences.length} phrases, ${words.length} words`);
    return content;
  })();
}

async function generateAudioForLanguage(lang: Language, content: LanguageContent, force: boolean): Promise<void> {
  const clips = clipsForLanguage(lang, content);
  let done = 0;
  let made = 0;
  let failed = 0;
  await pool(clips, 6, async (text) => {
    const file = join(AUDIO_DIR, `${fileKey(clipKey(text, lang))}.mp3`);
    if (force || !existsSync(file)) {
      try {
        const buf = await synthesize(text, lang);
        writeFileAtomic(file, buf);
        made++;
      } catch (err) {
        failed++;
        console.warn(`[${lang}] FAILED clip "${text.slice(0, 40)}": ${String(err)}`);
      }
    }
    done++;
    if (done % 20 === 0 || done === clips.length) {
      console.log(`[${lang}] audio ${done}/${clips.length} (${made} new, ${failed} failed)`);
    }
  });
  if (failed > 0) console.warn(`[${lang}] ${failed} clips failed — re-run to retry them.`);
}

function buildManifest(): void {
  const audioEntries: string[] = [];
  const contentEntries: string[] = [];
  const seen = new Set<string>();
  let missing = 0;

  for (const lang of TARGETS) {
    const path = contentPath(lang);
    if (!existsSync(path)) {
      console.warn(`manifest: no content for ${lang} — skipping`);
      continue;
    }
    contentEntries.push(`  ${JSON.stringify(lang)}: require("../assets/offline/content/${lang}.json"),`);
    const content = JSON.parse(readFileSync(path, "utf8")) as LanguageContent;
    for (const text of clipsForLanguage(lang, content)) {
      const key = clipKey(text, lang);
      if (seen.has(key)) continue;
      seen.add(key);
      const stem = fileKey(key);
      if (!existsSync(join(AUDIO_DIR, `${stem}.mp3`))) {
        missing++;
        continue;
      }
      audioEntries.push(`  ${JSON.stringify(key)}: require("../assets/offline/audio/${stem}.mp3"),`);
    }
  }

  const body = `/* eslint-disable */
/**
 * AUTO-GENERATED by scripts/src/generate-offline.ts — do NOT edit by hand.
 * Regenerate with: pnpm --filter @workspace/scripts run gen-offline
 *
 * Maps clip keys (\`<language>\\u0001<text>\`) to bundled MP3 modules and each
 * target language to its bundled content JSON, so the app works fully offline
 * on first launch.
 */
export type BundledLanguageContent = {
  sentences: { category: string; phrase: string; translation: string }[];
  words: { word: string; translation: string; level: string }[];
};

export const BUNDLED_CONTENT: Record<string, BundledLanguageContent> = {
${contentEntries.join("\n")}
};

export const BUNDLED_AUDIO: Record<string, number> = {
${audioEntries.join("\n")}
};
`;
  writeFileAtomic(GENERATED_TS, body);
  console.log(
    `manifest: ${contentEntries.length} languages, ${audioEntries.length} audio clips` +
      (missing ? `, ${missing} clips still missing audio` : ""),
  );
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const force = argv.includes("--force");
  const manifestOnly = argv.includes("--manifest");
  const langArgIdx = argv.findIndex((a) => a === "--lang");
  const langArg = langArgIdx >= 0 ? argv[langArgIdx + 1] : undefined;

  ensureDirs();

  if (manifestOnly) {
    buildManifest();
    return;
  }

  const targets = langArg ? (TARGETS.filter((l) => l === langArg) as Language[]) : TARGETS;
  if (targets.length === 0) {
    console.error(`No matching target language for "${langArg}". Valid: ${TARGETS.join(", ")}`);
    process.exit(1);
  }

  for (const lang of targets) {
    const content = await loadOrGenerateContent(lang, force);
    await generateAudioForLanguage(lang, content, force);
    console.log(`[${lang}] done`);
  }

  buildManifest();
  console.log("All done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

---
name: Expo voice/transcription flow
description: Cross-platform gotchas for the LinguaScan speak→transcribe→send conversation flow
---

# Voice speaking flow (conversation screen)

- **expo-file-system `new File(uri).base64()` cannot read web `blob:` URLs** that `expo-audio` produces. On web you must `fetch(uri).then(r => r.blob())` then `FileReader.readAsDataURL`. Native uses the File API directly. A single `readAudio(uri)` helper branches on `Platform.OS`.
  - **Why:** transcription was silently failing on the web preview — no request ever reached the server because the base64 read threw before `fetch`.
- **Strip the codec param from `blob.type`** (`"audio/webm;codecs=opus"` → `"audio/webm"`) before sending; the server's mime→ext map does exact-match lookup.
- **Voice must auto-send after transcription.** Users expect "stop talking → AI replies", not a transcript dropped in the box requiring a second tap. `stopAndTranscribe` calls `sendText(transcript)` directly.
- **Concurrency:** guard sends with a `sendingRef` mutex (not just `isStreaming` state, which is stale in closures) and include an `isTranscribing` guard on the keyboard `onSubmitEditing` path, or a typed submit during transcription can start a second overlapping stream. Read latest draft from `inputTextRef`, not closure `inputText`.
- Mic recording is unreliable in the Replit web preview iframe (permissions); always test the voice loop on a real device via Expo Go.
- **Never touch the `expo-audio` recorder's native object in an unmount cleanup without try/catch.** Reading the `audioRecorder.isRecording` getter (or calling any method) during unmount throws `NativeSharedObjectNotFoundException` synchronously once expo-audio has released the native shared object — and a `.catch()` on a later `.stop()` promise does NOT catch that synchronous getter throw, so it surfaces as an uncaught redbox on the device that breaks the mic.
  - **Why:** user reported "mic isn't working"; device logs showed the uncaught `NativeSharedObjectNotFoundException` pointing at the conversation screen.
  - **How to apply:** track recording state in a ref (mirror every `setIsRecording`), read the ref (not the native getter) in cleanup, wrap native calls in try/catch, and give the cleanup effect empty deps so it only runs on true unmount (the recorder from `useAudioRecorder` is stable).

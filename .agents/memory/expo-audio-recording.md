---
name: expo-audio recording lifecycle
description: Cleanup quirk when recording audio with expo-audio in the mobile app
---

# expo-audio recording lifecycle

When using `useAudioRecorder` + `setAudioModeAsync({ allowsRecording: true })` to
capture mic audio, the recording audio mode stays engaged until you explicitly
reset it.

**Rule:** always reset `setAudioModeAsync({ allowsRecording: false })` after the
recorder stops, AND add an unmount cleanup effect that stops the recorder if
`audioRecorder.isRecording` and resets the audio mode.

**Why:** without this, navigating away mid-recording (or after a failed stop)
leaves the device audio session in recording mode, which can mute playback /
TTS and leave capture engaged.

**How to apply:** any screen that records audio (currently the conversation
screen voice-input flow) needs both the post-stop reset and the unmount cleanup.

## Transcription payload sizing
Audio is sent to `/api/openai/transcribe` as base64 in a JSON body. Express JSON
limit is 10mb, so cap base64 length at ~7,000,000 chars on BOTH client and server
(client shows a "too long" alert, server returns 413). base64 inflates bytes ~33%,
so 7M chars ≈ 5MB of audio.

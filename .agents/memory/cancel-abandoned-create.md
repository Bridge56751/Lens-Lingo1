---
name: Cancel abandoned create-on-load requests
description: How to cancel an in-flight "create a record on screen action" request (e.g. free-chat) so an abandoned tap persists no orphan row and burns no AI call.
---

# Cancelling abandoned create-on-load requests

When a screen action kicks off a server request that CREATES a row as a side
effect (e.g. the home "just chat" tap → `POST /openai/conversations/chat`
creates a conversation + an opening AI message), an abandoned interaction (user
navigates away before it finishes) must cancel end-to-end — otherwise it leaves
an orphan conversation in History and wastes an AI call / usage increment.

## Rule
- **Client:** give each tap its own `AbortController`; abort it in the screen's
  blur/cleanup (`useFocusEffect` return). For per-call cancellation you MUST call
  the generated plain function (`startOpenaiChat(data, { signal })`) directly —
  the generated React Query mutation hook only binds a signal at hook-creation
  (render) time, not per-`mutate`. `customFetch` spreads `...init` into `fetch`,
  so `signal` passes through AND device/tz/auth headers are still injected.
- **Server:** bind an `AbortController` to the response close:
  `res.on("close", () => { if (!res.writableEnded) ac.abort(); })`, pass
  `{ signal: ac.signal }` to the OpenAI call, and **bail before any DB write**
  when aborted (check `ac.signal.aborted` in the OpenAI catch AND right before the
  transaction).

**Why:** the original free-chat route had a try/catch that logged the OpenAI
error and *fell through* to create the conversation with fallback content — so a
cancelled (or merely failed) opening-message generation still persisted an orphan
chat. A logs-and-continues catch wrapped around a side-effecting external call is
the trap.

**How to apply:** any new "create a record as a screen action fires" flow
(scan→conversation is the obvious next one) should follow the same
client-abort + server res-close-abort + bail-before-write pattern. Accepted
residual: if the DB tx already committed before the abort lands, the record is
kept (tiny window).

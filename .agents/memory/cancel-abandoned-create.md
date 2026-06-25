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

## Robust complement: hide unused quick chats from History (timing-independent)

The abort only catches a chat abandoned *while still loading*. Once the opening
message lands the chat opens and is saved — so "open it, read it, leave without
typing" still created a History entry. Per product decision, a **free/quick chat
is "real" only once the user sends their first message**; a **scanned chat is
always kept** (the scan itself is content).

Implemented as a filter on the conversations LIST endpoint
(`GET /openai/conversations`), NOT by deferring creation: keep a row unless it is
an unused placeholder quick chat — `or(hasUserMessage, not(isPlaceholderChat))`
where `isPlaceholderChat` is `title LIKE 'Quick Chat%' OR 'Free Chat%'`
(`PLACEHOLDER_TITLE_PREFIXES`) and `hasUserMessage` is a correlated
`exists(select … from messages where conversation_id = conversations.id and
role = 'user')`. Scans use a different title (`<item> • <lang>`) so they're never
hidden; an engaged quick chat is auto-renamed only AFTER a user turn, so the
placeholder-title check reliably identifies still-unused quick chats.

**Why filter rather than defer creation:** the conversation screen loads by id
and the send-message route 404s on an empty conversation, so the row must exist
the moment "just chat" opens. Filtering is also timing-independent (no abort race).
Both Home and History read the same list hook, so one server-side filter fixes
both; both refetch on focus, so a chat appears immediately after the first send.
Residual: unused quick-chat rows still accumulate in the DB (hidden, harmless).

---
name: SSE chat streaming contract
description: The server↔client SSE event shape for streamed tutor replies and the client obligations that prevent silent failures.
---

# Streamed chat reply contract (conversation messages)

The message-send route streams Server-Sent Events as `data: <json>\n\n` lines.
The JSON is one of three shapes:

- `{ "content": "<chunk>" }` — append to the reply.
- `{ "done": true }` — stream finished.
- `{ "error": "<message>" }` — the server hit a failure mid-stream (e.g. OpenAI call threw); it writes this and then still writes the `done` event.

**Client obligations (mobile conversation screen):**
- Parse each `data:` line in an isolated try/catch (ignore parse errors), then act on the result *outside* that catch — otherwise a `throw` for the error case gets swallowed by the parse catch.
- On `{error}`, throw so the outer send handler shows the user-visible error bubble. Ignoring it leaves the user with their message and **no reply and no error** (silent failure).

**Why:** the server already emits a structured `error` event; the client originally destructured `parsed.error` but never acted on it, so server stream failures looked like the tutor just never responded.

**Related:** conversation hydration from the query must not overwrite optimistic/in-flight messages while a send is active (guard on the send mutex) and should reconcile deterministically off the query's `dataUpdatedAt`, not only `messages.length`.

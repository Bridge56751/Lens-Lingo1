---
name: Forked AI integration secrets
description: Why a forked Repl keeps returning "Replit AI Integrations is not configured" even after re-provisioning, and how to fix it.
---

When a project is forked, the original account's `AI_INTEGRATIONS_OPENAI_BASE_URL` and `AI_INTEGRATIONS_OPENAI_API_KEY` carry over as **global user secrets**. These persist and effectively override `setupReplitAIIntegrations`, so the local model gateway (e.g. `http://localhost:1106/modelfarm/openai`) keeps returning HTTP 404 `"Replit AI Integrations is not configured"` for every call.

**Why:** `setupReplitAIIntegrations` reports `success` and lists the env vars, but the stale carried-over secret values win at runtime. `deleteEnvVars` only removes env-scoped vars, not global secrets — calling it on these keys reports success but they remain present (verify with `viewEnvVars({type:"secret"})`). Re-provisioning and full Repl restarts do not clear them.

**How to apply:** If a forked project hits "Replit AI Integrations is not configured" despite successful provisioning, the user must delete the `AI_INTEGRATIONS_*` secrets manually in the Secrets tab, then re-provision. If the platform integration still won't activate (e.g. account not enabled/credited), fall back to the user's own `OPENAI_API_KEY`: make the shared OpenAI client prefer `OPENAI_API_KEY` (direct api.openai.com) over the integration proxy, and swap Replit-only model names like `gpt-5.4` for real OpenAI models like `gpt-4o` (vision-capable). Note a real-but-unfunded OpenAI key surfaces as HTTP 429 `insufficient_quota`, which is a billing issue on the user's OpenAI account, not a code bug.

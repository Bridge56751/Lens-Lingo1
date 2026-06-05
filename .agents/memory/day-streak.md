---
name: Day streak
description: How the LinguaScan day-streak number is derived and the "logged back in" celebration rule.
---

- **The streak has no DB column.** It is derived purely client-side from the `createdAt` timestamps of the user's conversations (`useListOpenaiConversations`). One shared helper computes it for both Home and Progress so they never disagree.
- **Semantics: current consecutive-day streak ending today, where opening the app counts as today's activity — so the streak is always ≥ 1.** `computeStreak` adds today's day-key to the active set unconditionally, then chains back through consecutive prior active days. Days are bucketed by the device's *local* calendar day (normalize to local midnight).
  - **Why:** product wants a minimum of 1 "as soon as someone logs on" because starting at 0 is demotivating. This is NOT the old `Math.max(1, distinctDayCount)` hack (which double-counted random days) — it's "being in the app right now = today is active", so it stays a real consecutive-day count that just never reads 0.
- **The Home streak-pill bounce fires once per new calendar day** ("logs back in"), gated by an AsyncStorage last-seen-day key plus an in-memory per-day ref. The in-memory gate must store the *day key*, not a boolean — a boolean never resets, so a session that stays mounted across midnight would never celebrate the next day.
- **Best streak IS persisted (preferences `bestStreak`), unlike the current streak.** `computeBestStreak` derives the longest consecutive-day run from conversation `createdAt`s, but because deleting conversations would erase history, the displayed best = `max(computed best, current, persisted)` and the persisted high-water mark is bumped via `update("bestStreak", …)` whenever it grows. Never let best streak read lower than a previously-seen value.
  - Both streak helpers bucket by **local** calendar day-key but compare consecutiveness via `Date.UTC(y,m,d)/86400000` ordinals so DST day-length changes can't break a run.

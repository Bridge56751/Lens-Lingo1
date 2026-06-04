---
name: Day streak
description: How the LinguaScan day-streak number is derived and the "logged back in" celebration rule.
---

- **The streak has no DB column.** It is derived purely client-side from the `createdAt` timestamps of the user's conversations (`useListOpenaiConversations`). One shared helper computes it for both Home and Progress so they never disagree.
- **Semantics: current consecutive-day streak ending today, or yesterday if there's no activity today yet.** No activity at all → 0. A gap before yesterday → 0 (streak broken). Days are bucketed by the device's *local* calendar day (normalize to local midnight). Do NOT show a hardcoded minimum of 1.
  - **Why:** an earlier version showed `Math.max(1, distinctDayCount)`, which is neither a real streak nor ever zero. The "alive through yesterday" rule keeps the streak from reading 0 every morning before the first activity.
- **The Home streak-pill bounce fires once per new calendar day** ("logs back in"), gated by an AsyncStorage last-seen-day key plus an in-memory per-day ref. The in-memory gate must store the *day key*, not a boolean — a boolean never resets, so a session that stays mounted across midnight would never celebrate the next day.

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Returns the set of distinct local calendar days (as `YYYY-M-D` keys) that had
 * at least one activity, given a list of ISO timestamps.
 */
export function activeDayKeys(isoDates: string[]): Set<string> {
  const days = new Set<string>();
  for (const iso of isoDates) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) continue;
    d.setHours(0, 0, 0, 0);
    days.add(dayKey(d));
  }
  return days;
}

/**
 * Consecutive-day streak ending today. Opening the app counts as today's
 * activity, so today is always treated as active — the streak is therefore
 * always at least 1 (more motivating than starting from 0), and chains back
 * through any consecutive prior active days.
 */
export function computeStreak(isoDates: string[]): number {
  const days = activeDayKeys(isoDates);

  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  // Being in the app right now counts as activity for today.
  days.add(dayKey(cursor));

  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/**
 * Longest run of consecutive active calendar days anywhere in history (the
 * "best" streak). Today counts as activity (consistent with computeStreak), so
 * the result is always at least 1 once the app has been opened.
 */
export function computeBestStreak(isoDates: string[]): number {
  const days = activeDayKeys(isoDates);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  days.add(dayKey(today));

  if (days.size === 0) return 0;

  // Map each day key to a DST-safe ordinal (whole days since the UTC epoch) so
  // consecutive calendar days always differ by exactly 1.
  const ordinals = Array.from(days).map((k) => {
    const [y, m, d] = k.split("-").map(Number);
    return Math.floor(Date.UTC(y, m, d) / 86_400_000);
  });
  ordinals.sort((a, b) => a - b);

  let best = 1;
  let run = 1;
  for (let i = 1; i < ordinals.length; i += 1) {
    if (ordinals[i] === ordinals[i - 1] + 1) {
      run += 1;
    } else if (ordinals[i] !== ordinals[i - 1]) {
      run = 1;
    }
    if (run > best) best = run;
  }
  return best;
}

/** Today's local calendar day key, used to detect a fresh login on a new day. */
export function todayKey(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return dayKey(d);
}

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
 * Consecutive-day streak ending today (or yesterday if there's no activity yet
 * today, so the streak stays "alive" until the day is over). Returns 0 when
 * there has been no activity at all.
 */
export function computeStreak(isoDates: string[]): number {
  const days = activeDayKeys(isoDates);
  if (days.size === 0) return 0;

  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  // If nothing logged today yet, the streak can still run through yesterday.
  if (!days.has(dayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }

  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** Today's local calendar day key, used to detect a fresh login on a new day. */
export function todayKey(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return dayKey(d);
}

/**
 * Publishing cadence helpers.
 *
 * The newsletter has no enforced cron — editions go out via CLI when
 * they're ready — but the implicit target is "Sunday-ish". The /sub
 * confirm page tells the new subscriber how many days until the next
 * Sunday so they have a concrete expectation rather than a vague
 * "soon".
 */

/** Day index of the implicit publishing day (0=Sun, 1=Mon, … 6=Sat). */
export const PUBLISH_DAY_OF_WEEK = 0; // Sunday

/**
 * Days until the next occurrence of `targetDay` (0-6) from `now`,
 * counting in whole UTC days. If today *is* the target day, returns 7
 * — the issue for "today" would already have gone out, so the next
 * one is a full week away. UTC keeps the answer consistent across
 * timezones; the ±1 day fuzz that creates at extremes is fine for
 * user-facing copy.
 */
export function daysUntilNextDayOfWeek(targetDay: number, now: Date = new Date()): number {
  const day = now.getUTCDay();
  const delta = (targetDay - day + 7) % 7;
  return delta === 0 ? 7 : delta;
}

export function daysUntilNextPublishDay(now: Date = new Date()): number {
  return daysUntilNextDayOfWeek(PUBLISH_DAY_OF_WEEK, now);
}

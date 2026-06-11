/**
 * Build a UTC Date from wall-clock components interpreted in the given IANA timezone.
 * Handles DST correctly because the offset is computed for the specific date.
 */
export function zonedWallTimeToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const offset = tzOffsetMs(new Date(guess), timeZone);
  return new Date(guess - offset);
}

/**
 * Calendar date key (YYYY-MM-DD) for the given instant as seen on a wall clock
 * in the given IANA timezone, optionally shifted by whole calendar days.
 * Day shifting is pure calendar math (UTC-based), so it is immune to DST
 * transitions: "yesterday" relative to the day after fall-back is still
 * exactly one calendar day earlier.
 */
export function zonedDateKey(
  timeZone: string,
  now: Date = new Date(),
  offsetDays = 0,
): string {
  // en-CA formats as YYYY-MM-DD
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  if (offsetDays === 0) return formatted;
  const [y, m, d] = formatted.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + offsetDays)).toISOString().slice(0, 10);
}

function tzOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, number> = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - date.getTime();
}

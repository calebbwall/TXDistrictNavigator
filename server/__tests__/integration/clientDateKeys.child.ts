/**
 * Child process for client-side date-key tests. The parent suite spawns this
 * with different TZ env values to emulate device timezones (the mileage
 * screens key entries by the device-local calendar date).
 *
 * Prints a JSON array of { name, actual, expected } to stdout.
 */
import {
  toISODateString,
  parseISODate,
} from "../../../client/utils/validation";

const tz = process.env.TZ ?? "(system)";

const cases: { name: string; actual: string; expected: string }[] = [];

function check(name: string, actual: string, expected: string): void {
  cases.push({ name: `[TZ=${tz}] ${name}`, actual, expected });
}

if (tz === "America/Chicago") {
  // 7 PM CDT Jun 11 — already Jun 12 in UTC. The Phase 1 bug was using
  // toISOString() here, which rolled mileage entries to tomorrow's date.
  check(
    "evening entry keeps local (Chicago) date",
    toISODateString(new Date("2026-06-12T00:00:00Z")),
    "2026-06-11",
  );
  check(
    "2 AM entry keeps local date",
    toISODateString(new Date("2026-06-11T07:00:00Z")),
    "2026-06-11",
  );
  check(
    "11:59:59 PM entry is today, not tomorrow",
    toISODateString(new Date("2026-06-12T04:59:59Z")),
    "2026-06-11",
  );
  check(
    "midnight boundary rolls to the next local day",
    toISODateString(new Date("2026-06-12T05:00:00Z")),
    "2026-06-12",
  );
  check(
    "spring-forward morning (3:30 AM CDT) stays on Mar 8",
    toISODateString(new Date("2026-03-08T08:30:00Z")),
    "2026-03-08",
  );
  check(
    "fall-back repeated hour (1:30 AM CST) stays on Nov 1",
    toISODateString(new Date("2026-11-01T07:30:00Z")),
    "2026-11-01",
  );
}

if (tz === "UTC") {
  // Device set to UTC: entries key on the device's own calendar date.
  check(
    "UTC device: UTC midnight is the new local day",
    toISODateString(new Date("2026-06-12T00:00:00Z")),
    "2026-06-12",
  );
  check(
    "UTC device: morning entry",
    toISODateString(new Date("2026-06-11T07:00:00Z")),
    "2026-06-11",
  );
}

// Round-trip stability in any timezone: parse → format must not shift the day.
const roundTrip = toISODateString(parseISODate("2026-06-11")!);
check("parseISODate/toISODateString round-trip", roundTrip, "2026-06-11");
const roundTripDst = toISODateString(parseISODate("2026-03-08")!);
check("round-trip on spring-forward date", roundTripDst, "2026-03-08");

console.log(JSON.stringify(cases));

/**
 * Timezone integration tests — DST transitions, midnight boundaries, and
 * client-side local-date behavior (Phase 2 debug pass, section 2).
 *
 * Pure functions only — no DB or network required.
 * Run with: npx tsx server/__tests__/timezone.test.ts
 */
import { execFileSync } from "child_process";
import * as path from "path";
import { zonedWallTimeToUtc, zonedDateKey } from "../lib/timezone";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(
    actual === expected,
    `${message} (got: ${JSON.stringify(actual)}, expected: ${JSON.stringify(expected)})`,
  );
}

const CHI = "America/Chicago";

// Replica of the pre-refactor prayerRoutes implementation, used to prove the
// zonedDateKey refactor is behavior-preserving.
function legacyTodayDateKey(now: Date): string {
  const chicagoStr = now.toLocaleString("en-US", { timeZone: CHI });
  const chicagoDate = new Date(chicagoStr);
  const y = chicagoDate.getFullYear();
  const m = String(chicagoDate.getMonth() + 1).padStart(2, "0");
  const d = String(chicagoDate.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function testDateKeyDstTransitions(): void {
  console.log(
    "\n[test] zonedDateKey() — DST transition days (America/Chicago)",
  );

  // Spring forward: Mar 8 2026, 2:00 AM CST → 3:00 AM CDT.
  // 1:59 AM CST == 07:59 UTC
  assertEqual(
    zonedDateKey(CHI, new Date("2026-03-08T07:59:00Z")),
    "2026-03-08",
    "1:59 AM CST on spring-forward day → Mar 8",
  );
  // 3:00 AM CDT == 08:00 UTC (the skipped-hour boundary)
  assertEqual(
    zonedDateKey(CHI, new Date("2026-03-08T08:00:00Z")),
    "2026-03-08",
    "3:00 AM CDT right after spring-forward → still Mar 8",
  );
  // 11:30 PM CDT on the transition day == 04:30 UTC Mar 9
  assertEqual(
    zonedDateKey(CHI, new Date("2026-03-09T04:30:00Z")),
    "2026-03-08",
    "11:30 PM on spring-forward day → still Mar 8 (not UTC's Mar 9)",
  );

  // Fall back: Nov 1 2026, 2:00 AM CDT → 1:00 AM CST (1-2 AM repeats).
  // First 1:30 AM (CDT) == 06:30 UTC
  assertEqual(
    zonedDateKey(CHI, new Date("2026-11-01T06:30:00Z")),
    "2026-11-01",
    "first 1:30 AM (CDT) on fall-back day → Nov 1",
  );
  // Second 1:30 AM (CST) == 07:30 UTC
  assertEqual(
    zonedDateKey(CHI, new Date("2026-11-01T07:30:00Z")),
    "2026-11-01",
    "repeated 1:30 AM (CST) on fall-back day → Nov 1",
  );

  // "Yesterday" across both transitions is exactly one calendar day.
  assertEqual(
    zonedDateKey(CHI, new Date("2026-03-09T15:00:00Z"), -1),
    "2026-03-08",
    "yesterday from Mar 9 → Mar 8 (spring-forward day, 23h long)",
  );
  assertEqual(
    zonedDateKey(CHI, new Date("2026-11-02T15:00:00Z"), -1),
    "2026-11-01",
    "yesterday from Nov 2 → Nov 1 (fall-back day, 25h long)",
  );
  // Streak window: N days ago across the fall-back boundary
  assertEqual(
    zonedDateKey(CHI, new Date("2026-11-03T15:00:00Z"), -7),
    "2026-10-27",
    "7 days ago spanning fall-back → correct calendar date",
  );
  // Month/year boundaries via offset
  assertEqual(
    zonedDateKey(CHI, new Date("2026-01-01T12:00:00Z"), -1),
    "2025-12-31",
    "yesterday across the year boundary",
  );
}

function testDateKeyMidnightBoundaries(): void {
  console.log("\n[test] zonedDateKey() — midnight boundaries");

  // 11:59:59 PM Jun 10 Chicago (CDT, UTC-5) == 04:59:59 UTC Jun 11
  assertEqual(
    zonedDateKey(CHI, new Date("2026-06-11T04:59:59Z")),
    "2026-06-10",
    "11:59:59 PM Chicago → still 'today' (Jun 10), not UTC's Jun 11",
  );
  // 12:00:01 AM Jun 11 Chicago == 05:00:01 UTC Jun 11
  assertEqual(
    zonedDateKey(CHI, new Date("2026-06-11T05:00:01Z")),
    "2026-06-11",
    "12:00:01 AM Chicago → rolls to Jun 11",
  );
  // UTC midnight == 7:00 PM Chicago the previous evening
  assertEqual(
    zonedDateKey(CHI, new Date("2026-06-11T00:00:00Z")),
    "2026-06-10",
    "UTC midnight (7 PM Chicago) → still the Chicago date (Jun 10)",
  );
}

function testLegacyEquivalence(): void {
  console.log("\n[test] zonedDateKey() matches legacy prayerRoutes logic");
  const samples = [
    "2026-03-08T07:59:00Z",
    "2026-03-08T08:00:00Z",
    "2026-11-01T06:30:00Z",
    "2026-11-01T07:30:00Z",
    "2026-06-11T04:59:59Z",
    "2026-06-11T05:00:01Z",
    "2026-01-01T05:59:00Z",
    "2025-12-31T17:00:00Z",
  ];
  for (const iso of samples) {
    const now = new Date(iso);
    assertEqual(
      zonedDateKey(CHI, now),
      legacyTodayDateKey(now),
      `equivalent for ${iso}`,
    );
  }
}

function testZonedWallTimeToUtcEdges(): void {
  console.log("\n[test] zonedWallTimeToUtc() — UTC zone and DST edge inputs");

  // UTC midnight handled exactly
  assertEqual(
    zonedWallTimeToUtc(2026, 6, 11, 0, 0, "UTC").toISOString(),
    "2026-06-11T00:00:00.000Z",
    "UTC midnight maps to itself",
  );

  // Chicago midnight on both DST transition days (midnight exists on both)
  assertEqual(
    zonedWallTimeToUtc(2026, 3, 8, 0, 0, CHI).toISOString(),
    "2026-03-08T06:00:00.000Z",
    "spring-forward day midnight → 06:00 UTC (CST)",
  );
  assertEqual(
    zonedWallTimeToUtc(2026, 11, 1, 0, 0, CHI).toISOString(),
    "2026-11-01T05:00:00.000Z",
    "fall-back day midnight → 05:00 UTC (CDT)",
  );

  // Round trip: the midnight instant renders back as 00:00 on the same
  // calendar day in Chicago — the invariant complete-today relies on for its
  // lastPrayedAt window.
  for (const [y, m, d] of [
    [2026, 3, 8],
    [2026, 11, 1],
    [2026, 6, 11],
    [2026, 1, 15],
  ] as const) {
    const utc = zonedWallTimeToUtc(y, m, d, 0, 0, CHI);
    const key = zonedDateKey(CHI, utc);
    const expected = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    assertEqual(key, expected, `midnight instant maps back to ${expected}`);
  }

  // Nonexistent wall time (2:30 AM on spring-forward day is skipped).
  // The function must not throw and must land within the surrounding hour.
  const skipped = zonedWallTimeToUtc(2026, 3, 8, 2, 30, CHI);
  assert(!isNaN(skipped.getTime()), "skipped wall time returns a valid Date");
  const lower = Date.parse("2026-03-08T07:30:00Z"); // 1:30 AM CST
  const upper = Date.parse("2026-03-08T08:30:00Z"); // 3:30 AM CDT
  assert(
    skipped.getTime() >= lower && skipped.getTime() <= upper,
    "skipped wall time resolves within the transition window",
  );
}

function testClientDateHelpersAcrossDeviceTimezones(): void {
  console.log(
    "\n[test] client date helpers under different device timezones (subprocesses)",
  );

  const helper = path.join(__dirname, "helpers", "clientDateCheck.ts");
  const run = (tz: string) => {
    const out = execFileSync("npx", ["tsx", helper], {
      env: { ...process.env, TZ: tz },
      encoding: "utf-8",
      timeout: 120_000,
    });
    const lastLine = out.trim().split("\n").pop()!;
    return JSON.parse(lastLine) as Record<string, string | null>;
  };

  // Device in Chicago: the original Phase 1 bug — toISOString() shifted
  // evening entries to tomorrow. toISODateString must keep the local date.
  const chicago = run("America/Chicago");
  assertEqual(
    chicago.eveningWinterLocal,
    "2026-01-15",
    "Chicago device, 7 PM CST entry → Jan 15 (local)",
  );
  assertEqual(
    chicago.eveningWinterUtcShifted,
    "2026-01-16",
    "control: naive toISOString() WOULD have shifted it to Jan 16",
  );
  assertEqual(
    chicago.eveningSummerLocal,
    "2026-06-11",
    "Chicago device, 6 PM CDT entry → Jun 11 (local)",
  );
  assertEqual(
    chicago.earlySummerLocal,
    "2026-06-11",
    "Chicago device, 2 AM entry → Jun 11 (both zones agree)",
  );
  assertEqual(
    chicago.roundTripKey,
    "2026-03-08",
    "Chicago device: parseISODate→toISODateString round-trips on DST day",
  );

  // Device set to UTC: helpers are device-local by design, so the entry
  // takes the device's own calendar date — no off-by-one within that zone.
  const utc = run("UTC");
  assertEqual(
    utc.eveningWinterLocal,
    "2026-01-16",
    "UTC device, same instant → Jan 16 (the UTC-local date)",
  );
  assertEqual(
    utc.roundTripKey,
    "2026-03-08",
    "UTC device: round-trip stable (no DST in UTC)",
  );

  // Device ahead of UTC (Tokyo): evening-UTC instants land on the next local
  // day; round-trips must still be stable.
  const tokyo = run("Asia/Tokyo");
  assertEqual(
    tokyo.eveningSummerLocal,
    "2026-06-12",
    "Tokyo device, 23:00 UTC instant → Jun 12 (local)",
  );
  assertEqual(
    tokyo.roundTripKey,
    "2026-03-08",
    "Tokyo device: parseISODate→toISODateString round-trips",
  );

  // Storage-format conversion is timezone-independent everywhere.
  for (const [name, result] of [
    ["Chicago", chicago],
    ["UTC", utc],
    ["Tokyo", tokyo],
  ] as const) {
    assertEqual(
      result.storageFromUs,
      "2026-03-08",
      `${name}: MM-DD-YYYY → YYYY-MM-DD conversion is TZ-independent`,
    );
  }
}

// ── main ──
console.log("==========================================");
console.log("Timezone — DST, Midnight, Client Helpers");
console.log("==========================================");

testDateKeyDstTransitions();
testDateKeyMidnightBoundaries();
testLegacyEquivalence();
testZonedWallTimeToUtcEdges();
testClientDateHelpersAcrossDeviceTimezones();

console.log("\n==========================================");
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("==========================================");
if (failed > 0) process.exit(1);

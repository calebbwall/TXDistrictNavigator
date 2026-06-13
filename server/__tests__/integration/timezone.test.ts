/**
 * Section 2 — Timezone correctness & DST edge cases.
 *
 * Covers the America/Chicago date-key helpers used by the prayer streak
 * endpoints (with injected clocks for DST boundaries), the
 * zonedWallTimeToUtc conversion around UTC midnight, the
 * /api/prayer-streak/complete-today endpoint end-to-end, and the
 * client-side mileage date helpers under different device timezones.
 */
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import {
  beginSuite,
  section,
  assert,
  assertEqual,
  truncateAll,
  startApp,
  api,
  db,
} from "./helpers";
import {
  getTodayDateKey,
  getDateKeyNDaysAgo,
  registerPrayerRoutes,
} from "../../routes/prayerRoutes";
import { zonedWallTimeToUtc } from "../../lib/timezone";
import { signUserToken } from "../../middleware/userAuth";
import {
  prayers,
  prayerStreak,
  dailyPrayerPicks,
} from "../../../shared/schema";
import { eq } from "drizzle-orm";

const execFileAsync = promisify(execFile);

function testDateKeysAcrossDst(): void {
  section("getTodayDateKey — Chicago wall date at DST boundaries");

  const at = (iso: string) => getTodayDateKey(new Date(iso));

  // Spring forward: Sunday 2026-03-08, 2:00 AM CST → 3:00 AM CDT.
  assertEqual(
    at("2026-03-08T07:59:00Z"),
    "2026-03-08",
    "1:59 AM CST on spring-forward day",
  );
  assertEqual(
    at("2026-03-08T09:00:00Z"),
    "2026-03-08",
    "4 AM CDT after the jump",
  );
  assertEqual(
    at("2026-03-09T04:59:59Z"),
    "2026-03-08",
    "11:59:59 PM CDT is still Mar 8",
  );
  assertEqual(
    at("2026-03-09T05:00:01Z"),
    "2026-03-09",
    "midnight CDT rolls to Mar 9",
  );

  // Fall back: Sunday 2026-11-01, 2:00 AM CDT → 1:00 AM CST.
  assertEqual(
    at("2026-11-01T05:00:00Z"),
    "2026-11-01",
    "midnight CDT on fall-back day",
  );
  assertEqual(
    at("2026-11-01T08:30:00Z"),
    "2026-11-01",
    "repeated 2:30 AM hour stays Nov 1",
  );
  assertEqual(
    at("2026-11-02T05:59:59Z"),
    "2026-11-01",
    "11:59:59 PM CST is still Nov 1",
  );
  assertEqual(
    at("2026-11-02T06:00:01Z"),
    "2026-11-02",
    "midnight CST rolls to Nov 2",
  );

  // UTC midnight: server in UTC must not skip ahead of Chicago.
  assertEqual(
    at("2026-06-12T00:00:00Z"),
    "2026-06-11",
    "UTC midnight is 7 PM Chicago the day before",
  );

  section("getDateKeyNDaysAgo — calendar arithmetic across DST");
  assertEqual(
    getDateKeyNDaysAgo(1, new Date("2026-03-09T12:00:00Z")),
    "2026-03-08",
    "yesterday across spring-forward (23h day)",
  );
  assertEqual(
    getDateKeyNDaysAgo(2, new Date("2026-03-09T12:00:00Z")),
    "2026-03-07",
    "two days back across spring-forward",
  );
  assertEqual(
    getDateKeyNDaysAgo(1, new Date("2026-11-02T12:00:00Z")),
    "2026-11-01",
    "yesterday across fall-back (25h day)",
  );
}

function testZonedWallTimeUtcMidnight(): void {
  section("zonedWallTimeToUtc — UTC midnight crossings");

  assertEqual(
    zonedWallTimeToUtc(2026, 6, 11, 19, 0, "America/Chicago").toISOString(),
    "2026-06-12T00:00:00.000Z",
    "7 PM CDT lands exactly on UTC midnight",
  );
  assertEqual(
    zonedWallTimeToUtc(2026, 1, 15, 18, 0, "America/Chicago").toISOString(),
    "2026-01-16T00:00:00.000Z",
    "6 PM CST lands exactly on UTC midnight",
  );

  // Round-trip: the Chicago midnight for a date key maps back to that key.
  const key = getTodayDateKey(new Date("2026-06-12T00:00:00Z")); // "2026-06-11"
  const [y, m, d] = key.split("-").map(Number);
  const chicagoMidnight = zonedWallTimeToUtc(y, m, d, 0, 0, "America/Chicago");
  assertEqual(
    getTodayDateKey(chicagoMidnight),
    key,
    "Chicago midnight for a date key round-trips to the same key",
  );
}

async function testCompleteTodayEndpoint(): Promise<void> {
  section("POST /api/prayer-streak/complete-today — end to end");
  await truncateAll();

  const server = await startApp(registerPrayerRoutes);
  const userId = "tz-test-user-1";
  const token = signUserToken(userId);

  try {
    // First completion starts a streak of 1 with today's Chicago key.
    const first = await api(
      server.url,
      "POST",
      "/api/prayer-streak/complete-today",
      {
        userToken: token,
      },
    );
    assertEqual(first.status, 200, "first completion succeeds");
    const firstBody = first.body as {
      currentStreak: number;
      lastCompletedDateKey: string;
      longestStreak: number;
    };
    assertEqual(firstBody.currentStreak, 1, "first completion → streak 1");
    assertEqual(
      firstBody.lastCompletedDateKey,
      getTodayDateKey(),
      "completion stamped with today's Chicago date key",
    );

    // Same-day repeat is idempotent.
    const repeat = await api(
      server.url,
      "POST",
      "/api/prayer-streak/complete-today",
      {
        userToken: token,
      },
    );
    assertEqual(
      (repeat.body as { currentStreak: number }).currentStreak,
      1,
      "same-day repeat does not increment",
    );

    // Completed yesterday → increments.
    await db
      .update(prayerStreak)
      .set({
        lastCompletedDateKey: getDateKeyNDaysAgo(1),
        currentStreak: 6,
        longestStreak: 6,
      })
      .where(eq(prayerStreak.userId, userId));
    const incremented = await api(
      server.url,
      "POST",
      "/api/prayer-streak/complete-today",
      {
        userToken: token,
      },
    );
    assertEqual(
      (incremented.body as { currentStreak: number }).currentStreak,
      7,
      "yesterday → today continues the streak",
    );

    // Gap of 3 days → resets to 1, longest preserved.
    await db
      .update(prayerStreak)
      .set({ lastCompletedDateKey: getDateKeyNDaysAgo(3) })
      .where(eq(prayerStreak.userId, userId));
    const reset = await api(
      server.url,
      "POST",
      "/api/prayer-streak/complete-today",
      {
        userToken: token,
      },
    );
    const resetBody = reset.body as {
      currentStreak: number;
      longestStreak: number;
    };
    assertEqual(resetBody.currentStreak, 1, "3-day gap resets the streak");
    assertEqual(
      resetBody.longestStreak,
      7,
      "longest streak preserved through reset",
    );

    // lastPrayedAt: only prayers not already prayed today (Chicago) update.
    const mk = async (title: string) => {
      const res = await api(server.url, "POST", "/api/prayers", {
        userToken: token,
        body: { title, body: "test body" },
      });
      return (res.body as { id: string }).id;
    };
    const prayerA = await mk("Prayer A");
    const prayerB = await mk("Prayer B");
    await db.insert(dailyPrayerPicks).values({
      userId,
      dateKey: getTodayDateKey(),
      prayerIds: [prayerA, prayerB],
    });

    const todayKey = getTodayDateKey();
    const [ty, tm, td] = todayKey.split("-").map(Number);
    const chicagoMidnight = zonedWallTimeToUtc(
      ty,
      tm,
      td,
      0,
      0,
      "America/Chicago",
    );
    const lastNight = new Date(chicagoMidnight.getTime() - 60 * 60 * 1000);

    await db
      .update(prayers)
      .set({ lastPrayedAt: lastNight })
      .where(eq(prayers.id, prayerB));

    await db
      .update(prayerStreak)
      .set({ lastCompletedDateKey: getDateKeyNDaysAgo(1) })
      .where(eq(prayerStreak.userId, userId));
    const before = Date.now();
    await api(server.url, "POST", "/api/prayer-streak/complete-today", {
      userToken: token,
    });

    const [rowA] = await db
      .select()
      .from(prayers)
      .where(eq(prayers.id, prayerA));
    const [rowB] = await db
      .select()
      .from(prayers)
      .where(eq(prayers.id, prayerB));
    assert(
      (rowA.lastPrayedAt?.getTime() ?? 0) >= before - 5000,
      "never-prayed pick gets lastPrayedAt stamped",
    );
    assert(
      (rowB.lastPrayedAt?.getTime() ?? 0) >= before - 5000,
      "pick last prayed yesterday evening (Chicago) gets re-stamped",
    );

    // A pick already prayed today (after Chicago midnight) is left alone.
    const alreadyToday = new Date(chicagoMidnight.getTime() + 5 * 60 * 1000);
    await db
      .update(prayers)
      .set({ lastPrayedAt: alreadyToday })
      .where(eq(prayers.id, prayerB));
    await db
      .update(prayerStreak)
      .set({ lastCompletedDateKey: getDateKeyNDaysAgo(1) })
      .where(eq(prayerStreak.userId, userId));
    await api(server.url, "POST", "/api/prayer-streak/complete-today", {
      userToken: token,
    });
    const [rowB2] = await db
      .select()
      .from(prayers)
      .where(eq(prayers.id, prayerB));
    assertEqual(
      rowB2.lastPrayedAt?.toISOString(),
      alreadyToday.toISOString(),
      "pick already prayed today (Chicago) is not double-stamped",
    );
  } finally {
    await server.close();
  }
}

async function testClientDateHelpers(): Promise<void> {
  section("client mileage date helpers — device-local dates per timezone");

  const childPath = path.join(__dirname, "clientDateKeys.child.ts");
  for (const tz of ["America/Chicago", "UTC"]) {
    const { stdout } = await execFileAsync("npx", ["tsx", childPath], {
      env: { ...process.env, TZ: tz },
    });
    const cases = JSON.parse(stdout.trim()) as {
      name: string;
      actual: string;
      expected: string;
    }[];
    for (const c of cases) {
      assertEqual(c.actual, c.expected, c.name);
    }
  }
}

export async function run(): Promise<void> {
  beginSuite("Section 2 — Timezone correctness & DST");
  testDateKeysAcrossDst();
  testZonedWallTimeUtcMidnight();
  await testCompleteTodayEndpoint();
  await testClientDateHelpers();
}

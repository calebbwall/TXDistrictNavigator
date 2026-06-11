/**
 * DB integration tests — transaction atomicity, concurrent-insert races, and
 * batched identity resolution (Phase 2 debug pass, sections 1).
 *
 * Requires DATABASE_URL pointing at a disposable Postgres database with the
 * drizzle schema pushed (npm run db:push). Exits 0 with a SKIP notice when
 * DATABASE_URL is absent so the suite can run in environments without a DB.
 *
 * Run with: npx tsx server/__tests__/dbTransactions.test.ts
 */

if (!process.env.DATABASE_URL) {
  console.log("[dbTransactions.test] SKIPPED — DATABASE_URL is not set");
  process.exit(0);
}

import { eq, and, like, inArray, sql } from "drizzle-orm";
import { db, pool } from "../db";
import {
  committees,
  committeeMemberships,
  legislativeEvents,
  hearingDetails,
  hearingAgendaItems,
  witnesses,
  bills,
  persons,
  personLinks,
  officialPublic,
  type InsertCommitteeMembership,
} from "../../shared/schema";
import { findOrCreateBill } from "../jobs/targetedRefresh";
import { resolveAllMissingPersonIds } from "../lib/identityResolver";

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

const MARK = "P2TEST";

async function cleanup(): Promise<void> {
  await db.delete(witnesses).where(like(witnesses.fullName, `${MARK}%`));
  await db
    .delete(legislativeEvents)
    .where(like(legislativeEvents.externalId, `${MARK}%`));
  await db.delete(committees).where(like(committees.slug, `${MARK.toLowerCase()}%`));
  await db.delete(bills).where(like(bills.billNumber, "HB99%"));
  await db
    .delete(officialPublic)
    .where(like(officialPublic.sourceMemberId, `${MARK}%`));
  await db.delete(persons).where(like(persons.fullNameDisplay, `${MARK}%`));
}

// ── 1. Committee membership atomic replace (refreshCommittees.ts pattern) ──
async function testCommitteeMembershipRollback(): Promise<void> {
  console.log(
    "\n[test] committee membership replace rolls back on mid-transaction crash",
  );

  const [committee] = await db
    .insert(committees)
    .values({
      chamber: "TX_HOUSE",
      name: `${MARK} Appropriations`,
      slug: `${MARK.toLowerCase()}-appropriations`,
    })
    .returning();

  const originalRoster: InsertCommitteeMembership[] = Array.from(
    { length: 5 },
    (_, i) => ({
      committeeId: committee.id,
      memberName: `${MARK} Member ${i}`,
      roleTitle: i === 0 ? "Chair" : "Member",
      sortOrder: String(i),
      legCode: `${MARK}${i}`,
    }),
  );
  await db.insert(committeeMemberships).values(originalRoster);

  // Same shape as refreshChamberCommittees' atomic replace, but crash between
  // the delete and the insert.
  let threw = false;
  try {
    await db.transaction(async (tx) => {
      await tx
        .delete(committeeMemberships)
        .where(eq(committeeMemberships.committeeId, committee.id));
      throw new Error("simulated crash mid-refresh");
    });
  } catch {
    threw = true;
  }
  assert(threw, "simulated crash propagates out of the transaction");

  const afterCrash = await db
    .select()
    .from(committeeMemberships)
    .where(eq(committeeMemberships.committeeId, committee.id));
  assertEqual(
    afterCrash.length,
    5,
    "all 5 original memberships survive the aborted replace",
  );
  assert(
    afterCrash.some((m) => m.roleTitle === "Chair"),
    "chair row intact after rollback",
  );

  // Success path: replace completes atomically.
  const newRoster = originalRoster
    .slice(0, 3)
    .map((m) => ({ ...m, memberName: `${m.memberName} v2` }));
  await db.transaction(async (tx) => {
    await tx
      .delete(committeeMemberships)
      .where(eq(committeeMemberships.committeeId, committee.id));
    await tx.insert(committeeMemberships).values(newRoster);
  });
  const afterReplace = await db
    .select()
    .from(committeeMemberships)
    .where(eq(committeeMemberships.committeeId, committee.id));
  assertEqual(afterReplace.length, 3, "successful replace leaves new roster");
  assert(
    afterReplace.every((m) => m.memberName.endsWith("v2")),
    "replace fully swapped the roster",
  );
}

// ── 2. Hearing detail refresh atomicity (targetedRefresh.ts pattern) ──
async function testHearingRefreshRollback(): Promise<void> {
  console.log(
    "\n[test] hearing fingerprint + agenda + witnesses roll back together",
  );

  const [event] = await db
    .insert(legislativeEvents)
    .values({
      eventType: "COMMITTEE_HEARING",
      title: `${MARK} Hearing`,
      sourceUrl: "https://example.com/notice",
      externalId: `${MARK}-EVT-1`,
      fingerprint: "fp-old",
    })
    .returning();

  await db
    .insert(hearingDetails)
    .values({ eventId: event.id, noticeText: "original notice", witnessCount: 2 });
  await db.insert(hearingAgendaItems).values([
    { eventId: event.id, itemText: "HB 1 layout", sortOrder: 0 },
    { eventId: event.id, itemText: "HB 2 layout", sortOrder: 1 },
  ]);
  await db.insert(witnesses).values([
    { eventId: event.id, fullName: `${MARK} Witness A`, sortOrder: 0 },
    { eventId: event.id, fullName: `${MARK} Witness B`, sortOrder: 1 },
  ]);

  // Mirror refreshHearingDetail's transaction, crashing after the destructive
  // deletes. Pre-fix, the fingerprint update committed first and the deletes
  // were unwrapped — a crash here left the event "fresh" but gutted.
  let threw = false;
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(legislativeEvents)
        .set({ fingerprint: "fp-new", updatedAt: new Date() })
        .where(eq(legislativeEvents.id, event.id));
      await tx
        .delete(hearingAgendaItems)
        .where(eq(hearingAgendaItems.eventId, event.id));
      await tx.delete(witnesses).where(eq(witnesses.eventId, event.id));
      throw new Error("simulated crash before re-insert");
    });
  } catch {
    threw = true;
  }
  assert(threw, "simulated crash propagates out of the transaction");

  const [eventAfter] = await db
    .select({ fingerprint: legislativeEvents.fingerprint })
    .from(legislativeEvents)
    .where(eq(legislativeEvents.id, event.id));
  assertEqual(
    eventAfter.fingerprint,
    "fp-old",
    "fingerprint NOT updated after aborted refresh (event will be retried)",
  );

  const agendaAfter = await db
    .select()
    .from(hearingAgendaItems)
    .where(eq(hearingAgendaItems.eventId, event.id));
  assertEqual(agendaAfter.length, 2, "agenda items survive the rollback");

  const witnessesAfter = await db
    .select()
    .from(witnesses)
    .where(eq(witnesses.eventId, event.id));
  assertEqual(witnessesAfter.length, 2, "witnesses survive the rollback");

  const [detailAfter] = await db
    .select({ noticeText: hearingDetails.noticeText })
    .from(hearingDetails)
    .where(eq(hearingDetails.eventId, event.id));
  assertEqual(
    detailAfter.noticeText,
    "original notice",
    "hearing detail untouched by aborted refresh",
  );
}

// ── 3. findOrCreateBill concurrent-insert race ──
async function testFindOrCreateBillRace(): Promise<void> {
  console.log("\n[test] findOrCreateBill under concurrent insertion");

  const BILL = "HB9901";
  await db.delete(bills).where(eq(bills.billNumber, BILL));

  const CONCURRENCY = 10;
  const ids = await Promise.all(
    Array.from({ length: CONCURRENCY }, () => findOrCreateBill(`hb 9901`)),
  );

  assert(
    ids.every((id) => id !== null),
    `all ${CONCURRENCY} concurrent callers got a non-null bill id`,
  );
  assertEqual(
    new Set(ids).size,
    1,
    "every concurrent caller resolved the SAME bill id",
  );

  const rows = await db
    .select({ id: bills.id })
    .from(bills)
    .where(eq(bills.billNumber, BILL));
  assertEqual(rows.length, 1, "exactly one bill row exists after the race");
  assertEqual(rows[0].id, ids[0], "stored row id matches the returned id");

  // Sequential idempotency, including whitespace-variant inputs ("HB 9901"
  // and "hb9901" must resolve to the same row, not create a duplicate).
  const again = await findOrCreateBill("HB 9901");
  assertEqual(again, ids[0], "subsequent lookup returns the existing id");
  const variant = await findOrCreateBill("hb9901");
  assertEqual(variant, ids[0], "whitespace/case variant resolves to same bill");
}

// ── 4. resolveAllMissingPersonIds — batched (no N+1) and correct ──
async function testResolveAllMissingPersonIds(): Promise<void> {
  console.log(
    "\n[test] resolveAllMissingPersonIds — query count and correctness",
  );

  const N = 120;
  const officialRows = Array.from({ length: N }, (_, i) => ({
    source: "TX_HOUSE" as const,
    sourceMemberId: `${MARK}-OFF-${i}`,
    chamber: "TX_HOUSE",
    district: String(900 + i),
    // Two officials share a name to exercise canonical dedupe
    fullName: i === 1 ? `${MARK} Dup Name` : `${MARK} Official ${i}`,
    active: true,
  }));
  officialRows[0].fullName = `${MARK} Dup Name`;
  const insertedOfficials = await db
    .insert(officialPublic)
    .values(officialRows)
    .returning({ id: officialPublic.id });

  // Explicit admin link for one official → must take precedence over names
  const [linkedPerson] = await db
    .insert(persons)
    .values({
      fullNameCanonical: `${MARK.toLowerCase()} preexisting canonical`,
      fullNameDisplay: `${MARK} Preexisting Person`,
    })
    .returning({ id: persons.id });
  await db.insert(personLinks).values({
    officialPublicId: insertedOfficials[5].id,
    personId: linkedPerson.id,
  });

  const [{ cnt: personsBefore }] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(persons);

  // Count round-trips by intercepting pool.query (drizzle's node-postgres
  // session funnels non-transaction queries through it).
  const realQuery = pool.query.bind(pool);
  let queryCount = 0;
  (pool as { query: typeof pool.query }).query = ((...args: unknown[]) => {
    queryCount++;
    return (realQuery as (...a: unknown[]) => unknown)(...args);
  }) as typeof pool.query;

  let result: { resolved: number; created: number };
  try {
    result = await resolveAllMissingPersonIds();
  } finally {
    (pool as { query: typeof pool.query }).query = realQuery;
  }

  console.log(
    `  ℹ ${N} missing officials resolved with ${queryCount} queries (created=${result.created})`,
  );
  assert(
    queryCount <= 8,
    `constant query count for ${N} officials (got ${queryCount}, expected ≤ 8 — was ~${4 * N} before batching)`,
  );
  assertEqual(result.resolved, N, "every inserted official was resolved");

  const [{ cnt: personsAfter }] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(persons);
  // N officials, two share a name (one person), one uses the preexisting
  // explicit link (no new person) → N - 2 new persons.
  assertEqual(
    result.created,
    N - 2,
    "created count reflects canonical dedupe + explicit link",
  );
  assertEqual(
    personsAfter - personsBefore,
    result.created,
    "persons table grew by exactly the created count",
  );

  const ids = insertedOfficials.map((o) => o.id);
  const linked = await db
    .select({
      id: officialPublic.id,
      personId: officialPublic.personId,
      fullName: officialPublic.fullName,
    })
    .from(officialPublic)
    .where(inArray(officialPublic.id, ids));
  assert(
    linked.every((o) => o.personId !== null),
    "all officials now have a personId",
  );
  const explicitlyLinked = linked.find((o) => o.id === insertedOfficials[5].id);
  assertEqual(
    explicitlyLinked?.personId ?? null,
    linkedPerson.id,
    "explicit person link took precedence over name matching",
  );
  const dups = linked.filter((o) => o.fullName === `${MARK} Dup Name`);
  assertEqual(dups.length, 2, "two officials share the duplicate name");
  assertEqual(
    dups[0].personId,
    dups[1].personId,
    "same-named officials resolved to the same person",
  );

  // Second run is a no-op
  const again = await resolveAllMissingPersonIds();
  assertEqual(again.resolved, 0, "second run resolves nothing (idempotent)");
  assertEqual(again.created, 0, "second run creates nothing");
}

// ── main ──
async function main(): Promise<void> {
  console.log("==========================================");
  console.log("DB Integration — Transactions & Races");
  console.log("==========================================");

  await cleanup();
  try {
    await testCommitteeMembershipRollback();
    await testHearingRefreshRollback();
    await testFindOrCreateBillRace();
    await testResolveAllMissingPersonIds();
  } finally {
    await cleanup();
    await pool.end();
  }

  console.log("\n==========================================");
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("==========================================");
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Test run failed:", err);
  process.exit(1);
});

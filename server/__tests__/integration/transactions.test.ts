/**
 * Section 1 — Transaction atomicity & race-condition fixes (P0 hardening).
 *
 * Runs the real refresh jobs against the test database with a mocked
 * globalThis.fetch standing in for capitol.texas.gov, and uses a failing
 * BEFORE INSERT trigger to simulate a crash mid-refresh.
 */
import {
  beginSuite,
  section,
  assert,
  assertEqual,
  truncateAll,
  installFailTrigger,
  removeFailTrigger,
  instrumentPool,
  realFetch,
  db,
} from "./helpers";
import {
  committeeMemberships,
  committeeRefreshState,
  legislativeEvents,
  hearingDetails,
  hearingAgendaItems,
  witnesses,
  bills,
  officialPublic,
  persons,
  personLinks,
} from "../../../shared/schema";
import { eq, asc, isNull } from "drizzle-orm";

// ── mock TLO pages ──

function committeeListHtml(): string {
  return `<html><body><table>
    <tr><td><a href="/Committees/MembershipCmte.aspx?LegSess=89R&CmteCode=C001">Agriculture and Livestock</a></td></tr>
  </table></body></html>`;
}

function membershipHtml(members: { name: string; legCode: string }[]): string {
  const cells = members
    .map(
      (m, i) =>
        `<div>${i === 0 ? "Chair" : ""}</div><div><a href="/Members/MemberInfo.aspx?LegCode=${m.legCode}">${m.name}</a></div>`,
    )
    .join("\n");
  return `<html><body><div class="grid-template-two-column_membershipcmte">
    <div>Position</div><div>Member</div>
    ${cells}
  </div></body></html>`;
}

function noticeHtml(): string {
  return `<html><body>
    <h1>Agriculture and Livestock</h1>
    <p>COMMITTEE: Agriculture and Livestock — PUBLIC HEARING</p>
    <p>TIME &amp; DATE: 04/01/2026 10:00 AM</p>
    <p>PLACE: Room E2.010 Capitol Extension</p>
    <p>The committee will consider the following measures: HB 1 relating to water rights. HB 2 relating to rural broadband infrastructure funding.</p>
    <table>
      <tr><th>Position</th><th>Witness</th><th>Organization</th><th>Bill</th></tr>
      <tr><td>FOR</td><td>Jane Smith</td><td>Texas Farm Bureau</td><td>HB 1</td></tr>
      <tr><td>AGAINST</td><td>Bob Jones</td><td>Water Coalition</td><td>HB 2</td></tr>
    </table>
  </body></html>`;
}

type FetchHandler = (url: string) => { status: number; body: string } | null;

function patchFetch(handler: FetchHandler): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    if (url.startsWith("http://127.0.0.1")) {
      return realFetch(input as RequestInfo, init);
    }
    const mocked = handler(url);
    if (!mocked) {
      throw new Error(`Unexpected outbound fetch during test: ${url}`);
    }
    return new Response(mocked.body, {
      status: mocked.status,
      headers: { "Content-Type": "text/html" },
    });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

// ── tests ──

async function testCommitteeRefreshRollback(): Promise<void> {
  section("refreshCommittees — crash mid-replace rolls back atomically");
  await truncateAll();

  const { checkAndRefreshCommitteesIfChanged } = await import(
    "../../jobs/refreshCommittees"
  );

  let houseMembers = [
    { name: "Alice Anderson", legCode: "A0001" },
    { name: "Bob Brown", legCode: "B0002" },
    { name: "Carol Clark", legCode: "C0003" },
  ];

  const unpatch = patchFetch((url) => {
    if (url.includes("Committees.aspx?Chamber=H")) {
      return { status: 200, body: committeeListHtml() };
    }
    if (url.includes("Committees.aspx?Chamber=S")) {
      return { status: 200, body: "<html><body></body></html>" };
    }
    if (url.includes("MembershipCmte.aspx")) {
      return { status: 200, body: membershipHtml(houseMembers) };
    }
    return null;
  });

  try {
    // Run 1: seed the roster.
    const run1 = await checkAndRefreshCommitteesIfChanged(true);
    const house1 = run1.results.find((r) => r.source === "TX_HOUSE_COMMITTEES");
    assert(house1?.refreshed === true, "run 1: house chamber refreshed");
    assertEqual(house1?.membershipsCount, 3, "run 1: 3 memberships written");

    const rosterAfterRun1 = await db
      .select()
      .from(committeeMemberships)
      .orderBy(asc(committeeMemberships.sortOrder));
    assertEqual(rosterAfterRun1.length, 3, "run 1: roster has 3 rows in DB");
    assertEqual(
      rosterAfterRun1[0]?.roleTitle,
      "Chair",
      "run 1: first member is Chair",
    );

    const [stateAfterRun1] = await db
      .select()
      .from(committeeRefreshState)
      .where(eq(committeeRefreshState.source, "TX_HOUSE_COMMITTEES"));
    const fingerprintAfterRun1 = stateAfterRun1?.fingerprint ?? null;
    assert(!!fingerprintAfterRun1, "run 1: fingerprint stored");

    // Run 2: upstream roster changes, but the batch insert crashes mid-replace.
    houseMembers = [
      { name: "Alice Anderson", legCode: "A0001" },
      { name: "Bob Brown", legCode: "B0002" },
      { name: "Dave Daniels", legCode: "D0004" },
    ];
    await installFailTrigger("committee_memberships");
    const run2 = await checkAndRefreshCommitteesIfChanged(true);
    await removeFailTrigger("committee_memberships");

    const house2 = run2.results.find((r) => r.source === "TX_HOUSE_COMMITTEES");
    assert(
      typeof house2?.error === "string" &&
        house2.error.includes("test-induced failure"),
      "run 2: refresh reported the induced failure",
    );

    const rosterAfterCrash = await db
      .select()
      .from(committeeMemberships)
      .orderBy(asc(committeeMemberships.sortOrder));
    assertEqual(
      rosterAfterCrash.length,
      3,
      "run 2: roster intact after crash (delete rolled back)",
    );
    assert(
      rosterAfterCrash.some((m) => m.memberName === "Carol Clark"),
      "run 2: pre-crash member Carol Clark still present",
    );
    assert(
      !rosterAfterCrash.some((m) => m.memberName === "Dave Daniels"),
      "run 2: no partial insert of the new roster",
    );

    const [stateAfterCrash] = await db
      .select()
      .from(committeeRefreshState)
      .where(eq(committeeRefreshState.source, "TX_HOUSE_COMMITTEES"));
    assertEqual(
      stateAfterCrash?.fingerprint,
      fingerprintAfterRun1,
      "run 2: fingerprint NOT advanced past the failed refresh",
    );

    // Run 3: no force needed — the stale fingerprint lets the job self-heal.
    const run3 = await checkAndRefreshCommitteesIfChanged(false);
    const house3 = run3.results.find((r) => r.source === "TX_HOUSE_COMMITTEES");
    assert(house3?.refreshed === true, "run 3: self-heal refresh ran");

    const rosterAfterHeal = await db.select().from(committeeMemberships);
    assertEqual(rosterAfterHeal.length, 3, "run 3: roster replaced (3 rows)");
    assert(
      rosterAfterHeal.some((m) => m.memberName === "Dave Daniels"),
      "run 3: new member Dave Daniels present",
    );
    assert(
      !rosterAfterHeal.some((m) => m.memberName === "Carol Clark"),
      "run 3: removed member Carol Clark gone",
    );
  } finally {
    await removeFailTrigger("committee_memberships");
    unpatch();
  }
}

async function testHearingDetailRollback(): Promise<void> {
  section("refreshHearingDetail — crash mid-replace rolls back atomically");
  await truncateAll();

  const { refreshHearingDetail, fingerprint } = await import(
    "../../jobs/targetedRefresh"
  );

  // Seed an event with a previous good state.
  const [event] = await db
    .insert(legislativeEvents)
    .values({
      eventType: "COMMITTEE_HEARING",
      chamber: "TX_HOUSE",
      title: "Agriculture and Livestock",
      sourceUrl:
        "https://capitol.texas.gov/tlodocs/89R/schedules/html/TEST01.HTM",
      externalId: "HTEST-20260401-1000AM",
      fingerprint: "oldfp",
      startsAt: new Date("2026-04-01T15:00:00Z"),
    })
    .returning({ id: legislativeEvents.id });
  const eventId = event.id;

  const oldNotice =
    "previous notice text — long enough to count as meaningful (>50 chars).";
  await db.insert(hearingDetails).values({
    eventId,
    noticeText: oldNotice,
    witnessCount: 1,
  });
  await db.insert(hearingAgendaItems).values({
    eventId,
    billNumber: "HB99",
    itemText: "old agenda item",
    sortOrder: 0,
  });
  await db.insert(witnesses).values({
    eventId,
    fullName: "Old Witness",
    sortOrder: 0,
  });

  const html = noticeHtml();
  const unpatch = patchFetch((url) =>
    url.includes("tlodocs") ? { status: 200, body: html } : null,
  );

  try {
    // Crash inside the transaction (witness insert fails).
    await installFailTrigger("witnesses");
    let threw = false;
    try {
      await refreshHearingDetail(eventId);
    } catch (err) {
      threw = String(err).includes("test-induced failure");
    }
    await removeFailTrigger("witnesses");
    assert(threw, "crash run: refreshHearingDetail surfaced the failure");

    const agendaAfterCrash = await db
      .select()
      .from(hearingAgendaItems)
      .where(eq(hearingAgendaItems.eventId, eventId));
    assertEqual(
      agendaAfterCrash.length,
      1,
      "crash run: old agenda item intact",
    );
    assertEqual(
      agendaAfterCrash[0]?.billNumber,
      "HB99",
      "crash run: agenda item is the pre-crash row",
    );

    const witnessesAfterCrash = await db
      .select()
      .from(witnesses)
      .where(eq(witnesses.eventId, eventId));
    assertEqual(witnessesAfterCrash.length, 1, "crash run: old witness intact");

    const [eventAfterCrash] = await db
      .select({ fingerprint: legislativeEvents.fingerprint })
      .from(legislativeEvents)
      .where(eq(legislativeEvents.id, eventId));
    assertEqual(
      eventAfterCrash?.fingerprint,
      "oldfp",
      "crash run: fingerprint update rolled back with the rest",
    );

    const [detailAfterCrash] = await db
      .select({ noticeText: hearingDetails.noticeText })
      .from(hearingDetails)
      .where(eq(hearingDetails.eventId, eventId));
    assertEqual(
      detailAfterCrash?.noticeText,
      oldNotice,
      "crash run: notice text unchanged",
    );

    // Healthy run: same fetch, no trigger — everything replaced atomically.
    const updated = await refreshHearingDetail(eventId);
    assert(updated === true, "healthy run: detail refresh reports success");

    const agenda = await db
      .select()
      .from(hearingAgendaItems)
      .where(eq(hearingAgendaItems.eventId, eventId))
      .orderBy(asc(hearingAgendaItems.sortOrder));
    assertEqual(agenda.length, 2, "healthy run: 2 agenda items");
    assertEqual(agenda[0]?.billNumber, "HB1", "healthy run: HB1 normalized");
    assertEqual(agenda[1]?.billNumber, "HB2", "healthy run: HB2 normalized");
    assert(
      agenda.every((a) => a.billId !== null),
      "healthy run: agenda items linked to bills",
    );

    const witnessRows = await db
      .select()
      .from(witnesses)
      .where(eq(witnesses.eventId, eventId))
      .orderBy(asc(witnesses.sortOrder));
    assertEqual(witnessRows.length, 2, "healthy run: 2 witnesses");
    assertEqual(
      witnessRows[0]?.fullName,
      "Jane Smith",
      "healthy run: witness parsed from table",
    );

    const [detail] = await db
      .select()
      .from(hearingDetails)
      .where(eq(hearingDetails.eventId, eventId));
    assertEqual(detail?.witnessCount, 2, "healthy run: witnessCount = 2");

    const [eventAfter] = await db
      .select({ fingerprint: legislativeEvents.fingerprint })
      .from(legislativeEvents)
      .where(eq(legislativeEvents.id, eventId));
    assertEqual(
      eventAfter?.fingerprint,
      fingerprint(html),
      "healthy run: fingerprint advanced to the new notice",
    );

    const billRows = await db.select().from(bills);
    assertEqual(billRows.length, 2, "healthy run: HB1/HB2 created once each");
  } finally {
    await removeFailTrigger("witnesses");
    unpatch();
  }
}

async function testFindOrCreateBillRace(): Promise<void> {
  section("findOrCreateBill — concurrent inserts return one shared id");
  await truncateAll();

  const { findOrCreateBill } = await import("../../jobs/targetedRefresh");

  const CONCURRENCY = 16;
  const ids = await Promise.all(
    Array.from({ length: CONCURRENCY }, () => findOrCreateBill("HB 4242")),
  );

  assert(
    ids.every((id) => id !== null),
    "no concurrent caller received null",
  );
  assertEqual(
    new Set(ids).size,
    1,
    "all concurrent callers resolved the same bill id",
  );

  const rows = await db.select().from(bills);
  assertEqual(rows.length, 1, "exactly one bills row created");
  assertEqual(rows[0]?.billNumber, "HB 4242", "bill number stored as given");

  const again = await findOrCreateBill("HB 4242");
  assertEqual(again, ids[0], "subsequent lookup returns the same id");
}

async function testResolveAllMissingPersonIdsBatching(): Promise<void> {
  section("resolveAllMissingPersonIds — constant query count, links honored");
  await truncateAll();

  const { resolveAllMissingPersonIds } = await import(
    "../../lib/identityResolver"
  );

  // 120 officials without personId. Two share a name (dedupe case), and one
  // has an explicit person_links override that must win over name matching.
  const TOTAL = 120;
  const officialRows = Array.from({ length: TOTAL }, (_, i) => ({
    source: "TX_HOUSE" as const,
    sourceMemberId: `M${i}`,
    chamber: "House",
    district: String(i + 1),
    fullName:
      i === 118 || i === 119
        ? "Shared Name"
        : `Test Person ${i.toString().padStart(3, "0")}`,
    active: true,
  }));
  const insertedOfficials = await db
    .insert(officialPublic)
    .values(officialRows)
    .returning({ id: officialPublic.id, fullName: officialPublic.fullName });

  const [linkedPerson] = await db
    .insert(persons)
    .values({
      fullNameCanonical: "manually linked person",
      fullNameDisplay: "Manually Linked Person",
    })
    .returning({ id: persons.id });
  const overriddenOfficial = insertedOfficials[0];
  await db.insert(personLinks).values({
    officialPublicId: overriddenOfficial.id,
    personId: linkedPerson.id,
  });

  const meter = instrumentPool();
  const result = await resolveAllMissingPersonIds();
  const queries = meter.count();
  meter.restore();

  console.log(`  ℹ queries issued for ${TOTAL} missing officials: ${queries}`);
  assert(
    queries <= 10,
    `query count is constant, not O(N) (${queries} queries for ${TOTAL} officials)`,
  );
  assertEqual(result.resolved, TOTAL, "all officials resolved");
  // 119 distinct canonical names among non-linked officials; the duplicate
  // pair shares one person and the explicitly linked official creates none.
  assertEqual(result.created, 118, "one person per unique non-linked name");

  const unresolved = await db
    .select({ id: officialPublic.id })
    .from(officialPublic)
    .where(isNull(officialPublic.personId));
  assertEqual(unresolved.length, 0, "no official left without personId");

  const [overriddenRow] = await db
    .select({ personId: officialPublic.personId })
    .from(officialPublic)
    .where(eq(officialPublic.id, overriddenOfficial.id));
  assertEqual(
    overriddenRow?.personId,
    linkedPerson.id,
    "explicit person link takes precedence over name matching",
  );

  const sharedRows = await db
    .select({ personId: officialPublic.personId })
    .from(officialPublic)
    .where(eq(officialPublic.fullName, "Shared Name"));
  assertEqual(
    new Set(sharedRows.map((r) => r.personId)).size,
    1,
    "same-named officials share one person record",
  );

  const second = await resolveAllMissingPersonIds();
  assertEqual(second.resolved, 0, "second run is a no-op");
  assertEqual(second.created, 0, "second run creates nothing");
}

export async function run(): Promise<void> {
  beginSuite("Section 1 — Transactions & race conditions");
  await testCommitteeRefreshRollback();
  await testHearingDetailRollback();
  await testFindOrCreateBillRace();
  await testResolveAllMissingPersonIdsBatching();
}

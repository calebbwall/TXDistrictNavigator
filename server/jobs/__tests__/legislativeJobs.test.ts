/**
 * Runtime-assertion tests for legislative refresh pure utilities.
 * Tests only standalone pure functions — no DB required.
 * Run with: npx tsx server/jobs/__tests__/legislativeJobs.test.ts
 */
import * as crypto from "crypto";

// ── tiny assertion helper ──
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

// ── fingerprint (same logic as targetedRefresh.ts) ──
function fingerprint(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex").slice(0, 16);
}

// ── itemFingerprint (same logic as pollRssFeeds.ts) ──
function itemFingerprint(parts: (string | null | undefined)[]): string {
  return crypto
    .createHash("sha256")
    .update(parts.filter(Boolean).join("|"))
    .digest("hex")
    .slice(0, 16);
}

// ── msUntilNext5amChicago (same logic as refreshDailyLegislative.ts) ──
function msUntilNext5amChicago(): number {
  const now = new Date();
  const chicagoStr = now.toLocaleString("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });
  const [h, m, s] = chicagoStr.split(":").map(Number);
  const secondsIntoDay = h * 3600 + m * 60 + (s || 0);
  const target5am = 5 * 3600;
  let secondsUntil = target5am - secondsIntoDay;
  if (secondsUntil <= 0) secondsUntil += 24 * 3600;
  return secondsUntil * 1000;
}

// ── parsedActionType (same logic as targetedRefresh.ts — fixed order) ──
function parsedActionType(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("referred to")) return "COMMITTEE_REFERRAL";
  // Check unfavorable before favorable (substring match ordering)
  if (t.includes("unfavorable") || t.includes("failed")) return "FAILED";
  if (t.includes("passed") || t.includes("favorable")) return "PASSED";
  if (t.includes("filed")) return "FILED";
  if (t.includes("signed")) return "SIGNED";
  if (t.includes("vetoed")) return "VETOED";
  if (t.includes("hearing")) return "HEARING_SCHEDULED";
  if (t.includes("vote") || t.includes("voted")) return "VOTE";
  return "ACTION";
}

// ── Tests ──
function testFingerprint(): void {
  console.log("\n[test] fingerprint()");
  const fp1 = fingerprint("hello world");
  const fp2 = fingerprint("hello world");
  const fp3 = fingerprint("different content");
  assertEqual(fp1, fp2, "same input → same fingerprint");
  assert(fp1 !== fp3, "different input → different fingerprint");
  assertEqual(fp1.length, 16, "fingerprint is 16 hex chars");
  assert(/^[0-9a-f]+$/.test(fp1), "fingerprint is lowercase hex");
}

function testItemFingerprint(): void {
  console.log("\n[test] itemFingerprint()");
  const fp1 = itemFingerprint(["Title", "https://example.com", null, "2025-01-01"]);
  const fp2 = itemFingerprint(["Title", "https://example.com", null, "2025-01-01"]);
  const fp3 = itemFingerprint(["Title Changed", "https://example.com", null, "2025-01-01"]);
  assertEqual(fp1, fp2, "stable fingerprint with identical data");
  assert(fp1 !== fp3, "title change → different fingerprint");
  // null filtering
  const fpNull = itemFingerprint(["A", null, undefined, "B"]);
  const fpNoNull = itemFingerprint(["A", "B"]);
  assertEqual(fpNull, fpNoNull, "nulls are filtered before hashing");
}

function testDailyTimer(): void {
  console.log("\n[test] msUntilNext5amChicago()");
  const ms = msUntilNext5amChicago();
  assert(typeof ms === "number", "returns a number");
  assert(ms > 0, "delay is positive");
  assert(ms <= 24 * 60 * 60 * 1000, "delay ≤ 24 hours");
  assert(ms >= 1000, "delay is at least 1 second");
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  console.log(`  ℹ next 5 AM Chicago in: ${h}h ${m}m`);
}

function testBillNumberExtraction(): void {
  console.log("\n[test] bill number regex extraction");
  const billPattern = /\b([HS][BJR]{1,2}\s*\d+)\b/g;
  const text = "HB 1234 and SB567 and HJR 22 and SJR100 and garbage xyz";
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = billPattern.exec(text)) !== null) {
    matches.push(m[1].replace(/\s+/g, "").toUpperCase());
  }
  assert(matches.includes("HB1234"), "extracts 'HB 1234'");
  assert(matches.includes("SB567"), "extracts 'SB567'");
  assert(matches.includes("HJR22"), "extracts 'HJR 22'");
  assert(matches.includes("SJR100"), "extracts 'SJR100'");
  assert(!matches.includes("XYZ"), "does not extract garbage");
}

function testParsedActionType(): void {
  console.log("\n[test] parsedActionType()");
  assertEqual(parsedActionType("Referred to House Appropriations"), "COMMITTEE_REFERRAL", "referred to");
  assertEqual(parsedActionType("Passed 2nd reading favorable"), "PASSED", "passed/favorable");
  assertEqual(parsedActionType("Failed — unfavorable report"), "FAILED", "failed/unfavorable");
  assertEqual(parsedActionType("Filed in the House"), "FILED", "filed");
  assertEqual(parsedActionType("Signed by the Governor"), "SIGNED", "signed");
  assertEqual(parsedActionType("Vetoed by Governor"), "VETOED", "vetoed");
  assertEqual(parsedActionType("Set for public hearing"), "HEARING_SCHEDULED", "hearing");
  assertEqual(parsedActionType("Members voted on amendment"), "VOTE", "vote");
  assertEqual(parsedActionType("General calendar action"), "ACTION", "fallback");
}

function testFingerprintDateParsing(): void {
  console.log("\n[test] TLO date parsing helper");
  function parseIsoDateTime(dateStr: string, timeStr: string): Date | null {
    try {
      const [month, day, year] = dateStr.split("/").map(Number);
      const [timePart, ampm] = timeStr.trim().split(" ");
      const [rawHour, rawMin] = timePart.split(":").map(Number);
      let hour = rawHour;
      if (ampm?.toUpperCase() === "PM" && hour !== 12) hour += 12;
      if (ampm?.toUpperCase() === "AM" && hour === 12) hour = 0;
      if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hour)) return null;
      const dateIso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(rawMin ?? 0).padStart(2, "0")}:00`;
      const d = new Date(dateIso);
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }

  const d = parseIsoDateTime("01/15/2025", "9:00 AM");
  assert(d !== null, "parses valid date");
  assert(d!.getFullYear() === 2025, "correct year");
  assert(d!.getMonth() === 0, "correct month (0-indexed)");
  assert(d!.getDate() === 15, "correct day");

  const pm = parseIsoDateTime("06/01/2025", "2:30 PM");
  assert(pm !== null, "parses PM time");
  assert(pm!.getHours() === 14, "PM hour conversion");

  const bad = parseIsoDateTime("invalid", "stuff");
  assert(bad === null, "invalid date returns null");
}

// ── main ──
console.log("======================================");
console.log("Legislative Jobs — Runtime Assertions");
console.log("======================================");

testFingerprint();
testItemFingerprint();
testDailyTimer();
testBillNumberExtraction();
testParsedActionType();
testFingerprintDateParsing();

console.log("\n======================================");
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("======================================");

if (failed > 0) process.exit(1);

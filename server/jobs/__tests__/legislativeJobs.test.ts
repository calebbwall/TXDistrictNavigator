/**
 * Runtime-assertion tests for legislative refresh pure utilities.
 * Tests only standalone pure functions — no DB required.
 * Run with: npx tsx server/jobs/__tests__/legislativeJobs.test.ts
 */
import * as crypto from "crypto";
import * as cheerio from "cheerio";

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

// ── parseWitnessesFromHtml (same logic as targetedRefresh.ts) ──
const WITNESS_POSITION_RE = /^(FOR|AGAINST|ON)$/i;
const WITNESS_BILL_RE = /\b([HS][BJR]{1,2}\s*\d+)\b/i;

interface ParsedWitness {
  fullName: string;
  organization: string | null;
  position: string | null;
  billNumber: string | null;
}

function parseWitnessesFromHtml($: ReturnType<typeof cheerio.load>): ParsedWitness[] {
  const results: ParsedWitness[] = [];

  $("table").each((_, table) => {
    const rows = $(table).find("tr");
    if (rows.length < 2) return;
    let hasPositionCell = false;
    rows.each((_, row) => {
      if (hasPositionCell) return;
      $(row).find("td").each((_, td) => {
        if (WITNESS_POSITION_RE.test($(td).text().trim())) hasPositionCell = true;
      });
    });
    if (!hasPositionCell) return;

    let posCol = -1, nameCol = -1, orgCol = -1, billCol = -1;
    const headerCells = $(rows[0]).find("th");
    if (headerCells.length > 0) {
      headerCells.each((idx, th) => {
        const t = $(th).text().trim().toLowerCase();
        if (/position|stance/.test(t)) posCol = idx;
        else if (/witness|name/.test(t)) nameCol = idx;
        else if (/organ|represent|behalf|group/.test(t)) orgCol = idx;
        else if (/bill/.test(t)) billCol = idx;
      });
    }

    rows.each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length < 2) return;
      const texts = cells.map((_, td) => $(td).text().trim()).get();
      const posIdx = posCol >= 0 ? posCol : texts.findIndex(t => WITNESS_POSITION_RE.test(t));
      if (posIdx < 0 || posIdx >= texts.length) return;
      const rawPosition = texts[posIdx].toUpperCase();
      const position = ["FOR", "AGAINST", "ON"].includes(rawPosition) ? rawPosition : null;
      const rest = texts.filter((_, i) => i !== posIdx);
      let fullName: string | null = null;
      let organization: string | null = null;
      let billNumber: string | null = null;
      if (nameCol >= 0 && orgCol >= 0) {
        fullName = texts[nameCol] || null;
        organization = texts[orgCol] || null;
        billNumber = billCol >= 0 ? texts[billCol] || null : null;
      } else {
        for (const t of rest) {
          const bm = t.match(WITNESS_BILL_RE);
          if (bm && !billNumber) { billNumber = bm[1].replace(/\s+/g, "").toUpperCase(); continue; }
          if (!fullName && t.length >= 2) { fullName = t; continue; }
          if (!organization && t.length >= 2) { organization = t; }
        }
      }
      if (!fullName || fullName.length < 2) return;
      if (billNumber) billNumber = billNumber.replace(/\s+/g, "").toUpperCase();
      results.push({ fullName, organization: organization || null, position, billNumber: billNumber || null });
    });
  });

  if (results.length > 0) return results;

  const fullText = $("body").text();
  const sectionMatch = fullText.match(/WITNESS(?:ES)?(?:\s+LIST)?\s*[:\n]([\s\S]{1,4000})/i);
  if (!sectionMatch) return results;
  const lines = sectionMatch[1].split(/[\n\r]+/).map((l: string) => l.trim()).filter(Boolean);
  let currentPosition: string | null = null;
  for (const line of lines) {
    const posMatch = line.match(/^(FOR|AGAINST|ON(?:\s+THE\s+BILL)?)[:\s]*$/i);
    if (posMatch) {
      const raw = posMatch[1].replace(/\s+THE\s+BILL$/i, "").toUpperCase();
      currentPosition = ["FOR", "AGAINST", "ON"].includes(raw) ? raw : null;
      continue;
    }
    if (line.length < 3 || line.length > 200) continue;
    const parts = line.split(/,\s*|-\s+/);
    const fullName = parts[0]?.trim() || null;
    if (!fullName) continue;
    const organization = parts[1]?.trim() || null;
    const billMatch = line.match(WITNESS_BILL_RE);
    results.push({
      fullName,
      organization: organization || null,
      position: currentPosition,
      billNumber: billMatch ? billMatch[1].replace(/\s+/g, "").toUpperCase() : null,
    });
  }
  return results;
}

function parseWitnessesFromHtmlStr(html: string): ParsedWitness[] {
  return parseWitnessesFromHtml(cheerio.load(html));
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

function testWitnessParsingTable(): void {
  console.log("\n[test] parseWitnessesFromHtml() — table format");

  // Header-driven layout: Position | Witness | Organization | Bill
  const html1 = `<table>
    <tr><th>Position</th><th>Witness</th><th>Organization</th><th>Bill</th></tr>
    <tr><td>FOR</td><td>Jane Smith</td><td>Texas Chamber</td><td>HB 100</td></tr>
    <tr><td>AGAINST</td><td>Bob Jones</td><td>Coalition Group</td><td>HB 100</td></tr>
    <tr><td>ON</td><td>Alice Brown</td><td>Self</td><td>SB 5</td></tr>
  </table>`;
  const w1 = parseWitnessesFromHtmlStr(html1);
  assertEqual(w1.length, 3, "table: extracts 3 witnesses");
  assertEqual(w1[0].fullName, "Jane Smith", "table: first witness name");
  assertEqual(w1[0].position, "FOR", "table: FOR position");
  assertEqual(w1[0].organization, "Texas Chamber", "table: organization");
  assertEqual(w1[0].billNumber, "HB100", "table: bill number normalized");
  assertEqual(w1[1].position, "AGAINST", "table: AGAINST position");
  assertEqual(w1[2].position, "ON", "table: ON position");
  assertEqual(w1[2].billNumber, "SB5", "table: SB5 normalized");

  // Heuristic layout (no header row): name | org | position
  const html2 = `<table>
    <tr><td>Maria Lopez</td><td>Policy Foundation</td><td>FOR</td></tr>
    <tr><td>Carlos Ruiz</td><td>Public Interest Org</td><td>AGAINST</td></tr>
  </table>`;
  const w2 = parseWitnessesFromHtmlStr(html2);
  assertEqual(w2.length, 2, "heuristic table: extracts 2 witnesses");
  assertEqual(w2[0].fullName, "Maria Lopez", "heuristic: first witness name");
  assertEqual(w2[0].position, "FOR", "heuristic: FOR position");

  // Table without position cells is ignored
  const htmlNoPos = `<table>
    <tr><td>John Doe</td><td>Some Org</td></tr>
    <tr><td>Jane Doe</td><td>Another Org</td></tr>
  </table>`;
  const wNoPos = parseWitnessesFromHtmlStr(htmlNoPos);
  assertEqual(wNoPos.length, 0, "non-witness table is ignored");
}

function testWitnessParsingText(): void {
  console.log("\n[test] parseWitnessesFromHtml() — text fallback");

  const html = `<body>
    <p>WITNESSES</p>
    <p>FOR:</p>
    <p>Jane Smith, Texas Chamber of Commerce</p>
    <p>Bob Jones, Policy Alliance</p>
    <p>AGAINST:</p>
    <p>Alice Brown, Concerned Citizens</p>
    <p>ON:</p>
    <p>Dave White, Self</p>
  </body>`;
  const w = parseWitnessesFromHtmlStr(html);
  assert(w.length >= 4, `text fallback: extracts at least 4 witnesses (got ${w.length})`);
  const jane = w.find(x => x.fullName === "Jane Smith");
  assert(jane !== undefined, "text fallback: finds Jane Smith");
  assertEqual(jane?.position ?? null, "FOR", "text fallback: FOR position");
  assertEqual(jane?.organization ?? null, "Texas Chamber of Commerce", "text fallback: organization");

  const alice = w.find(x => x.fullName === "Alice Brown");
  assertEqual(alice?.position ?? null, "AGAINST", "text fallback: AGAINST position");

  // Page with no witness section returns empty
  const wEmpty = parseWitnessesFromHtmlStr("<body><p>No witnesses here.</p></body>");
  assertEqual(wEmpty.length, 0, "no witness section → empty array");
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
testWitnessParsingTable();
testWitnessParsingText();

console.log("\n======================================");
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("======================================");

if (failed > 0) process.exit(1);

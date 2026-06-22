/**
 * Integration test runner.
 *
 * Usage:
 *   TEST_DATABASE_URL=postgres://user@127.0.0.1:5432/txnav_test \
 *     npx tsx server/__tests__/integration/run.ts [suiteFilter]
 *
 * The runner points DATABASE_URL at TEST_DATABASE_URL before importing any
 * server code, so the suites run against a disposable database. Every table
 * in the test DB is truncated repeatedly — never point this at real data.
 *
 * Suites (filter by substring, e.g. `... run.ts timeouts`):
 *   transactions  — P0 transaction-atomicity / race-condition fixes
 *   timezone      — Chicago date keys, DST boundaries, prayer streaks
 *   adminAuth     — admin token fail-closed matrix + secureCompare audit
 *   validation    — AI/officials/prayer input validation + XSS round-trips
 *   timeouts      — photo-proxy / Groq / web-search timeout behavior (slow!)
 */

const testDbUrl = process.env.TEST_DATABASE_URL;
if (!testDbUrl) {
  console.error(
    "TEST_DATABASE_URL is not set.\n" +
      "Integration tests need a disposable Postgres database, e.g.:\n" +
      "  createdb txnav_test && DATABASE_URL=... npx drizzle-kit push\n" +
      "  TEST_DATABASE_URL=postgres://user@127.0.0.1:5432/txnav_test npm run test:integration",
  );
  process.exit(1);
}
if (
  !/127\.0\.0\.1|localhost/.test(testDbUrl) &&
  process.env.ALLOW_REMOTE_TEST_DB !== "1"
) {
  console.error(
    "TEST_DATABASE_URL does not look like a local database. " +
      "These tests TRUNCATE every table. Set ALLOW_REMOTE_TEST_DB=1 to override.",
  );
  process.exit(1);
}

process.env.DATABASE_URL = testDbUrl;
process.env.USER_TOKEN_SECRET ??= "integration-test-secret-0123456789abcdef";
// Suites assert the unconfigured-AI failure paths; a real key would change them.
delete process.env.GROQ_API_KEY;
delete process.env.GOOGLE_SEARCH_API_KEY;
delete process.env.GOOGLE_SEARCH_CX;
delete process.env.ADMIN_REFRESH_TOKEN;
process.env.NODE_ENV ??= "test";

let unhandledRejections = 0;
process.on("unhandledRejection", (reason) => {
  unhandledRejections++;
  console.error("  ✗ UNHANDLED REJECTION:", reason);
});

const SUITES = [
  { name: "transactions", path: "./transactions.test" },
  { name: "timezone", path: "./timezone.test" },
  { name: "adminAuth", path: "./adminAuth.test" },
  { name: "validation", path: "./validation.test" },
  { name: "timeouts", path: "./timeouts.test" },
  { name: "mapRoutes", path: "./mapRoutes.test" },
];

async function main() {
  const filter = process.argv[2];
  const selected = filter
    ? SUITES.filter((s) => s.name.includes(filter))
    : SUITES;
  if (selected.length === 0) {
    console.error(`No suites match filter "${filter}"`);
    process.exit(1);
  }

  console.log("==========================================");
  console.log("TXDistrictNavigator — Integration Tests");
  console.log(`Suites: ${selected.map((s) => s.name).join(", ")}`);
  console.log("==========================================");

  const started = Date.now();

  for (const suite of selected) {
    const mod = await import(suite.path);
    await mod.run();
  }

  const helpers = await import("./helpers");
  const { passed, failed, failures } = helpers.getResults();

  // Give fire-and-forget promises a moment to surface unhandled rejections.
  await helpers.sleep(500);

  console.log("\n==========================================");
  console.log(
    `Results: ${passed} passed, ${failed} failed ` +
      `(${((Date.now() - started) / 1000).toFixed(1)}s, ` +
      `${unhandledRejections} unhandled rejections)`,
  );
  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  ✗ ${f}`);
  }
  console.log("==========================================");

  await helpers.pool.end();
  process.exit(failed > 0 || unhandledRejections > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Runner crashed:", err);
  process.exit(1);
});

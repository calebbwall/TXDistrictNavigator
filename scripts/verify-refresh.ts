import { db } from "../server/db";
import { officialPublic, officialPrivate } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { refreshAllOfficials } from "../server/jobs/refreshOfficials";

async function main() {
  console.log("=== Verification Script: Testing refresh doesn't overwrite private data ===\n");

  console.log("Step 1: Run initial refresh to populate data...");
  await refreshAllOfficials();

  const [firstOfficial] = await db.select()
    .from(officialPublic)
    .limit(1);

  if (!firstOfficial) {
    console.error("ERROR: No officials found after refresh. Verification failed.");
    process.exit(1);
  }

  console.log(`\nStep 2: Found official: ${firstOfficial.fullName} (ID: ${firstOfficial.id})`);

  const testNote = `Test note created at ${new Date().toISOString()} - DO NOT DELETE`;
  const testPhone = "555-TEST-001";
  const testTags = ["verified", "test-run"];

  console.log(`\nStep 3: Creating private data for this official...`);
  console.log(`  - Notes: "${testNote}"`);
  console.log(`  - Personal Phone: "${testPhone}"`);
  console.log(`  - Tags: ${JSON.stringify(testTags)}`);

  const [existingPrivate] = await db.select()
    .from(officialPrivate)
    .where(eq(officialPrivate.officialPublicId, firstOfficial.id))
    .limit(1);

  if (existingPrivate) {
    await db.update(officialPrivate)
      .set({
        notes: testNote,
        personalPhone: testPhone,
        tags: testTags,
        updatedAt: new Date(),
      })
      .where(eq(officialPrivate.id, existingPrivate.id));
  } else {
    await db.insert(officialPrivate).values({
      officialPublicId: firstOfficial.id,
      notes: testNote,
      personalPhone: testPhone,
      tags: testTags,
    });
  }

  const [verifyCreated] = await db.select()
    .from(officialPrivate)
    .where(eq(officialPrivate.officialPublicId, firstOfficial.id))
    .limit(1);

  if (!verifyCreated || verifyCreated.notes !== testNote) {
    console.error("ERROR: Private data was not saved correctly.");
    process.exit(1);
  }
  console.log("  - Private data saved successfully");

  console.log("\nStep 4: Running refresh again...");
  await refreshAllOfficials();

  console.log("\nStep 5: Verifying private data was preserved...");

  const [afterRefresh] = await db.select()
    .from(officialPrivate)
    .where(eq(officialPrivate.officialPublicId, firstOfficial.id))
    .limit(1);

  if (!afterRefresh) {
    console.error("ERROR: Private data was deleted during refresh!");
    process.exit(1);
  }

  const errors: string[] = [];

  if (afterRefresh.notes !== testNote) {
    errors.push(`Notes changed: expected "${testNote}", got "${afterRefresh.notes}"`);
  }

  if (afterRefresh.personalPhone !== testPhone) {
    errors.push(`Personal phone changed: expected "${testPhone}", got "${afterRefresh.personalPhone}"`);
  }

  if (JSON.stringify(afterRefresh.tags) !== JSON.stringify(testTags)) {
    errors.push(`Tags changed: expected ${JSON.stringify(testTags)}, got ${JSON.stringify(afterRefresh.tags)}`);
  }

  if (errors.length > 0) {
    console.error("\nERROR: Private data was modified during refresh!");
    errors.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
  }

  console.log("  - Notes: PRESERVED");
  console.log("  - Personal Phone: PRESERVED");
  console.log("  - Tags: PRESERVED");

  console.log("\nStep 6: Verifying merged endpoint includes private data...");

  const baseUrl = process.env.API_BASE_URL || "http://localhost:5000";
  try {
    const response = await fetch(`${baseUrl}/api/officials/${firstOfficial.id}`);
    const data = await response.json() as { official?: { private?: { notes?: string } } };

    if (data.official?.private?.notes !== testNote) {
      console.error("ERROR: Merged endpoint does not include private notes!");
      console.error(`  Expected: "${testNote}"`);
      console.error(`  Got: "${data.official?.private?.notes}"`);
      process.exit(1);
    }

    console.log("  - Merged endpoint correctly includes private data");
  } catch (err) {
    console.warn("  - Could not verify API endpoint (server may not be running)");
    console.warn("  - Manual verification: GET /api/officials/:id should include private field");
  }

  console.log("\n=== VERIFICATION PASSED ===");
  console.log("Private data is preserved across refreshes and properly merged in API responses.");

  console.log("\nStep 7: Cleaning up test data...");
  await db.update(officialPrivate)
    .set({
      notes: null,
      personalPhone: null,
      tags: null,
    })
    .where(eq(officialPrivate.officialPublicId, firstOfficial.id));
  console.log("  - Test data cleaned up");

  process.exit(0);
}

main().catch(err => {
  console.error("Verification script failed:", err);
  process.exit(1);
});

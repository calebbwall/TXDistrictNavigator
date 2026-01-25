import { db } from '../db';
import { persons, officialPublic, personLinks } from '../../shared/schema';
import { eq, and, isNull, isNotNull, sql } from 'drizzle-orm';
import { createHash } from 'crypto';

/**
 * Check if an official has an explicit person link override.
 * Returns the personId if a link exists, null otherwise.
 */
export async function getExplicitPersonLink(officialPublicId: string): Promise<string | null> {
  const link = await db
    .select({ personId: personLinks.personId })
    .from(personLinks)
    .where(eq(personLinks.officialPublicId, officialPublicId))
    .limit(1);
  
  return link.length > 0 ? link[0].personId : null;
}

/**
 * Create or update an explicit person link.
 * This admin override takes precedence over name-based matching.
 */
export async function setExplicitPersonLink(
  officialPublicId: string,
  personId: string
): Promise<{ officialPublicId: string; personId: string }> {
  const now = new Date();
  
  await db
    .insert(personLinks)
    .values({
      officialPublicId,
      personId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: personLinks.officialPublicId,
      set: {
        personId,
        updatedAt: now,
      },
    });
  
  await db
    .update(officialPublic)
    .set({ personId })
    .where(eq(officialPublic.id, officialPublicId));
  
  console.log(`[Identity] Set explicit person link: official ${officialPublicId} -> person ${personId}`);
  
  return { officialPublicId, personId };
}

/**
 * Get all explicit person links (for admin visibility).
 */
export async function getAllExplicitPersonLinks(): Promise<Array<{ officialPublicId: string; personId: string }>> {
  return await db
    .select({
      officialPublicId: personLinks.officialPublicId,
      personId: personLinks.personId,
    })
    .from(personLinks);
}

/**
 * Normalize a name for matching purposes.
 * - Lowercase
 * - Remove titles (Dr., Hon., etc.)
 * - Remove suffixes (Jr., Sr., III, etc.)
 * - Collapse whitespace
 * - Remove punctuation
 */
export function normalizeName(name: string): string {
  if (!name) return '';
  
  let normalized = name.toLowerCase().trim();
  
  // Remove common titles
  const titles = ['dr.', 'dr', 'hon.', 'hon', 'mr.', 'mr', 'mrs.', 'mrs', 'ms.', 'ms', 'rep.', 'rep', 'sen.', 'sen'];
  for (const title of titles) {
    if (normalized.startsWith(title + ' ')) {
      normalized = normalized.substring(title.length + 1);
    }
  }
  
  // Remove common suffixes
  const suffixes = [' jr.', ' jr', ' sr.', ' sr', ' iii', ' ii', ' iv', ' md', ' ph.d.', ' phd', ' esq.', ' esq'];
  for (const suffix of suffixes) {
    if (normalized.endsWith(suffix)) {
      normalized = normalized.substring(0, normalized.length - suffix.length);
    }
  }
  
  // Remove punctuation and collapse whitespace
  normalized = normalized.replace(/[.,\-'"()]/g, ' ').replace(/\s+/g, ' ').trim();
  
  return normalized;
}

/**
 * Generate a fingerprint for a person based on canonical name.
 * Used for deduplication and matching.
 */
export function generatePersonFingerprint(canonicalName: string): string {
  return createHash('sha256').update(canonicalName).digest('hex').substring(0, 16);
}

/**
 * Resolve or create a person record for an official.
 * Returns the personId for linking to officialPublic.
 * 
 * Strategy:
 * 1. FIRST check explicit person_links (admin override)
 * 2. Then look for existing person by canonical name match
 * 3. If found, return existing personId
 * 4. If not found, create new person record
 */
export async function resolvePersonId(
  fullName: string,
  displayName?: string,
  officialPublicId?: string
): Promise<string> {
  // FIRST: Check for explicit person link override (admin-set)
  if (officialPublicId) {
    const explicitLink = await getExplicitPersonLink(officialPublicId);
    if (explicitLink) {
      console.log(`[Identity] Using explicit link for official ${officialPublicId} -> person ${explicitLink}`);
      return explicitLink;
    }
  }
  
  // FALLBACK: Name-based matching
  const canonicalName = normalizeName(fullName);
  const display = displayName || fullName;
  
  // Try to find existing person by canonical name
  const existing = await db
    .select()
    .from(persons)
    .where(eq(persons.fullNameCanonical, canonicalName))
    .limit(1);
  
  if (existing.length > 0) {
    return existing[0].id;
  }
  
  // Create new person record
  const [newPerson] = await db
    .insert(persons)
    .values({
      fullNameCanonical: canonicalName,
      fullNameDisplay: display,
    })
    .returning({ id: persons.id });
  
  console.log(`[Identity] Created new person: ${display} (canonical: ${canonicalName})`);
  return newPerson.id;
}

/**
 * Batch resolve person IDs for multiple officials.
 * More efficient than individual lookups.
 */
export async function batchResolvePersonIds(
  officials: Array<{ fullName: string; displayName?: string }>
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const canonicalNames = officials.map(o => normalizeName(o.fullName));
  
  // Get all existing persons
  const existingPersons = await db
    .select()
    .from(persons);
  
  const existingByCanonical = new Map(
    existingPersons.map(p => [p.fullNameCanonical, p.id])
  );
  
  // Process each official
  const toCreate: Array<{ fullNameCanonical: string; fullNameDisplay: string }> = [];
  
  for (let i = 0; i < officials.length; i++) {
    const canonical = canonicalNames[i];
    const display = officials[i].displayName || officials[i].fullName;
    
    if (existingByCanonical.has(canonical)) {
      results.set(officials[i].fullName, existingByCanonical.get(canonical)!);
    } else {
      // Check if we're already planning to create this person
      const existing = toCreate.find(p => p.fullNameCanonical === canonical);
      if (!existing) {
        toCreate.push({
          fullNameCanonical: canonical,
          fullNameDisplay: display,
        });
      }
    }
  }
  
  // Batch create new persons
  if (toCreate.length > 0) {
    const created = await db
      .insert(persons)
      .values(toCreate)
      .returning({ id: persons.id, fullNameCanonical: persons.fullNameCanonical });
    
    console.log(`[Identity] Created ${created.length} new person records`);
    
    for (const person of created) {
      // Find original officials that match this canonical name
      for (let i = 0; i < officials.length; i++) {
        if (canonicalNames[i] === person.fullNameCanonical) {
          results.set(officials[i].fullName, person.id);
        }
      }
    }
  }
  
  return results;
}

/**
 * Link an official record to their person record.
 * Called during refresh to update the personId.
 */
export async function linkOfficialToPerson(
  officialId: string,
  personId: string
): Promise<void> {
  await db
    .update(officialPublic)
    .set({ personId })
    .where(eq(officialPublic.id, officialId));
}

/**
 * Get all officials linked to a person across positions.
 * Used for displaying official history.
 */
export async function getOfficialsByPersonId(
  personId: string
): Promise<typeof officialPublic.$inferSelect[]> {
  return await db
    .select()
    .from(officialPublic)
    .where(eq(officialPublic.personId, personId));
}

/**
 * Get identity statistics for admin dashboard.
 */
export async function getIdentityStats(): Promise<{
  totalPersons: number;
  activeOfficials: number;
  archivedPersons: number;
  explicitLinks: number;
}> {
  const [totalPersonsResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(persons);
  
  const [activeOfficialsResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(officialPublic)
    .where(eq(officialPublic.active, true));
  
  const [explicitLinksResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(personLinks);
  
  const archivedPersonsResult = await db.execute(sql`
    SELECT COUNT(*)::int as count FROM persons p
    WHERE NOT EXISTS (
      SELECT 1 FROM official_public op
      WHERE op.person_id = p.id AND op.active = true
    )
  `);
  
  return {
    totalPersons: totalPersonsResult.count,
    activeOfficials: activeOfficialsResult.count,
    archivedPersons: Number((archivedPersonsResult.rows[0] as any)?.count || 0),
    explicitLinks: explicitLinksResult.count,
  };
}

/**
 * Get all archived persons (persons with no active official records).
 */
export async function getArchivedPersons(): Promise<Array<{ id: string; fullNameDisplay: string }>> {
  const result = await db.execute(sql`
    SELECT p.id, p.full_name_display as "fullNameDisplay"
    FROM persons p
    WHERE NOT EXISTS (
      SELECT 1 FROM official_public op
      WHERE op.person_id = p.id AND op.active = true
    )
    ORDER BY p.full_name_display
  `);
  
  return result.rows as Array<{ id: string; fullNameDisplay: string }>;
}

/**
 * Resolve personIds for all active officials that don't have one.
 * Used during refresh cycle to ensure all officials are linked.
 */
export async function resolveAllMissingPersonIds(): Promise<{ resolved: number; created: number }> {
  console.log('[Identity] Resolving missing personIds for active officials...');
  
  const officialsWithoutPerson = await db
    .select()
    .from(officialPublic)
    .where(and(
      eq(officialPublic.active, true),
      isNull(officialPublic.personId)
    ));
  
  if (officialsWithoutPerson.length === 0) {
    console.log('[Identity] All active officials have personIds');
    return { resolved: 0, created: 0 };
  }
  
  console.log(`[Identity] Found ${officialsWithoutPerson.length} officials without personId`);
  
  let resolved = 0;
  let created = 0;
  
  for (const official of officialsWithoutPerson) {
    const personId = await resolvePersonId(
      official.fullName,
      official.fullName,
      official.id
    );
    
    await db
      .update(officialPublic)
      .set({ personId })
      .where(eq(officialPublic.id, official.id));
    
    resolved++;
    const isNew = await db
      .select()
      .from(persons)
      .where(eq(persons.id, personId));
    if (isNew.length > 0) {
      created++;
    }
  }
  
  console.log(`[Identity] Resolved ${resolved} personIds, created ${created} new person records`);
  return { resolved, created };
}

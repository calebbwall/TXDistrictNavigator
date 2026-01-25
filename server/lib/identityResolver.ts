import { db } from '../db';
import { persons, officialPublic } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { createHash } from 'crypto';

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
 * 1. Look for existing person by canonical name match
 * 2. If found, return existing personId
 * 3. If not found, create new person record
 */
export async function resolvePersonId(
  fullName: string,
  displayName?: string
): Promise<string> {
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

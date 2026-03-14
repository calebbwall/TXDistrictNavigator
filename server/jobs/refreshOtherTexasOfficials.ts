/**
 * Refresh job for Other Texas Officials (statewide offices + courts).
 * 
 * This job:
 * 1. Fetches officials from authoritative web sources
 * 2. Compares fingerprint to detect changes
 * 3. Resolves/creates person records for identity continuity
 * 4. Upserts official records with personId linking
 * 5. Deactivates officials no longer in the data
 * 
 * Sources:
 * - Texas Secretary of State Elected Officials table
 * - Texas Supreme Court official roster
 * - Texas Court of Criminal Appeals official roster
 */

import { db } from '../db';
import { officialPublic, refreshState } from '../../shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { 
  fetchAllOtherTexasOfficials, 
  getAllStaticOfficials,
  generateOtherTxSourceMemberId,
  type OtherTexasOfficialData 
} from '../data/otherTexasOfficials';
import { resolvePersonId } from '../lib/identityResolver';

// Use the enum value for refresh_state.source
const SOURCE_VALUE = 'OTHER_TX' as const;

export interface OtherTxRefreshResult {
  success: boolean;
  fingerprint: string;
  changed: boolean;
  upsertedCount: number;
  deactivatedCount: number;
  totalOfficials: number;
  breakdown: {
    executive: number;
    secretaryOfState: number;
    supremeCourt: number;
    criminalAppeals: number;
    usSenate: number;
  };
  sources: {
    executive: { success: boolean; error?: string };
    supremeCourt: { success: boolean; error?: string };
    criminalAppeals: { success: boolean; error?: string };
  };
  error?: string;
}

/**
 * Get stored fingerprint from refresh_state.
 */
async function getStoredFingerprint(): Promise<string | null> {
  const result = await db
    .select()
    .from(refreshState)
    .where(eq(refreshState.source, SOURCE_VALUE))
    .limit(1);
  
  return result[0]?.fingerprint || null;
}

/**
 * Update stored fingerprint in refresh_state.
 */
async function updateStoredFingerprint(fingerprint: string, changed: boolean): Promise<void> {
  const now = new Date();
  
  const existing = await db
    .select()
    .from(refreshState)
    .where(eq(refreshState.source, SOURCE_VALUE))
    .limit(1);
  
  if (existing.length > 0) {
    await db
      .update(refreshState)
      .set({
        fingerprint,
        lastCheckedAt: now,
        ...(changed ? { lastChangedAt: now } : {}),
      })
      .where(eq(refreshState.source, SOURCE_VALUE));
  } else {
    await db
      .insert(refreshState)
      .values({
        source: SOURCE_VALUE,
        fingerprint,
        lastCheckedAt: now,
        lastChangedAt: changed ? now : null,
      });
  }
}

/**
 * Refresh Other Texas Officials from authoritative web sources.
 */
export async function refreshOtherTexasOfficials(
  options: { force?: boolean } = {}
): Promise<OtherTxRefreshResult> {
  const startTime = Date.now();
  console.log('[RefreshOtherTX] Starting refresh...');
  
  const breakdown = {
    executive: 0,
    secretaryOfState: 0,
    supremeCourt: 0,
    criminalAppeals: 0,
    usSenate: 0,
  };
  
  try {
    // Fetch officials from web sources
    const scrapedData = await fetchAllOtherTexasOfficials();
    const { officials, fingerprint, sources } = scrapedData;
    
    // Check fingerprint for changes
    const storedFingerprint = await getStoredFingerprint();
    const fingerprintChanged = storedFingerprint !== fingerprint;
    
    if (!fingerprintChanged && !options.force) {
      console.log('[RefreshOtherTX] No changes detected (fingerprint match)');
      await updateStoredFingerprint(fingerprint, false);
      
      // Count existing officials for breakdown
      const existing = await db
        .select()
        .from(officialPublic)
        .where(and(eq(officialPublic.source, 'OTHER_TX'), eq(officialPublic.active, true)));
      
      for (const o of existing) {
        if (o.roleTitle?.includes('Supreme Court')) breakdown.supremeCourt++;
        else if (o.roleTitle?.includes('Criminal Appeals')) breakdown.criminalAppeals++;
        else if (o.roleTitle?.includes('Secretary of State')) breakdown.secretaryOfState++;
        else if (o.roleTitle?.includes('United States Senator')) breakdown.usSenate++;
        else breakdown.executive++;
      }
      
      return {
        success: true,
        fingerprint,
        changed: false,
        upsertedCount: 0,
        deactivatedCount: 0,
        totalOfficials: existing.length,
        breakdown,
        sources,
      };
    }
    
    console.log(`[RefreshOtherTX] Changes detected, processing ${officials.length} officials...`);
    
    // Get existing OTHER_TX officials
    const existingOfficials = await db
      .select()
      .from(officialPublic)
      .where(eq(officialPublic.source, 'OTHER_TX'));
    
    const existingBySourceId = new Map(
      existingOfficials.map(o => [o.sourceMemberId, o])
    );
    
    // Track which source member IDs we're processing
    const processedSourceIds = new Set<string>();
    let upsertedCount = 0;
    
    // Process each official
    for (const official of officials) {
      const sourceMemberId = generateOtherTxSourceMemberId(
        official.roleTitle,
        official.fullName,
        official.category
      );
      processedSourceIds.add(sourceMemberId);
      
      // Update breakdown counts
      switch (official.category) {
        case 'SUPREME_COURT': breakdown.supremeCourt++; break;
        case 'CRIMINAL_APPEALS': breakdown.criminalAppeals++; break;
        case 'SECRETARY_OF_STATE': breakdown.secretaryOfState++; break;
        case 'EXECUTIVE': breakdown.executive++; break;
        case 'US_SENATE': breakdown.usSenate++; break;
      }
      
      // Resolve person identity
      const personId = await resolvePersonId(official.fullName);
      
      const existing = existingBySourceId.get(sourceMemberId);
      
      if (existing) {
        // Update existing record
        await db
          .update(officialPublic)
          .set({
            personId,
            fullName: official.fullName,
            roleTitle: official.roleTitle,
            party: official.party,
            photoUrl: official.photoUrl,
            capitolAddress: official.capitolAddress,
            capitolPhone: official.capitolPhone,
            website: official.website,
            email: official.email,
            active: true,
            lastRefreshedAt: new Date(),
          })
          .where(eq(officialPublic.id, existing.id));
      } else {
        // Insert new record
        await db
          .insert(officialPublic)
          .values({
            personId,
            source: 'OTHER_TX',
            sourceMemberId,
            chamber: 'STATEWIDE',
            district: 'STATEWIDE',
            fullName: official.fullName,
            roleTitle: official.roleTitle,
            party: official.party,
            photoUrl: official.photoUrl,
            capitolAddress: official.capitolAddress,
            capitolPhone: official.capitolPhone,
            website: official.website,
            email: official.email,
            active: true,
            lastRefreshedAt: new Date(),
          });
      }
      
      upsertedCount++;
    }
    
    // Deactivate officials no longer in source data
    let deactivatedCount = 0;
    for (const [sourceMemberId, existing] of existingBySourceId) {
      if (!processedSourceIds.has(sourceMemberId) && existing.active) {
        await db
          .update(officialPublic)
          .set({ active: false })
          .where(eq(officialPublic.id, existing.id));
        deactivatedCount++;
        console.log(`[RefreshOtherTX] Deactivated: ${existing.fullName} (${existing.roleTitle})`);
      }
    }
    
    // Update stored fingerprint
    await updateStoredFingerprint(fingerprint, true);
    
    const duration = Date.now() - startTime;
    console.log(
      `[RefreshOtherTX] Complete: ${upsertedCount} upserted, ${deactivatedCount} deactivated (${duration}ms)`
    );
    console.log(
      `[RefreshOtherTX] Breakdown: ${breakdown.executive} executive, ${breakdown.secretaryOfState} SoS, ` +
      `${breakdown.supremeCourt} Supreme Court, ${breakdown.criminalAppeals} Criminal Appeals`
    );
    
    return {
      success: true,
      fingerprint,
      changed: true,
      upsertedCount,
      deactivatedCount,
      totalOfficials: officials.length,
      breakdown,
      sources,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[RefreshOtherTX] Error:', message);
    return {
      success: false,
      fingerprint: '',
      changed: false,
      upsertedCount: 0,
      deactivatedCount: 0,
      totalOfficials: 0,
      breakdown,
      sources: {
        executive: { success: false, error: message },
        supremeCourt: { success: false, error: message },
        criminalAppeals: { success: false, error: message },
      },
      error: message,
    };
  }
}

/**
 * Check if Other TX Officials exist in the DB.
 * Returns true (skip seeding) only when active officials are already present.
 */
export async function wasOtherTxCheckedThisWeek(): Promise<boolean> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(officialPublic)
    .where(and(eq(officialPublic.source, 'OTHER_TX'), eq(officialPublic.active, true)));
  return count > 0;
}

/**
 * Seed Other TX Officials on startup if none exist in the DB.
 */
export async function maybeRunOtherTxRefresh(): Promise<void> {
  const alreadySeeded = await wasOtherTxCheckedThisWeek();
  if (alreadySeeded) {
    console.log('[RefreshOtherTX] Officials already in DB, skipping startup seed');
    return;
  }
  console.log('[RefreshOtherTX] No OTHER_TX officials found — running startup seed');
  await refreshOtherTexasOfficials({ force: true });
}

/**
 * Get the current refresh state for Other TX Officials.
 */
export async function getOtherTxRefreshState(): Promise<{
  lastCheckedAt: Date | null;
  lastChangedAt: Date | null;
  fingerprint: string | null;
}> {
  const result = await db
    .select()
    .from(refreshState)
    .where(eq(refreshState.source, SOURCE_VALUE))
    .limit(1);
  
  if (!result[0]) {
    return {
      lastCheckedAt: null,
      lastChangedAt: null,
      fingerprint: null,
    };
  }
  
  return {
    lastCheckedAt: result[0].lastCheckedAt,
    lastChangedAt: result[0].lastChangedAt,
    fingerprint: result[0].fingerprint,
  };
}

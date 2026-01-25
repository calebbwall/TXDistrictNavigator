/**
 * Refresh job for Other Texas Officials (statewide offices).
 * 
 * Unlike TX_HOUSE/TX_SENATE/US_HOUSE, these officials are loaded from
 * a static data file since there's no consistent API source.
 * 
 * This job:
 * 1. Loads officials from the static data file
 * 2. Resolves/creates person records for identity continuity
 * 3. Upserts official records with personId linking
 * 4. Deactivates officials no longer in the static data
 */

import { db } from '../db';
import { officialPublic, persons } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { OTHER_TEXAS_OFFICIALS, generateOtherTxSourceMemberId } from '../data/otherTexasOfficials';
import { resolvePersonId } from '../lib/identityResolver';
import { createHash } from 'crypto';

export interface OtherTxRefreshResult {
  success: boolean;
  fingerprint: string;
  changed: boolean;
  upsertedCount: number;
  deactivatedCount: number;
  error?: string;
}

/**
 * Generate fingerprint for the static data to detect changes.
 */
function generateDataFingerprint(): string {
  const content = JSON.stringify(OTHER_TEXAS_OFFICIALS);
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Refresh Other Texas Officials from static data.
 */
export async function refreshOtherTexasOfficials(
  options: { force?: boolean } = {}
): Promise<OtherTxRefreshResult> {
  const startTime = Date.now();
  console.log('[RefreshOtherTX] Starting refresh...');
  
  try {
    const fingerprint = generateDataFingerprint();
    
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
    
    // Process each official from static data
    for (const official of OTHER_TEXAS_OFFICIALS) {
      const sourceMemberId = generateOtherTxSourceMemberId(
        official.roleTitle,
        official.fullName
      );
      processedSourceIds.add(sourceMemberId);
      
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
    
    // Deactivate officials no longer in static data
    let deactivatedCount = 0;
    for (const [sourceMemberId, existing] of existingBySourceId) {
      if (!processedSourceIds.has(sourceMemberId) && existing.active) {
        await db
          .update(officialPublic)
          .set({ active: false })
          .where(eq(officialPublic.id, existing.id));
        deactivatedCount++;
        console.log(`[RefreshOtherTX] Deactivated: ${existing.fullName}`);
      }
    }
    
    const duration = Date.now() - startTime;
    console.log(
      `[RefreshOtherTX] Complete: ${upsertedCount} upserted, ${deactivatedCount} deactivated (${duration}ms)`
    );
    
    return {
      success: true,
      fingerprint,
      changed: upsertedCount > 0 || deactivatedCount > 0,
      upsertedCount,
      deactivatedCount,
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
      error: message,
    };
  }
}

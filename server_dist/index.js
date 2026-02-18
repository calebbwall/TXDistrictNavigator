var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  DISTRICT_RANGES: () => DISTRICT_RANGES,
  OTHER_TX_ROLES: () => OTHER_TX_ROLES,
  appSettings: () => appSettings,
  chamberEnum: () => chamberEnum,
  committeeMemberships: () => committeeMemberships,
  committeeRefreshState: () => committeeRefreshState,
  committees: () => committees,
  dailyPrayerPicks: () => dailyPrayerPicks,
  insertOfficialPrivateSchema: () => insertOfficialPrivateSchema,
  insertOfficialPublicSchema: () => insertOfficialPublicSchema,
  insertPrayerSchema: () => insertPrayerSchema,
  insertUserSchema: () => insertUserSchema,
  officialPrivate: () => officialPrivate,
  officialPublic: () => officialPublic,
  personLinks: () => personLinks,
  persons: () => persons,
  prayerCategories: () => prayerCategories,
  prayerStatusEnum: () => prayerStatusEnum,
  prayerStreak: () => prayerStreak,
  prayers: () => prayers,
  refreshJobLog: () => refreshJobLog,
  refreshState: () => refreshState,
  sourceEnum: () => sourceEnum,
  updateOfficialPrivateSchema: () => updateOfficialPrivateSchema,
  updatePrayerSchema: () => updatePrayerSchema,
  users: () => users
});
import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, timestamp, json, pgEnum, uniqueIndex, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
var users, insertUserSchema, sourceEnum, persons, officialPublic, officialPrivate, refreshState, refreshJobLog, personLinks, DISTRICT_RANGES, chamberEnum, committees, committeeMemberships, committeeRefreshState, OTHER_TX_ROLES, insertOfficialPublicSchema, insertOfficialPrivateSchema, updateOfficialPrivateSchema, prayerStatusEnum, prayerCategories, prayers, dailyPrayerPicks, prayerStreak, appSettings, insertPrayerSchema, updatePrayerSchema;
var init_schema = __esm({
  "shared/schema.ts"() {
    "use strict";
    users = pgTable("users", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      username: text("username").notNull().unique(),
      password: text("password").notNull()
    });
    insertUserSchema = createInsertSchema(users).pick({
      username: true,
      password: true
    });
    sourceEnum = pgEnum("source_type", ["TX_HOUSE", "TX_SENATE", "US_HOUSE", "OTHER_TX"]);
    persons = pgTable("persons", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      fullNameCanonical: varchar("full_name_canonical", { length: 255 }).notNull(),
      // Normalized name for matching
      fullNameDisplay: varchar("full_name_display", { length: 255 }).notNull(),
      // Display name
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    officialPublic = pgTable("official_public", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      personId: varchar("person_id", { length: 255 }).references(() => persons.id),
      // Links to stable person identity
      source: sourceEnum("source").notNull(),
      sourceMemberId: varchar("source_member_id", { length: 255 }).notNull(),
      chamber: varchar("chamber", { length: 50 }).notNull(),
      district: varchar("district", { length: 20 }).notNull(),
      fullName: varchar("full_name", { length: 255 }).notNull(),
      roleTitle: varchar("role_title", { length: 255 }),
      // For OTHER_TX: Governor, Lt Governor, etc.
      party: varchar("party", { length: 10 }),
      photoUrl: text("photo_url"),
      capitolAddress: text("capitol_address"),
      capitolPhone: varchar("capitol_phone", { length: 50 }),
      // Capitol room/office number scraped from TLO (e.g., "E2.406")
      // Format: Building code + room number, parsed from "EXT E2.406" format
      // NOTE: If schema is regenerated, this field must be re-added here
      capitolRoom: varchar("capitol_room", { length: 50 }),
      districtAddresses: json("district_addresses").$type(),
      districtPhones: json("district_phones").$type(),
      website: text("website"),
      email: varchar("email", { length: 255 }),
      active: boolean("active").default(true).notNull(),
      lastRefreshedAt: timestamp("last_refreshed_at").defaultNow().notNull(),
      // Normalized search fields - derived from addresses for faster search
      searchZips: text("search_zips"),
      // Comma-separated unique ZIPs (e.g., "78711,75570")
      searchCities: text("search_cities")
      // Comma-separated unique cities (e.g., "Austin,New Boston")
    }, (table) => ({
      sourceIdUnique: uniqueIndex("source_member_unique_idx").on(table.source, table.sourceMemberId)
    }));
    officialPrivate = pgTable("official_private", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      personId: varchar("person_id", { length: 255 }).references(() => persons.id),
      // New: keyed by person for continuity
      officialPublicId: varchar("official_public_id", { length: 255 }).references(() => officialPublic.id),
      // Legacy: kept for backwards compatibility
      personalPhone: varchar("personal_phone", { length: 50 }),
      personalAddress: text("personal_address"),
      addressSource: varchar("address_source", { length: 20 }),
      spouseName: varchar("spouse_name", { length: 255 }),
      childrenNames: json("children_names").$type(),
      birthday: varchar("birthday", { length: 20 }),
      anniversary: varchar("anniversary", { length: 20 }),
      notes: text("notes"),
      tags: json("tags").$type(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    refreshState = pgTable("refresh_state", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      source: sourceEnum("source").notNull().unique(),
      fingerprint: text("fingerprint"),
      // Hash of upstream data to detect changes
      lastCheckedAt: timestamp("last_checked_at"),
      // Last time we checked upstream
      lastChangedAt: timestamp("last_changed_at"),
      // Last time data actually changed
      lastRefreshedAt: timestamp("last_refreshed_at"),
      // Last time we ran a refresh
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    refreshJobLog = pgTable("refresh_job_log", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      source: sourceEnum("source").notNull(),
      startedAt: timestamp("started_at").defaultNow().notNull(),
      completedAt: timestamp("completed_at"),
      status: varchar("status", { length: 20 }).notNull(),
      // 'running', 'success', 'failed', 'aborted'
      parsedCount: varchar("parsed_count", { length: 10 }),
      upsertedCount: varchar("upserted_count", { length: 10 }),
      skippedCount: varchar("skipped_count", { length: 10 }),
      deactivatedCount: varchar("deactivated_count", { length: 10 }),
      errorMessage: text("error_message"),
      durationMs: varchar("duration_ms", { length: 20 })
    });
    personLinks = pgTable("person_links", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      officialPublicId: varchar("official_public_id", { length: 255 }).notNull().unique().references(() => officialPublic.id, { onDelete: "cascade" }),
      personId: varchar("person_id", { length: 255 }).notNull().references(() => persons.id, { onDelete: "cascade" }),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    DISTRICT_RANGES = {
      TX_HOUSE: { min: 1, max: 150 },
      TX_SENATE: { min: 1, max: 31 },
      US_HOUSE: { min: 1, max: 38 }
    };
    chamberEnum = pgEnum("chamber_type", ["TX_HOUSE", "TX_SENATE"]);
    committees = pgTable("committees", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      chamber: chamberEnum("chamber").notNull(),
      name: varchar("name", { length: 255 }).notNull(),
      slug: varchar("slug", { length: 255 }).notNull(),
      sourceUrl: text("source_url"),
      parentCommitteeId: varchar("parent_committee_id", { length: 255 }),
      // For subcommittees
      sortOrder: varchar("sort_order", { length: 10 }),
      // For stable ordering
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => ({
      chamberSlugUnique: uniqueIndex("committee_chamber_slug_idx").on(table.chamber, table.slug)
    }));
    committeeMemberships = pgTable("committee_memberships", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      committeeId: varchar("committee_id", { length: 255 }).notNull().references(() => committees.id, { onDelete: "cascade" }),
      officialPublicId: varchar("official_public_id", { length: 255 }).references(() => officialPublic.id, { onDelete: "set null" }),
      // Fallback matching fields when official isn't directly linkable
      memberName: varchar("member_name", { length: 255 }).notNull(),
      roleTitle: varchar("role_title", { length: 100 }),
      sortOrder: varchar("sort_order", { length: 10 }),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    committeeRefreshState = pgTable("committee_refresh_state", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      source: varchar("source", { length: 50 }).notNull().unique(),
      // TX_HOUSE_COMMITTEES, TX_SENATE_COMMITTEES
      fingerprint: text("fingerprint"),
      lastCheckedAt: timestamp("last_checked_at"),
      lastChangedAt: timestamp("last_changed_at"),
      lastRefreshedAt: timestamp("last_refreshed_at"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    OTHER_TX_ROLES = [
      "Governor",
      "Lieutenant Governor",
      "Attorney General",
      "Comptroller of Public Accounts",
      "Commissioner of Agriculture",
      "Commissioner of the General Land Office",
      "Railroad Commissioner",
      "Chief Justice of the Texas Supreme Court",
      "Justice of the Texas Supreme Court",
      "Presiding Judge of the Texas Court of Criminal Appeals",
      "Judge of the Texas Court of Criminal Appeals",
      "Member of the Texas State Board of Education",
      "Secretary of State"
    ];
    insertOfficialPublicSchema = createInsertSchema(officialPublic);
    insertOfficialPrivateSchema = createInsertSchema(officialPrivate);
    updateOfficialPrivateSchema = z.object({
      personalPhone: z.string().nullable().optional(),
      personalAddress: z.string().nullable().optional(),
      spouseName: z.string().nullable().optional(),
      childrenNames: z.array(z.string()).nullable().optional(),
      birthday: z.string().nullable().optional(),
      anniversary: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
      tags: z.array(z.string()).nullable().optional()
    });
    prayerStatusEnum = pgEnum("prayer_status", ["OPEN", "ANSWERED", "ARCHIVED"]);
    prayerCategories = pgTable("prayer_categories", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      name: varchar("name", { length: 255 }).notNull().unique(),
      sortOrder: integer("sort_order").default(0).notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    prayers = pgTable("prayers", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      title: varchar("title", { length: 500 }).notNull(),
      body: text("body").notNull(),
      status: prayerStatusEnum("status").default("OPEN").notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull(),
      answeredAt: timestamp("answered_at"),
      archivedAt: timestamp("archived_at"),
      answerNote: text("answer_note"),
      categoryId: varchar("category_id", { length: 255 }).references(() => prayerCategories.id, { onDelete: "set null" }),
      officialIds: json("official_ids").$type().default([]),
      pinnedDaily: boolean("pinned_daily").default(false).notNull(),
      priority: integer("priority").default(0).notNull(),
      lastShownAt: timestamp("last_shown_at"),
      lastPrayedAt: timestamp("last_prayed_at")
    });
    dailyPrayerPicks = pgTable("daily_prayer_picks", {
      dateKey: varchar("date_key", { length: 10 }).primaryKey(),
      prayerIds: json("prayer_ids").$type().notNull(),
      generatedAt: timestamp("generated_at").defaultNow().notNull()
    });
    prayerStreak = pgTable("prayer_streak", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      currentStreak: integer("current_streak").default(0).notNull(),
      lastCompletedDateKey: varchar("last_completed_date_key", { length: 10 }),
      longestStreak: integer("longest_streak").default(0).notNull()
    });
    appSettings = pgTable("app_settings", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      key: varchar("key", { length: 100 }).notNull().unique(),
      value: text("value").notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    insertPrayerSchema = z.object({
      title: z.string().min(1).max(500),
      body: z.string().min(1),
      categoryId: z.string().nullable().optional(),
      officialIds: z.array(z.string()).optional(),
      pinnedDaily: z.boolean().optional(),
      priority: z.number().int().min(0).max(1).optional()
    });
    updatePrayerSchema = z.object({
      title: z.string().min(1).max(500).optional(),
      body: z.string().min(1).optional(),
      categoryId: z.string().nullable().optional(),
      officialIds: z.array(z.string()).optional(),
      pinnedDaily: z.boolean().optional(),
      priority: z.number().int().min(0).max(1).optional(),
      lastPrayedAt: z.string().nullable().optional()
    });
  }
});

// server/db.ts
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
var Pool, pool, db;
var init_db = __esm({
  "server/db.ts"() {
    "use strict";
    init_schema();
    ({ Pool } = pg);
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL
    });
    db = drizzle(pool, { schema: schema_exports });
  }
});

// server/lib/partyLookup.ts
import https from "https";
async function fetchLRLPage(chamber) {
  return new Promise((resolve3, reject) => {
    const url = `https://lrl.texas.gov/legeLeaders/members/membersearch.cfm?leg=89&chamber=${chamber}`;
    https.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => resolve3(data));
      res.on("error", reject);
    }).on("error", reject);
  });
}
function parsePartyData(html) {
  const partyMap = /* @__PURE__ */ new Map();
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  const memberRows = rows.filter((r) => r.includes("memberID="));
  for (const row of memberRows) {
    const cells = row.match(/<td[^>]*>[\s\S]*?<\/td>/gi) || [];
    if (cells.length >= 6) {
      const districtText = cells[1].replace(/<[^>]*>/g, "").trim();
      const partyText = cells[5].replace(/<[^>]*>/g, "").trim();
      const district = parseInt(districtText, 10);
      if (!isNaN(district) && (partyText === "R" || partyText === "D")) {
        partyMap.set(district, partyText);
      }
    }
  }
  return partyMap;
}
async function fetchTexasHouseParties() {
  try {
    const html = await fetchLRLPage("H");
    const partyMap = parsePartyData(html);
    console.log(`[PartyLookup] Fetched TX House parties: ${partyMap.size} districts`);
    const rCount = [...partyMap.values()].filter((p) => p === "R").length;
    const dCount = [...partyMap.values()].filter((p) => p === "D").length;
    console.log(`[PartyLookup] TX House: R=${rCount}, D=${dCount}`);
    return partyMap;
  } catch (err) {
    console.error("[PartyLookup] Failed to fetch TX House parties:", err);
    return /* @__PURE__ */ new Map();
  }
}
async function fetchTexasSenateParties() {
  try {
    const html = await fetchLRLPage("S");
    const partyMap = parsePartyData(html);
    console.log(`[PartyLookup] Fetched TX Senate parties: ${partyMap.size} districts`);
    const rCount = [...partyMap.values()].filter((p) => p === "R").length;
    const dCount = [...partyMap.values()].filter((p) => p === "D").length;
    console.log(`[PartyLookup] TX Senate: R=${rCount}, D=${dCount}`);
    return partyMap;
  } catch (err) {
    console.error("[PartyLookup] Failed to fetch TX Senate parties:", err);
    return /* @__PURE__ */ new Map();
  }
}
var init_partyLookup = __esm({
  "server/lib/partyLookup.ts"() {
    "use strict";
  }
});

// server/lib/texasTribuneLookup.ts
var texasTribuneLookup_exports = {};
__export(texasTribuneLookup_exports, {
  lookupHeadshotFromTexasTribune: () => lookupHeadshotFromTexasTribune,
  lookupHometownFromTexasTribune: () => lookupHometownFromTexasTribune
});
import fetch2 from "node-fetch";
function transliterate(str) {
  const map = {
    "\xE1": "a",
    "\xE0": "a",
    "\xE4": "a",
    "\xE2": "a",
    "\xE3": "a",
    "\xE9": "e",
    "\xE8": "e",
    "\xEB": "e",
    "\xEA": "e",
    "\xED": "i",
    "\xEC": "i",
    "\xEF": "i",
    "\xEE": "i",
    "\xF3": "o",
    "\xF2": "o",
    "\xF6": "o",
    "\xF4": "o",
    "\xF5": "o",
    "\xFA": "u",
    "\xF9": "u",
    "\xFC": "u",
    "\xFB": "u",
    "\xF1": "n",
    "\xE7": "c",
    "\xFD": "y",
    "\xFF": "y"
  };
  return str.replace(/[^\x00-\x7F]/g, (ch) => map[ch] || "");
}
function nameToSlug(fullName) {
  return transliterate(fullName).toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
}
function generateSlugVariants(fullName) {
  const cleanName2 = fullName.replace(/\./g, "").trim();
  const parts = cleanName2.split(/\s+/);
  const slugs = [];
  if (parts.length >= 2) {
    const firstName = parts[0];
    const lastName = parts[parts.length - 1];
    const middleParts = parts.slice(1, -1);
    slugs.push(nameToSlug(`${firstName} ${lastName}`));
    if (middleParts.length > 0) {
      slugs.push(nameToSlug(parts.join(" ")));
      for (const middle of middleParts) {
        slugs.push(nameToSlug(`${firstName} ${middle} ${lastName}`));
      }
      if (middleParts.length === 1 && middleParts[0].length === 1) {
        slugs.push(nameToSlug(`${firstName} ${middleParts[0]} ${lastName}`));
      }
    }
  } else {
    slugs.push(nameToSlug(fullName));
  }
  return [...new Set(slugs.filter((s) => s.length > 0))];
}
function parseHometownFromHtml(html) {
  const hometownMatch = html.match(/<td>\s*<strong>Hometown<\/strong>\s*<\/td>\s*<td>([^<]+)<\/td>/i);
  if (hometownMatch && hometownMatch[1]) {
    const hometown = hometownMatch[1].trim();
    if (hometown && hometown.length > 0 && hometown.toLowerCase() !== "n/a") {
      return hometown;
    }
  }
  return null;
}
function parseHeadshotFromHtml(html) {
  const imgMatch = html.match(/src="(\/static\/images\/headshots\/[^"]+)"/i);
  if (imgMatch && imgMatch[1]) {
    return `https://directory.texastribune.org${imgMatch[1]}`;
  }
  return null;
}
async function lookupHometownFromTexasTribune(fullName) {
  const slugs = generateSlugVariants(fullName);
  console.log(`[TexasTribune] Looking up hometown for "${fullName}" with slugs:`, slugs);
  for (const slug of slugs) {
    const url = `https://directory.texastribune.org/${slug}/`;
    try {
      const response = await fetch2(url, {
        headers: {
          "User-Agent": "TXDistrictNavigator/1.0 (civic-engagement-app)",
          "Accept": "text/html"
        },
        redirect: "follow"
      });
      if (!response.ok) {
        console.log(`[TexasTribune] ${slug}: ${response.status}`);
        continue;
      }
      const html = await response.text();
      if (html.includes("Page not found") || html.includes("404")) {
        console.log(`[TexasTribune] ${slug}: Page not found`);
        continue;
      }
      const hometown = parseHometownFromHtml(html);
      if (hometown) {
        const formattedHometown = `${hometown}, TX`;
        console.log(`[TexasTribune] Found hometown for "${fullName}": ${formattedHometown}`);
        return {
          hometown: formattedHometown,
          success: true
        };
      }
      console.log(`[TexasTribune] ${slug}: No hometown field found`);
    } catch (error) {
      console.log(`[TexasTribune] Error fetching ${slug}:`, error);
    }
  }
  console.log(`[TexasTribune] No hometown found for "${fullName}"`);
  return {
    hometown: null,
    success: false,
    error: "Official not found in Texas Tribune directory"
  };
}
async function lookupHeadshotFromTexasTribune(fullName) {
  const slugs = generateSlugVariants(fullName);
  for (const slug of slugs) {
    const url = `https://directory.texastribune.org/${slug}/`;
    try {
      const response = await fetch2(url, {
        headers: {
          "User-Agent": "TXDistrictNavigator/1.0 (civic-engagement-app)",
          "Accept": "text/html"
        },
        redirect: "follow"
      });
      if (!response.ok) continue;
      const html = await response.text();
      if (html.includes("Page not found") || html.includes("404")) continue;
      const photoUrl = parseHeadshotFromHtml(html);
      if (photoUrl) {
        console.log(`[TexasTribune] Found headshot for "${fullName}": ${photoUrl}`);
        return { photoUrl, success: true };
      }
    } catch (error) {
      console.log(`[TexasTribune] Error fetching headshot ${slug}:`, error);
    }
  }
  return { photoUrl: null, success: false, error: "Headshot not found" };
}
var init_texasTribuneLookup = __esm({
  "server/lib/texasTribuneLookup.ts"() {
    "use strict";
  }
});

// server/jobs/refreshOfficials.ts
var refreshOfficials_exports = {};
__export(refreshOfficials_exports, {
  checkAndRefreshIfChanged: () => checkAndRefreshIfChanged,
  checkSourceForChanges: () => checkSourceForChanges,
  getAllRefreshStates: () => getAllRefreshStates,
  getIsRefreshing: () => getIsRefreshing,
  getLastRefreshTime: () => getLastRefreshTime,
  isInMondayCheckWindow: () => isInMondayCheckWindow,
  maybeRunScheduledRefresh: () => maybeRunScheduledRefresh,
  refreshAllOfficials: () => refreshAllOfficials,
  shouldRunRefresh: () => shouldRunRefresh,
  wasCheckedThisWeek: () => wasCheckedThisWeek
});
import * as cheerio from "cheerio";
import * as crypto from "crypto";
import { eq as eq2, and as and2, sql as sql3 } from "drizzle-orm";
function extractSearchZips(addresses) {
  const zips = /* @__PURE__ */ new Set();
  for (const addr of addresses) {
    const matches = addr.matchAll(CITY_STATE_ZIP_REGEX);
    for (const match of matches) {
      zips.add(match[1]);
    }
  }
  return zips.size > 0 ? Array.from(zips).join(",") : null;
}
function extractSearchCities(addresses) {
  const cities = /* @__PURE__ */ new Set();
  for (const addr of addresses) {
    const matches = addr.matchAll(CITY_REGEX);
    for (const match of matches) {
      const city = match[1].trim();
      if (city.length > 1 && city.length < 50) {
        cities.add(city);
      }
    }
  }
  return cities.size > 0 ? Array.from(cities).join(",") : null;
}
async function fetchWithRetry(url, options = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "User-Agent": "TexasDistrictsApp/1.0 (Official Data Sync)",
          ...options.headers
        }
      });
      if (response.ok) return response;
      if (response.status === 429) {
        await new Promise((r) => setTimeout(r, 2e3 * (i + 1)));
        continue;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, 1e3 * (i + 1)));
    }
  }
  throw new Error("Max retries exceeded");
}
function computeFingerprint(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}
async function getRefreshState(source) {
  const [state] = await db.select().from(refreshState).where(eq2(refreshState.source, source)).limit(1);
  if (!state) return null;
  return {
    fingerprint: state.fingerprint,
    lastCheckedAt: state.lastCheckedAt,
    lastChangedAt: state.lastChangedAt
  };
}
async function updateRefreshState(source, fingerprint, changed) {
  const [existing] = await db.select().from(refreshState).where(eq2(refreshState.source, source)).limit(1);
  const now = /* @__PURE__ */ new Date();
  if (existing) {
    await db.update(refreshState).set({
      fingerprint,
      lastCheckedAt: now,
      lastChangedAt: changed ? now : existing.lastChangedAt,
      lastRefreshedAt: changed ? now : existing.lastRefreshedAt,
      updatedAt: now
    }).where(eq2(refreshState.id, existing.id));
  } else {
    await db.insert(refreshState).values({
      source,
      fingerprint,
      lastCheckedAt: now,
      lastChangedAt: changed ? now : null,
      lastRefreshedAt: changed ? now : null
    });
  }
}
async function markCheckedOnly(source) {
  const [existing] = await db.select().from(refreshState).where(eq2(refreshState.source, source)).limit(1);
  const now = /* @__PURE__ */ new Date();
  if (existing) {
    await db.update(refreshState).set({ lastCheckedAt: now, updatedAt: now }).where(eq2(refreshState.id, existing.id));
  } else {
    await db.insert(refreshState).values({
      source,
      lastCheckedAt: now
    });
  }
}
async function fetchTLOListPage(chamber) {
  const chamberParam = chamber === "house" ? "H" : "S";
  const listUrl = `${TLO_BASE_URL}/Members/Members.aspx?Chamber=${chamberParam}`;
  const response = await fetchWithRetry(listUrl);
  return response.text();
}
async function fetchUSHouseData() {
  const apiKey = process.env.CONGRESS_API_KEY;
  if (!apiKey) {
    throw new Error("CONGRESS_API_KEY not configured");
  }
  const allMembers = [];
  let offset = 0;
  const limit = 250;
  let hasMore = true;
  while (hasMore) {
    const url = `${CONGRESS_API_BASE}/member?currentMember=true&limit=${limit}&offset=${offset}&api_key=${apiKey}`;
    const response = await fetchWithRetry(url);
    const data = await response.json();
    if (!data.members || data.members.length === 0) {
      hasMore = false;
      break;
    }
    allMembers.push(...data.members);
    if (data.members.length < limit || !data.pagination?.next) {
      hasMore = false;
    } else {
      offset += limit;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  const texasMembers = allMembers.filter((m) => {
    const isTexas = m.state === "Texas" || m.state === "TX";
    if (!isTexas) return false;
    const terms = m.terms?.item || [];
    if (terms.length === 0) return m.district !== void 0 && m.district !== null;
    const lastTerm = terms[terms.length - 1];
    return lastTerm?.chamber === "House of Representatives" || lastTerm?.chamber?.includes("House") || m.district !== void 0;
  });
  return JSON.stringify(texasMembers.map((m) => ({
    bioguideId: m.bioguideId,
    name: m.name,
    district: m.district,
    party: m.party
  })));
}
async function checkSourceForChanges(source) {
  console.log(`[RefreshOfficials] Checking ${source} for changes...`);
  try {
    let rawData;
    if (source === "TX_HOUSE") {
      rawData = await fetchTLOListPage("house");
    } else if (source === "TX_SENATE") {
      rawData = await fetchTLOListPage("senate");
    } else {
      rawData = await fetchUSHouseData();
    }
    const newFingerprint = computeFingerprint(rawData);
    const state = await getRefreshState(source);
    const previousFingerprint = state?.fingerprint || null;
    const changed = previousFingerprint !== newFingerprint;
    console.log(`[RefreshOfficials] ${source}: fingerprint=${newFingerprint.slice(0, 12)}... changed=${changed}`);
    return {
      source,
      changed,
      previousFingerprint,
      newFingerprint
    };
  } catch (err) {
    console.error(`[RefreshOfficials] Error checking ${source}:`, err);
    return {
      source,
      changed: false,
      previousFingerprint: null,
      newFingerprint: "",
      error: String(err)
    };
  }
}
function validateTLORecord(record, chamber) {
  if (!record.fullName || record.fullName.trim().length === 0) {
    return "Empty name";
  }
  const distNum = parseInt(record.district, 10);
  if (isNaN(distNum)) {
    return `Invalid district number: ${record.district}`;
  }
  const maxDistrict = chamber === "house" ? 150 : 31;
  if (distNum < 1 || distNum > maxDistrict) {
    return `District ${distNum} out of range (1-${maxDistrict})`;
  }
  return null;
}
async function fetchMemberDetails(memberUrl, chamber) {
  try {
    const response = await fetchWithRetry(memberUrl);
    const html = await response.text();
    const $ = cheerio.load(html);
    const urlMatch = memberUrl.match(/Code=([A-Z0-9]+)/i);
    const sourceMemberId = urlMatch ? urlMatch[1] : "";
    if (!sourceMemberId) return null;
    const titleText = $("title").text();
    if (titleText.includes("Lt. Gov.") || titleText.includes("Lieutenant Governor")) {
      return null;
    }
    const nameMatch = titleText.match(/Information for (Rep\.|Sen\.)\s*(.+)$/);
    let fullName = nameMatch ? nameMatch[2].trim() : "";
    if (!fullName) {
      const pageTitle = $("#usrHeader_lblPageTitle").text();
      const altMatch = pageTitle.match(/Information for (Rep\.|Sen\.)\s*(.+)$/);
      fullName = altMatch ? altMatch[2].trim() : "";
    }
    if (!fullName) return null;
    let district = $("#lblDistrict").text().trim();
    if (!district) {
      const pageText = $("body").text();
      const distMatch = pageText.match(/District\s*:?\s*(\d+)/i);
      if (distMatch) {
        district = distMatch[1];
      }
    }
    if (!district) {
      $("*").each((_, el) => {
        const text2 = $(el).text();
        const match = text2.match(/^(\d{1,3})$/);
        if (match && !district) {
          const num = parseInt(match[1], 10);
          const max = chamber === "house" ? 150 : 31;
          if (num >= 1 && num <= max) {
            const parentText = $(el).parent().text();
            if (parentText.toLowerCase().includes("district")) {
              district = match[1];
            }
          }
        }
      });
    }
    if (!district) {
      console.warn(`[RefreshOfficials] No district found for ${fullName} at ${memberUrl}`);
      return null;
    }
    let party;
    const partyText = $("body").text();
    if (partyText.includes("(R)") || partyText.match(/\bRepublican\b/i)) {
      party = "R";
    } else if (partyText.includes("(D)") || partyText.match(/\bDemocrat\b/i)) {
      party = "D";
    }
    const capitolAddr1 = $("#lblCapitolAddress1").text().trim();
    const capitolAddr2 = $("#lblCapitolAddress2").text().trim();
    const capitolAddress = [capitolAddr1, capitolAddr2].filter(Boolean).join(", ");
    const capitolOfficeText = $("#lblCapitolOffice").text().trim();
    let capitolRoom;
    if (capitolOfficeText) {
      capitolRoom = capitolOfficeText;
    }
    const capitolPhone = $("#lblCapitolPhone").text().trim() || void 0;
    const districtAddr1 = $("#lblDistrictAddress1").text().trim();
    const districtAddr2 = $("#lblDistrictAddress2").text().trim();
    const districtAddress = [districtAddr1, districtAddr2].filter(Boolean).join(", ");
    const districtAddresses = districtAddress ? [districtAddress] : void 0;
    const districtPhone = $("#lblDistrictPhone").text().trim();
    const districtPhones = districtPhone ? [districtPhone] : void 0;
    const homePageLink = $("#lnkHomePage").attr("href");
    const website = homePageLink || void 0;
    const photoImg = $('img[src*="photo"], img[alt*="Member"]').first();
    let photoUrl;
    if (photoImg.length) {
      const src = photoImg.attr("src");
      if (src) {
        photoUrl = src.startsWith("http") ? src : `${TLO_BASE_URL}${src}`;
      }
    }
    return {
      sourceMemberId,
      fullName,
      district,
      party,
      capitolAddress: capitolAddress || void 0,
      capitolPhone,
      capitolRoom,
      districtAddresses,
      districtPhones,
      website,
      photoUrl
    };
  } catch (err) {
    console.error(`Failed to fetch member details from ${memberUrl}:`, err);
    return null;
  }
}
async function refreshTLO(chamber) {
  const source = chamber === "house" ? "TX_HOUSE" : "TX_SENATE";
  const chamberParam = chamber === "house" ? "H" : "S";
  const listUrl = `${TLO_BASE_URL}/Members/Members.aspx?Chamber=${chamberParam}`;
  const result = {
    source,
    parsedCount: 0,
    upsertedCount: 0,
    skippedCount: 0,
    deactivatedCount: 0,
    errors: []
  };
  console.log(`[RefreshOfficials] Starting ${source} refresh from ${listUrl}`);
  const partyLookup = chamber === "house" ? await fetchTexasHouseParties() : await fetchTexasSenateParties();
  try {
    const response = await fetchWithRetry(listUrl);
    const html = await response.text();
    const $ = cheerio.load(html);
    const memberLinks = [];
    $('a[href*="MemberInfo.aspx"]').each((_, el) => {
      const href = $(el).attr("href");
      if (href) {
        const fullUrl = href.startsWith("http") ? href : `${TLO_BASE_URL}/Members/${href}`;
        if (!memberLinks.includes(fullUrl)) {
          memberLinks.push(fullUrl);
        }
      }
    });
    const filteredLinks = memberLinks.filter(
      (url) => url.includes(`Chamber=${chamberParam}`) || chamber === "senate" && url.includes("Chamber=S") || chamber === "house" && url.includes("Chamber=H")
    );
    console.log(`[RefreshOfficials] Found ${filteredLinks.length} member links for ${source} (total links: ${memberLinks.length})`);
    const expectedMin = chamber === "house" ? 140 : 25;
    if (filteredLinks.length < expectedMin) {
      console.warn(`[RefreshOfficials] WARNING: Only found ${filteredLinks.length} links, expected at least ${expectedMin}`);
      $("a").each((_, el) => {
        const href = $(el).attr("href") || "";
        if (href.toLowerCase().includes("member")) {
          console.log(`[RefreshOfficials] Debug link: ${href}`);
        }
      });
    }
    memberLinks.length = 0;
    memberLinks.push(...filteredLinks);
    console.log(`[RefreshOfficials] Processing ${memberLinks.length} member links for ${source}`);
    if (memberLinks.length === 0) {
      result.errors.push("No member links found on list page");
      return result;
    }
    const records = [];
    const batchSize = 10;
    for (let i = 0; i < memberLinks.length; i += batchSize) {
      const batch = memberLinks.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (url, idx) => {
          const record = await fetchMemberDetails(url, chamber);
          if (!record) {
            console.warn(`[RefreshOfficials] Failed to parse member from: ${url}`);
          }
          return record;
        })
      );
      for (const record of batchResults) {
        if (record) {
          records.push(record);
        }
      }
      if (i + batchSize < memberLinks.length) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    result.parsedCount = records.length;
    console.log(`[RefreshOfficials] Parsed ${records.length} ${source} members`);
    const processedMemberIds = [];
    for (const record of records) {
      const validationError = validateTLORecord(record, chamber);
      if (validationError) {
        result.errors.push(`${record.fullName}: ${validationError}`);
        result.skippedCount++;
        continue;
      }
      try {
        const existing = await db.select().from(officialPublic).where(and2(
          eq2(officialPublic.source, source),
          eq2(officialPublic.sourceMemberId, record.sourceMemberId)
        )).limit(1);
        const allAddresses = [];
        if (record.capitolAddress) allAddresses.push(record.capitolAddress);
        if (record.districtAddresses) allAddresses.push(...record.districtAddresses);
        const districtNum = parseInt(record.district, 10);
        const authorativeParty = partyLookup.get(districtNum) || record.party;
        const insertData = {
          source,
          sourceMemberId: record.sourceMemberId,
          chamber: chamber === "house" ? "TX House" : "TX Senate",
          district: record.district,
          fullName: record.fullName,
          party: authorativeParty,
          photoUrl: record.photoUrl,
          capitolAddress: record.capitolAddress,
          capitolPhone: record.capitolPhone,
          capitolRoom: record.capitolRoom,
          districtAddresses: record.districtAddresses,
          districtPhones: record.districtPhones,
          website: record.website,
          email: record.email,
          active: true,
          lastRefreshedAt: /* @__PURE__ */ new Date(),
          searchZips: extractSearchZips(allAddresses),
          searchCities: extractSearchCities(allAddresses)
        };
        if (existing.length > 0) {
          const updateData = { ...insertData, id: void 0 };
          if (existing[0].photoUrl && !updateData.photoUrl) {
            updateData.photoUrl = existing[0].photoUrl;
          }
          if (!updateData.photoUrl && (source === "TX_HOUSE" || source === "TX_SENATE")) {
            try {
              const { lookupHeadshotFromTexasTribune: lookupHeadshotFromTexasTribune2 } = await Promise.resolve().then(() => (init_texasTribuneLookup(), texasTribuneLookup_exports));
              const headshot = await lookupHeadshotFromTexasTribune2(record.fullName);
              if (headshot.success && headshot.photoUrl) {
                updateData.photoUrl = headshot.photoUrl;
              }
            } catch (err) {
              console.log(`[RefreshOfficials] Headshot lookup failed for ${record.fullName}`);
            }
          }
          await db.update(officialPublic).set(updateData).where(eq2(officialPublic.id, existing[0].id));
        } else {
          if (!insertData.photoUrl) {
            try {
              const { lookupHeadshotFromTexasTribune: lookupHeadshotFromTexasTribune2 } = await Promise.resolve().then(() => (init_texasTribuneLookup(), texasTribuneLookup_exports));
              const headshot = await lookupHeadshotFromTexasTribune2(record.fullName);
              if (headshot.success && headshot.photoUrl) {
                insertData.photoUrl = headshot.photoUrl;
              }
            } catch (err) {
              console.log(`[RefreshOfficials] Headshot lookup failed for ${record.fullName}`);
            }
          }
          await db.insert(officialPublic).values(insertData);
        }
        processedMemberIds.push(record.sourceMemberId);
        result.upsertedCount++;
      } catch (err) {
        result.errors.push(`Failed to upsert ${record.fullName}: ${err}`);
        result.skippedCount++;
      }
    }
    if (processedMemberIds.length > 0) {
      const deactivated = await db.update(officialPublic).set({ active: false }).where(and2(
        eq2(officialPublic.source, source),
        eq2(officialPublic.active, true),
        sql3`${officialPublic.sourceMemberId} NOT IN (${sql3.join(processedMemberIds.map((id) => sql3`${id}`), sql3`, `)})`
      )).returning();
      result.deactivatedCount = deactivated.length;
    }
  } catch (err) {
    result.errors.push(`Fatal error: ${err}`);
    console.error(`[RefreshOfficials] ${source} refresh failed:`, err);
  }
  return result;
}
async function refreshUSHouse() {
  const source = "US_HOUSE";
  const result = {
    source,
    parsedCount: 0,
    upsertedCount: 0,
    skippedCount: 0,
    deactivatedCount: 0,
    errors: []
  };
  const apiKey = process.env.CONGRESS_API_KEY;
  if (!apiKey) {
    result.errors.push("CONGRESS_API_KEY not configured");
    console.warn("[RefreshOfficials] CONGRESS_API_KEY not set, skipping US House refresh");
    return result;
  }
  console.log("[RefreshOfficials] Starting US_HOUSE refresh from Congress.gov API");
  try {
    const allMembers = [];
    let offset = 0;
    const limit = 250;
    let hasMore = true;
    while (hasMore) {
      const url = `${CONGRESS_API_BASE}/member?currentMember=true&limit=${limit}&offset=${offset}&api_key=${apiKey}`;
      console.log(`[RefreshOfficials] Fetching Congress.gov page offset=${offset}`);
      const response = await fetchWithRetry(url);
      const data = await response.json();
      if (!data.members || data.members.length === 0) {
        hasMore = false;
        break;
      }
      allMembers.push(...data.members);
      if (data.members.length < limit || !data.pagination?.next) {
        hasMore = false;
      } else {
        offset += limit;
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    console.log(`[RefreshOfficials] Fetched ${allMembers.length} total members from Congress.gov`);
    const texasMembers = allMembers.filter((m) => {
      const isTexas = m.state === "Texas" || m.state === "TX";
      if (!isTexas) return false;
      const terms = m.terms?.item || [];
      if (terms.length === 0) {
        return m.district !== void 0 && m.district !== null;
      }
      const lastTerm = terms[terms.length - 1];
      const isHouse = lastTerm?.chamber === "House of Representatives" || lastTerm?.chamber?.includes("House") || m.district !== void 0;
      return isHouse;
    });
    console.log(`[RefreshOfficials] Filtered to ${texasMembers.length} Texas US House members`);
    if (texasMembers.length < 30) {
      result.errors.push(`Only found ${texasMembers.length} TX members, expected ~38. Check API filtering.`);
      console.warn(`[RefreshOfficials] WARNING: Only ${texasMembers.length} TX House members found`);
    }
    result.parsedCount = texasMembers.length;
    console.log(`[RefreshOfficials] Found ${texasMembers.length} Texas US House members`);
    const processedMemberIds = [];
    for (const member of texasMembers) {
      const fullName = member.name || `${member.firstName || ""} ${member.lastName || ""}`.trim();
      const record = {
        sourceMemberId: member.bioguideId,
        fullName,
        district: String(member.district || 0),
        party: member.party?.charAt(0) || member.partyName?.charAt(0),
        photoUrl: member.depiction?.imageUrl
      };
      if (!record.district || record.district === "0") {
        result.errors.push(`${record.fullName}: Missing district`);
        result.skippedCount++;
        continue;
      }
      try {
        const existing = await db.select().from(officialPublic).where(and2(
          eq2(officialPublic.source, source),
          eq2(officialPublic.sourceMemberId, record.sourceMemberId)
        )).limit(1);
        const congressAddresses = ["Washington, DC 20515"];
        const insertData = {
          source,
          sourceMemberId: record.sourceMemberId,
          chamber: "US House",
          district: record.district,
          fullName: record.fullName,
          party: record.party,
          photoUrl: record.photoUrl,
          capitolAddress: "Washington, DC 20515",
          active: true,
          lastRefreshedAt: /* @__PURE__ */ new Date(),
          searchZips: extractSearchZips(congressAddresses),
          searchCities: extractSearchCities(congressAddresses)
        };
        if (existing.length > 0) {
          await db.update(officialPublic).set({
            ...insertData,
            id: void 0
          }).where(eq2(officialPublic.id, existing[0].id));
        } else {
          await db.insert(officialPublic).values(insertData);
        }
        processedMemberIds.push(record.sourceMemberId);
        result.upsertedCount++;
      } catch (err) {
        result.errors.push(`Failed to upsert ${record.fullName}: ${err}`);
        result.skippedCount++;
      }
    }
    if (processedMemberIds.length > 0) {
      const deactivated = await db.update(officialPublic).set({ active: false }).where(and2(
        eq2(officialPublic.source, source),
        eq2(officialPublic.active, true),
        sql3`${officialPublic.sourceMemberId} NOT IN (${sql3.join(processedMemberIds.map((id) => sql3`${id}`), sql3`, `)})`
      )).returning();
      result.deactivatedCount = deactivated.length;
    }
  } catch (err) {
    result.errors.push(`Fatal error: ${err}`);
    console.error("[RefreshOfficials] US_HOUSE refresh failed:", err);
  }
  return result;
}
async function getLastSuccessfulRefreshCounts() {
  const counts = /* @__PURE__ */ new Map();
  for (const source of ["TX_HOUSE", "TX_SENATE", "US_HOUSE"]) {
    const lastSuccess = await db.select().from(refreshJobLog).where(and2(
      eq2(refreshJobLog.source, source),
      eq2(refreshJobLog.status, "success")
    )).orderBy(sql3`${refreshJobLog.completedAt} DESC`).limit(1);
    if (lastSuccess.length > 0 && lastSuccess[0].upsertedCount) {
      counts.set(source, parseInt(lastSuccess[0].upsertedCount, 10));
    }
  }
  return counts;
}
function validateRefreshSanity(result, lastCounts) {
  if (result.parsedCount === 0) {
    return { valid: false, reason: "Zero records parsed - possible source outage" };
  }
  const lastCount = lastCounts.get(result.source);
  if (lastCount && lastCount >= 20) {
    const deviation = Math.abs(result.upsertedCount - lastCount) / lastCount;
    if (deviation > 0.25) {
      return {
        valid: false,
        reason: `Count deviation ${(deviation * 100).toFixed(1)}% exceeds 25% threshold (was ${lastCount}, now ${result.upsertedCount})`
      };
    }
  } else if (lastCount && lastCount < 20 && result.upsertedCount > lastCount) {
    console.log(`[RefreshOfficials] ${result.source}: Allowing population growth from ${lastCount} to ${result.upsertedCount} (initial population)`);
  }
  const expectedMins = {
    TX_HOUSE: 140,
    TX_SENATE: 25,
    US_HOUSE: 30
  };
  const expectedMin = expectedMins[result.source];
  if (result.upsertedCount < expectedMin) {
    console.warn(`[RefreshOfficials] WARNING: ${result.source} has only ${result.upsertedCount} members, expected at least ${expectedMin}`);
  }
  return { valid: true };
}
async function logRefreshJob(result, status, durationMs, errorMessage) {
  await db.insert(refreshJobLog).values({
    source: result.source,
    status,
    parsedCount: String(result.parsedCount),
    upsertedCount: String(result.upsertedCount),
    skippedCount: String(result.skippedCount),
    deactivatedCount: String(result.deactivatedCount),
    durationMs: String(durationMs),
    errorMessage: errorMessage || (result.errors.length > 0 ? result.errors.join("; ") : void 0),
    completedAt: /* @__PURE__ */ new Date()
  });
}
async function refreshAllOfficials() {
  console.log("[RefreshOfficials] Starting full refresh of all officials data");
  const overallStart = Date.now();
  const lastCounts = await getLastSuccessfulRefreshCounts();
  const sources = [
    { name: "TX_HOUSE", fn: () => refreshTLO("house") },
    { name: "TX_SENATE", fn: () => refreshTLO("senate") },
    { name: "US_HOUSE", fn: refreshUSHouse }
  ];
  for (const { name, fn } of sources) {
    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      const sanityCheck = validateRefreshSanity(result, lastCounts);
      if (!sanityCheck.valid) {
        console.error(`[RefreshOfficials] ${name} ABORTED: ${sanityCheck.reason}`);
        await logRefreshJob(result, "aborted", duration, sanityCheck.reason);
        continue;
      }
      console.log(`[RefreshOfficials] ${name} completed: ${result.upsertedCount} upserted, ${result.skippedCount} skipped, ${result.deactivatedCount} deactivated in ${duration}ms`);
      await logRefreshJob(result, "success", duration);
    } catch (err) {
      const duration = Date.now() - start;
      console.error(`[RefreshOfficials] ${name} FAILED:`, err);
      await logRefreshJob(
        { source: name, parsedCount: 0, upsertedCount: 0, skippedCount: 0, deactivatedCount: 0, errors: [] },
        "failed",
        duration,
        String(err)
      );
    }
  }
  const totalDuration = Date.now() - overallStart;
  console.log(`[RefreshOfficials] Full refresh completed in ${totalDuration}ms`);
}
async function getLastRefreshTime() {
  const latest = await db.select().from(refreshJobLog).where(eq2(refreshJobLog.status, "success")).orderBy(sql3`${refreshJobLog.completedAt} DESC`).limit(1);
  return latest.length > 0 ? latest[0].completedAt : null;
}
async function shouldRunRefresh() {
  const lastRefresh = await getLastRefreshTime();
  if (!lastRefresh) return true;
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1e3);
  return lastRefresh < sevenDaysAgo;
}
function getIsRefreshing() {
  return isRefreshing;
}
async function checkAndRefreshIfChanged(force = false) {
  if (isRefreshing) {
    console.log("[RefreshOfficials] Refresh already in progress, skipping");
    return {
      sourcesChecked: [],
      sourcesChanged: [],
      sourcesRefreshed: [],
      errors: [{ source: "TX_HOUSE", error: "Refresh already in progress" }],
      durationMs: 0
    };
  }
  isRefreshing = true;
  const startTime = Date.now();
  const result = {
    sourcesChecked: [],
    sourcesChanged: [],
    sourcesRefreshed: [],
    errors: [],
    durationMs: 0
  };
  console.log(`[RefreshOfficials] Starting smart check-and-refresh (force=${force})`);
  try {
    const sources = ["TX_HOUSE", "TX_SENATE", "US_HOUSE"];
    const lastCounts = await getLastSuccessfulRefreshCounts();
    for (const source of sources) {
      result.sourcesChecked.push(source);
      const checkResult = await checkSourceForChanges(source);
      if (checkResult.error) {
        result.errors.push({ source, error: checkResult.error });
        continue;
      }
      if (!checkResult.changed && !force) {
        console.log(`[RefreshOfficials] ${source}: No changes detected, skipping refresh`);
        await markCheckedOnly(source);
        continue;
      }
      result.sourcesChanged.push(source);
      console.log(`[RefreshOfficials] ${source}: Changes detected, running refresh...`);
      const refreshStart = Date.now();
      let refreshResult;
      try {
        if (source === "TX_HOUSE") {
          refreshResult = await refreshTLO("house");
        } else if (source === "TX_SENATE") {
          refreshResult = await refreshTLO("senate");
        } else {
          refreshResult = await refreshUSHouse();
        }
        const duration = Date.now() - refreshStart;
        const sanityCheck = validateRefreshSanity(refreshResult, lastCounts);
        if (!sanityCheck.valid) {
          console.error(`[RefreshOfficials] ${source} ABORTED: ${sanityCheck.reason}`);
          await logRefreshJob(refreshResult, "aborted", duration, sanityCheck.reason);
          result.errors.push({ source, error: sanityCheck.reason || "Sanity check failed" });
          continue;
        }
        await logRefreshJob(refreshResult, "success", duration);
        await updateRefreshState(source, checkResult.newFingerprint, true);
        result.sourcesRefreshed.push(source);
        console.log(`[RefreshOfficials] ${source} refreshed: ${refreshResult.upsertedCount} upserted in ${duration}ms`);
      } catch (err) {
        const duration = Date.now() - refreshStart;
        console.error(`[RefreshOfficials] ${source} FAILED:`, err);
        await logRefreshJob(
          { source, parsedCount: 0, upsertedCount: 0, skippedCount: 0, deactivatedCount: 0, errors: [] },
          "failed",
          duration,
          String(err)
        );
        result.errors.push({ source, error: String(err) });
      }
    }
  } finally {
    isRefreshing = false;
    result.durationMs = Date.now() - startTime;
  }
  console.log(`[RefreshOfficials] Smart refresh completed: checked=${result.sourcesChecked.length}, changed=${result.sourcesChanged.length}, refreshed=${result.sourcesRefreshed.length}, errors=${result.errors.length} in ${result.durationMs}ms`);
  return result;
}
async function maybeRunScheduledRefresh() {
  if (isRefreshing) {
    console.log("[RefreshOfficials] Refresh already in progress, skipping");
    return;
  }
  const shouldRun = await shouldRunRefresh();
  if (!shouldRun) {
    console.log("[RefreshOfficials] Last refresh was less than 7 days ago, skipping");
    return;
  }
  isRefreshing = true;
  try {
    await refreshAllOfficials();
  } finally {
    isRefreshing = false;
  }
}
function isInMondayCheckWindow() {
  const now = /* @__PURE__ */ new Date();
  const centralOptions = {
    timeZone: "America/Chicago",
    weekday: "long",
    hour: "numeric",
    hour12: false
  };
  const formatter = new Intl.DateTimeFormat("en-US", centralOptions);
  const parts = formatter.formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value;
  const hourPart = parts.find((p) => p.type === "hour")?.value;
  const hour = hourPart ? parseInt(hourPart, 10) : -1;
  return weekday === "Monday" && hour >= 3 && hour < 4;
}
async function wasCheckedThisWeek() {
  const sources = ["TX_HOUSE", "TX_SENATE", "US_HOUSE"];
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1e3);
  for (const source of sources) {
    const state = await getRefreshState(source);
    if (!state?.lastCheckedAt || state.lastCheckedAt < oneWeekAgo) {
      return false;
    }
  }
  return true;
}
async function getAllRefreshStates() {
  const states = await db.select().from(refreshState);
  return states.map((s) => ({
    source: s.source,
    fingerprint: s.fingerprint,
    lastCheckedAt: s.lastCheckedAt,
    lastChangedAt: s.lastChangedAt,
    lastRefreshedAt: s.lastRefreshedAt
  }));
}
var TLO_BASE_URL, CONGRESS_API_BASE, CITY_STATE_ZIP_REGEX, CITY_REGEX, isRefreshing, isMainModule;
var init_refreshOfficials = __esm({
  "server/jobs/refreshOfficials.ts"() {
    "use strict";
    init_db();
    init_schema();
    init_partyLookup();
    TLO_BASE_URL = "https://capitol.texas.gov";
    CONGRESS_API_BASE = "https://api.congress.gov/v3";
    CITY_STATE_ZIP_REGEX = /,\s*TX\s+(\d{5})(?:-\d{4})?\b/gi;
    CITY_REGEX = /([A-Z][a-zA-Z\s]+),\s*TX\b/gi;
    isRefreshing = false;
    isMainModule = import.meta.url === `file://${process.argv[1]}`;
    if (isMainModule) {
      refreshAllOfficials().then(() => process.exit(0)).catch((err) => {
        console.error(err);
        process.exit(1);
      });
    }
  }
});

// server/data/otherTexasOfficials.ts
function generateOtherTxSourceMemberId(roleTitle, fullName, _category) {
  const roleSlug = roleTitle.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  const nameSlug = fullName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  return `OTHER_TX_${roleSlug}_${nameSlug}`;
}
function cleanName(name) {
  return name.replace(/\s+/g, " ").replace(/\r?\n/g, " ").trim();
}
async function scrapeExecutiveOfficials() {
  const officials = getStaticExecutiveOfficials();
  console.log(`[OtherTxScrape] Executive: using ${officials.length} officials from curated data`);
  return officials;
}
async function scrapeSupremeCourt() {
  const url = "https://www.txcourts.gov/supreme/about-the-court/";
  const officials = [];
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "TXDistrictNavigator/1.0" },
      signal: AbortSignal.timeout(3e4)
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const html = await response.text();
    const justicePattern = /justices\/(chief-justice|justice)-([^\/]+)\/"[^>]*>([^<]+)</gi;
    const placePattern = /Place\s+(\d+)/gi;
    let match;
    const seenNames = /* @__PURE__ */ new Set();
    const justiceSections = html.split(/Chief Justice|Justice\s+[A-Z]/);
    const chiefMatch = html.match(/Chief Justice ([^<\n]+)/);
    if (chiefMatch) {
      const name = cleanName(chiefMatch[1]);
      if (name.length > 2 && !seenNames.has(name)) {
        seenNames.add(name);
        officials.push({
          roleTitle: "Chief Justice of the Texas Supreme Court",
          fullName: name,
          category: "SUPREME_COURT",
          party: "R",
          website: "https://www.txcourts.gov/supreme",
          capitolAddress: "Supreme Court of Texas, P.O. Box 12248, Austin, TX 78711",
          capitolPhone: "(512) 463-1312",
          sourceUrl: url
        });
      }
    }
    const justiceRegex = /\[Justice ([^\]]+)\][^\[]*Place\s+(\d+)/gi;
    let justiceMatch;
    while ((justiceMatch = justiceRegex.exec(html)) !== null) {
      const name = cleanName(justiceMatch[1]);
      const place = parseInt(justiceMatch[2], 10);
      if (!seenNames.has(name) && place >= 2 && place <= 9) {
        seenNames.add(name);
        officials.push({
          roleTitle: `Justice of the Texas Supreme Court (Place ${place})`,
          fullName: name,
          category: "SUPREME_COURT",
          placeNumber: place,
          party: "R",
          website: "https://www.txcourts.gov/supreme",
          capitolAddress: "Supreme Court of Texas, P.O. Box 12248, Austin, TX 78711",
          capitolPhone: "(512) 463-1312",
          sourceUrl: url
        });
      }
    }
    if (officials.length < 9) {
      console.log(`[OtherTxScrape] Supreme Court: only found ${officials.length}, using static fallback`);
      return getStaticSupremeCourt();
    }
    console.log(`[OtherTxScrape] Supreme Court: found ${officials.length} justices`);
    return officials;
  } catch (error) {
    console.error("[OtherTxScrape] Failed to scrape Supreme Court:", error);
    return getStaticSupremeCourt();
  }
}
async function scrapeCriminalAppeals() {
  const url = "https://www.txcourts.gov/cca/about-the-court/judges/";
  const officials = [];
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "TXDistrictNavigator/1.0" },
      signal: AbortSignal.timeout(3e4)
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const html = await response.text();
    const seenNames = /* @__PURE__ */ new Set();
    const presidingMatch = html.match(/\[Presiding Judge ([^\]]+)\]/);
    if (presidingMatch) {
      const name = cleanName(presidingMatch[1]);
      if (!seenNames.has(name)) {
        seenNames.add(name);
        officials.push({
          roleTitle: "Presiding Judge of the Texas Court of Criminal Appeals",
          fullName: name,
          category: "CRIMINAL_APPEALS",
          placeNumber: 1,
          party: "R",
          website: "https://www.txcourts.gov/cca",
          capitolAddress: "Court of Criminal Appeals, P.O. Box 12308, Austin, TX 78711",
          capitolPhone: "(512) 463-1551",
          sourceUrl: url
        });
      }
    }
    const judgeRegex = /\[Judge ([^\]]+)\][^\[]*Place\s+(\d+)/gi;
    let judgeMatch;
    while ((judgeMatch = judgeRegex.exec(html)) !== null) {
      const name = cleanName(judgeMatch[1]);
      const place = parseInt(judgeMatch[2], 10);
      if (!seenNames.has(name) && place >= 2 && place <= 9) {
        seenNames.add(name);
        officials.push({
          roleTitle: `Judge of the Texas Court of Criminal Appeals (Place ${place})`,
          fullName: name,
          category: "CRIMINAL_APPEALS",
          placeNumber: place,
          party: "R",
          website: "https://www.txcourts.gov/cca",
          capitolAddress: "Court of Criminal Appeals, P.O. Box 12308, Austin, TX 78711",
          capitolPhone: "(512) 463-1551",
          sourceUrl: url
        });
      }
    }
    if (officials.length < 9) {
      console.log(`[OtherTxScrape] Criminal Appeals: only found ${officials.length}, using static fallback`);
      return getStaticCriminalAppeals();
    }
    console.log(`[OtherTxScrape] Criminal Appeals: found ${officials.length} judges`);
    return officials;
  } catch (error) {
    console.error("[OtherTxScrape] Failed to scrape Criminal Appeals:", error);
    return getStaticCriminalAppeals();
  }
}
function getStaticExecutiveOfficials() {
  return [
    {
      roleTitle: "Governor",
      fullName: "Greg Abbott",
      category: "EXECUTIVE",
      party: "R",
      website: "https://gov.texas.gov",
      capitolAddress: "Office of the Governor, P.O. Box 12428, Austin, TX 78711",
      capitolPhone: "(512) 463-2000"
    },
    {
      roleTitle: "Lieutenant Governor",
      fullName: "Dan Patrick",
      category: "EXECUTIVE",
      party: "R",
      website: "https://www.ltgov.texas.gov",
      capitolAddress: "Capitol Station, P.O. Box 12068, Austin, TX 78711",
      capitolPhone: "(512) 463-0001"
    },
    {
      roleTitle: "Attorney General",
      fullName: "Ken Paxton",
      category: "EXECUTIVE",
      party: "R",
      website: "https://www.texasattorneygeneral.gov",
      capitolAddress: "P.O. Box 12548, Austin, TX 78711",
      capitolPhone: "(512) 463-2100"
    },
    {
      roleTitle: "Comptroller of Public Accounts",
      fullName: "Glenn Hegar",
      category: "EXECUTIVE",
      party: "R",
      website: "https://comptroller.texas.gov",
      capitolAddress: "P.O. Box 13528, Austin, TX 78711",
      capitolPhone: "(512) 463-4000"
    },
    {
      roleTitle: "Commissioner of the General Land Office",
      fullName: "Dawn Buckingham",
      category: "EXECUTIVE",
      party: "R",
      website: "https://www.glo.texas.gov",
      capitolAddress: "1700 N. Congress Ave., Austin, TX 78701",
      capitolPhone: "(512) 463-5256"
    },
    {
      roleTitle: "Commissioner of Agriculture",
      fullName: "Sid Miller",
      category: "EXECUTIVE",
      party: "R",
      website: "https://www.texasagriculture.gov",
      capitolAddress: "P.O. Box 12847, Austin, TX 78711",
      capitolPhone: "(512) 463-7476"
    },
    {
      roleTitle: "Railroad Commissioner",
      fullName: "Christi Craddick",
      category: "EXECUTIVE",
      party: "R",
      website: "https://www.rrc.texas.gov",
      capitolAddress: "P.O. Box 12967, Austin, TX 78711",
      capitolPhone: "(512) 463-7140"
    },
    {
      roleTitle: "Railroad Commissioner",
      fullName: "Wayne Christian",
      category: "EXECUTIVE",
      party: "R",
      website: "https://www.rrc.texas.gov",
      capitolAddress: "P.O. Box 12967, Austin, TX 78711",
      capitolPhone: "(512) 463-7140"
    },
    {
      roleTitle: "Railroad Commissioner",
      fullName: "Jim Wright",
      category: "EXECUTIVE",
      party: "R",
      website: "https://www.rrc.texas.gov",
      capitolAddress: "P.O. Box 12967, Austin, TX 78711",
      capitolPhone: "(512) 463-7140"
    },
    {
      roleTitle: "Secretary of State",
      fullName: "Jane Nelson",
      category: "SECRETARY_OF_STATE",
      party: "R",
      website: "https://www.sos.state.tx.us",
      capitolAddress: "P.O. Box 12887, Austin, TX 78711",
      capitolPhone: "(512) 463-5770"
    }
  ];
}
function getStaticSupremeCourt() {
  return [
    {
      roleTitle: "Chief Justice of the Texas Supreme Court",
      fullName: "Jimmy Blacklock",
      category: "SUPREME_COURT",
      party: "R",
      website: "https://www.txcourts.gov/supreme",
      capitolAddress: "Supreme Court of Texas, P.O. Box 12248, Austin, TX 78711",
      capitolPhone: "(512) 463-1312",
      sourceUrl: "https://www.txcourts.gov/supreme/about-the-court/"
    },
    {
      roleTitle: "Justice of the Texas Supreme Court (Place 2)",
      fullName: "James P. Sullivan",
      category: "SUPREME_COURT",
      placeNumber: 2,
      party: "R",
      website: "https://www.txcourts.gov/supreme",
      capitolAddress: "Supreme Court of Texas, P.O. Box 12248, Austin, TX 78711",
      capitolPhone: "(512) 463-1312",
      sourceUrl: "https://www.txcourts.gov/supreme/about-the-court/"
    },
    {
      roleTitle: "Justice of the Texas Supreme Court (Place 3)",
      fullName: "Debra Lehrmann",
      category: "SUPREME_COURT",
      placeNumber: 3,
      party: "R",
      website: "https://www.txcourts.gov/supreme",
      capitolAddress: "Supreme Court of Texas, P.O. Box 12248, Austin, TX 78711",
      capitolPhone: "(512) 463-1312",
      sourceUrl: "https://www.txcourts.gov/supreme/about-the-court/"
    },
    {
      roleTitle: "Justice of the Texas Supreme Court (Place 4)",
      fullName: "John Phillip Devine",
      category: "SUPREME_COURT",
      placeNumber: 4,
      party: "R",
      website: "https://www.txcourts.gov/supreme",
      capitolAddress: "Supreme Court of Texas, P.O. Box 12248, Austin, TX 78711",
      capitolPhone: "(512) 463-1312",
      sourceUrl: "https://www.txcourts.gov/supreme/about-the-court/"
    },
    {
      roleTitle: "Justice of the Texas Supreme Court (Place 5)",
      fullName: "Rebeca Aizpuru Huddle",
      category: "SUPREME_COURT",
      placeNumber: 5,
      party: "R",
      website: "https://www.txcourts.gov/supreme",
      capitolAddress: "Supreme Court of Texas, P.O. Box 12248, Austin, TX 78711",
      capitolPhone: "(512) 463-1312",
      sourceUrl: "https://www.txcourts.gov/supreme/about-the-court/"
    },
    {
      roleTitle: "Justice of the Texas Supreme Court (Place 6)",
      fullName: "Jane Bland",
      category: "SUPREME_COURT",
      placeNumber: 6,
      party: "R",
      website: "https://www.txcourts.gov/supreme",
      capitolAddress: "Supreme Court of Texas, P.O. Box 12248, Austin, TX 78711",
      capitolPhone: "(512) 463-1312",
      sourceUrl: "https://www.txcourts.gov/supreme/about-the-court/"
    },
    {
      roleTitle: "Justice of the Texas Supreme Court (Place 7)",
      fullName: "Kyle D. Hawkins",
      category: "SUPREME_COURT",
      placeNumber: 7,
      party: "R",
      website: "https://www.txcourts.gov/supreme",
      capitolAddress: "Supreme Court of Texas, P.O. Box 12248, Austin, TX 78711",
      capitolPhone: "(512) 463-1312",
      sourceUrl: "https://www.txcourts.gov/supreme/about-the-court/"
    },
    {
      roleTitle: "Justice of the Texas Supreme Court (Place 8)",
      fullName: "Brett Busby",
      category: "SUPREME_COURT",
      placeNumber: 8,
      party: "R",
      website: "https://www.txcourts.gov/supreme",
      capitolAddress: "Supreme Court of Texas, P.O. Box 12248, Austin, TX 78711",
      capitolPhone: "(512) 463-1312",
      sourceUrl: "https://www.txcourts.gov/supreme/about-the-court/"
    },
    {
      roleTitle: "Justice of the Texas Supreme Court (Place 9)",
      fullName: "Evan A. Young",
      category: "SUPREME_COURT",
      placeNumber: 9,
      party: "R",
      website: "https://www.txcourts.gov/supreme",
      capitolAddress: "Supreme Court of Texas, P.O. Box 12248, Austin, TX 78711",
      capitolPhone: "(512) 463-1312",
      sourceUrl: "https://www.txcourts.gov/supreme/about-the-court/"
    }
  ];
}
function getStaticCriminalAppeals() {
  return [
    {
      roleTitle: "Presiding Judge of the Texas Court of Criminal Appeals",
      fullName: "David J. Schenck",
      category: "CRIMINAL_APPEALS",
      placeNumber: 1,
      party: "R",
      website: "https://www.txcourts.gov/cca",
      capitolAddress: "Court of Criminal Appeals, P.O. Box 12308, Austin, TX 78711",
      capitolPhone: "(512) 463-1551",
      sourceUrl: "https://www.txcourts.gov/cca/about-the-court/judges/"
    },
    {
      roleTitle: "Judge of the Texas Court of Criminal Appeals (Place 2)",
      fullName: "Mary Lou Keel",
      category: "CRIMINAL_APPEALS",
      placeNumber: 2,
      party: "R",
      website: "https://www.txcourts.gov/cca",
      capitolAddress: "Court of Criminal Appeals, P.O. Box 12308, Austin, TX 78711",
      capitolPhone: "(512) 463-1551",
      sourceUrl: "https://www.txcourts.gov/cca/about-the-court/judges/"
    },
    {
      roleTitle: "Judge of the Texas Court of Criminal Appeals (Place 3)",
      fullName: "Bert Richardson",
      category: "CRIMINAL_APPEALS",
      placeNumber: 3,
      party: "R",
      website: "https://www.txcourts.gov/cca",
      capitolAddress: "Court of Criminal Appeals, P.O. Box 12308, Austin, TX 78711",
      capitolPhone: "(512) 463-1551",
      sourceUrl: "https://www.txcourts.gov/cca/about-the-court/judges/"
    },
    {
      roleTitle: "Judge of the Texas Court of Criminal Appeals (Place 4)",
      fullName: "Kevin Yeary",
      category: "CRIMINAL_APPEALS",
      placeNumber: 4,
      party: "R",
      website: "https://www.txcourts.gov/cca",
      capitolAddress: "Court of Criminal Appeals, P.O. Box 12308, Austin, TX 78711",
      capitolPhone: "(512) 463-1551",
      sourceUrl: "https://www.txcourts.gov/cca/about-the-court/judges/"
    },
    {
      roleTitle: "Judge of the Texas Court of Criminal Appeals (Place 5)",
      fullName: "Scott Walker",
      category: "CRIMINAL_APPEALS",
      placeNumber: 5,
      party: "R",
      website: "https://www.txcourts.gov/cca",
      capitolAddress: "Court of Criminal Appeals, P.O. Box 12308, Austin, TX 78711",
      capitolPhone: "(512) 463-1551",
      sourceUrl: "https://www.txcourts.gov/cca/about-the-court/judges/"
    },
    {
      roleTitle: "Judge of the Texas Court of Criminal Appeals (Place 6)",
      fullName: "Jesse F. McClure, III",
      category: "CRIMINAL_APPEALS",
      placeNumber: 6,
      party: "R",
      website: "https://www.txcourts.gov/cca",
      capitolAddress: "Court of Criminal Appeals, P.O. Box 12308, Austin, TX 78711",
      capitolPhone: "(512) 463-1551",
      sourceUrl: "https://www.txcourts.gov/cca/about-the-court/judges/"
    },
    {
      roleTitle: "Judge of the Texas Court of Criminal Appeals (Place 7)",
      fullName: "Gina G. Parker",
      category: "CRIMINAL_APPEALS",
      placeNumber: 7,
      party: "R",
      website: "https://www.txcourts.gov/cca",
      capitolAddress: "Court of Criminal Appeals, P.O. Box 12308, Austin, TX 78711",
      capitolPhone: "(512) 463-1551",
      sourceUrl: "https://www.txcourts.gov/cca/about-the-court/judges/"
    },
    {
      roleTitle: "Judge of the Texas Court of Criminal Appeals (Place 8)",
      fullName: "Lee Finley",
      category: "CRIMINAL_APPEALS",
      placeNumber: 8,
      party: "R",
      website: "https://www.txcourts.gov/cca",
      capitolAddress: "Court of Criminal Appeals, P.O. Box 12308, Austin, TX 78711",
      capitolPhone: "(512) 463-1551",
      sourceUrl: "https://www.txcourts.gov/cca/about-the-court/judges/"
    },
    {
      roleTitle: "Judge of the Texas Court of Criminal Appeals (Place 9)",
      fullName: "David Newell",
      category: "CRIMINAL_APPEALS",
      placeNumber: 9,
      party: "R",
      website: "https://www.txcourts.gov/cca",
      capitolAddress: "Court of Criminal Appeals, P.O. Box 12308, Austin, TX 78711",
      capitolPhone: "(512) 463-1551",
      sourceUrl: "https://www.txcourts.gov/cca/about-the-court/judges/"
    }
  ];
}
function getStaticUSSenators() {
  return [
    {
      roleTitle: "United States Senator",
      fullName: "John Cornyn",
      category: "US_SENATE",
      party: "R",
      website: "https://www.cornyn.senate.gov",
      capitolAddress: "517 Hart Senate Office Building, Washington, DC 20510",
      capitolPhone: "(202) 224-2934",
      sourceUrl: "https://www.senate.gov"
    },
    {
      roleTitle: "United States Senator",
      fullName: "Ted Cruz",
      category: "US_SENATE",
      party: "R",
      website: "https://www.cruz.senate.gov",
      capitolAddress: "127A Russell Senate Office Building, Washington, DC 20510",
      capitolPhone: "(202) 224-5922",
      sourceUrl: "https://www.senate.gov"
    }
  ];
}
async function fetchAllOtherTexasOfficials() {
  const startTime = Date.now();
  console.log("[OtherTxScrape] Starting fetch from authoritative sources...");
  const sources = {
    executive: { url: "https://www.sos.state.tx.us/elections/voter/elected.shtml", success: false, error: void 0 },
    supremeCourt: { url: "https://www.txcourts.gov/supreme/about-the-court/", success: false, error: void 0 },
    criminalAppeals: { url: "https://www.txcourts.gov/cca/about-the-court/judges/", success: false, error: void 0 }
  };
  const [executive, supremeCourt, criminalAppeals] = await Promise.all([
    scrapeExecutiveOfficials().then((r) => {
      sources.executive.success = true;
      return r;
    }).catch((e) => {
      sources.executive.error = e.message;
      return getStaticExecutiveOfficials();
    }),
    scrapeSupremeCourt().then((r) => {
      sources.supremeCourt.success = true;
      return r;
    }).catch((e) => {
      sources.supremeCourt.error = e.message;
      return getStaticSupremeCourt();
    }),
    scrapeCriminalAppeals().then((r) => {
      sources.criminalAppeals.success = true;
      return r;
    }).catch((e) => {
      sources.criminalAppeals.error = e.message;
      return getStaticCriminalAppeals();
    })
  ]);
  const usSenators = getStaticUSSenators();
  const allOfficials = [...executive, ...supremeCourt, ...criminalAppeals, ...usSenators];
  const sortedForFingerprint = [...allOfficials].sort(
    (a, b) => `${a.category}-${a.roleTitle}-${a.fullName}`.localeCompare(`${b.category}-${b.roleTitle}-${b.fullName}`)
  );
  const fingerprintData = sortedForFingerprint.map((o) => `${o.category}|${o.roleTitle}|${o.fullName}`).join("\n");
  const { createHash: createHash5 } = await import("crypto");
  const fingerprint = createHash5("sha256").update(fingerprintData).digest("hex");
  const duration = Date.now() - startTime;
  console.log(`[OtherTxScrape] Complete: ${allOfficials.length} officials fetched (${duration}ms)`);
  console.log(`[OtherTxScrape] Breakdown: ${executive.length} executive, ${supremeCourt.length} Supreme Court, ${criminalAppeals.length} Criminal Appeals`);
  return {
    officials: allOfficials,
    fingerprint,
    scrapedAt: /* @__PURE__ */ new Date(),
    sources
  };
}
function getAllStaticOfficials() {
  return [
    ...getStaticExecutiveOfficials(),
    ...getStaticSupremeCourt(),
    ...getStaticCriminalAppeals(),
    ...getStaticUSSenators()
  ];
}
var OTHER_TEXAS_OFFICIALS;
var init_otherTexasOfficials = __esm({
  "server/data/otherTexasOfficials.ts"() {
    "use strict";
    OTHER_TEXAS_OFFICIALS = getAllStaticOfficials();
  }
});

// server/lib/identityResolver.ts
var identityResolver_exports = {};
__export(identityResolver_exports, {
  batchResolvePersonIds: () => batchResolvePersonIds,
  generatePersonFingerprint: () => generatePersonFingerprint,
  getAllExplicitPersonLinks: () => getAllExplicitPersonLinks,
  getArchivedPersons: () => getArchivedPersons,
  getExplicitPersonLink: () => getExplicitPersonLink,
  getIdentityStats: () => getIdentityStats,
  getOfficialsByPersonId: () => getOfficialsByPersonId,
  linkOfficialToPerson: () => linkOfficialToPerson,
  normalizeName: () => normalizeName2,
  resolveAllMissingPersonIds: () => resolveAllMissingPersonIds,
  resolvePersonId: () => resolvePersonId,
  setExplicitPersonLink: () => setExplicitPersonLink
});
import { eq as eq4, and as and4, isNull as isNull2, sql as sql6 } from "drizzle-orm";
import { createHash as createHash4 } from "crypto";
async function getExplicitPersonLink(officialPublicId) {
  const link = await db.select({ personId: personLinks.personId }).from(personLinks).where(eq4(personLinks.officialPublicId, officialPublicId)).limit(1);
  return link.length > 0 ? link[0].personId : null;
}
async function setExplicitPersonLink(officialPublicId, personId) {
  const now = /* @__PURE__ */ new Date();
  await db.insert(personLinks).values({
    officialPublicId,
    personId,
    createdAt: now,
    updatedAt: now
  }).onConflictDoUpdate({
    target: personLinks.officialPublicId,
    set: {
      personId,
      updatedAt: now
    }
  });
  await db.update(officialPublic).set({ personId }).where(eq4(officialPublic.id, officialPublicId));
  console.log(`[Identity] Set explicit person link: official ${officialPublicId} -> person ${personId}`);
  return { officialPublicId, personId };
}
async function getAllExplicitPersonLinks() {
  return await db.select({
    officialPublicId: personLinks.officialPublicId,
    personId: personLinks.personId
  }).from(personLinks);
}
function normalizeName2(name) {
  if (!name) return "";
  let normalized = name.toLowerCase().trim();
  const titles = ["dr.", "dr", "hon.", "hon", "mr.", "mr", "mrs.", "mrs", "ms.", "ms", "rep.", "rep", "sen.", "sen"];
  for (const title of titles) {
    if (normalized.startsWith(title + " ")) {
      normalized = normalized.substring(title.length + 1);
    }
  }
  const suffixes = [" jr.", " jr", " sr.", " sr", " iii", " ii", " iv", " md", " ph.d.", " phd", " esq.", " esq"];
  for (const suffix of suffixes) {
    if (normalized.endsWith(suffix)) {
      normalized = normalized.substring(0, normalized.length - suffix.length);
    }
  }
  normalized = normalized.replace(/[.,\-'"()]/g, " ").replace(/\s+/g, " ").trim();
  return normalized;
}
function generatePersonFingerprint(canonicalName) {
  return createHash4("sha256").update(canonicalName).digest("hex").substring(0, 16);
}
async function resolvePersonId(fullName, displayName, officialPublicId) {
  if (officialPublicId) {
    const explicitLink = await getExplicitPersonLink(officialPublicId);
    if (explicitLink) {
      console.log(`[Identity] Using explicit link for official ${officialPublicId} -> person ${explicitLink}`);
      return explicitLink;
    }
  }
  const canonicalName = normalizeName2(fullName);
  const display = displayName || fullName;
  const existing = await db.select().from(persons).where(eq4(persons.fullNameCanonical, canonicalName)).limit(1);
  if (existing.length > 0) {
    return existing[0].id;
  }
  const [newPerson] = await db.insert(persons).values({
    fullNameCanonical: canonicalName,
    fullNameDisplay: display
  }).returning({ id: persons.id });
  console.log(`[Identity] Created new person: ${display} (canonical: ${canonicalName})`);
  return newPerson.id;
}
async function batchResolvePersonIds(officials) {
  const results = /* @__PURE__ */ new Map();
  const canonicalNames = officials.map((o) => normalizeName2(o.fullName));
  const existingPersons = await db.select().from(persons);
  const existingByCanonical = new Map(
    existingPersons.map((p) => [p.fullNameCanonical, p.id])
  );
  const toCreate = [];
  for (let i = 0; i < officials.length; i++) {
    const canonical = canonicalNames[i];
    const display = officials[i].displayName || officials[i].fullName;
    if (existingByCanonical.has(canonical)) {
      results.set(officials[i].fullName, existingByCanonical.get(canonical));
    } else {
      const existing = toCreate.find((p) => p.fullNameCanonical === canonical);
      if (!existing) {
        toCreate.push({
          fullNameCanonical: canonical,
          fullNameDisplay: display
        });
      }
    }
  }
  if (toCreate.length > 0) {
    const created = await db.insert(persons).values(toCreate).returning({ id: persons.id, fullNameCanonical: persons.fullNameCanonical });
    console.log(`[Identity] Created ${created.length} new person records`);
    for (const person of created) {
      for (let i = 0; i < officials.length; i++) {
        if (canonicalNames[i] === person.fullNameCanonical) {
          results.set(officials[i].fullName, person.id);
        }
      }
    }
  }
  return results;
}
async function linkOfficialToPerson(officialId, personId) {
  await db.update(officialPublic).set({ personId }).where(eq4(officialPublic.id, officialId));
}
async function getOfficialsByPersonId(personId) {
  return await db.select().from(officialPublic).where(eq4(officialPublic.personId, personId));
}
async function getIdentityStats() {
  const [totalPersonsResult] = await db.select({ count: sql6`count(*)::int` }).from(persons);
  const [activeOfficialsResult] = await db.select({ count: sql6`count(*)::int` }).from(officialPublic).where(eq4(officialPublic.active, true));
  const [explicitLinksResult] = await db.select({ count: sql6`count(*)::int` }).from(personLinks);
  const archivedPersonsResult = await db.execute(sql6`
    SELECT COUNT(*)::int as count FROM persons p
    WHERE NOT EXISTS (
      SELECT 1 FROM official_public op
      WHERE op.person_id = p.id AND op.active = true
    )
  `);
  return {
    totalPersons: totalPersonsResult.count,
    activeOfficials: activeOfficialsResult.count,
    archivedPersons: Number(archivedPersonsResult.rows[0]?.count || 0),
    explicitLinks: explicitLinksResult.count
  };
}
async function getArchivedPersons() {
  const result = await db.execute(sql6`
    SELECT p.id, p.full_name_display as "fullNameDisplay"
    FROM persons p
    WHERE NOT EXISTS (
      SELECT 1 FROM official_public op
      WHERE op.person_id = p.id AND op.active = true
    )
    ORDER BY p.full_name_display
  `);
  return result.rows;
}
async function resolveAllMissingPersonIds() {
  console.log("[Identity] Resolving missing personIds for active officials...");
  const officialsWithoutPerson = await db.select().from(officialPublic).where(and4(
    eq4(officialPublic.active, true),
    isNull2(officialPublic.personId)
  ));
  if (officialsWithoutPerson.length === 0) {
    console.log("[Identity] All active officials have personIds");
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
    await db.update(officialPublic).set({ personId }).where(eq4(officialPublic.id, official.id));
    resolved++;
    const isNew = await db.select().from(persons).where(eq4(persons.id, personId));
    if (isNew.length > 0) {
      created++;
    }
  }
  console.log(`[Identity] Resolved ${resolved} personIds, created ${created} new person records`);
  return { resolved, created };
}
var init_identityResolver = __esm({
  "server/lib/identityResolver.ts"() {
    "use strict";
    init_db();
    init_schema();
  }
});

// server/jobs/refreshOtherTexasOfficials.ts
var refreshOtherTexasOfficials_exports = {};
__export(refreshOtherTexasOfficials_exports, {
  getOtherTxRefreshState: () => getOtherTxRefreshState,
  refreshOtherTexasOfficials: () => refreshOtherTexasOfficials,
  wasOtherTxCheckedThisWeek: () => wasOtherTxCheckedThisWeek
});
import { eq as eq5, and as and5 } from "drizzle-orm";
async function getStoredFingerprint() {
  const result = await db.select().from(refreshState).where(eq5(refreshState.source, SOURCE_VALUE)).limit(1);
  return result[0]?.fingerprint || null;
}
async function updateStoredFingerprint(fingerprint, changed) {
  const now = /* @__PURE__ */ new Date();
  const existing = await db.select().from(refreshState).where(eq5(refreshState.source, SOURCE_VALUE)).limit(1);
  if (existing.length > 0) {
    await db.update(refreshState).set({
      fingerprint,
      lastCheckedAt: now,
      ...changed ? { lastChangedAt: now } : {}
    }).where(eq5(refreshState.source, SOURCE_VALUE));
  } else {
    await db.insert(refreshState).values({
      source: SOURCE_VALUE,
      fingerprint,
      lastCheckedAt: now,
      lastChangedAt: changed ? now : null
    });
  }
}
async function refreshOtherTexasOfficials(options = {}) {
  const startTime = Date.now();
  console.log("[RefreshOtherTX] Starting refresh...");
  const breakdown = {
    executive: 0,
    secretaryOfState: 0,
    supremeCourt: 0,
    criminalAppeals: 0,
    usSenate: 0
  };
  try {
    const scrapedData = await fetchAllOtherTexasOfficials();
    const { officials, fingerprint, sources } = scrapedData;
    const storedFingerprint = await getStoredFingerprint();
    const fingerprintChanged = storedFingerprint !== fingerprint;
    if (!fingerprintChanged && !options.force) {
      console.log("[RefreshOtherTX] No changes detected (fingerprint match)");
      await updateStoredFingerprint(fingerprint, false);
      const existing = await db.select().from(officialPublic).where(and5(eq5(officialPublic.source, "OTHER_TX"), eq5(officialPublic.active, true)));
      for (const o of existing) {
        if (o.roleTitle?.includes("Supreme Court")) breakdown.supremeCourt++;
        else if (o.roleTitle?.includes("Criminal Appeals")) breakdown.criminalAppeals++;
        else if (o.roleTitle?.includes("Secretary of State")) breakdown.secretaryOfState++;
        else if (o.roleTitle?.includes("United States Senator")) breakdown.usSenate++;
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
        sources
      };
    }
    console.log(`[RefreshOtherTX] Changes detected, processing ${officials.length} officials...`);
    const existingOfficials = await db.select().from(officialPublic).where(eq5(officialPublic.source, "OTHER_TX"));
    const existingBySourceId = new Map(
      existingOfficials.map((o) => [o.sourceMemberId, o])
    );
    const processedSourceIds = /* @__PURE__ */ new Set();
    let upsertedCount = 0;
    for (const official of officials) {
      const sourceMemberId = generateOtherTxSourceMemberId(
        official.roleTitle,
        official.fullName,
        official.category
      );
      processedSourceIds.add(sourceMemberId);
      switch (official.category) {
        case "SUPREME_COURT":
          breakdown.supremeCourt++;
          break;
        case "CRIMINAL_APPEALS":
          breakdown.criminalAppeals++;
          break;
        case "SECRETARY_OF_STATE":
          breakdown.secretaryOfState++;
          break;
        case "EXECUTIVE":
          breakdown.executive++;
          break;
        case "US_SENATE":
          breakdown.usSenate++;
          break;
      }
      const personId = await resolvePersonId(official.fullName);
      const existing = existingBySourceId.get(sourceMemberId);
      if (existing) {
        await db.update(officialPublic).set({
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
          lastRefreshedAt: /* @__PURE__ */ new Date()
        }).where(eq5(officialPublic.id, existing.id));
      } else {
        await db.insert(officialPublic).values({
          personId,
          source: "OTHER_TX",
          sourceMemberId,
          chamber: "STATEWIDE",
          district: "STATEWIDE",
          fullName: official.fullName,
          roleTitle: official.roleTitle,
          party: official.party,
          photoUrl: official.photoUrl,
          capitolAddress: official.capitolAddress,
          capitolPhone: official.capitolPhone,
          website: official.website,
          email: official.email,
          active: true,
          lastRefreshedAt: /* @__PURE__ */ new Date()
        });
      }
      upsertedCount++;
    }
    let deactivatedCount = 0;
    for (const [sourceMemberId, existing] of existingBySourceId) {
      if (!processedSourceIds.has(sourceMemberId) && existing.active) {
        await db.update(officialPublic).set({ active: false }).where(eq5(officialPublic.id, existing.id));
        deactivatedCount++;
        console.log(`[RefreshOtherTX] Deactivated: ${existing.fullName} (${existing.roleTitle})`);
      }
    }
    await updateStoredFingerprint(fingerprint, true);
    const duration = Date.now() - startTime;
    console.log(
      `[RefreshOtherTX] Complete: ${upsertedCount} upserted, ${deactivatedCount} deactivated (${duration}ms)`
    );
    console.log(
      `[RefreshOtherTX] Breakdown: ${breakdown.executive} executive, ${breakdown.secretaryOfState} SoS, ${breakdown.supremeCourt} Supreme Court, ${breakdown.criminalAppeals} Criminal Appeals`
    );
    return {
      success: true,
      fingerprint,
      changed: true,
      upsertedCount,
      deactivatedCount,
      totalOfficials: officials.length,
      breakdown,
      sources
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[RefreshOtherTX] Error:", message);
    return {
      success: false,
      fingerprint: "",
      changed: false,
      upsertedCount: 0,
      deactivatedCount: 0,
      totalOfficials: 0,
      breakdown,
      sources: {
        executive: { success: false, error: message },
        supremeCourt: { success: false, error: message },
        criminalAppeals: { success: false, error: message }
      },
      error: message
    };
  }
}
async function wasOtherTxCheckedThisWeek() {
  const result = await db.select().from(refreshState).where(eq5(refreshState.source, SOURCE_VALUE)).limit(1);
  if (!result[0]?.lastCheckedAt) return false;
  const lastChecked = new Date(result[0].lastCheckedAt);
  const now = /* @__PURE__ */ new Date();
  const daysSinceCheck = (now.getTime() - lastChecked.getTime()) / (1e3 * 60 * 60 * 24);
  return daysSinceCheck < 7;
}
async function getOtherTxRefreshState() {
  const result = await db.select().from(refreshState).where(eq5(refreshState.source, SOURCE_VALUE)).limit(1);
  if (!result[0]) {
    return {
      lastCheckedAt: null,
      lastChangedAt: null,
      fingerprint: null
    };
  }
  return {
    lastCheckedAt: result[0].lastCheckedAt,
    lastChangedAt: result[0].lastChangedAt,
    fingerprint: result[0].fingerprint
  };
}
var SOURCE_VALUE;
var init_refreshOtherTexasOfficials = __esm({
  "server/jobs/refreshOtherTexasOfficials.ts"() {
    "use strict";
    init_db();
    init_schema();
    init_otherTexasOfficials();
    init_identityResolver();
    SOURCE_VALUE = "OTHER_TX";
  }
});

// server/lib/backfillUtils.ts
var backfillUtils_exports = {};
__export(backfillUtils_exports, {
  isEffectivelyEmpty: () => isEffectivelyEmpty,
  normalizeAddress: () => normalizeAddress
});
function isEffectivelyEmpty(value) {
  if (!value) return true;
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  if (EMPTY_PLACEHOLDERS.includes(trimmed.toLowerCase())) return true;
  return false;
}
function normalizeAddress(value) {
  if (isEffectivelyEmpty(value)) return null;
  return value.trim();
}
var EMPTY_PLACEHOLDERS;
var init_backfillUtils = __esm({
  "server/lib/backfillUtils.ts"() {
    "use strict";
    EMPTY_PLACEHOLDERS = [
      "n/a",
      "na",
      "unknown",
      "tbd",
      "not available",
      "none",
      "\u2014",
      "-",
      ".",
      "pending"
    ];
  }
});

// server/scripts/bulkFillHometowns.ts
var bulkFillHometowns_exports = {};
__export(bulkFillHometowns_exports, {
  bulkFillHometowns: () => bulkFillHometowns
});
import { eq as eq6 } from "drizzle-orm";
async function delay(ms) {
  return new Promise((resolve3) => setTimeout(resolve3, ms));
}
async function bulkFillHometowns() {
  console.log("[BulkFill] Starting bulk hometown fill...");
  const result = {
    total: 0,
    filled: 0,
    skipped: 0,
    notFound: 0,
    errors: 0,
    details: []
  };
  const officials = await db.select({
    id: officialPublic.id,
    fullName: officialPublic.fullName,
    personId: officialPublic.personId,
    source: officialPublic.source,
    active: officialPublic.active
  }).from(officialPublic).where(eq6(officialPublic.active, true));
  result.total = officials.length;
  console.log(`[BulkFill] Found ${officials.length} active officials`);
  for (let i = 0; i < officials.length; i++) {
    const official = officials[i];
    console.log(`[BulkFill] Processing ${i + 1}/${officials.length}: ${official.fullName}`);
    try {
      let existingPrivate = null;
      if (official.personId) {
        const records = await db.select().from(officialPrivate).where(eq6(officialPrivate.personId, official.personId));
        existingPrivate = records[0] || null;
      }
      if (!existingPrivate) {
        const records = await db.select().from(officialPrivate).where(eq6(officialPrivate.officialPublicId, official.id));
        existingPrivate = records[0] || null;
      }
      const { isEffectivelyEmpty: isEffectivelyEmpty2 } = await Promise.resolve().then(() => (init_backfillUtils(), backfillUtils_exports));
      if (!isEffectivelyEmpty2(existingPrivate?.personalAddress)) {
        console.log(`[BulkFill] Skipping ${official.fullName} - already has personalAddress`);
        result.skipped++;
        result.details.push({
          name: official.fullName,
          status: "skipped",
          reason: "Already has personalAddress"
        });
        continue;
      }
      await delay(500);
      const lookup = await lookupHometownFromTexasTribune(official.fullName);
      if (!lookup.success || !lookup.hometown) {
        console.log(`[BulkFill] No hometown found for ${official.fullName}`);
        result.notFound++;
        result.details.push({
          name: official.fullName,
          status: "not_found",
          reason: "Not found in Texas Tribune directory"
        });
        continue;
      }
      if (existingPrivate) {
        await db.update(officialPrivate).set({
          personalAddress: lookup.hometown,
          addressSource: "tribune",
          updatedAt: /* @__PURE__ */ new Date()
        }).where(eq6(officialPrivate.id, existingPrivate.id));
        console.log(`[BulkFill] Updated ${official.fullName} with hometown: ${lookup.hometown}`);
      } else {
        await db.insert(officialPrivate).values({
          personId: official.personId,
          officialPublicId: official.id,
          personalAddress: lookup.hometown,
          addressSource: "tribune"
        });
        console.log(`[BulkFill] Created new record for ${official.fullName} with hometown: ${lookup.hometown}`);
      }
      result.filled++;
      result.details.push({
        name: official.fullName,
        status: "filled",
        hometown: lookup.hometown
      });
    } catch (error) {
      console.error(`[BulkFill] Error processing ${official.fullName}:`, error);
      result.errors++;
      result.details.push({
        name: official.fullName,
        status: "error",
        reason: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }
  console.log(`[BulkFill] Complete! Filled: ${result.filled}, Skipped: ${result.skipped}, Not Found: ${result.notFound}, Errors: ${result.errors}`);
  return result;
}
var init_bulkFillHometowns = __esm({
  "server/scripts/bulkFillHometowns.ts"() {
    "use strict";
    init_db();
    init_schema();
    init_texasTribuneLookup();
    if (typeof __require !== "undefined" && __require.main === module) {
      bulkFillHometowns().then((result) => {
        console.log("\n=== BULK FILL SUMMARY ===");
        console.log(`Total officials: ${result.total}`);
        console.log(`Filled: ${result.filled}`);
        console.log(`Skipped (already had address): ${result.skipped}`);
        console.log(`Not found in Tribune: ${result.notFound}`);
        console.log(`Errors: ${result.errors}`);
        process.exit(0);
      }).catch((err) => {
        console.error("Bulk fill failed:", err);
        process.exit(1);
      });
    }
  }
});

// server/index.ts
import express from "express";

// server/routes.ts
import { createServer } from "node:http";

// server/data/geojson.ts
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
function findGeoJSONPath(filename) {
  const possiblePaths = [
    path.join(__dirname, "geojson", filename),
    path.join(process.cwd(), "server", "data", "geojson", filename),
    path.join(process.cwd(), "data", "geojson", filename),
    path.resolve("server", "data", "geojson", filename)
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}
function loadGeoJSON(filename) {
  try {
    const filePath = findGeoJSONPath(filename);
    if (!filePath) {
      console.error(`[GeoJSON] File not found: ${filename}`);
      console.log(`[GeoJSON] __dirname is: ${__dirname}`);
      console.log(`[GeoJSON] process.cwd() is: ${process.cwd()}`);
      const checkDir = path.join(__dirname, "geojson");
      if (fs.existsSync(checkDir)) {
        console.log(`[GeoJSON] Contents of ${checkDir}:`, fs.readdirSync(checkDir));
      } else {
        console.log(`[GeoJSON] Directory does not exist: ${checkDir}`);
        if (fs.existsSync(__dirname)) {
          console.log(`[GeoJSON] Contents of __dirname:`, fs.readdirSync(__dirname));
        }
      }
      return { type: "FeatureCollection", features: [] };
    }
    console.log(`[GeoJSON] Loading ${filename} from: ${filePath}`);
    const data = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(data);
    console.log(`[GeoJSON] Successfully loaded ${filename}: ${parsed.features.length} features`);
    return parsed;
  } catch (error) {
    console.error(`[GeoJSON] Error loading ${filename}:`, error);
    return { type: "FeatureCollection", features: [] };
  }
}
var txSenateGeoJSON = loadGeoJSON("tx_senate_simplified.geojson");
var txHouseGeoJSON = loadGeoJSON("tx_house_simplified.geojson");
var usCongressGeoJSON = loadGeoJSON("us_congress_simplified.geojson");
var txSenateGeoJSONFull = loadGeoJSON("tx_senate.geojson");
var txHouseGeoJSONFull = loadGeoJSON("tx_house.geojson");
var usCongressGeoJSONFull = loadGeoJSON("us_congress.geojson");

// server/routes.ts
init_db();

// server/routes/prayerRoutes.ts
init_db();
init_schema();
import { eq, and, sql as sql2, or, ilike, inArray, desc, asc, isNull, lte, gte } from "drizzle-orm";
function getTodayDateKey() {
  const now = /* @__PURE__ */ new Date();
  const chicagoStr = now.toLocaleString("en-US", { timeZone: "America/Chicago" });
  const chicagoDate = new Date(chicagoStr);
  const y = chicagoDate.getFullYear();
  const m = String(chicagoDate.getMonth() + 1).padStart(2, "0");
  const d = String(chicagoDate.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function getYesterdayDateKey() {
  const now = /* @__PURE__ */ new Date();
  const chicagoStr = now.toLocaleString("en-US", { timeZone: "America/Chicago" });
  const chicagoDate = new Date(chicagoStr);
  chicagoDate.setDate(chicagoDate.getDate() - 1);
  const y = chicagoDate.getFullYear();
  const m = String(chicagoDate.getMonth() + 1).padStart(2, "0");
  const d = String(chicagoDate.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function getDateKeyNDaysAgo(n) {
  const now = /* @__PURE__ */ new Date();
  const chicagoStr = now.toLocaleString("en-US", { timeZone: "America/Chicago" });
  const chicagoDate = new Date(chicagoStr);
  chicagoDate.setDate(chicagoDate.getDate() - n);
  const y = chicagoDate.getFullYear();
  const m = String(chicagoDate.getMonth() + 1).padStart(2, "0");
  const d = String(chicagoDate.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
async function getAutoArchiveEnabled() {
  const row = await db.select().from(appSettings).where(eq(appSettings.key, "autoArchiveEnabled")).limit(1);
  if (row.length > 0) return row[0].value === "true";
  return true;
}
async function getAutoArchiveDays() {
  const row = await db.select().from(appSettings).where(eq(appSettings.key, "autoArchiveDays")).limit(1);
  if (row.length > 0) return parseInt(row[0].value, 10) || 90;
  return 90;
}
async function autoArchiveAnswered() {
  const enabled = await getAutoArchiveEnabled();
  if (!enabled) return;
  const days = await getAutoArchiveDays();
  const cutoff = /* @__PURE__ */ new Date();
  cutoff.setDate(cutoff.getDate() - days);
  await db.update(prayers).set({ status: "ARCHIVED", archivedAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() }).where(and(
    eq(prayers.status, "ANSWERED"),
    lte(prayers.answeredAt, cutoff)
  ));
}
async function ensureStreakRow() {
  const rows = await db.select().from(prayerStreak).limit(1);
  if (rows.length === 0) {
    await db.insert(prayerStreak).values({
      currentStreak: 0,
      longestStreak: 0,
      lastCompletedDateKey: null
    });
  }
}
function registerPrayerRoutes(app2) {
  app2.get("/api/prayer-categories", async (_req, res) => {
    try {
      const cats = await db.select().from(prayerCategories).orderBy(asc(prayerCategories.sortOrder), asc(prayerCategories.name));
      res.json(cats);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app2.post("/api/prayer-categories", async (req, res) => {
    try {
      const { name, sortOrder } = req.body;
      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ error: "Category name is required" });
      }
      const existing = await db.select().from(prayerCategories).where(sql2`LOWER(${prayerCategories.name}) = LOWER(${name.trim()})`);
      if (existing.length > 0) {
        return res.status(409).json({ error: "A category with this name already exists" });
      }
      const [cat] = await db.insert(prayerCategories).values({
        name: name.trim(),
        sortOrder: sortOrder ?? 0
      }).returning();
      res.status(201).json(cat);
    } catch (err) {
      if (err.message?.includes("unique")) {
        return res.status(409).json({ error: "A category with this name already exists" });
      }
      res.status(500).json({ error: err.message });
    }
  });
  app2.patch("/api/prayer-categories/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = { updatedAt: /* @__PURE__ */ new Date() };
      if (req.body.name !== void 0) updates.name = req.body.name.trim();
      if (req.body.sortOrder !== void 0) updates.sortOrder = req.body.sortOrder;
      const [cat] = await db.update(prayerCategories).set(updates).where(eq(prayerCategories.id, id)).returning();
      if (!cat) return res.status(404).json({ error: "Category not found" });
      res.json(cat);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app2.delete("/api/prayer-categories/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await db.update(prayers).set({ categoryId: null, updatedAt: /* @__PURE__ */ new Date() }).where(eq(prayers.categoryId, id));
      const [cat] = await db.delete(prayerCategories).where(eq(prayerCategories.id, id)).returning();
      if (!cat) return res.status(404).json({ error: "Category not found" });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app2.get("/api/prayers", async (req, res) => {
    try {
      autoArchiveAnswered().catch(() => {
      });
      const { status, categoryId, officialId, q, limit: lim, offset: off, sort } = req.query;
      const conditions = [];
      if (status && status !== "ALL") {
        conditions.push(eq(prayers.status, status));
      }
      if (categoryId === "uncategorized") {
        conditions.push(isNull(prayers.categoryId));
      } else if (categoryId) {
        conditions.push(eq(prayers.categoryId, categoryId));
      }
      if (q && typeof q === "string" && q.trim()) {
        const search = `%${q.trim()}%`;
        conditions.push(or(ilike(prayers.title, search), ilike(prayers.body, search)));
      }
      if (officialId && typeof officialId === "string") {
        conditions.push(sql2`${prayers.officialIds}::jsonb @> ${JSON.stringify([officialId])}::jsonb`);
      }
      const orderBy = sort === "needsAttention" ? [asc(prayers.lastPrayedAt), desc(prayers.priority), desc(prayers.createdAt)] : [desc(prayers.createdAt)];
      let query = db.select().from(prayers).where(conditions.length > 0 ? and(...conditions) : void 0).orderBy(...orderBy);
      const limitVal = Math.min(parseInt(lim) || 50, 200);
      const offsetVal = parseInt(off) || 0;
      const results = await query.limit(limitVal).offset(offsetVal);
      res.json(results);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app2.post("/api/prayers", async (req, res) => {
    try {
      const parsed = insertPrayerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues });
      }
      const { title, body, categoryId, officialIds, pinnedDaily, priority } = parsed.data;
      const [prayer] = await db.insert(prayers).values({
        title,
        body,
        categoryId: categoryId ?? null,
        officialIds: officialIds ?? [],
        pinnedDaily: pinnedDaily ?? false,
        priority: priority ?? 0
      }).returning();
      res.status(201).json(prayer);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app2.get("/api/prayers/export", async (req, res) => {
    try {
      await autoArchiveAnswered();
      const { status, dateFrom, dateTo, includeBody } = req.query;
      const conditions = [];
      if (status && status !== "ALL") {
        conditions.push(eq(prayers.status, status));
      }
      if (dateFrom && typeof dateFrom === "string") {
        const from = /* @__PURE__ */ new Date(dateFrom + "T00:00:00.000Z");
        if (!isNaN(from.getTime())) {
          conditions.push(gte(prayers.createdAt, from));
        }
      }
      if (dateTo && typeof dateTo === "string") {
        const to = /* @__PURE__ */ new Date(dateTo + "T23:59:59.999Z");
        if (!isNaN(to.getTime())) {
          conditions.push(lte(prayers.createdAt, to));
        }
      }
      const allPrayers = await db.select().from(prayers).where(conditions.length > 0 ? and(...conditions) : void 0).orderBy(desc(prayers.createdAt));
      const cats = await db.select().from(prayerCategories);
      const catMap = new Map(cats.map((c) => [c.id, c.name]));
      const showBody = includeBody !== "false";
      const headerCols = ["title"];
      if (showBody) headerCols.push("body");
      headerCols.push("status", "categoryName", "createdAt", "answeredAt", "archivedAt", "answerNote", "officialIds");
      const header = headerCols.join(",");
      const csvEscape = (s) => {
        if (s == null) return "";
        const str = String(s).replace(/"/g, '""');
        return str.includes(",") || str.includes('"') || str.includes("\n") ? `"${str}"` : str;
      };
      const rows = allPrayers.map((p) => {
        const cols = [csvEscape(p.title)];
        if (showBody) cols.push(csvEscape(p.body));
        cols.push(
          p.status,
          csvEscape(catMap.get(p.categoryId ?? "") ?? ""),
          p.createdAt?.toISOString() ?? "",
          p.answeredAt?.toISOString() ?? "",
          p.archivedAt?.toISOString() ?? "",
          csvEscape(p.answerNote),
          csvEscape((p.officialIds || []).join(";"))
        );
        return cols.join(",");
      });
      const csv = [header, ...rows].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=prayers-export.csv");
      res.send(csv);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app2.get("/api/prayers/needs-attention", async (req, res) => {
    try {
      const fourteenDaysAgo = /* @__PURE__ */ new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
      const allOpen = await db.select().from(prayers).where(eq(prayers.status, "OPEN"));
      const needsAttention = allOpen.filter(
        (p) => p.lastPrayedAt === null || p.lastPrayedAt < fourteenDaysAgo
      );
      const sorted = needsAttention.sort((a, b) => {
        const aTime = a.lastPrayedAt?.getTime() ?? 0;
        const bTime = b.lastPrayedAt?.getTime() ?? 0;
        if (aTime !== bTime) return aTime - bTime;
        return (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0);
      });
      const result = sorted.slice(0, 5);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app2.get("/api/prayers/recently-answered", async (req, res) => {
    try {
      const result = await db.select().from(prayers).where(eq(prayers.status, "ANSWERED")).orderBy(desc(prayers.answeredAt)).limit(5);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app2.get("/api/prayers/:id", async (req, res) => {
    try {
      const [prayer] = await db.select().from(prayers).where(eq(prayers.id, req.params.id)).limit(1);
      if (!prayer) return res.status(404).json({ error: "Prayer not found" });
      res.json(prayer);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app2.patch("/api/prayers/:id", async (req, res) => {
    try {
      const parsed = updatePrayerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues });
      }
      const updates = { ...parsed.data, updatedAt: /* @__PURE__ */ new Date() };
      if (updates.lastPrayedAt && typeof updates.lastPrayedAt === "string") {
        updates.lastPrayedAt = new Date(updates.lastPrayedAt);
      }
      const [prayer] = await db.update(prayers).set(updates).where(eq(prayers.id, req.params.id)).returning();
      if (!prayer) return res.status(404).json({ error: "Prayer not found" });
      res.json(prayer);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app2.delete("/api/prayers/:id", async (req, res) => {
    try {
      const [prayer] = await db.delete(prayers).where(eq(prayers.id, req.params.id)).returning();
      if (!prayer) return res.status(404).json({ error: "Prayer not found" });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app2.post("/api/prayers/:id/answer", async (req, res) => {
    try {
      const { answerNote } = req.body || {};
      const [prayer] = await db.update(prayers).set({
        status: "ANSWERED",
        answeredAt: /* @__PURE__ */ new Date(),
        answerNote: answerNote ?? null,
        archivedAt: null,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq(prayers.id, req.params.id)).returning();
      if (!prayer) return res.status(404).json({ error: "Prayer not found" });
      res.json(prayer);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app2.post("/api/prayers/:id/reopen", async (req, res) => {
    try {
      const [prayer] = await db.update(prayers).set({
        status: "OPEN",
        answeredAt: null,
        archivedAt: null,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq(prayers.id, req.params.id)).returning();
      if (!prayer) return res.status(404).json({ error: "Prayer not found" });
      res.json(prayer);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app2.post("/api/prayers/:id/archive", async (req, res) => {
    try {
      const [prayer] = await db.update(prayers).set({
        status: "ARCHIVED",
        archivedAt: /* @__PURE__ */ new Date(),
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq(prayers.id, req.params.id)).returning();
      if (!prayer) return res.status(404).json({ error: "Prayer not found" });
      res.json(prayer);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app2.post("/api/prayers/:id/unarchive", async (req, res) => {
    try {
      const [prayer] = await db.update(prayers).set({
        status: "OPEN",
        archivedAt: null,
        answeredAt: null,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq(prayers.id, req.params.id)).returning();
      if (!prayer) return res.status(404).json({ error: "Prayer not found" });
      res.json(prayer);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app2.post("/api/prayers/bulk", async (req, res) => {
    try {
      const { action, prayerIds, answerNote } = req.body;
      if (!action || !Array.isArray(prayerIds) || prayerIds.length === 0) {
        return res.status(400).json({ error: "action and prayerIds[] required" });
      }
      const validActions = ["answer", "archive", "reopen", "unarchive"];
      if (!validActions.includes(action)) {
        return res.status(400).json({ error: `Invalid action. Must be one of: ${validActions.join(", ")}` });
      }
      const now = /* @__PURE__ */ new Date();
      let updates;
      switch (action) {
        case "answer":
          updates = { status: "ANSWERED", answeredAt: now, answerNote: answerNote ?? null, archivedAt: null, updatedAt: now };
          break;
        case "archive":
          updates = { status: "ARCHIVED", archivedAt: now, updatedAt: now };
          break;
        case "reopen":
          updates = { status: "OPEN", answeredAt: null, archivedAt: null, updatedAt: now };
          break;
        case "unarchive":
          updates = { status: "OPEN", archivedAt: null, answeredAt: null, updatedAt: now };
          break;
      }
      const result = await db.update(prayers).set(updates).where(inArray(prayers.id, prayerIds)).returning();
      res.json({ updated: result.length, prayers: result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app2.get("/api/daily-prayer-picks", async (req, res) => {
    try {
      const todayKey = getTodayDateKey();
      const forceRegenerate = req.query.forceRegenerate === "true";
      if (forceRegenerate) {
        await db.delete(dailyPrayerPicks).where(eq(dailyPrayerPicks.dateKey, todayKey));
      }
      if (!forceRegenerate) {
        const existing = await db.select().from(dailyPrayerPicks).where(eq(dailyPrayerPicks.dateKey, todayKey)).limit(1);
        if (existing.length > 0) {
          const ids = existing[0].prayerIds;
          const prayerList = ids.length > 0 ? await db.select().from(prayers).where(inArray(prayers.id, ids)) : [];
          const ordered = ids.map((id) => prayerList.find((p) => p.id === id)).filter(Boolean);
          return res.json({ dateKey: todayKey, prayers: ordered, generatedAt: existing[0].generatedAt });
        }
      }
      const yesterdayKey = getDateKeyNDaysAgo(1);
      const twoDaysAgoKey = getDateKeyNDaysAgo(2);
      const recentPickRows = await db.select().from(dailyPrayerPicks).where(inArray(dailyPrayerPicks.dateKey, [yesterdayKey, twoDaysAgoKey]));
      const yesterdayIds = [];
      const twoDaysAgoIds = [];
      for (const row of recentPickRows) {
        if (row.dateKey === yesterdayKey) yesterdayIds.push(...row.prayerIds);
        if (row.dateKey === twoDaysAgoKey) twoDaysAgoIds.push(...row.prayerIds);
      }
      const recentIds = /* @__PURE__ */ new Set([...yesterdayIds, ...twoDaysAgoIds]);
      const openPrayers = await db.select().from(prayers).where(eq(prayers.status, "OPEN")).orderBy(asc(prayers.lastShownAt));
      const picks = [];
      const pinned = openPrayers.filter((p) => p.pinnedDaily);
      const pinnedSorted = pinned.sort((a, b) => {
        const aTime = a.lastShownAt?.getTime() ?? 0;
        const bTime = b.lastShownAt?.getTime() ?? 0;
        return aTime - bTime;
      });
      for (const p of pinnedSorted) {
        if (picks.length >= 3) break;
        picks.push(p);
      }
      if (picks.length < 3) {
        const pickedIds = new Set(picks.map((p) => p.id));
        const strictEligible = openPrayers.filter((p) => !pickedIds.has(p.id) && !recentIds.has(p.id));
        const yesterdayOnlyEligible = openPrayers.filter(
          (p) => !pickedIds.has(p.id) && !yesterdayIds.includes(p.id)
        );
        const allEligible = openPrayers.filter((p) => !pickedIds.has(p.id));
        let pool2;
        const needed = 3 - picks.length;
        if (strictEligible.length >= needed) {
          pool2 = strictEligible;
        } else if (yesterdayOnlyEligible.length >= needed) {
          pool2 = yesterdayOnlyEligible;
        } else {
          pool2 = allEligible;
        }
        if (pool2.length > 0) {
          const weighted = pool2.map((p) => {
            let weight = 1;
            if (p.lastShownAt === null) weight += 5;
            else {
              const daysSince = (Date.now() - p.lastShownAt.getTime()) / (1e3 * 60 * 60 * 24);
              weight += Math.min(daysSince, 10);
            }
            if (p.priority === 1) weight *= 2;
            if (recentIds.has(p.id)) weight *= 0.3;
            weight += Math.random() * 2;
            return { prayer: p, weight };
          });
          weighted.sort((a, b) => b.weight - a.weight);
          for (const w of weighted) {
            if (picks.length >= 3) break;
            picks.push(w.prayer);
          }
        }
      }
      const pickIds = picks.map((p) => p.id);
      if (pickIds.length > 0) {
        await db.update(prayers).set({ lastShownAt: /* @__PURE__ */ new Date() }).where(inArray(prayers.id, pickIds));
      }
      await db.insert(dailyPrayerPicks).values({
        dateKey: todayKey,
        prayerIds: pickIds
      }).onConflictDoNothing();
      res.json({ dateKey: todayKey, prayers: picks, generatedAt: /* @__PURE__ */ new Date() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app2.get("/api/prayer-streak", async (req, res) => {
    try {
      await ensureStreakRow();
      const [streak] = await db.select().from(prayerStreak).limit(1);
      res.json(streak);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app2.post("/api/prayer-streak/complete-today", async (req, res) => {
    try {
      await ensureStreakRow();
      const todayKey = getTodayDateKey();
      const yesterdayKey = getYesterdayDateKey();
      const [streak] = await db.select().from(prayerStreak).limit(1);
      if (streak.lastCompletedDateKey === todayKey) {
        return res.json(streak);
      }
      let newStreak;
      if (streak.lastCompletedDateKey === yesterdayKey) {
        newStreak = streak.currentStreak + 1;
      } else {
        newStreak = 1;
      }
      const newLongest = Math.max(streak.longestStreak, newStreak);
      const [updated] = await db.update(prayerStreak).set({
        currentStreak: newStreak,
        lastCompletedDateKey: todayKey,
        longestStreak: newLongest
      }).where(eq(prayerStreak.id, streak.id)).returning();
      try {
        const todayPicks = await db.select().from(dailyPrayerPicks).where(eq(dailyPrayerPicks.dateKey, todayKey)).limit(1);
        if (todayPicks.length > 0) {
          const pickIds = todayPicks[0].prayerIds;
          if (pickIds.length > 0) {
            const todayStart = /* @__PURE__ */ new Date();
            todayStart.setHours(0, 0, 0, 0);
            await db.update(prayers).set({ lastPrayedAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() }).where(and(
              inArray(prayers.id, pickIds),
              or(
                isNull(prayers.lastPrayedAt),
                lte(prayers.lastPrayedAt, todayStart)
              )
            ));
          }
        }
      } catch (_) {
      }
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app2.get("/api/settings/auto-archive", async (_req, res) => {
    try {
      const rows = await db.select().from(appSettings).where(inArray(appSettings.key, ["autoArchiveEnabled", "autoArchiveDays"]));
      let enabled = true;
      let days = 90;
      for (const row of rows) {
        if (row.key === "autoArchiveEnabled") enabled = row.value === "true";
        if (row.key === "autoArchiveDays") days = parseInt(row.value, 10) || 90;
      }
      res.json({ enabled, days });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app2.put("/api/settings/auto-archive", async (req, res) => {
    try {
      const { enabled, days } = req.body;
      const now = /* @__PURE__ */ new Date();
      await db.insert(appSettings).values({
        key: "autoArchiveEnabled",
        value: String(enabled ?? true),
        updatedAt: now
      }).onConflictDoUpdate({
        target: appSettings.key,
        set: { value: String(enabled ?? true), updatedAt: now }
      });
      await db.insert(appSettings).values({
        key: "autoArchiveDays",
        value: String(days ?? 90),
        updatedAt: now
      }).onConflictDoUpdate({
        target: appSettings.key,
        set: { value: String(days ?? 90), updatedAt: now }
      });
      res.json({ enabled: enabled ?? true, days: days ?? 90 });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app2.get("/api/officials/:id/prayer-counts", async (req, res) => {
    try {
      const { id: officialId } = req.params;
      const allPrayers = await db.select().from(prayers);
      let open = 0;
      let answered = 0;
      let archived = 0;
      for (const prayer of allPrayers) {
        const officialIds = prayer.officialIds;
        if (!officialIds || !officialIds.includes(officialId)) continue;
        switch (prayer.status) {
          case "OPEN":
            open++;
            break;
          case "ANSWERED":
            answered++;
            break;
          case "ARCHIVED":
            archived++;
            break;
        }
      }
      res.json({ open, answered, archived });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

// server/routes.ts
init_schema();
init_refreshOfficials();
import { desc as desc2 } from "drizzle-orm";
import { eq as eq7, and as and6, sql as sql7, or as or3, inArray as inArray2, isNull as isNull4 } from "drizzle-orm";
import * as turf from "@turf/turf";
import booleanIntersects from "@turf/boolean-intersects";

// server/jobs/scheduler.ts
init_refreshOfficials();

// server/jobs/refreshGeoJSON.ts
init_db();
import * as crypto2 from "crypto";
import * as fs2 from "node:fs";
import * as path2 from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
import { sql as sql4 } from "drizzle-orm";
var __filename2 = fileURLToPath2(import.meta.url);
var __dirname2 = path2.dirname(__filename2);
var GEOJSON_SOURCES = {
  TX_HOUSE_GEOJSON_V2: {
    url: "https://services.arcgis.com/KTcxiTD9dsQw4r7Z/ArcGIS/rest/services/Texas_State_House_Districts/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson",
    localFile: "tx_house.geojson",
    simplifiedFile: "tx_house_simplified.geojson"
  },
  TX_SENATE_GEOJSON_V2: {
    url: "https://services.arcgis.com/KTcxiTD9dsQw4r7Z/ArcGIS/rest/services/Texas_State_Senate_Districts/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson",
    localFile: "tx_senate.geojson",
    simplifiedFile: "tx_senate_simplified.geojson"
  },
  US_HOUSE_TX_GEOJSON_V2: {
    url: "https://services.arcgis.com/KTcxiTD9dsQw4r7Z/ArcGIS/rest/services/Texas_US_House_Districts/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson",
    localFile: "us_congress.geojson",
    simplifiedFile: "us_congress_simplified.geojson"
  }
};
var GEOJSON_DIR = path2.join(__dirname2, "..", "data", "geojson");
async function ensureGeoJSONRefreshTable() {
  await db.execute(sql4`
    CREATE TABLE IF NOT EXISTS geojson_refresh_state (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      source VARCHAR NOT NULL UNIQUE,
      fingerprint TEXT,
      last_checked_at TIMESTAMP,
      last_changed_at TIMESTAMP,
      last_refreshed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    )
  `);
}
function computeFingerprint2(data) {
  return crypto2.createHash("sha256").update(data).digest("hex");
}
async function fetchWithRetry2(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "TexasDistrictsApp/1.0 (GeoJSON Sync)",
          "Accept": "application/json"
        }
      });
      if (response.ok) return response;
      if (response.status === 429) {
        await new Promise((r) => setTimeout(r, 2e3 * (i + 1)));
        continue;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, 1e3 * (i + 1)));
    }
  }
  throw new Error("Max retries exceeded");
}
async function getGeoJSONRefreshState(source) {
  await ensureGeoJSONRefreshTable();
  const result = await db.execute(
    sql4`SELECT * FROM geojson_refresh_state WHERE source = ${source} LIMIT 1`
  );
  if (!result.rows || result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    fingerprint: row.fingerprint,
    lastCheckedAt: row.last_checked_at,
    lastChangedAt: row.last_changed_at
  };
}
async function updateGeoJSONRefreshState(source, fingerprint, changed) {
  await ensureGeoJSONRefreshTable();
  const now = /* @__PURE__ */ new Date();
  const existing = await db.execute(
    sql4`SELECT * FROM geojson_refresh_state WHERE source = ${source} LIMIT 1`
  );
  if (existing.rows && existing.rows.length > 0) {
    const row = existing.rows[0];
    await db.execute(sql4`
      UPDATE geojson_refresh_state SET
        fingerprint = ${fingerprint},
        last_checked_at = ${now},
        last_changed_at = ${changed ? now : row.last_changed_at},
        last_refreshed_at = ${changed ? now : row.last_refreshed_at},
        updated_at = ${now}
      WHERE id = ${row.id}
    `);
  } else {
    await db.execute(sql4`
      INSERT INTO geojson_refresh_state (source, fingerprint, last_checked_at, last_changed_at, last_refreshed_at)
      VALUES (${source}, ${fingerprint}, ${now}, ${changed ? now : null}, ${changed ? now : null})
    `);
  }
}
async function markGeoJSONCheckedOnly(source) {
  await ensureGeoJSONRefreshTable();
  const now = /* @__PURE__ */ new Date();
  const existing = await db.execute(
    sql4`SELECT * FROM geojson_refresh_state WHERE source = ${source} LIMIT 1`
  );
  if (existing.rows && existing.rows.length > 0) {
    await db.execute(sql4`
      UPDATE geojson_refresh_state SET
        last_checked_at = ${now},
        updated_at = ${now}
      WHERE source = ${source}
    `);
  } else {
    await db.execute(sql4`
      INSERT INTO geojson_refresh_state (source, last_checked_at)
      VALUES (${source}, ${now})
    `);
  }
}
var EXPECTED_COUNTS = {
  TX_HOUSE_GEOJSON_V2: 150,
  TX_SENATE_GEOJSON_V2: 31,
  US_HOUSE_TX_GEOJSON_V2: 38
};
function extractDistrictNumber(props, _source) {
  const value = props.DIST_NBR ?? props.district;
  if (value === void 0 || value === null) return null;
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}
function normalizeGeoJSON(raw, source) {
  const sampleProps = raw.features[0]?.properties;
  const samplePropertyKeys = sampleProps ? Object.keys(sampleProps) : [];
  const features = [];
  const districtsSeen = /* @__PURE__ */ new Set();
  let fallbackCount = 0;
  for (let idx = 0; idx < raw.features.length; idx++) {
    const feature = raw.features[idx];
    const props = feature.properties || {};
    const district = extractDistrictNumber(props, source);
    if (district === null) {
      fallbackCount++;
      console.error(`[RefreshGeoJSON] ${source}: Feature ${idx} has no valid district number. Props: ${JSON.stringify(Object.keys(props))}`);
      continue;
    }
    if (districtsSeen.has(district)) {
      console.warn(`[RefreshGeoJSON] ${source}: Duplicate district ${district} at feature ${idx}`);
    }
    districtsSeen.add(district);
    let name;
    if (source === "TX_HOUSE_GEOJSON_V2") {
      name = String(props.REP_NM || props.name || `TX House District ${district}`);
    } else if (source === "TX_SENATE_GEOJSON_V2") {
      name = String(props.REP_NM || props.name || `TX Senate District ${district}`);
    } else {
      name = String(props.REP_NM || props.name || `US Congress District ${district}`);
    }
    features.push({
      type: "Feature",
      properties: { district, name },
      geometry: feature.geometry
    });
  }
  features.sort((a, b) => a.properties.district - b.properties.district);
  const expectedCount = EXPECTED_COUNTS[source];
  const actualCount = features.length;
  if (fallbackCount > 0) {
    return {
      collection: null,
      error: `${fallbackCount} features had no valid district number. Sample props: ${samplePropertyKeys.join(", ")}`,
      samplePropertyKeys
    };
  }
  if (actualCount === 0) {
    return {
      collection: null,
      error: `No valid features extracted. Sample props: ${samplePropertyKeys.join(", ")}`,
      samplePropertyKeys
    };
  }
  if (actualCount !== expectedCount) {
    console.warn(`[RefreshGeoJSON] ${source}: Expected ${expectedCount} districts but got ${actualCount}`);
  }
  const duplicateCount = raw.features.length - districtsSeen.size;
  if (duplicateCount > 1) {
    return {
      collection: null,
      error: `Too many duplicate districts (${duplicateCount}). Sample props: ${samplePropertyKeys.join(", ")}`,
      samplePropertyKeys
    };
  }
  return {
    collection: {
      type: "FeatureCollection",
      features
    },
    samplePropertyKeys
  };
}
function coordsEqual(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}
function isRingClosed(ring) {
  if (ring.length < 2) return false;
  return coordsEqual(ring[0], ring[ring.length - 1]);
}
function douglasPeuckerSimplify(coords, tolerance) {
  if (coords.length <= 2) return coords;
  let maxDist = 0;
  let maxIdx = 0;
  const first = coords[0];
  const last = coords[coords.length - 1];
  for (let i = 1; i < coords.length - 1; i++) {
    const dist = perpendicularDistance(coords[i], first, last);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }
  if (maxDist > tolerance) {
    const left = douglasPeuckerSimplify(coords.slice(0, maxIdx + 1), tolerance);
    const right = douglasPeuckerSimplify(coords.slice(maxIdx), tolerance);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}
function simplifyRing(ring, tolerance) {
  const wasClosed = isRingClosed(ring);
  if (wasClosed) {
    const openRing = ring.slice(0, -1);
    if (openRing.length < 3) {
      return ring;
    }
    const simplified = douglasPeuckerSimplify(openRing, tolerance);
    if (simplified.length < 3) {
      console.warn(`[RefreshGeoJSON] Ring simplified to ${simplified.length} points, using original`);
      return ring;
    }
    const closedRing = [...simplified, simplified[0]];
    if (closedRing.length < 4) {
      console.warn(`[RefreshGeoJSON] Closed ring has ${closedRing.length} points, using original`);
      return ring;
    }
    return closedRing;
  } else {
    return douglasPeuckerSimplify(ring, tolerance);
  }
}
function perpendicularDistance(point2, lineStart, lineEnd) {
  const dx = lineEnd[0] - lineStart[0];
  const dy = lineEnd[1] - lineStart[1];
  if (dx === 0 && dy === 0) {
    return Math.sqrt(Math.pow(point2[0] - lineStart[0], 2) + Math.pow(point2[1] - lineStart[1], 2));
  }
  const t = ((point2[0] - lineStart[0]) * dx + (point2[1] - lineStart[1]) * dy) / (dx * dx + dy * dy);
  const nearestX = lineStart[0] + t * dx;
  const nearestY = lineStart[1] + t * dy;
  return Math.sqrt(Math.pow(point2[0] - nearestX, 2) + Math.pow(point2[1] - nearestY, 2));
}
function validateGeometry(geometry, district) {
  const errors = [];
  const validateRing = (ring, ringType) => {
    if (ring.length < 4) {
      errors.push(`${ringType} has only ${ring.length} points (min 4)`);
    }
    if (!isRingClosed(ring)) {
      errors.push(`${ringType} is not closed`);
    }
  };
  if (geometry.type === "Polygon") {
    const coords = geometry.coordinates;
    coords.forEach((ring, i) => {
      validateRing(ring, `District ${district} Polygon ring ${i}`);
    });
  } else if (geometry.type === "MultiPolygon") {
    const coords = geometry.coordinates;
    coords.forEach((polygon2, p) => {
      polygon2.forEach((ring, r) => {
        validateRing(ring, `District ${district} MultiPolygon[${p}] ring ${r}`);
      });
    });
  }
  return { valid: errors.length === 0, errors };
}
function simplifyGeometry(geometry, tolerance = 1e-3) {
  if (geometry.type === "Polygon") {
    const coords = geometry.coordinates;
    return {
      type: "Polygon",
      coordinates: coords.map((ring) => simplifyRing(ring, tolerance))
    };
  } else if (geometry.type === "MultiPolygon") {
    const coords = geometry.coordinates;
    return {
      type: "MultiPolygon",
      coordinates: coords.map(
        (polygon2) => polygon2.map((ring) => simplifyRing(ring, tolerance))
      )
    };
  }
  return geometry;
}
function createSimplifiedGeoJSON(geojson) {
  const allErrors = [];
  const features = geojson.features.map((feature) => {
    const district = feature.properties.district;
    const simplifiedGeometry = simplifyGeometry(feature.geometry);
    const validation = validateGeometry(simplifiedGeometry, district);
    if (!validation.valid) {
      allErrors.push(...validation.errors);
    }
    return {
      ...feature,
      geometry: simplifiedGeometry
    };
  });
  if (allErrors.length > 0) {
    console.error(`[RefreshGeoJSON] Geometry validation errors: ${allErrors.slice(0, 5).join("; ")}${allErrors.length > 5 ? ` ... and ${allErrors.length - 5} more` : ""}`);
    return {
      collection: null,
      errors: allErrors
    };
  }
  return {
    collection: {
      type: "FeatureCollection",
      features
    },
    errors: []
  };
}
async function writeGeoJSONFile(filename, data) {
  const filePath = path2.join(GEOJSON_DIR, filename);
  const tempPath = filePath + ".tmp";
  await fs2.promises.writeFile(tempPath, JSON.stringify(data), "utf8");
  await fs2.promises.rename(tempPath, filePath);
}
async function checkGeoJSONSourceForChanges(source) {
  console.log(`[RefreshGeoJSON] Checking ${source} for changes...`);
  try {
    const config = GEOJSON_SOURCES[source];
    const response = await fetchWithRetry2(config.url);
    const rawText = await response.text();
    const newFingerprint = computeFingerprint2(rawText);
    const state = await getGeoJSONRefreshState(source);
    const previousFingerprint = state?.fingerprint || null;
    const changed = previousFingerprint !== newFingerprint;
    let featureCount;
    try {
      const parsed = JSON.parse(rawText);
      featureCount = parsed.features?.length;
    } catch {
      featureCount = void 0;
    }
    console.log(`[RefreshGeoJSON] ${source}: fingerprint=${newFingerprint.slice(0, 12)}... changed=${changed} features=${featureCount ?? "?"}`);
    return {
      source,
      changed,
      previousFingerprint,
      newFingerprint,
      featureCount
    };
  } catch (err) {
    console.error(`[RefreshGeoJSON] Error checking ${source}:`, err);
    return {
      source,
      changed: false,
      previousFingerprint: null,
      newFingerprint: "",
      error: String(err)
    };
  }
}
async function refreshGeoJSONSource(source) {
  console.log(`[RefreshGeoJSON] Refreshing ${source}...`);
  try {
    const config = GEOJSON_SOURCES[source];
    const response = await fetchWithRetry2(config.url);
    const rawText = await response.text();
    const rawData = JSON.parse(rawText);
    if (!rawData.features || rawData.features.length === 0) {
      throw new Error("No features in response");
    }
    const normalizeResult = normalizeGeoJSON(rawData, source);
    if (!normalizeResult.collection) {
      console.error(`[RefreshGeoJSON] ${source}: Normalization failed - ${normalizeResult.error}`);
      console.error(`[RefreshGeoJSON] ${source}: Sample property keys: ${normalizeResult.samplePropertyKeys?.join(", ")}`);
      return {
        source,
        success: false,
        featureCount: 0,
        error: `Validation failed: ${normalizeResult.error}`
      };
    }
    const normalized = normalizeResult.collection;
    const simplifiedResult = createSimplifiedGeoJSON(normalized);
    if (!simplifiedResult.collection) {
      console.error(`[RefreshGeoJSON] ${source}: Simplified geometry validation failed`);
      return {
        source,
        success: false,
        featureCount: 0,
        error: `Geometry validation failed: ${simplifiedResult.errors.slice(0, 3).join("; ")}`
      };
    }
    await writeGeoJSONFile(config.localFile, normalized);
    await writeGeoJSONFile(config.simplifiedFile, simplifiedResult.collection);
    console.log(`[RefreshGeoJSON] ${source}: Wrote ${normalized.features.length} features to ${config.localFile} and ${config.simplifiedFile}`);
    const newFingerprint = computeFingerprint2(rawText);
    await updateGeoJSONRefreshState(source, newFingerprint, true);
    return {
      source,
      success: true,
      featureCount: normalized.features.length
    };
  } catch (err) {
    console.error(`[RefreshGeoJSON] Error refreshing ${source}:`, err);
    return {
      source,
      success: false,
      featureCount: 0,
      error: String(err)
    };
  }
}
var isRefreshingGeoJSON = false;
function getIsRefreshingGeoJSON() {
  return isRefreshingGeoJSON;
}
async function checkAndRefreshGeoJSONIfChanged(force = false) {
  if (isRefreshingGeoJSON) {
    console.log("[RefreshGeoJSON] Refresh already in progress, skipping");
    return {
      sourcesChecked: [],
      sourcesChanged: [],
      sourcesRefreshed: [],
      errors: [{ source: "TX_HOUSE_GEOJSON_V2", error: "Refresh already in progress" }],
      durationMs: 0
    };
  }
  isRefreshingGeoJSON = true;
  const startTime = Date.now();
  const result = {
    sourcesChecked: [],
    sourcesChanged: [],
    sourcesRefreshed: [],
    errors: [],
    durationMs: 0
  };
  console.log(`[RefreshGeoJSON] Starting smart check-and-refresh (force=${force})`);
  try {
    const sources = ["TX_HOUSE_GEOJSON_V2", "TX_SENATE_GEOJSON_V2", "US_HOUSE_TX_GEOJSON_V2"];
    for (const source of sources) {
      result.sourcesChecked.push(source);
      const checkResult = await checkGeoJSONSourceForChanges(source);
      if (checkResult.error) {
        result.errors.push({ source, error: checkResult.error });
        continue;
      }
      if (!checkResult.changed && !force) {
        console.log(`[RefreshGeoJSON] ${source}: No changes detected, skipping refresh`);
        await markGeoJSONCheckedOnly(source);
        continue;
      }
      result.sourcesChanged.push(source);
      console.log(`[RefreshGeoJSON] ${source}: Changes detected, running refresh...`);
      const refreshResult = await refreshGeoJSONSource(source);
      if (refreshResult.success) {
        result.sourcesRefreshed.push(source);
      } else if (refreshResult.error) {
        result.errors.push({ source, error: refreshResult.error });
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  } finally {
    isRefreshingGeoJSON = false;
    result.durationMs = Date.now() - startTime;
  }
  console.log(`[RefreshGeoJSON] Smart refresh completed: checked=${result.sourcesChecked.length}, changed=${result.sourcesChanged.length}, refreshed=${result.sourcesRefreshed.length}, errors=${result.errors.length} in ${result.durationMs}ms`);
  return result;
}
async function wasGeoJSONCheckedThisWeek() {
  const sources = ["TX_HOUSE_GEOJSON_V2", "TX_SENATE_GEOJSON_V2", "US_HOUSE_TX_GEOJSON_V2"];
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1e3);
  for (const source of sources) {
    const state = await getGeoJSONRefreshState(source);
    if (!state?.lastCheckedAt || state.lastCheckedAt < oneWeekAgo) {
      return false;
    }
  }
  return true;
}
async function getGeoJSONRefreshStates() {
  await ensureGeoJSONRefreshTable();
  const result = await db.execute(
    sql4`SELECT * FROM geojson_refresh_state`
  );
  return (result.rows || []).map((row) => ({
    source: row.source,
    fingerprint: row.fingerprint,
    lastCheckedAt: row.last_checked_at,
    lastChangedAt: row.last_changed_at,
    lastRefreshedAt: row.last_refreshed_at
  }));
}

// server/jobs/refreshCommittees.ts
init_db();
init_schema();
import * as cheerio2 from "cheerio";
import * as crypto3 from "crypto";
import { eq as eq3, and as and3 } from "drizzle-orm";
var TLO_BASE_URL2 = "https://capitol.texas.gov";
var CURRENT_LEG_SESSION = "89R";
var isRefreshing2 = false;
function getIsRefreshingCommittees() {
  return isRefreshing2;
}
async function fetchWithRetry3(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "TexasDistrictsApp/1.0 (Committee Data Sync)"
        }
      });
      if (response.ok) return response;
      if (response.status === 429) {
        await new Promise((r) => setTimeout(r, 2e3 * (i + 1)));
        continue;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, 1e3 * (i + 1)));
    }
  }
  throw new Error(`Failed to fetch ${url} after ${retries} retries`);
}
function computeFingerprint3(data) {
  return crypto3.createHash("sha256").update(data).digest("hex");
}
function createSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim();
}
function normalizeName(name) {
  return name.replace(/^(Rep\.|Sen\.|Representative|Senator)\s*/i, "").replace(/\s+/g, " ").trim().toLowerCase();
}
async function fetchCommitteeList(chamber) {
  const url = `${TLO_BASE_URL2}/committees/Committees.aspx?Chamber=${chamber}`;
  console.log(`[RefreshCommittees] Fetching committee list from ${url}`);
  const response = await fetchWithRetry3(url);
  const html = await response.text();
  const $ = cheerio2.load(html);
  const rawCommittees = [];
  $('a[href*="MeetingsByCmte.aspx"]').each((_, el) => {
    const href = $(el).attr("href") || "";
    const name = $(el).text().trim();
    if (!name || !href) return;
    const codeMatch = href.match(/CmteCode=([A-Z0-9]+)/i);
    const code = codeMatch ? codeMatch[1] : "";
    if (!code) return;
    rawCommittees.push({ name, code });
  });
  const result = [];
  let currentParentCode = null;
  let sortOrder = 0;
  for (const { name, code } of rawCommittees) {
    const isAppropriationsSubcommittee = name.toLowerCase().startsWith("appropriations - s/c");
    const isStandaloneSubcommittee = name.toLowerCase().startsWith("s/c on") || name.toLowerCase().startsWith("s/c ");
    const isSubcommittee = isAppropriationsSubcommittee || isStandaloneSubcommittee;
    let parentCode = null;
    if (isAppropriationsSubcommittee) {
      const appropriationsCommittee = rawCommittees.find(
        (c) => c.name.toLowerCase() === "appropriations"
      );
      parentCode = appropriationsCommittee?.code || null;
    } else if (isStandaloneSubcommittee) {
      parentCode = currentParentCode;
    } else {
      currentParentCode = code;
    }
    result.push({
      name,
      slug: createSlug(name),
      code,
      sourceUrl: `${TLO_BASE_URL2}/Committees/MembershipCmte.aspx?LegSess=${CURRENT_LEG_SESSION}&CmteCode=${code}`,
      isSubcommittee,
      parentCode,
      sortOrder: sortOrder++
    });
  }
  const subcommitteeCount = result.filter((c) => c.isSubcommittee).length;
  console.log(`[RefreshCommittees] Found ${result.length} committees for chamber ${chamber} (${subcommitteeCount} subcommittees)`);
  return result;
}
function isValidPersonName(name) {
  if (!name || name.length < 3) return false;
  if (name.endsWith(":")) return false;
  if (/^\d/.test(name)) return false;
  if (/\d{5,}/.test(name)) return false;
  const invalidPatterns = [
    /^texas legislature/i,
    /^help.*faq/i,
    /^site.*map/i,
    /^contact.*login/i,
    /^bill:/i,
    /^clerk:/i,
    /^phone:/i,
    /^fax:/i,
    /^email:/i,
    /^address:/i,
    /^room:/i,
    /^member$/i,
    /^position$/i,
    /mapcontact/i,
    /login$/i,
    /online$/i,
    /website/i,
    /capitol\.texas/i
  ];
  for (const pattern of invalidPatterns) {
    if (pattern.test(name)) return false;
  }
  const nameParts = name.split(/\s+/).filter((p) => p.length > 0);
  if (nameParts.length < 2) return false;
  return true;
}
async function fetchCommitteeMembers(committee) {
  const url = committee.sourceUrl;
  try {
    const response = await fetchWithRetry3(url);
    const html = await response.text();
    const $ = cheerio2.load(html);
    const members = [];
    let sortOrder = 0;
    $("table tr").each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length < 2) return;
      const positionCell = $(cells[0]).text().trim();
      const memberCell = $(cells[1]);
      const memberLink = memberCell.find("a");
      const memberName = memberLink.text().trim() || memberCell.text().trim();
      const memberHref = memberLink.attr("href") || "";
      if (!memberName || memberName === "Member") return;
      if (positionCell === "Position") return;
      if (!isValidPersonName(memberName)) {
        return;
      }
      const legCodeMatch = memberHref.match(/LegCode=([A-Z0-9]+)/i);
      const legCode = legCodeMatch ? legCodeMatch[1] : "";
      let roleTitle = "Member";
      if (positionCell.includes("Chair:") && !positionCell.includes("Vice")) {
        roleTitle = "Chair";
      } else if (positionCell.includes("Vice Chair:")) {
        roleTitle = "Vice Chair";
      } else if (positionCell.includes("Members:") || positionCell === "") {
        roleTitle = "Member";
      }
      members.push({
        memberName: memberName.replace(/^(Rep\.|Sen\.)\s*/, "").trim(),
        roleTitle,
        legCode,
        sortOrder: sortOrder++
      });
    });
    return members;
  } catch (err) {
    console.error(`[RefreshCommittees] Failed to fetch members for ${committee.name}:`, err);
    return [];
  }
}
async function fetchAllCommitteesWithMembers(chamber) {
  const chamberCode = chamber === "TX_HOUSE" ? "H" : "S";
  const committeeList = await fetchCommitteeList(chamberCode);
  const result = [];
  for (const committee of committeeList) {
    await new Promise((r) => setTimeout(r, 200));
    const members = await fetchCommitteeMembers(committee);
    result.push({ committee, members });
  }
  return result;
}
async function matchMemberToOfficial(memberName, legCode, chamber) {
  const source = chamber;
  const officials = await db.select({ id: officialPublic.id, fullName: officialPublic.fullName, sourceMemberId: officialPublic.sourceMemberId }).from(officialPublic).where(and3(
    eq3(officialPublic.source, source),
    eq3(officialPublic.active, true)
  ));
  const normalizedSearchName = normalizeName(memberName);
  for (const official of officials) {
    const normalizedOfficialName = normalizeName(official.fullName);
    if (normalizedOfficialName === normalizedSearchName) {
      return official.id;
    }
    const searchParts = normalizedSearchName.split(" ");
    const officialParts = normalizedOfficialName.split(" ");
    if (searchParts.length >= 2 && officialParts.length >= 2) {
      const searchLast = searchParts[searchParts.length - 1];
      const officialLast = officialParts[officialParts.length - 1];
      const searchFirst = searchParts[0];
      const officialFirst = officialParts[0];
      if (searchLast === officialLast && (searchFirst === officialFirst || searchFirst.charAt(0) === officialFirst.charAt(0))) {
        return official.id;
      }
    }
  }
  console.log(`[RefreshCommittees] Could not match member "${memberName}" to any ${chamber} official`);
  return null;
}
async function getRefreshState2(source) {
  const result = await db.select().from(committeeRefreshState).where(eq3(committeeRefreshState.source, source)).limit(1);
  return result.length > 0 ? result[0] : null;
}
async function updateRefreshState2(source, fingerprint, wasRefreshed) {
  const now = /* @__PURE__ */ new Date();
  const existing = await getRefreshState2(source);
  if (existing) {
    await db.update(committeeRefreshState).set({
      fingerprint,
      lastCheckedAt: now,
      lastChangedAt: wasRefreshed ? now : existing.lastChangedAt,
      lastRefreshedAt: wasRefreshed ? now : existing.lastRefreshedAt,
      updatedAt: now
    }).where(eq3(committeeRefreshState.source, source));
  } else {
    await db.insert(committeeRefreshState).values({
      source,
      fingerprint,
      lastCheckedAt: now,
      lastChangedAt: wasRefreshed ? now : null,
      lastRefreshedAt: wasRefreshed ? now : null
    });
  }
}
async function refreshChamberCommittees(chamber, committeesWithMembers) {
  let committeesCount = 0;
  let membershipsCount = 0;
  const codeToId = /* @__PURE__ */ new Map();
  for (const { committee, members } of committeesWithMembers) {
    const existing = await db.select().from(committees).where(and3(
      eq3(committees.chamber, chamber),
      eq3(committees.slug, committee.slug)
    )).limit(1);
    let committeeId;
    if (existing.length > 0) {
      committeeId = existing[0].id;
      await db.update(committees).set({
        name: committee.name,
        sourceUrl: committee.sourceUrl,
        sortOrder: String(committee.sortOrder),
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq3(committees.id, committeeId));
    } else {
      const inserted = await db.insert(committees).values({
        chamber,
        name: committee.name,
        slug: committee.slug,
        sourceUrl: committee.sourceUrl,
        sortOrder: String(committee.sortOrder)
      }).returning();
      committeeId = inserted[0].id;
    }
    codeToId.set(committee.code, committeeId);
    committeesCount++;
    await db.delete(committeeMemberships).where(eq3(committeeMemberships.committeeId, committeeId));
    for (const member of members) {
      const officialId = await matchMemberToOfficial(member.memberName, member.legCode, chamber);
      await db.insert(committeeMemberships).values({
        committeeId,
        officialPublicId: officialId,
        memberName: member.memberName,
        roleTitle: member.roleTitle,
        sortOrder: String(member.sortOrder)
      });
      membershipsCount++;
    }
  }
  for (const { committee } of committeesWithMembers) {
    if (committee.isSubcommittee && committee.parentCode) {
      const parentId = codeToId.get(committee.parentCode);
      const childId = codeToId.get(committee.code);
      if (parentId && childId) {
        await db.update(committees).set({ parentCommitteeId: parentId }).where(eq3(committees.id, childId));
      }
    } else {
      const childId = codeToId.get(committee.code);
      if (childId) {
        await db.update(committees).set({ parentCommitteeId: null }).where(eq3(committees.id, childId));
      }
    }
  }
  return { committeesCount, membershipsCount };
}
async function checkAndRefreshChamber(source, chamber, force) {
  const result = {
    source,
    checked: false,
    changed: false,
    refreshed: false,
    committeesCount: 0,
    membershipsCount: 0
  };
  try {
    const committeesWithMembers = await fetchAllCommitteesWithMembers(chamber);
    result.checked = true;
    const dataForFingerprint = JSON.stringify(committeesWithMembers);
    const newFingerprint = computeFingerprint3(dataForFingerprint);
    const existingState = await getRefreshState2(source);
    const hasChanged = !existingState?.fingerprint || existingState.fingerprint !== newFingerprint;
    result.changed = hasChanged;
    if (!hasChanged && !force) {
      console.log(`[RefreshCommittees] ${source}: No changes detected, skipping refresh`);
      await updateRefreshState2(source, newFingerprint, false);
      return result;
    }
    console.log(`[RefreshCommittees] ${source}: ${force ? "Force refresh" : "Changes detected"}, refreshing...`);
    const { committeesCount, membershipsCount } = await refreshChamberCommittees(chamber, committeesWithMembers);
    result.refreshed = true;
    result.committeesCount = committeesCount;
    result.membershipsCount = membershipsCount;
    await updateRefreshState2(source, newFingerprint, true);
    console.log(`[RefreshCommittees] ${source}: Refreshed ${committeesCount} committees, ${membershipsCount} memberships`);
  } catch (err) {
    result.error = String(err);
    console.error(`[RefreshCommittees] ${source} failed:`, err);
  }
  return result;
}
async function checkAndRefreshCommitteesIfChanged(force = false) {
  const startTime = Date.now();
  const results = [];
  if (isRefreshing2) {
    console.log("[RefreshCommittees] Already refreshing, skipping");
    return { results, durationMs: 0 };
  }
  isRefreshing2 = true;
  try {
    const houseResult = await checkAndRefreshChamber("TX_HOUSE_COMMITTEES", "TX_HOUSE", force);
    results.push(houseResult);
    const senateResult = await checkAndRefreshChamber("TX_SENATE_COMMITTEES", "TX_SENATE", force);
    results.push(senateResult);
  } finally {
    isRefreshing2 = false;
  }
  const durationMs = Date.now() - startTime;
  console.log(`[RefreshCommittees] Complete in ${durationMs}ms`);
  return { results, durationMs };
}
async function wasCommitteesCheckedThisWeek() {
  const sources = ["TX_HOUSE_COMMITTEES", "TX_SENATE_COMMITTEES"];
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1e3);
  for (const source of sources) {
    const state = await getRefreshState2(source);
    if (!state?.lastCheckedAt || state.lastCheckedAt < oneWeekAgo) {
      return false;
    }
  }
  return true;
}
async function getAllCommitteeRefreshStates() {
  const states = await db.select().from(committeeRefreshState);
  return states.map((s) => ({
    source: s.source,
    fingerprint: s.fingerprint,
    lastCheckedAt: s.lastCheckedAt,
    lastChangedAt: s.lastChangedAt,
    lastRefreshedAt: s.lastRefreshedAt
  }));
}
var isMainModule2 = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule2) {
  checkAndRefreshCommitteesIfChanged(true).then((result) => {
    console.log("Result:", JSON.stringify(result, null, 2));
    process.exit(0);
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

// server/jobs/scheduler.ts
init_refreshOtherTexasOfficials();
init_identityResolver();
var schedulerInterval = null;
var lastCheckWindowRun = null;
var refreshCycleInProgress = false;
var CHECK_INTERVAL_MS = 10 * 60 * 1e3;
async function runRefreshCycle() {
  if (refreshCycleInProgress) {
    console.log("[Scheduler] Refresh cycle already in progress, skipping");
    return;
  }
  refreshCycleInProgress = true;
  const cycleStart = Date.now();
  console.log("========================================");
  console.log("[Scheduler] BEGIN refresh cycle");
  console.log("========================================");
  try {
    console.log("[Scheduler] Step 1/6: Refreshing Legislature + US House officials...");
    await checkAndRefreshIfChanged(false);
    console.log("[Scheduler] Step 2/6: Refreshing Other Texas Officials...");
    await refreshOtherTexasOfficials({ force: false });
    console.log("[Scheduler] Step 3/6: Resolving personIds for active officials...");
    const identityResult = await resolveAllMissingPersonIds();
    console.log(`[Scheduler] Identity resolution: ${identityResult.resolved} resolved, ${identityResult.created} new persons`);
    console.log("[Scheduler] Step 4/6: Refreshing GeoJSON district boundaries...");
    await checkAndRefreshGeoJSONIfChanged(false);
    console.log("[Scheduler] Step 5/6: Refreshing Committees...");
    await checkAndRefreshCommitteesIfChanged(false);
    console.log("[Scheduler] Step 6/6: Backfilling hometowns...");
    try {
      const { bulkFillHometowns: bulkFillHometowns2 } = await Promise.resolve().then(() => (init_bulkFillHometowns(), bulkFillHometowns_exports));
      const hometownResult = await bulkFillHometowns2();
      console.log(`[Scheduler] Hometown backfill: filled=${hometownResult.filled}, skipped=${hometownResult.skipped}`);
    } catch (err) {
      console.error("[Scheduler] Hometown backfill failed:", err);
    }
    const cycleDuration = Date.now() - cycleStart;
    console.log("========================================");
    console.log(`[Scheduler] END refresh cycle (${cycleDuration}ms)`);
    console.log("========================================");
  } catch (err) {
    console.error("[Scheduler] Error during refresh cycle:", err);
    console.log("========================================");
    console.log("[Scheduler] END refresh cycle (FAILED)");
    console.log("========================================");
  } finally {
    refreshCycleInProgress = false;
  }
}
async function schedulerTick() {
  try {
    const officialsRefreshing = getIsRefreshing();
    const geoJSONRefreshing = getIsRefreshingGeoJSON();
    const committeesRefreshing = getIsRefreshingCommittees();
    if (officialsRefreshing || geoJSONRefreshing || committeesRefreshing || refreshCycleInProgress) {
      console.log("[Scheduler] Refresh in progress, skipping tick");
      return;
    }
    const inWindow = isInMondayCheckWindow();
    if (!inWindow) {
      return;
    }
    if (lastCheckWindowRun) {
      const timeSinceLast = Date.now() - lastCheckWindowRun.getTime();
      if (timeSinceLast < 60 * 60 * 1e3) {
        return;
      }
    }
    const officialsChecked = await wasCheckedThisWeek();
    const geoJSONChecked = await wasGeoJSONCheckedThisWeek();
    const committeesChecked = await wasCommitteesCheckedThisWeek();
    if (officialsChecked && geoJSONChecked && committeesChecked) {
      console.log("[Scheduler] All sources already checked this week, skipping");
      return;
    }
    console.log("[Scheduler] Monday check window detected, starting full refresh cycle...");
    lastCheckWindowRun = /* @__PURE__ */ new Date();
    await runRefreshCycle();
  } catch (err) {
    console.error("[Scheduler] Error during tick:", err);
  }
}
function startOfficialsRefreshScheduler() {
  if (schedulerInterval) {
    console.log("[Scheduler] Already running");
    return;
  }
  console.log(`[Scheduler] Starting officials refresh scheduler (check every ${CHECK_INTERVAL_MS / 6e4} minutes)`);
  schedulerInterval = setInterval(schedulerTick, CHECK_INTERVAL_MS);
  setTimeout(() => {
    schedulerTick().catch((err) => {
      console.error("[Scheduler] Initial tick failed:", err);
    });
  }, 5e3);
}
function getSchedulerStatus() {
  const now = /* @__PURE__ */ new Date();
  const centralOptions = {
    timeZone: "America/Chicago",
    weekday: "long",
    hour: "numeric",
    minute: "numeric",
    hour12: true
  };
  return {
    running: schedulerInterval !== null,
    lastCheckWindowRun,
    nextCheckIn: `Check window: Monday 3:00-4:00 AM Central Time (current: ${now.toLocaleString("en-US", centralOptions)})`
  };
}

// server/geonames.ts
var GEONAMES_BASE = "http://api.geonames.org";
var cache = /* @__PURE__ */ new Map();
var CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1e3;
function normalizeQuery(q) {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}
function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return void 0;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return void 0;
  }
  return entry.result;
}
function setCache(key, result) {
  cache.set(key, { result, timestamp: Date.now() });
}
var ZIP_REGEX = /^\d{5}(-\d{4})?$/;
async function lookupPlace(query) {
  const username = process.env.GEONAMES_USERNAME;
  if (!username) {
    return { result: null, fromCache: false, error: "GEONAMES_USERNAME secret is not configured" };
  }
  const normalized = normalizeQuery(query);
  if (normalized.length < 2) {
    return { result: null, fromCache: false, error: "Query too short (min 2 characters)" };
  }
  const cacheKey = `place:${normalized}`;
  const cached = getCached(cacheKey);
  if (cached !== void 0) {
    console.log(`[GeoNames] Cache hit for "${normalized}"`);
    return { result: cached, fromCache: true };
  }
  try {
    let result = null;
    if (ZIP_REGEX.test(normalized)) {
      result = await lookupZIP(normalized, username);
    } else {
      result = await lookupCity(normalized, username);
    }
    setCache(cacheKey, result);
    return { result, fromCache: false };
  } catch (err) {
    console.error("[GeoNames] API error:", err);
    return { result: null, fromCache: false, error: "GeoNames API request failed" };
  }
}
async function lookupZIP(zip, username) {
  const cleanZip = zip.split("-")[0];
  const url = `${GEONAMES_BASE}/postalCodeSearchJSON?postalcode=${cleanZip}&country=US&maxRows=5&username=${username}`;
  console.log(`[GeoNames] ZIP lookup: ${GEONAMES_BASE}/postalCodeSearchJSON?postalcode=${cleanZip}&country=US&maxRows=5`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GeoNames API returned ${response.status}`);
  }
  const data = await response.json();
  if (!data.postalCodes || data.postalCodes.length === 0) {
    console.log(`[GeoNames] No results for ZIP ${cleanZip}`);
    return null;
  }
  const texasResult = data.postalCodes.find((p) => p.adminCode1 === "TX");
  if (!texasResult) {
    console.log(`[GeoNames] ZIP ${cleanZip} exists but not in Texas`);
    return null;
  }
  const result = {
    name: `${texasResult.placeName}, Texas ${texasResult.postalCode}`,
    lat: texasResult.lat,
    lng: texasResult.lng,
    postalCode: texasResult.postalCode
  };
  console.log(`[GeoNames] ZIP resolved: ${result.name} at (${result.lat}, ${result.lng})`);
  return result;
}
async function lookupCity(query, username) {
  const url = `${GEONAMES_BASE}/searchJSON?q=${encodeURIComponent(query)}&country=US&adminCode1=TX&featureClass=P&maxRows=5&username=${username}`;
  console.log(`[GeoNames] City lookup: ${GEONAMES_BASE}/searchJSON?q=${encodeURIComponent(query)}&country=US&adminCode1=TX&featureClass=P&maxRows=5`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GeoNames API returned ${response.status}`);
  }
  const data = await response.json();
  if (!data.geonames || data.geonames.length === 0) {
    console.log(`[GeoNames] No Texas places found for "${query}"`);
    return null;
  }
  const exactMatch = data.geonames.find((g) => g.name.toLowerCase() === query.toLowerCase());
  const best = exactMatch || data.geonames[0];
  if (best.adminName1 !== "Texas") {
    console.log(`[GeoNames] Result not in Texas: ${best.adminName1}`);
    return null;
  }
  const result = {
    name: `${best.name}, Texas`,
    lat: parseFloat(best.lat),
    lng: parseFloat(best.lng),
    geonameId: best.geonameId
  };
  console.log(`[GeoNames] City resolved: ${result.name} at (${result.lat}, ${result.lng})`);
  return result;
}
function getCacheStats() {
  return {
    size: cache.size,
    keys: Array.from(cache.keys()).slice(0, 20)
  };
}
var multiCache = /* @__PURE__ */ new Map();
function getMultiCached(key) {
  const entry = multiCache.get(key);
  if (!entry) return void 0;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    multiCache.delete(key);
    return void 0;
  }
  return entry.results;
}
function setMultiCache(key, results) {
  multiCache.set(key, { results, timestamp: Date.now() });
}
async function lookupPlaceCandidates(query, maxResults = 5) {
  const username = process.env.GEONAMES_USERNAME;
  if (!username) {
    return { results: [], fromCache: false, error: "GEONAMES_USERNAME secret is not configured" };
  }
  const normalized = normalizeQuery(query);
  if (normalized.length < 2) {
    return { results: [], fromCache: false, error: "Query too short (min 2 characters)" };
  }
  const cacheKey = `multi:${normalized}`;
  const cached = getMultiCached(cacheKey);
  if (cached !== void 0) {
    console.log(`[GeoNames] Multi-cache hit for "${normalized}"`);
    return { results: cached, fromCache: true };
  }
  try {
    let results = [];
    if (ZIP_REGEX.test(normalized)) {
      results = await lookupZIPMulti(normalized, username, maxResults);
    } else {
      results = await lookupCityMulti(normalized, username, maxResults);
    }
    setMultiCache(cacheKey, results);
    return { results, fromCache: false };
  } catch (err) {
    console.error("[GeoNames] API error:", err);
    return { results: [], fromCache: false, error: "GeoNames API request failed" };
  }
}
async function lookupZIPMulti(zip, username, maxResults) {
  const cleanZip = zip.split("-")[0];
  const url = `${GEONAMES_BASE}/postalCodeSearchJSON?postalcode=${cleanZip}&country=US&maxRows=${maxResults}&username=${username}`;
  console.log(`[GeoNames] ZIP multi lookup: ${GEONAMES_BASE}/postalCodeSearchJSON?postalcode=${cleanZip}&country=US&maxRows=${maxResults}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GeoNames API returned ${response.status}`);
  }
  const data = await response.json();
  if (!data.postalCodes || data.postalCodes.length === 0) {
    console.log(`[GeoNames] No results for ZIP ${cleanZip}`);
    return [];
  }
  const texasResults = data.postalCodes.filter((p) => p.adminCode1 === "TX");
  if (texasResults.length === 0) {
    console.log(`[GeoNames] ZIP ${cleanZip} exists but not in Texas`);
    return [];
  }
  const results = texasResults.map((p) => ({
    name: `${p.placeName}, Texas ${p.postalCode}`,
    lat: p.lat,
    lng: p.lng,
    postalCode: p.postalCode,
    county: p.adminName2
  }));
  console.log(`[GeoNames] ZIP multi resolved: ${results.length} candidates`);
  return results;
}
async function lookupCityMulti(query, username, maxResults) {
  const url = `${GEONAMES_BASE}/searchJSON?q=${encodeURIComponent(query)}&country=US&adminCode1=TX&featureClass=P&maxRows=${maxResults}&username=${username}`;
  console.log(`[GeoNames] City multi lookup: ${GEONAMES_BASE}/searchJSON?q=${encodeURIComponent(query)}&country=US&adminCode1=TX&featureClass=P&maxRows=${maxResults}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GeoNames API returned ${response.status}`);
  }
  const data = await response.json();
  if (!data.geonames || data.geonames.length === 0) {
    console.log(`[GeoNames] No Texas places found for "${query}"`);
    return [];
  }
  const texasResults = data.geonames.filter((g) => g.adminName1 === "Texas");
  const results = texasResults.map((g) => ({
    name: `${g.name}, Texas`,
    lat: parseFloat(g.lat),
    lng: parseFloat(g.lng),
    geonameId: g.geonameId,
    population: g.population,
    county: g.adminName2
  }));
  console.log(`[GeoNames] City multi resolved: ${results.length} candidates`);
  return results;
}

// server/routes.ts
init_schema();
function getMapHtml() {
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    #map { width: 100%; height: 100%; }
    .leaflet-control-attribution { display: none; }
    .leaflet-draw-toolbar { display: none !important; }
    .user-location-marker {
      background: #007AFF;
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    }
    .address-dot-marker {
      background: #9B59B6;
      border: 2px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    }
    .cluster-badge {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      font-weight: bold;
      color: white;
      background: #7B68EE;
      border-radius: 50%;
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    }
    .headshot-marker {
      display: flex;
      flex-direction: column;
      align-items: center;
      pointer-events: auto;
    }
    .headshot-bubble {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: white;
      border: 2.5px solid rgba(0,0,0,0.15);
      overflow: hidden;
      box-shadow: 0 3px 8px rgba(0,0,0,0.3);
    }
    .headshot-bubble img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .headshot-initials {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 16px;
      color: #555;
      background: #e8e8e8;
    }
    .headshot-tail {
      width: 0;
      height: 0;
      border-left: 7px solid transparent;
      border-right: 7px solid transparent;
      border-top: 10px solid white;
      margin-top: -2px;
      filter: drop-shadow(0 2px 2px rgba(0,0,0,0.15));
    }
    .headshot-overflow {
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .headshot-overflow-bubble {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: rgba(74, 144, 226, 0.9);
      border: 2.5px solid white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 14px;
      color: white;
      box-shadow: 0 3px 8px rgba(0,0,0,0.3);
      cursor: pointer;
    }
    .headshot-overflow-tail {
      width: 0;
      height: 0;
      border-left: 7px solid transparent;
      border-right: 7px solid transparent;
      border-top: 10px solid rgba(74, 144, 226, 0.9);
      margin-top: -2px;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', {
      center: [31.0, -100.0],
      zoom: 6,
      zoomControl: true,
      attributionControl: false
    });
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18
    }).addTo(map);
    
    var layers = { senate: null, house: null, congress: null };
    var highlightLayers = []; // Array of all highlight layers for multi-select support
    var geoJSONData = { tx_senate: null, tx_house: null, us_congress: null };
    var enabledLayers = { senate: true, house: true, congress: false };
    var locationMarker = null;
    var drawnPolygon = null;
    var polyline = null;
    var drawPoints = [];
    var addressDotMarkers = [];
    var addressDotsByCity = {};
    
    var loadStatus = {
      tx_senate: { loaded: false, loading: false, features: 0, error: null },
      tx_house: { loaded: false, loading: false, features: 0, error: null },
      us_congress: { loaded: false, loading: false, features: 0, error: null }
    };
    
    var layerColors = {
      tx_senate: { fill: '#4B79A1', stroke: '#4B79A1', fillOpacity: 0.15, weight: 3 },
      tx_house: { fill: '#55BB69', stroke: '#55BB69', fillOpacity: 0.15, weight: 3 },
      us_congress: { fill: '#8B4513', stroke: '#8B4513', fillOpacity: 0.15, weight: 3 }
    };
    
    function postMessage(data) {
      try {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify(data));
        } else if (window.parent !== window) {
          // Use '*' to allow cross-origin communication since parent may be on different port
          window.parent.postMessage(JSON.stringify(data), '*');
        }
      } catch (e) {
        console.error('[Leaflet] postMessage error:', e);
      }
    }
    
    function createLayer(type, data, colors) {
      var layer = L.geoJSON(data, {
        style: {
          color: colors.stroke,
          weight: colors.weight || 3,
          fillColor: colors.fill,
          fillOpacity: colors.fillOpacity || 0.15,
          opacity: 0.8
        }
      });
      return layer;
    }
    
    async function fetchAndSetGeoJSON(layerType) {
      if (loadStatus[layerType].loaded || loadStatus[layerType].loading) {
        console.log('[OVERLAY]', layerType, 'already loaded or loading');
        return loadStatus[layerType].loaded;
      }
      
      loadStatus[layerType].loading = true;
      console.log('[OVERLAY]', layerType, 'fetching from /api/geojson/' + layerType);
      
      try {
        var response = await fetch('/api/geojson/' + layerType);
        console.log('[OVERLAY]', layerType, 'status=' + response.status);
        
        if (!response.ok) {
          throw new Error('HTTP ' + response.status);
        }
        
        var data = await response.json();
        var featureCount = data.features?.length || 0;
        console.log('[OVERLAY]', layerType, 'features=' + featureCount);
        
        geoJSONData[layerType] = data;
        loadStatus[layerType].loaded = true;
        loadStatus[layerType].features = featureCount;
        loadStatus[layerType].loading = false;
        
        var typeKey = layerType === 'tx_senate' ? 'senate' : 
                      layerType === 'tx_house' ? 'house' : 'congress';
        if (layers[typeKey]) {
          map.removeLayer(layers[typeKey]);
        }
        layers[typeKey] = createLayer(typeKey, data, layerColors[layerType]);
        
        if (enabledLayers[typeKey] && layers[typeKey]) {
          layers[typeKey].addTo(map);
          layers[typeKey].bringToFront();
          console.log('[OVERLAY]', layerType, 'auto-added to map (enabled)');
        }
        
        postMessage({
          type: 'geoJSONLoaded',
          layerType: layerType,
          features: featureCount,
          success: true
        });
        
        return true;
      } catch (e) {
        console.error('[OVERLAY]', layerType, 'error=' + e.message);
        loadStatus[layerType].error = e.message;
        loadStatus[layerType].loading = false;
        
        postMessage({
          type: 'geoJSONLoaded',
          layerType: layerType,
          features: 0,
          success: false,
          error: e.message
        });
        
        return false;
      }
    }
    
    window.toggleLayer = function(type, visible) {
      console.log('[OVERLAY] toggleLayer:', type, 'visible=', visible);
      enabledLayers[type] = visible;
      var layerType = type === 'senate' ? 'tx_senate' : 
                      type === 'house' ? 'tx_house' : 'us_congress';
      var layer = layers[type];
      
      if (!layer && visible && geoJSONData[layerType]) {
        layer = createLayer(type, geoJSONData[layerType], layerColors[layerType]);
        layers[type] = layer;
      }
      
      if (layer) {
        if (visible) {
          layer.addTo(map);
          layer.bringToFront();
          console.log('[OVERLAY]', type, 'added to map');
        } else {
          map.removeLayer(layer);
          console.log('[OVERLAY]', type, 'removed from map');
        }
      } else {
        console.log('[OVERLAY]', type, 'layer not found or not loaded');
      }
    };
    
    function pointInPolygon(lat, lng, polygon) {
      var x = lng, y = lat;
      var inside = false;
      for (var i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        var xi = polygon[i][0], yi = polygon[i][1];
        var xj = polygon[j][0], yj = polygon[j][1];
        var intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
      }
      return inside;
    }
    
    function isPointInGeoJSONFeature(lat, lng, feature) {
      if (!feature.geometry) return false;
      if (feature.geometry.type === 'Polygon') {
        var rings = feature.geometry.coordinates;
        var inOuter = pointInPolygon(lat, lng, rings[0]);
        if (!inOuter) return false;
        for (var h = 1; h < rings.length; h++) {
          if (pointInPolygon(lat, lng, rings[h])) return false;
        }
        return true;
      } else if (feature.geometry.type === 'MultiPolygon') {
        for (var p = 0; p < feature.geometry.coordinates.length; p++) {
          var polyRings = feature.geometry.coordinates[p];
          var inOuterPoly = pointInPolygon(lat, lng, polyRings[0]);
          if (inOuterPoly) {
            var inHole = false;
            for (var hIdx = 1; hIdx < polyRings.length; hIdx++) {
              if (pointInPolygon(lat, lng, polyRings[hIdx])) { inHole = true; break; }
            }
            if (!inHole) return true;
          }
        }
        return false;
      }
      return false;
    }
    
    map.on('click', function(e) {
      console.log('[MAP_TAP] Click at', e.latlng.lat, e.latlng.lng);
      console.log('[MAP_TAP] Enabled layers:', JSON.stringify(enabledLayers));
      
      var hits = [];
      var layerMap = { senate: 'tx_senate', house: 'tx_house', congress: 'us_congress' };
      
      for (var key in enabledLayers) {
        if (!enabledLayers[key]) continue;
        var dataKey = layerMap[key];
        var geojson = geoJSONData[dataKey];
        if (!geojson || !geojson.features) {
          console.log('[MAP_TAP]', dataKey, 'no data loaded');
          continue;
        }
        
        for (var i = 0; i < geojson.features.length; i++) {
          var feat = geojson.features[i];
          if (isPointInGeoJSONFeature(e.latlng.lat, e.latlng.lng, feat)) {
            var distNum = feat.properties.DIST_NBR || feat.properties.district;
            hits.push({
              type: dataKey,
              district: parseInt(distNum) || 0,
              properties: feat.properties
            });
          }
        }
      }
      
      console.log('[MAP_TAP] Total hits:', hits.length);
      postMessage({
        type: 'mapTap',
        lat: e.latlng.lat,
        lng: e.latlng.lng,
        hits: hits
      });
    });
    
    window.highlightDistricts = function(hits) {
      console.log('[Leaflet] highlightDistricts called with', hits.length, 'hits');
      
      // Clear all existing highlight layers
      for (var k = 0; k < highlightLayers.length; k++) {
        map.removeLayer(highlightLayers[k]);
      }
      highlightLayers = [];
      
      var layerMap = { senate: 'tx_senate', house: 'tx_house', congress: 'us_congress' };
      for (var i = 0; i < hits.length; i++) {
        var hit = hits[i];
        // Support both districtNumber (native) and district (web) keys
        var districtNumber = hit.districtNumber !== undefined ? hit.districtNumber : hit.district;
        // Support both source (native) and type (web) keys
        var layerType = hit.type;
        if (hit.source) {
          layerType = hit.source === 'TX_HOUSE' ? 'tx_house' : 
                      hit.source === 'TX_SENATE' ? 'tx_senate' : 'us_congress';
        }
        
        var typeKey = layerType === 'tx_senate' ? 'senate' : 
                      layerType === 'tx_house' ? 'house' : 'congress';
        var dataKey = layerMap[typeKey];
        var geojson = geoJSONData[dataKey];
        if (!geojson) continue;
        
        for (var j = 0; j < geojson.features.length; j++) {
          var feat = geojson.features[j];
          var distNum = parseInt(feat.properties.DIST_NBR || feat.properties.district) || 0;
          if (distNum === districtNumber) {
            var colors = layerColors[dataKey];
            var hl = L.geoJSON(feat, {
              style: {
                color: colors.stroke,
                weight: 5,
                fillColor: colors.fill,
                fillOpacity: 0.4,
                opacity: 1
              }
            });
            hl.addTo(map);
            highlightLayers.push(hl);
            break;
          }
        }
      }
      console.log('[Leaflet] Highlighted', highlightLayers.length, 'districts');
    };
    
    window.clearHighlights = function() {
      console.log('[Leaflet] clearHighlights called, current layers:', highlightLayers.length);
      for (var k = 0; k < highlightLayers.length; k++) {
        map.removeLayer(highlightLayers[k]);
      }
      highlightLayers = [];
    };
    
    window.setUserLocation = function(lat, lng) {
      if (locationMarker) {
        map.removeLayer(locationMarker);
      }
      var icon = L.divIcon({
        className: 'user-location-marker',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      });
      locationMarker = L.marker([lat, lng], { icon: icon }).addTo(map);
    };
    
    window.centerMap = function(lat, lng, zoom) {
      map.setView([lat, lng], zoom || 10);
    };
    
    window.focusDistrict = function(type, districtNum) {
      var dataKey = type === 'senate' ? 'tx_senate' : 
                    type === 'house' ? 'tx_house' : 'us_congress';
      var geojson = geoJSONData[dataKey];
      if (!geojson) return;
      
      for (var i = 0; i < geojson.features.length; i++) {
        var feat = geojson.features[i];
        var distNum = parseInt(feat.properties.DIST_NBR || feat.properties.district) || 0;
        if (distNum === districtNum) {
          var layer = L.geoJSON(feat);
          var bounds = layer.getBounds();
          map.fitBounds(bounds, { padding: [50, 50] });
          
          var colors = layerColors[dataKey];
          window.clearHighlights();
          var hl = L.geoJSON(feat, {
            style: { color: colors.stroke, weight: 5, fillColor: colors.fill, fillOpacity: 0.4, opacity: 1 }
          });
          hl.addTo(map);
          highlightLayers.push(hl);
          break;
        }
      }
    };
    
    window.setAddressDots = function(dots) {
      for (var i = 0; i < addressDotMarkers.length; i++) {
        map.removeLayer(addressDotMarkers[i]);
      }
      addressDotMarkers = [];
      addressDotsByCity = {};
      
      for (var j = 0; j < dots.length; j++) {
        var dot = dots[j];
        var cityKey = dot.lat.toFixed(2) + ',' + dot.lng.toFixed(2);
        if (!addressDotsByCity[cityKey]) {
          addressDotsByCity[cityKey] = [];
        }
        addressDotsByCity[cityKey].push(dot);
      }
      
      for (var key in addressDotsByCity) {
        var cluster = addressDotsByCity[key];
        var first = cluster[0];
        var icon;
        if (cluster.length > 1) {
          icon = L.divIcon({
            className: 'cluster-badge',
            html: '<span>' + cluster.length + '</span>',
            iconSize: [22, 22],
            iconAnchor: [11, 11]
          });
        } else {
          icon = L.divIcon({
            className: 'address-dot-marker',
            iconSize: [12, 12],
            iconAnchor: [6, 6]
          });
        }
        var marker = L.marker([first.lat, first.lng], { icon: icon });
        marker.clusterData = cluster;
        marker.on('click', function(e) {
          L.DomEvent.stopPropagation(e);
          postMessage({
            type: 'addressDotClick',
            officials: this.clusterData
          });
        });
        marker.addTo(map);
        addressDotMarkers.push(marker);
      }
    };
    
    window.setActiveAddressDot = function(id) {
      // Optional: highlight active dot
    };
    
    var headshotMarkers = [];
    var centroidCache = {};
    var featureCache = {};
    var boundaryCache = {};
    
    function computeCentroid(feature) {
      if (!feature || !feature.geometry) return null;
      var coords = [];
      function extractCoords(geom) {
        if (geom.type === 'Polygon') {
          for (var i = 0; i < geom.coordinates[0].length; i++) {
            coords.push(geom.coordinates[0][i]);
          }
        } else if (geom.type === 'MultiPolygon') {
          var bestArea = 0;
          var bestIdx = 0;
          for (var p = 0; p < geom.coordinates.length; p++) {
            var ring = geom.coordinates[p][0];
            var area = 0;
            for (var a = 0; a < ring.length - 1; a++) {
              area += ring[a][0] * ring[a+1][1] - ring[a+1][0] * ring[a][1];
            }
            area = Math.abs(area) / 2;
            if (area > bestArea) { bestArea = area; bestIdx = p; }
          }
          var best = geom.coordinates[bestIdx][0];
          for (var b = 0; b < best.length; b++) {
            coords.push(best[b]);
          }
        }
      }
      extractCoords(feature.geometry);
      if (coords.length === 0) return null;
      var sumLat = 0, sumLng = 0;
      for (var c = 0; c < coords.length; c++) {
        sumLng += coords[c][0];
        sumLat += coords[c][1];
      }
      return [sumLat / coords.length, sumLng / coords.length];
    }
    
    function getDistrictFeature(layerType, districtNum) {
      var key = layerType + '_' + districtNum;
      if (featureCache[key]) return featureCache[key];
      var geojson = geoJSONData[layerType];
      if (!geojson || !geojson.features) return null;
      for (var i = 0; i < geojson.features.length; i++) {
        var feat = geojson.features[i];
        var dn = parseInt(feat.properties.DIST_NBR || feat.properties.district) || 0;
        if (dn === districtNum) {
          featureCache[key] = feat;
          return feat;
        }
      }
      return null;
    }
    
    function getDistrictCentroid(layerType, districtNum) {
      var key = layerType + '_' + districtNum;
      if (centroidCache[key]) return centroidCache[key];
      var feat = getDistrictFeature(layerType, districtNum);
      if (!feat) return null;
      var c = computeCentroid(feat);
      if (c) centroidCache[key] = c;
      return c;
    }
    
    function getInitials(name) {
      if (!name) return '?';
      var parts = name.trim().split(/\\s+/);
      if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
      return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }
    
    function getBoundaryRings(feature) {
      var rings = [];
      if (feature.geometry.type === 'Polygon') {
        rings.push(feature.geometry.coordinates[0]);
      } else if (feature.geometry.type === 'MultiPolygon') {
        for (var p = 0; p < feature.geometry.coordinates.length; p++) {
          rings.push(feature.geometry.coordinates[p][0]);
        }
      }
      return rings;
    }
    
    function nearestPointOnSegment(px, py, ax, ay, bx, by) {
      var dx = bx - ax, dy = by - ay;
      var lenSq = dx * dx + dy * dy;
      if (lenSq === 0) return { x: ax, y: ay, dist: Math.sqrt((px-ax)*(px-ax)+(py-ay)*(py-ay)) };
      var t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
      var nx = ax + t * dx, ny = ay + t * dy;
      var d = Math.sqrt((px-nx)*(px-nx)+(py-ny)*(py-ny));
      return { x: nx, y: ny, dist: d };
    }
    
    function nearestPointOnBoundary(lat, lng, feature) {
      var cacheKey = (feature.properties.DIST_NBR || feature.properties.district || '') + '_' + feature.geometry.type;
      var rings = boundaryCache[cacheKey] || getBoundaryRings(feature);
      if (!boundaryCache[cacheKey]) boundaryCache[cacheKey] = rings;
      var bestDist = Infinity, bestX = 0, bestY = 0;
      for (var r = 0; r < rings.length; r++) {
        var ring = rings[r];
        for (var i = 0; i < ring.length - 1; i++) {
          var res = nearestPointOnSegment(lng, lat, ring[i][0], ring[i][1], ring[i+1][0], ring[i+1][1]);
          if (res.dist < bestDist) {
            bestDist = res.dist;
            bestX = res.x;
            bestY = res.y;
          }
        }
      }
      return [bestY, bestX];
    }
    
    function closestPointInsidePolygon(lat, lng, feature) {
      if (isPointInGeoJSONFeature(lat, lng, feature)) return [lat, lng];
      var nearest = nearestPointOnBoundary(lat, lng, feature);
      var c = computeCentroid(feature);
      if (!c) return nearest;
      var step = 0.00015;
      var candLat = nearest[0], candLng = nearest[1];
      for (var j = 0; j < 25; j++) {
        var dx = c[1] - candLng;
        var dy = c[0] - candLat;
        var len = Math.sqrt(dx * dx + dy * dy) || 1;
        candLat = candLat + (dy / len) * step;
        candLng = candLng + (dx / len) * step;
        if (isPointInGeoJSONFeature(candLat, candLng, feature)) return [candLat, candLng];
      }
      return c;
    }
    
    function getMarkerPosition(originLat, originLng, layerType, districtNum) {
      var feature = getDistrictFeature(layerType, districtNum);
      if (!feature) return getDistrictCentroid(layerType, districtNum);
      return closestPointInsidePolygon(originLat, originLng, feature);
    }

    var polylabelCache = {};

    function getFeatureBbox(feature) {
      var minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
      var rings = getBoundaryRings(feature);
      for (var r = 0; r < rings.length; r++) {
        for (var i = 0; i < rings[r].length; i++) {
          var coord = rings[r][i];
          if (coord[0] < minLng) minLng = coord[0];
          if (coord[0] > maxLng) maxLng = coord[0];
          if (coord[1] < minLat) minLat = coord[1];
          if (coord[1] > maxLat) maxLat = coord[1];
        }
      }
      return [minLng, minLat, maxLng, maxLat];
    }

    function distanceToPolygonBorderServer(lat, lng, feature) {
      var nearest = nearestPointOnBoundary(lat, lng, feature);
      var dx = lng - nearest[1];
      var dy = lat - nearest[0];
      return Math.sqrt(dx * dx + dy * dy);
    }

    function getPolylabelServer(feature) {
      var rings = getBoundaryRings(feature);
      if (!rings || rings.length === 0) return computeCentroid(feature);
      var bb = getFeatureBbox(feature);
      var bestPoint = null;
      var bestDist = -Infinity;

      var centroid = computeCentroid(feature);
      if (centroid && isPointInGeoJSONFeature(centroid[0], centroid[1], feature)) {
        bestDist = distanceToPolygonBorderServer(centroid[0], centroid[1], feature);
        bestPoint = [centroid[0], centroid[1]];
      }

      var cellW = (bb[2] - bb[0]);
      var cellH = (bb[3] - bb[1]);

      for (var pass = 0; pass < 3; pass++) {
        var gridSize = pass === 0 ? 10 : 8;
        var sMinLng, sMinLat, sMaxLng, sMaxLat;
        if (pass === 0 || !bestPoint) {
          sMinLng = bb[0]; sMinLat = bb[1]; sMaxLng = bb[2]; sMaxLat = bb[3];
        } else {
          var refW = cellW / Math.pow(gridSize, pass);
          var refH = cellH / Math.pow(gridSize, pass);
          sMinLng = bestPoint[1] - refW; sMinLat = bestPoint[0] - refH;
          sMaxLng = bestPoint[1] + refW; sMaxLat = bestPoint[0] + refH;
        }
        for (var gi = 0; gi < gridSize; gi++) {
          for (var gj = 0; gj < gridSize; gj++) {
            var pLng = sMinLng + ((gi + 0.5) / gridSize) * (sMaxLng - sMinLng);
            var pLat = sMinLat + ((gj + 0.5) / gridSize) * (sMaxLat - sMinLat);
            if (isPointInGeoJSONFeature(pLat, pLng, feature)) {
              var d = distanceToPolygonBorderServer(pLat, pLng, feature);
              if (d > bestDist) { bestDist = d; bestPoint = [pLat, pLng]; }
            }
          }
        }
      }
      return bestPoint || centroid;
    }

    function getDistrictPolylabelServer(layerType, districtNum) {
      var cacheKey = layerType + '_' + districtNum;
      if (polylabelCache[cacheKey]) return polylabelCache[cacheKey];
      var feature = getDistrictFeature(layerType, districtNum);
      if (!feature) return getDistrictCentroid(layerType, districtNum);
      var result = getPolylabelServer(feature);
      if (result) polylabelCache[cacheKey] = result;
      return result;
    }

    function getSafeInsetThresholdServer(feature) {
      var bb = getFeatureBbox(feature);
      var diagLng = bb[2] - bb[0];
      var diagLat = bb[3] - bb[1];
      var diag = Math.sqrt(diagLng * diagLng + diagLat * diagLat);
      var threshold = diag * 0.015;
      var minT = 0.001;
      var maxT = 0.01;
      return Math.max(minT, Math.min(maxT, threshold));
    }

    function pushPointTowardInteriorServer(lat, lng, feature, targetDist, hintLat, hintLng) {
      var curLat = lat, curLng = lng;
      for (var iter = 0; iter < 30; iter++) {
        if (!isPointInGeoJSONFeature(curLat, curLng, feature)) {
          curLat = (curLat + hintLat) / 2;
          curLng = (curLng + hintLng) / 2;
          continue;
        }
        var d = distanceToPolygonBorderServer(curLat, curLng, feature);
        if (d >= targetDist) return [curLat, curLng];
        var dx = hintLng - curLng;
        var dy = hintLat - curLat;
        var len = Math.sqrt(dx * dx + dy * dy) || 1;
        var step = Math.max(0.0002, (targetDist - d) * 0.5);
        curLat = curLat + (dy / len) * step;
        curLng = curLng + (dx / len) * step;
      }
      if (isPointInGeoJSONFeature(curLat, curLng, feature)) return [curLat, curLng];
      return [hintLat, hintLng];
    }

    function getBorderSafeBasePointServer(desLat, desLng, feature, layerType, districtNum) {
      var polylabel = getDistrictPolylabelServer(layerType, districtNum);
      if (!polylabel) return [desLat, desLng];
      var safeThreshold = getSafeInsetThresholdServer(feature);

      if (isPointInGeoJSONFeature(desLat, desLng, feature)) {
        var d = distanceToPolygonBorderServer(desLat, desLng, feature);
        if (d >= safeThreshold) return [desLat, desLng];
        return pushPointTowardInteriorServer(desLat, desLng, feature, safeThreshold, polylabel[0], polylabel[1]);
      }

      var nearest = nearestPointOnBoundary(desLat, desLng, feature);
      var pushed = pushPointTowardInteriorServer(nearest[0], nearest[1], feature, safeThreshold, polylabel[0], polylabel[1]);
      if (isPointInGeoJSONFeature(pushed[0], pushed[1], feature) && distanceToPolygonBorderServer(pushed[0], pushed[1], feature) >= safeThreshold) {
        return pushed;
      }
      return polylabel;
    }

    var anchorCacheServer = {};

    function getBorderSafeAnchorsServer(layerType, districtNum) {
      var cacheKey = layerType + '_' + districtNum;
      if (anchorCacheServer[cacheKey]) return anchorCacheServer[cacheKey];
      var feature = getDistrictFeature(layerType, districtNum);
      if (!feature) return [];
      var polylabel = getDistrictPolylabelServer(layerType, districtNum);
      if (!polylabel) return [];
      var safeThreshold = getSafeInsetThresholdServer(feature);
      var bb = getFeatureBbox(feature);
      var gridSize = 7;
      var candidates = [polylabel];
      for (var gi = 0; gi < gridSize; gi++) {
        for (var gj = 0; gj < gridSize; gj++) {
          var lng = bb[0] + ((gi + 0.5) / gridSize) * (bb[2] - bb[0]);
          var lat = bb[1] + ((gj + 0.5) / gridSize) * (bb[3] - bb[1]);
          if (isPointInGeoJSONFeature(lat, lng, feature)) {
            var d = distanceToPolygonBorderServer(lat, lng, feature);
            if (d >= safeThreshold) candidates.push([lat, lng]);
          }
        }
      }
      var maxAnchors = Math.min(6, Math.max(2, candidates.length));
      var selected = [polylabel];
      while (selected.length < maxAnchors && candidates.length > selected.length) {
        var best = null, bestMinDist = -1;
        for (var ci = 0; ci < candidates.length; ci++) {
          var alreadyUsed = false;
          for (var si = 0; si < selected.length; si++) {
            if (candidates[ci] === selected[si]) { alreadyUsed = true; break; }
          }
          if (alreadyUsed) continue;
          var minDist = Infinity;
          for (var si2 = 0; si2 < selected.length; si2++) {
            var dx = candidates[ci][1] - selected[si2][1];
            var dy = candidates[ci][0] - selected[si2][0];
            var dd = dx * dx + dy * dy;
            if (dd < minDist) minDist = dd;
          }
          if (minDist > bestMinDist) { bestMinDist = minDist; best = candidates[ci]; }
        }
        if (best) selected.push(best);
        else break;
      }
      anchorCacheServer[cacheKey] = selected;
      return selected;
    }

    function distancePointToDrawnPolygonServer(lat, lng, drawnCoords) {
      var ring = drawnCoords[0];
      if (!ring || ring.length < 3) return Infinity;
      if (pointInPolygon(lat, lng, ring)) return 0;
      var minDist = Infinity;
      for (var i = 0; i < ring.length - 1; i++) {
        var res = nearestPointOnSegment(lng, lat, ring[i][0], ring[i][1], ring[i + 1][0], ring[i + 1][1]);
        if (res.dist < minDist) minDist = res.dist;
      }
      return minDist;
    }

    function nearestAnchorToDrawnPolygonServer(anchors, drawnCoords) {
      if (!anchors || anchors.length === 0) return null;
      if (!drawnCoords || !drawnCoords[0]) return anchors[0];
      var bestAnchor = anchors[0];
      var bestDist = Infinity;
      for (var i = 0; i < anchors.length; i++) {
        var d = distancePointToDrawnPolygonServer(anchors[i][0], anchors[i][1], drawnCoords);
        if (d < bestDist) { bestDist = d; bestAnchor = anchors[i]; }
      }
      return bestAnchor;
    }

    var activeMarkerStateServer = null;
    var pixelLayoutTimerServer = null;
    var MIN_PX_SERVER = 64;

    function applyPixelLayoutServer() {
      if (!activeMarkerStateServer || activeMarkerStateServer.entries.length < 2) return;
      var entries = activeMarkerStateServer.entries;
      var leafletMarkers = activeMarkerStateServer.leafletMarkers;

      for (var i = 0; i < entries.length; i++) {
        entries[i].pos = [entries[i].basePos[0], entries[i].basePos[1]];
      }

      for (var i2 = 0; i2 < entries.length; i2++) {
        entries[i2].screenPt = map.latLngToContainerPoint(L.latLng(entries[i2].pos[0], entries[i2].pos[1]));
      }

      var hasOverlap = false;
      for (var ci = 0; ci < entries.length && !hasOverlap; ci++) {
        for (var cj = ci + 1; cj < entries.length && !hasOverlap; cj++) {
          var cdx = entries[ci].screenPt.x - entries[cj].screenPt.x;
          var cdy = entries[ci].screenPt.y - entries[cj].screenPt.y;
          if (Math.sqrt(cdx * cdx + cdy * cdy) < MIN_PX_SERVER) hasOverlap = true;
        }
      }

      if (!hasOverlap) {
        for (var ui = 0; ui < entries.length; ui++) {
          if (leafletMarkers[ui]) leafletMarkers[ui].setLatLng(entries[ui].pos);
        }
        return;
      }

      var centerPx = { x: 0, y: 0 };
      for (var ai = 0; ai < entries.length; ai++) {
        centerPx.x += entries[ai].screenPt.x;
        centerPx.y += entries[ai].screenPt.y;
      }
      centerPx.x /= entries.length;
      centerPx.y /= entries.length;

      var radiiPx = [0, 70, 100, 140, 180, 220, 260, 300];
      var anglesPerRing = 12;
      var placed = [];

      for (var idx = 0; idx < entries.length; idx++) {
        var entry = entries[idx];
        var found = false;
        for (var ri = 0; ri < radiiPx.length && !found; ri++) {
          var radius = radiiPx[ri];
          var numAngles = radius === 0 ? 1 : anglesPerRing;
          for (var aii = 0; aii < numAngles && !found; aii++) {
            var angle = -Math.PI / 2 + (2 * Math.PI * aii / numAngles);
            if (radius === 0 && idx > 0) break;
            var candPx = { x: centerPx.x + radius * Math.cos(angle), y: centerPx.y + radius * Math.sin(angle) };
            var candLatLng = map.containerPointToLatLng(L.point(candPx.x, candPx.y));
            var candLat = candLatLng.lat, candLng = candLatLng.lng;
            if (entry.feature && !isPointInGeoJSONFeature(candLat, candLng, entry.feature)) continue;
            if (entry.feature) {
              var bDist = distanceToPolygonBorderServer(candLat, candLng, entry.feature);
              var sThreshold = getSafeInsetThresholdServer(entry.feature);
              if (bDist < sThreshold * 0.25) continue;
            }
            var finalPx = map.latLngToContainerPoint(L.latLng(candLat, candLng));
            var tooClose = false;
            for (var pi = 0; pi < placed.length; pi++) {
              var pPx = entries[placed[pi]].screenPt;
              var pdx = finalPx.x - pPx.x;
              var pdy = finalPx.y - pPx.y;
              if (Math.sqrt(pdx * pdx + pdy * pdy) < MIN_PX_SERVER) { tooClose = true; break; }
            }
            if (!tooClose) {
              entry.pos = [candLat, candLng];
              entry.screenPt = finalPx;
              placed.push(idx);
              found = true;
            }
          }
        }
        if (!found) placed.push(idx);
      }

      for (var fi = 0; fi < entries.length; fi++) {
        if (leafletMarkers[fi]) leafletMarkers[fi].setLatLng(entries[fi].pos);
      }
      console.log('[HEADSHOTS] Pixel layout applied at zoom ' + map.getZoom());
    }

    map.on('moveend', function() {
      if (!activeMarkerStateServer || activeMarkerStateServer.entries.length < 2) return;
      if (pixelLayoutTimerServer) clearTimeout(pixelLayoutTimerServer);
      pixelLayoutTimerServer = setTimeout(function() {
        applyPixelLayoutServer();
      }, 100);
    });
    
    window.setHeadshotMarkers = function(markers, selectionOrigin, selectionMode, drawnPolygon) {
      window.clearHeadshotMarkers();
      activeMarkerStateServer = null;
      var mode = selectionMode || null;
      var MAX_VISIBLE = 10;
      var visible = markers.slice(0, MAX_VISIBLE);
      var overflow = markers.length - MAX_VISIBLE;
      var hasOrigin = selectionOrigin && typeof selectionOrigin.lat === 'number';
      var isDraw = mode === 'draw';
      var hasDrawnPoly = drawnPolygon && drawnPolygon.coordinates && drawnPolygon.coordinates[0];

      var entries = [];
      for (var i = 0; i < visible.length; i++) {
        var m = visible[i];
        var feature = getDistrictFeature(m.layerType, m.districtNumber);
        if (!feature) {
          var centroid = getDistrictCentroid(m.layerType, m.districtNumber);
          if (centroid) {
            entries.push({ m: m, pos: [centroid[0], centroid[1]], basePos: [centroid[0], centroid[1]], feature: null, layerType: m.layerType, key: m.layerType + '_' + m.districtNumber });
          }
          continue;
        }

        var pos;
        if (isDraw && hasDrawnPoly) {
          var anchors = getBorderSafeAnchorsServer(m.layerType, m.districtNumber);
          pos = nearestAnchorToDrawnPolygonServer(anchors, drawnPolygon.coordinates);
          if (!pos) pos = getDistrictPolylabelServer(m.layerType, m.districtNumber);
        } else if (hasOrigin) {
          pos = getBorderSafeBasePointServer(selectionOrigin.lat, selectionOrigin.lng, feature, m.layerType, m.districtNumber);
        } else {
          pos = getDistrictPolylabelServer(m.layerType, m.districtNumber);
        }
        if (!pos) pos = getDistrictCentroid(m.layerType, m.districtNumber);
        if (!pos) continue;

        entries.push({
          m: m,
          pos: [pos[0], pos[1]],
          basePos: [pos[0], pos[1]],
          feature: feature,
          layerType: m.layerType,
          key: m.layerType + '_' + m.districtNumber
        });
      }

      var leafletMarkersArr = [];
      for (var ei = 0; ei < entries.length; ei++) {
        var entry = entries[ei];
        var em = entry.m;

        var innerHtml;
        if (em.photoUrl) {
          innerHtml = '<img src="' + em.photoUrl + '" onerror="this.style.display=\\'none\\';this.nextSibling.style.display=\\'flex\\'" /><div class="headshot-initials" style="display:none">' + getInitials(em.name) + '</div>';
        } else {
          innerHtml = '<div class="headshot-initials">' + getInitials(em.name) + '</div>';
        }

        var html = '<div class="headshot-marker"><div class="headshot-bubble">' + innerHtml + '</div><div class="headshot-tail"></div></div>';
        var icon = L.divIcon({
          className: '',
          html: html,
          iconSize: [48, 62],
          iconAnchor: [24, 62]
        });
        var marker = L.marker(entry.pos, { icon: icon, interactive: true, zIndexOffset: 1000 });
        marker._officialId = em.officialId;
        marker.on('click', function(e) {
          L.DomEvent.stopPropagation(e);
          postMessage({ type: 'headshotMarkerClicked', officialId: this._officialId });
        });
        marker.addTo(map);
        headshotMarkers.push(marker);
        leafletMarkersArr.push(marker);
      }

      activeMarkerStateServer = {
        entries: entries,
        leafletMarkers: leafletMarkersArr
      };

      if (entries.length >= 2) {
        applyPixelLayoutServer();
      }
      
      if (overflow > 0) {
        var overflowPos;
        if (hasOrigin) {
          overflowPos = [selectionOrigin.lat, selectionOrigin.lng];
        } else {
          var sumLat = 0, sumLng = 0, cnt = 0;
          for (var j = 0; j < visible.length; j++) {
            var c = getDistrictCentroid(visible[j].layerType, visible[j].districtNumber);
            if (c) { sumLat += c[0]; sumLng += c[1]; cnt++; }
          }
          overflowPos = cnt > 0 ? [sumLat / cnt, sumLng / cnt] : null;
        }
        if (overflowPos) {
          var oHtml = '<div class="headshot-overflow"><div class="headshot-overflow-bubble">+' + overflow + '</div><div class="headshot-overflow-tail"></div></div>';
          var oIcon = L.divIcon({
            className: '',
            html: oHtml,
            iconSize: [48, 62],
            iconAnchor: [24, 62]
          });
          var oMarker = L.marker(overflowPos, { icon: oIcon, interactive: true, zIndexOffset: 1001 });
          oMarker.on('click', function(e) {
            L.DomEvent.stopPropagation(e);
            postMessage({ type: 'headshotOverflowClicked' });
          });
          oMarker.addTo(map);
          headshotMarkers.push(oMarker);
        }
      }

      console.log('[HEADSHOTS] Set', entries.length, 'markers, mode=' + (mode || 'default') + (isDraw && hasDrawnPoly ? ' (anchor-to-polygon)' : ''));
    };
    
    window.clearHeadshotMarkers = function() {
      for (var i = 0; i < headshotMarkers.length; i++) {
        map.removeLayer(headshotMarkers[i]);
      }
      headshotMarkers = [];
      activeMarkerStateServer = null;
    };
    
    window.receiveMessage = function(message) {
      try {
        var data = JSON.parse(message);
        console.log('[Leaflet] Received message:', data.type);
        
        if (data.type === 'toggleLayer') {
          window.toggleLayer(data.layer, data.visible);
        } else if (data.type === 'setGeoJSON') {
          var layerType = data.layerType;
          var typeKey = layerType === 'tx_senate' ? 'senate' : 
                        layerType === 'tx_house' ? 'house' : 'congress';
          geoJSONData[layerType] = data.geojson;
          loadStatus[layerType].loaded = true;
          loadStatus[layerType].features = data.geojson.features?.length || 0;
          if (layers[typeKey]) {
            map.removeLayer(layers[typeKey]);
          }
          layers[typeKey] = createLayer(typeKey, data.geojson, layerColors[layerType]);
          if (enabledLayers[typeKey]) {
            layers[typeKey].addTo(map);
            layers[typeKey].bringToFront();
          }
        } else if (data.type === 'SET_USER_LOCATION') {
          window.setUserLocation(data.lat, data.lng);
        } else if (data.type === 'CENTER_MAP') {
          window.centerMap(data.lat, data.lng, data.zoom);
        } else if (data.type === 'FOCUS_DISTRICT') {
          window.focusDistrict(data.layer, data.district);
        } else if (data.type === 'SET_ADDRESS_DOTS') {
          window.setAddressDots(data.dots || []);
        } else if (data.type === 'SET_ACTIVE_ADDRESS_DOT') {
          window.setActiveAddressDot(data.officialId);
        } else if (data.type === 'CLEAR_SELECTION') {
          // Clear any selection UI
        } else if (data.type === 'CLEAR_HIGHLIGHTS') {
          console.log('[Leaflet] Received CLEAR_HIGHLIGHTS message');
          window.clearHighlights();
        } else if (data.type === 'HIGHLIGHT_DISTRICTS') {
          console.log('[Leaflet] Received HIGHLIGHT_DISTRICTS, hits:', data.hits?.length);
          window.highlightDistricts(data.hits || []);
        } else if (data.type === 'SET_HEADSHOT_MARKERS') {
          console.log('[Leaflet] Received SET_HEADSHOT_MARKERS, count:', data.markers?.length);
          window.setHeadshotMarkers(data.markers || [], data.selectionOrigin || null, data.selectionMode || null, data.drawnPolygon || null);
        } else if (data.type === 'CLEAR_HEADSHOT_MARKERS') {
          console.log('[Leaflet] Received CLEAR_HEADSHOT_MARKERS');
          window.clearHeadshotMarkers();
        }
      } catch (e) {
        console.error('[Leaflet] Error processing message:', e);
      }
    };
    
    window.addEventListener('message', function(e) {
      if (e.data && typeof e.data === 'string') {
        window.receiveMessage(e.data);
      }
    });
    
    document.addEventListener('message', function(e) {
      window.receiveMessage(e.data);
    });
    
    // Auto-load GeoJSON on page load
    setTimeout(function() {
      console.log('[Leaflet] Auto-loading GeoJSON...');
      postMessage({ type: 'mapReady' });
      
      Promise.all([
        fetchAndSetGeoJSON('tx_senate'),
        fetchAndSetGeoJSON('tx_house'),
        fetchAndSetGeoJSON('us_congress')
      ]).then(function(results) {
        console.log('[Leaflet] All GeoJSON loaded:', results);
        postMessage({ type: 'allGeoJSONLoaded' });
      }).catch(function(err) {
        console.error('[Leaflet] GeoJSON load error:', err);
      });
    }, 100);
  </script>
</body>
</html>`;
}
function createVacantOfficial(source, district) {
  const chamber = source === "TX_HOUSE" ? "TX House" : source === "TX_SENATE" ? "TX Senate" : "US House";
  const vacantId = `VACANT-${source}-${district}`;
  return {
    id: vacantId,
    personId: null,
    source,
    sourceMemberId: vacantId,
    chamber,
    district: String(district),
    fullName: "Vacant District",
    roleTitle: null,
    party: null,
    photoUrl: null,
    capitolAddress: null,
    capitolPhone: null,
    capitolRoom: null,
    districtAddresses: null,
    districtPhones: null,
    website: null,
    email: null,
    active: true,
    lastRefreshedAt: /* @__PURE__ */ new Date(),
    searchZips: null,
    searchCities: null,
    isVacant: true,
    private: null
  };
}
function fillVacancies(officials, source) {
  const range = DISTRICT_RANGES[source];
  const districtMap = /* @__PURE__ */ new Map();
  for (const official of officials) {
    districtMap.set(official.district, { ...official, isVacant: false });
  }
  const result = [];
  for (let d = range.min; d <= range.max; d++) {
    const districtStr = String(d);
    if (districtMap.has(districtStr)) {
      result.push(districtMap.get(districtStr));
    } else {
      result.push(createVacantOfficial(source, d));
    }
  }
  return result;
}
function sourceFromDistrictType(dt) {
  switch (dt) {
    case "tx_house":
      return "TX_HOUSE";
    case "tx_senate":
      return "TX_SENATE";
    case "us_congress":
      return "US_HOUSE";
  }
}
function mergeOfficial(pub, priv) {
  const merged = { ...pub };
  if (priv) {
    merged.private = {
      personalPhone: priv.personalPhone,
      personalAddress: priv.personalAddress,
      spouseName: priv.spouseName,
      childrenNames: priv.childrenNames,
      birthday: priv.birthday,
      anniversary: priv.anniversary,
      notes: priv.notes,
      tags: priv.tags,
      updatedAt: priv.updatedAt,
      addressSource: priv.addressSource
    };
  }
  return merged;
}
async function registerRoutes(app2) {
  maybeRunScheduledRefresh().catch((err) => {
    console.error("[Startup] Failed to check scheduled refresh:", err);
  });
  setTimeout(async () => {
    try {
      const { bulkFillHometowns: bulkFillHometowns2 } = await Promise.resolve().then(() => (init_bulkFillHometowns(), bulkFillHometowns_exports));
      console.log("[Startup] Running automatic hometown backfill...");
      const result = await bulkFillHometowns2();
      console.log(`[Startup] Hometown backfill complete: filled=${result.filled}, skipped=${result.skipped}, notFound=${result.notFound}`);
    } catch (err) {
      console.error("[Startup] Hometown backfill failed:", err);
    }
  }, 15e3);
  startOfficialsRefreshScheduler();
  registerPrayerRoutes(app2);
  app2.get("/api/geojson/tx_house", (_req, res) => {
    res.json(txHouseGeoJSON);
  });
  app2.get("/api/geojson/tx_senate", (_req, res) => {
    res.json(txSenateGeoJSON);
  });
  app2.get("/api/geojson/us_congress", (_req, res) => {
    res.json(usCongressGeoJSON);
  });
  app2.get("/api/geojson/tx_house_full", (_req, res) => {
    res.json(txHouseGeoJSONFull);
  });
  app2.get("/api/geojson/tx_senate_full", (_req, res) => {
    res.json(txSenateGeoJSONFull);
  });
  app2.get("/api/geojson/us_congress_full", (_req, res) => {
    res.json(usCongressGeoJSONFull);
  });
  app2.get("/api/map.html", (_req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.send(getMapHtml());
  });
  app2.get("/api/officials", async (req, res) => {
    try {
      const { district_type, source, search, q, active } = req.query;
      const conditions = [];
      if (active !== "false") {
        conditions.push(eq7(officialPublic.active, true));
      }
      let sourceFilter = null;
      const isAllSources = source === "ALL";
      if (district_type && typeof district_type === "string") {
        const validTypes = ["tx_house", "tx_senate", "us_congress"];
        if (!validTypes.includes(district_type)) {
          return res.status(400).json({ error: "Invalid district_type" });
        }
        sourceFilter = sourceFromDistrictType(district_type);
        conditions.push(eq7(officialPublic.source, sourceFilter));
      }
      if (source && typeof source === "string" && source !== "ALL") {
        const validSources = ["TX_HOUSE", "TX_SENATE", "US_HOUSE", "OTHER_TX"];
        if (!validSources.includes(source)) {
          return res.status(400).json({ error: "Invalid source" });
        }
        sourceFilter = source;
        conditions.push(eq7(officialPublic.source, sourceFilter));
      }
      const publicOfficials = await db.select().from(officialPublic).where(conditions.length > 0 ? and6(...conditions) : void 0);
      const privateData = await db.select().from(officialPrivate);
      const privateMap = new Map(privateData.map((p) => [p.officialPublicId, p]));
      let officials = publicOfficials.map(
        (pub) => mergeOfficial(pub, privateMap.get(pub.id) || null)
      );
      if (isAllSources || !sourceFilter) {
        const houseOfficials = fillVacancies(
          officials.filter((o) => o.source === "TX_HOUSE"),
          "TX_HOUSE"
        );
        const senateOfficials = fillVacancies(
          officials.filter((o) => o.source === "TX_SENATE"),
          "TX_SENATE"
        );
        const congressOfficials = fillVacancies(
          officials.filter((o) => o.source === "US_HOUSE"),
          "US_HOUSE"
        );
        officials = [...houseOfficials, ...senateOfficials, ...congressOfficials];
      } else if (sourceFilter && sourceFilter !== "OTHER_TX") {
        officials = fillVacancies(officials, sourceFilter);
      }
      const searchTerm = search || q;
      if (searchTerm && typeof searchTerm === "string") {
        const term = searchTerm.toLowerCase();
        const beforeCount = officials.length;
        officials = officials.filter((o) => {
          if (o.fullName.toLowerCase().includes(term)) return true;
          if (o.district.includes(term)) return true;
          if (o.isVacant && "vacant".includes(term)) return true;
          if (o.party && o.party.toLowerCase().includes(term)) return true;
          if (o.capitolAddress && o.capitolAddress.toLowerCase().includes(term)) return true;
          if (o.districtAddresses && Array.isArray(o.districtAddresses)) {
            for (const addr of o.districtAddresses) {
              if (typeof addr === "string" && addr.toLowerCase().includes(term)) return true;
            }
          }
          if (o.email && o.email.toLowerCase().includes(term)) return true;
          if (o.website && o.website.toLowerCase().includes(term)) return true;
          if (o.searchZips && o.searchZips.toLowerCase().includes(term)) return true;
          if (o.searchCities && o.searchCities.toLowerCase().includes(term)) return true;
          return false;
        });
        const afterCount = officials.length;
        const bySource = {};
        for (const o of officials) {
          bySource[o.source] = (bySource[o.source] || 0) + 1;
        }
        console.log(`[Search] q="${searchTerm}" | before=${beforeCount} | after=${afterCount} | bySource=${JSON.stringify(bySource)}`);
      }
      const sourceOrder = {
        "TX_HOUSE": 1,
        "TX_SENATE": 2,
        "US_HOUSE": 3
      };
      officials.sort((a, b) => {
        if (isAllSources || !sourceFilter) {
          const orderA = sourceOrder[a.source] || 99;
          const orderB = sourceOrder[b.source] || 99;
          if (orderA !== orderB) return orderA - orderB;
        }
        const distA = parseInt(a.district, 10);
        const distB = parseInt(b.district, 10);
        if (!isNaN(distA) && !isNaN(distB)) {
          if (distA !== distB) return distA - distB;
        }
        const lastA = a.fullName.split(" ").pop() || "";
        const lastB = b.fullName.split(" ").pop() || "";
        return lastA.localeCompare(lastB);
      });
      const vacancyCount = officials.filter((o) => o.isVacant).length;
      res.json({ officials, count: officials.length, vacancyCount });
    } catch (err) {
      console.error("[API] Error fetching officials:", err);
      res.status(500).json({ error: "Failed to fetch officials" });
    }
  });
  app2.post("/api/officials/batch-backfill", async (req, res) => {
    try {
      const { officialIds } = req.body;
      if (!officialIds || !Array.isArray(officialIds)) {
        return res.status(400).json({ error: "officialIds array required" });
      }
      const results = {};
      const privateRecords = await db.select({
        officialPublicId: officialPrivate.officialPublicId,
        personalAddress: officialPrivate.personalAddress,
        addressSource: officialPrivate.addressSource
      }).from(officialPrivate);
      const privateMap = new Map(privateRecords.map((r) => [r.officialPublicId, r]));
      for (const id of officialIds) {
        const priv = privateMap.get(id);
        results[id] = {
          hometown: priv?.personalAddress || null,
          addressSource: priv?.addressSource || null
        };
      }
      res.json({ results });
    } catch (err) {
      console.error("[API] Batch backfill error:", err);
      res.status(500).json({ error: "Batch backfill failed" });
    }
  });
  app2.get("/api/officials/backfill-audit", async (req, res) => {
    try {
      const allPublic = await db.select({
        id: officialPublic.id,
        fullName: officialPublic.fullName,
        source: officialPublic.source,
        district: officialPublic.district
      }).from(officialPublic).where(eq7(officialPublic.active, true));
      const allPrivate = await db.select().from(officialPrivate);
      const privMap = new Map(allPrivate.map((p) => [p.officialPublicId, p]));
      const { isEffectivelyEmpty: isEffectivelyEmpty2 } = await Promise.resolve().then(() => (init_backfillUtils(), backfillUtils_exports));
      const audit = allPublic.map((pub) => {
        const priv = privMap.get(pub.id);
        const address = priv?.personalAddress;
        const addrSource = priv?.addressSource || null;
        return {
          id: pub.id,
          name: pub.fullName,
          source: pub.source,
          district: pub.district,
          hasAddress: !isEffectivelyEmpty2(address),
          address: address || null,
          addressSource: addrSource
        };
      });
      const summary = {
        total: audit.length,
        withAddress: audit.filter((a) => a.hasAddress).length,
        missingAddress: audit.filter((a) => !a.hasAddress).length,
        bySource: {},
        byAddressSource: {}
      };
      for (const a of audit) {
        if (!summary.bySource[a.source]) {
          summary.bySource[a.source] = { total: 0, filled: 0, missing: 0 };
        }
        summary.bySource[a.source].total++;
        if (a.hasAddress) summary.bySource[a.source].filled++;
        else summary.bySource[a.source].missing++;
        const src = a.addressSource || "unknown";
        summary.byAddressSource[src] = (summary.byAddressSource[src] || 0) + 1;
      }
      res.json({ summary, officials: audit });
    } catch (err) {
      console.error("[API] Backfill audit error:", err);
      res.status(500).json({ error: "Audit failed" });
    }
  });
  app2.get("/api/officials/with-addresses", async (req, res) => {
    try {
      const results = await db.select({
        officialId: officialPublic.id,
        fullName: officialPublic.fullName,
        source: officialPublic.source,
        personalAddress: officialPrivate.personalAddress
      }).from(officialPublic).innerJoin(officialPrivate, eq7(officialPublic.id, officialPrivate.officialPublicId)).where(
        and6(
          eq7(officialPublic.active, true),
          sql7`${officialPrivate.personalAddress} IS NOT NULL AND ${officialPrivate.personalAddress} != ''`
        )
      );
      res.json({
        addresses: results.map((r) => ({
          officialId: r.officialId,
          officialName: r.fullName,
          source: r.source,
          personalAddress: r.personalAddress
        }))
      });
    } catch (err) {
      console.error("[API] Error fetching addresses:", err);
      res.status(500).json({ error: "Failed to fetch addresses" });
    }
  });
  app2.get("/api/officials/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const vacantMatch = id.match(/^VACANT-(TX_HOUSE|TX_SENATE|US_HOUSE)-(\d+)$/);
      if (vacantMatch) {
        const source = vacantMatch[1];
        const district = parseInt(vacantMatch[2], 10);
        const vacant = createVacantOfficial(source, district);
        return res.json({ official: vacant });
      }
      const sourceDistrictMatch = id.match(/^(TX_HOUSE|TX_SENATE|US_HOUSE):(\d+)$/);
      if (sourceDistrictMatch) {
        const source = sourceDistrictMatch[1];
        const district = sourceDistrictMatch[2];
        const [pub2] = await db.select().from(officialPublic).where(and6(
          eq7(officialPublic.source, source),
          eq7(officialPublic.district, district),
          eq7(officialPublic.active, true)
        )).limit(1);
        if (!pub2) {
          const vacant = createVacantOfficial(source, parseInt(district, 10));
          return res.json({ official: vacant });
        }
        const [priv2] = await db.select().from(officialPrivate).where(eq7(officialPrivate.officialPublicId, pub2.id)).limit(1);
        const official2 = mergeOfficial(pub2, priv2 || null);
        official2.isVacant = false;
        return res.json({ official: official2 });
      }
      const [pub] = await db.select().from(officialPublic).where(eq7(officialPublic.id, id)).limit(1);
      if (!pub) {
        return res.status(404).json({ error: "Official not found" });
      }
      const [priv] = await db.select().from(officialPrivate).where(eq7(officialPrivate.officialPublicId, id)).limit(1);
      const official = mergeOfficial(pub, priv || null);
      official.isVacant = false;
      res.json({ official });
    } catch (err) {
      console.error("[API] Error fetching official:", err);
      res.status(500).json({ error: "Failed to fetch official" });
    }
  });
  app2.get("/api/officials/by-district", async (req, res) => {
    try {
      const { district_type, district_number } = req.query;
      if (!district_type || !district_number) {
        return res.status(400).json({ error: "district_type and district_number are required" });
      }
      const validTypes = ["tx_house", "tx_senate", "us_congress"];
      if (!validTypes.includes(district_type)) {
        return res.status(400).json({ error: "Invalid district_type" });
      }
      const distNum = String(district_number);
      const source = sourceFromDistrictType(district_type);
      const [pub] = await db.select().from(officialPublic).where(and6(
        eq7(officialPublic.source, source),
        eq7(officialPublic.district, distNum),
        eq7(officialPublic.active, true)
      )).limit(1);
      if (!pub) {
        return res.status(404).json({ error: "Official not found" });
      }
      const [priv] = await db.select().from(officialPrivate).where(eq7(officialPrivate.officialPublicId, pub.id)).limit(1);
      const official = mergeOfficial(pub, priv || null);
      res.json({ official });
    } catch (err) {
      console.error("[API] Error fetching official by district:", err);
      res.status(500).json({ error: "Failed to fetch official" });
    }
  });
  app2.post("/api/officials/by-districts", async (req, res) => {
    try {
      const { districts } = req.body;
      if (!Array.isArray(districts) || districts.length === 0) {
        return res.status(400).json({ error: "districts array is required" });
      }
      const results = [];
      for (const dist of districts) {
        const { source, districtNumber } = dist;
        if (!source || districtNumber === void 0) continue;
        const [pub] = await db.select().from(officialPublic).where(and6(
          eq7(officialPublic.source, source),
          eq7(officialPublic.district, String(districtNumber)),
          eq7(officialPublic.active, true)
        )).limit(1);
        if (pub) {
          const [priv] = await db.select().from(officialPrivate).where(eq7(officialPrivate.officialPublicId, pub.id)).limit(1);
          results.push(mergeOfficial(pub, priv || null));
        } else {
          results.push(createVacantOfficial(source, districtNumber));
        }
      }
      res.json({ officials: results });
    } catch (err) {
      console.error("[API] Error fetching officials by districts:", err);
      res.status(500).json({ error: "Failed to fetch officials" });
    }
  });
  app2.patch("/api/officials/:id/private", async (req, res) => {
    try {
      const { id } = req.params;
      const [pub] = await db.select().from(officialPublic).where(eq7(officialPublic.id, id)).limit(1);
      if (!pub) {
        return res.status(404).json({ error: "Official not found" });
      }
      const parseResult = updateOfficialPrivateSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: "Invalid request body", details: parseResult.error.issues });
      }
      const updateData = parseResult.data;
      const [existing] = await db.select().from(officialPrivate).where(eq7(officialPrivate.officialPublicId, id)).limit(1);
      if (existing) {
        await db.update(officialPrivate).set({
          ...updateData,
          addressSource: "user",
          updatedAt: /* @__PURE__ */ new Date()
        }).where(eq7(officialPrivate.id, existing.id));
      } else {
        let finalUpdateData = { ...updateData };
        let autoFilled = false;
        const addressIsEmpty = !updateData.personalAddress || updateData.personalAddress.trim().length === 0;
        if (addressIsEmpty && pub.fullName) {
          console.log(`[API] Auto-fill: Looking up hometown for new private notes record for "${pub.fullName}"`);
          try {
            const { lookupHometownFromTexasTribune: lookupHometownFromTexasTribune2 } = await Promise.resolve().then(() => (init_texasTribuneLookup(), texasTribuneLookup_exports));
            const result = await lookupHometownFromTexasTribune2(pub.fullName);
            if (result.success && result.hometown) {
              console.log(`[API] Auto-fill: Setting personalAddress to "${result.hometown}" for ${pub.fullName}`);
              finalUpdateData.personalAddress = result.hometown;
              autoFilled = true;
            } else {
              console.log(`[API] Auto-fill: No hometown found for ${pub.fullName}`);
            }
          } catch (error) {
            console.error(`[API] Auto-fill: Error looking up hometown:`, error);
          }
        }
        await db.insert(officialPrivate).values({
          officialPublicId: id,
          ...finalUpdateData,
          addressSource: autoFilled ? "tribune" : "user",
          updatedAt: /* @__PURE__ */ new Date()
        });
      }
      const [updatedPriv] = await db.select().from(officialPrivate).where(eq7(officialPrivate.officialPublicId, id)).limit(1);
      const official = mergeOfficial(pub, updatedPriv);
      res.json({ official });
    } catch (err) {
      console.error("[API] Error updating private data:", err);
      res.status(500).json({ error: "Failed to update private data" });
    }
  });
  app2.post("/api/refresh", async (req, res) => {
    try {
      const { refreshAllOfficials: refreshAllOfficials2 } = await Promise.resolve().then(() => (init_refreshOfficials(), refreshOfficials_exports));
      await refreshAllOfficials2();
      res.json({ success: true, message: "Refresh completed" });
    } catch (err) {
      console.error("[API] Error during manual refresh:", err);
      res.status(500).json({ error: "Refresh failed" });
    }
  });
  app2.post("/admin/refresh/officials", async (req, res) => {
    try {
      const adminToken = process.env.ADMIN_REFRESH_TOKEN;
      const providedToken = req.headers["x-admin-token"];
      if (!adminToken) {
        return res.status(503).json({
          error: "Admin refresh not configured",
          message: "Set ADMIN_REFRESH_TOKEN environment variable"
        });
      }
      if (!providedToken || providedToken !== adminToken) {
        return res.status(401).json({ error: "Invalid or missing admin token" });
      }
      if (getIsRefreshing()) {
        return res.status(409).json({
          error: "Refresh in progress",
          message: "A refresh is already running. Try again later."
        });
      }
      const force = req.query.force === "true";
      console.log(`[Admin] Manual refresh triggered (force=${force})`);
      const result = await checkAndRefreshIfChanged(force);
      res.json({
        success: true,
        force,
        sourcesChecked: result.sourcesChecked,
        sourcesChanged: result.sourcesChanged,
        sourcesRefreshed: result.sourcesRefreshed,
        errors: result.errors,
        durationMs: result.durationMs
      });
    } catch (err) {
      console.error("[Admin] Refresh error:", err);
      res.status(500).json({ error: "Refresh failed", details: String(err) });
    }
  });
  app2.get("/admin/refresh/status", async (req, res) => {
    try {
      const adminToken = process.env.ADMIN_REFRESH_TOKEN;
      const providedToken = req.headers["x-admin-token"];
      if (!adminToken) {
        return res.status(503).json({ error: "Admin not configured" });
      }
      if (!providedToken || providedToken !== adminToken) {
        return res.status(401).json({ error: "Invalid or missing admin token" });
      }
      const refreshStates = await getAllRefreshStates();
      const geoJSONStates = await getGeoJSONRefreshStates();
      const committeeStates = await getAllCommitteeRefreshStates();
      const schedulerStatus = getSchedulerStatus();
      const isRefreshing3 = getIsRefreshing();
      const isRefreshingGeoJSON2 = getIsRefreshingGeoJSON();
      const isRefreshingCommittees = getIsRefreshingCommittees();
      res.json({
        isRefreshing: isRefreshing3,
        isRefreshingGeoJSON: isRefreshingGeoJSON2,
        isRefreshingCommittees,
        scheduler: schedulerStatus,
        officialsSources: refreshStates,
        geoJSONSources: geoJSONStates,
        committeeSources: committeeStates
      });
    } catch (err) {
      console.error("[Admin] Status error:", err);
      res.status(500).json({ error: "Failed to get status" });
    }
  });
  app2.post("/admin/refresh/geojson", async (req, res) => {
    try {
      const adminToken = process.env.ADMIN_REFRESH_TOKEN;
      const providedToken = req.headers["x-admin-token"];
      if (!adminToken) {
        return res.status(503).json({
          error: "Admin refresh not configured",
          message: "Set ADMIN_REFRESH_TOKEN environment variable"
        });
      }
      if (!providedToken || providedToken !== adminToken) {
        return res.status(401).json({ error: "Invalid or missing admin token" });
      }
      if (getIsRefreshingGeoJSON()) {
        return res.status(409).json({
          error: "Refresh in progress",
          message: "A GeoJSON refresh is already running. Try again later."
        });
      }
      const force = req.query.force === "true";
      console.log(`[Admin] Manual GeoJSON refresh triggered (force=${force})`);
      const result = await checkAndRefreshGeoJSONIfChanged(force);
      res.json({
        success: true,
        force,
        sourcesChecked: result.sourcesChecked,
        sourcesChanged: result.sourcesChanged,
        sourcesRefreshed: result.sourcesRefreshed,
        errors: result.errors,
        durationMs: result.durationMs
      });
    } catch (err) {
      console.error("[Admin] GeoJSON refresh error:", err);
      res.status(500).json({ error: "Refresh failed", details: String(err) });
    }
  });
  app2.get("/api/admin/geojson/source-debug", async (req, res) => {
    try {
      const adminToken = process.env.ADMIN_REFRESH_TOKEN;
      const providedToken = req.headers["x-admin-token"];
      if (!adminToken) {
        return res.status(503).json({
          error: "Admin refresh not configured",
          message: "Set ADMIN_REFRESH_TOKEN environment variable"
        });
      }
      if (!providedToken || providedToken !== adminToken) {
        return res.status(401).json({ error: "Invalid or missing admin token" });
      }
      const sources = [
        {
          name: "TX_HOUSE",
          url: "https://services.arcgis.com/KTcxiTD9dsQw4r7Z/ArcGIS/rest/services/Texas_State_House_Districts/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson&resultRecordCount=1"
        },
        {
          name: "TX_SENATE",
          url: "https://services.arcgis.com/KTcxiTD9dsQw4r7Z/ArcGIS/rest/services/Texas_State_Senate_Districts/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson&resultRecordCount=1"
        },
        {
          name: "US_CONGRESS",
          url: "https://services.arcgis.com/KTcxiTD9dsQw4r7Z/ArcGIS/rest/services/Texas_US_House_Districts/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson&resultRecordCount=1"
        }
      ];
      const results = await Promise.all(sources.map(async (source) => {
        try {
          const response = await fetch(source.url);
          const data = await response.json();
          const sampleProps = data.features?.[0]?.properties || {};
          const countUrl = source.url.replace("resultRecordCount=1", "returnCountOnly=true");
          const countResponse = await fetch(countUrl);
          const countData = await countResponse.json();
          return {
            name: source.name,
            featureCount: countData.count,
            samplePropertyKeys: Object.keys(sampleProps),
            sampleDistrictValue: sampleProps.DIST_NBR,
            sampleRepName: sampleProps.REP_NM,
            status: "ok"
          };
        } catch (err) {
          return {
            name: source.name,
            status: "error",
            error: String(err)
          };
        }
      }));
      res.json({ sources: results });
    } catch (err) {
      console.error("[Admin] GeoJSON source debug error:", err);
      res.status(500).json({ error: "Debug failed", details: String(err) });
    }
  });
  app2.get("/api/admin/officials-counts", async (_req, res) => {
    try {
      const counts = await db.select({
        source: officialPublic.source,
        count: sql7`count(*)::int`
      }).from(officialPublic).where(eq7(officialPublic.active, true)).groupBy(officialPublic.source);
      const countsBySource = {
        TX_HOUSE: 0,
        TX_SENATE: 0,
        US_HOUSE: 0
      };
      for (const { source, count } of counts) {
        countsBySource[source] = count;
      }
      const lastRefreshJobs = await db.select().from(refreshJobLog).orderBy(desc2(refreshJobLog.startedAt)).limit(5);
      const lastSuccessfulRefresh = lastRefreshJobs.find((j) => j.status === "success");
      const lastFailedRefresh = lastRefreshJobs.find((j) => j.status === "failed" || j.status === "aborted");
      const result = {
        counts: countsBySource,
        total: countsBySource.TX_HOUSE + countsBySource.TX_SENATE + countsBySource.US_HOUSE,
        lastRefresh: lastSuccessfulRefresh ? {
          source: lastSuccessfulRefresh.source,
          completedAt: lastSuccessfulRefresh.completedAt,
          parsedCount: lastSuccessfulRefresh.parsedCount,
          upsertedCount: lastSuccessfulRefresh.upsertedCount,
          durationMs: lastSuccessfulRefresh.durationMs
        } : null,
        lastError: lastFailedRefresh ? {
          source: lastFailedRefresh.source,
          startedAt: lastFailedRefresh.startedAt,
          status: lastFailedRefresh.status,
          errorMessage: lastFailedRefresh.errorMessage
        } : null,
        recentJobs: lastRefreshJobs.map((j) => ({
          source: j.source,
          status: j.status,
          startedAt: j.startedAt,
          completedAt: j.completedAt,
          errorMessage: j.errorMessage
        }))
      };
      console.log("[API] Admin officials counts:", result.counts);
      res.set("Cache-Control", "no-store, no-cache, must-revalidate");
      res.json(result);
    } catch (err) {
      console.error("[API] Error fetching admin counts:", err);
      res.status(500).json({ error: "Failed to fetch counts" });
    }
  });
  app2.get("/api/stats", async (_req, res) => {
    try {
      const counts = await db.select({
        source: officialPublic.source,
        count: sql7`count(*)::int`
      }).from(officialPublic).where(eq7(officialPublic.active, true)).groupBy(officialPublic.source);
      const stats = {
        tx_house: 0,
        tx_senate: 0,
        us_congress: 0,
        total: 0
      };
      for (const { source, count } of counts) {
        if (source === "TX_HOUSE") stats.tx_house = count;
        if (source === "TX_SENATE") stats.tx_senate = count;
        if (source === "US_HOUSE") stats.us_congress = count;
        stats.total += count;
      }
      if (stats.total === 0) {
        return res.json({
          tx_house: 150,
          tx_senate: 31,
          us_congress: 38,
          total: 219,
          source: "fallback"
        });
      }
      res.json(stats);
    } catch (err) {
      console.error("[API] Error fetching stats:", err);
      res.json({
        tx_house: 150,
        tx_senate: 31,
        us_congress: 38,
        total: 219,
        source: "fallback"
      });
    }
  });
  let cachedGeoJSON = {
    tx_house: null,
    tx_senate: null,
    us_congress: null
  };
  function getGeoJSONForOverlay(overlayType) {
    if (overlayType === "house" || overlayType === "tx_house") {
      if (!cachedGeoJSON.tx_house) {
        cachedGeoJSON.tx_house = txHouseGeoJSON;
      }
      return cachedGeoJSON.tx_house;
    }
    if (overlayType === "senate" || overlayType === "tx_senate") {
      if (!cachedGeoJSON.tx_senate) {
        cachedGeoJSON.tx_senate = txSenateGeoJSON;
      }
      return cachedGeoJSON.tx_senate;
    }
    if (overlayType === "congress" || overlayType === "us_congress") {
      if (!cachedGeoJSON.us_congress) {
        cachedGeoJSON.us_congress = usCongressGeoJSON;
      }
      return cachedGeoJSON.us_congress;
    }
    return null;
  }
  function getSourceFromOverlay(overlay) {
    if (overlay === "house" || overlay === "tx_house") return "TX_HOUSE";
    if (overlay === "senate" || overlay === "tx_senate") return "TX_SENATE";
    return "US_HOUSE";
  }
  function getDistrictNumber(feature) {
    const props = feature.properties || {};
    const districtNum = props.district || props.SLDUST || props.SLDLST || props.CD;
    return districtNum ? parseInt(String(districtNum)) : null;
  }
  app2.get("/api/lookup/place", async (req, res) => {
    try {
      const q = String(req.query.q || "").trim();
      if (q.length < 2) {
        return res.status(400).json({ error: "Query too short (min 2 characters)" });
      }
      const { result, fromCache, error } = await lookupPlace(q);
      if (error) {
        console.log(`[Lookup] Place error: ${error}`);
        return res.status(500).json({ error });
      }
      if (!result) {
        console.log(`[Lookup] No Texas place found for "${q}"`);
        return res.status(404).json({ message: "No Texas place found" });
      }
      console.log(`[Lookup] Place: "${q}" \u2192 ${result.name} (${result.lat}, ${result.lng}) [cache=${fromCache}]`);
      res.json({ ...result, fromCache });
    } catch (err) {
      console.error("[Lookup] Place error:", err);
      res.status(500).json({ error: "Place lookup failed" });
    }
  });
  app2.get("/api/lookup/place/candidates", async (req, res) => {
    try {
      const q = String(req.query.q || "").trim();
      const maxResults = Math.min(parseInt(String(req.query.max || "5"), 10) || 5, 10);
      if (q.length < 2) {
        return res.status(400).json({ error: "Query too short (min 2 characters)" });
      }
      const { results, fromCache, error } = await lookupPlaceCandidates(q, maxResults);
      if (error) {
        console.log(`[Lookup] Place candidates error: ${error}`);
        return res.status(500).json({ error });
      }
      console.log(`[Lookup] Place candidates: "${q}" \u2192 ${results.length} results [cache=${fromCache}]`);
      res.json({ results, fromCache });
    } catch (err) {
      console.error("[Lookup] Place candidates error:", err);
      res.status(500).json({ error: "Place lookup failed" });
    }
  });
  app2.post("/api/lookup/districts-at-point", (req, res) => {
    try {
      const { lat, lng } = req.body;
      if (typeof lat !== "number" || typeof lng !== "number") {
        return res.status(400).json({ error: "lat and lng (numbers) are required" });
      }
      console.log(`[Lookup] Districts at point: (${lat}, ${lng})`);
      const point2 = turf.point([lng, lat]);
      const hits = [];
      const overlayMappings = [
        { overlay: "house", source: "TX_HOUSE" },
        { overlay: "senate", source: "TX_SENATE" },
        { overlay: "congress", source: "US_HOUSE" }
      ];
      for (const { overlay, source } of overlayMappings) {
        const featureCollection = getGeoJSONForOverlay(overlay);
        if (!featureCollection || !featureCollection.features) continue;
        for (const feature of featureCollection.features) {
          try {
            if (turf.booleanPointInPolygon(point2, feature)) {
              const districtNumber = getDistrictNumber(feature);
              if (districtNumber !== null) {
                hits.push({ source, districtNumber });
                break;
              }
            }
          } catch {
          }
        }
      }
      console.log(`[Lookup] Districts found: ${hits.map((h) => `${h.source}:${h.districtNumber}`).join(", ") || "none"}`);
      res.json({ hits, lat, lng });
    } catch (err) {
      console.error("[Lookup] Districts-at-point error:", err);
      res.status(500).json({ error: "Failed to find districts at point" });
    }
  });
  app2.get("/api/lookup/cache-stats", (req, res) => {
    res.json(getCacheStats());
  });
  app2.get("/api/committees", async (req, res) => {
    try {
      const chamber = req.query.chamber;
      let query = db.select().from(committees);
      if (chamber === "TX_HOUSE" || chamber === "TX_SENATE") {
        query = query.where(eq7(committees.chamber, chamber));
      }
      const allCommittees = await query.orderBy(committees.sortOrder, committees.name);
      const parentCommittees = allCommittees.filter((c) => !c.parentCommitteeId);
      const subcommittees = allCommittees.filter((c) => c.parentCommitteeId);
      const result = parentCommittees.map((parent) => ({
        ...parent,
        subcommittees: subcommittees.filter((sub) => sub.parentCommitteeId === parent.id)
      }));
      res.json(result);
    } catch (err) {
      console.error("[API] Error fetching committees:", err);
      res.status(500).json({ error: "Failed to fetch committees" });
    }
  });
  app2.get("/api/committees/:committeeId", async (req, res) => {
    try {
      const { committeeId } = req.params;
      const committee = await db.select().from(committees).where(eq7(committees.id, committeeId)).limit(1);
      if (committee.length === 0) {
        return res.status(404).json({ error: "Committee not found" });
      }
      const members = await db.select({
        id: committeeMemberships.id,
        memberName: committeeMemberships.memberName,
        roleTitle: committeeMemberships.roleTitle,
        sortOrder: committeeMemberships.sortOrder,
        officialPublicId: committeeMemberships.officialPublicId,
        officialName: officialPublic.fullName,
        officialDistrict: officialPublic.district,
        officialParty: officialPublic.party,
        officialPhotoUrl: officialPublic.photoUrl
      }).from(committeeMemberships).leftJoin(officialPublic, eq7(committeeMemberships.officialPublicId, officialPublic.id)).where(eq7(committeeMemberships.committeeId, committeeId)).orderBy(committeeMemberships.sortOrder);
      res.json({
        committee: committee[0],
        members
      });
    } catch (err) {
      console.error("[API] Error fetching committee details:", err);
      res.status(500).json({ error: "Failed to fetch committee details" });
    }
  });
  app2.get("/api/officials/:officialId/committees", async (req, res) => {
    try {
      const { officialId } = req.params;
      const memberships = await db.select({
        committeeId: committees.id,
        committeeName: committees.name,
        chamber: committees.chamber,
        roleTitle: committeeMemberships.roleTitle
      }).from(committeeMemberships).innerJoin(committees, eq7(committeeMemberships.committeeId, committees.id)).where(eq7(committeeMemberships.officialPublicId, officialId)).orderBy(committees.name);
      res.json(memberships);
    } catch (err) {
      console.error("[API] Error fetching official committees:", err);
      res.status(500).json({ error: "Failed to fetch official committees" });
    }
  });
  app2.post("/admin/refresh/committees", async (req, res) => {
    try {
      const adminToken = process.env.ADMIN_REFRESH_TOKEN;
      const providedToken = req.headers["x-admin-token"];
      if (!adminToken) {
        return res.status(500).json({ error: "ADMIN_REFRESH_TOKEN not configured" });
      }
      if (providedToken !== adminToken) {
        return res.status(401).json({ error: "Invalid admin token" });
      }
      const force = req.query.force === "true";
      if (getIsRefreshingCommittees()) {
        return res.status(409).json({ error: "Committees refresh already in progress" });
      }
      console.log(`[Admin] Committees refresh triggered (force=${force})`);
      const result = await checkAndRefreshCommitteesIfChanged(force);
      res.json({
        success: true,
        results: result.results,
        durationMs: result.durationMs
      });
    } catch (err) {
      console.error("[Admin] Committees refresh error:", err);
      res.status(500).json({ error: "Committees refresh failed" });
    }
  });
  app2.get("/api/other-tx-officials", async (req, res) => {
    try {
      const { active, grouped } = req.query;
      const conditions = [eq7(officialPublic.source, "OTHER_TX")];
      if (active !== "false") {
        conditions.push(eq7(officialPublic.active, true));
      }
      const officials = await db.select().from(officialPublic).where(and6(...conditions));
      const privateData = await db.select().from(officialPrivate);
      const privateMap = new Map(privateData.map((p) => [p.officialPublicId, p]));
      const merged = officials.map(
        (pub) => mergeOfficial(pub, privateMap.get(pub.id) || null)
      );
      if (grouped === "true") {
        const groupedOfficials = {
          executive: [],
          secretaryOfState: [],
          supremeCourt: [],
          criminalAppeals: []
        };
        for (const official of merged) {
          const role = official.roleTitle || "";
          if (role.includes("Supreme Court")) {
            groupedOfficials.supremeCourt.push(official);
          } else if (role.includes("Criminal Appeals")) {
            groupedOfficials.criminalAppeals.push(official);
          } else if (role.includes("Secretary of State")) {
            groupedOfficials.secretaryOfState.push(official);
          } else {
            groupedOfficials.executive.push(official);
          }
        }
        const extractPlace = (role) => {
          const match = role.match(/Place (\d+)/);
          return match ? parseInt(match[1], 10) : 0;
        };
        groupedOfficials.supremeCourt.sort(
          (a, b) => extractPlace(a.roleTitle || "") - extractPlace(b.roleTitle || "")
        );
        groupedOfficials.criminalAppeals.sort(
          (a, b) => extractPlace(a.roleTitle || "") - extractPlace(b.roleTitle || "")
        );
        res.json({
          grouped: groupedOfficials,
          counts: {
            executive: groupedOfficials.executive.length,
            secretaryOfState: groupedOfficials.secretaryOfState.length,
            supremeCourt: groupedOfficials.supremeCourt.length,
            criminalAppeals: groupedOfficials.criminalAppeals.length,
            total: merged.length
          }
        });
        return;
      }
      res.json(merged);
    } catch (err) {
      console.error("[API] Error fetching other TX officials:", err);
      res.status(500).json({ error: "Failed to fetch other TX officials" });
    }
  });
  app2.post("/admin/refresh/other-tx-officials", async (req, res) => {
    try {
      const adminToken = process.env.ADMIN_REFRESH_TOKEN;
      const providedToken = req.headers["x-admin-token"];
      if (!adminToken) {
        return res.status(500).json({ error: "ADMIN_REFRESH_TOKEN not configured" });
      }
      if (providedToken !== adminToken) {
        return res.status(401).json({ error: "Invalid admin token" });
      }
      const force = req.query.force === "true";
      console.log(`[Admin] Other TX Officials refresh triggered (force=${force})`);
      const { refreshOtherTexasOfficials: refreshOtherTexasOfficials2 } = await Promise.resolve().then(() => (init_refreshOtherTexasOfficials(), refreshOtherTexasOfficials_exports));
      const result = await refreshOtherTexasOfficials2({ force });
      res.json({
        success: result.success,
        fingerprint: result.fingerprint,
        changed: result.changed,
        upsertedCount: result.upsertedCount,
        deactivatedCount: result.deactivatedCount,
        totalOfficials: result.totalOfficials,
        breakdown: result.breakdown,
        sources: result.sources,
        error: result.error
      });
    } catch (err) {
      console.error("[Admin] Other TX Officials refresh error:", err);
      res.status(500).json({ error: "Other TX Officials refresh failed" });
    }
  });
  app2.post("/admin/backfill/headshots", async (req, res) => {
    try {
      const adminToken = process.env.ADMIN_REFRESH_TOKEN;
      const providedToken = req.headers["x-admin-token"];
      if (!adminToken) {
        return res.status(503).json({ error: "Admin not configured" });
      }
      if (providedToken !== adminToken) {
        return res.status(401).json({ error: "Invalid admin token" });
      }
      const { lookupHeadshotFromTexasTribune: lookupHeadshotFromTexasTribune2 } = await Promise.resolve().then(() => (init_texasTribuneLookup(), texasTribuneLookup_exports));
      const officials = await db.select({
        id: officialPublic.id,
        fullName: officialPublic.fullName,
        source: officialPublic.source,
        photoUrl: officialPublic.photoUrl
      }).from(officialPublic).where(and6(
        eq7(officialPublic.active, true),
        inArray2(officialPublic.source, ["TX_HOUSE", "TX_SENATE"]),
        or3(
          isNull4(officialPublic.photoUrl),
          eq7(officialPublic.photoUrl, "")
        )
      ));
      console.log(`[Admin] Headshot backfill: ${officials.length} officials missing photos`);
      res.json({
        message: "Headshot backfill started",
        totalToProcess: officials.length
      });
      let found = 0;
      let failed = 0;
      for (const official of officials) {
        try {
          const result = await lookupHeadshotFromTexasTribune2(official.fullName);
          if (result.success && result.photoUrl) {
            await db.update(officialPublic).set({ photoUrl: result.photoUrl }).where(eq7(officialPublic.id, official.id));
            found++;
            console.log(`[Headshot] ${found}/${officials.length} Found: ${official.fullName}`);
          } else {
            failed++;
            console.log(`[Headshot] Not found: ${official.fullName}`);
          }
        } catch (err) {
          failed++;
          console.error(`[Headshot] Error for ${official.fullName}:`, err);
        }
        await new Promise((r) => setTimeout(r, 1e3));
      }
      console.log(`[Admin] Headshot backfill complete: ${found} found, ${failed} not found`);
    } catch (err) {
      console.error("[Admin] Headshot backfill error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Headshot backfill failed" });
      }
    }
  });
  app2.post("/admin/person/link", async (req, res) => {
    try {
      const adminToken = process.env.ADMIN_REFRESH_TOKEN;
      const providedToken = req.headers["x-admin-token"];
      if (!adminToken) {
        return res.status(503).json({ error: "Admin not configured" });
      }
      if (providedToken !== adminToken) {
        return res.status(401).json({ error: "Invalid admin token" });
      }
      const { officialPublicId, personId } = req.body;
      if (!officialPublicId || !personId) {
        return res.status(400).json({ error: "officialPublicId and personId are required" });
      }
      const official = await db.select().from(officialPublic).where(eq7(officialPublic.id, officialPublicId)).limit(1);
      if (official.length === 0) {
        return res.status(404).json({ error: "Official not found" });
      }
      const { persons: persons3 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
      const person = await db.select().from(persons3).where(eq7(persons3.id, personId)).limit(1);
      if (person.length === 0) {
        return res.status(404).json({ error: "Person not found" });
      }
      const { setExplicitPersonLink: setExplicitPersonLink2 } = await Promise.resolve().then(() => (init_identityResolver(), identityResolver_exports));
      const result = await setExplicitPersonLink2(officialPublicId, personId);
      console.log(`[Admin] Created explicit person link: official ${officialPublicId} -> person ${personId}`);
      res.json({
        success: true,
        link: result,
        official: official[0],
        person: person[0]
      });
    } catch (err) {
      console.error("[Admin] Person link error:", err);
      res.status(500).json({ error: "Failed to create person link" });
    }
  });
  app2.get("/admin/status", async (req, res) => {
    try {
      const adminToken = process.env.ADMIN_REFRESH_TOKEN;
      const providedToken = req.headers["x-admin-token"];
      if (!adminToken) {
        return res.status(503).json({ error: "Admin not configured" });
      }
      if (providedToken !== adminToken) {
        return res.status(401).json({ error: "Invalid admin token" });
      }
      const { getIdentityStats: getIdentityStats2, getAllExplicitPersonLinks: getAllExplicitPersonLinks2 } = await Promise.resolve().then(() => (init_identityResolver(), identityResolver_exports));
      const identityStats = await getIdentityStats2();
      const explicitLinks = await getAllExplicitPersonLinks2();
      const officialsStates = await getAllRefreshStates();
      const geojsonStates = await getGeoJSONRefreshStates();
      const committeesStates = await getAllCommitteeRefreshStates();
      const schedulerStatus = getSchedulerStatus();
      const datasets = {
        officials: {
          TX_HOUSE: officialsStates.find((s) => s.source === "TX_HOUSE") || null,
          TX_SENATE: officialsStates.find((s) => s.source === "TX_SENATE") || null,
          US_HOUSE: officialsStates.find((s) => s.source === "US_HOUSE") || null,
          isRefreshing: getIsRefreshing()
        },
        other_tx_officials: {
          note: "Static data source - no refresh state tracking"
        },
        geojson: {
          states: geojsonStates,
          isRefreshing: getIsRefreshingGeoJSON()
        },
        committees: {
          states: committeesStates,
          isRefreshing: getIsRefreshingCommittees()
        }
      };
      res.json({
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        scheduler: schedulerStatus,
        datasets,
        identity: {
          ...identityStats,
          explicitLinksDetails: explicitLinks
        }
      });
    } catch (err) {
      console.error("[Admin] Status error:", err);
      res.status(500).json({ error: "Failed to get system status" });
    }
  });
  app2.post("/api/map/area-hits", (req, res) => {
    try {
      const { geometry, overlays } = req.body;
      if (!geometry || geometry.type !== "Polygon" || !Array.isArray(geometry.coordinates)) {
        return res.status(400).json({ error: "Invalid geometry: must be a Polygon" });
      }
      if (!overlays || typeof overlays !== "object") {
        return res.status(400).json({ error: "overlays object is required" });
      }
      console.log("[API] /api/map/area-hits - geometry points:", geometry.coordinates[0]?.length);
      console.log("[API] /api/map/area-hits - overlays:", JSON.stringify(overlays));
      const drawnPolygon = turf.polygon(geometry.coordinates);
      const hits = [];
      const hitDebug = {};
      const overlayTypes = ["house", "senate", "congress"];
      for (const overlayType of overlayTypes) {
        if (!overlays[overlayType]) continue;
        const featureCollection = getGeoJSONForOverlay(overlayType);
        if (!featureCollection || !featureCollection.features) {
          console.log(`[API] No GeoJSON for overlay: ${overlayType}`);
          continue;
        }
        let hitCount = 0;
        for (const feature of featureCollection.features) {
          try {
            if (booleanIntersects(drawnPolygon, feature)) {
              const districtNumber = getDistrictNumber(feature);
              if (districtNumber !== null) {
                const source = getSourceFromOverlay(overlayType);
                const alreadyExists = hits.some(
                  (h) => h.source === source && h.districtNumber === districtNumber
                );
                if (!alreadyExists) {
                  hits.push({ source, districtNumber });
                  hitCount++;
                }
              }
            }
          } catch (intersectErr) {
          }
        }
        hitDebug[overlayType] = hitCount;
      }
      console.log("[API] /api/map/area-hits - hits per overlay:", JSON.stringify(hitDebug));
      console.log("[API] /api/map/area-hits - total hits:", hits.length);
      res.json({ hits });
    } catch (err) {
      console.error("[API] Error in /api/map/area-hits:", err);
      res.status(500).json({ error: "Failed to compute area hits" });
    }
  });
  app2.get("/api/photo-proxy", async (req, res) => {
    try {
      const url = req.query.url;
      if (!url) {
        return res.status(400).json({ error: "Missing url parameter" });
      }
      const allowedDomains = [
        "directory.texastribune.org",
        "www.congress.gov",
        "congress.gov",
        "bioguide.congress.gov"
      ];
      let parsedUrl;
      try {
        parsedUrl = new URL(url);
      } catch {
        return res.status(400).json({ error: "Invalid URL" });
      }
      if (!allowedDomains.includes(parsedUrl.hostname)) {
        return res.status(403).json({ error: "Domain not allowed" });
      }
      const imageResponse = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          "Referer": `https://${parsedUrl.hostname}/`
        }
      });
      if (!imageResponse.ok) {
        return res.status(imageResponse.status).json({ error: "Failed to fetch image" });
      }
      const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
      const buffer = Buffer.from(await imageResponse.arrayBuffer());
      res.set({
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=604800, immutable",
        "Content-Length": String(buffer.length)
      });
      res.send(buffer);
    } catch (error) {
      console.error("[API] Photo proxy error:", error);
      res.status(500).json({ error: "Photo proxy failed" });
    }
  });
  const httpServer = createServer(app2);
  return httpServer;
}

// server/index.ts
import * as fs3 from "fs";
import * as path3 from "path";
import * as http from "http";
var app = express();
var log = console.log;
function setupCors(app2) {
  app2.use((req, res, next) => {
    const origins = /* @__PURE__ */ new Set();
    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }
    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }
    const origin = req.header("origin");
    if (origin && origins.has(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, PATCH, DELETE, OPTIONS"
      );
      res.header("Access-Control-Allow-Headers", "Content-Type");
      res.header("Access-Control-Allow-Credentials", "true");
    }
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });
}
function setupBodyParsing(app2) {
  app2.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      }
    })
  );
  app2.use(express.urlencoded({ extended: false }));
}
function setupRequestLogging(app2) {
  app2.use((req, res, next) => {
    const start = Date.now();
    const path4 = req.path;
    let capturedJsonResponse = void 0;
    const originalResJson = res.json;
    res.json = function(bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };
    res.on("finish", () => {
      if (!path4.startsWith("/api")) return;
      const duration = Date.now() - start;
      let logLine = `${req.method} ${path4} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    });
    next();
  });
}
function getAppName() {
  try {
    const appJsonPath = path3.resolve(process.cwd(), "app.json");
    const appJsonContent = fs3.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}
function serveExpoManifest(platform, req, res) {
  const manifestPath = path3.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json"
  );
  if (!fs3.existsSync(manifestPath)) {
    return res.status(404).json({ error: `Manifest not found for platform: ${platform}` });
  }
  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");
  const manifest = JSON.parse(fs3.readFileSync(manifestPath, "utf-8"));
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host") || "";
  const requestBaseUrl = `${protocol}://${host}`;
  const hostWithoutProtocol = host;
  if (manifest.launchAsset?.url) {
    const originalUrl = new URL(manifest.launchAsset.url);
    manifest.launchAsset.url = `${requestBaseUrl}${originalUrl.pathname}`;
  }
  if (manifest.assets) {
    manifest.assets.forEach((asset) => {
      if (asset.url) {
        const originalUrl = new URL(asset.url);
        asset.url = `${requestBaseUrl}${originalUrl.pathname}`;
      }
    });
  }
  if (manifest.extra?.expoClient) {
    manifest.extra.expoClient.hostUri = `${hostWithoutProtocol}/${platform}`;
  }
  if (manifest.extra?.expoGo) {
    manifest.extra.expoGo.debuggerHost = `${hostWithoutProtocol}/${platform}`;
  }
  if (manifest.extra?.expoClient?.iconUrl) {
    const originalUrl = new URL(manifest.extra.expoClient.iconUrl);
    manifest.extra.expoClient.iconUrl = `${requestBaseUrl}${originalUrl.pathname}`;
  }
  if (manifest.extra?.expoClient?.android?.adaptiveIcon) {
    const icon = manifest.extra.expoClient.android.adaptiveIcon;
    for (const key of ["foregroundImageUrl", "monochromeImageUrl", "backgroundImageUrl"]) {
      if (icon[key]) {
        const originalUrl = new URL(icon[key]);
        icon[key] = `${requestBaseUrl}${originalUrl.pathname}`;
      }
    }
  }
  log(`[Manifest] Serving ${platform} manifest with baseUrl: ${requestBaseUrl}`);
  res.json(manifest);
}
function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;
  log(`baseUrl`, baseUrl);
  log(`expsUrl`, expsUrl);
  const html = landingPageTemplate.replace(/BASE_URL_PLACEHOLDER/g, baseUrl).replace(/EXPS_URL_PLACEHOLDER/g, expsUrl).replace(/APP_NAME_PLACEHOLDER/g, appName);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}
function configureExpoAndLanding(app2) {
  const templatePath = path3.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html"
  );
  const landingPageTemplate = fs3.readFileSync(templatePath, "utf-8");
  const appName = getAppName();
  log("Serving static Expo files with dynamic manifest routing");
  app2.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    if (req.path !== "/" && req.path !== "/manifest") {
      return next();
    }
    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      return serveExpoManifest(platform, req, res);
    }
    if (req.path === "/") {
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName
      });
    }
    next();
  });
  app2.use("/assets", express.static(path3.resolve(process.cwd(), "assets")));
  app2.use(express.static(path3.resolve(process.cwd(), "static-build")));
  log("Expo routing: Checking expo-platform header on / and /manifest");
}
function setupErrorHandler(app2) {
  app2.use((err, _req, res, _next) => {
    const error = err;
    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });
}
(async () => {
  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);
  configureExpoAndLanding(app);
  const server = await registerRoutes(app);
  setupErrorHandler(app);
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true
    },
    () => {
      log(`express server serving on port ${port}`);
    }
  );
  if (process.env.NODE_ENV === "development") {
    const EXPO_PORT = 8081;
    const expoServer = http.createServer((req, res) => {
      app(req, res);
    });
    expoServer.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        log(`[ExpoServer] Port ${EXPO_PORT} in use (Metro running?), will retry in 5s...`);
        setTimeout(() => {
          expoServer.close();
          expoServer.listen({ port: EXPO_PORT, host: "0.0.0.0" });
        }, 5e3);
      }
    });
    expoServer.listen({ port: EXPO_PORT, host: "0.0.0.0" }, () => {
      log(`[ExpoServer] Serving static Expo manifests on port ${EXPO_PORT}`);
    });
  }
})();

import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, timestamp, json, pgEnum, uniqueIndex, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Source enum for officials
export const sourceEnum = pgEnum("source_type", ["TX_HOUSE", "TX_SENATE", "US_HOUSE", "OTHER_TX"]);

// Persons table - stable identity for officials across position changes
export const persons = pgTable("persons", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  fullNameCanonical: varchar("full_name_canonical", { length: 255 }).notNull(), // Normalized name for matching
  fullNameDisplay: varchar("full_name_display", { length: 255 }).notNull(), // Display name
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Official public data - refreshable from authoritative sources
export const officialPublic = pgTable("official_public", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  personId: varchar("person_id", { length: 255 })
    .references(() => persons.id), // Links to stable person identity
  source: sourceEnum("source").notNull(),
  sourceMemberId: varchar("source_member_id", { length: 255 }).notNull(),
  chamber: varchar("chamber", { length: 50 }).notNull(),
  district: varchar("district", { length: 20 }).notNull(),
  fullName: varchar("full_name", { length: 255 }).notNull(),
  roleTitle: varchar("role_title", { length: 255 }), // For OTHER_TX: Governor, Lt Governor, etc.
  party: varchar("party", { length: 10 }),
  photoUrl: text("photo_url"),
  capitolAddress: text("capitol_address"),
  capitolPhone: varchar("capitol_phone", { length: 50 }),
  // Capitol room/office number scraped from TLO (e.g., "E2.406")
  // Format: Building code + room number, parsed from "EXT E2.406" format
  // NOTE: If schema is regenerated, this field must be re-added here
  capitolRoom: varchar("capitol_room", { length: 50 }),
  districtAddresses: json("district_addresses").$type<string[]>(),
  districtPhones: json("district_phones").$type<string[]>(),
  website: text("website"),
  email: varchar("email", { length: 255 }),
  active: boolean("active").default(true).notNull(),
  lastRefreshedAt: timestamp("last_refreshed_at").defaultNow().notNull(),
  // Normalized search fields - derived from addresses for faster search
  searchZips: text("search_zips"), // Comma-separated unique ZIPs (e.g., "78711,75570")
  searchCities: text("search_cities"), // Comma-separated unique cities (e.g., "Austin,New Boston")
}, (table) => ({
  sourceIdUnique: uniqueIndex("source_member_unique_idx").on(table.source, table.sourceMemberId),
}));

// Official private data - user-entered only, never touched by refresh
// Now keyed by personId for continuity across position changes
export const officialPrivate = pgTable("official_private", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  personId: varchar("person_id", { length: 255 })
    .references(() => persons.id), // New: keyed by person for continuity
  officialPublicId: varchar("official_public_id", { length: 255 })
    .references(() => officialPublic.id), // Legacy: kept for backwards compatibility
  personalPhone: varchar("personal_phone", { length: 50 }),
  personalAddress: text("personal_address"),
  spouseName: varchar("spouse_name", { length: 255 }),
  childrenNames: json("children_names").$type<string[]>(),
  birthday: varchar("birthday", { length: 20 }),
  anniversary: varchar("anniversary", { length: 20 }),
  notes: text("notes"),
  tags: json("tags").$type<string[]>(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Refresh state tracking - fingerprints and timestamps per source
export const refreshState = pgTable("refresh_state", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  source: sourceEnum("source").notNull().unique(),
  fingerprint: text("fingerprint"), // Hash of upstream data to detect changes
  lastCheckedAt: timestamp("last_checked_at"), // Last time we checked upstream
  lastChangedAt: timestamp("last_changed_at"), // Last time data actually changed
  lastRefreshedAt: timestamp("last_refreshed_at"), // Last time we ran a refresh
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Refresh job tracking for fail-safe validation
export const refreshJobLog = pgTable("refresh_job_log", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  source: sourceEnum("source").notNull(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  status: varchar("status", { length: 20 }).notNull(), // 'running', 'success', 'failed', 'aborted'
  parsedCount: varchar("parsed_count", { length: 10 }),
  upsertedCount: varchar("upserted_count", { length: 10 }),
  skippedCount: varchar("skipped_count", { length: 10 }),
  deactivatedCount: varchar("deactivated_count", { length: 10 }),
  errorMessage: text("error_message"),
  durationMs: varchar("duration_ms", { length: 20 }),
});

// Person links table - explicit admin overrides for identity resolution
export const personLinks = pgTable("person_links", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  officialPublicId: varchar("official_public_id", { length: 255 })
    .notNull()
    .unique()
    .references(() => officialPublic.id, { onDelete: "cascade" }),
  personId: varchar("person_id", { length: 255 })
    .notNull()
    .references(() => persons.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Types
export type PersonLink = typeof personLinks.$inferSelect;
export type InsertPersonLink = typeof personLinks.$inferInsert;
export type Person = typeof persons.$inferSelect;
export type InsertPerson = typeof persons.$inferInsert;
export type OfficialPublic = typeof officialPublic.$inferSelect;
export type InsertOfficialPublic = typeof officialPublic.$inferInsert;
export type OfficialPrivate = typeof officialPrivate.$inferSelect;
export type InsertOfficialPrivate = typeof officialPrivate.$inferInsert;
export type RefreshJobLog = typeof refreshJobLog.$inferSelect;
export type RefreshState = typeof refreshState.$inferSelect;
export type InsertRefreshState = typeof refreshState.$inferInsert;

// District ranges for each chamber
export const DISTRICT_RANGES = {
  TX_HOUSE: { min: 1, max: 150 },
  TX_SENATE: { min: 1, max: 31 },
  US_HOUSE: { min: 1, max: 38 },
} as const;

// Chamber enum for committees
export const chamberEnum = pgEnum("chamber_type", ["TX_HOUSE", "TX_SENATE"]);

// Committees table
export const committees = pgTable("committees", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  chamber: chamberEnum("chamber").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull(),
  sourceUrl: text("source_url"),
  parentCommitteeId: varchar("parent_committee_id", { length: 255 }), // For subcommittees
  sortOrder: varchar("sort_order", { length: 10 }), // For stable ordering
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  chamberSlugUnique: uniqueIndex("committee_chamber_slug_idx").on(table.chamber, table.slug),
}));

// Committee memberships table - links officials to committees with roles
export const committeeMemberships = pgTable("committee_memberships", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  committeeId: varchar("committee_id", { length: 255 })
    .notNull()
    .references(() => committees.id, { onDelete: "cascade" }),
  officialPublicId: varchar("official_public_id", { length: 255 })
    .references(() => officialPublic.id, { onDelete: "set null" }),
  // Fallback matching fields when official isn't directly linkable
  memberName: varchar("member_name", { length: 255 }).notNull(),
  roleTitle: varchar("role_title", { length: 100 }),
  sortOrder: varchar("sort_order", { length: 10 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Committee refresh state tracking (separate from officials refresh_state due to different source enum)
export const committeeRefreshState = pgTable("committee_refresh_state", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  source: varchar("source", { length: 50 }).notNull().unique(), // TX_HOUSE_COMMITTEES, TX_SENATE_COMMITTEES
  fingerprint: text("fingerprint"),
  lastCheckedAt: timestamp("last_checked_at"),
  lastChangedAt: timestamp("last_changed_at"),
  lastRefreshedAt: timestamp("last_refreshed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Types
export type Committee = typeof committees.$inferSelect;
export type InsertCommittee = typeof committees.$inferInsert;
export type CommitteeMembership = typeof committeeMemberships.$inferSelect;
export type InsertCommitteeMembership = typeof committeeMemberships.$inferInsert;
export type CommitteeRefreshState = typeof committeeRefreshState.$inferSelect;

// Merged official type for API responses
export interface MergedOfficial extends OfficialPublic {
  private?: Omit<OfficialPrivate, 'id' | 'officialPublicId' | 'personId'> | null;
  isVacant?: boolean;
  person?: Person | null;
}

// Other Texas Officials role titles
export const OTHER_TX_ROLES = [
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
  "Secretary of State",
] as const;

export type OtherTxRole = typeof OTHER_TX_ROLES[number];

// Insert schemas for validation
export const insertOfficialPublicSchema = createInsertSchema(officialPublic);
export const insertOfficialPrivateSchema = createInsertSchema(officialPrivate);

// Update schema for private data (partial updates allowed)
export const updateOfficialPrivateSchema = z.object({
  personalPhone: z.string().nullable().optional(),
  personalAddress: z.string().nullable().optional(),
  spouseName: z.string().nullable().optional(),
  childrenNames: z.array(z.string()).nullable().optional(),
  birthday: z.string().nullable().optional(),
  anniversary: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
});

export type UpdateOfficialPrivate = z.infer<typeof updateOfficialPrivateSchema>;

// ── Prayer System ──

export const prayerStatusEnum = pgEnum("prayer_status", ["OPEN", "ANSWERED", "ARCHIVED"]);

export const prayerCategories = pgTable("prayer_categories", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull().unique(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const prayers = pgTable("prayers", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  title: varchar("title", { length: 500 }).notNull(),
  body: text("body").notNull(),
  status: prayerStatusEnum("status").default("OPEN").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  answeredAt: timestamp("answered_at"),
  archivedAt: timestamp("archived_at"),
  answerNote: text("answer_note"),
  categoryId: varchar("category_id", { length: 255 })
    .references(() => prayerCategories.id, { onDelete: "set null" }),
  officialIds: json("official_ids").$type<string[]>().default([]),
  pinnedDaily: boolean("pinned_daily").default(false).notNull(),
  priority: integer("priority").default(0).notNull(),
  lastShownAt: timestamp("last_shown_at"),
  lastPrayedAt: timestamp("last_prayed_at"),
});

export const dailyPrayerPicks = pgTable("daily_prayer_picks", {
  dateKey: varchar("date_key", { length: 10 }).primaryKey(),
  prayerIds: json("prayer_ids").$type<string[]>().notNull(),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
});

export const prayerStreak = pgTable("prayer_streak", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  currentStreak: integer("current_streak").default(0).notNull(),
  lastCompletedDateKey: varchar("last_completed_date_key", { length: 10 }),
  longestStreak: integer("longest_streak").default(0).notNull(),
});

export const appSettings = pgTable("app_settings", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Prayer types
export type Prayer = typeof prayers.$inferSelect;
export type InsertPrayer = typeof prayers.$inferInsert;
export type PrayerCategory = typeof prayerCategories.$inferSelect;
export type InsertPrayerCategory = typeof prayerCategories.$inferInsert;
export type DailyPrayerPick = typeof dailyPrayerPicks.$inferSelect;
export type PrayerStreakRow = typeof prayerStreak.$inferSelect;
export type AppSetting = typeof appSettings.$inferSelect;

export const insertPrayerSchema = z.object({
  title: z.string().min(1).max(500),
  body: z.string().min(1),
  categoryId: z.string().nullable().optional(),
  officialIds: z.array(z.string()).optional(),
  pinnedDaily: z.boolean().optional(),
  priority: z.number().int().min(0).max(1).optional(),
});

export const updatePrayerSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  body: z.string().min(1).optional(),
  categoryId: z.string().nullable().optional(),
  officialIds: z.array(z.string()).optional(),
  pinnedDaily: z.boolean().optional(),
  priority: z.number().int().min(0).max(1).optional(),
});

export type InsertPrayerInput = z.infer<typeof insertPrayerSchema>;
export type UpdatePrayerInput = z.infer<typeof updatePrayerSchema>;

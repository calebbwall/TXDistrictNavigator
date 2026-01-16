import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, timestamp, json, pgEnum, uniqueIndex } from "drizzle-orm/pg-core";
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
export const sourceEnum = pgEnum("source_type", ["TX_HOUSE", "TX_SENATE", "US_HOUSE"]);

// Official public data - refreshable from authoritative sources
export const officialPublic = pgTable("official_public", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  source: sourceEnum("source").notNull(),
  sourceMemberId: varchar("source_member_id", { length: 255 }).notNull(),
  chamber: varchar("chamber", { length: 50 }).notNull(),
  district: varchar("district", { length: 20 }).notNull(),
  fullName: varchar("full_name", { length: 255 }).notNull(),
  party: varchar("party", { length: 10 }),
  photoUrl: text("photo_url"),
  capitolAddress: text("capitol_address"),
  capitolPhone: varchar("capitol_phone", { length: 50 }),
  districtAddresses: json("district_addresses").$type<string[]>(),
  districtPhones: json("district_phones").$type<string[]>(),
  website: text("website"),
  email: varchar("email", { length: 255 }),
  active: boolean("active").default(true).notNull(),
  lastRefreshedAt: timestamp("last_refreshed_at").defaultNow().notNull(),
}, (table) => ({
  sourceIdUnique: uniqueIndex("source_member_unique_idx").on(table.source, table.sourceMemberId),
}));

// Official private data - user-entered only, never touched by refresh
export const officialPrivate = pgTable("official_private", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  officialPublicId: varchar("official_public_id", { length: 255 })
    .notNull()
    .unique()
    .references(() => officialPublic.id),
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

// Types
export type OfficialPublic = typeof officialPublic.$inferSelect;
export type InsertOfficialPublic = typeof officialPublic.$inferInsert;
export type OfficialPrivate = typeof officialPrivate.$inferSelect;
export type InsertOfficialPrivate = typeof officialPrivate.$inferInsert;
export type RefreshJobLog = typeof refreshJobLog.$inferSelect;

// Merged official type for API responses
export interface MergedOfficial extends OfficialPublic {
  private?: Omit<OfficialPrivate, 'id' | 'officialPublicId'> | null;
}

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

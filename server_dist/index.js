var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
  alertTypeEnum: () => alertTypeEnum,
  alerts: () => alerts,
  appSettings: () => appSettings,
  billActions: () => billActions,
  bills: () => bills,
  chamberEnum: () => chamberEnum,
  committeeMemberships: () => committeeMemberships,
  committeeRefreshState: () => committeeRefreshState,
  committees: () => committees,
  dailyPrayerPicks: () => dailyPrayerPicks,
  eventStatusEnum: () => eventStatusEnum,
  eventTypeEnum: () => eventTypeEnum,
  hearingAgendaItems: () => hearingAgendaItems,
  hearingDetails: () => hearingDetails,
  insertOfficialPrivateSchema: () => insertOfficialPrivateSchema,
  insertOfficialPublicSchema: () => insertOfficialPublicSchema,
  insertPrayerSchema: () => insertPrayerSchema,
  legislativeEvents: () => legislativeEvents,
  notificationPrefEnum: () => notificationPrefEnum,
  officialPrivate: () => officialPrivate,
  officialPublic: () => officialPublic,
  personLinks: () => personLinks,
  persons: () => persons,
  prayerCategories: () => prayerCategories,
  prayerStatusEnum: () => prayerStatusEnum,
  prayerStreak: () => prayerStreak,
  prayers: () => prayers,
  pushTokens: () => pushTokens,
  refreshJobLog: () => refreshJobLog,
  refreshState: () => refreshState,
  rssFeeds: () => rssFeeds,
  rssItems: () => rssItems,
  sourceEnum: () => sourceEnum,
  subscriptionTypeEnum: () => subscriptionTypeEnum,
  updateOfficialPrivateSchema: () => updateOfficialPrivateSchema,
  updatePrayerSchema: () => updatePrayerSchema,
  userSubscriptions: () => userSubscriptions,
  witnesses: () => witnesses
});
import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, timestamp, json, pgEnum, uniqueIndex, index, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
var sourceEnum, persons, officialPublic, officialPrivate, refreshState, refreshJobLog, personLinks, DISTRICT_RANGES, chamberEnum, committees, committeeMemberships, committeeRefreshState, OTHER_TX_ROLES, insertOfficialPublicSchema, insertOfficialPrivateSchema, updateOfficialPrivateSchema, prayerStatusEnum, prayerCategories, prayers, dailyPrayerPicks, prayerStreak, appSettings, insertPrayerSchema, updatePrayerSchema, subscriptionTypeEnum, alertTypeEnum, eventTypeEnum, eventStatusEnum, notificationPrefEnum, bills, billActions, rssFeeds, rssItems, userSubscriptions, alerts, legislativeEvents, hearingDetails, hearingAgendaItems, witnesses, pushTokens;
var init_schema = __esm({
  "shared/schema.ts"() {
    "use strict";
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
      legCode: varchar("leg_code", { length: 20 }),
      // TLO legislator code — stable diff key
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
      customPeopleNames: json("custom_people_names").$type().default([]),
      pinnedDaily: boolean("pinned_daily").default(false).notNull(),
      priority: integer("priority").default(0).notNull(),
      lastShownAt: timestamp("last_shown_at"),
      lastPrayedAt: timestamp("last_prayed_at"),
      eventDate: timestamp("event_date"),
      autoAfterEventAction: varchar("auto_after_event_action", { length: 20 }).default("none").notNull(),
      autoAfterEventDaysOffset: integer("auto_after_event_days_offset").default(0).notNull()
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
      customPeopleNames: z.array(z.string()).optional(),
      pinnedDaily: z.boolean().optional(),
      priority: z.number().int().min(0).max(1).optional(),
      eventDate: z.string().nullable().optional(),
      autoAfterEventAction: z.enum(["none", "markAnswered", "archive"]).optional(),
      autoAfterEventDaysOffset: z.number().int().min(0).optional()
    });
    updatePrayerSchema = z.object({
      title: z.string().min(1).max(500).optional(),
      body: z.string().min(1).optional(),
      categoryId: z.string().nullable().optional(),
      officialIds: z.array(z.string()).optional(),
      customPeopleNames: z.array(z.string()).optional(),
      pinnedDaily: z.boolean().optional(),
      priority: z.number().int().min(0).max(1).optional(),
      lastPrayedAt: z.string().nullable().optional(),
      eventDate: z.string().nullable().optional(),
      autoAfterEventAction: z.enum(["none", "markAnswered", "archive"]).optional(),
      autoAfterEventDaysOffset: z.number().int().min(0).optional()
    });
    subscriptionTypeEnum = pgEnum("subscription_type", [
      "COMMITTEE",
      "BILL",
      "CHAMBER",
      "OFFICIAL"
    ]);
    alertTypeEnum = pgEnum("alert_type_enum", [
      "HEARING_POSTED",
      "HEARING_UPDATED",
      "CALENDAR_UPDATED",
      "BILL_ACTION",
      "RSS_ITEM",
      "COMMITTEE_MEMBER_CHANGE"
    ]);
    eventTypeEnum = pgEnum("event_type_enum", [
      "COMMITTEE_HEARING",
      "FLOOR_CALENDAR",
      "SESSION_DAY",
      "NOTICE_ONLY"
    ]);
    eventStatusEnum = pgEnum("event_status_enum", [
      "POSTED",
      "SCHEDULED",
      "CANCELLED",
      "COMPLETED"
    ]);
    notificationPrefEnum = pgEnum("notification_pref_enum", [
      "IN_APP_ONLY",
      "PUSH_AND_IN_APP"
    ]);
    bills = pgTable("bills", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      billNumber: varchar("bill_number", { length: 30 }).notNull(),
      legSession: varchar("leg_session", { length: 10 }).notNull(),
      caption: text("caption"),
      sourceUrl: text("source_url"),
      externalId: varchar("external_id", { length: 100 }).unique(),
      updatedAt: timestamp("updated_at").defaultNow().notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => ({
      billNumberSessionIdx: uniqueIndex("bills_number_session_idx").on(table.billNumber, table.legSession)
    }));
    billActions = pgTable("bill_actions", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      billId: varchar("bill_id", { length: 255 }).notNull().references(() => bills.id, { onDelete: "cascade" }),
      actionAt: timestamp("action_at"),
      actionText: text("action_text").notNull(),
      parsedActionType: varchar("parsed_action_type", { length: 50 }),
      committeeId: varchar("committee_id", { length: 255 }).references(() => committees.id, { onDelete: "set null" }),
      chamber: varchar("chamber", { length: 50 }),
      sourceUrl: text("source_url"),
      externalId: varchar("external_id", { length: 100 }),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => ({
      billActionIdx: index("bill_actions_bill_action_at_idx").on(table.billId, table.actionAt)
    }));
    rssFeeds = pgTable("rss_feeds", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      feedType: varchar("feed_type", { length: 50 }).notNull(),
      // RSS_XML | HTML_PAGE
      url: text("url").notNull().unique(),
      scopeJson: json("scope_json").$type(),
      enabled: boolean("enabled").default(true).notNull(),
      etag: text("etag"),
      lastModified: text("last_modified"),
      lastPolledAt: timestamp("last_polled_at"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    rssItems = pgTable("rss_items", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      feedId: varchar("feed_id", { length: 255 }).notNull().references(() => rssFeeds.id, { onDelete: "cascade" }),
      guid: text("guid").notNull(),
      title: text("title").notNull(),
      link: text("link").notNull(),
      summary: text("summary"),
      publishedAt: timestamp("published_at"),
      fingerprint: text("fingerprint").notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => ({
      feedGuidIdx: uniqueIndex("rss_items_feed_guid_idx").on(table.feedId, table.guid)
    }));
    userSubscriptions = pgTable("user_subscriptions", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id", { length: 255 }).notNull().default("default"),
      type: subscriptionTypeEnum("type").notNull(),
      committeeId: varchar("committee_id", { length: 255 }).references(() => committees.id, { onDelete: "cascade" }),
      billId: varchar("bill_id", { length: 255 }).references(() => bills.id, { onDelete: "cascade" }),
      chamber: varchar("chamber", { length: 50 }),
      officialPublicId: varchar("official_public_id", { length: 255 }).references(() => officialPublic.id, { onDelete: "cascade" }),
      notificationPreference: notificationPrefEnum("notification_preference").default("IN_APP_ONLY").notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    alerts = pgTable("alerts", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id", { length: 255 }).notNull().default("default"),
      alertType: alertTypeEnum("alert_type").notNull(),
      entityType: varchar("entity_type", { length: 50 }).notNull(),
      // rss_item, event, bill, committee
      entityId: text("entity_id"),
      title: text("title").notNull(),
      body: text("body").notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      readAt: timestamp("read_at")
    }, (table) => ({
      alertsUserReadIdx: index("alerts_user_read_at_idx").on(table.userId, table.readAt)
    }));
    legislativeEvents = pgTable("legislative_events", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      source: varchar("source", { length: 20 }).default("TLO").notNull(),
      eventType: eventTypeEnum("event_type").notNull(),
      chamber: varchar("chamber", { length: 50 }),
      committeeId: varchar("committee_id", { length: 255 }).references(() => committees.id, { onDelete: "set null" }),
      title: text("title").notNull(),
      startsAt: timestamp("starts_at"),
      endsAt: timestamp("ends_at"),
      timezone: varchar("timezone", { length: 50 }).default("America/Chicago").notNull(),
      location: text("location"),
      status: eventStatusEnum("status").default("POSTED").notNull(),
      sourceUrl: text("source_url").notNull(),
      externalId: varchar("external_id", { length: 100 }).unique(),
      fingerprint: text("fingerprint").notNull(),
      lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => ({
      committeeStartsAtIdx: index("leg_events_committee_starts_at_idx").on(table.committeeId, table.startsAt)
    }));
    hearingDetails = pgTable("hearing_details", {
      eventId: varchar("event_id", { length: 255 }).primaryKey().references(() => legislativeEvents.id, { onDelete: "cascade" }),
      noticeText: text("notice_text"),
      meetingType: varchar("meeting_type", { length: 100 }),
      postingDate: timestamp("posting_date"),
      updatedDate: timestamp("updated_date"),
      videoUrl: text("video_url"),
      witnessCount: integer("witness_count").default(0).notNull()
    });
    hearingAgendaItems = pgTable("hearing_agenda_items", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      eventId: varchar("event_id", { length: 255 }).notNull().references(() => legislativeEvents.id, { onDelete: "cascade" }),
      billId: varchar("bill_id", { length: 255 }).references(() => bills.id, { onDelete: "set null" }),
      billNumber: varchar("bill_number", { length: 30 }),
      // denormalized for quick display
      itemText: text("item_text").notNull(),
      sortOrder: integer("sort_order").notNull()
    });
    witnesses = pgTable("witnesses", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      eventId: varchar("event_id", { length: 255 }).notNull().references(() => legislativeEvents.id, { onDelete: "cascade" }),
      fullName: text("full_name").notNull(),
      organization: text("organization"),
      position: text("position"),
      // FOR, AGAINST, ON
      billId: varchar("bill_id", { length: 255 }).references(() => bills.id, { onDelete: "set null" }),
      sortOrder: integer("sort_order").notNull()
    });
    pushTokens = pgTable("push_tokens", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id", { length: 255 }).notNull().default("default"),
      token: text("token").notNull().unique(),
      platform: varchar("platform", { length: 20 }),
      // "android" | "ios"
      createdAt: timestamp("created_at").defaultNow().notNull(),
      lastSeenAt: timestamp("last_seen_at").defaultNow().notNull()
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
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 3e4,
      idleTimeoutMillis: 3e4,
      keepAlive: true,
      max: 3
    });
    pool.on("error", (err) => {
      console.error("[DB Pool] Idle client error (connection will be replaced):", err.message);
    });
    pool.on("connect", (client) => {
      client.on("error", (err) => {
        console.error("[DB Pool] Active client error (connection will be replaced):", err.message);
      });
    });
    db = drizzle(pool, { schema: schema_exports });
  }
});

// server/lib/prayerUtils.ts
import { eq, and, not } from "drizzle-orm";
async function processEventDateActions() {
  try {
    const now = /* @__PURE__ */ new Date();
    const openWithEvents = await db.select().from(prayers).where(and(eq(prayers.status, "OPEN"), not(eq(prayers.autoAfterEventAction, "none"))));
    for (const prayer of openWithEvents) {
      if (!prayer.eventDate) continue;
      const triggerDate = new Date(prayer.eventDate);
      triggerDate.setDate(triggerDate.getDate() + (prayer.autoAfterEventDaysOffset || 0));
      if (now >= triggerDate) {
        if (prayer.autoAfterEventAction === "markAnswered") {
          await db.update(prayers).set({
            status: "ANSWERED",
            answeredAt: now,
            answerNote: "Auto-marked answered after event date",
            updatedAt: now
          }).where(eq(prayers.id, prayer.id));
        } else if (prayer.autoAfterEventAction === "archive") {
          await db.update(prayers).set({ status: "ARCHIVED", archivedAt: now, updatedAt: now }).where(eq(prayers.id, prayer.id));
        }
      }
    }
  } catch (_) {
  }
}
var init_prayerUtils = __esm({
  "server/lib/prayerUtils.ts"() {
    "use strict";
    init_db();
    init_schema();
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
function splitInitials(name) {
  return name.replace(/([A-Z])(?=[A-Z])/g, "$1 ");
}
function generateSlugVariants(fullName) {
  let cleanName2 = fullName.replace(/\./g, "").trim();
  if (/^"[^"]+"\s*$/.test(cleanName2)) {
    cleanName2 = cleanName2.replace(/"/g, "").trim();
  }
  const override = SLUG_OVERRIDES[cleanName2] || SLUG_OVERRIDES[fullName.replace(/"/g, "").replace(/\./g, "").trim()];
  if (override) {
    return [override];
  }
  const commaMatch = cleanName2.match(/^([^,]+),\s*(.+)$/);
  if (commaMatch) {
    let lastName = commaMatch[1].trim();
    let restParts = commaMatch[2].trim();
    const restSuffixMatch = restParts.match(/\s+(Jr|Sr|III|IV|II|V)\s*$/i);
    let commaSuffix = "";
    if (restSuffixMatch) {
      commaSuffix = restSuffixMatch[1];
      restParts = restParts.replace(/\s+(Jr|Sr|III|IV|II|V)\s*$/i, "").trim();
    }
    cleanName2 = commaSuffix ? `${restParts} ${lastName} ${commaSuffix}` : `${restParts} ${lastName}`;
    const commaOverride = SLUG_OVERRIDES[cleanName2] || SLUG_OVERRIDES[cleanName2.replace(/"/g, "").trim()];
    if (commaOverride) {
      return [commaOverride];
    }
  }
  const nicknameMatch = cleanName2.match(/"([^"]+)"/);
  const nickname = nicknameMatch ? nicknameMatch[1] : null;
  cleanName2 = cleanName2.replace(/"[^"]+"\s*/g, "").trim();
  const suffixMatch = cleanName2.match(/,?\s*(Jr|Sr|III|IV|II|V)\.?\s*$/i);
  const suffix = suffixMatch ? suffixMatch[1].toLowerCase() : null;
  const nameWithoutSuffix = cleanName2.replace(/,?\s*(Jr|Sr|III|IV|II|V)\.?\s*$/i, "").trim();
  const parts = nameWithoutSuffix.split(/\s+/);
  const slugs = [];
  if (parts.length >= 2) {
    const firstName = parts[0];
    const lastName = parts[parts.length - 1];
    const middleParts = parts.slice(1, -1);
    const baseSlug = nameToSlug(`${firstName} ${lastName}`);
    slugs.push(baseSlug);
    if (suffix) {
      slugs.push(nameToSlug(`${firstName} ${lastName} ${suffix}`));
    }
    slugs.push(nameToSlug(`${firstName} ${lastName} jr`));
    slugs.push(nameToSlug(`${firstName} ${lastName} iii`));
    slugs.push(nameToSlug(`${firstName} ${lastName} ii`));
    slugs.push(nameToSlug(`${firstName} ${lastName} sr`));
    const altNames = FIRST_NAME_ALTERNATES[firstName.toLowerCase()] || [];
    for (const alt of altNames) {
      slugs.push(nameToSlug(`${alt} ${lastName}`));
      if (suffix) {
        slugs.push(nameToSlug(`${alt} ${lastName} ${suffix}`));
      }
    }
    if (/^[A-Z]{2,3}$/.test(firstName)) {
      const splitFirst = splitInitials(firstName);
      slugs.push(nameToSlug(`${splitFirst} ${lastName}`));
      if (suffix) {
        slugs.push(nameToSlug(`${splitFirst} ${lastName} ${suffix}`));
      }
    }
    if (nickname) {
      slugs.push(nameToSlug(`${nickname} ${lastName}`));
      if (suffix) {
        slugs.push(nameToSlug(`${nickname} ${lastName} ${suffix}`));
      }
      if (middleParts.length > 0) {
        slugs.push(nameToSlug(`${nickname} ${middleParts.join(" ")} ${lastName}`));
      }
    }
    if (middleParts.length > 0) {
      slugs.push(nameToSlug(parts.join(" ")));
      if (suffix) {
        slugs.push(nameToSlug(`${parts.join(" ")} ${suffix}`));
      }
      for (const middle of middleParts) {
        slugs.push(nameToSlug(`${firstName} ${middle} ${lastName}`));
      }
      if (middleParts.length === 1 && middleParts[0].length === 1) {
        const expandedInitial = splitInitials(middleParts[0]);
        slugs.push(nameToSlug(`${firstName} ${expandedInitial} ${lastName}`));
      }
    }
    if (/^[A-Z]$/.test(firstName) && middleParts.length > 0) {
      slugs.push(nameToSlug(`${middleParts[0]} ${lastName}`));
    }
  } else {
    slugs.push(nameToSlug(fullName));
  }
  return [...new Set(slugs.filter((s) => s.length > 0))];
}
function parseHometownFromHtml(html) {
  const normalizedHtml = html.replace(/\r?\n/g, " ").replace(/\s+/g, " ");
  const hometownMatch = normalizedHtml.match(/<td>\s*<strong>Hometown<\/strong>\s*<\/td>\s*<td>([^<]+)<\/td>/i);
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
      if (html.includes("Page not found") || html.includes("<title>404</title>")) {
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
      if (html.includes("Page not found") || html.includes("<title>404</title>")) continue;
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
var SLUG_OVERRIDES, FIRST_NAME_ALTERNATES;
var init_texasTribuneLookup = __esm({
  "server/lib/texasTribuneLookup.ts"() {
    "use strict";
    SLUG_OVERRIDES = {
      "Alma Allen": "alma-a-allen",
      "Angie Button": "angie-chen-button",
      "Armando Walle": "armando-lucio-walle",
      "Jon Rosenthal": "jon-e-rosenthal",
      "Jeff Barry": "jeffrey-barry",
      "Vincent Perez": "vince-perez",
      "Rhetta Bowers": "rhetta-andrews-bowers",
      "Borris Miles": "borris-l-miles",
      "C\xE9sar Blanco": "cesar-j-blanco",
      "Juan Hinojosa": "juan-chuy-hinojosa",
      "Erin G\xE1mez": "erin-elizabeth-gamez",
      "Armando Martinez": "armando-mando-martinez",
      "Lulu Flores": "maria-luisa-flores",
      "Liz Campos": "elizabeth-liz-campos",
      "Sam Harless": "e-sam-harless",
      "John Bucy III": "john-h-bucy-iii",
      "Lauren A Simmons": "lauren-ashley-simmons",
      "Steve Toth": "steve-toth",
      "Shelley Luther": "shelley-luther"
    };
    FIRST_NAME_ALTERNATES = {
      "jeff": ["jeffrey"],
      "jeffrey": ["jeff"],
      "mike": ["michael"],
      "michael": ["mike"],
      "sam": ["samuel"],
      "samuel": ["sam"],
      "bob": ["robert"],
      "robert": ["bob"],
      "bill": ["william"],
      "william": ["bill"],
      "jim": ["james"],
      "james": ["jim"],
      "tom": ["thomas"],
      "thomas": ["tom"],
      "vince": ["vincent"],
      "vincent": ["vince"],
      "jon": ["jonathan"],
      "jonathan": ["jon"],
      "liz": ["elizabeth"],
      "elizabeth": ["liz"],
      "don": ["donald"],
      "donald": ["don"],
      "ron": ["ronald"],
      "ronald": ["ron"],
      "dan": ["daniel"],
      "daniel": ["dan"]
    };
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
import { eq as eq3, and as and3, sql as sql3 } from "drizzle-orm";
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
  const [state] = await db.select().from(refreshState).where(eq3(refreshState.source, source)).limit(1);
  if (!state) return null;
  return {
    fingerprint: state.fingerprint,
    lastCheckedAt: state.lastCheckedAt,
    lastChangedAt: state.lastChangedAt
  };
}
async function updateRefreshState(source, fingerprint2, changed) {
  const [existing] = await db.select().from(refreshState).where(eq3(refreshState.source, source)).limit(1);
  const now = /* @__PURE__ */ new Date();
  if (existing) {
    await db.update(refreshState).set({
      fingerprint: fingerprint2,
      lastCheckedAt: now,
      lastChangedAt: changed ? now : existing.lastChangedAt,
      lastRefreshedAt: changed ? now : existing.lastRefreshedAt,
      updatedAt: now
    }).where(eq3(refreshState.id, existing.id));
  } else {
    await db.insert(refreshState).values({
      source,
      fingerprint: fingerprint2,
      lastCheckedAt: now,
      lastChangedAt: changed ? now : null,
      lastRefreshedAt: changed ? now : null
    });
  }
}
async function markCheckedOnly(source) {
  const [existing] = await db.select().from(refreshState).where(eq3(refreshState.source, source)).limit(1);
  const now = /* @__PURE__ */ new Date();
  if (existing) {
    await db.update(refreshState).set({ lastCheckedAt: now, updatedAt: now }).where(eq3(refreshState.id, existing.id));
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
    const h1Text = $("h1").first().text().trim();
    const NAME_RE = /Information for (Rep\.|Sen\.)\s*(.+)$/;
    let fullName = "";
    const h1Match = h1Text.match(NAME_RE);
    if (h1Match) {
      fullName = h1Match[2].trim();
    }
    if (h1Text.includes("Lt. Gov.") || h1Text.includes("Lieutenant Governor")) {
      return null;
    }
    if (!fullName) {
      const titleText = $("title").text();
      if (titleText.includes("Lt. Gov.") || titleText.includes("Lieutenant Governor")) {
        return null;
      }
      const titleMatch = titleText.match(NAME_RE);
      fullName = titleMatch ? titleMatch[2].trim() : "";
    }
    if (!fullName) {
      const pageTitle = $("#usrHeader_lblPageTitle").text();
      const altMatch = pageTitle.match(NAME_RE);
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
    if (memberLinks.length >= expectedMin && records.length === 0) {
      const msg = `SAFETY ABORT: found ${memberLinks.length} member links but parsed 0 records \u2014 TLO page structure may have changed. Skipping upsert and deactivation to protect existing data.`;
      console.error(`[RefreshOfficials] ${msg}`);
      result.errors.push(msg);
      return result;
    }
    const processedMemberIds = [];
    for (const record of records) {
      const validationError = validateTLORecord(record, chamber);
      if (validationError) {
        result.errors.push(`${record.fullName}: ${validationError}`);
        result.skippedCount++;
        continue;
      }
      try {
        const existing = await db.select().from(officialPublic).where(and3(
          eq3(officialPublic.source, source),
          eq3(officialPublic.sourceMemberId, record.sourceMemberId)
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
          await db.update(officialPublic).set(updateData).where(eq3(officialPublic.id, existing[0].id));
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
      const deactivated = await db.update(officialPublic).set({ active: false }).where(and3(
        eq3(officialPublic.source, source),
        eq3(officialPublic.active, true),
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
        const existing = await db.select().from(officialPublic).where(and3(
          eq3(officialPublic.source, source),
          eq3(officialPublic.sourceMemberId, record.sourceMemberId)
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
          }).where(eq3(officialPublic.id, existing[0].id));
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
      const deactivated = await db.update(officialPublic).set({ active: false }).where(and3(
        eq3(officialPublic.source, source),
        eq3(officialPublic.active, true),
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
    const lastSuccess = await db.select().from(refreshJobLog).where(and3(
      eq3(refreshJobLog.source, source),
      eq3(refreshJobLog.status, "success")
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
  const latest = await db.select().from(refreshJobLog).where(eq3(refreshJobLog.status, "success")).orderBy(sql3`${refreshJobLog.completedAt} DESC`).limit(1);
  return latest.length > 0 ? latest[0].completedAt : null;
}
async function shouldRunRefresh() {
  const [{ count }] = await db.select({ count: sql3`count(*)::int` }).from(officialPublic).where(eq3(officialPublic.active, true));
  return count === 0;
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

// server/jobs/refreshGeoJSON.ts
import * as crypto2 from "crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { sql as sql4 } from "drizzle-orm";
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
async function updateGeoJSONRefreshState(source, fingerprint2, changed) {
  await ensureGeoJSONRefreshTable();
  const now = /* @__PURE__ */ new Date();
  const existing = await db.execute(
    sql4`SELECT * FROM geojson_refresh_state WHERE source = ${source} LIMIT 1`
  );
  if (existing.rows && existing.rows.length > 0) {
    const row = existing.rows[0];
    await db.execute(sql4`
      UPDATE geojson_refresh_state SET
        fingerprint = ${fingerprint2},
        last_checked_at = ${now},
        last_changed_at = ${changed ? now : row.last_changed_at},
        last_refreshed_at = ${changed ? now : row.last_refreshed_at},
        updated_at = ${now}
      WHERE id = ${row.id}
    `);
  } else {
    await db.execute(sql4`
      INSERT INTO geojson_refresh_state (source, fingerprint, last_checked_at, last_changed_at, last_refreshed_at)
      VALUES (${source}, ${fingerprint2}, ${now}, ${changed ? now : null}, ${changed ? now : null})
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
  const filePath = path.join(GEOJSON_DIR, filename);
  const tempPath = filePath + ".tmp";
  await fs.promises.writeFile(tempPath, JSON.stringify(data), "utf8");
  await fs.promises.rename(tempPath, filePath);
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
var __filename, __dirname, GEOJSON_SOURCES, GEOJSON_DIR, EXPECTED_COUNTS, isRefreshingGeoJSON;
var init_refreshGeoJSON = __esm({
  "server/jobs/refreshGeoJSON.ts"() {
    "use strict";
    init_db();
    __filename = fileURLToPath(import.meta.url);
    __dirname = path.dirname(__filename);
    GEOJSON_SOURCES = {
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
    GEOJSON_DIR = path.join(__dirname, "..", "data", "geojson");
    EXPECTED_COUNTS = {
      TX_HOUSE_GEOJSON_V2: 150,
      TX_SENATE_GEOJSON_V2: 31,
      US_HOUSE_TX_GEOJSON_V2: 38
    };
    isRefreshingGeoJSON = false;
  }
});

// server/lib/expoPush.ts
async function sendChunk(messages) {
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(messages)
    });
    if (!res.ok) {
      console.error(`[ExpoPush] HTTP ${res.status}:`, await res.text());
      return;
    }
    const json2 = await res.json();
    const errors = json2.data?.filter((t) => t.status === "error") ?? [];
    if (errors.length > 0) {
      console.warn(`[ExpoPush] ${errors.length} ticket error(s):`, errors);
    }
  } catch (err) {
    console.error("[ExpoPush] Send failed:", err);
  }
}
async function sendPushToAll(title, body, data) {
  let tokens;
  try {
    const rows = await db.select({ token: pushTokens.token }).from(pushTokens);
    tokens = rows.map((r) => r.token);
  } catch (err) {
    console.error("[ExpoPush] Failed to fetch tokens:", err);
    return;
  }
  if (tokens.length === 0) return;
  const messages = tokens.map((to) => ({
    to,
    title,
    body,
    sound: "default",
    data
  }));
  for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
    await sendChunk(messages.slice(i, i + CHUNK_SIZE));
  }
  console.log(`[ExpoPush] Sent to ${tokens.length} token(s): "${title}"`);
}
var EXPO_PUSH_URL, CHUNK_SIZE;
var init_expoPush = __esm({
  "server/lib/expoPush.ts"() {
    "use strict";
    init_db();
    init_schema();
    EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
    CHUNK_SIZE = 100;
  }
});

// server/jobs/refreshCommittees.ts
var refreshCommittees_exports = {};
__export(refreshCommittees_exports, {
  backfillMissingCommitteeMembers: () => backfillMissingCommitteeMembers,
  checkAndRefreshCommitteesIfChanged: () => checkAndRefreshCommitteesIfChanged,
  forceResetIsRefreshingCommittees: () => forceResetIsRefreshingCommittees,
  getAllCommitteeRefreshStates: () => getAllCommitteeRefreshStates,
  getIsRefreshingCommittees: () => getIsRefreshingCommittees,
  maybeRunCommitteeRefresh: () => maybeRunCommitteeRefresh,
  wasCommitteesCheckedThisWeek: () => wasCommitteesCheckedThisWeek
});
import * as cheerio2 from "cheerio";
import * as crypto3 from "crypto";
import { eq as eq4, and as and4, sql as sql5, isNotNull } from "drizzle-orm";
function getIsRefreshingCommittees() {
  return isRefreshing2;
}
function forceResetIsRefreshingCommittees() {
  isRefreshing2 = false;
}
async function fetchWithRetry3(url, retries = 3, timeoutMs = 2e4) {
  for (let i = 0; i < retries; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "TexasDistrictsApp/1.0 (Committee Data Sync)"
        }
      });
      clearTimeout(timer);
      if (response.ok) return response;
      if (response.status === 429) {
        await new Promise((r) => setTimeout(r, 2e3 * (i + 1)));
        continue;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (err) {
      clearTimeout(timer);
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
  return name.replace(/^(Rep\.|Sen\.|Lt\.?\s*Gov\.?|Representative|Senator|Lieutenant\s+Governor)\s*/i, "").replace(/\s+/g, " ").trim().toLowerCase();
}
async function fetchCommitteeList(chamber) {
  const url = `${TLO_BASE_URL2}/committees/Committees.aspx?Chamber=${chamber}`;
  console.log(`[RefreshCommittees] Fetching committee list from ${url}`);
  const response = await fetchWithRetry3(url);
  const html = await response.text();
  const $ = cheerio2.load(html);
  const rawCommittees = [];
  const seenCodes = /* @__PURE__ */ new Set();
  const GENERIC_LABELS = /* @__PURE__ */ new Set(["meetings", "members", "bills", "membership", "home"]);
  function extractCommitteeName(el) {
    const linkText = $(el).text().trim();
    if (linkText && !GENERIC_LABELS.has(linkText.toLowerCase())) {
      return linkText;
    }
    const row = $(el).closest("tr");
    if (row.length) {
      let found = "";
      row.find("td").each((_, cell) => {
        if (found) return;
        const $cell = $(cell);
        if ($cell.find("a").length === 0) {
          const txt = $cell.text().trim();
          if (txt && !GENERIC_LABELS.has(txt.toLowerCase()) && txt.length > 3) {
            found = txt;
          }
        }
      });
      if (found) return found;
      row.find("td a").each((_, a) => {
        if (found) return;
        const aText = $(a).text().trim();
        const aHref = $(a).attr("href") || "";
        if (aText && !GENERIC_LABELS.has(aText.toLowerCase()) && !aHref.includes("MeetingsByCmte") && !aHref.includes("MembershipCmte") && aText.length > 3) {
          found = aText;
        }
      });
      if (found) return found;
    }
    return linkText;
  }
  $('a[href*="MeetingsByCmte.aspx"], a[href*="MembershipCmte.aspx"]').each((_, el) => {
    const href = $(el).attr("href") || "";
    if (!href) return;
    const codeMatch = href.match(/CmteCode=([A-Z0-9]+)/i);
    const code = codeMatch ? codeMatch[1] : "";
    if (!code || seenCodes.has(code)) return;
    const name = extractCommitteeName(el);
    if (!name) return;
    seenCodes.add(code);
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
    const gridDiv = $("div.grid-template-two-column_membershipcmte");
    if (gridDiv.length > 0) {
      const cells = gridDiv.children("div").toArray();
      let currentRole = "Member";
      for (let i = 2; i < cells.length - 1; i += 2) {
        const positionText = $(cells[i]).text().trim();
        const memberCell = $(cells[i + 1]);
        const memberLink = memberCell.find("a");
        const memberName = memberLink.text().trim() || memberCell.text().trim();
        const memberHref = memberLink.attr("href") || "";
        if (positionText) {
          if (/^chair$/i.test(positionText)) {
            currentRole = "Chair";
          } else if (/^vice\s*chair$/i.test(positionText)) {
            currentRole = "Vice Chair";
          } else if (/^members?$/i.test(positionText)) {
            currentRole = "Member";
          }
        }
        if (!memberName) continue;
        if (!isValidPersonName(memberName)) continue;
        const legCodeMatch = memberHref.match(/LegCode=([A-Z0-9]+)/i);
        const legCode = legCodeMatch ? legCodeMatch[1] : "";
        members.push({
          memberName: memberName.replace(/^(Rep\.|Sen\.)\s*/i, "").trim(),
          roleTitle: currentRole,
          legCode,
          sortOrder: sortOrder++
        });
      }
    } else {
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
        if (!isValidPersonName(memberName)) return;
        const legCodeMatch = memberHref.match(/LegCode=([A-Z0-9]+)/i);
        const legCode = legCodeMatch ? legCodeMatch[1] : "";
        let roleTitle = "Member";
        if (positionCell.includes("Chair:") && !positionCell.includes("Vice")) {
          roleTitle = "Chair";
        } else if (positionCell.includes("Vice Chair:")) {
          roleTitle = "Vice Chair";
        }
        members.push({
          memberName: memberName.replace(/^(Rep\.|Sen\.)\s*/i, "").trim(),
          roleTitle,
          legCode,
          sortOrder: sortOrder++
        });
      });
    }
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
  const CONCURRENCY = 5;
  for (let i = 0; i < committeeList.length; i += CONCURRENCY) {
    const batch = committeeList.slice(i, i + CONCURRENCY);
    const membersBatch = await Promise.all(batch.map((c) => fetchCommitteeMembers(c)));
    for (let j = 0; j < batch.length; j++) {
      result.push({ committee: batch[j], members: membersBatch[j] });
    }
    if (i + CONCURRENCY < committeeList.length) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  return result;
}
async function matchMemberToOfficial(memberName, legCode, chamber) {
  const source = chamber;
  const officials = await db.select({ id: officialPublic.id, fullName: officialPublic.fullName, sourceMemberId: officialPublic.sourceMemberId }).from(officialPublic).where(and4(
    eq4(officialPublic.source, source),
    eq4(officialPublic.active, true)
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
  const rawLower = memberName.toLowerCase().replace(/\s+/g, " ").trim();
  const isNonOfficial = NON_OFFICIAL_PREFIXES.some((p) => rawLower.startsWith(p) || rawLower.includes(p));
  if (!isNonOfficial) {
    console.log(`[RefreshCommittees] Could not match member "${memberName}" to any ${chamber} official`);
  }
  return null;
}
async function getRefreshState2(source) {
  const result = await db.select().from(committeeRefreshState).where(eq4(committeeRefreshState.source, source)).limit(1);
  return result.length > 0 ? result[0] : null;
}
async function updateRefreshState2(source, fingerprint2, wasRefreshed) {
  const now = /* @__PURE__ */ new Date();
  const existing = await getRefreshState2(source);
  if (existing) {
    await db.update(committeeRefreshState).set({
      fingerprint: fingerprint2,
      lastCheckedAt: now,
      lastChangedAt: wasRefreshed ? now : existing.lastChangedAt,
      lastRefreshedAt: wasRefreshed ? now : existing.lastRefreshedAt,
      updatedAt: now
    }).where(eq4(committeeRefreshState.source, source));
  } else {
    await db.insert(committeeRefreshState).values({
      source,
      fingerprint: fingerprint2,
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
    const existing = await db.select().from(committees).where(and4(
      eq4(committees.chamber, chamber),
      eq4(committees.slug, committee.slug)
    )).limit(1);
    let committeeId;
    if (existing.length > 0) {
      committeeId = existing[0].id;
      await db.update(committees).set({
        name: committee.name,
        sourceUrl: committee.sourceUrl,
        sortOrder: String(committee.sortOrder),
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq4(committees.id, committeeId));
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
    if (members.length > 0) {
      const existingRows = await db.select({
        memberName: committeeMemberships.memberName,
        roleTitle: committeeMemberships.roleTitle,
        legCode: committeeMemberships.legCode
      }).from(committeeMemberships).where(eq4(committeeMemberships.committeeId, committeeId));
      const makeKey = (name, role, code) => code ? `${code}|${role}` : `name:${name}|${role}`;
      const existingSet = new Set(
        existingRows.map((r) => makeKey(r.memberName, r.roleTitle ?? "", r.legCode))
      );
      const newSet = new Set(
        members.map((m) => makeKey(m.memberName, m.roleTitle, m.legCode || null))
      );
      await db.delete(committeeMemberships).where(eq4(committeeMemberships.committeeId, committeeId));
      for (const member of members) {
        const officialId = await matchMemberToOfficial(member.memberName, member.legCode, chamber);
        await db.insert(committeeMemberships).values({
          committeeId,
          officialPublicId: officialId,
          memberName: member.memberName,
          roleTitle: member.roleTitle,
          sortOrder: String(member.sortOrder),
          legCode: member.legCode || null
        });
        membershipsCount++;
      }
      const addedKeys = [...newSet].filter((k) => !existingSet.has(k));
      const removedKeys = [...existingSet].filter((k) => !newSet.has(k));
      const addedPrefixes = new Set(addedKeys.map((k) => k.split("|")[0]));
      const removedPrefixes = new Set(removedKeys.map((k) => k.split("|")[0]));
      const roleChanges = [...addedPrefixes].filter((p) => removedPrefixes.has(p)).length;
      const trueAdded = addedKeys.filter((k) => !removedPrefixes.has(k.split("|")[0])).length;
      const trueRemoved = removedKeys.filter((k) => !addedPrefixes.has(k.split("|")[0])).length;
      if (trueAdded > 0 || trueRemoved > 0 || roleChanges > 0) {
        const parts = [];
        if (trueAdded > 0) parts.push(`${trueAdded} member${trueAdded > 1 ? "s" : ""} added`);
        if (trueRemoved > 0) parts.push(`${trueRemoved} member${trueRemoved > 1 ? "s" : ""} removed`);
        if (roleChanges > 0) parts.push(`${roleChanges} member${roleChanges > 1 ? "s'" : "'s"} role updated`);
        const alertTitle = `Committee Updated: ${committee.name}`;
        const alertBody = parts.join(", ");
        await db.insert(alerts).values({
          userId: "default",
          alertType: "COMMITTEE_MEMBER_CHANGE",
          entityType: "committee",
          entityId: committeeId,
          title: alertTitle,
          body: alertBody
        });
        sendPushToAll(alertTitle, alertBody, { alertType: "COMMITTEE_MEMBER_CHANGE", entityId: committeeId }).catch(
          (err) => console.error("[refreshCommittees] Push failed:", err)
        );
      }
    }
  }
  for (const { committee } of committeesWithMembers) {
    if (committee.isSubcommittee && committee.parentCode) {
      const parentId = codeToId.get(committee.parentCode);
      const childId = codeToId.get(committee.code);
      if (parentId && childId) {
        await db.update(committees).set({ parentCommitteeId: parentId }).where(eq4(committees.id, childId));
      }
    } else {
      const childId = codeToId.get(committee.code);
      if (childId) {
        await db.update(committees).set({ parentCommitteeId: null }).where(eq4(committees.id, childId));
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
    console.log("[RefreshCommittees] Already refreshing (local flag), skipping");
    return { results, durationMs: 0 };
  }
  const lockClient = await pool.connect();
  let lockAcquired = false;
  try {
    const lockResult = await lockClient.query(
      "SELECT pg_try_advisory_lock($1) AS acquired",
      [COMMITTEE_REFRESH_LOCK_ID]
    );
    lockAcquired = lockResult.rows[0].acquired;
    if (!lockAcquired) {
      console.log("[RefreshCommittees] Another instance holds the DB lock \u2014 skipping duplicate refresh");
      return { results, durationMs: 0 };
    }
    console.log("[RefreshCommittees] DB advisory lock acquired");
    isRefreshing2 = true;
    try {
      const houseResult = await checkAndRefreshChamber("TX_HOUSE_COMMITTEES", "TX_HOUSE", force);
      results.push(houseResult);
      const senateResult = await checkAndRefreshChamber("TX_SENATE_COMMITTEES", "TX_SENATE", force);
      results.push(senateResult);
    } finally {
      isRefreshing2 = false;
    }
  } finally {
    if (lockAcquired) {
      await lockClient.query("SELECT pg_advisory_unlock($1)", [COMMITTEE_REFRESH_LOCK_ID]);
      console.log("[RefreshCommittees] DB advisory lock released");
    }
    lockClient.release();
  }
  const durationMs = Date.now() - startTime;
  console.log(`[RefreshCommittees] Complete in ${durationMs}ms`);
  return { results, durationMs };
}
async function maybeRunCommitteeRefresh() {
  if (isRefreshing2) return;
  const alreadyChecked = await wasCommitteesCheckedThisWeek();
  if (alreadyChecked) {
    const [{ committeeCount }] = await db.select({ committeeCount: sql5`count(*)::int` }).from(committees);
    const [{ memberCount }] = await db.select({ memberCount: sql5`count(*)::int` }).from(committeeMemberships);
    if (committeeCount > 0 && memberCount === 0) {
      console.log(
        `[RefreshCommittees] ${committeeCount} committees exist but 0 memberships \u2014 forcing re-run`
      );
      await checkAndRefreshCommitteesIfChanged(true);
      return;
    }
    const [{ emptyCount }] = await db.select({
      emptyCount: sql5`count(*)::int`
    }).from(committees).where(
      sql5`${committees.id} NOT IN (SELECT DISTINCT committee_id FROM ${committeeMemberships})`
    );
    if (emptyCount > 0) {
      console.log(
        `[RefreshCommittees] ${emptyCount} committees have 0 members \u2014 running targeted backfill`
      );
      await backfillMissingCommitteeMembers();
      return;
    }
    console.log("[RefreshCommittees] Already checked this week, skipping startup seed");
    return;
  }
  console.log("[RefreshCommittees] Committees not checked this week \u2014 running startup seed");
  await checkAndRefreshCommitteesIfChanged(false);
}
async function wasCommitteesCheckedThisWeek() {
  const [{ committeeCount }] = await db.select({ committeeCount: sql5`count(*)::int` }).from(committees);
  const [{ memberCount }] = await db.select({ memberCount: sql5`count(*)::int` }).from(committeeMemberships);
  return committeeCount > 0 && memberCount > 0;
}
async function backfillMissingCommitteeMembers() {
  if (isRefreshing2) {
    console.log("[RefreshCommittees] backfill skipped \u2014 refresh already in progress");
    return { filled: 0, skipped: 0, errors: 0 };
  }
  const emptyCommittees = await db.select().from(committees).where(
    and4(
      isNotNull(committees.sourceUrl),
      sql5`${committees.id} NOT IN (
          SELECT DISTINCT committee_id FROM ${committeeMemberships}
        )`
    )
  );
  if (emptyCommittees.length === 0) {
    console.log("[RefreshCommittees] backfill: no committees with 0 members found");
    return { filled: 0, skipped: 0, errors: 0 };
  }
  console.log(
    `[RefreshCommittees] backfill: ${emptyCommittees.length} committees have 0 members \u2014 fetching`
  );
  let filled = 0;
  let skipped = 0;
  let errors = 0;
  const CONCURRENCY = 5;
  for (let i = 0; i < emptyCommittees.length; i += CONCURRENCY) {
    const batch = emptyCommittees.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (row) => {
        try {
          const members = await fetchCommitteeMembers({
            name: row.name,
            sourceUrl: row.sourceUrl,
            slug: row.slug,
            code: "",
            isSubcommittee: row.parentCommitteeId !== null,
            parentCode: null,
            sortOrder: 0
          });
          if (members.length === 0) {
            skipped++;
            console.log(`[RefreshCommittees] backfill: ${row.name} \u2014 0 members returned, skipping`);
            return;
          }
          const chamber = row.chamber;
          for (const member of members) {
            const officialId = await matchMemberToOfficial(
              member.memberName,
              member.legCode,
              chamber
            );
            await db.insert(committeeMemberships).values({
              committeeId: row.id,
              officialPublicId: officialId,
              memberName: member.memberName,
              roleTitle: member.roleTitle,
              sortOrder: String(member.sortOrder),
              legCode: member.legCode || null
            });
          }
          filled++;
          console.log(
            `[RefreshCommittees] backfill: ${row.name} \u2014 inserted ${members.length} members`
          );
        } catch (err) {
          errors++;
          console.error(`[RefreshCommittees] backfill error for ${row.name}:`, err);
        }
      })
    );
    if (i + CONCURRENCY < emptyCommittees.length) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  console.log(
    `[RefreshCommittees] backfill complete \u2014 filled=${filled} skipped=${skipped} errors=${errors}`
  );
  return { filled, skipped, errors };
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
var COMMITTEE_REFRESH_LOCK_ID, TLO_BASE_URL2, CURRENT_LEG_SESSION, isRefreshing2, NON_OFFICIAL_PREFIXES, isMainModule2;
var init_refreshCommittees = __esm({
  "server/jobs/refreshCommittees.ts"() {
    "use strict";
    init_db();
    init_schema();
    init_expoPush();
    COMMITTEE_REFRESH_LOCK_ID = 624242;
    TLO_BASE_URL2 = "https://capitol.texas.gov";
    CURRENT_LEG_SESSION = "89R";
    isRefreshing2 = false;
    NON_OFFICIAL_PREFIXES = ["lt. gov.", "lieutenant governor", "speaker"];
    isMainModule2 = import.meta.url === `file://${process.argv[1]}`;
    if (isMainModule2) {
      checkAndRefreshCommitteesIfChanged(true).then((result) => {
        console.log("Result:", JSON.stringify(result, null, 2));
        process.exit(0);
      }).catch((err) => {
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
  const { createHash: createHash7 } = await import("crypto");
  const fingerprint2 = createHash7("sha256").update(fingerprintData).digest("hex");
  const duration = Date.now() - startTime;
  console.log(`[OtherTxScrape] Complete: ${allOfficials.length} officials fetched (${duration}ms)`);
  console.log(`[OtherTxScrape] Breakdown: ${executive.length} executive, ${supremeCourt.length} Supreme Court, ${criminalAppeals.length} Criminal Appeals`);
  return {
    officials: allOfficials,
    fingerprint: fingerprint2,
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
import { eq as eq5, and as and5, isNull as isNull2, sql as sql6 } from "drizzle-orm";
import { createHash as createHash4 } from "crypto";
async function getExplicitPersonLink(officialPublicId) {
  const link = await db.select({ personId: personLinks.personId }).from(personLinks).where(eq5(personLinks.officialPublicId, officialPublicId)).limit(1);
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
  await db.update(officialPublic).set({ personId }).where(eq5(officialPublic.id, officialPublicId));
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
  const existing = await db.select().from(persons).where(eq5(persons.fullNameCanonical, canonicalName)).limit(1);
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
  await db.update(officialPublic).set({ personId }).where(eq5(officialPublic.id, officialId));
}
async function getOfficialsByPersonId(personId) {
  return await db.select().from(officialPublic).where(eq5(officialPublic.personId, personId));
}
async function getIdentityStats() {
  const [totalPersonsResult] = await db.select({ count: sql6`count(*)::int` }).from(persons);
  const [activeOfficialsResult] = await db.select({ count: sql6`count(*)::int` }).from(officialPublic).where(eq5(officialPublic.active, true));
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
  const officialsWithoutPerson = await db.select().from(officialPublic).where(and5(
    eq5(officialPublic.active, true),
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
    await db.update(officialPublic).set({ personId }).where(eq5(officialPublic.id, official.id));
    resolved++;
    const isNew = await db.select().from(persons).where(eq5(persons.id, personId));
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
  maybeRunOtherTxRefresh: () => maybeRunOtherTxRefresh,
  refreshOtherTexasOfficials: () => refreshOtherTexasOfficials,
  wasOtherTxCheckedThisWeek: () => wasOtherTxCheckedThisWeek
});
import { eq as eq6, and as and6, sql as sql7 } from "drizzle-orm";
async function getStoredFingerprint() {
  const result = await db.select().from(refreshState).where(eq6(refreshState.source, SOURCE_VALUE)).limit(1);
  return result[0]?.fingerprint || null;
}
async function updateStoredFingerprint(fingerprint2, changed) {
  const now = /* @__PURE__ */ new Date();
  const existing = await db.select().from(refreshState).where(eq6(refreshState.source, SOURCE_VALUE)).limit(1);
  if (existing.length > 0) {
    await db.update(refreshState).set({
      fingerprint: fingerprint2,
      lastCheckedAt: now,
      ...changed ? { lastChangedAt: now } : {}
    }).where(eq6(refreshState.source, SOURCE_VALUE));
  } else {
    await db.insert(refreshState).values({
      source: SOURCE_VALUE,
      fingerprint: fingerprint2,
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
    const { officials, fingerprint: fingerprint2, sources } = scrapedData;
    const storedFingerprint = await getStoredFingerprint();
    const fingerprintChanged = storedFingerprint !== fingerprint2;
    if (!fingerprintChanged && !options.force) {
      console.log("[RefreshOtherTX] No changes detected (fingerprint match)");
      await updateStoredFingerprint(fingerprint2, false);
      const existing = await db.select().from(officialPublic).where(and6(eq6(officialPublic.source, "OTHER_TX"), eq6(officialPublic.active, true)));
      for (const o of existing) {
        if (o.roleTitle?.includes("Supreme Court")) breakdown.supremeCourt++;
        else if (o.roleTitle?.includes("Criminal Appeals")) breakdown.criminalAppeals++;
        else if (o.roleTitle?.includes("Secretary of State")) breakdown.secretaryOfState++;
        else if (o.roleTitle?.includes("United States Senator")) breakdown.usSenate++;
        else breakdown.executive++;
      }
      return {
        success: true,
        fingerprint: fingerprint2,
        changed: false,
        upsertedCount: 0,
        deactivatedCount: 0,
        totalOfficials: existing.length,
        breakdown,
        sources
      };
    }
    console.log(`[RefreshOtherTX] Changes detected, processing ${officials.length} officials...`);
    const existingOfficials = await db.select().from(officialPublic).where(eq6(officialPublic.source, "OTHER_TX"));
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
        }).where(eq6(officialPublic.id, existing.id));
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
        await db.update(officialPublic).set({ active: false }).where(eq6(officialPublic.id, existing.id));
        deactivatedCount++;
        console.log(`[RefreshOtherTX] Deactivated: ${existing.fullName} (${existing.roleTitle})`);
      }
    }
    await updateStoredFingerprint(fingerprint2, true);
    const duration = Date.now() - startTime;
    console.log(
      `[RefreshOtherTX] Complete: ${upsertedCount} upserted, ${deactivatedCount} deactivated (${duration}ms)`
    );
    console.log(
      `[RefreshOtherTX] Breakdown: ${breakdown.executive} executive, ${breakdown.secretaryOfState} SoS, ${breakdown.supremeCourt} Supreme Court, ${breakdown.criminalAppeals} Criminal Appeals`
    );
    return {
      success: true,
      fingerprint: fingerprint2,
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
  const [{ count }] = await db.select({ count: sql7`count(*)::int` }).from(officialPublic).where(and6(eq6(officialPublic.source, "OTHER_TX"), eq6(officialPublic.active, true)));
  return count > 0;
}
async function maybeRunOtherTxRefresh() {
  const alreadySeeded = await wasOtherTxCheckedThisWeek();
  if (alreadySeeded) {
    console.log("[RefreshOtherTX] Officials already in DB, skipping startup seed");
    return;
  }
  console.log("[RefreshOtherTX] No OTHER_TX officials found \u2014 running startup seed");
  await refreshOtherTexasOfficials({ force: true });
}
async function getOtherTxRefreshState() {
  const result = await db.select().from(refreshState).where(eq6(refreshState.source, SOURCE_VALUE)).limit(1);
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

// server/jobs/targetedRefresh.ts
import * as cheerio3 from "cheerio";
import * as crypto4 from "crypto";
import { eq as eq7, and as and7 } from "drizzle-orm";
async function fetchWithRetry4(url, options = {}, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "User-Agent": "TXDistrictNavigator/1.0 (Legislative Data Sync)",
          ...options.headers
        }
      });
      if (response.ok || response.status === 304 || response.status === 404) {
        return response;
      }
      if (response.status === 429) {
        await sleep2(2e3 * (attempt + 1));
        continue;
      }
      throw new Error(`HTTP ${response.status}: ${url}`);
    } catch (err) {
      if (attempt === retries - 1) throw err;
      await sleep2(1e3 * (attempt + 1));
    }
  }
  throw new Error(`Failed to fetch ${url} after ${retries} retries`);
}
function sleep2(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function fingerprint(data) {
  return crypto4.createHash("sha256").update(data).digest("hex").slice(0, 16);
}
function parseMeetingsUpcomingPage(html, chamberCode) {
  const $ = cheerio3.load(html);
  const meetings = [];
  let currentDateStr = null;
  let currentTimeStr = null;
  $("table tr").each((_, row) => {
    const tds = $(row).find("td");
    if (tds.length === 0) return;
    const firstTd = $(tds[0]);
    const dataLabel = (firstTd.attr("data-label") ?? "").toLowerCase();
    if (dataLabel === "committee meeting date") {
      currentDateStr = firstTd.text().trim();
      return;
    }
    if (dataLabel === "committee meeting time") {
      currentTimeStr = firstTd.text().trim();
      return;
    }
    if (!dataLabel.includes("committee name")) return;
    if (!currentDateStr || !currentTimeStr) return;
    const startsAt = parseUpcomingDateTime(currentDateStr, currentTimeStr);
    const cellHtml = firstTd.html() ?? "";
    const brIdx = cellHtml.search(/<br\s*\/?>/i);
    const namePart = brIdx >= 0 ? cellHtml.slice(0, brIdx) : cellHtml;
    const committeeName = cheerio3.load(namePart).text().trim();
    if (!committeeName) return;
    const afterBr = brIdx >= 0 ? firstTd.text().slice(committeeName.length).replace(/\u00a0/g, " ").trim() : "";
    const typeMatch = afterBr.match(/Type:\s*([^L]+?)(?:\s+Location:|$)/i);
    const locationMatch = afterBr.match(/Location:\s*(.+)/i);
    const meetingType = typeMatch ? typeMatch[1].trim() : null;
    const location = locationMatch ? locationMatch[1].trim() : null;
    let noticeDocUrl = null;
    let cmteCode = null;
    tds.each((_2, td) => {
      $(td).find("a[href]").each((__, a) => {
        const href = $(a).attr("href") ?? "";
        if (!href.includes("tlodocs") && !href.includes("schedules")) return;
        const fullHref = href.startsWith("http") ? href : `${TLO_BASE}${href.startsWith("/") ? "" : "/"}${href}`;
        if (!noticeDocUrl) noticeDocUrl = fullHref;
        if (!cmteCode) {
          const filename = href.split("/").pop() ?? "";
          const m = filename.match(/^([A-Z][A-Z0-9]{1,5}?)(?=20\d{2})/i);
          cmteCode = m ? m[1].toUpperCase() : null;
        }
      });
    });
    const dateKey = startsAt ? `${startsAt.getFullYear()}${String(startsAt.getMonth() + 1).padStart(2, "0")}${String(startsAt.getDate()).padStart(2, "0")}` : currentDateStr.replace(/[^0-9]/g, "").slice(0, 8);
    const timeKey = currentTimeStr.replace(/[^0-9APM]/g, "");
    const codeKey = cmteCode ?? committeeName.replace(/[^A-Z0-9]/gi, "").slice(0, 8).toUpperCase();
    const externalId = `${chamberCode}${codeKey}-${dateKey}-${timeKey}`;
    const sourceUrl = noticeDocUrl ?? `${TLO_BASE}/Committees/MeetingsUpcoming.aspx?chamber=${chamberCode}`;
    meetings.push({
      externalId,
      title: committeeName,
      startsAt,
      location,
      sourceUrl,
      noticeDocUrl,
      cmteCode,
      meetingType
    });
  });
  return meetings;
}
function parseUpcomingDateTime(dateStr, timeStr) {
  try {
    const cleanDate = dateStr.replace(/^[A-Z][a-z]+,\s*/i, "").trim();
    const timeMatch = timeStr.trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!timeMatch) return null;
    let hour = parseInt(timeMatch[1], 10);
    const min = parseInt(timeMatch[2], 10);
    const ampm = timeMatch[3].toUpperCase();
    if (ampm === "PM" && hour !== 12) hour += 12;
    if (ampm === "AM" && hour === 12) hour = 0;
    const d = /* @__PURE__ */ new Date(`${cleanDate} ${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}
function parseWitnessesFromHtml($) {
  const results = [];
  $("table").each((_, table) => {
    const rows = $(table).find("tr");
    if (rows.length < 2) return;
    let hasPositionCell = false;
    rows.each((_2, row) => {
      if (hasPositionCell) return;
      $(row).find("td").each((_3, td) => {
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
    rows.each((_2, row) => {
      const cells = $(row).find("td");
      if (cells.length < 2) return;
      const texts = cells.map((_3, td) => $(td).text().trim()).get();
      const posIdx = posCol >= 0 ? posCol : texts.findIndex((t) => WITNESS_POSITION_RE.test(t));
      if (posIdx < 0 || posIdx >= texts.length) return;
      const rawPosition = texts[posIdx].toUpperCase();
      const position = ["FOR", "AGAINST", "ON"].includes(rawPosition) ? rawPosition : null;
      const rest = texts.filter((_3, i) => i !== posIdx);
      let fullName = null;
      let organization = null;
      let billNumber = null;
      if (nameCol >= 0 && orgCol >= 0) {
        fullName = texts[nameCol] || null;
        organization = texts[orgCol] || null;
        billNumber = billCol >= 0 ? texts[billCol] || null : null;
      } else {
        for (const t of rest) {
          const bm = t.match(WITNESS_BILL_RE);
          if (bm && !billNumber) {
            billNumber = bm[1].replace(/\s+/g, "").toUpperCase();
            continue;
          }
          if (!fullName && t.length >= 2) {
            fullName = t;
            continue;
          }
          if (!organization && t.length >= 2) {
            organization = t;
          }
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
  const lines = sectionMatch[1].split(/[\n\r]+/).map((l) => l.trim()).filter(Boolean);
  let currentPosition = null;
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
      billNumber: billMatch ? billMatch[1].replace(/\s+/g, "").toUpperCase() : null
    });
  }
  return results;
}
function parseHearingNoticePage(html) {
  const $ = cheerio3.load(html);
  const fullText = $("body").text().replace(/\s+/g, " ").trim();
  const committeeName = $("h1, h2, .committee-name, [class*='committee']").first().text().trim() || null;
  let dateStr = null;
  let location = null;
  let meetingType = null;
  const dateMatch = fullText.match(
    /(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}:\d{2}\s*[AP]M)/i
  );
  if (dateMatch) dateStr = `${dateMatch[1]} ${dateMatch[2]}`;
  const roomMatch = fullText.match(/(?:Room|Rm\.?|E\d\.\d{3}|Capitol\s+Extension)/i);
  if (roomMatch) {
    const idx = fullText.indexOf(roomMatch[0]);
    location = fullText.slice(idx, idx + 60).split(/[,\n]/)[0].trim();
  }
  const typeMatch = fullText.match(/(?:Public Hearing|Work Session|Formal Meeting|Mark-up)/i);
  if (typeMatch) meetingType = typeMatch[0];
  const agendaItems = [];
  const billPattern = /\b([HS][BJR]{1,2}\s*\d+)\b/g;
  const seen = /* @__PURE__ */ new Set();
  let match;
  let sortOrder = 0;
  while ((match = billPattern.exec(fullText)) !== null) {
    const billNumber = match[1].replace(/\s+/g, "").toUpperCase();
    if (seen.has(billNumber)) continue;
    seen.add(billNumber);
    const start = Math.max(0, match.index - 20);
    const end = Math.min(fullText.length, match.index + 200);
    const context = fullText.slice(start, end).replace(/\s+/g, " ").trim();
    agendaItems.push({ billNumber, itemText: context, sortOrder: sortOrder++ });
  }
  const title = committeeName ? `${committeeName} Hearing` : "Committee Hearing";
  const witnesses2 = parseWitnessesFromHtml($);
  return {
    title,
    committeeName,
    dateStr,
    location,
    noticeText: fullText.slice(0, 4e3),
    agendaItems,
    meetingType,
    witnesses: witnesses2
  };
}
async function refreshChamberUpcomingHearings(chamber, windowDays = 30) {
  const tag = `[targetedRefresh.chamberHearings.${chamber}]`;
  const allCommittees = await db.select({ id: committees.id, chamber: committees.chamber, sourceUrl: committees.sourceUrl }).from(committees);
  const codeToId = /* @__PURE__ */ new Map();
  for (const c of allCommittees) {
    const m = (c.sourceUrl ?? "").match(/CmteCode=([A-Z0-9]+)/i);
    if (m) codeToId.set(m[1].toUpperCase(), c.id);
  }
  const url = `${TLO_BASE}/Committees/MeetingsUpcoming.aspx?chamber=${chamber}`;
  console.log(`${tag} Fetching ${url}`);
  let html;
  try {
    const res = await fetchWithRetry4(url);
    if (!res.ok) {
      console.warn(`${tag} HTTP ${res.status}`);
      return { newEvents: 0, updatedEvents: 0 };
    }
    html = await res.text();
  } catch (err) {
    console.error(`${tag} Fetch failed:`, err);
    return { newEvents: 0, updatedEvents: 0 };
  }
  const parsed = parseMeetingsUpcomingPage(html, chamber);
  const chamberDb = chamber === "S" ? "TX_SENATE" : "TX_HOUSE";
  const cutoff = new Date(Date.now() + windowDays * 24 * 60 * 60 * 1e3);
  const windowed = parsed.filter((m) => !m.startsAt || m.startsAt <= cutoff);
  console.log(`${tag} Parsed ${parsed.length} meetings, ${windowed.length} within ${windowDays}d window`);
  let newEvents = 0;
  let updatedEvents = 0;
  for (const meeting of windowed) {
    const committeeId = meeting.cmteCode ? codeToId.get(meeting.cmteCode) : void 0;
    const fp = fingerprint(JSON.stringify({ externalId: meeting.externalId, sourceUrl: meeting.sourceUrl }));
    const existing = await db.select({ id: legislativeEvents.id, fingerprint: legislativeEvents.fingerprint }).from(legislativeEvents).where(eq7(legislativeEvents.externalId, meeting.externalId)).limit(1);
    if (existing.length === 0) {
      const [inserted] = await db.insert(legislativeEvents).values({
        eventType: "COMMITTEE_HEARING",
        chamber: chamberDb,
        committeeId: committeeId ?? void 0,
        title: meeting.title,
        startsAt: meeting.startsAt ?? void 0,
        location: meeting.location ?? void 0,
        sourceUrl: meeting.sourceUrl,
        externalId: meeting.externalId,
        fingerprint: fp,
        lastSeenAt: /* @__PURE__ */ new Date()
      }).returning({ id: legislativeEvents.id });
      if (inserted) {
        await db.insert(hearingDetails).values({ eventId: inserted.id, witnessCount: 0 }).onConflictDoNothing();
      }
      newEvents++;
    } else {
      if (existing[0].fingerprint !== fp) {
        await db.update(legislativeEvents).set({ fingerprint: fp, lastSeenAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() }).where(eq7(legislativeEvents.id, existing[0].id));
        const [ev] = await db.select({ title: legislativeEvents.title, startsAt: legislativeEvents.startsAt }).from(legislativeEvents).where(eq7(legislativeEvents.id, existing[0].id)).limit(1);
        if (ev) {
          const dateLabel = ev.startsAt ? ev.startsAt.toLocaleDateString("en-US", {
            timeZone: "America/Chicago",
            month: "short",
            day: "numeric",
            year: "numeric"
          }) : "TBD";
          const alertTitle = `Hearing Updated: ${ev.title}`;
          const alertBody = `Schedule for ${dateLabel} has changed`;
          await db.insert(alerts).values({
            userId: "default",
            alertType: "HEARING_UPDATED",
            entityType: "event",
            entityId: existing[0].id,
            title: alertTitle,
            body: alertBody
          });
          sendPushToAll(alertTitle, alertBody, { alertType: "HEARING_UPDATED", entityId: existing[0].id }).catch(
            (err) => console.error(`${tag} Push failed:`, err)
          );
        }
        updatedEvents++;
      } else {
        await db.update(legislativeEvents).set({ lastSeenAt: /* @__PURE__ */ new Date() }).where(eq7(legislativeEvents.id, existing[0].id));
      }
    }
  }
  console.log(`${tag} Done: +${newEvents} new, ~${updatedEvents} updated`);
  return { newEvents, updatedEvents };
}
async function refreshCommitteeHearings(committeeId, _windowDays = 14) {
  const [committee] = await db.select({ chamber: committees.chamber }).from(committees).where(eq7(committees.id, committeeId)).limit(1);
  if (!committee) {
    console.warn(`[targetedRefresh.hearings] Committee ${committeeId} not found`);
    return { newEvents: 0, updatedEvents: 0 };
  }
  const chamberCode = committee.chamber === "TX_SENATE" ? "S" : "H";
  return refreshChamberUpcomingHearings(chamberCode);
}
async function refreshHearingDetail(eventId) {
  const tag = "[targetedRefresh.hearingDetail]";
  const [event] = await db.select().from(legislativeEvents).where(eq7(legislativeEvents.id, eventId)).limit(1);
  if (!event) {
    console.warn(`${tag} Event ${eventId} not found`);
    return false;
  }
  let noticeUrl = event.sourceUrl;
  if (!noticeUrl.includes("tlodocs") && !noticeUrl.includes("MtgNotice")) {
    console.log(`${tag} No direct notice URL for event ${eventId}, skipping detail fetch`);
    return false;
  }
  console.log(`${tag} Fetching notice ${noticeUrl}`);
  let html;
  try {
    const res = await fetchWithRetry4(noticeUrl);
    if (!res.ok) {
      console.warn(`${tag} HTTP ${res.status} for ${noticeUrl}`);
      return false;
    }
    html = await res.text();
  } catch (err) {
    console.error(`${tag} Fetch failed:`, err);
    return false;
  }
  const fp = fingerprint(html);
  const [existing] = await db.select({ fingerprint: legislativeEvents.fingerprint }).from(legislativeEvents).where(eq7(legislativeEvents.id, eventId)).limit(1);
  if (existing?.fingerprint === fp) {
    console.log(`${tag} No change for event ${eventId}`);
    return false;
  }
  const parsed = parseHearingNoticePage(html);
  const currentTitle = event.title ?? "";
  const titleToStore = currentTitle && currentTitle !== "Committee Hearing" ? currentTitle : parsed.title;
  await db.update(legislativeEvents).set({
    title: titleToStore,
    location: event.location ?? parsed.location ?? void 0,
    fingerprint: fp,
    updatedAt: /* @__PURE__ */ new Date()
  }).where(eq7(legislativeEvents.id, eventId));
  await db.delete(hearingAgendaItems).where(eq7(hearingAgendaItems.eventId, eventId));
  for (const item of parsed.agendaItems) {
    let billId = null;
    if (item.billNumber) {
      billId = await findOrCreateBill(item.billNumber);
    }
    await db.insert(hearingAgendaItems).values({
      eventId,
      billId: billId ?? void 0,
      billNumber: item.billNumber ?? void 0,
      itemText: item.itemText,
      sortOrder: item.sortOrder
    });
  }
  await db.delete(witnesses).where(eq7(witnesses.eventId, eventId));
  let insertedWitnessCount = 0;
  for (const [idx, w] of parsed.witnesses.entries()) {
    let billId = null;
    if (w.billNumber) {
      billId = await findOrCreateBill(w.billNumber);
    }
    await db.insert(witnesses).values({
      eventId,
      fullName: w.fullName,
      organization: w.organization ?? void 0,
      position: w.position ?? void 0,
      billId: billId ?? void 0,
      sortOrder: idx
    });
    insertedWitnessCount++;
  }
  await db.insert(hearingDetails).values({
    eventId,
    noticeText: parsed.noticeText,
    meetingType: parsed.meetingType ?? void 0,
    witnessCount: insertedWitnessCount
  }).onConflictDoUpdate({
    target: hearingDetails.eventId,
    set: {
      noticeText: parsed.noticeText,
      meetingType: parsed.meetingType ?? void 0,
      witnessCount: insertedWitnessCount,
      updatedDate: /* @__PURE__ */ new Date()
    }
  });
  console.log(
    `${tag} Event ${eventId} updated: ${parsed.agendaItems.length} agenda items, ${insertedWitnessCount} witnesses`
  );
  return true;
}
async function findOrCreateBill(billNumber) {
  const clean = billNumber.trim().toUpperCase();
  const existing = await db.select({ id: bills.id }).from(bills).where(and7(eq7(bills.billNumber, clean), eq7(bills.legSession, LEG_SESSION))).limit(1);
  if (existing.length > 0) return existing[0].id;
  const [inserted] = await db.insert(bills).values({
    billNumber: clean,
    legSession: LEG_SESSION,
    sourceUrl: `${TLO_BASE}/BillLookup/History.aspx?LegSess=${LEG_SESSION}&Bill=${encodeURIComponent(clean)}`
  }).onConflictDoNothing().returning({ id: bills.id });
  return inserted?.id ?? null;
}
var TLO_BASE, LEG_SESSION, WITNESS_POSITION_RE, WITNESS_BILL_RE;
var init_targetedRefresh = __esm({
  "server/jobs/targetedRefresh.ts"() {
    "use strict";
    init_db();
    init_schema();
    init_expoPush();
    TLO_BASE = "https://capitol.texas.gov";
    LEG_SESSION = "89R";
    WITNESS_POSITION_RE = /^(FOR|AGAINST|ON)$/i;
    WITNESS_BILL_RE = /\b([HS][BJR]{1,2}\s*\d+)\b/i;
  }
});

// server/jobs/pollRssFeeds.ts
import * as cheerio4 from "cheerio";
import * as crypto5 from "crypto";
import { eq as eq8, and as and8 } from "drizzle-orm";
function getIsPollingRss() {
  return isPolling;
}
function itemFingerprint(parts) {
  return crypto5.createHash("sha256").update(parts.filter(Boolean).join("|")).digest("hex").slice(0, 16);
}
async function conditionalFetch(feed) {
  const headers = {
    "User-Agent": "TXDistrictNavigator/1.0 (Legislative Data Sync)"
  };
  if (feed.etag) headers["If-None-Match"] = feed.etag;
  if (feed.lastModified) headers["If-Modified-Since"] = feed.lastModified;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(feed.url, { headers });
      const etag = res.headers.get("etag");
      const lastModified = res.headers.get("last-modified");
      if (res.status === 304) {
        return { status: 304, body: null, etag, lastModified };
      }
      if (res.ok) {
        const body = await res.text();
        return { status: 200, body, etag, lastModified };
      }
      if (res.status === 429) {
        await sleep3(2e3 * (attempt + 1));
        continue;
      }
      console.warn(`[pollRss] HTTP ${res.status} for ${feed.url}`);
      return { status: res.status, body: null, etag: null, lastModified: null };
    } catch (err) {
      if (attempt === 2) {
        console.error(`[pollRss] Fetch error for ${feed.url}:`, err);
        return { status: 0, body: null, etag: null, lastModified: null };
      }
      await sleep3(1e3 * (attempt + 1));
    }
  }
  return { status: 0, body: null, etag: null, lastModified: null };
}
function parseRssXml(xml) {
  const $ = cheerio4.load(xml, { xmlMode: true });
  const entries = [];
  $("feed > entry").each((_, el) => {
    const guid = $(el).find("id").first().text().trim();
    const title = $(el).find("title").first().text().trim();
    const link = $(el).find("link[rel='alternate']").attr("href") || $(el).find("link").attr("href") || "";
    const summary = $(el).find("summary, content").first().text().trim() || null;
    const pubText = $(el).find("published, updated").first().text().trim();
    const publishedAt = pubText ? new Date(pubText) : null;
    if (guid && title) entries.push({ guid, title, link, summary, publishedAt });
  });
  if (entries.length > 0) return entries;
  $("channel > item").each((_, el) => {
    const guid = $(el).find("guid").text().trim() || $(el).find("link").text().trim();
    const title = $(el).find("title").first().text().trim();
    const link = $(el).find("link").text().trim() || $(el).find("link").next().text().trim();
    const summary = $(el).find("description").first().text().trim() || null;
    const pubText = $(el).find("pubDate").text().trim() || $(el).find("dc\\:date").text().trim();
    const publishedAt = pubText ? new Date(pubText) : null;
    if (guid && title) entries.push({ guid, title, link, summary, publishedAt });
  });
  return entries;
}
function parseHtmlPageAsItem(html, feedUrl) {
  const $ = cheerio4.load(html);
  const title = $("title").first().text().trim() || feedUrl;
  const fp = crypto5.createHash("sha256").update(html).digest("hex").slice(0, 8);
  const dateKey = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  return {
    guid: `${feedUrl}#${dateKey}-${fp}`,
    title,
    link: feedUrl,
    summary: `Page content updated (fingerprint ${fp})`,
    publishedAt: /* @__PURE__ */ new Date()
  };
}
async function processFeed(feed, stats) {
  const tag = `[pollRss][${feed.feedType}]`;
  const result = await conditionalFetch(feed);
  const headerUpdate = {
    lastPolledAt: /* @__PURE__ */ new Date(),
    ...result.etag !== null ? { etag: result.etag } : {},
    ...result.lastModified !== null ? { lastModified: result.lastModified } : {},
    updatedAt: /* @__PURE__ */ new Date()
  };
  if (result.status === 304) {
    await db.update(rssFeeds).set(headerUpdate).where(eq8(rssFeeds.id, feed.id));
    stats.feeds304++;
    return;
  }
  if (!result.body) {
    await db.update(rssFeeds).set(headerUpdate).where(eq8(rssFeeds.id, feed.id));
    return;
  }
  let entries = [];
  if (feed.feedType === "RSS_XML") {
    entries = parseRssXml(result.body);
  } else {
    const entry = parseHtmlPageAsItem(result.body, feed.url);
    if (entry) entries = [entry];
  }
  await db.update(rssFeeds).set(headerUpdate).where(eq8(rssFeeds.id, feed.id));
  const existingCount = await db.select({ id: rssItems.id }).from(rssItems).where(eq8(rssItems.feedId, feed.id)).limit(1);
  const isFirstPoll = existingCount.length === 0;
  for (const entry of entries) {
    const fp = itemFingerprint([entry.title, entry.link, entry.summary, entry.publishedAt?.toISOString()]);
    const existing = await db.select({ id: rssItems.id, fingerprint: rssItems.fingerprint }).from(rssItems).where(and8(eq8(rssItems.feedId, feed.id), eq8(rssItems.guid, entry.guid))).limit(1);
    if (existing.length > 0) {
      if (existing[0].fingerprint !== fp) {
        await db.update(rssItems).set({ fingerprint: fp, summary: entry.summary ?? void 0 }).where(eq8(rssItems.id, existing[0].id));
      }
      continue;
    }
    await db.insert(rssItems).values({
      feedId: feed.id,
      guid: entry.guid,
      title: entry.title,
      link: entry.link,
      summary: entry.summary ?? void 0,
      publishedAt: entry.publishedAt ?? void 0,
      fingerprint: fp
    });
    stats.items++;
    stats.feedsNew++;
    if (!isFirstPoll) {
      const scope = feed.scopeJson;
      if (scope?.committeeId) {
        try {
          await refreshCommitteeHearings(scope.committeeId, 14);
        } catch (err) {
          console.error(`${tag} Targeted refresh failed for committee ${scope.committeeId}:`, err);
        }
      }
      console.log(`${tag} New item: "${entry.title.slice(0, 80)}"`);
    }
  }
}
async function limitedMap(items, concurrency, fn) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      await fn(item);
    }
  });
  await Promise.all(workers);
}
async function pollAllFeeds() {
  if (isPolling) {
    console.log("[pollRss] Already polling, skipping");
    return { feeds: 0, feeds304: 0, feedsNew: 0, newItems: 0, newAlerts: 0 };
  }
  isPolling = true;
  const start = Date.now();
  console.log("[pollRss] BEGIN hourly RSS/HTML poll");
  const stats = { feeds304: 0, feedsNew: 0, items: 0 };
  try {
    const feeds = await db.select().from(rssFeeds).where(eq8(rssFeeds.enabled, true));
    console.log(`[pollRss] Polling ${feeds.length} enabled feeds`);
    await limitedMap(
      feeds,
      MAX_CONCURRENT,
      (feed) => processFeed(feed, stats).catch(
        (err) => console.error(`[pollRss] Error processing feed ${feed.id}:`, err)
      )
    );
    const duration = Date.now() - start;
    console.log(
      `[pollRss] END poll: ${feeds.length} feeds, ${stats.feeds304} unchanged (304), ${stats.feedsNew} with new items, ${stats.items} new items (${duration}ms)`
    );
    return {
      feeds: feeds.length,
      feeds304: stats.feeds304,
      feedsNew: stats.feedsNew,
      newItems: stats.items,
      newAlerts: 0
    };
  } finally {
    isPolling = false;
  }
}
function sleep3(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
var MAX_CONCURRENT, isPolling;
var init_pollRssFeeds = __esm({
  "server/jobs/pollRssFeeds.ts"() {
    "use strict";
    init_db();
    init_schema();
    init_targetedRefresh();
    MAX_CONCURRENT = 5;
    isPolling = false;
  }
});

// server/jobs/refreshDailyLegislative.ts
import { sql as sql9, gte as gte2 } from "drizzle-orm";
function getIsDailyRefreshing() {
  return isDailyRefreshing;
}
async function runDailyRefresh() {
  if (isDailyRefreshing) {
    console.log("[dailyRefresh] Already running, skipping");
    return {
      committeesRefreshed: 0,
      newEvents: 0,
      updatedEvents: 0,
      detailsFetched: 0,
      alertsCreated: 0
    };
  }
  isDailyRefreshing = true;
  const jobStart = Date.now();
  console.log("========================================");
  console.log("[dailyRefresh] BEGIN daily legislative refresh");
  console.log("========================================");
  let committeesRefreshed = 0;
  let totalNew = 0;
  let totalUpdated = 0;
  let detailsFetched = 0;
  let alertsCreated = 0;
  try {
    const alertsSince = /* @__PURE__ */ new Date();
    const refreshStart = Date.now();
    for (const chamber of ["H", "S"]) {
      try {
        const { newEvents, updatedEvents } = await refreshChamberUpcomingHearings(chamber, 30);
        totalNew += newEvents;
        totalUpdated += updatedEvents;
        committeesRefreshed++;
      } catch (err) {
        console.error(`[dailyRefresh] Error refreshing chamber ${chamber}:`, err);
      }
    }
    if (totalNew > 0) {
      const recentEvents = await db.select({
        id: legislativeEvents.id,
        title: legislativeEvents.title,
        startsAt: legislativeEvents.startsAt
      }).from(legislativeEvents).where(gte2(legislativeEvents.createdAt, alertsSince));
      for (const event of recentEvents) {
        const dateLabel = event.startsAt ? event.startsAt.toLocaleDateString("en-US", {
          timeZone: "America/Chicago",
          month: "short",
          day: "numeric",
          year: "numeric"
        }) : "TBD";
        const alertTitle = `New Hearing: ${event.title}`;
        const alertBody = `Scheduled for ${dateLabel}`;
        await db.insert(alerts).values({
          userId: "default",
          alertType: "HEARING_POSTED",
          entityType: "event",
          entityId: event.id,
          title: alertTitle,
          body: alertBody
        });
        alertsCreated++;
        sendPushToAll(alertTitle, alertBody, {
          alertType: "HEARING_POSTED",
          entityId: event.id
        }).catch((err) => console.error("[dailyRefresh] Push failed:", err));
      }
    }
    const hearingsNeedingDetails = await db.select({ id: legislativeEvents.id, sourceUrl: legislativeEvents.sourceUrl }).from(legislativeEvents).where(
      sql9`${legislativeEvents.sourceUrl} LIKE '%tlodocs%' OR ${legislativeEvents.sourceUrl} LIKE '%MtgNotice%'`
    ).limit(20);
    for (const ev of hearingsNeedingDetails) {
      try {
        const changed = await refreshHearingDetail(ev.id);
        if (changed) detailsFetched++;
        await sleep4(300);
      } catch (err) {
        console.error("[dailyRefresh] Detail fetch failed:", err);
      }
    }
    console.log(`[dailyRefresh] Chamber refresh took ${Date.now() - refreshStart}ms`);
    const duration = Date.now() - jobStart;
    console.log("========================================");
    console.log(
      `[dailyRefresh] END: ${committeesRefreshed} committees, +${totalNew} new events, ~${totalUpdated} updated, ${detailsFetched} details fetched, ${alertsCreated} alerts (${duration}ms)`
    );
    console.log("========================================");
    return {
      committeesRefreshed,
      newEvents: totalNew,
      updatedEvents: totalUpdated,
      detailsFetched,
      alertsCreated
    };
  } finally {
    isDailyRefreshing = false;
  }
}
function sleep4(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function msUntilNext5amChicago() {
  const now = /* @__PURE__ */ new Date();
  const chicagoStr = now.toLocaleString("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false
  });
  const [h, m, s] = chicagoStr.split(":").map(Number);
  const secondsIntoDay = h * 3600 + m * 60 + (s || 0);
  const target5am = 5 * 3600;
  let secondsUntil = target5am - secondsIntoDay;
  if (secondsUntil <= 0) secondsUntil += 24 * 3600;
  return secondsUntil * 1e3;
}
var isDailyRefreshing;
var init_refreshDailyLegislative = __esm({
  "server/jobs/refreshDailyLegislative.ts"() {
    "use strict";
    init_db();
    init_schema();
    init_targetedRefresh();
    init_expoPush();
    isDailyRefreshing = false;
  }
});

// server/jobs/seedLegislativeFeeds.ts
async function seedLegislativeFeeds() {
  const tag = "[seedFeeds]";
  console.log(`${tag} Seeding RSS/polling feeds for all committees...`);
  const allCommittees = await db.select({
    id: committees.id,
    chamber: committees.chamber,
    name: committees.name,
    sourceUrl: committees.sourceUrl
  }).from(committees);
  if (allCommittees.length === 0) {
    console.log(`${tag} No committees in DB yet \u2014 seed will run again after first committee refresh`);
    return { inserted: 0, skipped: 0 };
  }
  const existingFeeds = await db.select({ url: rssFeeds.url }).from(rssFeeds);
  const existingUrls = new Set(existingFeeds.map((f) => f.url));
  let inserted = 0;
  let skipped = 0;
  for (const committee of allCommittees) {
    const codeMatch = (committee.sourceUrl ?? "").match(/CmteCode=([A-Z0-9]+)/i);
    if (!codeMatch) {
      skipped++;
      continue;
    }
    const cmteCode = codeMatch[1];
    const url = `${TLO_BASE2}/Committees/MeetingsByCmte.aspx?LegSess=${LEG_SESSION2}&CmteCode=${cmteCode}`;
    if (existingUrls.has(url)) {
      skipped++;
      continue;
    }
    try {
      await db.insert(rssFeeds).values({
        feedType: "HTML_PAGE",
        url,
        scopeJson: { committeeId: committee.id, cmteCode, chamber: committee.chamber },
        enabled: true
      });
      inserted++;
      existingUrls.add(url);
    } catch {
      skipped++;
    }
  }
  console.log(`${tag} Done: ${inserted} feeds inserted, ${skipped} skipped`);
  return { inserted, skipped };
}
var TLO_BASE2, LEG_SESSION2;
var init_seedLegislativeFeeds = __esm({
  "server/jobs/seedLegislativeFeeds.ts"() {
    "use strict";
    init_db();
    init_schema();
    TLO_BASE2 = "https://capitol.texas.gov";
    LEG_SESSION2 = "89R";
  }
});

// server/scripts/bulkFillHometowns.ts
var bulkFillHometowns_exports = {};
__export(bulkFillHometowns_exports, {
  bulkFillHometowns: () => bulkFillHometowns
});
import { eq as eq9 } from "drizzle-orm";
async function delay(ms) {
  return new Promise((resolve3) => setTimeout(resolve3, ms));
}
async function dbQuery(fn, label) {
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (attempt < maxRetries && (msg.includes("timed out") || msg.includes("socket") || msg.includes("Authentication") || msg.includes("terminated") || msg.includes("TLS"))) {
        console.log(`[BulkFill] DB retry ${attempt}/${maxRetries} (${label}): ${msg}`);
        await delay(3e3 * attempt);
        continue;
      }
      throw error;
    }
  }
  throw new Error("Unreachable");
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
  const allPrivate = await dbQuery(() => db.select({
    officialPublicId: officialPrivate.officialPublicId,
    personId: officialPrivate.personId
  }).from(officialPrivate), "fetch existing private records");
  const coveredOfficialIds = new Set(allPrivate.map((p) => p.officialPublicId).filter(Boolean));
  const coveredPersonIds = new Set(allPrivate.map((p) => p.personId).filter(Boolean));
  const allOfficials = await dbQuery(() => db.select({
    id: officialPublic.id,
    fullName: officialPublic.fullName,
    personId: officialPublic.personId,
    source: officialPublic.source,
    active: officialPublic.active
  }).from(officialPublic).where(eq9(officialPublic.active, true)), "fetch officials");
  const uncheckedOfficials = allOfficials.filter((o) => {
    if (coveredOfficialIds.has(o.id)) return false;
    if (o.personId && coveredPersonIds.has(o.personId)) return false;
    return true;
  });
  const sourceOrder = { "TX_SENATE": 0, "TX_HOUSE": 1, "US_HOUSE": 2, "OTHER_TX": 3 };
  const officials = uncheckedOfficials.sort((a, b) => (sourceOrder[a.source] ?? 9) - (sourceOrder[b.source] ?? 9));
  result.total = officials.length;
  if (officials.length === 0) {
    console.log(`[BulkFill] All ${allOfficials.length} officials already have private records. Nothing to do.`);
    return result;
  }
  console.log(`[BulkFill] Found ${officials.length} unchecked officials (of ${allOfficials.length} total)`);
  const CONCURRENCY = 3;
  const PROGRESS_LOG_EVERY = 15;
  async function processOne(official, index2) {
    await delay(Math.floor(index2 % CONCURRENCY) * 400);
    try {
      const lookup = await lookupHometownFromTexasTribune(official.fullName);
      if (!lookup.success || !lookup.hometown) {
        await dbQuery(() => db.insert(officialPrivate).values({
          personId: official.personId,
          officialPublicId: official.id,
          personalAddress: null,
          addressSource: "tribune_not_found"
        }), `mark-not-found ${official.fullName}`);
        console.log(`[BulkFill] Not found, marked checked: ${official.fullName}`);
        result.notFound++;
        result.details.push({
          name: official.fullName,
          status: "not_found",
          reason: "Not found in Texas Tribune directory (marked so it won't be re-checked)"
        });
        return;
      }
      await dbQuery(() => db.insert(officialPrivate).values({
        personId: official.personId,
        officialPublicId: official.id,
        personalAddress: lookup.hometown,
        addressSource: "tribune"
      }), `insert ${official.fullName}`);
      console.log(`[BulkFill] Created ${official.fullName}: ${lookup.hometown}`);
      result.filled++;
      result.details.push({
        name: official.fullName,
        status: "filled",
        hometown: lookup.hometown
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      console.error(`[BulkFill] Failed ${official.fullName}: ${msg}`);
      result.errors++;
      result.details.push({
        name: official.fullName,
        status: "error",
        reason: msg
      });
    }
  }
  for (let i = 0; i < officials.length; i += CONCURRENCY) {
    const chunk = officials.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map((official, j) => processOne(official, j)));
    const processed = Math.min(i + CONCURRENCY, officials.length);
    if (processed % PROGRESS_LOG_EVERY === 0 || processed === officials.length) {
      console.log(`[BulkFill] Progress: ${processed}/${officials.length} (filled=${result.filled}, notFound=${result.notFound})`);
    }
    if (i + CONCURRENCY < officials.length) {
      await delay(1200);
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
  }
});

// server/jobs/scheduler.ts
var scheduler_exports = {};
__export(scheduler_exports, {
  getRefreshCycleInProgress: () => getRefreshCycleInProgress,
  getSchedulerStatus: () => getSchedulerStatus,
  startOfficialsRefreshScheduler: () => startOfficialsRefreshScheduler,
  stopOfficialsRefreshScheduler: () => stopOfficialsRefreshScheduler,
  triggerDailyRefresh: () => triggerDailyRefresh,
  triggerFullLegislativeBootstrap: () => triggerFullLegislativeBootstrap,
  triggerFullRefreshCycle: () => triggerFullRefreshCycle,
  triggerRssPoll: () => triggerRssPoll
});
import { sql as sql11 } from "drizzle-orm";
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
async function triggerFullRefreshCycle() {
  try {
    await runRefreshCycle();
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error"
    };
  }
}
function getRefreshCycleInProgress() {
  return refreshCycleInProgress;
}
function startOfficialsRefreshScheduler() {
  if (schedulerInterval) {
    console.log("[Scheduler] Already running");
    return;
  }
  console.log(`[Scheduler] Starting officials refresh scheduler (check every ${CHECK_INTERVAL_MS / 6e4} minutes)`);
  schedulerInterval = setInterval(schedulerTick, CHECK_INTERVAL_MS);
  setTimeout(async () => {
    try {
      const { officialPublic: officialPublic3 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
      const [{ count }] = await db.select({ count: sql11`count(*)::int` }).from(officialPublic3);
      if (count === 0) {
        console.log("[Scheduler] Officials table is empty \u2014 running immediate full refresh cycle");
        await runRefreshCycle();
      }
    } catch (err) {
      console.error("[Scheduler] Startup check failed:", err);
    }
  }, 5e3);
  startLegislativeSchedulers();
}
function stopOfficialsRefreshScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log("[Scheduler] Stopped");
  }
  stopLegislativeSchedulers();
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
  const msUntilDaily = msUntilNext5amChicago();
  const hoursUntil = Math.floor(msUntilDaily / 36e5);
  const minsUntil = Math.floor(msUntilDaily % 36e5 / 6e4);
  return {
    running: schedulerInterval !== null,
    lastCheckWindowRun,
    nextCheckIn: `Check window: Monday 3:00-4:00 AM Central Time (current: ${now.toLocaleString("en-US", centralOptions)})`,
    legislative: {
      rssRunning: rssInterval !== null,
      lastRssPollAt,
      lastDailyRefreshAt,
      nextDailyRefreshIn: `${hoursUntil}h ${minsUntil}m (5:00 AM America/Chicago)`
    }
  };
}
function scheduleNextDailyRefresh() {
  if (dailyTimer) {
    clearTimeout(dailyTimer);
    dailyTimer = null;
  }
  const delay2 = msUntilNext5amChicago();
  const h = Math.floor(delay2 / 36e5);
  const m = Math.floor(delay2 % 36e5 / 6e4);
  console.log(`[Scheduler/daily] Next daily legislative refresh in ${h}h ${m}m (5:00 AM America/Chicago)`);
  dailyTimer = setTimeout(async () => {
    console.log("[Scheduler/daily] 5:00 AM trigger \u2014 running daily legislative refresh");
    lastDailyRefreshAt = /* @__PURE__ */ new Date();
    try {
      await runDailyRefresh();
    } catch (err) {
      console.error("[Scheduler/daily] Daily refresh failed:", err);
    }
    try {
      await processEventDateActions();
      console.log("[Scheduler/daily] processEventDateActions completed");
    } catch (err) {
      console.error("[Scheduler/daily] processEventDateActions failed:", err);
    }
    scheduleNextDailyRefresh();
  }, delay2);
}
async function runRssPoll() {
  if (getIsPollingRss() || getIsDailyRefreshing()) {
    console.log("[Scheduler/rss] Poll or daily refresh in progress, skipping");
    return;
  }
  lastRssPollAt = /* @__PURE__ */ new Date();
  try {
    await pollAllFeeds();
  } catch (err) {
    console.error("[Scheduler/rss] Poll failed:", err);
  }
}
async function maybeRunStartupLegislativeRefresh() {
  const MAX_WAIT_MS = 30 * 60 * 1e3;
  const POLL_INTERVAL_MS = 30 * 1e3;
  const started = Date.now();
  try {
    while (true) {
      const [{ committeeCount }] = await db.select({ committeeCount: sql11`count(*)::int` }).from(committees);
      if (committeeCount > 0) break;
      if (Date.now() - started >= MAX_WAIT_MS) {
        console.log("[Scheduler/legislative] Timed out waiting for committees \u2014 skipping startup event seed");
        return;
      }
      console.log("[Scheduler/legislative] Committees not yet seeded, waiting 30s...");
      await sleep(POLL_INTERVAL_MS);
    }
    try {
      const { inserted } = await seedLegislativeFeeds();
      if (inserted > 0) {
        console.log(`[Scheduler/legislative] Seeded ${inserted} RSS feed(s) after committee refresh`);
      }
    } catch (err) {
      console.error("[Scheduler/legislative] Feed re-seed failed:", err);
    }
    const [{ eventCount }] = await db.select({ eventCount: sql11`count(*)::int` }).from(legislativeEvents);
    if (eventCount > 0) {
      console.log(`[Scheduler/legislative] ${eventCount} events already in DB \u2014 skipping startup daily refresh`);
      return;
    }
    console.log("[Scheduler/legislative] No events in DB \u2014 running startup daily refresh immediately");
    await runDailyRefresh();
  } catch (err) {
    console.error("[Scheduler/legislative] Startup event seed failed:", err);
  }
}
function startLegislativeSchedulers() {
  console.log("[Scheduler/legislative] Starting RSS poller (every 60 min) + daily refresh (5 AM Chicago)");
  seedLegislativeFeeds().catch((err) => console.error("[Scheduler/legislative] Seed failed:", err)).finally(() => {
    setTimeout(() => {
      runRssPoll();
      rssInterval = setInterval(runRssPoll, RSS_POLL_INTERVAL_MS);
    }, 3e4);
  });
  setTimeout(() => {
    maybeRunStartupLegislativeRefresh().catch(
      (err) => console.error("[Scheduler/legislative] Startup refresh error:", err)
    );
  }, 10 * 1e3);
  scheduleNextDailyRefresh();
}
function stopLegislativeSchedulers() {
  if (rssInterval) {
    clearInterval(rssInterval);
    rssInterval = null;
  }
  if (dailyTimer) {
    clearTimeout(dailyTimer);
    dailyTimer = null;
  }
  console.log("[Scheduler/legislative] Stopped");
}
async function triggerRssPoll() {
  try {
    const result = await pollAllFeeds();
    return { success: true, result };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
async function triggerDailyRefresh() {
  try {
    const result = await runDailyRefresh();
    return { success: true, result };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
async function triggerFullLegislativeBootstrap() {
  try {
    console.log("[Bootstrap] Step 1/3: Refreshing committees...");
    const { checkAndRefreshCommitteesIfChanged: checkAndRefreshCommitteesIfChanged2 } = await Promise.resolve().then(() => (init_refreshCommittees(), refreshCommittees_exports));
    const committeeResult = await checkAndRefreshCommitteesIfChanged2(true);
    console.log("[Bootstrap] Step 2/3: Seeding RSS feeds...");
    const { inserted: feedsInserted } = await seedLegislativeFeeds();
    console.log(`[Bootstrap] ${feedsInserted} RSS feed(s) inserted`);
    console.log("[Bootstrap] Step 3/3: Running daily refresh for events...");
    const eventResult = await runDailyRefresh();
    console.log("[Bootstrap] Complete");
    return {
      success: true,
      committees: committeeResult,
      feedsInserted,
      events: eventResult
    };
  } catch (err) {
    console.error("[Bootstrap] Failed:", err);
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
var schedulerInterval, lastCheckWindowRun, refreshCycleInProgress, CHECK_INTERVAL_MS, rssInterval, dailyTimer, lastRssPollAt, lastDailyRefreshAt, RSS_POLL_INTERVAL_MS;
var init_scheduler = __esm({
  "server/jobs/scheduler.ts"() {
    "use strict";
    init_refreshOfficials();
    init_refreshGeoJSON();
    init_refreshCommittees();
    init_refreshOtherTexasOfficials();
    init_identityResolver();
    init_pollRssFeeds();
    init_refreshDailyLegislative();
    init_prayerUtils();
    init_seedLegislativeFeeds();
    init_db();
    init_schema();
    schedulerInterval = null;
    lastCheckWindowRun = null;
    refreshCycleInProgress = false;
    CHECK_INTERVAL_MS = 10 * 60 * 1e3;
    rssInterval = null;
    dailyTimer = null;
    lastRssPollAt = null;
    lastDailyRefreshAt = null;
    RSS_POLL_INTERVAL_MS = 60 * 60 * 1e3;
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

// server/index.ts
import express from "express";

// server/routes.ts
init_db();
import { createServer } from "node:http";

// server/routes/prayerRoutes.ts
init_db();
init_schema();
init_prayerUtils();
import { eq as eq2, and as and2, sql as sql2, or, ilike, inArray, desc, asc, isNull, lte, gte, not as not2 } from "drizzle-orm";
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
  const row = await db.select().from(appSettings).where(eq2(appSettings.key, "autoArchiveEnabled")).limit(1);
  if (row.length > 0) return row[0].value === "true";
  return true;
}
async function getAutoArchiveDays() {
  const row = await db.select().from(appSettings).where(eq2(appSettings.key, "autoArchiveDays")).limit(1);
  if (row.length > 0) return parseInt(row[0].value, 10) || 90;
  return 90;
}
async function autoArchiveAnswered() {
  const enabled = await getAutoArchiveEnabled();
  if (!enabled) return;
  const days = await getAutoArchiveDays();
  const cutoff = /* @__PURE__ */ new Date();
  cutoff.setDate(cutoff.getDate() - days);
  await db.update(prayers).set({ status: "ARCHIVED", archivedAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() }).where(and2(
    eq2(prayers.status, "ANSWERED"),
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
      const [cat] = await db.update(prayerCategories).set(updates).where(eq2(prayerCategories.id, id)).returning();
      if (!cat) return res.status(404).json({ error: "Category not found" });
      res.json(cat);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app2.delete("/api/prayer-categories/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await db.update(prayers).set({ categoryId: null, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(prayers.categoryId, id));
      const [cat] = await db.delete(prayerCategories).where(eq2(prayerCategories.id, id)).returning();
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
      processEventDateActions().catch(() => {
      });
      const { status, categoryId, officialId, q, limit: lim, offset: off, sort } = req.query;
      const conditions = [];
      if (status && status !== "ALL") {
        conditions.push(eq2(prayers.status, status));
      }
      if (categoryId === "uncategorized") {
        conditions.push(isNull(prayers.categoryId));
      } else if (categoryId) {
        conditions.push(eq2(prayers.categoryId, categoryId));
      }
      if (q && typeof q === "string" && q.trim()) {
        const search = `%${q.trim()}%`;
        conditions.push(or(ilike(prayers.title, search), ilike(prayers.body, search)));
      }
      if (officialId && typeof officialId === "string") {
        conditions.push(sql2`${prayers.officialIds}::jsonb @> ${JSON.stringify([officialId])}::jsonb`);
      }
      const orderBy = sort === "needsAttention" ? [asc(prayers.lastPrayedAt), desc(prayers.priority), desc(prayers.createdAt)] : [desc(prayers.createdAt)];
      let query = db.select().from(prayers).where(conditions.length > 0 ? and2(...conditions) : void 0).orderBy(...orderBy);
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
      const { title, body, categoryId, officialIds, pinnedDaily, priority, eventDate, autoAfterEventAction, autoAfterEventDaysOffset } = parsed.data;
      const [prayer] = await db.insert(prayers).values({
        title,
        body,
        categoryId: categoryId ?? null,
        officialIds: officialIds ?? [],
        pinnedDaily: pinnedDaily ?? false,
        priority: priority ?? 0,
        eventDate: eventDate ? new Date(eventDate) : null,
        autoAfterEventAction: autoAfterEventAction ?? "none",
        autoAfterEventDaysOffset: autoAfterEventDaysOffset ?? 0
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
        conditions.push(eq2(prayers.status, status));
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
      const allPrayers = await db.select().from(prayers).where(conditions.length > 0 ? and2(...conditions) : void 0).orderBy(desc(prayers.createdAt));
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
      const allOpen = await db.select().from(prayers).where(eq2(prayers.status, "OPEN"));
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
      const result = await db.select().from(prayers).where(eq2(prayers.status, "ANSWERED")).orderBy(desc(prayers.answeredAt)).limit(5);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app2.get("/api/prayers/grouped", async (req, res) => {
    try {
      const { status, groupBy } = req.query;
      const conditions = [];
      if (status && status !== "ALL") {
        conditions.push(eq2(prayers.status, status));
      }
      const allPrayers = await db.select().from(prayers).where(conditions.length > 0 ? and2(...conditions) : void 0);
      if (groupBy === "officials") {
        const officialCounts = /* @__PURE__ */ new Map();
        for (const p of allPrayers) {
          const ids = p.officialIds || [];
          if (ids.length === 0) {
            officialCounts.set("__none__", (officialCounts.get("__none__") || 0) + 1);
          } else {
            for (const oid of ids) {
              officialCounts.set(oid, (officialCounts.get(oid) || 0) + 1);
            }
          }
        }
        const groups = Array.from(officialCounts.entries()).map(([id, count]) => ({
          id,
          name: id === "__none__" ? "No Official" : id,
          count
        }));
        groups.sort((a, b) => b.count - a.count);
        return res.json({ groupBy: "officials", groups });
      }
      if (groupBy === "categories") {
        const cats = await db.select().from(prayerCategories);
        const catMap = new Map(cats.map((c) => [c.id, c.name]));
        const categoryCounts = /* @__PURE__ */ new Map();
        for (const p of allPrayers) {
          const key = p.categoryId || "__uncategorized__";
          categoryCounts.set(key, (categoryCounts.get(key) || 0) + 1);
        }
        const groups = Array.from(categoryCounts.entries()).map(([id, count]) => ({
          id,
          name: id === "__uncategorized__" ? "Uncategorized" : catMap.get(id) || id,
          count
        }));
        groups.sort((a, b) => b.count - a.count);
        return res.json({ groupBy: "categories", groups });
      }
      res.status(400).json({ error: "groupBy must be 'officials' or 'categories'" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app2.get("/api/prayers/upcoming", async (req, res) => {
    try {
      const result = await db.select().from(prayers).where(and2(
        eq2(prayers.status, "OPEN"),
        not2(isNull(prayers.eventDate))
      )).orderBy(asc(prayers.eventDate)).limit(10);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app2.get("/api/prayers/:id", async (req, res) => {
    try {
      const [prayer] = await db.select().from(prayers).where(eq2(prayers.id, req.params.id)).limit(1);
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
      if (updates.eventDate !== void 0) {
        updates.eventDate = updates.eventDate ? new Date(updates.eventDate) : null;
      }
      const [prayer] = await db.update(prayers).set(updates).where(eq2(prayers.id, req.params.id)).returning();
      if (!prayer) return res.status(404).json({ error: "Prayer not found" });
      res.json(prayer);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app2.delete("/api/prayers/:id", async (req, res) => {
    try {
      const [prayer] = await db.delete(prayers).where(eq2(prayers.id, req.params.id)).returning();
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
      }).where(eq2(prayers.id, req.params.id)).returning();
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
      }).where(eq2(prayers.id, req.params.id)).returning();
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
      }).where(eq2(prayers.id, req.params.id)).returning();
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
      }).where(eq2(prayers.id, req.params.id)).returning();
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
        await db.delete(dailyPrayerPicks).where(eq2(dailyPrayerPicks.dateKey, todayKey));
      }
      if (!forceRegenerate) {
        const existing = await db.select().from(dailyPrayerPicks).where(eq2(dailyPrayerPicks.dateKey, todayKey)).limit(1);
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
      const openPrayers = await db.select().from(prayers).where(eq2(prayers.status, "OPEN")).orderBy(asc(prayers.lastShownAt));
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
      }).where(eq2(prayerStreak.id, streak.id)).returning();
      try {
        const todayPicks = await db.select().from(dailyPrayerPicks).where(eq2(dailyPrayerPicks.dateKey, todayKey)).limit(1);
        if (todayPicks.length > 0) {
          const pickIds = todayPicks[0].prayerIds;
          if (pickIds.length > 0) {
            const todayStart = /* @__PURE__ */ new Date();
            todayStart.setHours(0, 0, 0, 0);
            await db.update(prayers).set({ lastPrayedAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() }).where(and2(
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

// server/routes/legislativeRoutes.ts
init_db();
init_schema();
init_scheduler();
import { eq as eq10, and as and9, isNull as isNull4, desc as desc2, asc as asc2, gte as gte3, lte as lte2, sql as sql12, inArray as inArray3 } from "drizzle-orm";
function requireAdminSecret(req, res) {
  const secret = process.env.ADMIN_CRON_SECRET;
  if (!secret) return true;
  const provided = req.headers["x-admin-secret"] ?? req.headers["authorization"]?.replace("Bearer ", "");
  if (provided !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}
function registerLegislativeRoutes(app2) {
  app2.get("/api/alerts", async (req, res) => {
    try {
      const unreadOnly = req.query.unreadOnly === "true";
      const conditions = [eq10(alerts.userId, "default")];
      if (unreadOnly) conditions.push(isNull4(alerts.readAt));
      const rows = await db.select().from(alerts).where(and9(...conditions)).orderBy(desc2(alerts.createdAt)).limit(100);
      const unreadCount = await db.select({ count: sql12`count(*)` }).from(alerts).where(and9(eq10(alerts.userId, "default"), isNull4(alerts.readAt)));
      res.json({ alerts: rows, unreadCount: Number(unreadCount[0]?.count ?? 0) });
    } catch (err) {
      console.error("[api/alerts] Error:", err);
      res.status(500).json({ error: "Failed to fetch alerts" });
    }
  });
  app2.post("/api/alerts/:id/read", async (req, res) => {
    try {
      const { id } = req.params;
      const [updated] = await db.update(alerts).set({ readAt: /* @__PURE__ */ new Date() }).where(and9(eq10(alerts.id, id), isNull4(alerts.readAt))).returning({ id: alerts.id });
      if (!updated) {
        return res.status(404).json({ error: "Alert not found or already read" });
      }
      res.json({ success: true, id: updated.id });
    } catch (err) {
      console.error("[api/alerts/:id/read] Error:", err);
      res.status(500).json({ error: "Failed to mark alert as read" });
    }
  });
  app2.post("/api/alerts/mark-read", async (req, res) => {
    try {
      const { ids } = req.body;
      const now = /* @__PURE__ */ new Date();
      if (Array.isArray(ids) && ids.length > 0) {
        await db.update(alerts).set({ readAt: now }).where(and9(eq10(alerts.userId, "default"), isNull4(alerts.readAt), inArray3(alerts.id, ids)));
      } else {
        await db.update(alerts).set({ readAt: now }).where(and9(eq10(alerts.userId, "default"), isNull4(alerts.readAt)));
      }
      res.json({ success: true });
    } catch (err) {
      console.error("[api/alerts/mark-read] Error:", err);
      res.status(500).json({ error: "Failed to mark alerts as read" });
    }
  });
  app2.delete("/api/alerts/bulk", async (req, res) => {
    try {
      const { ids } = req.body;
      if (Array.isArray(ids) && ids.length > 0) {
        await db.delete(alerts).where(and9(eq10(alerts.userId, "default"), inArray3(alerts.id, ids)));
      } else {
        await db.delete(alerts).where(eq10(alerts.userId, "default"));
      }
      res.json({ success: true });
    } catch (err) {
      console.error("[api/alerts/bulk] Error:", err);
      res.status(500).json({ error: "Failed to delete alerts" });
    }
  });
  app2.delete("/api/alerts/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await db.delete(alerts).where(and9(eq10(alerts.id, id), eq10(alerts.userId, "default")));
      res.json({ success: true });
    } catch (err) {
      console.error("[api/alerts/:id] Error:", err);
      res.status(500).json({ error: "Failed to delete alert" });
    }
  });
  app2.get("/api/events/upcoming", async (req, res) => {
    try {
      const days = Math.min(parseInt(String(req.query.days ?? "7"), 10) || 7, 60);
      const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1e3);
      const now = /* @__PURE__ */ new Date();
      const rows = await db.select({
        id: legislativeEvents.id,
        eventType: legislativeEvents.eventType,
        chamber: legislativeEvents.chamber,
        committeeId: legislativeEvents.committeeId,
        title: legislativeEvents.title,
        startsAt: legislativeEvents.startsAt,
        endsAt: legislativeEvents.endsAt,
        timezone: legislativeEvents.timezone,
        location: legislativeEvents.location,
        status: legislativeEvents.status,
        sourceUrl: legislativeEvents.sourceUrl,
        externalId: legislativeEvents.externalId,
        committeeName: committees.name,
        committeeChamber: committees.chamber,
        witnessCount: hearingDetails.witnessCount
      }).from(legislativeEvents).leftJoin(committees, eq10(committees.id, legislativeEvents.committeeId)).leftJoin(hearingDetails, eq10(hearingDetails.eventId, legislativeEvents.id)).where(
        and9(
          gte3(legislativeEvents.startsAt, now),
          lte2(legislativeEvents.startsAt, cutoff)
        )
      ).orderBy(asc2(legislativeEvents.startsAt)).limit(200);
      const eventIds = rows.map((r) => r.id);
      const agendaCounts = {};
      if (eventIds.length > 0) {
        const counts = await db.select({
          eventId: hearingAgendaItems.eventId,
          count: sql12`count(*)`
        }).from(hearingAgendaItems).where(inArray3(hearingAgendaItems.eventId, eventIds)).groupBy(hearingAgendaItems.eventId);
        counts.forEach((c) => agendaCounts[c.eventId] = Number(c.count));
      }
      const enriched = rows.map((r) => ({
        ...r,
        billCount: agendaCounts[r.id] ?? 0
      }));
      res.json({ events: enriched, total: enriched.length });
    } catch (err) {
      console.error("[api/events/upcoming] Error:", err);
      res.status(500).json({ error: "Failed to fetch events" });
    }
  });
  app2.get("/api/committees/:id/hearings", async (req, res) => {
    try {
      const { id } = req.params;
      const range = req.query.range === "past" ? "past" : "upcoming";
      const now = /* @__PURE__ */ new Date();
      const rows = await db.select({
        id: legislativeEvents.id,
        title: legislativeEvents.title,
        startsAt: legislativeEvents.startsAt,
        location: legislativeEvents.location,
        status: legislativeEvents.status,
        sourceUrl: legislativeEvents.sourceUrl,
        externalId: legislativeEvents.externalId,
        witnessCount: hearingDetails.witnessCount,
        noticeText: hearingDetails.noticeText
      }).from(legislativeEvents).leftJoin(hearingDetails, eq10(hearingDetails.eventId, legislativeEvents.id)).where(
        and9(
          eq10(legislativeEvents.committeeId, id),
          eq10(legislativeEvents.eventType, "COMMITTEE_HEARING"),
          range === "upcoming" ? gte3(legislativeEvents.startsAt, now) : lte2(legislativeEvents.startsAt, now)
        )
      ).orderBy(
        range === "upcoming" ? asc2(legislativeEvents.startsAt) : desc2(legislativeEvents.startsAt)
      ).limit(50);
      const eventIds = rows.map((r) => r.id);
      const agendaCounts = {};
      if (eventIds.length > 0) {
        const counts = await db.select({
          eventId: hearingAgendaItems.eventId,
          count: sql12`count(*)`
        }).from(hearingAgendaItems).where(inArray3(hearingAgendaItems.eventId, eventIds)).groupBy(hearingAgendaItems.eventId);
        counts.forEach((c) => agendaCounts[c.eventId] = Number(c.count));
      }
      const hearings = rows.map((r) => ({ ...r, billCount: agendaCounts[r.id] ?? 0 }));
      res.json({ hearings, total: hearings.length });
    } catch (err) {
      console.error("[api/committees/:id/hearings] Error:", err);
      res.status(500).json({ error: "Failed to fetch hearings" });
    }
  });
  app2.get("/api/hearings/:eventId", async (req, res) => {
    try {
      const { eventId } = req.params;
      const [event] = await db.select({
        id: legislativeEvents.id,
        eventType: legislativeEvents.eventType,
        chamber: legislativeEvents.chamber,
        committeeId: legislativeEvents.committeeId,
        title: legislativeEvents.title,
        startsAt: legislativeEvents.startsAt,
        endsAt: legislativeEvents.endsAt,
        timezone: legislativeEvents.timezone,
        location: legislativeEvents.location,
        status: legislativeEvents.status,
        sourceUrl: legislativeEvents.sourceUrl,
        externalId: legislativeEvents.externalId,
        committeeName: committees.name,
        noticeText: hearingDetails.noticeText,
        meetingType: hearingDetails.meetingType,
        postingDate: hearingDetails.postingDate,
        videoUrl: hearingDetails.videoUrl,
        witnessCount: hearingDetails.witnessCount
      }).from(legislativeEvents).leftJoin(committees, eq10(committees.id, legislativeEvents.committeeId)).leftJoin(hearingDetails, eq10(hearingDetails.eventId, legislativeEvents.id)).where(eq10(legislativeEvents.id, eventId)).limit(1);
      if (!event) {
        return res.status(404).json({ error: "Hearing not found" });
      }
      const agenda = await db.select({
        id: hearingAgendaItems.id,
        billNumber: hearingAgendaItems.billNumber,
        itemText: hearingAgendaItems.itemText,
        sortOrder: hearingAgendaItems.sortOrder
      }).from(hearingAgendaItems).where(eq10(hearingAgendaItems.eventId, eventId)).orderBy(asc2(hearingAgendaItems.sortOrder)).limit(100);
      res.json({ hearing: event, agenda });
    } catch (err) {
      console.error("[api/hearings/:eventId] Error:", err);
      res.status(500).json({ error: "Failed to fetch hearing" });
    }
  });
  app2.get(
    "/api/hearings/:eventId/witnesses",
    async (req, res) => {
      try {
        const { eventId } = req.params;
        const rows = await db.select().from(witnesses).where(eq10(witnesses.eventId, eventId)).orderBy(asc2(witnesses.sortOrder)).limit(500);
        res.json({ witnesses: rows, total: rows.length });
      } catch (err) {
        console.error("[api/hearings/:eventId/witnesses] Error:", err);
        res.status(500).json({ error: "Failed to fetch witnesses" });
      }
    }
  );
  app2.post("/api/subscriptions", async (req, res) => {
    try {
      const { type, committeeId, billId, chamber, officialPublicId } = req.body;
      if (!["COMMITTEE", "BILL", "CHAMBER", "OFFICIAL"].includes(type)) {
        return res.status(400).json({ error: "Invalid subscription type" });
      }
      const [inserted] = await db.insert(userSubscriptions).values({
        userId: "default",
        type,
        committeeId: committeeId ?? void 0,
        billId: billId ?? void 0,
        chamber: chamber ?? void 0,
        officialPublicId: officialPublicId ?? void 0
      }).returning();
      res.status(201).json({ subscription: inserted });
    } catch (err) {
      console.error("[api/subscriptions POST] Error:", err);
      res.status(500).json({ error: "Failed to create subscription" });
    }
  });
  app2.delete("/api/subscriptions/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const [deleted] = await db.delete(userSubscriptions).where(and9(eq10(userSubscriptions.id, id), eq10(userSubscriptions.userId, "default"))).returning({ id: userSubscriptions.id });
      if (!deleted) {
        return res.status(404).json({ error: "Subscription not found" });
      }
      res.json({ success: true });
    } catch (err) {
      console.error("[api/subscriptions DELETE] Error:", err);
      res.status(500).json({ error: "Failed to delete subscription" });
    }
  });
  app2.get("/api/subscriptions", async (_req, res) => {
    try {
      const rows = await db.select().from(userSubscriptions).where(eq10(userSubscriptions.userId, "default")).orderBy(desc2(userSubscriptions.createdAt));
      res.json({ subscriptions: rows });
    } catch (err) {
      console.error("[api/subscriptions GET] Error:", err);
      res.status(500).json({ error: "Failed to fetch subscriptions" });
    }
  });
  app2.post("/api/admin/run-hourly", async (req, res) => {
    if (!requireAdminSecret(req, res)) return;
    try {
      const result = await triggerRssPoll();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });
  app2.post("/api/admin/run-daily", async (req, res) => {
    if (!requireAdminSecret(req, res)) return;
    try {
      const result = await triggerDailyRefresh();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });
  app2.post("/api/admin/bootstrap-legislative", async (req, res) => {
    if (!requireAdminSecret(req, res)) return;
    try {
      const result = await triggerFullLegislativeBootstrap();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });
  app2.post("/api/push-tokens", async (req, res) => {
    try {
      const { token, platform } = req.body;
      if (!token || typeof token !== "string") {
        res.status(400).json({ error: "token is required" });
        return;
      }
      await db.insert(pushTokens).values({
        userId: "default",
        token,
        platform: platform ?? null,
        lastSeenAt: /* @__PURE__ */ new Date()
      }).onConflictDoUpdate({
        target: pushTokens.token,
        set: { lastSeenAt: /* @__PURE__ */ new Date(), platform: platform ?? null }
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });
  app2.delete("/api/push-tokens/:token", async (req, res) => {
    try {
      const { token } = req.params;
      await db.delete(pushTokens).where(eq10(pushTokens.token, token));
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });
}

// server/services/groqService.ts
import Groq from "groq-sdk";
var _groq = null;
function getClient() {
  if (!_groq) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY environment variable is not set");
    _groq = new Groq({ apiKey });
  }
  return _groq;
}
async function parseNaturalLanguageSearch(query) {
  const completion = await getClient().chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: `You extract search filters from queries about Texas and US legislators.
Return ONLY valid JSON with these optional keys:
- party: "Republican" | "Democrat" | "Independent"
- chamber: "TX Senate" | "TX House" | "US House"
- committeeKeyword: string (partial committee name)
- nameKeyword: string (person name fragment)
- districtNumber: number
Omit keys that cannot be determined. Never include explanations outside JSON.`
      },
      { role: "user", content: query }
    ],
    response_format: { type: "json_object" },
    temperature: 0,
    max_tokens: 150
  });
  try {
    return JSON.parse(completion.choices[0].message.content ?? "{}");
  } catch {
    return {};
  }
}
async function classifyIntent(question) {
  const completion = await getClient().chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: `You classify questions about Texas state government, its legislators, and legislation.
Return ONLY valid JSON with:
- intent: "officials" | "legislation" | "hearings" | "committees" | "general"
- entities: object with optional keys:
  - names: string[] (person name fragments)
  - billNumbers: string[] (e.g. "HB 1234", "SB 5", "HJR 20")
  - committeeKeywords: string[] (committee name fragments, e.g. "business" from "Business & Commerce")
  - party: "Republican" | "Democrat" (if filtering by party)
  - chamber: "TX House" | "TX Senate" | "US House" (if filtering by chamber)
  - keywords: string[] (city names, area names, topic keywords like "high profile", "important". IMPORTANT: for questions about cities/areas like "who represents Austin" or "officials from Dallas", put the city name in keywords and use "officials" intent)

Intent rules:
- "committees" \u2014 who is ON a committee, who chairs it, committee membership questions. Also use when asking about party members on a specific committee (e.g. "which Republicans are on X committee" \u2192 committees intent with party + committeeKeywords).
- "officials" \u2014 questions about specific legislators by name, district, city/area, or party WITHOUT a committee context. Use for "who represents [city]", "officials from [area]", "legislators in [city]". Put city/area names in keywords.
- "legislation" \u2014 questions about specific bills (HB/SB numbers), what a bill does, bill status, or bill topics. Use when user says "describe bill X" or "tell me about HB X".
- "hearings" \u2014 questions about upcoming hearings, scheduled meetings, what's on the calendar. Use for "upcoming hearings", "what's being heard this week", "highest profile hearings", or "tell me about the upcoming X committee hearing".
- "general" \u2014 broad stats, overview questions, or questions that don't fit the above.

Be precise with committeeKeywords \u2014 extract the distinguishing part of committee names (e.g. "Business & Commerce" \u2192 ["business", "commerce"], "State Affairs" \u2192 ["state affairs"], "Education" \u2192 ["education"]).`
      },
      { role: "user", content: question }
    ],
    response_format: { type: "json_object" },
    temperature: 0,
    max_tokens: 250
  });
  try {
    const parsed = JSON.parse(completion.choices[0].message.content ?? "{}");
    return {
      intent: parsed.intent ?? "general",
      entities: parsed.entities ?? {}
    };
  } catch {
    return { intent: "general", entities: {} };
  }
}
async function searchWeb(query) {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_SEARCH_CX;
  if (!apiKey || !cx) return "";
  try {
    const params = new URLSearchParams({
      key: apiKey,
      cx,
      q: query,
      num: "5"
    });
    const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`);
    if (!res.ok) return "";
    const data = await res.json();
    const items = (data.items ?? []).slice(0, 5);
    if (items.length === 0) return "";
    const lines = items.map(
      (item, i) => `${i + 1}. ${item.title}
   ${item.snippet ?? ""}
   Source: ${item.link}`
    );
    return `Web search results for "${query}":
${lines.join("\n\n")}`;
  } catch {
    return "";
  }
}
async function answerQuestion(question, dataContext, webContext) {
  const hasWeb = webContext && webContext.length > 0;
  const systemPrompt = `You are a knowledgeable Texas legislative aide embedded in TXDistrictNavigator, an app for tracking Texas state government. Your audience understands how Texas government works (House, Senate, committees, the legislative process) but relies on you to stay current on who's where and what's happening.

Guidelines:
- Answer primarily from the provided app data context. For names, districts, bill numbers, dates, and official facts, rely strictly on the app data \u2014 never fabricate these.
- ${hasWeb ? "Web search results are also provided. Use them to supplement your answer with additional background, news context, or explanations the app data doesn't cover. Clearly distinguish app data (authoritative) from web context (supplementary)." : "If the data doesn't contain enough to answer, say so clearly and suggest what the user could ask instead."}
- Be direct and well-organized. Use bullet points for lists of people or hearings.
- For committee membership questions: list members with their party, district, and role (highlight Chair and Vice-Chair at the top).
- For hearing questions: lead with date/time, location, and committee, then summarize the agenda. Note bill count and witness count as indicators of significance.
- For bill questions: explain what the bill does in plain English, note its current status and any upcoming hearings.
- Keep responses concise but complete \u2014 don't truncate lists of members or agenda items unless there are many.
- Use "R" and "D" shorthand for party when listing multiple members.
- When asked about "high profile" or "important" hearings, assess based on: number of bills on the agenda, witness count, and committee prominence.`;
  const userContent = hasWeb ? `App data:
${dataContext}

${webContext}

Question: ${question}` : `Data context:
${dataContext}

Question: ${question}`;
  const completion = await getClient().chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent }
    ],
    temperature: 0.3,
    max_tokens: 800
  });
  return completion.choices[0].message.content?.trim() ?? "I couldn't generate an answer. Please try again.";
}
async function summarizeBill(context) {
  const witnessLine = context.witnessPositions ? `Registered witnesses: ${context.witnessPositions.for} for, ${context.witnessPositions.against} against, ${context.witnessPositions.on} neutral.` : "";
  const actionsLine = context.actionHistory?.length ? `Recent actions: ${context.actionHistory.slice(0, 5).join("; ")}.` : "";
  const prompt = `Bill: ${context.billNumber} (Session ${context.session})
Caption: ${context.caption ?? "Not provided"}
Agenda description: ${context.agendaItemText ?? "Not provided"}
${actionsLine}
${witnessLine}`;
  const completion = await getClient().chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: "Explain this Texas or US legislative bill in 2-3 plain English sentences for a general audience. Focus on what the bill would do if passed. Be concise and neutral. Do not start with 'This bill'."
      },
      { role: "user", content: prompt }
    ],
    temperature: 0.3,
    max_tokens: 200
  });
  return completion.choices[0].message.content?.trim() ?? "Summary unavailable.";
}

// server/routes/aiRoutes.ts
init_db();
init_schema();
import { eq as eq11, ilike as ilike3, or as or3, and as and10, gte as gte4, lte as lte3, asc as asc3, desc as desc3, inArray as inArray4, sql as sql13 } from "drizzle-orm";
function registerAiRoutes(app2) {
  app2.post("/api/ai/parse-search", async (req, res) => {
    const { query } = req.body ?? {};
    if (!query?.trim()) {
      return res.status(400).json({ error: "query is required" });
    }
    if (!process.env.GROQ_API_KEY) {
      return res.status(503).json({ error: "AI search is not configured" });
    }
    const filters = await parseNaturalLanguageSearch(query);
    res.json(filters);
  });
  app2.post("/api/ai/summarize-bill", async (req, res) => {
    const context = req.body;
    if (!context?.billNumber || !context?.session) {
      return res.status(400).json({ error: "billNumber and session are required" });
    }
    if (!process.env.GROQ_API_KEY) {
      return res.status(503).json({ error: "AI summarization is not configured" });
    }
    const summary = await summarizeBill(context);
    res.json({ summary });
  });
  app2.post("/api/ai/ask", async (req, res) => {
    const { question } = req.body ?? {};
    if (!question?.trim()) {
      return res.status(400).json({ error: "question is required" });
    }
    if (!process.env.GROQ_API_KEY) {
      return res.status(503).json({ error: "AI is not configured" });
    }
    try {
      const classification = await classifyIntent(question);
      const { intent, entities } = classification;
      let dataContext = "";
      const partyCode = entities.party ? entities.party.toLowerCase().startsWith("r") ? "R" : entities.party.toLowerCase().startsWith("d") ? "D" : null : null;
      const sourceMap = {
        "TX House": "TX_HOUSE",
        "TX Senate": "TX_SENATE",
        "US House": "US_HOUSE"
      };
      const sourceCode = entities.chamber ? sourceMap[entities.chamber] ?? null : null;
      if (intent === "officials" || intent === "committees") {
        const conditions = [eq11(officialPublic.active, true)];
        if (partyCode) conditions.push(eq11(officialPublic.party, partyCode));
        if (sourceCode) conditions.push(eq11(officialPublic.source, sourceCode));
        if (entities.names?.length) {
          const nameConditions = entities.names.map((n) => ilike3(officialPublic.fullName, `%${n}%`));
          conditions.push(or3(...nameConditions));
        }
        if (entities.keywords?.length) {
          const cityConditions = entities.keywords.map((kw) => ilike3(officialPublic.searchCities, `%${kw}%`));
          conditions.push(or3(...cityConditions));
        }
        if (entities.committeeKeywords?.length) {
          const cmteConditions = entities.committeeKeywords.map((kw) => ilike3(committees.name, `%${kw}%`));
          const matchingCommittees = await db.select({ id: committees.id, name: committees.name, chamber: committees.chamber }).from(committees).where(or3(...cmteConditions)).limit(5);
          if (matchingCommittees.length > 0) {
            const cmteIds = matchingCommittees.map((c) => c.id);
            const memberships = await db.select({
              officialId: committeeMemberships.officialPublicId,
              roleTitle: committeeMemberships.roleTitle,
              memberName: committeeMemberships.memberName,
              committeeName: committees.name
            }).from(committeeMemberships).innerJoin(committees, eq11(committeeMemberships.committeeId, committees.id)).where(inArray4(committeeMemberships.committeeId, cmteIds)).limit(80);
            if (memberships.length > 0) {
              const memberIds = [...new Set(memberships.map((m) => m.officialId).filter(Boolean))];
              const officialConditions = [inArray4(officialPublic.id, memberIds.slice(0, 60))];
              if (partyCode) officialConditions.push(eq11(officialPublic.party, partyCode));
              if (sourceCode) officialConditions.push(eq11(officialPublic.source, sourceCode));
              const officialsData = await db.select({ id: officialPublic.id, fullName: officialPublic.fullName, party: officialPublic.party, source: officialPublic.source, district: officialPublic.district }).from(officialPublic).where(and10(...officialConditions)).limit(60);
              const memberMap = new Map(memberships.map((m) => [m.officialId, { roleTitle: m.roleTitle, committee: m.committeeName, memberName: m.memberName }]));
              const lines = officialsData.map((o) => {
                const membership = memberMap.get(o.id);
                const party = o.party === "R" ? "Republican" : o.party === "D" ? "Democrat" : o.party ?? "Unknown";
                const role = membership?.roleTitle ? ` [${membership.roleTitle}]` : "";
                return `${o.fullName} (${party}, ${o.source.replace(/_/g, " ")}, District ${o.district}) \u2014 ${membership?.committee ?? ""}${role}`;
              });
              const linkedIds = new Set(officialsData.map((o) => o.id));
              const unlinkedMembers = memberships.filter((m) => !m.officialId || !linkedIds.has(m.officialId));
              if (unlinkedMembers.length > 0 && !partyCode && !sourceCode) {
                for (const m of unlinkedMembers) {
                  const role = m.roleTitle ? ` [${m.roleTitle}]` : "";
                  lines.push(`${m.memberName} \u2014 ${m.committeeName}${role}`);
                }
              }
              const cmteNames = matchingCommittees.map((c) => c.name).join(", ");
              const partyLabel = partyCode ? partyCode === "R" ? "Republican " : "Democrat " : "";
              dataContext = lines.length > 0 ? `${partyLabel}members of ${cmteNames} (${lines.length} found):
${lines.join("\n")}` : `No ${partyLabel.toLowerCase()}members found for ${cmteNames}.`;
            }
          }
        }
        if (!dataContext) {
          const officials = await db.select({ id: officialPublic.id, fullName: officialPublic.fullName, party: officialPublic.party, source: officialPublic.source, district: officialPublic.district, roleTitle: officialPublic.roleTitle, searchCities: officialPublic.searchCities }).from(officialPublic).where(and10(...conditions)).orderBy(asc3(officialPublic.source), asc3(officialPublic.district)).limit(50);
          const lines = officials.map((o) => {
            const party = o.party === "R" ? "Republican" : o.party === "D" ? "Democrat" : o.party ?? "Unknown";
            const role = o.roleTitle ? ` (${o.roleTitle})` : "";
            const cities = o.searchCities ? ` [cities: ${o.searchCities}]` : "";
            return `${o.fullName}${role} \u2014 ${party}, ${o.source.replace(/_/g, " ")}, District ${o.district}${cities}`;
          });
          dataContext = officials.length > 0 ? `Legislators (${officials.length} found):
${lines.join("\n")}` : "No matching legislators found.";
        }
      } else if (intent === "legislation") {
        const billConditions = [];
        if (entities.billNumbers?.length) {
          billConditions.push(or3(...entities.billNumbers.map((bn) => ilike3(bills.billNumber, `%${bn.replace(/\s+/g, "")}%`))));
        } else if (entities.keywords?.length) {
          billConditions.push(or3(...entities.keywords.map((kw) => ilike3(bills.caption, `%${kw}%`))));
        }
        const billsData = await db.select({ id: bills.id, billNumber: bills.billNumber, legSession: bills.legSession, caption: bills.caption }).from(bills).where(billConditions.length > 0 ? and10(...billConditions) : void 0).orderBy(desc3(bills.updatedAt)).limit(15);
        if (billsData.length > 0) {
          const billIds = billsData.map((b) => b.id);
          const actionsData = await db.select({ billId: billActions.billId, actionText: billActions.actionText, actionAt: billActions.actionAt }).from(billActions).where(inArray4(billActions.billId, billIds)).orderBy(desc3(billActions.actionAt)).limit(75);
          const actionsByBill = /* @__PURE__ */ new Map();
          for (const a of actionsData) {
            const existing = actionsByBill.get(a.billId) ?? [];
            if (existing.length < 5) {
              existing.push(a.actionText);
              actionsByBill.set(a.billId, existing);
            }
          }
          const upcomingAgenda = await db.select({
            billNumber: hearingAgendaItems.billNumber,
            hearingTitle: legislativeEvents.title,
            hearingDate: legislativeEvents.startsAt
          }).from(hearingAgendaItems).innerJoin(legislativeEvents, eq11(hearingAgendaItems.eventId, legislativeEvents.id)).where(and10(
            inArray4(hearingAgendaItems.billId, billIds),
            gte4(legislativeEvents.startsAt, /* @__PURE__ */ new Date())
          )).limit(20);
          const hearingByBill = /* @__PURE__ */ new Map();
          for (const a of upcomingAgenda) {
            if (a.billNumber && !hearingByBill.has(a.billNumber)) {
              const dateStr = a.hearingDate ? a.hearingDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/Chicago" }) : "TBD";
              hearingByBill.set(a.billNumber, `${a.hearingTitle} on ${dateStr}`);
            }
          }
          const lines = billsData.map((b) => {
            const actions = actionsByBill.get(b.id) ?? [];
            const actionStr = actions.length > 0 ? `
  Recent actions: ${actions.slice(0, 3).join("; ")}` : "";
            const hearingStr = hearingByBill.has(b.billNumber) ? `
  Upcoming hearing: ${hearingByBill.get(b.billNumber)}` : "";
            return `${b.billNumber} (Session ${b.legSession}): ${b.caption ?? "No caption"}${actionStr}${hearingStr}`;
          });
          dataContext = `Bills:
${lines.join("\n\n")}`;
        } else {
          dataContext = "No matching bills found in the database.";
        }
      } else if (intent === "hearings") {
        const now = /* @__PURE__ */ new Date();
        const twoWeeksOut = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1e3);
        const hearingConditions = [
          eq11(legislativeEvents.eventType, "COMMITTEE_HEARING"),
          gte4(legislativeEvents.startsAt, now),
          lte3(legislativeEvents.startsAt, twoWeeksOut)
        ];
        let committeeFilter = null;
        if (entities.committeeKeywords?.length) {
          const cmteConditions = entities.committeeKeywords.map((kw) => ilike3(committees.name, `%${kw}%`));
          const matchingCmtes = await db.select({ id: committees.id, name: committees.name }).from(committees).where(or3(...cmteConditions)).limit(5);
          if (matchingCmtes.length > 0) {
            committeeFilter = matchingCmtes.map((c) => c.id);
            hearingConditions.push(inArray4(legislativeEvents.committeeId, committeeFilter));
          }
        }
        if (sourceCode) {
          hearingConditions.push(eq11(legislativeEvents.chamber, sourceCode));
        }
        const events = await db.select({
          id: legislativeEvents.id,
          title: legislativeEvents.title,
          startsAt: legislativeEvents.startsAt,
          location: legislativeEvents.location,
          chamber: legislativeEvents.chamber,
          status: legislativeEvents.status,
          committeeName: committees.name,
          witnessCount: hearingDetails.witnessCount,
          meetingType: hearingDetails.meetingType
        }).from(legislativeEvents).leftJoin(committees, eq11(committees.id, legislativeEvents.committeeId)).leftJoin(hearingDetails, eq11(hearingDetails.eventId, legislativeEvents.id)).where(and10(...hearingConditions)).orderBy(asc3(legislativeEvents.startsAt)).limit(20);
        if (events.length > 0) {
          const eventIds = events.map((e) => e.id);
          const agendaItems = await db.select({ eventId: hearingAgendaItems.eventId, billNumber: hearingAgendaItems.billNumber, itemText: hearingAgendaItems.itemText }).from(hearingAgendaItems).where(inArray4(hearingAgendaItems.eventId, eventIds)).orderBy(asc3(hearingAgendaItems.sortOrder)).limit(100);
          const agendaByEvent = /* @__PURE__ */ new Map();
          const billCountByEvent = /* @__PURE__ */ new Map();
          for (const item of agendaItems) {
            const existing = agendaByEvent.get(item.eventId) ?? [];
            existing.push(item.billNumber ? `${item.billNumber}: ${item.itemText}` : item.itemText);
            agendaByEvent.set(item.eventId, existing);
            billCountByEvent.set(item.eventId, (billCountByEvent.get(item.eventId) ?? 0) + 1);
          }
          const lines = events.map((e) => {
            const dateStr = e.startsAt ? e.startsAt.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/Chicago" }) : "TBD";
            const chamberStr = e.chamber === "TX_HOUSE" ? "House" : e.chamber === "TX_SENATE" ? "Senate" : "";
            const billCount = billCountByEvent.get(e.id) ?? 0;
            const witnessStr = e.witnessCount ? `${e.witnessCount} witnesses` : "";
            const billStr = billCount > 0 ? `${billCount} bills` : "";
            const stats = [billStr, witnessStr].filter(Boolean).join(", ");
            const agenda = agendaByEvent.get(e.id) ?? [];
            const agendaStr = agenda.length > 0 ? `
  Agenda: ${agenda.slice(0, 6).join("; ")}` : "";
            return `${chamberStr ? `[${chamberStr}] ` : ""}${e.committeeName ?? e.title} \u2014 ${dateStr}${e.location ? `, ${e.location}` : ""} (${e.status})${stats ? `
  ${stats}` : ""}${agendaStr}`;
          });
          dataContext = `Upcoming hearings (next 14 days, ${events.length} found):
${lines.join("\n\n")}`;
        } else {
          dataContext = "No upcoming hearings found in the next 14 days.";
        }
      } else {
        const [txHouseCount, txSenateCount, usHouseCount, otherTxCount, cmteCount] = await Promise.all([
          db.select({ cnt: sql13`count(*)` }).from(officialPublic).where(and10(eq11(officialPublic.source, "TX_HOUSE"), eq11(officialPublic.active, true))),
          db.select({ cnt: sql13`count(*)` }).from(officialPublic).where(and10(eq11(officialPublic.source, "TX_SENATE"), eq11(officialPublic.active, true))),
          db.select({ cnt: sql13`count(*)` }).from(officialPublic).where(and10(eq11(officialPublic.source, "US_HOUSE"), eq11(officialPublic.active, true))),
          db.select({ cnt: sql13`count(*)` }).from(officialPublic).where(and10(eq11(officialPublic.source, "OTHER_TX"), eq11(officialPublic.active, true))),
          db.select({ cnt: sql13`count(*)` }).from(committees)
        ]);
        const now = /* @__PURE__ */ new Date();
        const nextHearings = await db.select({
          title: legislativeEvents.title,
          startsAt: legislativeEvents.startsAt,
          chamber: legislativeEvents.chamber,
          committeeName: committees.name
        }).from(legislativeEvents).leftJoin(committees, eq11(committees.id, legislativeEvents.committeeId)).where(and10(eq11(legislativeEvents.eventType, "COMMITTEE_HEARING"), gte4(legislativeEvents.startsAt, now))).orderBy(asc3(legislativeEvents.startsAt)).limit(5);
        const hearingLines = nextHearings.map((h) => {
          const dateStr = h.startsAt ? h.startsAt.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/Chicago" }) : "TBD";
          const chamberStr = h.chamber === "TX_HOUSE" ? "House" : h.chamber === "TX_SENATE" ? "Senate" : "";
          return `[${chamberStr}] ${h.committeeName ?? h.title} \u2014 ${dateStr}`;
        });
        dataContext = `Texas Legislature overview:
TX House members: ${txHouseCount[0]?.cnt ?? 0}
TX Senate members: ${txSenateCount[0]?.cnt ?? 0}
US House members (TX delegation): ${usHouseCount[0]?.cnt ?? 0}
Other statewide officials: ${otherTxCount[0]?.cnt ?? 0}
Committees tracked: ${cmteCount[0]?.cnt ?? 0}
${nextHearings.length > 0 ? `
Next ${nextHearings.length} upcoming hearings:
${hearingLines.join("\n")}` : "No upcoming hearings."}`;
      }
      let webContext;
      if (process.env.GOOGLE_SEARCH_API_KEY && process.env.GOOGLE_SEARCH_CX) {
        const searchQuery = intent === "legislation" && entities.billNumbers?.length ? `Texas ${entities.billNumbers.join(" ")} bill` : intent === "hearings" && entities.committeeKeywords?.length ? `Texas legislature ${entities.committeeKeywords.join(" ")} committee hearing` : intent === "officials" && entities.names?.length ? `Texas legislator ${entities.names.join(" ")}` : null;
        if (searchQuery) {
          webContext = await searchWeb(searchQuery);
        }
      }
      const answer = await answerQuestion(question, dataContext, webContext || void 0);
      res.json({ answer });
    } catch (err) {
      console.error("[/api/ai/ask] error:", err);
      res.status(500).json({ error: "Failed to process your question. Please try again." });
    }
  });
}

// server/routes/mapRoutes.ts
import fs3 from "fs";
import path3 from "path";

// server/data/geojson.ts
import * as fs2 from "node:fs";
import * as path2 from "node:path";
var EMPTY = { type: "FeatureCollection", features: [] };
function findGeoJSONPath(filename) {
  const candidates = [
    path2.join(process.cwd(), "server", "data", "geojson", filename),
    path2.join(process.cwd(), "data", "geojson", filename),
    path2.resolve("server", "data", "geojson", filename)
  ];
  for (const p of candidates) {
    if (fs2.existsSync(p)) return p;
  }
  return null;
}
async function loadGeoJSONAsync(filename) {
  try {
    const filePath = findGeoJSONPath(filename);
    if (!filePath) {
      console.error(`[GeoJSON] File not found: ${filename} (cwd=${process.cwd()})`);
      return EMPTY;
    }
    console.log(`[GeoJSON] Loading ${filename} from: ${filePath}`);
    const data = await fs2.promises.readFile(filePath, "utf8");
    const parsed = JSON.parse(data);
    console.log(`[GeoJSON] Successfully loaded ${filename}: ${parsed.features.length} features`);
    return parsed;
  } catch (err) {
    console.error(`[GeoJSON] Error loading ${filename}:`, err);
    return EMPTY;
  }
}
var txSenateGeoJSON = EMPTY;
var txHouseGeoJSON = EMPTY;
var usCongressGeoJSON = EMPTY;
var txSenateGeoJSONFull = EMPTY;
var txHouseGeoJSONFull = EMPTY;
var usCongressGeoJSONFull = EMPTY;
(async () => {
  const [senate, house, congress, senateFull, houseFull, congressFull] = await Promise.all([
    loadGeoJSONAsync("tx_senate_simplified.geojson"),
    loadGeoJSONAsync("tx_house_simplified.geojson"),
    loadGeoJSONAsync("us_congress_simplified.geojson"),
    loadGeoJSONAsync("tx_senate.geojson"),
    loadGeoJSONAsync("tx_house.geojson"),
    loadGeoJSONAsync("us_congress.geojson")
  ]);
  txSenateGeoJSON = senate;
  txHouseGeoJSON = house;
  usCongressGeoJSON = congress;
  txSenateGeoJSONFull = senateFull;
  txHouseGeoJSONFull = houseFull;
  usCongressGeoJSONFull = congressFull;
})();

// server/routes/mapRoutes.ts
import * as turf from "@turf/turf";
import booleanIntersects from "@turf/boolean-intersects";

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

// server/routes/mapRoutes.ts
var mapHtml = fs3.readFileSync(path3.resolve(process.cwd(), "server", "templates", "map.html"), "utf-8");
var cachedGeoJSON = { tx_house: null, tx_senate: null, us_congress: null };
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
function registerMapRoutes(app2) {
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
    res.send(mapHtml);
  });
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
  app2.get("/api/lookup/cache-stats", (_req, res) => {
    res.json(getCacheStats());
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
          } catch {
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
}

// server/routes/adminRoutes.ts
init_db();
init_schema();
init_refreshOfficials();
init_scheduler();
init_refreshGeoJSON();
init_refreshCommittees();
import { desc as desc4, eq as eq12, and as and11, sql as sql14, or as or4, inArray as inArray5, isNull as isNull5 } from "drizzle-orm";
function registerAdminRoutes(app2) {
  app2.post("/api/refresh", async (_req, res) => {
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
      const results = await Promise.all(
        sources.map(async (source) => {
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
            return { name: source.name, status: "error", error: String(err) };
          }
        })
      );
      res.json({ sources: results });
    } catch (err) {
      console.error("[Admin] GeoJSON source debug error:", err);
      res.status(500).json({ error: "Debug failed", details: String(err) });
    }
  });
  app2.get("/api/admin/officials-counts", async (_req, res) => {
    try {
      const counts = await db.select({ source: officialPublic.source, count: sql14`count(*)::int` }).from(officialPublic).where(eq12(officialPublic.active, true)).groupBy(officialPublic.source);
      const countsBySource = { TX_HOUSE: 0, TX_SENATE: 0, US_HOUSE: 0 };
      for (const { source, count } of counts) {
        countsBySource[source] = count;
      }
      const lastRefreshJobs = await db.select().from(refreshJobLog).orderBy(desc4(refreshJobLog.startedAt)).limit(5);
      const lastSuccessfulRefresh = lastRefreshJobs.find((j) => j.status === "success");
      const lastFailedRefresh = lastRefreshJobs.find(
        (j) => j.status === "failed" || j.status === "aborted"
      );
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
      res.json({ success: true, results: result.results, durationMs: result.durationMs });
    } catch (err) {
      console.error("[Admin] Committees refresh error:", err);
      res.status(500).json({ error: "Committees refresh failed" });
    }
  });
  app2.post("/admin/refresh/committees/reset", (req, res) => {
    const adminToken = process.env.ADMIN_REFRESH_TOKEN;
    const providedToken = req.headers["x-admin-token"];
    if (!adminToken || providedToken !== adminToken) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    forceResetIsRefreshingCommittees();
    console.log("[Admin] isRefreshingCommittees flag force-reset");
    res.json({ success: true, message: "isRefreshing flag reset. You can now trigger a fresh refresh." });
  });
  app2.post("/admin/refresh/committees/backfill-missing", async (req, res) => {
    const token = req.headers["x-admin-token"];
    if (token !== process.env.ADMIN_REFRESH_TOKEN) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      const result = await backfillMissingCommitteeMembers();
      res.json({ success: true, ...result });
    } catch (err) {
      console.error("[Admin] backfill-missing error:", err);
      res.status(500).json({ error: String(err) });
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
      }).from(officialPublic).where(
        and11(
          eq12(officialPublic.active, true),
          inArray5(officialPublic.source, ["TX_HOUSE", "TX_SENATE"]),
          or4(isNull5(officialPublic.photoUrl), eq12(officialPublic.photoUrl, ""))
        )
      );
      console.log(`[Admin] Headshot backfill: ${officials.length} officials missing photos`);
      res.json({ message: "Headshot backfill started", totalToProcess: officials.length });
      let found = 0;
      let failed = 0;
      for (const official of officials) {
        try {
          const result = await lookupHeadshotFromTexasTribune2(official.fullName);
          if (result.success && result.photoUrl) {
            await db.update(officialPublic).set({ photoUrl: result.photoUrl }).where(eq12(officialPublic.id, official.id));
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
      const official = await db.select().from(officialPublic).where(eq12(officialPublic.id, officialPublicId)).limit(1);
      if (official.length === 0) {
        return res.status(404).json({ error: "Official not found" });
      }
      const { persons: persons3 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
      const person = await db.select().from(persons3).where(eq12(persons3.id, personId)).limit(1);
      if (person.length === 0) {
        return res.status(404).json({ error: "Person not found" });
      }
      const { setExplicitPersonLink: setExplicitPersonLink2 } = await Promise.resolve().then(() => (init_identityResolver(), identityResolver_exports));
      const result = await setExplicitPersonLink2(officialPublicId, personId);
      console.log(`[Admin] Created explicit person link: official ${officialPublicId} -> person ${personId}`);
      res.json({ success: true, link: result, official: official[0], person: person[0] });
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
      if (!providedToken || providedToken !== adminToken) {
        return res.status(401).json({ error: "Invalid or missing admin token" });
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
        other_tx_officials: { note: "Static data source - no refresh state tracking" },
        geojson: { states: geojsonStates, isRefreshing: getIsRefreshingGeoJSON() },
        committees: { states: committeesStates, isRefreshing: getIsRefreshingCommittees() }
      };
      res.json({
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        scheduler: schedulerStatus,
        datasets,
        identity: { ...identityStats, explicitLinksDetails: explicitLinks }
      });
    } catch (err) {
      console.error("[Admin] Status error:", err);
      res.status(500).json({ error: "Failed to get system status" });
    }
  });
  app2.post("/api/admin/bootstrap-legislative", async (_req, res) => {
    try {
      const { triggerFullLegislativeBootstrap: triggerFullLegislativeBootstrap2 } = await Promise.resolve().then(() => (init_scheduler(), scheduler_exports));
      const result = await triggerFullLegislativeBootstrap2();
      res.json(result);
    } catch (err) {
      console.error("[Admin] Bootstrap legislative error:", err);
      res.status(500).json({ error: "Bootstrap failed" });
    }
  });
}

// server/routes/officialsRoutes.ts
init_db();
init_schema();
import { eq as eq13, and as and12, sql as sql15 } from "drizzle-orm";

// server/lib/officialUtils.ts
init_schema();
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
    result.push(districtMap.has(districtStr) ? districtMap.get(districtStr) : createVacantOfficial(source, d));
  }
  return result;
}

// server/routes/officialsRoutes.ts
function registerOfficialsRoutes(app2) {
  app2.get("/api/officials", async (req, res) => {
    try {
      const { district_type, source, search, q, active } = req.query;
      const conditions = [];
      if (active !== "false") {
        conditions.push(eq13(officialPublic.active, true));
      }
      let sourceFilter = null;
      const isAllSources = source === "ALL";
      if (district_type && typeof district_type === "string") {
        const validTypes = ["tx_house", "tx_senate", "us_congress"];
        if (!validTypes.includes(district_type)) {
          return res.status(400).json({ error: "Invalid district_type" });
        }
        sourceFilter = sourceFromDistrictType(district_type);
        conditions.push(eq13(officialPublic.source, sourceFilter));
      }
      if (source && typeof source === "string" && source !== "ALL") {
        const validSources = ["TX_HOUSE", "TX_SENATE", "US_HOUSE", "OTHER_TX"];
        if (!validSources.includes(source)) {
          return res.status(400).json({ error: "Invalid source" });
        }
        sourceFilter = source;
        conditions.push(eq13(officialPublic.source, sourceFilter));
      }
      const publicOfficials = await db.select().from(officialPublic).where(conditions.length > 0 ? and12(...conditions) : void 0);
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
        console.log(
          `[Search] q="${searchTerm}" | before=${beforeCount} | after=${afterCount} | bySource=${JSON.stringify(bySource)}`
        );
      }
      const sourceOrder = { TX_HOUSE: 1, TX_SENATE: 2, US_HOUSE: 3 };
      officials.sort((a, b) => {
        if (isAllSources || !sourceFilter) {
          const orderA = sourceOrder[a.source] || 99;
          const orderB = sourceOrder[b.source] || 99;
          if (orderA !== orderB) return orderA - orderB;
        }
        const distA = parseInt(a.district, 10);
        const distB = parseInt(b.district, 10);
        if (!isNaN(distA) && !isNaN(distB) && distA !== distB) return distA - distB;
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
      }).from(officialPublic).where(eq13(officialPublic.active, true));
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
  app2.get("/api/officials/with-addresses", async (_req, res) => {
    try {
      const results = await db.select({
        officialId: officialPublic.id,
        fullName: officialPublic.fullName,
        source: officialPublic.source,
        personalAddress: officialPrivate.personalAddress
      }).from(officialPublic).innerJoin(officialPrivate, eq13(officialPublic.id, officialPrivate.officialPublicId)).where(
        and12(
          eq13(officialPublic.active, true),
          sql15`${officialPrivate.personalAddress} IS NOT NULL AND ${officialPrivate.personalAddress} != ''`
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
        return res.json({ official: createVacantOfficial(source, district) });
      }
      const sourceDistrictMatch = id.match(/^(TX_HOUSE|TX_SENATE|US_HOUSE):(\d+)$/);
      if (sourceDistrictMatch) {
        const source = sourceDistrictMatch[1];
        const district = sourceDistrictMatch[2];
        const [pub2] = await db.select().from(officialPublic).where(
          and12(
            eq13(officialPublic.source, source),
            eq13(officialPublic.district, district),
            eq13(officialPublic.active, true)
          )
        ).limit(1);
        if (!pub2) {
          return res.json({ official: createVacantOfficial(source, parseInt(district, 10)) });
        }
        const [priv2] = await db.select().from(officialPrivate).where(eq13(officialPrivate.officialPublicId, pub2.id)).limit(1);
        const official2 = mergeOfficial(pub2, priv2 || null);
        official2.isVacant = false;
        return res.json({ official: official2 });
      }
      const [pub] = await db.select().from(officialPublic).where(eq13(officialPublic.id, id)).limit(1);
      if (!pub) {
        return res.status(404).json({ error: "Official not found" });
      }
      const [priv] = await db.select().from(officialPrivate).where(eq13(officialPrivate.officialPublicId, id)).limit(1);
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
      const [pub] = await db.select().from(officialPublic).where(
        and12(
          eq13(officialPublic.source, source),
          eq13(officialPublic.district, distNum),
          eq13(officialPublic.active, true)
        )
      ).limit(1);
      if (!pub) {
        return res.status(404).json({ error: "Official not found" });
      }
      const [priv] = await db.select().from(officialPrivate).where(eq13(officialPrivate.officialPublicId, pub.id)).limit(1);
      res.json({ official: mergeOfficial(pub, priv || null) });
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
        const [pub] = await db.select().from(officialPublic).where(
          and12(
            eq13(officialPublic.source, source),
            eq13(officialPublic.district, String(districtNumber)),
            eq13(officialPublic.active, true)
          )
        ).limit(1);
        if (pub) {
          const [priv] = await db.select().from(officialPrivate).where(eq13(officialPrivate.officialPublicId, pub.id)).limit(1);
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
      const [pub] = await db.select().from(officialPublic).where(eq13(officialPublic.id, id)).limit(1);
      if (!pub) {
        return res.status(404).json({ error: "Official not found" });
      }
      const parseResult = updateOfficialPrivateSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: "Invalid request body", details: parseResult.error.issues });
      }
      const updateData = parseResult.data;
      const [existing] = await db.select().from(officialPrivate).where(eq13(officialPrivate.officialPublicId, id)).limit(1);
      if (existing) {
        await db.update(officialPrivate).set({ ...updateData, addressSource: "user", updatedAt: /* @__PURE__ */ new Date() }).where(eq13(officialPrivate.id, existing.id));
      } else {
        let finalUpdateData = { ...updateData };
        let autoFilled = false;
        const addressIsEmpty = !updateData.personalAddress || updateData.personalAddress.trim().length === 0;
        if (addressIsEmpty && pub.fullName) {
          console.log(
            `[API] Auto-fill: Looking up hometown for new private notes record for "${pub.fullName}"`
          );
          try {
            const { lookupHometownFromTexasTribune: lookupHometownFromTexasTribune2 } = await Promise.resolve().then(() => (init_texasTribuneLookup(), texasTribuneLookup_exports));
            const result = await lookupHometownFromTexasTribune2(pub.fullName);
            if (result.success && result.hometown) {
              console.log(
                `[API] Auto-fill: Setting personalAddress to "${result.hometown}" for ${pub.fullName}`
              );
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
      const [updatedPriv] = await db.select().from(officialPrivate).where(eq13(officialPrivate.officialPublicId, id)).limit(1);
      res.json({ official: mergeOfficial(pub, updatedPriv) });
    } catch (err) {
      console.error("[API] Error updating private data:", err);
      res.status(500).json({ error: "Failed to update private data" });
    }
  });
}

// server/routes.ts
init_schema();
init_schema();
import { eq as eq14, and as and13, sql as sql16 } from "drizzle-orm";
init_refreshOfficials();
init_scheduler();
init_refreshCommittees();
init_refreshOtherTexasOfficials();
async function registerRoutes(app2) {
  maybeRunScheduledRefresh().catch((err) => {
    console.error("[Startup] Failed to check scheduled refresh:", err);
  });
  maybeRunCommitteeRefresh().catch((err) => {
    console.error("[Startup] Failed to check committee refresh:", err);
  });
  maybeRunOtherTxRefresh().catch((err) => {
    console.error("[Startup] Failed to check Other TX officials seed:", err);
  });
  setTimeout(async () => {
    try {
      const { bulkFillHometowns: bulkFillHometowns2 } = await Promise.resolve().then(() => (init_bulkFillHometowns(), bulkFillHometowns_exports));
      console.log(`[Startup] Checking for new officials needing hometown lookup...`);
      const result = await bulkFillHometowns2();
      console.log(`[Startup] Hometown check done: filled=${result.filled}, notFound=${result.notFound}, errors=${result.errors}`);
    } catch (err) {
      console.error(`[Startup] Hometown check failed:`, err instanceof Error ? err.message : err);
    }
  }, 9e4);
  startOfficialsRefreshScheduler();
  registerPrayerRoutes(app2);
  registerLegislativeRoutes(app2);
  registerAiRoutes(app2);
  registerMapRoutes(app2);
  registerAdminRoutes(app2);
  registerOfficialsRoutes(app2);
  app2.get("/api/stats", async (_req, res) => {
    try {
      const counts = await db.select({
        source: officialPublic.source,
        count: sql16`count(*)::int`
      }).from(officialPublic).where(eq14(officialPublic.active, true)).groupBy(officialPublic.source);
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
  app2.get("/api/committees", async (req, res) => {
    try {
      const chamber = req.query.chamber;
      let query = db.select().from(committees);
      if (chamber === "TX_HOUSE" || chamber === "TX_SENATE") {
        query = query.where(eq14(committees.chamber, chamber));
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
      const committee = await db.select().from(committees).where(eq14(committees.id, committeeId)).limit(1);
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
      }).from(committeeMemberships).leftJoin(officialPublic, eq14(committeeMemberships.officialPublicId, officialPublic.id)).where(eq14(committeeMemberships.committeeId, committeeId)).orderBy(committeeMemberships.sortOrder);
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
      let { officialId } = req.params;
      const sourceDistrictMatch = officialId.match(/^(TX_HOUSE|TX_SENATE|US_HOUSE):(\d+)$/);
      if (sourceDistrictMatch) {
        const source = sourceDistrictMatch[1];
        const district = sourceDistrictMatch[2];
        const [pub] = await db.select({ id: officialPublic.id }).from(officialPublic).where(and13(
          eq14(officialPublic.source, source),
          eq14(officialPublic.district, district),
          eq14(officialPublic.active, true)
        )).limit(1);
        if (pub) officialId = pub.id;
      }
      const memberships = await db.select({
        committeeId: committees.id,
        committeeName: committees.name,
        chamber: committees.chamber,
        roleTitle: committeeMemberships.roleTitle
      }).from(committeeMemberships).innerJoin(committees, eq14(committeeMemberships.committeeId, committees.id)).where(eq14(committeeMemberships.officialPublicId, officialId)).orderBy(committees.name);
      res.json(memberships);
    } catch (err) {
      console.error("[API] Error fetching official committees:", err);
      res.status(500).json({ error: "Failed to fetch official committees" });
    }
  });
  app2.get("/api/other-tx-officials", async (req, res) => {
    try {
      const { active, grouped } = req.query;
      const conditions = [eq14(officialPublic.source, "OTHER_TX")];
      if (active !== "false") {
        conditions.push(eq14(officialPublic.active, true));
      }
      const officials = await db.select().from(officialPublic).where(and13(...conditions));
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
  const httpServer = createServer(app2);
  return httpServer;
}

// server/index.ts
init_db();
init_schema();
import * as fs4 from "fs";
import * as path4 from "path";
import * as http from "http";
import { and as and14, eq as eq15, like } from "drizzle-orm";
var app = express();
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
  app2.use(express.json());
  app2.use(express.urlencoded({ extended: false }));
}
function setupRequestLogging(app2) {
  app2.use((req, res, next) => {
    const start = Date.now();
    const path5 = req.path;
    let capturedJsonResponse = void 0;
    const originalResJson = res.json;
    res.json = function(bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };
    res.on("finish", () => {
      if (!path5.startsWith("/api")) return;
      const duration = Date.now() - start;
      let logLine = `${req.method} ${path5} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      const maxLen = process.env.NODE_ENV === "development" ? 500 : 200;
      if (logLine.length > maxLen) {
        logLine = logLine.slice(0, maxLen - 1) + "\u2026";
      }
      console.log(logLine);
    });
    next();
  });
}
function getAppName() {
  try {
    const appJsonPath = path4.resolve(process.cwd(), "app.json");
    const appJsonContent = fs4.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}
function rebaseUrl(url, baseUrl) {
  try {
    const parsed = new URL(url, baseUrl);
    return `${baseUrl}${parsed.pathname}`;
  } catch {
    const pathname = url.startsWith("/") ? url : `/${url}`;
    return `${baseUrl}${pathname}`;
  }
}
function serveExpoManifest(platform, req, res) {
  const manifestPath = path4.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json"
  );
  if (!fs4.existsSync(manifestPath)) {
    return res.status(404).json({ error: `Manifest not found for platform: ${platform}` });
  }
  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");
  const manifest = JSON.parse(fs4.readFileSync(manifestPath, "utf-8"));
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host") || "";
  const requestBaseUrl = `${protocol}://${host}`;
  const hostWithoutProtocol = host;
  if (manifest.launchAsset?.url) {
    manifest.launchAsset.url = rebaseUrl(manifest.launchAsset.url, requestBaseUrl);
  }
  if (manifest.assets) {
    manifest.assets.forEach((asset) => {
      if (asset.url) {
        asset.url = rebaseUrl(asset.url, requestBaseUrl);
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
    manifest.extra.expoClient.iconUrl = rebaseUrl(manifest.extra.expoClient.iconUrl, requestBaseUrl);
  }
  if (manifest.extra?.expoClient?.android?.adaptiveIcon) {
    const icon = manifest.extra.expoClient.android.adaptiveIcon;
    for (const key of ["foregroundImageUrl", "monochromeImageUrl", "backgroundImageUrl"]) {
      if (icon[key]) {
        icon[key] = rebaseUrl(icon[key], requestBaseUrl);
      }
    }
  }
  console.log(`[Manifest] Serving ${platform} manifest with baseUrl: ${requestBaseUrl}`);
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
  console.log(`baseUrl`, baseUrl);
  console.log(`expsUrl`, expsUrl);
  const html = landingPageTemplate.replace(/BASE_URL_PLACEHOLDER/g, baseUrl).replace(/EXPS_URL_PLACEHOLDER/g, expsUrl).replace(/APP_NAME_PLACEHOLDER/g, appName);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}
function configureExpoAndLanding(app2) {
  const templatePath = path4.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html"
  );
  const landingPageTemplate = fs4.readFileSync(templatePath, "utf-8");
  const appName = getAppName();
  console.log("Serving static Expo files with dynamic manifest routing");
  app2.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    if (req.path !== "/" && req.path !== "/manifest") {
      return next();
    }
    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      try {
        return serveExpoManifest(platform, req, res);
      } catch (manifestErr) {
        console.log("[Manifest] Error serving manifest:", manifestErr);
        return res.status(500).json({ error: "Failed to serve manifest" });
      }
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
  app2.use("/assets", express.static(path4.resolve(process.cwd(), "assets")));
  app2.use(express.static(path4.resolve(process.cwd(), "static-build")));
  console.log("Expo routing: Checking expo-platform header on / and /manifest");
}
function setupErrorHandler(app2) {
  app2.use((err, _req, res, _next) => {
    const error = err;
    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";
    res.status(status).json({ message });
    console.error("[Error]", err);
  });
}
var bootstrapAlertsCleaned = false;
async function cleanupBootstrapAlerts() {
  if (bootstrapAlertsCleaned) return;
  try {
    const result = await db.delete(alerts).where(and14(eq15(alerts.alertType, "RSS_ITEM"), like(alerts.body, "Page content updated%"))).returning({ id: alerts.id });
    bootstrapAlertsCleaned = true;
    if (result.length > 0) {
      console.log(`[Startup] Cleaned up ${result.length} false-positive RSS bootstrap alert(s)`);
    }
  } catch (err) {
    console.error("[Startup] Alert cleanup failed:", err);
  }
}
(async () => {
  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);
  app.get("/status", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });
  configureExpoAndLanding(app);
  await cleanupBootstrapAlerts();
  let server;
  try {
    server = await registerRoutes(app);
  } catch (err) {
    console.error("[Startup] registerRoutes() failed \u2014 server cannot start:", err);
    process.exit(1);
  }
  setupErrorHandler(app);
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true
    },
    () => {
      console.log(`express server serving on port ${port}`);
    }
  );
  if (process.env.NODE_ENV === "development") {
    const EXPO_PORT = 8081;
    const expoServer = http.createServer((req, res) => {
      app(req, res);
    });
    expoServer.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.log(`[ExpoServer] Port ${EXPO_PORT} in use (Metro running?), will retry in 5s...`);
        setTimeout(() => {
          expoServer.close();
          expoServer.listen({ port: EXPO_PORT, host: "0.0.0.0" });
        }, 5e3);
      }
    });
    expoServer.listen({ port: EXPO_PORT, host: "0.0.0.0" }, () => {
      console.log(`[ExpoServer] Serving static Expo manifests on port ${EXPO_PORT}`);
    });
  }
})();

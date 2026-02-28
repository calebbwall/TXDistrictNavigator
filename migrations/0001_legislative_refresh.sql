-- Migration: Legislative Refresh System
-- Run: npm run db:push  (drizzle-kit push applies this automatically via schema.ts)
-- Or apply manually with: psql $DATABASE_URL -f migrations/0001_legislative_refresh.sql

-- Enums
DO $$ BEGIN
  CREATE TYPE subscription_type AS ENUM ('COMMITTEE','BILL','CHAMBER','OFFICIAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE alert_type_enum AS ENUM ('HEARING_POSTED','HEARING_UPDATED','CALENDAR_UPDATED','BILL_ACTION','RSS_ITEM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE event_type_enum AS ENUM ('COMMITTEE_HEARING','FLOOR_CALENDAR','SESSION_DAY','NOTICE_ONLY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE event_status_enum AS ENUM ('POSTED','SCHEDULED','CANCELLED','COMPLETED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE notification_pref_enum AS ENUM ('IN_APP_ONLY','PUSH_AND_IN_APP');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- bills
CREATE TABLE IF NOT EXISTS bills (
  id          VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_number VARCHAR(30) NOT NULL,
  leg_session VARCHAR(10) NOT NULL,
  caption     TEXT,
  source_url  TEXT,
  external_id VARCHAR(100) UNIQUE,
  updated_at  TIMESTAMP DEFAULT NOW() NOT NULL,
  created_at  TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE(bill_number, leg_session)
);

-- bill_actions
CREATE TABLE IF NOT EXISTS bill_actions (
  id                 VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id            VARCHAR(255) NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  action_at          TIMESTAMP,
  action_text        TEXT NOT NULL,
  parsed_action_type VARCHAR(50),
  committee_id       VARCHAR(255) REFERENCES committees(id) ON DELETE SET NULL,
  chamber            VARCHAR(50),
  source_url         TEXT,
  external_id        VARCHAR(100),
  created_at         TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS bill_actions_bill_action_at_idx ON bill_actions(bill_id, action_at);

-- rss_feeds
CREATE TABLE IF NOT EXISTS rss_feeds (
  id             VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_type      VARCHAR(50) NOT NULL,
  url            TEXT NOT NULL UNIQUE,
  scope_json     JSON,
  enabled        BOOLEAN DEFAULT true NOT NULL,
  etag           TEXT,
  last_modified  TEXT,
  last_polled_at TIMESTAMP,
  created_at     TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at     TIMESTAMP DEFAULT NOW() NOT NULL
);

-- rss_items
CREATE TABLE IF NOT EXISTS rss_items (
  id           VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id      VARCHAR(255) NOT NULL REFERENCES rss_feeds(id) ON DELETE CASCADE,
  guid         TEXT NOT NULL,
  title        TEXT NOT NULL,
  link         TEXT NOT NULL,
  summary      TEXT,
  published_at TIMESTAMP,
  fingerprint  TEXT NOT NULL,
  created_at   TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS rss_items_feed_guid_idx ON rss_items(feed_id, guid);

-- user_subscriptions
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id                      VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 VARCHAR(255) NOT NULL DEFAULT 'default',
  type                    subscription_type NOT NULL,
  committee_id            VARCHAR(255) REFERENCES committees(id) ON DELETE CASCADE,
  bill_id                 VARCHAR(255) REFERENCES bills(id) ON DELETE CASCADE,
  chamber                 VARCHAR(50),
  official_public_id      VARCHAR(255) REFERENCES official_public(id) ON DELETE CASCADE,
  notification_preference notification_pref_enum DEFAULT 'IN_APP_ONLY' NOT NULL,
  created_at              TIMESTAMP DEFAULT NOW() NOT NULL
);

-- alerts
CREATE TABLE IF NOT EXISTS alerts (
  id          VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     VARCHAR(255) NOT NULL DEFAULT 'default',
  alert_type  alert_type_enum NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id   TEXT,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  TIMESTAMP DEFAULT NOW() NOT NULL,
  read_at     TIMESTAMP
);
CREATE INDEX IF NOT EXISTS alerts_user_read_at_idx ON alerts(user_id, read_at);

-- legislative_events
CREATE TABLE IF NOT EXISTS legislative_events (
  id           VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  source       VARCHAR(20) DEFAULT 'TLO' NOT NULL,
  event_type   event_type_enum NOT NULL,
  chamber      VARCHAR(50),
  committee_id VARCHAR(255) REFERENCES committees(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  starts_at    TIMESTAMP,
  ends_at      TIMESTAMP,
  timezone     VARCHAR(50) DEFAULT 'America/Chicago' NOT NULL,
  location     TEXT,
  status       event_status_enum DEFAULT 'POSTED' NOT NULL,
  source_url   TEXT NOT NULL,
  external_id  VARCHAR(100) UNIQUE,
  fingerprint  TEXT NOT NULL,
  last_seen_at TIMESTAMP DEFAULT NOW() NOT NULL,
  created_at   TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at   TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS leg_events_committee_starts_at_idx ON legislative_events(committee_id, starts_at);

-- hearing_details (one-to-one with legislative_events)
CREATE TABLE IF NOT EXISTS hearing_details (
  event_id      VARCHAR(255) PRIMARY KEY REFERENCES legislative_events(id) ON DELETE CASCADE,
  notice_text   TEXT,
  meeting_type  VARCHAR(100),
  posting_date  TIMESTAMP,
  updated_date  TIMESTAMP,
  video_url     TEXT,
  witness_count INT DEFAULT 0 NOT NULL
);

-- hearing_agenda_items
CREATE TABLE IF NOT EXISTS hearing_agenda_items (
  id          VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    VARCHAR(255) NOT NULL REFERENCES legislative_events(id) ON DELETE CASCADE,
  bill_id     VARCHAR(255) REFERENCES bills(id) ON DELETE SET NULL,
  bill_number VARCHAR(30),
  item_text   TEXT NOT NULL,
  sort_order  INT NOT NULL
);

-- witnesses
CREATE TABLE IF NOT EXISTS witnesses (
  id           VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     VARCHAR(255) NOT NULL REFERENCES legislative_events(id) ON DELETE CASCADE,
  full_name    TEXT NOT NULL,
  organization TEXT,
  position     TEXT,
  bill_id      VARCHAR(255) REFERENCES bills(id) ON DELETE SET NULL,
  sort_order   INT NOT NULL
);

-- Migration: Add push_tokens table for server-driven Android/iOS push notifications
CREATE TABLE IF NOT EXISTS "push_tokens" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar(255) NOT NULL DEFAULT 'default',
  "token" text NOT NULL UNIQUE,
  "platform" varchar(20),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "last_seen_at" timestamp DEFAULT now() NOT NULL
);

-- Migration: Drop unused users table
-- This app is a single-user app with no authentication.
-- The users table was scaffolded initially but never used.
DROP TABLE IF EXISTS "users";

# Threat Model

## Project Overview

Texas Districts & Officials is an Expo/React Native client with an Express/Node.js backend and PostgreSQL database. It serves public legislative and district data, supports AI-assisted legislative queries, and also handles user-oriented state such as prayers, alerts, subscriptions, push tokens, and "private" notes attached to officials. Production traffic is TLS-protected by the platform. The mockup sandbox is development-only and out of scope for production findings.

## Assets

- **User-authored private content** — prayers, answer notes, category labels, daily picks, alert state, subscriptions, and push tokens. These are user-specific behaviors and preferences even when the current schema uses a placeholder user identifier.
- **Private official enrichment data** — personal addresses, personal phone numbers, spouse/children names, birthdays, anniversaries, tags, and free-form notes in `official_private`. This data is more sensitive than the public official directory and can create privacy and safety risk if exposed.
- **Administrative control surfaces** — manual refresh endpoints and bootstrap jobs that write to the database and trigger expensive upstream scraping.
- **Metered third-party API credentials** — Groq and Google Custom Search keys used server-side. Abuse of public endpoints can spend quota and degrade service even if the raw secrets are never disclosed.
- **Public legislative reference data** — hearings, committees, bills, maps, and official directory data. This data is mostly intended to be public, but integrity matters because clients trust it for civic workflows.

## Trust Boundaries

- **Client to API** — the mobile app, web map, and any arbitrary internet client can call the Express API. The client must be treated as untrusted.
- **API to PostgreSQL** — route handlers can read and mutate all persisted data. Missing authorization here becomes direct data exposure or tampering.
- **API to third-party services** — refresh jobs and AI routes call Groq, Google Custom Search, GeoNames, Texas Legislature Online, Texas Tribune, Congress.gov, and GIS endpoints. Publicly reachable triggers can turn these integrations into cost or availability abuse.
- **Public vs admin surfaces** — public read endpoints coexist with operational/admin endpoints guarded only by header secrets in some files. Fail-open or missing guards here materially changes production risk.
- **Device-local vs server-stored private data** — the client promises some note data is device-only, but several screens also sync private note fields to server routes. This boundary must be explicit and enforced.

## Scan Anchors

- **Production entry points:** `server/index.ts`, `server/routes.ts`
- **Highest-risk server areas:** `server/routes/officialsRoutes.ts`, `server/routes/prayerRoutes.ts`, `server/routes/legislativeRoutes.ts`, `server/routes/adminRoutes.ts`, `server/routes/aiRoutes.ts`
- **Shared data model:** `shared/schema.ts`, especially `official_private`, `prayers`, `alerts`, `user_subscriptions`, `push_tokens`
- **Admin surfaces:** `/admin/*`, `/api/admin/*`, `/api/refresh`
- **Usually lower-priority/dev-only:** test files under `server/jobs/__tests__`, local mock/sandbox-only artifacts, and workflow tooling unless production reachability is shown

## Threat Categories

### Spoofing

The API currently has no general user authentication boundary, so any internet client can act as the app for most routes. The system must ensure that user-specific endpoints require a real authenticated identity and that admin operations require fail-closed server-side secrets.

### Tampering

Several routes can mutate prayers, subscriptions, push tokens, and official-private records. The system must guarantee that only the owning authenticated user can change user state, and only explicitly authorized administrators can trigger refresh jobs or modify shared enrichment data.

### Information Disclosure

The application mixes public legislative data with private notes and personal-address data. The system must ensure that only intentionally public fields are exposed on unauthenticated routes, and that private notes, addresses, family details, and user-authored prayer content never appear in public API responses.

### Denial of Service

The backend can launch scraping jobs and metered LLM/search requests on demand. The system must enforce authentication, quotas, and rate limits on expensive routes so anonymous callers cannot burn API budget, exhaust upstream quotas, or tie up the app with repeated refresh work.

### Elevation of Privilege

Admin endpoints and other high-impact operations are reachable through ordinary HTTP routes. The system must fail closed when secrets are absent, prevent public callers from reaching administrative functions, and avoid treating a hardcoded placeholder user as equivalent to an authorized authenticated principal.
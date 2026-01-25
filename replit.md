# Texas Districts & Officials Mobile App

## Overview
This project is a mobile application designed for Texas citizens to interact with their legislative landscape. It allows users to view legislative districts on an interactive map, search for their representatives, and maintain private notes about officials. The application aims to provide a comprehensive and user-friendly platform for civic engagement, built with a focus on offline-first capabilities and robust data management. The long-term vision includes empowering citizens with accessible legislative information and fostering more informed interactions with their elected officials.

## User Preferences
- I prefer detailed explanations.
- I want iterative development.
- Ask before making major changes.
- Do not make changes to the file `client/App.tsx`.

## System Architecture
The application is built using Expo and React Native for the frontend, an Express.js backend, and a PostgreSQL database.

### UI/UX Decisions
- **Color Scheme**: Primary color is Texas Blue (#0047BB), secondary is Texas Red (#BF0A30). Party colors are Red for R (#E94B3C) and Blue for D (#4A90E2). Overlay colors for districts are Senate (#4A90E2), House (#E94B3C), and Congress (#50C878).
- **Interactive Map**: Utilizes a WebView-based Leaflet map with tappable GeoJSON polygon overlays for Texas Senate (31 districts), Texas House (150 districts), and US Congress (38 districts). Features color-coded layers with toggle controls.
- **Draw-to-Search**: Implements continuous freehand polygon drawing on the map for spatial searches, including real-time polyline preview, Douglas-Peucker simplification, and haptic feedback.
- **Offline-First**: Features NetInfo-based offline detection, a cache-first loading strategy with a 25% validation threshold, and an `OfflineBanner` component.
- **Vacancy Display**: Vacant seats are explicitly shown with distinct styling (dashed borders, user-x icon, "Seat Currently Vacant" label).

### Technical Implementations
- **Data Persistence**: Uses PostgreSQL for public official data and AsyncStorage for local user preferences, private notes, engagement tracking, and saved officials.
- **Weekly Data Refresh**: Automated synchronization of public data from Texas Legislature Online and Congress.gov. This pipeline includes fail-safe validations (e.g., abort on zero records or >25% count deviation) and soft-deactivation instead of deletion for records.
- **Search Capabilities**: Includes a comprehensive search across multiple official fields (name, district, party, addresses, email, website) and GeoNames-powered place search for Texas cities/ZIPs.
- **Private Notes & Engagement**: Allows users to add multi-entry private notes with timestamps and follow-up flags, and track engagement dates with officials. Data for private notes is keyed to survive vacancies or data refreshes.
- **Project Structure**: Organized into `client` (React Native frontend), `server` (Express.js backend), `shared` (common schema definitions), and `scripts` (utility scripts).

### Feature Specifications
- **Map Screen**: Interactive map displaying legislative districts with location services and draw-to-search functionality.
- **Browse Screen**: Comprehensive roster of officials across different chambers with search and filtering capabilities, including vacancy indicators.
- **Official Profiles**: Detailed view of public information for officials, with integrated tools for managing private notes, logging engagements, and quick actions.
- **Workflow Tools**: Includes "Saved Officials" for bookmarking, "Recent Tracking" for recently viewed/engaged officials, and a "Follow-up Dashboard" for managing pending follow-ups.
- **Admin Endpoints**: Provides administrative functionalities for triggering manual data refreshes and checking refresh status.

## External Dependencies
- **PostgreSQL**: Primary database for storing application data.
- **Express.js**: Backend framework for handling API requests.
- **Expo + React Native**: Frontend framework for mobile application development.
- **Leaflet**: JavaScript library for interactive maps, used within a WebView.
- **Turf.js**: JavaScript library for spatial analysis, used for area-hits API.
- **GeoJSON**: Standard format for encoding geographic data structures, used for district boundaries.
- **Texas Legislature Online (capitol.texas.gov)**: Web scraping target for Texas House and Senate official data.
- **Congress.gov API**: API for fetching US Congress official data (requires `CONGRESS_API_KEY`).
- **TxDOT OpenData**: Source for real GeoJSON district boundaries.
- **GeoNames API**: Used for place search functionality (cities and ZIP codes).
- **Drizzle ORM**: Used for database interactions with PostgreSQL.
- **NetInfo**: React Native module for detecting network connectivity.
- **Expo Location**: Expo module for accessing device location.
- **AsyncStorage**: React Native's local storage solution for user-specific data.

## Smart Refresh System

### Fingerprint-Based Change Detection
The refresh system uses SHA256 fingerprints to detect changes in upstream data sources before performing updates. This avoids unnecessary database writes or file overwrites when data hasn't changed. Both Officials data and GeoJSON district boundaries use this approach.

### Automatic Scheduling
- Scheduler runs every 10 minutes, checking for Monday 3-4 AM Central Time window
- Auto-refreshes both Officials and GeoJSON if not already checked that week
- Starts automatically on server boot

### Admin Endpoints (require `ADMIN_REFRESH_TOKEN` secret)
- `POST /admin/refresh/officials` - Smart refresh officials with change detection
  - Header: `x-admin-token: <token>`
  - Query: `force=true` to bypass change detection
- `POST /admin/refresh/geojson` - Smart refresh GeoJSON district files with change detection
  - Header: `x-admin-token: <token>`
  - Query: `force=true` to bypass change detection
- `GET /admin/refresh/status` - View refresh state for all sources
  - Header: `x-admin-token: <token>`
  - Returns: scheduler status, per-source fingerprints and timestamps for both officials and GeoJSON

### Database Tables
**refresh_state** (Officials, via Drizzle ORM)
- `source` - TX_HOUSE, TX_SENATE, US_HOUSE
- `fingerprint` - SHA256 hash of upstream data
- `lastCheckedAt`, `lastChangedAt`, `lastRefreshedAt` - Timestamps

**geojson_refresh_state** (GeoJSON, via raw SQL - separate from shared schema)
- `source` - TX_HOUSE_GEOJSON, TX_SENATE_GEOJSON, US_HOUSE_TX_GEOJSON
- `fingerprint` - SHA256 hash of upstream GeoJSON data
- `last_checked_at`, `last_changed_at`, `last_refreshed_at` - Timestamps

### GeoJSON Sources
- TX House districts: TxDOT ArcGIS MapServer Layer 0
- TX Senate districts: TxDOT ArcGIS MapServer Layer 1
- US Congress TX districts: TxDOT ArcGIS MapServer Layer 2
- Files stored in: `server/data/*.geojson`

### Recent Changes
- 2026-01-25: Added Committees feature with browsing and official profile integration
- 2026-01-25: Created committees and committee_memberships tables with Drizzle ORM
- 2026-01-25: Added server-side scraping from Texas Legislature Online for committee data
- 2026-01-25: Added admin endpoint POST /admin/refresh/committees with token protection
- 2026-01-25: Integrated committees into scheduler (Monday 3-4 AM Central Time)
- 2026-01-25: Added capitolRoom field to shared/schema.ts officialPublic table for TLO room numbers
- 2026-01-25: Extended smart refresh to include GeoJSON district boundary files
- 2026-01-25: Added admin endpoint POST /admin/refresh/geojson with token protection
- 2026-01-25: Created separate geojson_refresh_state table using raw SQL
- 2026-01-25: Added smart refresh with fingerprint-based change detection
- 2026-01-25: Created scheduler for Monday 3-4 AM Central Time auto-refresh
- 2026-01-25: Added admin endpoints with token protection for manual refresh triggers

## Committees Feature

### Overview
Texas House and Senate committees are scraped from Texas Legislature Online and stored in PostgreSQL. Committee memberships are linked to officials via name normalization.

### Database Tables
**committees**
- `id` - UUID primary key
- `chamber` - TX_HOUSE or TX_SENATE
- `name` - Committee name
- `slug` - URL-friendly slug
- `sourceUrl` - Link to TLO committee page
- `isActive` - Active status (default true)

**committee_memberships**
- `id` - UUID primary key
- `committeeId` - FK to committees
- `officialPublicId` - FK to officials (nullable for unmatched members)
- `memberName` - Name from TLO
- `roleTitle` - Chair, Vice Chair, or null for Member
- `sortOrder` - Member order on committee

**committee_refresh_state**
- `source` - TX_HOUSE_COMMITTEES, TX_SENATE_COMMITTEES
- `fingerprint` - SHA256 hash of upstream data
- `last_checked_at`, `last_changed_at`, `last_refreshed_at` - Timestamps

### API Endpoints
- `GET /api/committees?chamber=TX_HOUSE|TX_SENATE` - List all active committees
- `GET /api/committees/:id` - Get committee details with members
- `GET /api/officials/:officialId/committees` - Get official's committee assignments
- `POST /admin/refresh/committees` - Admin refresh (token protected)

### Client Screens
- **CommitteesScreen** - Chamber selection (Profile → Tools → Committees)
- **CommitteeListScreen** - List of committees for selected chamber
- **CommitteeDetailScreen** - Committee with member list and roles
- **OfficialProfileScreen** - Committees section in PUBLIC tab

## Schema Notes

### Custom Fields (Must Be Preserved)
If the shared schema is ever regenerated, ensure these custom fields are re-added:

**officialPublic table:**
- `capitolRoom: varchar("capitol_room", { length: 50 })` - Capitol room/office number scraped from TLO
  - Format: Full building code + room number as provided by TLO
  - Examples: "EXT E1.304", "CAP 1W.3", "GNB.647"
  - The full TLO "Capitol Office" field text is preserved (no stripping)
  - Location: Between `capitolPhone` and `districtAddresses` in the column order
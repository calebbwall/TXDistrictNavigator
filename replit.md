# Texas Districts & Officials Mobile App

## Overview
A mobile application for Texas citizens to view legislative districts, search for representatives, and manage private notes about officials. Built with Expo + React Native and Express.js backend with PostgreSQL database.

## Current State
**Phase D Complete** - Browse tab with All Officials and multi-criteria search.

### Features:
- **Map Screen**: Interactive Leaflet map via WebView with tappable GeoJSON polygon overlays for TX Senate (31), TX House (150), and US Congress (38). Color-coded layers with toggle controls. Works in Expo Go on iOS/Android and on web.
- **Draw-to-Search**: Polygon drawing mode using Leaflet.draw - tap points to draw an area, and find all officials in overlapping districts. Integrated with area-hits API using Turf.js spatial intersection.
- **Locate Me**: GPS location button using browser geolocation (web) or Expo Location (native) - shows user position with blue marker and accuracy circle on map.
- **Browse Screen**: Complete roster browsing with 4 tabs (TX House, TX Senate, US House, All Officials). Single search bar with multi-criteria matching (name, district, party, addresses, email, website). Count labels show member count and vacancy count.
- **Official Profiles**: View public info (offices, contact) and manage private notes
- **Profile Screen**: Saved officials list and default overlay preferences
- **Data Persistence**: PostgreSQL for public data, AsyncStorage for local preferences
- **Weekly Refresh**: Automatic data sync from Texas Legislature Online and Congress.gov
- **Vacancy Display**: Complete district rosters show vacant seats with distinct styling (dashed borders, user-x icon, "Seat Currently Vacant" label)

### Data Sources:
- **TX House & Senate**: Scraped from capitol.texas.gov (Texas Legislature Online)
- **US Congress**: Congress.gov API (requires CONGRESS_API_KEY)
- **District Boundaries**: Real GeoJSON from TxDOT OpenData

## Project Structure
```
/client
  /components     - Reusable UI components
  /constants      - Theme and design tokens
  /hooks          - Custom React hooks
  /lib            - API clients, adapters, storage utilities
  /navigation     - React Navigation structure
  /screens        - Screen components
  App.tsx         - App entry point
/server
  /data           - GeoJSON data files
  /jobs           - Background job scripts (refresh pipeline)
  db.ts           - Database connection
  routes.ts       - API endpoints
  index.ts        - Express server entry
/shared
  schema.ts       - Drizzle ORM schema definitions
/scripts
  verify-refresh.ts - Verification script for refresh jobs
/assets/images    - App icons and images
```

## Database Schema

### official_public (refreshable)
- `id` - UUID primary key
- `source` - TX_HOUSE, TX_SENATE, US_HOUSE
- `source_member_id` - Stable ID from source
- `chamber`, `district`, `full_name`, `party`
- `capitol_address`, `capitol_phone`
- `district_addresses`, `district_phones` (JSON)
- `website`, `email`, `photo_url`
- `active` - Soft delete flag
- `last_refreshed_at` - Timestamp

### official_private (user-entered only)
- `official_public_id` - FK to official_public
- `personal_phone`, `personal_address`
- `spouse_name`, `children_names` (JSON)
- `birthday`, `anniversary`, `notes`, `tags`

### refresh_job_log
- Tracks refresh job history for fail-safe validation

## API Endpoints

### Officials
- `GET /api/officials` - Returns merged officials (public + private overlay)
  - Query params: `district_type`, `source`, `search`, `q`, `active`
  - `source` can be: `TX_HOUSE`, `TX_SENATE`, `US_HOUSE`, or `ALL`
  - `q` or `search`: multi-field search across name, district, party, addresses, email, website
- `GET /api/officials/:id` - Returns single merged official
- `GET /api/officials/by-district` - Find by district_type and district_number
- `PATCH /api/officials/:id/private` - Update private data only

### GeoJSON
- `GET /api/geojson/tx_house` - TX House district boundaries
- `GET /api/geojson/tx_senate` - TX Senate district boundaries
- `GET /api/geojson/us_congress` - US Congress district boundaries

### Admin
- `GET /api/stats` - Returns official counts by chamber
- `GET /api/admin/officials-counts` - Returns raw counts by source (TX_HOUSE, TX_SENATE, US_HOUSE)
- `POST /api/refresh` - Trigger manual refresh

## Weekly Refresh Pipeline

### Automatic Scheduling
On server startup, checks if last refresh was >7 days ago. If so, runs refresh automatically.

### Manual Refresh
Run via API: `POST /api/refresh`

Or via command line:
```bash
npx tsx server/jobs/refreshOfficials.ts
```

### Refresh Sources
1. **TX House**: Scrapes capitol.texas.gov/Members/Members.aspx?Chamber=H
2. **TX Senate**: Scrapes capitol.texas.gov/Members/Members.aspx?Chamber=S  
3. **US Congress**: Uses Congress.gov API (requires CONGRESS_API_KEY secret)

### Fail-Safe Validation
- Zero records = abort (possible source outage)
- >25% count deviation = abort (suspicious data)
- All changes logged to refresh_job_log table
- Never deletes records - only soft-deactivates

### Verification Script
```bash
npx tsx scripts/verify-refresh.ts
```
Tests that private data survives refresh cycles.

## Environment Variables

### Required Secrets
- `DATABASE_URL` - PostgreSQL connection string (auto-configured)
- `CONGRESS_API_KEY` - API key from api.data.gov for Congress.gov API

### Auto-Configured
- `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`
- `EXPO_PUBLIC_DOMAIN` - Set by Expo for API calls

## Design System
- **Primary Color**: #0047BB (Texas Blue)
- **Secondary Color**: #BF0A30 (Texas Red)
- **Party Colors**: R=#E94B3C, D=#4A90E2
- **Overlay Colors**: Senate=#4A90E2, House=#E94B3C, Congress=#50C878

## Running the App
- **Development**: Use the Start App workflow
- **Expo Go**: Scan QR code to test on physical device
- **Web**: Access at port 8081

## Scheduled Deployment (Recommended)
For production, set up a Replit Scheduled Deployment:
1. Create new Scheduled Deployment
2. Command: `npx tsx server/jobs/refreshOfficials.ts`
3. Schedule: Weekly (e.g., Sunday 3am Central)

## Recent Changes
- 2026-01-19: Added MapResultsPanel component - scrollable bottom sheet for map results using FlatList
- 2026-01-19: Map results panel now supports collapse/expand, shows official count in header
- 2026-01-19: Phase D.2 - Added searchZips and searchCities normalized columns for faster ZIP/city search
- 2026-01-19: Phase D.2 - Created backfill script (scripts/backfill-search-fields.ts) for existing data
- 2026-01-19: Phase D.2 - Updated refresh job to populate normalized fields on future syncs
- 2026-01-19: Phase D.1 - Added server-side search logging: [Search] q="term" | before=X | after=Y
- 2026-01-18: Phase D - Replaced Search tab with Browse tab
- 2026-01-18: Phase D - Added "All Officials" tab showing combined roster (219 members)
- 2026-01-18: Phase D - Extended /api/officials with source=ALL and multi-field search (name, district, party, addresses, email, website)
- 2026-01-18: Phase D - Removed Zip/Name/Draw search screens from Browse stack (draw remains on Map only)
- 2026-01-18: Phase D - Browse screen shows 4 tabs with count labels and vacancy indicators
- 2026-01-18: Phase C - Added Draw-to-search mode with Leaflet.draw polygon drawing
- 2026-01-18: Phase C - Added POST /api/map/area-hits endpoint using Turf.js spatial intersection
- 2026-01-18: Phase C - Added Locate Me button with Expo Location permission flow
- 2026-01-18: Phase C - User location shown with blue marker and accuracy circle on map
- 2026-01-18: Phase C - Draw mode prevents normal map taps while active, auto-disables on complete
- 2026-01-18: Phase B - Multi-overlay tap now returns ALL hits from enabled layers (uses point-in-polygon algorithm)
- 2026-01-18: Map result cards are now tappable - navigates to Official Profile screen
- 2026-01-18: Debug panel on map shows hit count and official count for diagnostics
- 2026-01-18: Stable vacancy IDs (VACANT-<source>-<district>) enable private notes on vacant seats
- 2026-01-18: Data normalization layer (client/lib/officials.ts) ensures consistent Official DTO
- 2026-01-17: Fixed map rendering on web platform (iframe instead of WebView for web compatibility)
- 2026-01-17: Added multi-overlay toggle functionality with independent layer controls
- 2026-01-17: Positioned layer controls below navigation header using useHeaderHeight
- 2026-01-17: All three GeoJSON layers load correctly (House: 150, Senate: 31, Congress: 38 districts)
- 2026-01-16: Added complete vacancy display feature - shows all districts including vacant seats with distinct styling
- 2026-01-16: Vacancies dynamically filled by API using district range constants (TX_HOUSE: 1-150, TX_SENATE: 1-31, US_HOUSE: 1-38)
- 2026-01-16: OfficialCard shows vacancies with dashed borders, user-x icon, and "Seat Currently Vacant" label
- 2026-01-16: OfficialProfileScreen displays dedicated vacancy view with informational message
- 2026-01-16: Browse Lists shows vacancy counts in label (e.g., "31 members (2 vacancies)")
- 2026-01-16: Fixed Congress.gov API pagination to fetch all TX members (37 from 38 seats)
- 2026-01-16: Improved TLO parser to skip Lt. Governor and handle varied page formats
- 2026-01-16: Added /api/admin/officials-counts endpoint for debugging
- 2026-01-16: Adjusted fail-safe to allow initial population growth (was blocking updates)
- 2026-01-16: Added PostgreSQL database with Drizzle ORM
- 2026-01-16: Implemented weekly refresh pipeline from TLO and Congress.gov
- 2026-01-16: Added public/private data separation (refresh never touches private)
- 2026-01-16: Created API endpoints with merged public+private reads
- 2026-01-16: Updated client to fetch from API with mock data fallback
- 2026-01-16: Added fail-safe validation for refresh jobs
- 2026-01-08: Integrated real Texas district GeoJSON boundaries from TxDOT OpenData
- 2026-01-08: Switched to WebView-based Leaflet map for Expo Go compatibility

## Next Phase Features
1. PostGIS for spatial queries (ST_Intersects, ST_Contains)
2. Real ZIP code lookups against district geometry
3. User authentication (Apple/Google SSO)
4. Encrypted storage for sensitive private notes
5. Push notifications for legislative updates

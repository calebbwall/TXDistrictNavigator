# Texas Districts & Officials Mobile App

## Overview
This project is a mobile application designed for Texas citizens to interact with their legislative landscape. It allows users to view legislative districts on an interactive map, search for their representatives, and maintain private notes about officials. The application aims to provide a comprehensive and user-friendly platform for civic engagement, built with a focus on offline-first capabilities and robust data management. The long-term vision includes empowering citizens with accessible legislative information and fostering more informed interactions with their elected officials.

## User Preferences
- I prefer detailed explanations.
- I want iterative development.
- Ask before making major changes.
- Do not make changes to the folder `shared`.
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
The refresh system uses SHA256 fingerprints to detect changes in upstream data sources before performing database updates. This avoids unnecessary writes when data hasn't changed.

### Automatic Scheduling
- Scheduler runs every 10 minutes, checking for Monday 3-4 AM Central Time window
- Auto-refreshes if not already checked that week
- Starts automatically on server boot

### Admin Endpoints (require `ADMIN_REFRESH_TOKEN` secret)
- `POST /admin/refresh/officials` - Smart refresh with change detection
  - Header: `x-admin-token: <token>`
  - Query: `force=true` to bypass change detection
- `GET /admin/refresh/status` - View refresh state for all sources
  - Header: `x-admin-token: <token>`
  - Returns: scheduler status, per-source fingerprints and timestamps

### Database Table: refresh_state
- `source` - TX_HOUSE, TX_SENATE, US_HOUSE
- `fingerprint` - SHA256 hash of upstream data
- `lastCheckedAt`, `lastChangedAt`, `lastRefreshedAt` - Timestamps

### Recent Changes
- 2026-01-25: Added smart refresh with fingerprint-based change detection
- 2026-01-25: Created scheduler for Monday 3-4 AM Central Time auto-refresh
- 2026-01-25: Added admin endpoints with token protection for manual refresh triggers
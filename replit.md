# Texas Districts & Officials Mobile App

## Overview
This mobile application provides Texas citizens with an interactive platform for civic engagement. It allows users to explore legislative districts on a map, find their representatives, and manage private notes about officials. The project aims to make legislative information accessible, fostering informed interaction with elected officials, with a strong focus on offline functionality and robust data management.

## User Preferences
- I prefer detailed explanations.
- I want iterative development.
- Ask before making major changes.
- Do not make changes to the file `client/App.tsx`.

## System Architecture
The application uses Expo and React Native for the frontend, an Express.js backend, and a PostgreSQL database.

### UI/UX Decisions
- **Color Scheme**: Uses Texas-themed colors with specific hues for parties and district overlays (Senate, House, Congress).
- **Interactive Map**: Features a WebView-based Leaflet map with tappable GeoJSON polygon overlays for Texas Senate, House, and US Congress districts, including color-coded layers and toggle controls. Single-select per overlay: max 1 TX House, 1 TX Senate, 1 US Congress district highlighted at a time. Tapping a different district in the same overlay auto-unhighlights the previous. Tapping the same district again deselects it. Tapping empty map space clears all highlights. Toggling any overlay also clears all highlights.
- **Draw-to-Search**: Enables continuous freehand polygon drawing on the map for spatial searches, with real-time polyline preview and haptic feedback.
- **Offline-First**: Implements network detection, a cache-first loading strategy, and an `OfflineBanner` component.
- **Vacancy Display**: Vacant seats are clearly indicated with distinct styling and labels.

### Technical Implementations
- **Data Persistence**: Public data is stored in PostgreSQL, while user preferences, private notes, and engagement tracking are managed via AsyncStorage.
- **Weekly Data Refresh**: An automated system synchronizes public data from Texas Legislature Online and Congress.gov, including fail-safe validations and soft-deactivation for records. This process includes fingerprint-based change detection and an automated scheduler.
- **Search Capabilities**: Comprehensive search covers official fields, district office addresses (city/ZIP), private personal addresses (city/ZIP from notes), and GeoNames-powered place searches for Texas cities/ZIPs. The search index merges private notes with officials for address-based searching.
- **Private Notes & Engagement**: Users can add timestamped notes with follow-up flags and track engagement dates, with data keyed to persist across vacancies or data refreshes. New private notes records auto-fill the Personal Address field with the official's hometown from Texas Tribune directory (when available), providing a convenient starting point that users can edit to add full addresses.
- **Texas Tribune Headshots**: TX House and TX Senate officials have headshot photos auto-populated from the Texas Tribune directory (`/static/images/headshots/`). Backfill available via `POST /admin/backfill/headshots`. New officials get headshots automatically during refresh. Existing photos are never overwritten. Profile photos are tappable for full-screen viewing via a lightbox modal. Headshot markers on the map use **closest-point-inside-polygon** placement: markers appear at the tap/draw point if inside the district, otherwise snap to the nearest boundary point and nudge inward toward the centroid. This ensures markers are always inside the selected district and as close as possible to where the user interacted. Both client MAP_HTML (native) and server getMapHtml() (web) implement this with cached boundary rings and feature lookups for performance.
- **Personal Address Dots**: Purple dots on the map represent officials' personal addresses. Dots respect overlay selections: TX House dots visible when TX House overlay is ON, TX Senate dots when TX Senate overlay is ON, US Congress dots when US Congress overlay is ON. Statewide official dots are always visible regardless of overlay settings. Dots are auto-populated from the database (171 officials with hometowns) via `/api/officials/with-addresses` endpoint - no manual save required for dots to appear. City clustering consolidates multiple officials at the same location into a single dot with a count badge; clicking a cluster shows a scrollable popup with all officials at that location.
- **Project Structure**: Divided into `client` (React Native), `server` (Express.js), `shared` (schema definitions), and `scripts`.
- **Smart Refresh System**: Utilizes SHA256 fingerprints to detect changes in upstream data sources (Officials, GeoJSON, Committees, Other Texas Officials) before refreshing, preventing unnecessary updates. The refresh cycle is ordered to ensure data consistency.
- **GeoJSON Fallback System**: Client attempts to load simplified GeoJSON first, then automatically falls back to full (unsimplified) version if validation fails. Both simplified and full versions are served from `/api/geojson/{type}` and `/api/geojson/{type}_full` endpoints. Simplification uses Douglas-Peucker with geometry validation to ensure rings stay closed with >=4 points.
- **Web Platform Map**: On web, the map iframe loads from `/api/map.html` (served by Express on port 5000) instead of srcDoc to avoid CORS issues. The iframe auto-fetches GeoJSON directly from same-origin API endpoints. Cross-origin postMessage communication between iframe (port 5000) and parent (port 8081) uses `'*'` origin. Note: Iframe console logs (from Leaflet map code) are not visible in parent browser console due to cross-origin restrictions.
- **Hit Schema Compatibility**: The `highlightDistricts` function supports both native schema (`{ source: 'TX_HOUSE', districtNumber: 1 }`) and web schema (`{ type: 'tx_house', district: 1 }`), ensuring highlighting works identically on both platforms.
- **Platform-Specific Colors**: Web uses green (#55BB69) for TX House and brown (#8B4513) for US Congress; Native Expo Go uses red (#E94B3C) for TX House and green (#50C878) for US Congress. TX Senate is blue on both platforms.
- **Identity Resolution**: A `persons` table and `identityResolver` module ensure stable identity tracking for officials across position changes, crucial for maintaining note continuity.

### Feature Specifications
- **Map Screen**: Interactive district map with location services and draw-to-search.
- **Browse Screen**: Roster of officials with search, filtering, and vacancy indicators.
- **Official Profiles**: Detailed official information, integrated with private notes, engagement logging, and quick actions.
- **Workflow Tools**: Includes "Saved Officials," "Recent Tracking," and a "Follow-up Dashboard."
- **Committees Feature**: Allows browsing Texas House and Senate committees and their members, integrated into official profiles. Features hierarchical display with subcommittees nested under parent committees (e.g., "S/C on Juvenile Justice" under "Criminal Jurisprudence"). Committees on official profiles are tappable, navigating directly to the committee detail screen.
- **Other Texas Officials**: Displays all 28 statewide officials in grouped categories (9 Executive, 1 Secretary of State, 9 Supreme Court justices, 9 Court of Criminal Appeals judges). Executive officials use curated static data (updated every 4 years with elections), while court rosters are scraped from txcourts.gov with static fallback. Officials display their specific roleTitle (e.g., "Chief Justice of the Texas Supreme Court") in detail screens.
- **Admin Functionalities**: Endpoints for triggering manual data refreshes, checking refresh status, and managing explicit person identity overrides.

## External Dependencies
- **PostgreSQL**: Main database.
- **Express.js**: Backend framework.
- **Expo + React Native**: Frontend development.
- **Leaflet**: Interactive maps (via WebView).
- **Turf.js**: Spatial analysis.
- **GeoJSON**: Geographic data format.
- **Texas Legislature Online (capitol.texas.gov)**: Source for Texas legislative data.
- **Congress.gov API**: Source for US Congress data.
- **TxDOT FeatureServer**: Source for GeoJSON district boundaries (Texas_State_House_Districts, Texas_State_Senate_Districts, Texas_US_House_Districts services with DIST_NBR and REP_NM fields).
- **GeoNames API**: Place search (cities, ZIP codes).
- **Texas Tribune Directory (directory.texastribune.org)**: Source for official hometown data (auto-filling Personal Address field) and headshot photos for TX House/Senate officials.
- **Drizzle ORM**: Database interactions.
- **NetInfo**: Network connectivity detection.
- **Expo Location**: Device location access.
- **AsyncStorage**: Local user data storage.
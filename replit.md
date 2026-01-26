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
- **Interactive Map**: Features a WebView-based Leaflet map with tappable GeoJSON polygon overlays for Texas Senate, House, and US Congress districts, including color-coded layers and toggle controls.
- **Draw-to-Search**: Enables continuous freehand polygon drawing on the map for spatial searches, with real-time polyline preview and haptic feedback.
- **Offline-First**: Implements network detection, a cache-first loading strategy, and an `OfflineBanner` component.
- **Vacancy Display**: Vacant seats are clearly indicated with distinct styling and labels.

### Technical Implementations
- **Data Persistence**: Public data is stored in PostgreSQL, while user preferences, private notes, and engagement tracking are managed via AsyncStorage.
- **Weekly Data Refresh**: An automated system synchronizes public data from Texas Legislature Online and Congress.gov, including fail-safe validations and soft-deactivation for records. This process includes fingerprint-based change detection and an automated scheduler.
- **Search Capabilities**: Comprehensive search covers official fields and GeoNames-powered place searches for Texas cities/ZIPs.
- **Private Notes & Engagement**: Users can add timestamped notes with follow-up flags and track engagement dates, with data keyed to persist across vacancies or data refreshes.
- **Project Structure**: Divided into `client` (React Native), `server` (Express.js), `shared` (schema definitions), and `scripts`.
- **Smart Refresh System**: Utilizes SHA256 fingerprints to detect changes in upstream data sources (Officials, GeoJSON, Committees, Other Texas Officials) before refreshing, preventing unnecessary updates. The refresh cycle is ordered to ensure data consistency.
- **GeoJSON Fallback System**: Client attempts to load simplified GeoJSON first, then automatically falls back to full (unsimplified) version if validation fails. Both simplified and full versions are served from `/api/geojson/{type}` and `/api/geojson/{type}_full` endpoints. Simplification uses Douglas-Peucker with geometry validation to ensure rings stay closed with >=4 points.
- **Identity Resolution**: A `persons` table and `identityResolver` module ensure stable identity tracking for officials across position changes, crucial for maintaining note continuity.

### Feature Specifications
- **Map Screen**: Interactive district map with location services and draw-to-search.
- **Browse Screen**: Roster of officials with search, filtering, and vacancy indicators.
- **Official Profiles**: Detailed official information, integrated with private notes, engagement logging, and quick actions.
- **Workflow Tools**: Includes "Saved Officials," "Recent Tracking," and a "Follow-up Dashboard."
- **Committees Feature**: Allows browsing Texas House and Senate committees and their members, integrated into official profiles.
- **Other Texas Officials**: Displays statewide elected officials (Governor, Lt Governor, etc.) in a dedicated screen.
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
- **Drizzle ORM**: Database interactions.
- **NetInfo**: Network connectivity detection.
- **Expo Location**: Device location access.
- **AsyncStorage**: Local user data storage.
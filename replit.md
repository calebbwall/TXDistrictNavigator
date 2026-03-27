# Texas Districts & Officials Mobile App

## Overview
This mobile application provides Texas citizens with an interactive platform for civic engagement, allowing them to explore legislative districts, find representatives, and manage private notes about officials. The project aims to make legislative information accessible, fostering informed interaction with elected officials, with a strong focus on offline functionality and robust data management. It includes features for tracking legislative events, committee hearings, and bill activity, enhancing user engagement with the legislative process.

## User Preferences
- I prefer detailed explanations.
- I want iterative development.
- Ask before making major changes.
- Do not make changes to the file `client/App.tsx`.

## System Architecture
The application uses Expo and React Native for the frontend, an Express.js backend, and a PostgreSQL database.

### UI/UX Decisions
- **Interactive Map**: Features a WebView-based Leaflet map with tappable GeoJSON polygon overlays for Texas Senate, House, and US Congress districts, including color-coded layers and toggle controls. It also supports draw-to-search functionality.
- **Offline-First**: Implements network detection, a cache-first loading strategy, and an `OfflineBanner` component.
- **Vacancy Display**: Vacant seats are clearly indicated with distinct styling.
- **Color Scheme**: Uses Texas-themed colors with specific hues for parties and district overlays.
- **Prayer Management**: A comprehensive system for managing prayers, including CRUD operations, daily picks, streak tracking, category management, and official linkages.
- **Legislative Dashboard**: Provides a centralized view of upcoming hearings, alerts, and legislative events, with filtering options and deep-linking capabilities.

### Technical Implementations
- **Data Persistence**: Public data in PostgreSQL; user data, preferences, and private notes in AsyncStorage.
- **Weekly Data Refresh**: Automated system synchronizes public data from Texas Legislature Online and Congress.gov, including fingerprint-based change detection and fail-safe validations.
- **Search Capabilities**: Comprehensive search covers official fields, district office addresses, private personal addresses, and GeoNames-powered place searches.
- **Private Notes & Engagement**: Users can add timestamped notes with follow-up flags and track engagement dates, with data persisting across vacancies. Auto-fills personal address from Texas Tribune directory.
- **Headshot Management**: Auto-populates official headshots from the Texas Tribune directory, displayed on profiles and interactively on the map using a polylabel-based border-safe placement system with fan-out layout for overlapping markers.
- **Personal Address Dots**: Displays purple dots on the map representing officials' personal addresses, respecting overlay selections and offering city clustering.
- **Identity Resolution**: A `persons` table and `identityResolver` module ensure stable identity tracking for officials across position changes.
- **Smart Refresh System**: Utilizes SHA256 fingerprints to detect changes in upstream data sources before refreshing.
- **GeoJSON Fallback System**: Client attempts to load simplified GeoJSON first, falling back to full version if validation fails.
- **Web Platform Map**: Map iframe loads from `/api/map.html` for same-origin API access, with cross-origin postMessage communication.
- **Hit Schema Compatibility**: `highlightDistricts` function supports both native and web schema.
- **Platform-Specific Colors**: Differentiates color usage for district overlays between web and native platforms.
- **Legislative Refresh System**: Hourly RSS/HTML polling and daily data refresh for TLO committee hearings, bill referral history, and in-app alerts, managed by scheduled jobs. TLO scraper uses `MeetingsUpcoming.aspx?chamber=H|S` to discover hearings, parses committee codes from notice-page filenames (e.g. `C5102026040110001.HTM` → `C510`), and preserves committee names from the meetings list (TLO notice pages now contain accessibility boilerplate rather than the committee name).
- **Committee Members Cache Fix**: CommitteeDetailScreen uses `staleTime: 0` + `refetchOnMount: "always"` + `useFocusEffect(refetch)` to guarantee fresh member roster data on every navigation — preventing stale data from showing partial member lists.
- **Admin Functionalities**: Endpoints for triggering manual data refreshes and managing person identity overrides.

### Feature Specifications
- **Map Screen**: Interactive district map with location services and draw-to-search.
- **Browse Screen**: Roster of officials with search, filtering, and vacancy indicators.
- **Official Profiles**: Detailed official information, integrated with private notes and engagement logging.
- **Workflow Tools**: Includes "Saved Officials," "Recent Tracking," and a "Follow-up Dashboard."
- **Committees Feature**: Allows browsing Texas House and Senate committees and their members.
- **Other Texas Officials**: Displays statewide officials grouped by category.
- **Alerts**: In-app notifications for legislative events.
- **Subscriptions**: User subscriptions to committees, bills, and chambers.

## External Dependencies
- **PostgreSQL**: Main database for persistent data.
- **Express.js**: Backend server framework.
- **Expo + React Native**: Frontend mobile development framework.
- **Leaflet**: JavaScript library for interactive maps.
- **Turf.js**: Advanced geospatial analysis library.
- **GeoJSON**: Standard format for encoding geographic data structures.
- **Texas Legislature Online (capitol.texas.gov)**: Primary source for Texas legislative data.
- **Congress.gov API**: Source for US Congress legislative data.
- **TxDOT FeatureServer**: Provides GeoJSON district boundaries.
- **GeoNames API**: Used for place search functionality (cities, ZIP codes).
- **Texas Tribune Directory (directory.texastribune.org)**: Source for official hometown data and headshots.
- **Drizzle ORM**: Object-Relational Mapper for database interactions.
- **NetInfo**: React Native API for network connectivity detection.
- **Expo Location**: Provides access to device location services.
- **AsyncStorage**: Persistent key-value storage for React Native.
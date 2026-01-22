# Texas Districts & Officials Mobile App

## Overview
A mobile application for Texas citizens to view legislative districts, search for representatives, and manage private notes about officials. The primary purpose is to provide an accessible platform for citizens to engage with their government, offering tools for finding representatives, understanding their districts, and tracking interactions. The project aims to enhance civic engagement and provide a streamlined experience for citizens to connect with their elected officials.

## User Preferences
I prefer detailed explanations and iterative development. Ask before making major changes. I value clear communication and a collaborative approach.

## System Architecture
The application is built with Expo + React Native for the frontend and an Express.js backend with a PostgreSQL database.

### UI/UX Decisions
- **Color Scheme**: Primary: #0047BB (Texas Blue), Secondary: #BF0A30 (Texas Red).
- **Party Colors**: Republican: #E94B3C, Democrat: #4A90E2.
- **Map Overlay Colors**: Senate: #4A90E2, House: #E94B3C, Congress: #50C878.
- **Offline-First**: Implemented with NetInfo-based detection, cache-first loading (25% validation threshold), and an `OfflineBanner` component.

### Technical Implementations
- **Map Screen**: Interactive Leaflet map via WebView with GeoJSON polygon overlays for Texas Senate (31), Texas House (150), and US Congress (38) districts. Features color-coded layers and toggle controls.
- **Draw-to-Search**: Allows continuous freehand polygon drawing with real-time polyline preview, Douglas-Peucker simplification, auto-closing polygons, and haptic feedback to find officials in overlapping districts using Turf.js spatial intersection.
- **Locate Me**: GPS location button using browser geolocation (web) or Expo Location (native) to show user position on the map.
- **Browse Screen**: Provides a comprehensive roster browsing experience with tabs for TX House, TX Senate, US House, and All Officials. Includes a single search bar for multi-criteria matching and displays member/vacancy counts.
- **Official Profiles**: Displays public information (offices, contact) and allows management of private notes, quick actions like "Quick Note" and "Log Engagement."
- **Notes & Prayer**: Multi-entry private notes per official with timestamps and optional follow-up flags, data keyed by `private:{source}:{districtNumber}` for persistence.
- **Last Engaged**: Tracks last engagement date per official with an optional summary and a "Log Engagement Now" button.
- **Follow-up Dashboard**: Accessible from the Profile screen, showing officials with pending follow-ups.
- **Place Search**: Utilizes GeoNames for searching Texas cities/ZIPs, with multi-candidate disambiguation and recent search storage.
- **Data Persistence**: PostgreSQL for public data, AsyncStorage for local preferences (notes, engagement, saved officials, recents).
- **Weekly Refresh**: Automatic data synchronization from Texas Legislature Online and Congress.gov.
- **Vacancy Display**: Vacant seats are distinctly styled with dashed borders, a user-x icon, and a "Seat Currently Vacant" label.
- **Environment Variables**: `DATABASE_URL` and `CONGRESS_API_KEY` are required. `EXPO_PUBLIC_DOMAIN` is auto-configured.

### System Design Choices
- **Project Structure**: Organized into `client`, `server`, `shared`, `scripts`, and `assets` directories.
- **Database Schema**: `official_public` for refreshable data (id, source, source_member_id, chamber, district, full_name, party, contact info, active status, last_refreshed_at) and `official_private` for user-entered data (official_public_id, personal info, notes, tags). A `refresh_job_log` table tracks refresh history.
- **API Endpoints**:
    - `GET /api/officials`: Retrieves merged public and private official data with various query parameters.
    - `GET /api/officials/:id`: Fetches a single merged official.
    - `GET /api/officials/by-district`: Finds officials by district type and number.
    - `PATCH /api/officials/:id/private`: Updates private data for an official.
    - `GET /api/geojson/{tx_house, tx_senate, us_congress}`: Provides GeoJSON boundary data.
    - Admin endpoints for stats and manual refresh (`GET /api/stats`, `GET /api/admin/officials-counts`, `POST /api/refresh`).
- **Weekly Refresh Pipeline**: Automated on server startup if the last refresh was over 7 days ago. Manual refresh via API or command line. Includes fail-safe validation (e.g., aborts if zero records or >25% count deviation) and never deletes records, only soft-deactivates.

## External Dependencies
- **PostgreSQL**: Primary database for storing public and private official data.
- **Expo + React Native**: Frontend development framework.
- **Express.js**: Backend web framework.
- **Leaflet**: Interactive map library used within a WebView.
- **Turf.js**: Used for spatial intersection in the draw-to-search feature.
- **GeoNames API**: Used for place search functionality.
- **Texas Legislature Online (capitol.texas.gov)**: Data source for Texas House and Senate officials (scraped).
- **Congress.gov API**: Data source for US Congress officials.
- **TxDOT OpenData**: Source for real GeoJSON district boundaries.
- **Drizzle ORM**: Used for database interactions.
- **NetInfo**: For detecting network connectivity.
- **AsyncStorage**: For local data persistence of user preferences and private data.
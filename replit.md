# Texas Districts & Officials Mobile App

## Overview
A mobile application for Texas citizens to view legislative districts, search for representatives, and manage private notes about officials. Built with Expo + React Native and Express.js backend.

## Current State
**MVP Complete** - Full rosters with WebView-based Leaflet map (Expo Go compatible).

### MVP Features:
- **Map Screen**: Interactive Leaflet map via WebView with tappable GeoJSON polygon overlays for TX Senate (31), TX House (150), and US Congress (38). Color-coded layers with toggle controls. Works in Expo Go on iOS/Android and on web.
- **Search Screen**: Search officials by ZIP code, name, or draw-to-search (simulated)
- **Official Profiles**: View public info (offices, staff, contact) and manage private notes
- **Profile Screen**: Saved officials list and default overlay preferences
- **Local Persistence**: AsyncStorage for saved officials, private notes, and preferences

### MVP Scope Notes:
- Map uses WebView with Leaflet/OpenStreetMap (works in Expo Go on all platforms)
- Backend serves GeoJSON polygons and full officials rosters
- Draw-to-search is simulated (real geometry capture is next phase)
- No authentication required (all data stored locally on device)
- Private notes stored in AsyncStorage (not encrypted - device security applies)

## Project Structure
```
/client
  /components     - Reusable UI components
  /constants      - Theme and design tokens
  /hooks          - Custom React hooks
  /lib            - Utilities, mock data, storage
  /navigation     - React Navigation structure
  /screens        - Screen components
  App.tsx         - App entry point
/server
  /data           - Officials and GeoJSON data generation
  routes.ts       - API endpoints
  index.ts        - Express server entry
/assets/images    - App icons and images
```

## Key Files
- `server/data/officials.ts` - Full officials rosters (150 TX House, 31 TX Senate, 38 US Congress)
- `server/data/geojson.ts` - GeoJSON polygon generation for district boundaries
- `server/routes.ts` - API endpoints for GeoJSON and officials data
- `client/screens/MapScreen.tsx` - WebView with Leaflet map and polygon overlays
- `client/lib/mockData.ts` - Client-side mock data for offline support
- `client/lib/storage.ts` - AsyncStorage utilities
- `client/constants/theme.ts` - Color palette and design tokens

## API Endpoints
- `GET /api/geojson/:type` - Returns GeoJSON FeatureCollection (tx_house, tx_senate, us_congress)
- `GET /api/officials/:type` - Returns officials array for chamber
- `GET /api/officials/by-district?district_type=...&district_number=...` - Returns single official

## Navigation Structure
- **Main Tab Navigator** (3 tabs)
  1. Map Tab → MapStackNavigator
  2. Search Tab → SearchStackNavigator  
  3. Profile Tab → ProfileStackNavigator
- **Root Stack** includes DrawSearchScreen as modal

## Design System
- **Primary Color**: #0047BB (Texas Blue)
- **Secondary Color**: #BF0A30 (Texas Red)
- **Overlay Colors**:
  - TX Senate: #4A90E2 (blue)
  - TX House: #E94B3C (red)
  - US Congress: #50C878 (green)

## Running the App
- **Development**: Use the Start App workflow
- **Expo Go**: Scan QR code to test on physical device (WebView map works everywhere)
- **Web**: Access at port 8081

## Next Phase Features
1. Real district GeoJSON from official Texas sources
2. Backend with PostGIS for spatial queries (ST_Intersects, ST_Contains)
3. Real ZIP code lookups against district geometry
4. User authentication (Apple/Google SSO)
5. Encrypted storage for sensitive private notes
6. Real draw-to-search with geometry capture

## Recent Changes
- 2026-01-08: Switched to WebView-based Leaflet map for Expo Go compatibility
- 2026-01-08: Added backend API endpoints for GeoJSON and officials data
- 2026-01-08: Generated full rosters (150 TX House, 31 TX Senate, 38 US Congress)
- 2026-01-08: Removed react-native-maps (requires development build, not Expo Go)

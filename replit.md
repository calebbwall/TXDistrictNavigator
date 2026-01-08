# Texas Districts & Officials Mobile App

## Overview
A mobile application for Texas citizens to view legislative districts, search for representatives, and manage private notes about officials. Built with Expo + React Native and Express.js backend.

## Current State
**MVP Complete** - Core functionality with interactive district grid and mock data.

### MVP Features:
- **Map Screen**: Interactive district grid view with tappable districts for TX Senate, TX House, and US Congress (24 districts each). Colored overlays with layer toggle controls.
- **Search Screen**: Search officials by ZIP code, name, or draw-to-search (simulated)
- **Official Profiles**: View public info (offices, staff, contact) and manage private notes
- **Profile Screen**: Saved officials list and default overlay preferences
- **Local Persistence**: AsyncStorage for saved officials, private notes, and preferences

### MVP Scope Notes:
- Map uses interactive district grid (Expo Go compatible) - real map integration requires development build
- 24 mock districts per chamber with officials data
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
/server           - Express API backend
/assets/images    - App icons and images
```

## Key Files
- `client/lib/mockData.ts` - District and official mock data
- `client/lib/storage.ts` - AsyncStorage utilities
- `client/constants/theme.ts` - Color palette and design tokens

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
  - TX Senate: #4A90E2
  - TX House: #E94B3C
  - US Congress: #50C878

## Running the App
- **Development**: Use the Start App workflow
- **Expo Go**: Scan QR code to test on physical device
- **Web**: Access at port 8081

## Next Phase Features
1. Real Mapbox integration with actual district GeoJSON polygons
2. Backend with PostGIS for spatial queries (ST_Intersects, ST_Contains)
3. Data ingestion scripts for official rosters from Texas sources
4. Real ZIP code lookups against district geometry
5. User authentication (Apple/Google SSO)
6. Encrypted storage for sensitive private notes
7. Real draw-to-search with geometry capture

## Recent Changes
- 2026-01-08: Replaced react-native-maps with Expo Go compatible interactive district grid
- 2026-01-08: Expanded mock data to 24 officials per chamber with real Texas legislator names
- 2026-01-08: MVP complete with mock data and local storage
- 2026-01-08: Fixed saved officials state sync using useFocusEffect

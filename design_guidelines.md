# Texas District & Officials App - Design Guidelines

## Architecture Decisions

### Authentication
**REQUIRED** - This app stores sensitive user data (private notes, personal contacts for officials).

**Implementation:**
- Use SSO (Apple Sign-In for iOS, Google Sign-In for Android)
- Mock auth flow in prototype using local state
- Login screen includes privacy policy & terms of service links
- Account management under Profile > Settings > Account with:
  - Log out (with confirmation alert)
  - Delete account (double confirmation required)

### Navigation Structure
**Tab Navigation** (3 tabs):
1. **Map** (default) - Main district visualization
2. **Search** - District and official search tools
3. **Profile** - User settings and saved items

All screens use stack navigation within their respective tabs.

---

## Screen Specifications

### 1. Map Screen (Tab 1)
**Purpose:** Primary interface for viewing district overlays and selecting districts

**Layout:**
- **Header:** Transparent, with layer toggle button (top-right)
- **Content:** Full-screen Mapbox map
- **Floating Elements:**
  - Layer control panel (slides from top when toggled)
  - Selected district info card (slides from bottom when district tapped)
  - Location/recenter button (bottom-right)
- **Safe Area:** 
  - Top: `headerHeight + Spacing.xl`
  - Bottom: `tabBarHeight + Spacing.xl`
  - Floating elements: add `Spacing.xl` margin from edges

**Components:**
- Three independent toggle switches (TX Senate, TX House, US Congress)
- District info card: district name, number, type, official preview
- Map legend showing active overlay colors

---

### 2. Search Screen (Tab 2)
**Purpose:** Find districts and officials via ZIP, name, or drawn area

**Layout:**
- **Header:** Default with search bar (always visible)
- **Content:** ScrollView with three search method cards
- **Safe Area:**
  - Top: `Spacing.xl`
  - Bottom: `tabBarHeight + Spacing.xl`

**Components:**
- Search input (ZIP or name)
- "Draw to Search" button → opens map modal
- Results list (districts + officials combined)
- Empty state illustration when no results

**Search Method Cards:**
1. ZIP Code Search (text input + search button)
2. Name Search (autocomplete input)
3. Draw to Search (opens full-screen map modal)

---

### 3. Official Profile Screen (Modal/Stack)
**Purpose:** View public info and manage private notes about an official

**Layout:**
- **Header:** Default with official name, close button (left), edit button (right)
- **Content:** ScrollView with tabbed interface
- **Safe Area:**
  - Top: `Spacing.xl`
  - Bottom: `insets.bottom + Spacing.xl`

**Tabs:**
- **Public Info** (auto-synced): Photo, office details, staff, contact info
- **Private Notes** (user-editable): Personal contacts, family info, notes, reminders

**Interactive Elements:**
- Tap address → open in Maps app
- Tap phone → call or SMS action sheet
- Edit mode (pencil icon) for Private Notes tab

---

### 4. Profile Screen (Tab 3)
**Purpose:** User account, preferences, saved officials

**Layout:**
- **Header:** Default with "Profile" title, settings button (right)
- **Content:** ScrollView
- **Safe Area:**
  - Top: `Spacing.xl`
  - Bottom: `tabBarHeight + Spacing.xl`

**Components:**
- User avatar (circular, 80pt diameter)
- Display name
- Saved officials list (quick access)
- App preferences section
- Account management link

---

## Design System

### Color Palette
**Theme:** Professional, civic, Texas-inspired

- **Primary:** `#0047BB` (Texas Blue) - navigation, primary actions
- **Secondary:** `#BF0A30` (Texas Red) - accents, alerts
- **Neutral:**
  - Text: `#1A1A1A`
  - Secondary Text: `#666666`
  - Border: `#E0E0E0`
  - Background: `#F8F9FA`
- **Overlay Colors:**
  - TX Senate: `#4A90E2` (40% opacity)
  - TX House: `#E94B3C` (40% opacity)
  - US Congress: `#50C878` (40% opacity)
- **Success:** `#28A745`
- **Warning:** `#FFC107`

### Typography
**Font:** System (SF Pro for iOS, Roboto for Android)

- **H1:** 28pt Bold (screen titles)
- **H2:** 22pt Bold (section headers)
- **H3:** 18pt Semibold (card titles)
- **Body:** 16pt Regular (content)
- **Caption:** 14pt Regular (metadata, labels)
- **Small:** 12pt Regular (footnotes)

### Spacing
Use 8pt grid system:
- **xs:** 4pt
- **sm:** 8pt
- **md:** 16pt
- **lg:** 24pt
- **xl:** 32pt
- **xxl:** 48pt

### Visual Design
- **Map Overlays:** Use 40% opacity fills with 2pt stroke borders
- **Cards:** White background, 1pt border `#E0E0E0`, 8pt corner radius
- **Buttons:** 
  - Primary: solid background, white text, 8pt radius
  - Secondary: border-only, primary color text
  - Text: no border, primary color text
- **Floating Buttons:** Subtle drop shadow:
  - shadowOffset: `{width: 0, height: 2}`
  - shadowOpacity: `0.10`
  - shadowRadius: `2`
- **Icons:** Use Feather icon set from @expo/vector-icons
- **Touch Feedback:** 80% opacity on press for all touchables

---

## Generated Assets

### Required
1. **icon.png** - App icon: Texas star with district map outline, blue/red gradient
2. **splash-icon.png** - Launch screen: Same as app icon, larger format
3. **empty-search.png** - Illustration of Texas outline with magnifying glass, "Start searching for districts or officials"
4. **empty-saved.png** - Illustration of clipboard or bookmark with Texas outline, "No saved officials yet"
5. **draw-to-search-tutorial.png** - Finger drawing gesture over map, "Draw a shape to find districts"

### Recommended
6. **default-official-avatar.png** - Placeholder silhouette with Texas flag colors
7. **map-tutorial-overlay.png** - Finger tapping map with layer icon highlighted
8. **welcome-illustration.png** - Texas capitol building stylized, used for onboarding

**Style:** Flat, 2-color illustrations (Primary Blue + Secondary Red) with clean lines, matching civic/professional aesthetic.

---

## Interaction Patterns

### District Selection
- Tap district polygon → highlight with 60% opacity fill + info card slides up
- Tap info card → navigate to Official Profile
- Tap outside district → deselect, info card slides down

### Layer Toggles
- Each toggle independent (can enable 0-3 overlays)
- Toggle transition: 300ms fade in/out
- Active toggle shows checkmark + background tint

### Search Results
- Results appear as list items with left thumbnail (official photo or district icon)
- Tap result → navigate to Official Profile or highlight district on Map
- Pull-to-refresh to clear results

### Forms (Private Notes Editing)
- Submit/Cancel buttons in header (Save/Cancel)
- Input fields auto-focus on edit mode entry
- Unsaved changes alert when navigating away
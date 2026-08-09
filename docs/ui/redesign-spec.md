# Antz Redesign Specification (Draft v0.2)

## Status

Draft v0.2 — extends v0.1 with component/store contracts, page-by-page wire requirements,
interaction edge cases, and an initial test matrix.

Based on `docs/ui/redesign-plan.md`.

---

## 1. Problem Statement

The current app is functional but feels generic, navigation is high-friction on mobile, and core
identity/personal context is underrepresented in the UI.

---

## 2. Goals

1. Ship a warmer, more personal visual language.
2. Reduce mobile navigation friction.
3. Keep identity switching discoverable but non-intrusive.
4. Establish consistent component and motion patterns across pages.
5. Preserve existing data model and core app capabilities.

## 3. Non-Goals (for this redesign phase)

1. Re-architect Firebase data structures.
2. Replace manual routing with a third-party router.
3. Add major new backend dependencies.

---

## 4. Confirmed Product Decisions

1. **Landing page:** Default route becomes a Home/Dashboard.
2. **Navigation options:** Sidebar and bottom-tab navigation are both supported as a user-toggleable setting.
3. **Bottom tabs:** Must be fully removable via settings.
4. **Detail surface model:** Bottom sheets are mobile-only.
5. **Defaults:** Use warmer default accent colors for Z/T.
6. **Typography preference:** Font direction is configurable in Settings.
7. **Identity switch behavior:** Discoverable but discreet, with an on-demand pill (optionally via small floating trigger).

---

## 5. Information Architecture

### Primary Routes

- `/` → Home (new landing)
- `/search` → Search (moved from `/`)
- `/library/movies`
- `/library/tv`
- `/library/games`
- `/notes`
- `/places`
- `/videos`
- `/profiles`
- `/settings`
- `/debug`

### Navigation Modes

1. **Bottom tabs mode (mobile-first):**
   - Tabs: Home, Library, Notes, Places, More
   - More entry exposes Search, Videos, Profiles, Settings
2. **Sidebar mode:**
   - Existing sidebar-based nav remains available
3. **Settings toggle:**
   - Users can switch nav mode
   - Users can disable bottom tabs entirely

---

## 6. Experience Requirements

### 6.1 Visual System

- Base palette shifts from slate to warm stone/zinc surfaces.
- Card style prioritizes layered surfaces and softer shadows over border-heavy cards.
- Accent remains user-driven but defaults become warmer.

### 6.2 Typography

- Two style presets available in Settings:
  - Warm rounded direction
  - Refined/system-lean direction
- Maintain clear display/title/body/caption hierarchy.

### 6.3 Home/Dashboard

Must include:
1. Time-aware greeting.
2. Recent activity summary (notes/media/places).
3. Quick-add shortcuts for core content types.
4. Current in-progress section (watching/reading/playing).

### 6.4 Identity Switching

- Entry point appears in header context area.
- Interaction should be low-noise and not persist as an intrusive control.
- Z/T switch control opens on demand and animates state change clearly.

### 6.5 Modal/Sheet Strategy

- **Mobile:** detail views use bottom sheets.
- **Non-mobile:** retain modal/dialog pattern unless a page-specific exception is defined.

---

## 7. Accessibility & Usability Requirements

1. WCAG AA contrast thresholds remain required.
2. 44px minimum touch targets for interactive controls.
3. Keyboard and screen-reader support must remain intact for nav, sheets, toggles, and forms.
4. Reduced-motion users must receive motion-safe behavior.

---

## 8. Performance Requirements

1. Avoid regressions in perceived navigation speed.
2. Preserve existing debouncing/race-condition safeguards for async UI flows.
3. Keep animations short and interaction-focused (generally under 300ms).

---

## 9. Rollout Plan (Spec-Level)

1. **Foundation:** palette, typography presets, card/button primitives.
2. **Navigation:** nav mode setting, bottom tabs option, header identity entrypoint.
3. **Home:** dashboard route and widgets.
4. **Page passes:** Library, Notes, Places, Videos, Profiles visual and interaction updates.
5. **Polish:** motion consistency, final accessibility and responsiveness checks.

---

## 10. Acceptance Criteria

1. Home dashboard is the default landing page (`/`).
2. Users can switch between sidebar and bottom-tab navigation in Settings.
3. Bottom tabs can be fully removed by user preference.
4. Mobile detail flows use bottom sheets with safe-area bottom padding.
5. Identity switch remains easy to find but visually discreet.
6. Typography preset is user-configurable.
7. No regressions in core flows: add/edit/delete media, notes, places, videos, profiles.

---

## 11. Risks / Follow-ups

1. Need final UI decision on exact identity switch trigger pattern (header chip vs floating trigger fallback).
2. Need final token definitions for warm palette in `src/app.css`.
3. Need explicit behavior spec for tablet breakpoints when both nav systems are available.

---

## 12. Type System Contracts

### 12.1 Extended `UserPreferences`

New fields to add to `UserPreferences` in `src/lib/types.ts`:

```typescript
export type NavMode = "sidebar" | "bottom-tabs" | "none"
export type FontPreset = "warm-rounded" | "refined-system"

// Added to UserPreferences:
navMode?: NavMode          // Default: "bottom-tabs" on mobile, "sidebar" on desktop
fontPreset?: FontPreset    // Default: "warm-rounded"
```

Migration note: both fields are optional so existing stored preferences remain valid without a migration.

### 12.2 `HomeActivity` (new type)

Represents a single entry in the recent-activity feed on the Home dashboard.

```typescript
export type HomeActivityType = "note" | "media" | "place"

export interface HomeActivity {
    type: HomeActivityType
    id: string
    title: string
    subtitle?: string        // e.g. status label or category
    createdBy: UserId
    updatedAt: Timestamp
    // Optional richness
    posterPath?: string | null  // Media poster, if available
}
```

### 12.3 `DashboardState` (store shape)

Internal state for the Home page store (not persisted):

```typescript
interface DashboardState {
    recentActivity: HomeActivity[]   // Last N items across media/notes/places
    inProgress: Media[]              // status === "watching"
    loading: boolean
    error: string | null
}
```

---

## 13. Component Contracts

Contracts use TypeScript `interface` for props. Snippets are **not implementation** — they define the
public API (props-in, events-out) that each component must honour.

### 13.1 `BottomTabBar`

Path: `src/lib/components/BottomTabBar.svelte`

```typescript
interface BottomTabBarProps {
    activeRoute: string          // Current route, e.g. "/" or "/notes"
    onNavigate: (route: string) => void
}
```

Behaviour:
- Renders tabs: Home (`/`), Library (`/library/movies`), Notes (`/notes`), Places (`/places`), More.
- "More" opens a sheet listing Search, Videos, Profiles, Settings.
- Active tab highlighted with accent color fill.
- Hidden when `navMode === "none"` or `navMode === "sidebar"`.
- Safe-area bottom padding applied: `pb-[env(safe-area-inset-bottom)]`.
- Keyboard: each tab button is focusable; Enter/Space navigates.
- ARIA: `role="tablist"` on wrapper, `role="tab"` + `aria-selected` on each tab.

### 13.2 `ContextHeader`

Path: `src/lib/components/ContextHeader.svelte`

```typescript
interface ContextHeaderProps {
    title: string                // Current page title
    showIdentityToggle?: boolean // Default true
}
```

Behaviour:
- Left: page title.
- Right: `IdentityPill` trigger (see §13.3).
- No hamburger when `navMode === "bottom-tabs"`.
- Hamburger visible when `navMode === "sidebar"`.

### 13.3 `IdentityPill`

Path: `src/lib/components/IdentityPill.svelte`

```typescript
interface IdentityPillProps {
    // No required props — reads activeUser and userPreferences from stores
}
```

Behaviour:
- Displays active user abbreviation (first letter of display name, from `displayAbbreviations` store).
- Tap opens an in-place Z/T selection pill with slide animation (≤ 200ms).
- Selecting the other user calls `setActiveUser(userId)` from the app store.
- Closes on outside click or Escape.
- ARIA: `aria-label="Switch user"`, `role="listbox"` on expanded pill, `role="option"` on each user.

### 13.4 `BottomSheet`

Path: `src/lib/components/ui/BottomSheet.svelte`

```typescript
interface BottomSheetProps {
    open: boolean
    onClose: () => void
    title?: string
    maxHeight?: string   // CSS value, default "90vh"
}
// Snippet (children):
// {#snippet children()} ... {/snippet}
```

Behaviour:
- Only rendered on mobile (`pointer: coarse` or viewport width < 768px); on non-mobile, acts as a transparent pass-through that renders children in a centered modal instead.
- Drag handle displayed at top center.
- Drag-down ≥ 50% of sheet height triggers close.
- Backdrop click triggers close.
- Escape key triggers close.
- Scrolls internally; safe-area bottom padding.
- ARIA: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to title element.
- Focus trap while open.
- Reduced motion: skip slide animation, use fade-only.

### 13.5 `HomeGreeting`

Path: `src/lib/pages/home/HomeGreeting.svelte`

```typescript
interface HomeGreetingProps {
    userName: string    // Display name from active user preferences
}
```

Behaviour:
- Derives time-of-day bucket: morning (5–11), afternoon (12–17), evening (18–21), night (22–4).
- Renders greeting string: "Good morning, {name}" etc.
- No external data fetch.

### 13.6 `RecentActivityFeed`

Path: `src/lib/pages/home/RecentActivityFeed.svelte`

```typescript
interface RecentActivityFeedProps {
    items: HomeActivity[]
    loading: boolean
    onItemClick: (item: HomeActivity) => void
}
```

Behaviour:
- Shows up to 6 most-recent items sorted by `updatedAt` desc.
- Each item renders title, subtitle, createdBy indicator, and relative time.
- Empty state: "Nothing yet — add a note, place, or something to watch."
- Skeleton placeholders while `loading === true` (3 placeholder rows).

### 13.7 `InProgressSection`

Path: `src/lib/pages/home/InProgressSection.svelte`

```typescript
interface InProgressSectionProps {
    items: Media[]          // Pre-filtered to status === "watching"
    loading: boolean
    onItemClick: (item: Media) => void
}
```

Behaviour:
- Shows up to 4 in-progress media items as poster cards.
- Hidden (renders nothing) when `items.length === 0 && !loading`.
- Each card: poster + title + type badge.

### 13.8 `QuickAddBar`

Path: `src/lib/pages/home/QuickAddBar.svelte`

```typescript
interface QuickAddBarProps {
    onAddNote: () => void
    onAddPlace: () => void
    onAddMedia: () => void
}
```

Behaviour:
- Three buttons: "+ Note", "+ Place", "+ Media".
- Each fires the corresponding callback; parent is responsible for opening the appropriate add form.
- Pill-shaped buttons using `btn-primary` variant.

---

## 14. Store Contracts

### 14.1 Navigation Store (new)

Module: `src/lib/stores/nav.ts`

```typescript
// Exports:
export const currentRoute: Writable<string>      // Current route path
export const navMode: Readable<NavMode>          // Derived from activeUser's preferences

// Functions:
export function navigate(route: string): void
    // Calls window.history.pushState and updates currentRoute
export function goBack(): void
    // Calls window.history.back()
```

`navMode` derives from `currentPreferences.navMode`, falling back to `"bottom-tabs"` if unset.

### 14.2 Home Store (new)

Module: `src/lib/stores/home.ts`

```typescript
// Exports:
export const dashboardState: Readable<DashboardState>

// Internal:
// Subscribes to media, notes, and places collections.
// Merges into HomeActivity[], sorted by updatedAt desc, capped at 6.
// Sets inProgress from media where status === "watching".
```

Cleanup: unsubscribes from Firestore listeners on user sign-out (mirror pattern from `app.ts`).

### 14.3 Extended App Store

No new exports — only `UserPreferences` fields expand (see §12.1).
`currentPreferences` derived store automatically includes `navMode` and `fontPreset` once the
type is updated.

---

## 15. CSS Token Contracts

New CSS custom properties to define in `src/app.css` (replacing current slate-based values):

```css
/* Light mode */
:root {
  --color-bg:         #fafaf9;   /* stone-50  */
  --color-surface:    #ffffff;
  --color-surface-2:  #f5f5f4;   /* stone-100 */
  --color-border:     #e7e5e0;   /* stone-200 */
  --color-text:       #1c1917;   /* stone-900 */
  --color-text-muted: #78716c;   /* stone-500 */
  --color-text-hint:  #a8a29e;   /* stone-400 */
}

/* Dark mode */
.dark {
  --color-bg:         #18181b;   /* zinc-900  */
  --color-surface:    #27272a;   /* zinc-800  */
  --color-surface-2:  #3f3f46;   /* zinc-700  */
  --color-border:     #52525b;   /* zinc-600  */
  --color-text:       #fafafa;   /* zinc-50   */
  --color-text-muted: #a1a1aa;   /* zinc-400  */
  --color-text-hint:  #71717a;   /* zinc-500  */
}

/* --color-accent already exists and is user-driven */
```

Font tokens:

```css
:root[data-font="warm-rounded"] {
  --font-display: "Nunito", system-ui, sans-serif;
  --font-body:    "Nunito", system-ui, sans-serif;
}

:root[data-font="refined-system"] {
  --font-display: system-ui, sans-serif;
  --font-body:    system-ui, sans-serif;
}
```

`data-font` attribute is set on `<html>` by App.svelte based on `currentPreferences.fontPreset`.

---

## 16. Page-by-Page Wire Requirements

### 16.1 Home (`/`)

**Layout (mobile):**
```
[ ContextHeader: "Home"          [Z] ]
[ HomeGreeting: "Good morning, Z"    ]
[ QuickAddBar: + Note  + Place  + Media ]
[ InProgressSection (if items exist) ]
[ RecentActivityFeed             ]
[ BottomTabBar                   ]
```

**Interaction flow:**
1. QuickAddBar "+ Note" → opens NoteAddModal (or navigates to `/notes?add=1`).
2. QuickAddBar "+ Place" → opens PlaceAddModal.
3. QuickAddBar "+ Media" → navigates to `/search?discover=1`.
4. RecentActivityFeed item click → opens detail sheet/modal for that item's type.
5. InProgressSection poster click → opens media detail sheet.

**Empty state (first launch):** Show greeting + QuickAddBar only. No activity feed placeholders visible until first item created.

**Error state:** If Firestore read fails, show activity feed with "Couldn't load recent activity" inline message. QuickAddBar and greeting remain visible.

### 16.2 Library (`/library/:type`)

No route change. Visual changes only:
- Card border removed; shadow added.
- Filter bar stays visible (not behind toggle).
- Detail view: BottomSheet on mobile, centered Modal on desktop.

**Interaction edge cases:**
- Empty library tab: show EmptyState with quick-add CTA linking to Search discover mode.
- Poster image load failure: show type-icon placeholder (Film/Tv/Gamepad2).
- Offline: show last cached data with offline banner (no change from current).

### 16.3 Notes (`/notes`)

- Warm palette applied to sticky note cards.
- Corkboard view retains its current layout.
- Detail view: BottomSheet on mobile.

**Interaction edge cases:**
- Note with no title: render "(untitled)" in muted text.
- Long content in corkboard card: truncate at 4 lines with fade.

### 16.4 Places (`/places`)

- Card redesign: shadow, no border.
- Visited status: stamp-like overlay on card (e.g. diagonal "Visited" ribbon using accent color).
- Detail view: BottomSheet on mobile.

**Interaction edge cases:**
- No places yet: EmptyState with "+ Add Place" CTA.
- Location unavailable (permissions denied): hide distance chip; no error shown.

### 16.5 Videos (`/videos`)

- Thumbnail-first layout (larger thumbnails).
- Status badge more prominent.
- Detail view: BottomSheet on mobile.

### 16.6 Profiles (`/profiles`)

- Category cards get more color and personality per category icon.
- Detail view: BottomSheet on mobile.

### 16.7 Settings (`/settings`)

New settings sections to add:

| Section | New settings |
|---------|-------------|
| Navigation | Nav mode toggle (Sidebar / Bottom tabs / None) |
| Typography | Font preset toggle (Warm rounded / System) |
| Identity | (existing, no change) |

Settings page layout change: grouped sections with inset cards (visual only, no data model change).

---

## 17. Interaction Edge Cases

| Scenario | Expected Behaviour |
|----------|-------------------|
| User switches nav mode mid-session | New nav renders immediately; active route preserved |
| Bottom tabs + sidebar mode disabled | Floating back button visible on non-home pages |
| BottomSheet open + screen rotated to landscape | Sheet collapses to modal behavior (width ≥ 768px) |
| Identity pill open + user presses Escape | Pill closes, focus returns to trigger |
| Home activity item deleted by other user | Item disappears from feed on next Firestore snapshot |
| Font preset switched | `data-font` attribute updates; fonts swap via CSS; no page reload |
| No items in InProgressSection | Section hidden; no empty state message |
| QuickAddBar on non-touch device | Buttons still functional via click; hover states apply |

---

## 18. Test Matrix

Each row maps to an acceptance criterion (§10) or a key interaction.

| ID | Scenario | Test type | File |
|----|----------|-----------|------|
| T1 | Home route (`/`) renders HomeGreeting | Unit (component) | `src/lib/pages/Home.test.ts` |
| T2 | HomeGreeting shows correct time-of-day text | Unit | `src/lib/pages/home/HomeGreeting.test.ts` |
| T3 | RecentActivityFeed renders skeleton while loading | Unit | `src/lib/pages/home/RecentActivityFeed.test.ts` |
| T4 | RecentActivityFeed shows empty state when items=[] | Unit | `src/lib/pages/home/RecentActivityFeed.test.ts` |
| T5 | BottomTabBar renders correct active tab for route | Unit | `src/lib/components/BottomTabBar.test.ts` |
| T6 | BottomTabBar hidden when navMode="sidebar" | Unit | `src/lib/components/BottomTabBar.test.ts` |
| T7 | BottomTabBar hidden when navMode="none" | Unit | `src/lib/components/BottomTabBar.test.ts` |
| T8 | IdentityPill opens/closes on trigger click | Unit | `src/lib/components/IdentityPill.test.ts` |
| T9 | IdentityPill closes on Escape key | Unit | `src/lib/components/IdentityPill.test.ts` |
| T10 | IdentityPill calls setActiveUser on user select | Unit | `src/lib/components/IdentityPill.test.ts` |
| T11 | BottomSheet renders children on mobile | Unit | `src/lib/components/ui/BottomSheet.test.ts` |
| T12 | BottomSheet renders modal on desktop (width ≥ 768) | Unit | `src/lib/components/ui/BottomSheet.test.ts` |
| T13 | BottomSheet closes on backdrop click | Unit | `src/lib/components/ui/BottomSheet.test.ts` |
| T14 | BottomSheet closes on Escape | Unit | `src/lib/components/ui/BottomSheet.test.ts` |
| T15 | Settings nav mode toggle persists to preferences | Unit | `src/lib/pages/Settings.test.ts` |
| T16 | Settings font preset toggle updates data-font attr | Unit | `src/lib/pages/Settings.test.ts` |
| T17 | navigate() updates currentRoute store | Unit | `src/lib/stores/nav.test.ts` |
| T18 | navMode derives from currentPreferences | Unit | `src/lib/stores/nav.test.ts` |
| T19 | Home store merges recent activity across collections | Unit | `src/lib/stores/home.test.ts` |
| T20 | Home store exposes inProgress items | Unit | `src/lib/stores/home.test.ts` |
| T21 | Library empty state renders with CTA | Unit | `src/lib/pages/Library.test.ts` |
| T22 | No regression: add media flow completes | Integration | existing |
| T23 | No regression: add note flow completes | Integration | existing |
| T24 | No regression: add place flow completes | Integration | existing |

---

## 19. Open Questions

1. **Identity switch trigger:** Header chip (always visible abbreviation) vs. a floating mini-trigger that only appears after some navigation. Decision needed before implementing `IdentityPill` trigger placement.
2. **Tablet breakpoint for nav:** At what width does bottom-tabs → sidebar automatically happen (if at all)? Or is it purely user-controlled?
3. **Warm palette contrast audit:** Stone-500 on stone-50 background needs contrast check (likely fails AA). Confirm stone-600/700 for body text in light mode.
4. **Font loading:** Nunito via Google Fonts vs. self-hosted for offline/PWA support. Self-hosting recommended given PWA offline requirements.
5. **`/search` route:** Is the old `/` Search page preserved at `/search`, or is it fully replaced by the Home dashboard? (Current spec moves search to a tab entry in the More sheet.)

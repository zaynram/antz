# Future Tasks

This document contains prioritized task sets for future development work on the Antz app.

## Performance Improvements

### HIGH Priority (Complete These First)

*No high priority tasks remaining.*

### MEDIUM Priority

*No medium priority tasks remaining.*

### LOW Priority

#### 9. Verify CSS Tree-shaking
**File:** Build configuration
**Issue:** Potential unused Tailwind styles in bundle
**Fix:** Verify `tailwind.config.ts` content patterns are correct, check CSS bundle size.

---

## Feature Enhancements

### Navigation & UX
- [x] Add keyboard navigation for media grid (arrow keys)
- [ ] Add pull-to-refresh for mobile
- [x] Add "back to top" button on long lists
- [ ] Implement infinite scroll for large libraries

### Media Library
- [ ] Add bulk selection and actions (multi-delete, status change)
- [ ] Add collection/series grouping view
- [ ] Add calendar view for watch dates
- [ ] Add statistics dashboard (total watched, genres distribution)

### Notes
- [ ] Add rich text editor support
- [ ] Add note categories/folders
- [ ] Add note search within content
- [ ] Add note templates

### Places
- [ ] Add map view with pins
- [ ] Add route planning between places
- [ ] Add photo attachments to places
- [x] Add visit management (remove visits, date range picker for trips)

### Settings
- [ ] Add data export (JSON/CSV)
- [ ] Add data import
- [ ] Add notification preferences
- [ ] Add shared watchlist with partner

---

## Technical Debt

### Code Quality
- [x] Fix all a11y warnings (44 fixed)
- [x] Replace deprecated `<svelte:component>` with dynamic component syntax
- [x] Add proper form label associations
- [x] Convert `article` elements with button role to actual buttons/divs

### Testing
- [ ] Add E2E tests with Playwright
- [ ] Add component tests for modals
- [ ] Add visual regression tests
- [ ] Increase unit test coverage to 80%+

### Build & Deploy
- [ ] Implement code splitting for routes
- [ ] Add bundle analyzer to CI
- [ ] Set up performance budgets
- [ ] Add Lighthouse CI checks

---

## Bug Fixes

### Known Issues
- [ ] Safari PWA sometimes doesn't render conditional content (workaround in place)
- [ ] Offline mode shows stale data until online (Firestore limitation)

---

## How to Use This Document

1. **Pick a task** from the highest priority section you have time for
2. **Create a branch** for the work
3. **Mark the task** with `[x]` when complete
4. **Update CLAUDE.md** if new patterns are introduced
5. **Move completed tasks** to a "Completed" section with date

Last updated: 2026-01-04

---

## Completed Tasks

### 2026-01-04
- [x] **Library/Discover Search Modes** - Added mode toggle to Search page for discovering new content from TMDB and Wikipedia APIs
- [x] **Auto Game Thumbnail Fetch** - Games added without images automatically fetch from Wikipedia
- [x] **Image Migration Tool** - Debug page tool to fix missing images for all media types
- [x] **Rebrand to "us"** - Updated app name, favicon, and PWA manifest to lowercase "us"
- [x] **Replace svelte:component** - Updated all 8 occurrences to use Svelte 5 dynamic component syntax
- [x] **iOS PWA Detection** - forceRepaint() now only runs on iOS in standalone mode
- [x] **Line Ending Config** - Added .gitattributes for consistent LF line endings
- [x] **Remove Global Edge Swipe** - Removed sidebar edge swipe gesture (conflicted with system gestures)
- [x] **Fix Auto-Search Debounce Tracking** - Fixed `$effect` in Search.svelte to properly track `searchQuery` as a dependency by reading it synchronously before the setTimeout callback
- [x] **Batch Wikipedia Image Fetches** - Fixed N+1 API calls in `src/lib/wikipedia.ts` by collecting results needing image fetch, then using `Promise.all()` for parallel fetches
- [x] **Cache Genre Extraction** - Already optimized via Svelte 5 `$derived` memoization in Library.svelte
- [x] **Cache Distance Calculations** - Added `distanceCache` derived in Places.svelte to pre-compute distances once
- [x] **Cache Relative Time Calculations** - Added 60-second interval timer in Notes.svelte instead of recalculating every render
- [x] **Conditionally Attach Touch Listeners** - Added early returns in Sidebar.svelte edge swipe handlers
- [x] **Add Error Retry for Preference Sync** - Added `saveWithRetry()` with exponential backoff (1s, 2s, 4s) in app.ts
- [x] **Fix A11y Warnings** - Fixed all 44 a11y warnings: converted visual labels to spans, added form label associations, fixed interactive roles
- [x] **Tree-shake Icon Imports** - Verified Vite tree-shaking is working correctly for lucide-svelte icons
- [x] **Add Back to Top Button** - New BackToTop component shows after scrolling 400px on all pages
- [x] **Add Keyboard Navigation** - Media grid now supports arrow key navigation with Enter/Space to open details
- [x] **Add Visit Management** - Places can now remove individual visits and add date ranges for trips

# Future Tasks

This document contains prioritized task sets for future development work on the Antz app.

## Performance Improvements

### HIGH Priority (Complete These First)

*No high priority tasks remaining.*

### MEDIUM Priority

*No medium priority tasks remaining.*

### LOW Priority

#### 7. Detect iOS Safari PWA for Conditional Repaints
**File:** `src/lib/pages/Library.svelte` (Lines 109-116)
**Issue:** `forceRepaint()` runs unconditionally on all platforms
**Fix:**
```typescript
const isIOSPWA = /iPad|iPhone|iPod/.test(navigator.userAgent) &&
  window.matchMedia('(display-mode: standalone)').matches

function forceRepaint() {
  if (!isIOSPWA) return
  // ... repaint logic
}
```

#### 8. Tree-shake Unused Icon Imports
**Files:** Multiple Svelte components
**Issue:** Importing icons that may not be used
**Fix:** Audit icon usage and remove unused imports. Run build and check bundle analyzer.

#### 9. Verify CSS Tree-shaking
**File:** Build configuration
**Issue:** Potential unused Tailwind styles in bundle
**Fix:** Verify `tailwind.config.ts` content patterns are correct, check CSS bundle size.

---

## Feature Enhancements

### Navigation & UX
- [ ] Add keyboard navigation for media grid (arrow keys)
- [ ] Add pull-to-refresh for mobile
- [ ] Add "back to top" button on long lists
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
- [ ] Add check-in history with dates

### Settings
- [ ] Add data export (JSON/CSV)
- [ ] Add data import
- [ ] Add notification preferences
- [ ] Add shared watchlist with partner

---

## Technical Debt

### Code Quality
- [ ] Fix all a11y warnings (52 currently)
- [ ] Replace deprecated `<svelte:component>` with dynamic component syntax
- [ ] Add proper form label associations
- [ ] Convert `article` elements with button role to actual buttons

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
- [x] **Fix Auto-Search Debounce Tracking** - Fixed `$effect` in Search.svelte to properly track `searchQuery` as a dependency by reading it synchronously before the setTimeout callback
- [x] **Batch Wikipedia Image Fetches** - Fixed N+1 API calls in `src/lib/wikipedia.ts` by collecting results needing image fetch, then using `Promise.all()` for parallel fetches
- [x] **Cache Genre Extraction** - Already optimized via Svelte 5 `$derived` memoization in Library.svelte
- [x] **Cache Distance Calculations** - Added `distanceCache` derived in Places.svelte to pre-compute distances once
- [x] **Cache Relative Time Calculations** - Added 60-second interval timer in Notes.svelte instead of recalculating every render
- [x] **Conditionally Attach Touch Listeners** - Added early returns in Sidebar.svelte edge swipe handlers
- [x] **Add Error Retry for Preference Sync** - Added `saveWithRetry()` with exponential backoff (1s, 2s, 4s) in app.ts

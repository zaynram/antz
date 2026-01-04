# Future Tasks

This document contains prioritized task sets for future development work on the Antz app.

## Performance Improvements

### HIGH Priority (Complete These First)

#### 1. Batch Wikipedia Image Fetches
**File:** `src/lib/wikipedia.ts` (Lines 198-278)
**Issue:** N+1 API calls - each game result fetches images sequentially
**Fix:**
```typescript
// Instead of sequential fetches in the loop:
for (const r of results) {
  thumbnail = await fetchPageImage(r.pageid) // BAD - sequential
}

// Use Promise.all for parallel fetches:
const imagePromises = results.map(r => fetchPageImage(r.pageid))
const images = await Promise.all(imagePromises)
```

### MEDIUM Priority

#### 2. Cache Genre Extraction by Type
**File:** `src/lib/pages/Library.svelte` (Lines 321-322)
**Issue:** `extractGenres()` recalculates on every filter/search keystroke
**Fix:** Create a memoized genre map that only updates when media collection changes:
```typescript
let genreCache = $state<Map<MediaType, string[]>>(new Map())

$effect(() => {
  // Only recalculate when media changes, not on every render
  genreCache.set(type, extractGenres(media.filter(m => m.type === type)))
})

let availableGenres = $derived(genreCache.get(type) || [])
```

#### 3. Cache Distance Calculations for Places
**File:** `src/lib/pages/Places.svelte` (Lines 170-177)
**Issue:** Distance calculated for every place on every render during sort
**Fix:** Pre-compute distances into a Map:
```typescript
let distanceCache = $derived.by(() => {
  const map = new Map<string, number | null>()
  for (const place of places) {
    map.set(place.id!, getDistanceFromReference(place))
  }
  return map
})
```

#### 4. Cache Relative Time Calculations
**File:** `src/lib/pages/Notes.svelte` (Lines 97-111)
**Issue:** `getRelativeTime()` recalculates for every note on every render
**Fix:** Update timestamps on a timer (every 60 seconds) instead of every render:
```typescript
let now = $state(Date.now())

onMount(() => {
  const interval = setInterval(() => {
    now = Date.now()
  }, 60000) // Update every minute
  return () => clearInterval(interval)
})
```

#### 5. Conditionally Attach Global Touch Listeners
**File:** `src/lib/components/Sidebar.svelte` (Lines 174-179)
**Issue:** Global window touch listeners fire on every touch even when sidebar is closed
**Fix:** Add early returns or conditionally bind:
```typescript
function handleEdgeTouchStart(e: TouchEvent) {
  if (isOpen) return // Already open, don't process
  // ... rest of handler
}
```

#### 6. Add Error Retry for Preference Sync
**File:** `src/lib/stores/app.ts`
**Issue:** Failed Firestore sync silently drops updates
**Fix:** Implement exponential backoff retry:
```typescript
async function saveWithRetry(prefs: UserPreferencesMap, retries = 3): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      await savePreferencesToFirestore(prefs)
      return
    } catch (err) {
      if (i === retries - 1) throw err
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)))
    }
  }
}
```

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
- [ ] Search results may flicker during fast typing (debouncing helps)

---

## How to Use This Document

1. **Pick a task** from the highest priority section you have time for
2. **Create a branch** for the work
3. **Mark the task** with `[x]` when complete
4. **Update CLAUDE.md** if new patterns are introduced
5. **Move completed tasks** to a "Completed" section with date

Last updated: 2026-01-04

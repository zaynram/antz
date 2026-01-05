# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and other AI agents when working with code in this repository.

## 🤖 AI-First Development Model

**This is an AI-managed codebase.** AI agents (Claude, Copilot) handle implementation, documentation, and maintenance. Human developers provide direction and oversight.

**Key Principle:** Take initiative. Don't just implement what's asked—proactively improve code, create documentation, optimize performance, and ensure quality. See [AI_DEVELOPMENT.md](docs/AI_DEVELOPMENT.md) for full workflow.

## Project Overview

Antz is a serverless SPA for relationship documentation (couples app for Z & T). It tracks shared media (movies, TV shows, games), notes, and places of interest. Uses Google Drive for photo storage since the account is dedicated to this app.

## Tech Stack

-   **Runtime:** Bun (npm also works)
-   **Frontend:** Svelte 5 + Vite + TypeScript
-   **Styling:** Tailwind CSS 4 with PostCSS
-   **Backend:** Firebase (Auth, Firestore, Storage, Hosting)
-   **Testing:** Vitest with Testing Library & happy-dom
-   **External APIs:** TMDB (movies/TV), Wikipedia (games), Google Places

## Commands

```bash
bun install          # Install dependencies
bun dev              # Start dev server
bun run build        # Production build
bun test             # Run tests (watch mode)
bun test:run         # Run tests once
bun test:ui          # Tests with UI dashboard
bun run check        # TypeScript type checking
bun run deploy       # Build + Firebase deploy
```

## Architecture

### Directory Structure

-   `src/lib/components/` - Reusable Svelte components
-   `src/lib/pages/` - Page-level components (Home, Login, Media, Notes, Places, Settings, Debug)
-   `src/lib/stores/` - Svelte stores for state management
-   `src/lib/services/` - Service modules (location)
-   `src/test/` - Test setup files
-   Tests are co-located with source (e.g., `firebase.test.ts` next to `firebase.ts`)

### Key Files

-   `src/lib/config.ts` - Firebase & TMDB configuration
-   `src/lib/firebase.ts` - Firebase SDK wrapper (Auth, Firestore, Storage)
-   `src/lib/wikipedia.ts` - Wikipedia API for game search with relevance scoring
-   `src/lib/types.ts` - TypeScript interfaces for all data models
-   `src/lib/filters.ts` - Media filtering/sorting pure functions
-   `src/lib/haptics.ts` - Haptic feedback utility (Vibration API)
-   `src/lib/stores/app.ts` - Central Svelte stores (auth, preferences, search, touch detection)
-   `src/App.svelte` - Root component with manual client-side routing

### Routing

Uses manual `window.history.pushState` - no router library. Routes are handled via conditional rendering in App.svelte.

### State Management

-   Svelte 5 runes (`$state`, `$effect`) for reactivity
-   Persisted stores with localStorage (wrapped in try-catch for private browsing)
-   Derived stores for computed state (e.g., `currentPreferences` derives from `activeUser` + `userPreferences`)
-   Firestore sync with proper subscription cleanup on logout/re-auth

### Code Patterns

**localStorage Access** - Always wrap in try-catch (fails in private browsing):

```typescript
try {
    const stored = localStorage.getItem(key)
    if (stored) value = JSON.parse(stored)
} catch (e) {
    console.warn(`Failed to load ${key}:`, e)
}
```

**Effect Cleanup** - Always return cleanup functions for event listeners/timers:

```typescript
$effect(() => {
    const handler = () => {
        /* ... */
    }
    window.addEventListener("event", handler)
    return () => window.removeEventListener("event", handler)
})
```

**API Response Validation** - Check `res.ok === false` (not `!res.ok`) for test compatibility:

```typescript
const res = await fetch(url)
if (res.ok === false) {
    console.warn(`API failed: ${res.status}`)
    return fallbackValue
}
```

**Svelte 5 Derived** - Use `$derived()` directly; manual memoization is redundant:

```typescript
// Good - Svelte handles memoization
let genres = $derived(extractGenres(media))

// Unnecessary - don't do this
let cache = $state(null)
let genres = $derived.by(() => {
    if (cache?.key === key) return cache.value
    // ...
})
```

**Dynamic Components (Svelte 5)** - Replace deprecated `<svelte:component>` with direct usage:

```svelte
<!-- Props: Rename during destructuring -->
let { icon: Icon }: Props = $props()
<Icon size={48} />

<!-- Inside blocks: Use @const -->
{#if item}
  {@const ItemIcon = icons[item.type]}
  <ItemIcon size={24} />
{/if}
```

### User Identity System

Two identities ("Z" and "T") with independent preferences stored per-user in localStorage and synced to Firestore for cross-device access. Per-identity settings include:

-   Theme (light/dark)
-   Accent color
-   Profile picture (stored in Firebase Storage)
-   Location preferences

### Filtering System

Pure functions in `filters.ts`: `applyFilters()`, `applySort()` with composable utilities like `extractGenres()`, `extractDecades()`.

## Firestore Collections

**`/media/{id}`** - Movies, TV shows, games with TMDB integration

-   `type`: "tv" | "movie" | "game"
-   `status`: "queued" | "watching" | "completed" | "dropped"
-   `ratings`: Per-user rating object

**`/notes/{id}`** - Free-form notes with tags

**`/places/{id}`** - Location tracking with categories and visit history

**`/videos/{id}`** - YouTube playlist for shared video watching

-   `status`: "queued" | "watched" | "skipped"
-   `ratings`: Per-user rating object
-   `videoId`: YouTube video ID
-   Supports embedded playback and comments

**`/preferences`** - Cross-device user preferences sync (single document with Z/T preferences)

## Testing

-   Tests run in happy-dom environment
-   Setup file at `src/test/setup.ts` mocks localStorage and extends expect with Jest-DOM matchers
-   Component testing uses @testing-library/svelte

## TypeScript

-   Strict mode with `noUnusedLocals` and `noUnusedParameters`
-   Path alias: `$lib/*` maps to `src/lib/*`
-   All interfaces defined in `src/lib/types.ts`

## CI/CD

-   Production deploys automatically on push to `main` (uses Bun)
-   PR preview deployments via Firebase preview channels (uses npm)
-   Required secret: `FIREBASE_SERVICE_ACCOUNT_ANTZ_ANTZ`
-   **Termux environment**: Run tests and builds via GitHub Actions (commit & push, then check `gh run list`)

## PWA Support

The app is a Progressive Web App with:

-   Offline caching via Workbox service worker
-   App icons generated from `public/favicon.svg`
-   Runtime caching for TMDB API and images
-   In-app update mechanism via Settings page (clears service worker cache)

### PWA Commands

```bash
bun run generate-pwa-assets  # Generate icons from favicon.svg
```

### PWA Configuration

-   `vite.config.ts` - VitePWA plugin configuration
-   `pwa-assets.config.ts` - Icon generation settings
-   `public/favicon.svg` - Source icon (gradient purple/pink with "us" text)

### iOS Safari PWA Quirks

iOS Safari has rendering bugs when running as a PWA. Key patterns used:

**iOS PWA Detection** - Only run workarounds on iOS in standalone mode:

```typescript
const isIOSPWA =
    typeof navigator !== "undefined" &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    typeof window !== "undefined" &&
    window.matchMedia("(display-mode: standalone)").matches
```

**Force Repaint** - Conditional content (`{#if}`) may not visually appear despite DOM updating:

```typescript
function forceRepaint() {
    if (!isIOSPWA) return // Skip on non-iOS platforms
    requestAnimationFrame(() => {
        document.body.style.transform = "translateZ(0)"
        requestAnimationFrame(() => {
            document.body.style.transform = ""
        })
    })
}
```

**GPU Compositing** - Add `style="transform: translateZ(0)"` to elements that appear/disappear conditionally.

**Touch Handling** - Use `touch-manipulation` class on interactive elements for better responsiveness.

### Safe Area CSS

Utilities in `src/app.css` for notched devices (use sparingly - they override existing padding):

-   `.safe-area-top`, `.safe-area-bottom`, `.safe-area-left`, `.safe-area-right`
-   `.safe-area-x`, `.safe-area-y`, `.safe-area-all`

### Offline Support

-   `App.svelte` tracks online/offline state with `navigator.onLine`
-   Offline banner displayed when disconnected
-   Firebase SDK handles offline Firestore persistence automatically

## Search Features

The Search page (`/`) supports two modes:

### Library Mode (default)

-   Searches local Firestore collections (media, notes, places)
-   Supports advanced query syntax: `@movie`, `@tv`, `status:completed`, `rating:4+`
-   Quick filter buttons for content types

### Discover Mode

-   Queries external APIs for new content to add
-   TMDB API for movies and TV shows
-   Wikipedia API for games (with relevance scoring)
-   Category filters: All (6 each), Movies (15), TV (15), Games (15)
-   Auto-fetches game thumbnails when adding items without images

## Routes

| Path              | Component | Description                           |
| ----------------- | --------- | ------------------------------------- |
| `/`               | Search    | Library search + Discover new content |
| `/library/movies` | Library   | Movies collection                     |
| `/library/tv`     | Library   | TV shows collection                   |
| `/library/games`  | Library   | Games collection                      |
| `/videos`         | Videos    | YouTube playlist queue                |
| `/notes`          | Notes     | Free-form notes with tags             |
| `/places`         | Places    | Location/venue tracking               |
| `/settings`       | Settings  | Profile, theme, PWA updates           |
| `/debug`          | Debug     | Development tools                     |

## Touch Device Support

The app detects touch devices and provides enhanced UX:

### Touch Detection

-   `isTouchDevice` store in `src/lib/stores/app.ts` uses `(pointer: coarse)` media query
-   Reactively updates when device mode changes

### Haptic Feedback

Utility functions in `src/lib/haptics.ts`:

```typescript
hapticLight() // 10ms - toggles, selections
hapticMedium() // 25ms - meaningful actions
hapticSuccess() // pattern - completed actions
hapticError() // pattern - errors/warnings
```

### Touch CSS Utilities

In `src/app.css`:

-   `.touch-feedback` - Scale effect on tap (0.97)
-   `.touch-target` - Minimum 44x44px tap target
-   `@media (pointer: coarse)` - Auto-enhances buttons/inputs on touch devices

### Swipe Gestures

-   Sidebar supports swipe-to-close (50px threshold)
-   Global edge swipe removed (conflicted with iOS/Android system gestures)

## Performance Patterns

### Debouncing Expensive Operations

Always debounce user input that triggers expensive computations:

```typescript
// Search input debouncing
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null
const DEBOUNCE_MS = 150

$effect(() => {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
    searchDebounceTimer = setTimeout(() => {
        debouncedQuery = searchQuery
    }, DEBOUNCE_MS)
    return () => {
        if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
    }
})
```

### ResizeObserver Debouncing

ResizeObserver fires frequently; always debounce state updates:

```typescript
$effect(() => {
    if (!container) return
    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    const observer = new ResizeObserver(entries => {
        if (resizeTimer) clearTimeout(resizeTimer)
        resizeTimer = setTimeout(() => {
            containerWidth = entries[0].contentRect.width
        }, 100)
    })
    observer.observe(container)
    return () => {
        observer.disconnect()
        if (resizeTimer) clearTimeout(resizeTimer)
    }
})
```

### Avoiding Race Conditions in Async Effects

Use request IDs to prevent stale responses from overwriting fresh data:

```typescript
let requestId = 0
$effect(() => {
    const currentId = ++requestId
    const controller = new AbortController()

    fetchData(controller.signal).then(data => {
        if (currentId === requestId) {
            // Only update if still current
            results = data
        }
    })

    return () => controller.abort()
})
```

### Shallow Comparison for Objects

Avoid `JSON.stringify()` for object comparison; use shallow field comparison:

```typescript
function prefsEqual(a: Prefs, b: Prefs): boolean {
    const keys = ["theme", "name", "accentColor"] as const
    return keys.every(k => a[k] === b[k])
}
```

### Preventing Duplicate Subscriptions

Guard async initialization to prevent concurrent calls:

```typescript
let isInitializing = false

async function initSync(): Promise<void> {
    if (isInitializing) return
    isInitializing = true
    try {
        // ... initialization logic
    } finally {
        isInitializing = false
    }
}
```

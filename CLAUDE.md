# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Antz is a serverless SPA for relationship documentation (couples app for Z & T). It tracks shared media (movies, TV shows, games), notes, and places of interest.

## Tech Stack

- **Runtime:** Bun (npm also works)
- **Frontend:** Svelte 5 + Vite + TypeScript
- **Styling:** Tailwind CSS 4 with PostCSS
- **Backend:** Firebase (Auth, Firestore, Hosting)
- **Testing:** Vitest with Testing Library & happy-dom
- **External APIs:** TMDB (movies/TV), Wikipedia (games), Google Places

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
- `src/lib/components/` - Reusable Svelte components
- `src/lib/pages/` - Page-level components (Home, Login, Media, Notes, Places, Debug)
- `src/lib/stores/` - Svelte stores for state management
- `src/lib/services/` - Service modules (location)
- `src/test/` - Test setup files
- Tests are co-located with source (e.g., `firebase.test.ts` next to `firebase.ts`)

### Key Files
- `src/lib/config.ts` - Firebase & TMDB configuration
- `src/lib/firebase.ts` - Firebase SDK wrapper functions
- `src/lib/types.ts` - TypeScript interfaces for all data models
- `src/lib/filters.ts` - Media filtering/sorting pure functions
- `src/lib/stores/app.ts` - Central Svelte stores (auth, preferences, search)
- `src/App.svelte` - Root component with manual client-side routing

### Routing
Uses manual `window.history.pushState` - no router library. Routes are handled via conditional rendering in App.svelte.

### State Management
- Svelte 5 runes (`$state`, `$effect`) for reactivity
- Persisted stores with localStorage
- Derived stores for computed state (e.g., `currentPreferences` derives from `activeUser` + `userPreferences`)

### User Identity System
Two identities ("Z" and "T") with independent preferences stored per-user in localStorage. Theme and accent color are per-identity.

### Filtering System
Pure functions in `filters.ts`: `applyFilters()`, `applySort()` with composable utilities like `extractGenres()`, `extractDecades()`.

## Firestore Collections

**`/media/{id}`** - Movies, TV shows, games with TMDB integration
- `type`: "tv" | "movie" | "game"
- `status`: "queued" | "watching" | "completed" | "dropped"
- `ratings`: Per-user rating object

**`/notes/{id}`** - Free-form notes with tags

**`/places/{id}`** - Location tracking with categories and visit history

## Testing

- Tests run in happy-dom environment
- Setup file at `src/test/setup.ts` mocks localStorage and extends expect with Jest-DOM matchers
- Component testing uses @testing-library/svelte

## TypeScript

- Strict mode with `noUnusedLocals` and `noUnusedParameters`
- Path alias: `$lib/*` maps to `src/lib/*`
- All interfaces defined in `src/lib/types.ts`

## CI/CD

- Production deploys automatically on push to `main` (uses Bun)
- PR preview deployments via Firebase preview channels (uses npm)
- Required secret: `FIREBASE_SERVICE_ACCOUNT_ANTZ_ANTZ`

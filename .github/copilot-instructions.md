# Copilot Instructions

This document provides context for GitHub Copilot to understand the project and assist effectively.

## Project Overview

Couples App is a relationship documentation app for Z & T. It's a serverless single-page application (SPA) with a Firebase backend.

## Tech Stack

- **Runtime:** Bun (npm also works)
- **Frontend:** Svelte 5 + Vite + TypeScript
- **Styling:** Tailwind CSS
- **Backend:** Firebase (Auth, Firestore, Hosting)
- **Testing:** Vitest with Testing Library
- **External APIs:** TMDB (movies/TV metadata)

## Development Commands

```bash
# Install dependencies
bun install

# Start development server
bun dev

# Build for production
bun run build

# Run tests
bun test

# Run tests with UI
bun test:ui

# Run tests once (no watch)
bun test:run

# Type checking
bun run check

# Deploy to Firebase
bun run deploy
```

## Project Structure

```
src/
├── lib/
│   ├── components/       # Reusable Svelte components
│   ├── pages/            # Page-level Svelte components
│   ├── stores/           # Svelte stores (state management)
│   ├── config.ts         # Firebase + TMDB configuration
│   ├── firebase.ts       # Firebase SDK wrapper
│   └── types.ts          # TypeScript interfaces
├── test/                 # Test setup files
├── App.svelte            # Root component + routing
├── app.css               # Tailwind imports + CSS variables
└── main.ts               # Entry point
```

## Coding Conventions

### TypeScript

- Use strict TypeScript with `noUnusedLocals` and `noUnusedParameters` enabled
- Define interfaces in `src/lib/types.ts`
- Use path aliases: `$lib/*` maps to `src/lib/*`

### Svelte Components

- Follow Svelte 5 patterns and syntax
- Keep components focused and single-purpose
- Place reusable components in `src/lib/components/`
- Place page-level components in `src/lib/pages/`

### Testing

- Tests use Vitest with happy-dom environment
- Test files can be placed alongside source files (e.g., `firebase.test.ts`)
- Use Testing Library for component testing
- Test setup is in `src/test/setup.ts`

### Styling

- Use Tailwind CSS for styling
- Custom CSS variables are defined in `src/app.css`
- Support both light and dark themes

## Data Model

The app uses Firebase Firestore with these collections:

### Notes (`/notes/{id}`)
- `type`: "note"
- `title`: string
- `content`: string
- `tags`: string[]
- `createdBy`: "Z" | "T"
- `createdAt`: Timestamp

### Media (`/media/{id}`)
- `type`: "tv" | "movie" | "game"
- `title`: string
- `tmdbId`: number (for movies/TV)
- `posterPath`: string | null
- `status`: "queued" | "watching" | "completed" | "dropped"
- `rating`: number | null
- `notes`: string
- `progress`: { season, episode } (TV only)
- `createdBy`: "Z" | "T"

### Places (`/places/{id}`)
- `name`: string
- `category`: "restaurant" | "cafe" | "bar" | "attraction" | "park" | "other"
- `notes`: string
- `visited`: boolean
- `visitDates`: Timestamp[]
- `rating`: number | null
- `createdBy`: "Z" | "T"

## CI/CD

- **Production Deployment:** Automatic via GitHub Actions on push to `main` branch
- **Preview Deployments:** Automatic for pull requests
- Workflows are in `.github/workflows/`

### Pre-Deployment Requirements

**CRITICAL: Before pushing any code changes or creating pull requests, ALWAYS:**

1. **Run type checks:** `bunx svelte-check --tsconfig ./tsconfig.json --threshold error`
   - Must complete with 0 errors (warnings are acceptable)
   - Ensures Svelte 5 syntax compatibility and TypeScript correctness

2. **Run all tests:** `bun test:run`
   - All tests must pass (246 tests currently)
   - Validates functionality and prevents regressions

3. **Common Issues to Check:**
   - Svelte 5 event handlers: Use `onclick`, `onkeydown`, etc. (NOT `on:click`, `on:keydown`)
   - Mixed event handler syntax will cause type check failures
   - TypeScript strict mode compliance

**These checks are enforced in CI and will block deployment if they fail.**

## Important Notes

- Firebase configuration is in `src/lib/config.ts`
- User identity (Z or T) is toggled via header switch
- Preferences are stored per-identity in localStorage
- The app supports offline-first patterns with Firebase

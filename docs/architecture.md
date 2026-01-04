# Architecture Overview

Antz is a serverless Single-Page Application (SPA) designed as a "couples app" for Z & T to track shared media, notes, and places.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Bun (npm compatible) |
| Frontend | Svelte 5 + TypeScript |
| Build | Vite |
| Styling | Tailwind CSS 4 |
| Backend | Firebase (Auth, Firestore, Storage, Hosting) |
| Testing | Vitest + Testing Library |
| PWA | VitePWA + Workbox |

## Directory Structure

```
src/
├── App.svelte              # Root component, routing, auth orchestration
├── main.ts                 # Entry point
├── app.css                 # Global styles, design system utilities
├── lib/
│   ├── components/         # Reusable Svelte components
│   │   ├── ui/             # Design system primitives
│   │   ├── Sidebar.svelte  # Navigation sidebar
│   │   ├── MediaDetailModal.svelte
│   │   ├── PlaceDetailModal.svelte
│   │   └── ...
│   ├── pages/              # Page-level components
│   │   ├── Search.svelte   # Home/universal search
│   │   ├── Library.svelte  # Media library (movies/tv/games)
│   │   ├── Notes.svelte    # Note messaging
│   │   ├── Places.svelte   # Location tracking
│   │   ├── Settings.svelte # User preferences
│   │   └── Debug.svelte    # Development tools
│   ├── stores/
│   │   └── app.ts          # Central Svelte stores
│   ├── services/
│   │   └── location.ts     # Geolocation service
│   ├── types.ts            # TypeScript interfaces
│   ├── firebase.ts         # Firebase SDK wrapper
│   ├── filters.ts          # Media filtering pure functions
│   ├── queryParser.ts      # Search query DSL parser
│   ├── tmdb.ts             # TMDB API integration
│   ├── wikipedia.ts        # Wikipedia game search
│   ├── haptics.ts          # Vibration API wrapper
│   ├── fuzzy.ts            # Fuzzy string matching
│   └── config.ts           # API keys and configuration
└── test/
    └── setup.ts            # Test environment setup
```

## Core Patterns

### 1. Manual Client-Side Routing

No router library. Routes are handled via `window.history.pushState` and conditional rendering in `App.svelte`:

```svelte
// App.svelte
let currentPath = $state(window.location.pathname)

function navigate(path: string) {
  window.history.pushState({}, '', path)
  currentPath = path
}

// Conditional rendering based on path
{#if currentPath === '/'}
  <Search {navigate} />
{:else if currentPath === '/notes'}
  <Notes />
{/if}
```

### 2. Dual-User Identity System

The app supports two fixed identities: "Z" and "T". Each user has independent preferences stored per-user.

```typescript
type UserId = "Z" | "T"

// Active user stored in localStorage
export const activeUser = createPersistedStore<UserId>('activeUser', 'Z')

// Per-user preferences
export const userPreferences = createPersistedStore<UserPreferencesMap>('userPreferences', DEFAULT_PREFERENCES)

// Derived current user's preferences
export const currentPreferences = derived(
  [activeUser, userPreferences],
  ([$activeUser, $userPreferences]) => $userPreferences[$activeUser]
)
```

### 3. Firebase Real-Time Sync

All data uses real-time Firestore subscriptions with automatic cleanup:

```typescript
// Generic subscription pattern
onMount(() => {
  unsubscribe = subscribeToCollection<Media>('media', (items) => {
    media = items
  })
  return () => unsubscribe?.()
})
```

### 4. Svelte 5 Runes

The codebase uses Svelte 5's new runes API:

```svelte
// Reactive state
let count = $state(0)

// Derived values (auto-memoized)
let doubled = $derived(count * 2)

// Complex derived with explicit function
let filtered = $derived.by(() => {
  return items.filter(i => i.active)
})

// Effects with cleanup
$effect(() => {
  const handler = () => { /* ... */ }
  window.addEventListener('resize', handler)
  return () => window.removeEventListener('resize', handler)
})
```

### 5. Per-User Ratings

Both Media and Places support per-user ratings with backward compatibility:

```typescript
interface Media {
  rating: number | null          // Legacy single rating
  ratings?: Record<UserId, number | null>  // Per-user ratings
}

// Helper functions handle migration
function getDisplayRating(media: Media): number | null {
  return getAverageRating(media)  // Returns average of both users
}
```

## Data Flow

```
┌─────────────────┐
│   User Action   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Svelte Store   │ ◄── localStorage (persisted stores)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    Firebase     │ ◄── Real-time sync
│   (Firestore)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  onSnapshot()   │ ◄── Updates pushed to all clients
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Svelte $state │ ◄── Triggers reactive UI updates
└─────────────────┘
```

## PWA Architecture

The app is a Progressive Web App with:

- **Service Worker**: Workbox-based caching strategy
- **Offline Support**: Firebase SDK handles offline Firestore persistence
- **App Icons**: Generated from `public/favicon.svg`
- **iOS Safari Quirks**: Force repaint pattern for conditional content

```typescript
// iOS Safari PWA rendering fix
function forceRepaint() {
  requestAnimationFrame(() => {
    document.body.style.transform = 'translateZ(0)'
    requestAnimationFrame(() => {
      document.body.style.transform = ''
    })
  })
}
```

## Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/` | Search | Universal search across all content |
| `/library/movies` | Library | Movies collection |
| `/library/tv` | Library | TV shows collection |
| `/library/games` | Library | Games collection |
| `/notes` | Notes | Messaging between users |
| `/places` | Places | Location/venue tracking |
| `/settings` | Settings | Profile, theme, PWA updates |
| `/debug` | Debug | Development tools |

## Security Model

- **Authentication**: Google OAuth via Firebase Auth
- **Authorization**: Firestore security rules (shared between Z & T)
- **Storage**: Profile pictures in Firebase Storage, keyed by UserId

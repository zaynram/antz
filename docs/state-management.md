# State Management

This document describes the state management patterns used in the application.

## Overview

The app uses a hybrid approach:
1. **Svelte 5 Runes** - Component-local reactive state
2. **Svelte Stores** - Shared/global state
3. **Firestore Subscriptions** - Real-time data sync
4. **localStorage** - Persistence for preferences

---

## Svelte 5 Runes

### `$state` - Reactive State

```typescript
// Primitive state
let count = $state(0)

// Object state
let filters = $state<MediaFilters>({ status: 'all', genres: [] })

// Array state
let items = $state<Media[]>([])
```

### `$derived` - Computed Values

Auto-memoized computed values:

```typescript
// Simple derived
let doubled = $derived(count * 2)

// Derived from multiple sources
let filtered = $derived(items.filter(i => i.status === filters.status))

// Complex derived with explicit function
let stats = $derived.by(() => {
  return {
    total: items.length,
    completed: items.filter(i => i.status === 'completed').length,
    avgRating: calculateAverage(items)
  }
})
```

### `$effect` - Side Effects

```typescript
// Run effect when dependencies change
$effect(() => {
  console.log('Count changed:', count)
})

// Effect with cleanup
$effect(() => {
  const handler = () => { /* ... */ }
  window.addEventListener('resize', handler)
  return () => window.removeEventListener('resize', handler)
})
```

### `$props` - Component Props

```typescript
interface Props {
  title: string
  items: Item[]
  onchange?: (item: Item) => void
}

let { title, items, onchange }: Props = $props()
```

---

## Global Stores (`src/lib/stores/app.ts`)

### Persisted Stores

Custom store factory that syncs with localStorage:

```typescript
function createPersistedStore<T>(key: string, initial: T) {
  // Read from localStorage on init
  let value = initial
  try {
    const stored = localStorage.getItem(key)
    if (stored) value = JSON.parse(stored)
  } catch (e) {
    console.warn(`Failed to load ${key}:`, e)
  }

  const store = writable<T>(value)

  // Sync to localStorage on change
  store.subscribe((v) => {
    try {
      localStorage.setItem(key, JSON.stringify(v))
    } catch (e) {
      console.warn(`Failed to save ${key}:`, e)
    }
  })

  return store
}
```

**Note:** localStorage access is wrapped in try-catch for private browsing mode compatibility.

### Available Stores

#### `activeUser`
Currently active user identity (Z or T).

```typescript
import { activeUser } from '$lib/stores/app'

// Read
const user = $activeUser  // 'Z' or 'T'

// Write
activeUser.set('T')
```

#### `userPreferences`
Both users' preferences:

```typescript
import { userPreferences } from '$lib/stores/app'

// Read all preferences
const prefs = $userPreferences  // { Z: {...}, T: {...} }

// Update specific user's preference
userPreferences.update(p => ({
  ...p,
  Z: { ...p.Z, theme: 'dark' }
}))
```

#### `currentPreferences`
Derived store for active user's preferences:

```typescript
import { currentPreferences } from '$lib/stores/app'

// Automatically updates when activeUser or userPreferences change
const prefs = $currentPreferences  // Current user's preferences
```

#### `displayNames`
Derived store for user display names:

```typescript
import { displayNames } from '$lib/stores/app'

const names = $displayNames  // { Z: 'Zara', T: 'Tom' }
```

#### `authUser` / `authLoading`
Firebase auth state:

```typescript
import { authUser, authLoading } from '$lib/stores/app'

if ($authLoading) {
  // Show loading state
} else if (!$authUser) {
  // Show login
}
```

#### `isTouchDevice`
Readable store detecting touch capability:

```typescript
import { isTouchDevice } from '$lib/stores/app'

if ($isTouchDevice) {
  // Enable touch-specific features
}
```

#### `mediaSearchHistory`
Recent search history (max 5):

```typescript
import {
  mediaSearchHistory,
  addToSearchHistory,
  removeFromSearchHistory,
  clearSearchHistory
} from '$lib/stores/app'

// Add search term
addToSearchHistory('action movies')

// Read history
const history = $mediaSearchHistory  // ['action movies', ...]
```

#### `mediaGridSize`
Grid size preference:

```typescript
import { mediaGridSize, type GridSize } from '$lib/stores/app'

// 'small' | 'medium' | 'large'
mediaGridSize.set('large')
```

---

## Firestore Sync

### Preferences Sync

Preferences are synced bidirectionally with Firestore:

```typescript
// Initialize sync after auth
initPreferencesSync()

// Cleanup on logout
cleanupPreferencesSync()
```

**Sync behavior:**
1. On login: Load from Firestore, merge with local (Firestore wins)
2. On local change: Debounce 1 second, then push to Firestore
3. On remote change: Update local store immediately
4. Loop prevention: Flag tracks if update is from remote

### Collection Subscriptions

Real-time data uses Firestore `onSnapshot`:

```typescript
import { subscribeToCollection } from '$lib/firebase'
import { onMount } from 'svelte'

let media = $state<Media[]>([])
let unsubscribe: (() => void) | undefined

onMount(() => {
  unsubscribe = subscribeToCollection<Media>('media', (items) => {
    media = items
  })
  return () => unsubscribe?.()
})
```

**Important:** Always clean up subscriptions on unmount.

---

## State Patterns

### 1. Local + Derived Pattern

For filtered/sorted lists:

```typescript
// Source data from Firestore
let media = $state<Media[]>([])

// Local filter state
let filters = $state<MediaFilters>(DEFAULT_FILTERS)

// Derived filtered result
let filtered = $derived(applyFilters(media, filters))
let sorted = $derived(applySort(filtered, sort))
```

### 2. Form State Pattern

For form inputs with external sync:

```typescript
let editedNotes = $state('')
let previousMediaId: string | undefined = undefined

// Sync from prop when media changes
$effect(() => {
  if (media && media.id !== previousMediaId) {
    editedNotes = media.notes || ''
    previousMediaId = media.id
  }
})

// Save on blur
async function saveNotes() {
  await updateDocument('media', media.id, { notes: editedNotes }, $activeUser)
}
```

### 3. Modal State Pattern

For modals with item selection:

```typescript
let selectedItem = $state<Media | null>(null)

function openDetail(item: Media) {
  selectedItem = item
}

function closeDetail() {
  selectedItem = null
}

// In template
{#if selectedItem}
  <MediaDetailModal media={selectedItem} onClose={closeDetail} />
{/if}
```

### 4. Debounced Sync Pattern

For expensive operations:

```typescript
let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null

function debouncedSave(data: Data): void {
  if (syncDebounceTimer) clearTimeout(syncDebounceTimer)
  syncDebounceTimer = setTimeout(() => {
    saveToFirestore(data)
  }, 1000)
}
```

---

## Anti-Patterns to Avoid

### 1. Avoid Manual Memoization

Svelte 5's `$derived` handles memoization automatically:

```typescript
// Bad - redundant memoization
let cache = $state(null)
let result = $derived.by(() => {
  if (cache?.key === key) return cache.value
  const computed = expensiveOperation()
  cache = { key, value: computed }
  return computed
})

// Good - Svelte handles it
let result = $derived(expensiveOperation())
```

### 2. Avoid Effect Loops

Don't update state that an effect depends on:

```typescript
// Bad - infinite loop
$effect(() => {
  count = count + 1  // Triggers itself
})

// Good - use derived or separate trigger
let doubled = $derived(count * 2)
```

### 3. Clean Up Subscriptions

Always return cleanup function from `onMount`:

```typescript
// Bad - memory leak
onMount(() => {
  subscribeToCollection('media', (items) => { media = items })
})

// Good - cleanup on unmount
onMount(() => {
  const unsub = subscribeToCollection('media', (items) => { media = items })
  return () => unsub()
})
```

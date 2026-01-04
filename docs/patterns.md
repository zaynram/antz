# Code Patterns

This document captures identified patterns and conventions in the codebase.

## Architectural Patterns

### 1. Dual-User Identity Pattern

The app is designed for exactly two users (Z and T) with independent preferences but shared data.

**Implementation:**
- `UserId` type is a literal union: `"Z" | "T"`
- Preferences stored per-user in single document
- Ratings use `Record<UserId, number | null>`
- `activeUser` store switches between identities

**Pattern usage:**
```typescript
// Per-user data structure
interface WithUserRatings {
  rating: number | null  // Legacy
  ratings?: Record<UserId, number | null>
}

// Getting other user
const otherUser: UserId = activeUser === 'Z' ? 'T' : 'Z'
```

### 2. Real-Time First Pattern

All data uses Firestore real-time subscriptions, not one-time fetches.

**Pattern:**
```typescript
onMount(() => {
  const unsubscribe = subscribeToCollection<T>('collection', (items) => {
    data = items
  })
  return () => unsubscribe?.()
})
```

**Benefits:**
- Multi-device sync without polling
- Automatic updates when other user makes changes
- Offline support via Firebase SDK

### 3. Pure Filter/Sort Functions

Filtering and sorting are pure functions, not component methods.

**Location:** `src/lib/filters.ts`

**Pattern:**
```typescript
// Pure functions take data, return transformed data
export function applyFilters(media: Media[], filters: MediaFilters): Media[]
export function applySort(media: Media[], sort: SortConfig): Media[]

// Derived state in component
let filtered = $derived(applyFilters(media, filters))
let sorted = $derived(applySort(filtered, sort))
```

**Benefits:**
- Easily testable
- Reusable across components
- Clear separation of concerns

### 4. Query DSL Pattern

Universal search uses a custom query language parser.

**Location:** `src/lib/queryParser.ts`

**Syntax examples:**
```
@movie rating>4 "dark knight" -batman status:completed by:Z
```

**Pattern:**
```typescript
// Parse query string to structured object
const parsed = parseQuery(queryString)

// Match items against parsed query
const score = matchesQuery(item, parsed)

// Filter and sort by score
const results = items
  .map(item => ({ item, score: matchesQuery(item, parsed) }))
  .filter(({ score }) => score > 0)
  .sort((a, b) => b.score - a.score)
```

---

## Component Patterns

### 1. Page Structure Pattern

All pages follow consistent structure:

```svelte
<div class="max-w-2xl mx-auto">
  <PageHeader title="..." icon={...} subtitle="..." />

  <!-- Action bar -->
  <div class="flex items-center justify-between gap-2 mb-4">
    <button class="btn-primary">Add</button>
    <IconButton icon={Filter} />
  </div>

  <!-- Optional filter panel -->
  {#if showFilters}
    <div class="card p-4 mb-4">...</div>
  {/if}

  <!-- Content or empty state -->
  {#each items as item}
    ...
  {:else}
    <EmptyState ... />
  {/each}
</div>
```

### 2. Modal Selection Pattern

For detail views, use selected item state:

```svelte
<script>
  let selectedItem = $state<Item | null>(null)
</script>

<!-- List items are clickable -->
{#each items as item}
  <article onclick={() => selectedItem = item}>
    ...
  </article>
{/each}

<!-- Modal shows when item selected -->
{#if selectedItem}
  <DetailModal
    item={selectedItem}
    onClose={() => selectedItem = null}
  />
{/if}
```

### 3. Form Sync Pattern

For forms that sync with external data:

```svelte
<script>
  let editedValue = $state('')
  let previousId: string | undefined = undefined

  // Sync when item changes
  $effect(() => {
    if (item && item.id !== previousId) {
      editedValue = item.value || ''
      previousId = item.id
    }
  })

  // Save on blur
  async function save() {
    await updateDocument('items', item.id, { value: editedValue })
  }
</script>

<input bind:value={editedValue} onblur={save} />
```

### 4. Tab Filtering Pattern

Tabs filter data without navigation:

```svelte
<script>
  type TabKey = 'all' | 'active' | 'archived'
  let activeTab = $state<TabKey>('all')

  let filteredItems = $derived.by(() => {
    switch (activeTab) {
      case 'active': return items.filter(i => !i.archived)
      case 'archived': return items.filter(i => i.archived)
      default: return items
    }
  })
</script>

<Tabs tabs={tabsData} active={activeTab} onchange={(t) => activeTab = t} />

{#each filteredItems as item}
  ...
{/each}
```

---

## Data Patterns

### 1. Backward-Compatible Migration Pattern

For schema changes, support both old and new formats:

```typescript
// New format with backward compatibility
interface Media {
  rating: number | null  // Legacy field
  ratings?: Record<UserId, number | null>  // New field
}

// Helper handles both
function getUserRating(media: Media, userId: UserId): number | null {
  if (media.ratings && userId in media.ratings) {
    return media.ratings[userId]
  }
  return media.rating ?? null  // Fallback to legacy
}
```

### 2. Optimistic Update Pattern

UI updates immediately, sync happens in background:

```typescript
async function toggleStatus(item: Item) {
  // Haptic feedback for immediate response
  hapticLight()

  // Firebase update (async, but don't await in UI)
  await updateDocument('items', item.id, {
    status: !item.status
  }, $activeUser)

  // Real-time subscription will update UI automatically
}
```

### 3. Debounced Sync Pattern

For frequent updates (preferences, notes):

```typescript
let syncTimer: ReturnType<typeof setTimeout> | null = null

function debouncedSave(data: Data): void {
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    saveToServer(data)
  }, 1000)  // 1 second debounce
}
```

---

## Error Handling Patterns

### 1. Graceful Degradation

APIs fail silently with fallback values:

```typescript
async function fetchData(): Promise<Data[]> {
  try {
    const res = await fetch(url)
    if (res.ok === false) {  // Use === false for test compat
      console.warn(`API failed: ${res.status}`)
      return []  // Empty fallback
    }
    return await res.json()
  } catch (e) {
    console.error('Fetch error:', e)
    return []  // Empty fallback
  }
}
```

### 2. localStorage Safety

Always wrap localStorage in try-catch:

```typescript
try {
  const stored = localStorage.getItem(key)
  if (stored) value = JSON.parse(stored)
} catch (e) {
  console.warn(`Failed to load ${key}:`, e)
  // Use default value
}
```

---

## UI Patterns

### 1. Touch Target Pattern

All interactive elements have minimum 44px touch targets:

```svelte
<button class="w-11 h-11 flex items-center justify-center touch-manipulation">
  <Icon size={20} />
</button>
```

### 2. Hover-Only Actions Pattern

Actions that appear on hover, visible on touch:

```svelte
<article class="group">
  <!-- Always visible content -->
  <h3>{title}</h3>

  <!-- Hidden on desktop, shown on hover/touch -->
  <div class="opacity-0 group-hover:opacity-100 transition-opacity">
    <IconButton icon={X} />
  </div>
</article>

<style>
  @media (hover: none) {
    .group:active .opacity-0 {
      opacity: 1;
    }
  }
</style>
```

### 3. iOS PWA Repaint Pattern

Force repaint for iOS Safari PWA rendering bugs:

```typescript
function forceRepaint() {
  requestAnimationFrame(() => {
    document.body.style.transform = 'translateZ(0)'
    requestAnimationFrame(() => {
      document.body.style.transform = ''
    })
  })
}
```

### 4. Haptic Feedback Pattern

Use haptics for meaningful interactions:

```typescript
import { hapticLight, hapticSuccess, hapticError } from '$lib/haptics'

// Light - toggles, selections
hapticLight()

// Success - completed actions
hapticSuccess()

// Error - failures
hapticError()
```

---

## Naming Conventions

### Files
- Components: `PascalCase.svelte`
- Utilities: `camelCase.ts`
- Tests: `filename.test.ts` (co-located)

### Types
- Interfaces: `PascalCase`
- Type aliases: `PascalCase`
- Union types: `PascalCase` (e.g., `MediaStatus`)

### Functions
- Actions: `verbNoun` (e.g., `addDocument`, `toggleVisited`)
- Getters: `getNoun` or `extractNoun` (e.g., `getDisplayRating`)
- Predicates: `isNoun` or `hasNoun` (e.g., `hasActiveFilters`)

### CSS Classes
- Utilities: Tailwind classes
- Components: `.btn-primary`, `.card`, `.input`
- Status: `.status-queued`, `.badge-completed`

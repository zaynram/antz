# Testing Guide

This document describes testing patterns and setup.

## Test Stack

| Tool | Purpose |
|------|---------|
| Vitest | Test runner |
| @testing-library/svelte | Component testing |
| @testing-library/jest-dom | DOM assertions |
| happy-dom | DOM environment |

## Running Tests

```bash
# Watch mode (development)
bun test

# Single run
bun test:run

# With UI dashboard
bun test:ui
```

---

## Test Setup (`src/test/setup.ts`)

```typescript
import { expect, afterEach } from 'vitest'
import { cleanup } from '@testing-library/svelte'
import * as matchers from '@testing-library/jest-dom/matchers'

// Extend Vitest with jest-dom matchers
expect.extend(matchers)

// Cleanup after each test
afterEach(() => {
  cleanup()
})

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value.toString() },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} }
  }
})()

global.localStorage = localStorageMock as Storage
```

---

## Test File Location

Tests are co-located with source files:

```
src/lib/
  filters.ts
  filters.test.ts    # Tests next to source
  firebase.ts
  firebase.test.ts
  stores/
    app.ts
    app.test.ts
```

---

## Testing Patterns

### 1. Pure Function Tests

Most straightforward - test input/output:

```typescript
// filters.test.ts
import { describe, it, expect } from 'vitest'
import { applyFilters, applySort } from './filters'

describe('applyFilters', () => {
  const mockMedia = [
    { id: '1', type: 'movie', status: 'completed', title: 'A' },
    { id: '2', type: 'tv', status: 'watching', title: 'B' }
  ]

  it('should filter by status', () => {
    const result = applyFilters(mockMedia, {
      ...DEFAULT_FILTERS,
      status: 'completed'
    })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('1')
  })

  it('should return all when no filters', () => {
    const result = applyFilters(mockMedia, DEFAULT_FILTERS)
    expect(result).toHaveLength(2)
  })
})
```

### 2. API Mock Tests

Mock fetch for API tests:

```typescript
// tmdb.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getGenreMap, resolveGenreIds } from './tmdb'

describe('getGenreMap', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should fetch and cache genres', async () => {
    const mockResponse = {
      genres: [
        { id: 28, name: 'Action' },
        { id: 12, name: 'Adventure' }
      ]
    }

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse)
    })

    const result = await getGenreMap('movie')

    expect(result.get(28)).toBe('Action')
    expect(fetch).toHaveBeenCalledTimes(1)

    // Second call should use cache
    await getGenreMap('movie')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('should handle API errors gracefully', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500
    })

    const result = await getGenreMap('movie')

    expect(result.size).toBe(0)  // Empty map on error
  })
})
```

### 3. Store Tests

Test reactive stores:

```typescript
// stores/app.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { get } from 'svelte/store'
import { activeUser, userPreferences, currentPreferences } from './app'

describe('activeUser store', () => {
  beforeEach(() => {
    localStorage.clear()
    activeUser.set('Z')
  })

  it('should persist to localStorage', () => {
    activeUser.set('T')

    const stored = localStorage.getItem('activeUser')
    expect(JSON.parse(stored!)).toBe('T')
  })

  it('should load from localStorage', () => {
    localStorage.setItem('activeUser', JSON.stringify('T'))

    // Re-import to test initialization
    // (May need module reset in actual test)
    expect(get(activeUser)).toBe('T')
  })
})

describe('currentPreferences derived store', () => {
  it('should derive from activeUser and userPreferences', () => {
    activeUser.set('Z')
    userPreferences.update(p => ({
      ...p,
      Z: { ...p.Z, theme: 'dark' }
    }))

    const current = get(currentPreferences)
    expect(current.theme).toBe('dark')
  })
})
```

### 4. Type Helper Tests

Test type utility functions:

```typescript
// types.test.ts
import { describe, it, expect } from 'vitest'
import { getUserRating, getAverageRating, getDisplayRating } from './types'

describe('rating helpers', () => {
  it('should get user rating from ratings object', () => {
    const media = {
      rating: null,
      ratings: { Z: 4, T: 5 }
    }

    expect(getUserRating(media, 'Z')).toBe(4)
    expect(getUserRating(media, 'T')).toBe(5)
  })

  it('should fall back to legacy rating', () => {
    const media = {
      rating: 3,
      ratings: undefined
    }

    expect(getUserRating(media, 'Z')).toBe(3)
  })

  it('should calculate average rating', () => {
    const media = {
      rating: null,
      ratings: { Z: 4, T: 5 }
    }

    expect(getAverageRating(media)).toBe(4.5)
  })
})
```

### 5. Query Parser Tests

Test query language parsing:

```typescript
// queryParser.test.ts (implied from usage)
import { describe, it, expect } from 'vitest'
import { parseQuery, matchesQuery } from './queryParser'

describe('parseQuery', () => {
  it('should parse type filters', () => {
    const result = parseQuery('@movie @tv')

    expect(result.types).toEqual(['movie', 'tv'])
  })

  it('should parse quoted phrases', () => {
    const result = parseQuery('"breaking bad"')

    expect(result.exactPhrases).toEqual(['breaking bad'])
  })

  it('should parse rating comparisons', () => {
    const result = parseQuery('rating>4')

    expect(result.minRating).toBe(5)
  })

  it('should parse exclusions', () => {
    const result = parseQuery('-horror NOT scary')

    expect(result.excludeTerms).toEqual(['horror', 'scary'])
  })
})

describe('matchesQuery', () => {
  const item = {
    id: '1',
    type: 'movie',
    title: 'The Dark Knight',
    rating: 5
  }

  it('should match type filter', () => {
    const query = parseQuery('@movie')
    expect(matchesQuery(item, query)).toBeGreaterThan(0)
  })

  it('should not match wrong type', () => {
    const query = parseQuery('@tv')
    expect(matchesQuery(item, query)).toBe(0)
  })

  it('should match title terms', () => {
    const query = parseQuery('dark knight')
    expect(matchesQuery(item, query)).toBeGreaterThan(0)
  })
})
```

---

## Test Utilities

### Mock Timestamp

For Firestore Timestamp mocking:

```typescript
const mockTimestamp = {
  toDate: () => new Date('2024-01-01'),
  toMillis: () => 1704067200000
}
```

### Mock Media Item

```typescript
const createMockMedia = (overrides = {}) => ({
  id: '1',
  type: 'movie' as const,
  title: 'Test Movie',
  status: 'completed' as const,
  rating: null,
  ratings: { Z: null, T: null },
  createdBy: 'Z' as const,
  createdAt: mockTimestamp,
  updatedAt: mockTimestamp,
  posterPath: null,
  notes: '',
  ...overrides
})
```

---

## Coverage

Run with coverage:

```bash
bun test:run --coverage
```

Current test files:
- `filters.test.ts` - 45 tests
- `firebase.test.ts` - 18 tests
- `fuzzy.test.ts` - 28 tests
- `haptics.test.ts` - 8 tests
- `types.test.ts` - 39 tests
- `wikipedia.test.ts` - 15 tests
- `tmdb.test.ts` - 13 tests
- `places.test.ts` - 25 tests
- `services/location.test.ts` - 27 tests
- `stores/app.test.ts` - 24 tests

**Total: 242 tests**

---

## Best Practices

### 1. Test Behavior, Not Implementation

```typescript
// Good - tests behavior
it('should filter completed items', () => {
  const result = applyFilters(items, { status: 'completed' })
  expect(result.every(i => i.status === 'completed')).toBe(true)
})

// Avoid - tests implementation details
it('should call Array.filter', () => { ... })
```

### 2. Use Descriptive Test Names

```typescript
// Good
it('should return empty array when no items match filter')
it('should handle null ratings gracefully')
it('should fall back to legacy rating field')

// Avoid
it('works')
it('test 1')
```

### 3. Isolate Tests

```typescript
beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})
```

### 4. Test Edge Cases

```typescript
it('should handle empty array', () => {
  expect(applyFilters([], DEFAULT_FILTERS)).toEqual([])
})

it('should handle undefined ratings', () => {
  const media = { rating: null, ratings: undefined }
  expect(getDisplayRating(media)).toBeNull()
})
```

### 5. Mock External Dependencies

```typescript
// Don't hit real APIs in tests
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve(mockData)
})
```

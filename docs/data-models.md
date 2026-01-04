# Data Models

This document describes the Firestore schema and TypeScript types.

## Core Types

### UserId

Fixed set of two user identities:

```typescript
type UserId = "Z" | "T"
```

### BaseDocument

All Firestore documents extend this base:

```typescript
interface BaseDocument {
  id?: string              // Firestore document ID (added on read)
  createdBy: UserId        // Who created this document
  createdAt: Timestamp     // Server timestamp
  updatedAt: Timestamp     // Server timestamp
  updatedBy?: UserId       // Who last updated (optional)
}
```

---

## Firestore Collections

### `/media/{id}` - Media Collection

Stores movies, TV shows, and games.

```typescript
interface Media extends BaseDocument {
  type: MediaType           // "tv" | "movie" | "game"
  tmdbId?: number           // TMDB ID (movies/TV)
  steamId?: number          // Steam ID (games, reserved)
  title: string
  posterPath: string | null // TMDB image path
  releaseDate?: string      // YYYY-MM-DD format
  overview?: string         // Description/synopsis
  status: MediaStatus       // "queued" | "watching" | "completed" | "dropped"

  // Ratings (dual-user system)
  rating: number | null              // Legacy single rating (1-5)
  ratings?: Record<UserId, number | null>  // Per-user ratings

  // User content
  notes: string
  progress?: MediaProgress

  // Metadata from TMDB
  genres?: string[]
  watchDate?: Timestamp
  comments?: MediaComment[]
  collection?: MediaCollection | null  // Movie franchise
  productionCompanies?: ProductionCompany[]

  // Custom grouping (future)
  customGroupId?: string
  customGroupName?: string
}

type MediaType = "tv" | "movie" | "game"
type MediaStatus = "queued" | "watching" | "completed" | "dropped"

interface MediaProgress {
  season?: number
  episode?: number
}

interface MediaComment {
  id: string           // UUID
  text: string
  createdBy: UserId
  createdAt: Timestamp
}

interface MediaCollection {
  id: number           // TMDB collection ID
  name: string
}

interface ProductionCompany {
  id: number
  name: string
}
```

**Rating Helper Functions:**

```typescript
// Get specific user's rating
getUserRating(media: Media, userId: UserId): number | null

// Get average of both users' ratings
getAverageRating(media: Media): number | null

// Get display rating (uses average if available)
getDisplayRating(media: Media): number | null
```

---

### `/notes/{id}` - Notes Collection

Messaging system between users.

```typescript
interface Note extends BaseDocument {
  type: "note"
  title: string
  content: string
  tags: string[]
  read?: boolean           // Has recipient read it?
  readAt?: Timestamp       // When it was read
  archived?: boolean       // Archived by recipient
}
```

**Note Behavior:**
- Notes are "sent" from one user to the other
- `createdBy` indicates the sender
- Recipient can mark as read and archive
- Inbox shows notes where `createdBy !== activeUser`
- Sent shows notes where `createdBy === activeUser`

---

### `/places/{id}` - Places Collection

Location/venue tracking.

```typescript
interface Place extends BaseDocument {
  name: string
  category: PlaceCategory
  notes: string
  visited: boolean
  visitDates: Timestamp[]   // History of visits

  // Ratings (dual-user system)
  rating: number | null                    // Legacy
  ratings?: Record<UserId, number | null>  // Per-user ratings

  // Comments
  comments?: PlaceComment[]

  // Location data
  location?: GeoLocation
  placeId?: string          // Google Places ID

  // User tags
  tags?: string[]
}

type PlaceCategory = "restaurant" | "cafe" | "bar" | "attraction" | "park" | "other"

interface PlaceComment {
  id: string
  text: string
  createdBy: UserId
  createdAt: Timestamp
}

interface GeoLocation {
  lat: number
  lng: number
  address?: string
}
```

**Place Rating Helper Functions:**

```typescript
getPlaceUserRating(place: Place, userId: UserId): number | null
getPlaceAverageRating(place: Place): number | null
getPlaceDisplayRating(place: Place): number | null
```

---

### `/preferences` - User Preferences

Single shared document for both users' preferences.

```typescript
// Document path: /preferences/shared
interface PreferencesDocument {
  Z: UserPreferences
  T: UserPreferences
  updatedAt: Timestamp
}

interface UserPreferences {
  theme: Theme               // "light" | "dark"
  accentColor: string        // Hex color (#6366f1)
  name: string               // Display name
  profilePicture?: string    // Firebase Storage URL

  // Location settings
  locationMode: LocationMode  // "auto" | "manual" | "off"
  currentLocation?: GeoLocation
  referenceLocation?: GeoLocation
  searchRadius: number        // meters (default 5000)
}

type Theme = "light" | "dark"
type LocationMode = "auto" | "manual" | "off"
```

---

## Storage Structure

### Firebase Storage Paths

```
/profile-pictures/{userId}    # Z or T - profile picture
```

---

## Utility Types

### Distance Calculation

```typescript
// Haversine formula for distance between coordinates
calculateDistance(loc1: GeoLocation, loc2: GeoLocation): number  // Returns km

// Format distance for display
formatDistance(km: number): string  // "500 m", "1.2 km", "15 km"
```

---

## Search Types

### TMDBSearchResult

Results from TMDB API search:

```typescript
interface TMDBSearchResult {
  id: number
  media_type: "movie" | "tv"
  title?: string          // For movies
  name?: string           // For TV shows
  poster_path: string | null
  release_date?: string   // For movies
  first_air_date?: string // For TV
  overview: string
  genre_ids?: number[]
}
```

### SearchableItem

Normalized item for universal search:

```typescript
interface SearchableItem {
  id: string
  type: ContentType       // "movie" | "tv" | "game" | "note" | "place"
  title: string
  content?: string
  tags?: string[]
  status?: MediaStatus
  rating?: number | null
  year?: number
  createdBy?: UserId
  visited?: boolean
  archived?: boolean
  read?: boolean
  genres?: string[]
}
```

---

## Firestore Operations

### Generic CRUD Pattern

```typescript
// Subscribe to collection (real-time)
subscribeToCollection<T>(
  collectionName: string,
  callback: (items: T[]) => void,
  orderByField?: string
): () => void  // Returns unsubscribe function

// Add document
addDocument<T>(
  collectionName: string,
  data: Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>,
  activeUser: UserId
): Promise<string>  // Returns document ID

// Update document
updateDocument<T>(
  collectionName: string,
  docId: string,
  data: Partial<T>,
  activeUser: UserId
): Promise<void>

// Delete document
deleteDocument(
  collectionName: string,
  docId: string
): Promise<void>
```

### Automatic Timestamps

All write operations automatically set:
- `createdAt` (on create)
- `updatedAt` (on create and update)
- `createdBy` (on create)
- `updatedBy` (on update)

---

## Migration Notes

### Legacy Rating Migration

Old documents may have only `rating` field (single number). New documents use `ratings` object:

```typescript
// Old format
{ rating: 4 }

// New format
{ rating: null, ratings: { Z: 4, T: 5 } }
```

Helper functions handle both formats transparently.

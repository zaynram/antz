# API Integrations

This document describes external API integrations and patterns.

## TMDB API (`src/lib/tmdb.ts`)

The Movie Database API for movie and TV show metadata.

### Configuration

```typescript
// src/lib/config.ts
export const tmdbConfig = {
  apiKey: 'YOUR_API_KEY',
  baseUrl: 'https://api.themoviedb.org/3',
  imageBaseUrl: 'https://image.tmdb.org/t/p'
}
```

### Functions

#### `getGenreMap(type)`

Fetches and caches genre ID → name mapping:

```typescript
const genreMap = await getGenreMap('movie')
// Map { 28 => 'Action', 12 => 'Adventure', ... }
```

**Caching:** Cached per media type (movie/tv) for session lifetime.

#### `resolveGenreIds(ids, type)`

Converts genre IDs to names:

```typescript
const genres = await resolveGenreIds([28, 12], 'movie')
// ['Action', 'Adventure']
```

#### `fetchMovieDetails(tmdbId)`

Fetches detailed movie information:

```typescript
const details = await fetchMovieDetails(12345)
// {
//   id, title, overview, poster_path, release_date,
//   genres, belongs_to_collection, production_companies, runtime
// }
```

**Caching:** Cached by TMDB ID for session lifetime.

#### `fetchTVDetails(tmdbId)`

Fetches detailed TV show information:

```typescript
const details = await fetchTVDetails(12345)
// {
//   id, name, overview, poster_path, first_air_date,
//   genres, production_companies, number_of_seasons, number_of_episodes
// }
```

#### `enrichMediaData(tmdbId, mediaType)`

High-level function to get enriched data for a media item:

```typescript
const data = await enrichMediaData(12345, 'movie')
// {
//   genres: ['Action', 'Adventure'],
//   collection: { id: 123, name: 'Marvel Cinematic Universe' },
//   productionCompanies: [{ id: 1, name: 'Marvel Studios' }]
// }
```

### Image URLs

Construct poster URLs using image base URL:

```typescript
function posterUrl(path: string | null, size = 'w342'): string | null {
  if (!path) return null
  return `${tmdbConfig.imageBaseUrl}/${size}${path}`
}

// Sizes: w92, w154, w185, w342, w500, w780, original
```

---

## Wikipedia API (`src/lib/wikipedia.ts`)

Wikipedia search for game information (since TMDB doesn't cover games).

### Functions

#### `searchGames(query)`

Searches Wikipedia for video game articles:

```typescript
const results = await searchGames('Elden Ring')
// [{
//   title: 'Elden Ring',
//   snippet: 'action role-playing game...',
//   image: 'https://...',
//   year: 2022,
//   score: 95  // Relevance score
// }]
```

**Features:**
- Filters results to video game articles only
- Extracts release year from article
- Fetches thumbnail images
- Calculates relevance score for ranking

### Relevance Scoring

Games are scored based on:
- Title exact match: +100
- Contains "video game" in extract: +50
- Query words in title: +30 each
- Presence of thumbnail: +10
- Presence of year: +5

---

## Google Places API (`src/lib/places.ts`)

Location search and place suggestions.

### Configuration

```typescript
// src/lib/config.ts
export const googleMapsConfig = {
  apiKey: 'YOUR_API_KEY'  // Optional - app works without it
}
```

### Functions

#### `isGoogleMapsConfigured()`

Checks if API key is available:

```typescript
if (isGoogleMapsConfigured()) {
  // Show autocomplete features
}
```

#### `searchPlaces(query, location?)`

Search for places by text:

```typescript
const results = await searchPlaces('coffee shop', { lat: 40.7, lng: -74.0 })
// [{
//   placeId: 'ChIJ...',
//   name: 'Blue Bottle Coffee',
//   address: '123 Main St',
//   location: { lat: 40.71, lng: -74.01 },
//   types: ['cafe', 'food']
// }]
```

#### `searchNearbyPlaces(location, radius?, type?)`

Search for places near a location:

```typescript
const results = await searchNearbyPlaces(
  { lat: 40.7, lng: -74.0 },
  5000,  // 5km radius
  'restaurant'
)
```

#### `getPlaceDetails(placeId)`

Get detailed place information:

```typescript
const details = await getPlaceDetails('ChIJ...')
// { name, address, phone, website, rating, hours, ... }
```

---

## Location Service (`src/lib/services/location.ts`)

Geolocation utilities using browser Geolocation API.

### Functions

#### `getCurrentPosition()`

Get user's current location:

```typescript
try {
  const position = await getCurrentPosition()
  // { lat: 40.7128, lng: -74.0060 }
} catch (e) {
  // User denied permission or unavailable
}
```

#### `watchPosition(callback)`

Watch position changes:

```typescript
const stopWatching = watchPosition((position) => {
  console.log('New position:', position)
})

// Later
stopWatching()
```

#### `reverseGeocode(lat, lng)`

Convert coordinates to address:

```typescript
const address = await reverseGeocode(40.7128, -74.0060)
// '123 Main St, New York, NY 10001'
```

---

## Search Query Parser (`src/lib/queryParser.ts`)

Custom query language for universal search.

### Syntax

| Feature | Syntax | Example |
|---------|--------|---------|
| Type filter | `@type` | `@movie`, `@tv`, `@game`, `@note`, `@place` |
| Quoted phrase | `"phrase"` | `"breaking bad"` |
| Negation | `-word` or `NOT word` | `-horror`, `NOT scary` |
| OR | `word1 OR word2` | `action OR adventure` |
| Status | `status:value` | `status:completed` |
| Rating | `rating>N` | `rating>4`, `rating>=3` |
| Year | `year:YYYY` | `year:2020`, `year>2015` |
| Genre | `genre:name` | `genre:action` |
| Creator | `by:user` | `by:Z`, `from:T` |
| Visited | `visited:yes` | `visited:no` |
| Archived | `archived:yes` | Notes only |
| Unread | `unread` | Notes only |

### Functions

#### `parseQuery(query)`

Parse query string to structured object:

```typescript
const parsed = parseQuery('@movie rating>4 "dark knight" -batman')
// {
//   types: ['movie'],
//   minRating: 5,
//   exactPhrases: ['dark knight'],
//   excludeTerms: ['batman'],
//   terms: []
// }
```

#### `matchesQuery(item, query)`

Check if item matches query, returns score:

```typescript
const score = matchesQuery(mediaItem, parsedQuery)
// 0 = no match, higher = better match
```

#### `hasSearchCriteria(query)`

Check if query has any filters:

```typescript
if (!hasSearchCriteria(parsed)) {
  // Show empty state / suggestions
}
```

#### `getFilterSummary(query)`

Get human-readable filter description:

```typescript
const summary = getFilterSummary(parsed)
// ['Type: movie', 'Rating: ≥4']
```

---

## Fuzzy Matching (`src/lib/fuzzy.ts`)

String matching for search autocomplete.

### Functions

#### `fuzzyMatch(pattern, text)`

Match pattern against text:

```typescript
const result = fuzzyMatch('brba', 'Breaking Bad')
// {
//   match: true,
//   score: 85,
//   highlights: [[0,1], [9,10]]  // Character ranges
// }
```

#### `fuzzySort(items, pattern, getText)`

Sort items by fuzzy match score:

```typescript
const sorted = fuzzySort(
  mediaItems,
  'brba',
  (item) => item.title
)
```

---

## Error Handling Pattern

All API calls follow this pattern:

```typescript
async function fetchData(): Promise<Data | null> {
  try {
    const res = await fetch(url)

    // Use === false for test compatibility
    if (res.ok === false) {
      console.warn(`API failed: ${res.status}`)
      return null
    }

    return await res.json()
  } catch (e) {
    console.error('Fetch error:', e)
    return null
  }
}
```

**Key points:**
- Check `res.ok === false` instead of `!res.ok` for test compatibility
- Log warnings/errors for debugging
- Return fallback value (null, empty array) on failure
- Don't throw - let UI handle gracefully

---

## Caching Strategy

| API | Cache Location | TTL | Invalidation |
|-----|----------------|-----|--------------|
| TMDB Genres | Memory (Map) | Session | None |
| TMDB Details | Memory (Map) | Session | None |
| Google Places | None | - | - |
| Wikipedia | None | - | - |

For offline support, Firestore data is cached automatically by Firebase SDK.

---

## YouTube Data API (`src/lib/services/youtube-sync.ts`)

Integration for syncing video queue to YouTube playlists.

### Configuration

```typescript
// src/lib/config.ts
export const youtubeAPIConfig: YouTubeAPIConfig = {
  clientId: "YOUR_CLIENT_ID",
  clientSecret: "YOUR_CLIENT_SECRET", 
  apiKey: "YOUR_API_KEY",
  redirectUri: "http://localhost:5173/oauth/youtube/callback",
  scopes: [
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/youtube.force-ssl",
  ],
}
```

### Setup Instructions

1. **Create Google Cloud Project**
   - Go to https://console.cloud.google.com
   - Create a new project or select existing one
   - Enable YouTube Data API v3

2. **Create OAuth 2.0 Credentials**
   - Go to Credentials section
   - Create OAuth 2.0 Client ID (Web application)
   - Add authorized redirect URI: `http://localhost:5173/oauth/youtube/callback` (dev) and your production URL
   - Copy Client ID and Client Secret

3. **Create API Key**
   - Create API key (optional, for public data access)
   - Restrict to YouTube Data API v3

4. **Configure App**
   - Add credentials to `src/lib/config.ts`
   - Deploy and test OAuth flow

### Functions

#### `isYouTubeAPIConfigured()`

Check if YouTube API is configured:

```typescript
if (isYouTubeAPIConfigured()) {
  // Show YouTube sync options
}
```

#### `getYouTubeAuthUrl(state?)`

Generate OAuth2 authorization URL:

```typescript
const authUrl = getYouTubeAuthUrl(csrfToken)
window.location.href = authUrl
```

#### `exchangeCodeForTokens(code)`

Exchange authorization code for tokens:

```typescript
const tokens = await exchangeCodeForTokens(authCode)
// Returns: { accessToken, refreshToken, expiresAt }
```

#### `refreshAccessToken(refreshToken)`

Refresh expired access token:

```typescript
const newTokens = await refreshAccessToken(oldRefreshToken)
```

#### `getValidAccessToken(tokens)`

Get valid token, refreshing if necessary:

```typescript
const accessToken = await getValidAccessToken(userTokens)
```

#### `fetchUserPlaylists(accessToken)`

Get user's YouTube playlists:

```typescript
const playlists = await fetchUserPlaylists(token)
// Returns: [{ id, title, description, itemCount }]
```

#### `createPlaylist(accessToken, title, description, privacyStatus)`

Create new YouTube playlist:

```typescript
const playlistId = await createPlaylist(
  token,
  "My Video Queue",
  "Synced from Couples App",
  "private"
)
```

#### `fetchPlaylistItems(accessToken, playlistId)`

Get videos in a playlist:

```typescript
const items = await fetchPlaylistItems(token, playlistId)
// Returns: [{ id, videoId, title, thumbnailUrl, position }]
```

#### `addVideoToPlaylist(accessToken, playlistId, videoId)`

Add video to playlist:

```typescript
const success = await addVideoToPlaylist(token, playlistId, videoId)
```

#### `removeVideoFromPlaylist(accessToken, playlistItemId)`

Remove video from playlist:

```typescript
const success = await removeVideoFromPlaylist(token, itemId)
```

#### `syncVideosToYouTube(accessToken, playlistId, localVideos)`

Sync local queue to YouTube playlist (one-way):

```typescript
const result = await syncVideosToYouTube(token, playlistId, videos)
// Returns: { success: boolean, errors: string[] }
```

**Sync behavior:**
- Only syncs videos with `status: "queued"`
- Adds videos in local queue but not in YouTube
- Removes videos in YouTube but not in local queue
- Does NOT sync watched/skipped videos

---

## Grayjay Integration (`src/lib/services/grayjay-sync.ts`)

Integration for Grayjay video aggregator by FUTO.

### About Grayjay

Grayjay is a privacy-focused video aggregator that allows following creators across multiple platforms. As of this implementation, Grayjay's API for external integrations is still evolving. This integration provides export-based functionality.

### Configuration

```typescript
// User preferences
videoSyncPlatform: "grayjay"
grayjayConfig: {
  enabled: true
}
```

### Integration Approaches

**Option 1: Export/Import**
- Export video queue as JSON
- Manually import into Grayjay when feature is available

**Option 2: URL List**
- Export simple list of YouTube URLs
- Manually add to Grayjay playlists

**Option 3: Clipboard Sharing**
- Copy formatted list to clipboard
- Share via messaging or paste into Grayjay

**Future: Deep Links**
- Open individual videos in Grayjay app using `grayjay://` deep links

### Functions

#### `isGrayjayConfigured(config)`

Check if Grayjay is enabled:

```typescript
if (isGrayjayConfigured(userConfig)) {
  // Show Grayjay options
}
```

#### `exportForGrayjay(videos)`

Export queue as JSON:

```typescript
const jsonData = exportForGrayjay(videos)
// Returns formatted JSON string with video data
```

#### `exportVideoUrlList(videos)`

Export as URL list:

```typescript
const urlList = exportVideoUrlList(videos)
// Returns: "https://youtube.com/...\nhttps://youtube.com/..."
```

#### `createShareableVideoList(videos)`

Create formatted shareable text:

```typescript
const text = createShareableVideoList(videos)
// Returns:
// 📺 Our Video Queue:
// 
// 1. Video Title
//    https://youtube.com/...
```

#### `downloadExportFile(data, filename, mimeType)`

Trigger browser download:

```typescript
downloadExportFile(jsonData, 'video-queue.json', 'application/json')
```

#### `copyToClipboard(text)`

Copy text to clipboard:

```typescript
const success = await copyToClipboard(shareableText)
```

#### `getGrayjayDeepLink(videoUrl)`

Generate Grayjay deep link:

```typescript
const deepLink = getGrayjayDeepLink(videoUrl)
// Returns: "grayjay://open?url=..."
window.location.href = deepLink
```

#### `getGrayjaySetupInstructions()`

Get setup instructions markdown:

```typescript
const instructions = getGrayjaySetupInstructions()
```

---

## Unified Video Sync (`src/lib/services/video-sync.ts`)

Orchestrates syncing to configured platform.

### Functions

#### `syncVideoQueue(userPreferences, videos)`

Sync to configured platform:

```typescript
const result = await syncVideoQueue(prefs, videos)
// Returns: { success, platform, message, errors?, exportData? }
```

#### `isSyncAvailable(userPreferences)`

Check if sync is ready:

```typescript
if (isSyncAvailable(prefs)) {
  // Show sync button
}
```

#### `getSyncStatusMessage(userPreferences)`

Get status message:

```typescript
const status = getSyncStatusMessage(prefs)
// Returns: "Ready to sync" | "Not connected" | etc.
```

#### `getPlatformDisplayName(platform)`

Get platform name:

```typescript
const name = getPlatformDisplayName('youtube')
// Returns: "YouTube"
```

---

## User Preferences Structure

Video sync settings are stored per-user:

```typescript
interface UserPreferences {
  // ... other preferences
  
  // Sync settings
  videoSyncPlatform?: "none" | "youtube" | "grayjay"
  
  // YouTube
  youtubeAuth?: {
    accessToken: string
    refreshToken: string
    expiresAt: number
  }
  youtubePlaylistId?: string
  
  // Grayjay
  grayjayConfig?: {
    enabled: boolean
  }
}
```

---

## Security Considerations

### YouTube OAuth
- Access tokens expire after 1 hour
- Refresh tokens used for long-term access
- Tokens stored in Firestore user preferences (encrypted at rest)
- Client secret should be kept secure (consider backend proxy for production)

### API Rate Limits
- YouTube: 10,000 quota units per day (default)
- One sync operation uses ~100-200 units depending on playlist size
- Implement debouncing/throttling for frequent syncs

### Best Practices
- Only request necessary OAuth scopes
- Implement token refresh logic
- Handle API errors gracefully
- Provide clear user feedback
- Allow users to disconnect/revoke access


# iOS Profile Picture Fix

This document describes the iOS profile picture loading fix implemented to resolve issues with alternate user profile pictures not loading correctly on iOS devices.

## Problem

On iOS devices (iPhone, iPad), when switching between users (Z ↔ T), the profile picture would sometimes:
- Not update to show the new user's picture
- Show a cached version of the previous user's picture
- Fail to load entirely

This was caused by:
1. **Aggressive iOS caching:** iOS Safari and PWAs cache images aggressively
2. **Google Drive URL format:** The old `thumbnailLink` format from Google Drive API was not reliable for cross-origin loading
3. **No cache busting:** URLs didn't change when switching users, so iOS would serve cached content

## Solution

### 1. New URL Format

Changed from Google Drive's `thumbnailLink` to a more reliable direct thumbnail URL:

**Old format:**
```
https://lh3.googleusercontent.com/d/{FILE_ID}
```

**New format:**
```
https://drive.google.com/thumbnail?id={FILE_ID}&sz=w400&timestamp={TIMESTAMP}
```

Benefits:
- More reliable CORS handling
- Better iOS compatibility
- Built-in size specification (`sz=w400`)
- Timestamp parameter for cache busting

### 2. iOS Image Utilities

Created `src/lib/ios-images.ts` with helper functions:

#### `getIOSCompatibleImageUrl(url: string): string`
Converts any Google Drive URL format to iOS-compatible thumbnail URLs with fresh timestamps.

Supported formats:
- `https://drive.google.com/uc?export=view&id={ID}`
- `https://lh3.googleusercontent.com/d/{ID}`
- `https://drive.google.com/thumbnail?id={ID}...`

```typescript
import { getIOSCompatibleImageUrl } from '$lib/ios-images'

const url = getIOSCompatibleImageUrl(profilePicture)
// Returns: https://drive.google.com/thumbnail?id=ABC&sz=w400&timestamp=1704505200000
```

#### `isIOS(): boolean`
Detects iOS devices including iPadOS.

#### `forceImageReload(imgElement: HTMLImageElement): void`
Forces an image element to reload (not currently used, but available for future needs).

#### `getCacheBustedUrl(url: string): string`
Adds timestamp to any URL for iOS cache busting.

### 3. Component Updates

Updated `Sidebar.svelte` and `PreferencesModal.svelte`:

```svelte
{#if $currentPreferences.profilePicture}
  {#key $activeUser}
    <img
      src={getIOSCompatibleImageUrl($currentPreferences.profilePicture)}
      alt={$currentPreferences.name}
      class="w-10 h-10 rounded-full object-cover ring-2 ring-accent"
    />
  {/key}
{/if}
```

The `{#key $activeUser}` block ensures the image element is recreated when switching users, forcing a fresh load.

### 4. Upload Changes

Updated `src/lib/drive.ts` to generate iOS-compatible URLs immediately upon upload:

```typescript
const timestamp = Date.now()
const publicUrl = `https://drive.google.com/thumbnail?id=${uploadData.id}&sz=w400&timestamp=${timestamp}`
```

## Testing

Run the test suite to verify:
```bash
npm run test:run -- src/lib/ios-images.test.ts
```

Tests cover:
- Converting old `uc?export=view` URLs
- Converting `googleusercontent.com` URLs
- Updating thumbnail URLs with fresh timestamps
- Handling unknown URL formats gracefully
- Handling empty strings

## Backward Compatibility

All changes are backward compatible:
- Existing profile pictures with old URLs are automatically converted
- `getIOSCompatibleImageUrl()` extracts the file ID and regenerates the URL
- Non-Google Drive URLs are passed through unchanged

## Usage

### For Developers

When displaying profile pictures, always use:
```typescript
import { getIOSCompatibleImageUrl } from '$lib/ios-images'

<img src={getIOSCompatibleImageUrl(profilePicture)} alt="Profile" />
```

### For Users

No changes needed! Profile pictures will:
- Load correctly when switching users
- Update immediately with fresh images
- Work reliably on iOS devices

## Technical Details

### Why Timestamps Work

Adding a timestamp query parameter:
```
?timestamp=1704505200000
```

Makes the browser treat it as a unique URL, bypassing the cache. Each time the URL is generated:
1. `Date.now()` provides the current timestamp
2. This makes the URL unique
3. iOS loads fresh from the network

### Why {#key} Blocks Work

In Svelte, `{#key}` blocks force component recreation when the key changes:
```svelte
{#key $activeUser}
  <img src={url} />
{/key}
```

When `$activeUser` changes from "Z" to "T":
1. The entire `<img>` element is destroyed
2. A new `<img>` element is created
3. The new URL is loaded fresh
4. No cached data from the previous user

## Performance Considerations

- **Network requests:** Each user switch may trigger a network request
- **Acceptable tradeoff:** For 2 users with small profile pictures (~50KB), this is negligible
- **Caching still works:** Within a user session, the same timestamp is used until page reload

## Future Improvements

1. **Service Worker caching:** Implement smart caching that respects user switches
2. **Preload:** Preload alternate user's picture in the background
3. **WebP format:** Use WebP for smaller file sizes
4. **Lazy loading:** Only load images when visible
5. **Progressive loading:** Show low-res placeholder while loading full image

## Related Files

- `src/lib/ios-images.ts` - Utility functions
- `src/lib/ios-images.test.ts` - Unit tests
- `src/lib/drive.ts` - Upload and URL generation
- `src/lib/components/Sidebar.svelte` - Profile picture display
- `src/lib/components/PreferencesModal.svelte` - Profile picture editor

## References

- [iOS Safari PWA Quirks (CLAUDE.md)](../CLAUDE.md#ios-safari-pwa-quirks)
- [Google Drive API - Files: get](https://developers.google.com/drive/api/v3/reference/files/get)
- [Svelte 5 - {#key} blocks](https://svelte.dev/docs/svelte/control-flow#key)

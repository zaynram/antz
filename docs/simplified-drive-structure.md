# Google Drive Integration - Updated

## Overview

The app uses **Google Drive** for storing all images with a simple, flat folder structure since the Google account is dedicated to this app.

## Folder Structure

```
Google Drive/
└── app/
    ├── img/
    │   ├── z_pfp.jpg        # Profile pictures
    │   └── t_pfp.jpg
    ├── places/              # All place photos in one folder
    │   ├── photo-1234567890.jpg
    │   ├── photo-1234567891.jpg
    │   └── photo-1234567892.jpg
    └── notes/               # All note photos in one folder
        ├── photo-1234567893.jpg
        └── photo-1234567894.jpg
```

## Key Changes

### Simplified Structure

-   **Old:** `Couples App/profile-pictures/Z.jpg`
-   **New:** `app/img/z_pfp.jpg`

-   **Old:** `Couples App/places/{placeId}/photo-123.jpg`
-   **New:** `app/places/photo-123.jpg`

-   **Old:** `Couples App/notes/{noteId}/photo-456.jpg`
-   **New:** `app/notes/photo-456.jpg`

### Benefits

-   ✅ Simpler folder hierarchy
-   ✅ Easier to find files manually
-   ✅ Shorter paths = faster lookups
-   ✅ All photos of same type in one place

## How It Works

### Profile Pictures

-   Stored as `z_pfp.jpg` and `t_pfp.jpg` in `app/img/`
-   Old picture automatically replaced on upload
-   Made publicly viewable (anyone with link)

### Place Photos

-   All stored in `app/places/` folder
-   Filename format: `photo-{timestamp}.jpg`
-   Each photo gets unique timestamp

### Note Photos

-   All stored in `app/notes/` folder
-   Filename format: `photo-{timestamp}.jpg`
-   Each photo gets unique timestamp

## Testing

After deploying, sign out and sign back in to grant Drive permissions. Then check:

1. Upload a profile picture → Check `app/img/` folder
2. Add photos to a place → Check `app/places/` folder
3. Add photos to a note → Check `app/notes/` folder

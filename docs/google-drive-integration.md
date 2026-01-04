# Google Drive Integration

## Overview

The app now uses **Google Drive** for storing all images instead of Firebase Storage. This provides:

-   ✅ 15GB free storage with your Google account
-   ✅ No billing required
-   ✅ Photos accessible directly in Drive
-   ✅ Future support for photo galleries on any content type

## How It Works

### Authentication

When users sign in with Google, we request the `drive.file` scope which allows the app to:

-   Create files it has uploaded
-   Access files it has created
-   Cannot see other files in your Drive

### Folder Structure

```
Google Drive/
└── Couples App/
    ├── profile-pictures/
    │   ├── Z.jpg
    │   └── T.jpg
    └── [future: notes/, places/, media/]
```

### Profile Pictures

-   Profile pictures are stored as `{userId}.jpg` in the `profile-pictures/` folder
-   They're made publicly viewable (anyone with link) for easy embedding
-   Old pictures are automatically replaced when uploading new ones

## Implementation Details

### Files Changed

-   **`src/lib/drive.ts`** - New Google Drive API integration

    -   `uploadFileToDrive()` - Generic file upload with folder management
    -   `deleteFileFromDrive()` - Generic file deletion
    -   `uploadProfilePicture()` - Profile picture specific upload
    -   `deleteProfilePicture()` - Profile picture specific delete

-   **`src/lib/firebase.ts`** - Updated authentication

    -   Added `drive.file` scope to GoogleAuthProvider
    -   Store OAuth access token in sessionStorage during sign-in
    -   Clear token on sign-out
    -   Export Drive upload/delete functions

-   **`src/lib/types.ts`** - Added photo support
    -   `Note.photos?: string[]` - Photo URLs for notes
    -   `Place.photos?: string[]` - Photo URLs for places
    -   `Media.photos?: string[]` - Photo URLs for media items
    -   Updated `UserPreferences.profilePicture` comment

### Access Token Management

The Google OAuth access token is stored in `sessionStorage` and is:

-   Set during Google Sign-In (when user authenticates)
-   Used for all Drive API calls
-   Cleared on sign-out
-   Required to be refreshed if session expires (user needs to sign in again)

## Testing the Integration

1. **Sign out and sign back in** - This will request the Drive scope and store the access token
2. **Upload a profile picture** - Go to Settings and upload an image
3. **Check Google Drive** - You should see a "Couples App/profile-pictures" folder

## Future Enhancements

The photo infrastructure is now in place to add galleries to:

-   **Notes** - Attach photos to memories/journal entries
-   **Places** - Add photos from your visits
-   **Media** - Add screenshots or photos related to shows/movies/games

Just use the `uploadFileToDrive()` function with different folder paths!

## Troubleshooting

**Error: "Google access token not found"**

-   Sign out and sign back in to refresh permissions

**Error: "Failed to upload file"**

-   Check that you're signed in with Google
-   Ensure you approved the Drive permission during sign-in

**Photos not displaying**

-   The URL format is: `https://drive.google.com/uc?export=view&id={fileId}`
-   Files are set to "anyone with link can view" automatically

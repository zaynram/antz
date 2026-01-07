# Video Queue Sync - User Guide

This guide explains how to sync your video queue with YouTube or export for Grayjay.

## Overview

The video queue sync feature allows you to keep your app's video queue synchronized with external platforms:

- **YouTube**: In-app OAuth authentication with token-based sync to YouTube playlist
- **Grayjay**: Export-based integration with FUTO's Grayjay app

Each user (Z & T) can configure their own sync platform independently.

---

## YouTube Integration

### What It Does

When enabled, YouTube sync:
- ✅ Adds videos marked as "queued" to your YouTube playlist
- ✅ Removes videos from the playlist when no longer queued
- ✅ Works with secure in-app authentication (Google Identity Services)
- ❌ Does NOT sync watched or skipped videos

### How It Works

**Token-Based Authentication:**
- Uses Google Identity Services for secure, in-app OAuth
- No redirect to external pages - authentication happens in a popup
- Access tokens are valid for ~1 hour
- You'll need to reconnect when the token expires (quick and easy)

### Setup Steps

1. **Administrator Configuration** (One-time Setup)
   - An app administrator needs to configure a Google OAuth Client ID
   - This is a public identifier (safe to include in the app)
   - No client secret needed - designed for client-side security
   - See `docs/api-integrations.md` for detailed setup

2. **Connect Your Account**
   - Go to Settings
   - Scroll to "Video Queue Integration"
   - Select "YouTube" as your platform
   - Click "Connect YouTube Account"
   - A popup will appear asking you to sign in with Google
   - Grant permissions for playlist access
   - Your access token is stored securely

3. **Select or Create Playlist**
   - After connecting, select which playlist to sync
   - You can create a new playlist or use an existing one
   - Recommended: Create a dedicated "Video Queue" playlist

4. **Start Syncing**
   - Go to Videos page
   - Click the YouTube sync button (🔄)
   - Videos marked as "queued" will be synced to your playlist

### Usage Tips

**Manual Sync**
- Sync happens manually when you click the button
- The sync button shows the current status
- Successful syncs show a green checkmark
- Errors are displayed with details

**What Gets Synced**
- Only videos with status "queued" are synced
- Watched and skipped videos are ignored
- If you remove a video from the app, it's removed from YouTube
- If you add a video to the app, it's added to YouTube

**Privacy**
- You can set your playlist to Private, Unlisted, or Public
- Private playlists are only visible to you
- Unlisted playlists are accessible via link
- Public playlists appear in search results

**Token Expiration**
- Access tokens expire after approximately 1 hour
- You'll see a message when your token expires
- Simply click "Connect YouTube Account" again to reconnect
- The process is quick (no need to re-grant permissions each time)
- Your playlist selection is preserved

### Troubleshooting

**"YouTube session has expired"**
- Your access token has expired (normal after ~1 hour)
- Go to Settings → Video Queue Integration
- Click "Connect YouTube Account" to get a new token
- This is a security feature to protect your account

**"Not connected to YouTube"**
- Go to Settings and connect your account
- Your session may have expired - reconnect

**"No playlist selected"**
- Select a playlist in Settings
- Or create a new one during setup

**"Sync failed"**
- Check your internet connection
- Try disconnecting and reconnecting
- Check if the playlist still exists
- Contact administrator if API is not configured

**"Some videos failed to sync"**
- Videos may have been deleted from YouTube
- Private/restricted videos may not sync
- Check sync error messages for details

---

## Grayjay Integration

### What It Is

Grayjay is a privacy-focused video aggregator by FUTO that lets you follow creators across multiple platforms (YouTube, PeerTube, Odysee, etc.) in one app.

Learn more: https://grayjay.app/

### What This Integration Does

Since Grayjay's API for external apps is still in development, this integration provides:
- ✅ Export your video queue as JSON or text
- ✅ Copy shareable video list to clipboard
- ✅ Ready for future automatic sync when Grayjay adds API

### Setup Steps

1. **Enable Grayjay Integration**
   - Go to Settings
   - Scroll to "Video Queue Integration"
   - Select "Grayjay" as your platform

2. **Install Grayjay** (Optional)
   - Download from https://grayjay.app/
   - Available for Android and Desktop
   - No installation required to use export features

### Export Options

**Option 1: JSON Export**
- Go to Videos page
- Click "Export" → "Export JSON"
- Save the `video-queue.json` file
- When Grayjay adds import feature, use this file

**Option 2: URL List**
- Click "Export" → "Export URLs"
- Get a simple text file with one URL per line
- Paste URLs into Grayjay playlists manually

**Option 3: Copy to Clipboard**
- Click "Export" → "Copy to Clipboard"
- Get a formatted list like:
  ```
  📺 Our Video Queue:
  
  1. Video Title
     https://youtube.com/watch?v=...
  ```
- Share via messaging or paste anywhere

### Usage Tips

**When to Export**
- Export before watching videos together
- Share the list with your partner
- Keep an offline backup

**JSON Format**
- Contains video titles, URLs, and metadata
- Future-proof for Grayjay import feature
- Human-readable format

**Sharing**
- Use clipboard option for quick sharing
- Send via text, email, or messaging apps
- No need to export files

### Future Enhancements

When Grayjay provides an API or import functionality:
- Automatic sync like YouTube
- Deep links to open videos in Grayjay
- Two-way sync support

---

## Switching Platforms

You can change your sync platform at any time:

1. Go to Settings
2. Change "Sync Platform" selection
3. Your videos remain unchanged
4. Previous sync connections are preserved

**Note:** Each user can choose their own platform independently.

---

## Privacy & Security

### Data Storage
- Sync preferences stored in your Firestore user profile
- YouTube tokens encrypted at rest by Firebase
- No video data shared outside your Firebase project

### Permissions
- YouTube: Read/write access to playlists only
- Does NOT access your watch history, subscriptions, or personal info
- You can revoke access anytime in Google Account settings

### Disconnect
- Go to Settings
- Click "Disconnect" button under YouTube section
- Removes stored tokens immediately
- Revoke app access in Google Account for complete cleanup

---

## FAQ

**Q: Can both Z and T use different platforms?**  
A: Yes! Each user has independent sync settings.

**Q: What happens if I delete a video from YouTube manually?**  
A: Next sync will re-add it if it's still queued in the app.

**Q: Can I sync the same video queue to both YouTube and Grayjay?**  
A: Each user can only have one platform active at a time, but you can export for Grayjay while syncing to YouTube by switching temporarily.

**Q: Does sync work offline?**  
A: No, sync requires internet connection. Exports work offline once downloaded.

**Q: How often does YouTube sync happen?**  
A: Sync is manual - click the button when you want to sync.

**Q: Will watched videos be added back to my YouTube playlist?**  
A: No, only videos marked as "queued" are synced.

**Q: Can I use a shared YouTube playlist?**  
A: Yes, if you have edit access. Both users can sync to the same playlist.

**Q: Is there a sync limit?**  
A: YouTube API has a daily quota. Normal usage (50-100 videos) is well within limits.

**Q: Can I sync to multiple playlists?**  
A: Currently, each user syncs to one playlist. You can change the target playlist in Settings.

---

## Support

For issues or questions:
1. Check this guide's troubleshooting section
2. Review API setup in `docs/api-integrations.md`
3. Contact the app administrator
4. Report bugs via GitHub Issues

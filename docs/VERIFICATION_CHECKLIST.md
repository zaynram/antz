# Verification Checklist

This checklist can be used to verify both features are working correctly.

## Prerequisites
- [ ] App is running locally (`npm dev`) or deployed
- [ ] GitHub token is configured in `src/lib/config.ts` (for GitHub issues)
- [ ] Two users (Z and T) have profile pictures uploaded (for iOS image fix)
- [ ] Testing on iOS device or simulator (for iOS-specific testing)

## GitHub Issues Feature

### Basic Functionality
- [ ] Navigate to `/debug` in the app
- [ ] "GitHub Issues" section is visible
- [ ] If token not configured, warning message appears
- [ ] If token configured, no warning appears

### Listing Issues
- [ ] Click "Refresh" button
- [ ] Issues load from GitHub repository
- [ ] Issues display with title, number, state, and update time
- [ ] Comment count shown for issues with comments
- [ ] State badge shows correct color (green for open, gray for closed)

### Filtering
- [ ] Change filter to "Open" - only open issues shown
- [ ] Change filter to "Closed" - only closed issues shown
- [ ] Change filter to "All" - both open and closed shown

### Creating Issues
- [ ] Click "New Issue" button
- [ ] Form appears with title and description fields
- [ ] Cannot submit without title (error toast appears)
- [ ] Fill in title: "Test Issue from Debug Panel"
- [ ] Fill in description: "This is a test issue to verify functionality"
- [ ] Click "Create Issue"
- [ ] Success toast appears
- [ ] Form closes
- [ ] New issue appears in list
- [ ] Verify on GitHub website that issue was created

### Viewing Issue Details
- [ ] Click on any issue in the list
- [ ] Issue details page appears
- [ ] Title and description are shown
- [ ] Creation date and author are shown
- [ ] Comments section is present
- [ ] "Back to list" button works

### Editing Issues
- [ ] Open an issue's detail view
- [ ] Click the edit (pencil) icon
- [ ] Edit form appears with current title and description
- [ ] Modify title: "Updated: {original title}"
- [ ] Modify description
- [ ] Click "Update Issue"
- [ ] Success toast appears
- [ ] Form closes
- [ ] Updated content is displayed
- [ ] Verify on GitHub that issue was updated

### Adding Comments
- [ ] Open an issue's detail view
- [ ] Scroll to "Add a comment" section
- [ ] Type: "Test comment from debug panel"
- [ ] Click "Add Comment"
- [ ] Success toast appears
- [ ] Comment appears in the comments list
- [ ] Verify on GitHub that comment was added

### Closing/Reopening Issues
- [ ] Open an open issue's detail view
- [ ] Click "Close Issue"
- [ ] Issue state updates to "closed"
- [ ] State badge changes color
- [ ] Button changes to "Reopen Issue"
- [ ] Click "Reopen Issue"
- [ ] Issue state updates to "open"
- [ ] Verify on GitHub that state changed

### Opening on GitHub
- [ ] Open any issue's detail view
- [ ] Click the external link icon (top right)
- [ ] GitHub website opens in new tab
- [ ] Correct issue is displayed

### Error Handling
- [ ] Test with invalid token (modify config.ts temporarily)
- [ ] Refresh issues - error toast should appear
- [ ] Test with network disabled
- [ ] Error toast should appear for failed operations
- [ ] All errors are user-friendly

## iOS Profile Picture Fix

### Desktop/Android Testing
- [ ] Log in as user Z
- [ ] Upload or view profile picture
- [ ] Profile picture appears in sidebar
- [ ] Profile picture appears in preferences modal
- [ ] Switch to user T
- [ ] T's profile picture appears immediately
- [ ] No flickering or cached images
- [ ] Switch back to Z
- [ ] Z's profile picture appears correctly

### iOS Testing (iPhone/iPad)
- [ ] Install app as PWA on iOS device
- [ ] Log in as user Z with profile picture
- [ ] Profile picture loads and displays correctly
- [ ] Open preferences modal - picture displays correctly
- [ ] Switch to user T (tap profile picture in sidebar)
- [ ] **CRITICAL:** T's profile picture should display immediately
- [ ] **CRITICAL:** Should NOT show Z's cached picture
- [ ] Open preferences modal - T's picture shown
- [ ] Switch back to Z
- [ ] Z's picture displays immediately
- [ ] Repeat switching multiple times rapidly
- [ ] Images should always be correct, never cached

### Upload Testing (iOS)
- [ ] On iOS device, select user Z
- [ ] Open preferences modal
- [ ] Click "Upload Photo" or "Change Photo"
- [ ] Select an image from device
- [ ] Image uploads successfully
- [ ] New image displays immediately
- [ ] Close and reopen preferences - image still correct
- [ ] Switch to T and back to Z - image still correct

### URL Format Verification
- [ ] Open browser DevTools (or Safari Web Inspector on iOS)
- [ ] View profile picture image element
- [ ] Check `src` attribute
- [ ] Should contain: `https://drive.google.com/thumbnail?id=...&sz=w400&timestamp=...`
- [ ] Timestamp should change when switching users
- [ ] No old URL formats should appear

### Legacy URL Migration
- [ ] If you have old profile pictures with legacy URLs:
  - [ ] Old `googleusercontent.com` URLs are converted automatically
  - [ ] Old `uc?export=view` URLs are converted automatically
  - [ ] Images load correctly despite old URL format in database

### Performance Testing
- [ ] Switch users 10 times rapidly
- [ ] Each switch should be smooth
- [ ] No noticeable delay in image loading
- [ ] Network tab shows reasonable number of requests
- [ ] No memory leaks (check browser task manager)

## Code Quality

### Type Checking
```bash
npm run check
```
- [ ] 0 errors
- [ ] Only pre-existing warnings (if any)

### Testing
```bash
npm run test:run
```
- [ ] All 251+ tests pass
- [ ] iOS image tests pass (5 tests)
- [ ] No new test failures

### Build
```bash
npm run build
```
- [ ] Build succeeds
- [ ] No build errors
- [ ] Only pre-existing warnings (if any)

## Documentation

- [ ] `docs/GITHUB_ISSUES.md` is complete and accurate
- [ ] `docs/IOS_IMAGE_FIX.md` is complete and accurate
- [ ] README.md is updated if needed
- [ ] Code comments are clear and helpful

## Security

- [ ] GitHub token is in config.ts (not hardcoded elsewhere)
- [ ] Token has minimal required permissions
- [ ] No tokens committed to git history
- [ ] iOS image URLs don't expose sensitive data
- [ ] Error messages don't leak sensitive information

## Cleanup

- [ ] No console errors in browser
- [ ] No console warnings (except expected ones)
- [ ] No temporary files left in repository
- [ ] All test files committed
- [ ] Documentation committed

## Sign-off

Date: _______________
Tester: _______________
Environment: _______________
Result: ☐ PASS  ☐ FAIL

Notes:
_______________________________________________________
_______________________________________________________
_______________________________________________________

# GitHub Issues Integration

This document describes the GitHub issues integration in the Debug panel.

## Setup

### 1. Get a GitHub Personal Access Token

1. Go to [GitHub Settings > Developer settings > Personal access tokens > Tokens (classic)](https://github.com/settings/tokens)
2. Click "Generate new token" → "Generate new token (classic)"
3. Give it a descriptive name (e.g., "Antz Debug Panel")
4. Select scopes:
   - For public repositories: Check `public_repo`
   - For private repositories: Check `repo` (full control)
5. Click "Generate token"
6. Copy the token (you won't be able to see it again!)

### 2. Add Token to Config

Edit `src/lib/config.ts` and add your token:

```typescript
export const githubConfig: GitHubConfig = {
    owner: "zaynram",
    repo: "antz",
    token: "ghp_your_token_here", // Paste your token here
}
```

**Note:** The token is stored in source code. For production apps, use environment variables or secure storage. This is acceptable for a personal couples app.

## Features

### Viewing Issues

1. Navigate to `/debug` in the app
2. Scroll to the "GitHub Issues" section
3. Click "Refresh" to load issues
4. Use the dropdown to filter by state:
   - **All Issues** - Show both open and closed
   - **Open** - Only open issues
   - **Closed** - Only closed issues

### Creating an Issue

1. Click "New Issue"
2. Enter a title (required)
3. Optionally add a description
4. Click "Create Issue"
5. The issue will be created and appear in the list

### Viewing Issue Details

1. Click on any issue in the list
2. View the full description, creation date, and author
3. See all comments on the issue
4. Click "Back to list" to return

### Editing an Issue

1. Open an issue's detail view
2. Click the edit icon (pencil) in the top right
3. Modify the title and/or description
4. Click "Update Issue"

### Adding Comments

1. Open an issue's detail view
2. Scroll to the "Add a comment" section at the bottom
3. Type your comment
4. Click "Add Comment"

### Closing/Reopening Issues

1. Open an issue's detail view
2. Click "Close Issue" or "Reopen Issue" button
3. The issue state will be updated

### Opening on GitHub

1. Open an issue's detail view
2. Click the external link icon in the top right
3. The issue will open on GitHub in a new tab

## Error Handling

- If the GitHub token is not configured, a warning message will be shown
- Network errors will display a toast notification
- Invalid tokens will show an authentication error
- Rate limiting is handled by the GitHub API (60 requests/hour for unauthenticated, 5000/hour for authenticated)

## Security Considerations

- **Token Exposure:** The token is stored in source code and will be included in the build. Only use this for personal/private projects.
- **Token Scopes:** Use the minimal scope required (`public_repo` for public repos)
- **Token Rotation:** Regularly rotate your token if you suspect it may have been exposed
- **Never commit tokens:** Add `config.ts` to `.gitignore` if sharing the repository publicly

## Limitations

- Pagination is prepared but not yet implemented (shows first 30 issues)
- No support for labels, assignees, or milestones
- No markdown rendering in descriptions/comments
- No image upload support in comments
- Cannot delete issues or comments (GitHub API limitation)

## Future Enhancements

- Implement full pagination
- Add markdown preview
- Support for labels and assignees
- Filter by label or author
- Search functionality
- Bulk operations
- Webhook integration for real-time updates

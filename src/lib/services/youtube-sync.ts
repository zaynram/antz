/**
 * YouTube Data API integration for syncing video queue to YouTube playlists
 * 
 * This service uses Google Identity Services for in-app OAuth authentication.
 * No client secret required - uses token-based authentication safe for client-side apps.
 * 
 * This service handles:
 * - Token-based OAuth2 authentication with YouTube (Google Identity Services)
 * - Creating and managing playlists
 * - Adding/removing videos from playlists
 * - Syncing local video queue with YouTube playlist
 */

import { youtubeAPIConfig } from "../config"
import type { Video, YouTubeAuthTokens } from "../types"

export interface YouTubePlaylist {
    id: string
    title: string
    description: string
    itemCount: number
}

export interface YouTubePlaylistItem {
    id: string
    videoId: string
    title: string
    thumbnailUrl?: string
    position: number
}

// Global reference to Google Identity Services
declare global {
    interface Window {
        google?: {
            accounts: {
                oauth2: {
                    initTokenClient: (config: {
                        client_id: string
                        scope: string
                        callback: (response: { access_token: string; expires_in: number }) => void
                        error_callback?: (error: any) => void
                    }) => {
                        requestAccessToken: (options?: { prompt?: string }) => void
                    }
                }
            }
        }
    }
}

/**
 * Check if YouTube API is configured
 */
export function isYouTubeAPIConfigured(): boolean {
    return !!(youtubeAPIConfig.clientId && youtubeAPIConfig.clientId.length > 0)
}

/**
 * Load Google Identity Services library
 */
export async function loadGoogleIdentityServices(): Promise<boolean> {
    // Check if already loaded
    if (window.google?.accounts?.oauth2) {
        return true
    }

    return new Promise((resolve) => {
        // Load the script
        const script = document.createElement('script')
        script.src = 'https://accounts.google.com/gsi/client'
        script.async = true
        script.defer = true
        script.onload = () => resolve(true)
        script.onerror = () => resolve(false)
        document.head.appendChild(script)
    })
}

/**
 * Request access token using Google Identity Services
 * Opens OAuth consent screen for user to grant permissions
 */
export async function requestAccessToken(): Promise<YouTubeAuthTokens | null> {
    if (!isYouTubeAPIConfigured()) {
        console.error("YouTube API not configured")
        return null
    }

    // Ensure Google Identity Services is loaded
    const loaded = await loadGoogleIdentityServices()
    if (!loaded || !window.google?.accounts?.oauth2) {
        console.error("Failed to load Google Identity Services")
        return null
    }

    return new Promise((resolve) => {
        const client = window.google!.accounts.oauth2.initTokenClient({
            client_id: youtubeAPIConfig.clientId,
            scope: youtubeAPIConfig.scopes.join(' '),
            callback: (response) => {
                // Calculate expiration time
                const expiresAt = Date.now() + (response.expires_in * 1000)
                
                resolve({
                    accessToken: response.access_token,
                    // Note: Token-based flow doesn't provide refresh tokens
                    // User will need to re-authenticate when token expires
                    refreshToken: "", 
                    expiresAt: expiresAt,
                })
            },
            error_callback: (error) => {
                console.error("OAuth error:", error)
                resolve(null)
            }
        })

        // Request access token (will show OAuth consent screen)
        client.requestAccessToken({ prompt: '' })
    })
}

/**
 * Get valid access token
 * For token-based flow, we don't have refresh tokens, so user needs to re-authenticate
 */
export async function getValidAccessToken(tokens: YouTubeAuthTokens): Promise<string | null> {
    // Check if token is expired or will expire in the next 5 minutes
    if (tokens.expiresAt - Date.now() < 5 * 60 * 1000) {
        // Token expired or expiring soon - need to request new token
        return null
    }
    
    return tokens.accessToken
}

/**
 * Fetch user's YouTube playlists
 */
export async function fetchUserPlaylists(accessToken: string): Promise<YouTubePlaylist[]> {
    try {
        const response = await fetch(
            "https://www.googleapis.com/youtube/v3/playlists?" +
            new URLSearchParams({
                part: "snippet,contentDetails",
                mine: "true",
                maxResults: "50",
            }),
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            }
        )

        if (response.ok === false) {
            console.error("Failed to fetch playlists:", response.status)
            return []
        }

        const data = await response.json()
        
        return data.items?.map((item: any) => ({
            id: item.id,
            title: item.snippet.title,
            description: item.snippet.description,
            itemCount: item.contentDetails.itemCount,
        })) || []
    } catch (error) {
        console.error("Error fetching playlists:", error)
        return []
    }
}

/**
 * Create a new YouTube playlist
 */
export async function createPlaylist(
    accessToken: string,
    title: string,
    description: string,
    privacyStatus: "private" | "public" | "unlisted" = "private"
): Promise<string | null> {
    try {
        const response = await fetch(
            "https://www.googleapis.com/youtube/v3/playlists?" +
            new URLSearchParams({
                part: "snippet,status",
            }),
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    snippet: {
                        title,
                        description,
                    },
                    status: {
                        privacyStatus,
                    },
                }),
            }
        )

        if (response.ok === false) {
            console.error("Failed to create playlist:", response.status)
            return null
        }

        const data = await response.json()
        return data.id
    } catch (error) {
        console.error("Error creating playlist:", error)
        return null
    }
}

/**
 * Fetch playlist items (videos)
 */
export async function fetchPlaylistItems(
    accessToken: string,
    playlistId: string
): Promise<YouTubePlaylistItem[]> {
    try {
        const response = await fetch(
            "https://www.googleapis.com/youtube/v3/playlistItems?" +
            new URLSearchParams({
                part: "snippet,contentDetails",
                playlistId,
                maxResults: "50",
            }),
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            }
        )

        if (response.ok === false) {
            console.error("Failed to fetch playlist items:", response.status)
            return []
        }

        const data = await response.json()
        
        return data.items?.map((item: any, index: number) => ({
            id: item.id,
            videoId: item.contentDetails.videoId,
            title: item.snippet.title,
            thumbnailUrl: item.snippet.thumbnails?.default?.url,
            position: index,
        })) || []
    } catch (error) {
        console.error("Error fetching playlist items:", error)
        return []
    }
}

/**
 * Add video to YouTube playlist
 */
export async function addVideoToPlaylist(
    accessToken: string,
    playlistId: string,
    videoId: string
): Promise<boolean> {
    try {
        const response = await fetch(
            "https://www.googleapis.com/youtube/v3/playlistItems?" +
            new URLSearchParams({
                part: "snippet",
            }),
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    snippet: {
                        playlistId,
                        resourceId: {
                            kind: "youtube#video",
                            videoId,
                        },
                    },
                }),
            }
        )

        if (response.ok === false) {
            console.error("Failed to add video to playlist:", response.status)
            return false
        }

        return true
    } catch (error) {
        console.error("Error adding video to playlist:", error)
        return false
    }
}

/**
 * Remove video from YouTube playlist
 */
export async function removeVideoFromPlaylist(
    accessToken: string,
    playlistItemId: string
): Promise<boolean> {
    try {
        const response = await fetch(
            "https://www.googleapis.com/youtube/v3/playlistItems?" +
            new URLSearchParams({
                id: playlistItemId,
            }),
            {
                method: "DELETE",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            }
        )

        if (response.ok === false) {
            console.error("Failed to remove video from playlist:", response.status)
            return false
        }

        return true
    } catch (error) {
        console.error("Error removing video from playlist:", error)
        return false
    }
}

/**
 * Sync local video queue to YouTube playlist
 * This is a one-way sync: local -> YouTube
 */
export async function syncVideosToYouTube(
    accessToken: string,
    playlistId: string,
    localVideos: Video[]
): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = []
    
    try {
        // Fetch current playlist items
        const playlistItems = await fetchPlaylistItems(accessToken, playlistId)
        const playlistVideoIds = new Set(playlistItems.map(item => item.videoId))
        
        // Get local queued videos (only sync queued videos)
        const queuedVideos = localVideos.filter(v => v.status === "queued")
        const localVideoIds = new Set(queuedVideos.map(v => v.videoId))
        
        // Add videos that are in local queue but not in YouTube playlist
        for (const video of queuedVideos) {
            if (!playlistVideoIds.has(video.videoId)) {
                const success = await addVideoToPlaylist(accessToken, playlistId, video.videoId)
                if (!success) {
                    errors.push(`Failed to add video: ${video.title}`)
                }
            }
        }
        
        // Remove videos that are in YouTube playlist but not in local queue
        for (const item of playlistItems) {
            if (!localVideoIds.has(item.videoId)) {
                const success = await removeVideoFromPlaylist(accessToken, item.id)
                if (!success) {
                    errors.push(`Failed to remove video: ${item.title}`)
                }
            }
        }
        
        return { success: errors.length === 0, errors }
    } catch (error) {
        console.error("Error syncing videos to YouTube:", error)
        return { 
            success: false, 
            errors: [`Sync failed: ${error instanceof Error ? error.message : "Unknown error"}`] 
        }
    }
}

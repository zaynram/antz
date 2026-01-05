/**
 * YouTube Data API integration for syncing video queue to YouTube playlists
 * 
 * This service handles:
 * - OAuth2 authentication with YouTube
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

/**
 * Check if YouTube API is configured
 */
export function isYouTubeAPIConfigured(): boolean {
    return !!(youtubeAPIConfig.clientId && youtubeAPIConfig.apiKey)
}

/**
 * Generate OAuth2 authorization URL for YouTube
 */
export function getYouTubeAuthUrl(state?: string): string {
    if (!isYouTubeAPIConfigured()) {
        throw new Error("YouTube API not configured")
    }

    const params = new URLSearchParams({
        client_id: youtubeAPIConfig.clientId,
        redirect_uri: youtubeAPIConfig.redirectUri,
        response_type: "code",
        scope: youtubeAPIConfig.scopes.join(" "),
        access_type: "offline", // Get refresh token
        prompt: "consent", // Force consent screen to get refresh token
        state: state || "", // CSRF protection token
    })

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

/**
 * Exchange authorization code for access and refresh tokens
 */
export async function exchangeCodeForTokens(code: string): Promise<YouTubeAuthTokens | null> {
    try {
        const response = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
                code,
                client_id: youtubeAPIConfig.clientId,
                client_secret: youtubeAPIConfig.clientSecret,
                redirect_uri: youtubeAPIConfig.redirectUri,
                grant_type: "authorization_code",
            }),
        })

        if (response.ok === false) {
            console.error("Failed to exchange code for tokens:", response.status)
            return null
        }

        const data = await response.json()
        
        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: Date.now() + (data.expires_in * 1000),
        }
    } catch (error) {
        console.error("Error exchanging code for tokens:", error)
        return null
    }
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<YouTubeAuthTokens | null> {
    try {
        const response = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
                refresh_token: refreshToken,
                client_id: youtubeAPIConfig.clientId,
                client_secret: youtubeAPIConfig.clientSecret,
                grant_type: "refresh_token",
            }),
        })

        if (response.ok === false) {
            console.error("Failed to refresh access token:", response.status)
            return null
        }

        const data = await response.json()
        
        return {
            accessToken: data.access_token,
            refreshToken: refreshToken, // Keep the same refresh token
            expiresAt: Date.now() + (data.expires_in * 1000),
        }
    } catch (error) {
        console.error("Error refreshing access token:", error)
        return null
    }
}

/**
 * Get valid access token, refreshing if necessary
 */
export async function getValidAccessToken(tokens: YouTubeAuthTokens): Promise<string | null> {
    // Check if token is expired or will expire in the next 5 minutes
    if (tokens.expiresAt - Date.now() < 5 * 60 * 1000) {
        const refreshed = await refreshAccessToken(tokens.refreshToken)
        if (!refreshed) {
            return null
        }
        // Note: Caller should update the stored tokens
        return refreshed.accessToken
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

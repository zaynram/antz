/**
 * Unified video sync service
 * Orchestrates syncing video queue to configured platforms (YouTube, Grayjay)
 */

import type { Video, UserPreferences } from "../types"
import * as YouTubeSync from "./youtube-sync"
import * as GrayjaySync from "./grayjay-sync"

export interface SyncResult {
    success: boolean
    platform: "youtube" | "grayjay" | "none"
    message: string
    errors?: string[]
    exportData?: string
}

/**
 * Sync video queue to the user's configured platform
 */
export async function syncVideoQueue(
    userPreferences: UserPreferences,
    videos: Video[]
): Promise<SyncResult> {
    const platform = userPreferences.videoSyncPlatform || "none"
    
    switch (platform) {
        case "youtube":
            return await syncToYouTube(userPreferences, videos)
        
        case "grayjay":
            return await syncToGrayjay(userPreferences, videos)
        
        case "none":
        default:
            return {
                success: true,
                platform: "none",
                message: "No sync platform configured",
            }
    }
}

/**
 * Sync to YouTube
 */
async function syncToYouTube(
    userPreferences: UserPreferences,
    videos: Video[]
): Promise<SyncResult> {
    // Check if YouTube is configured
    if (!YouTubeSync.isYouTubeAPIConfigured()) {
        return {
            success: false,
            platform: "youtube",
            message: "YouTube API is not configured. Please contact the administrator.",
        }
    }
    
    // Check if user has authenticated
    if (!userPreferences.youtubeAuth) {
        return {
            success: false,
            platform: "youtube",
            message: "Please connect your YouTube account in settings.",
        }
    }
    
    // Check if playlist is selected
    if (!userPreferences.youtubePlaylistId) {
        return {
            success: false,
            platform: "youtube",
            message: "Please select a YouTube playlist in settings.",
        }
    }
    
    try {
        // Get valid access token (refresh if needed)
        const accessToken = await YouTubeSync.getValidAccessToken(userPreferences.youtubeAuth)
        if (!accessToken) {
            return {
                success: false,
                platform: "youtube",
                message: "Failed to refresh YouTube authentication. Please reconnect your account.",
            }
        }
        
        // Perform sync
        const result = await YouTubeSync.syncVideosToYouTube(
            accessToken,
            userPreferences.youtubePlaylistId,
            videos
        )
        
        return {
            success: result.success,
            platform: "youtube",
            message: result.success 
                ? "Successfully synced to YouTube playlist" 
                : "Sync completed with errors",
            errors: result.errors.length > 0 ? result.errors : undefined,
        }
    } catch (error) {
        console.error("Error syncing to YouTube:", error)
        return {
            success: false,
            platform: "youtube",
            message: `Sync failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        }
    }
}

/**
 * Sync to Grayjay
 */
async function syncToGrayjay(
    userPreferences: UserPreferences,
    videos: Video[]
): Promise<SyncResult> {
    if (!userPreferences.grayjayConfig) {
        return {
            success: false,
            platform: "grayjay",
            message: "Grayjay integration is not configured.",
        }
    }
    
    const result = await GrayjaySync.syncVideosToGrayjay(
        userPreferences.grayjayConfig,
        videos
    )
    
    return {
        success: result.success,
        platform: "grayjay",
        message: result.message,
        exportData: result.exportData,
    }
}

/**
 * Get platform display name
 */
export function getPlatformDisplayName(platform: "youtube" | "grayjay" | "none"): string {
    switch (platform) {
        case "youtube":
            return "YouTube"
        case "grayjay":
            return "Grayjay"
        case "none":
        default:
            return "None"
    }
}

/**
 * Check if sync is available for the current configuration
 */
export function isSyncAvailable(userPreferences: UserPreferences): boolean {
    const platform = userPreferences.videoSyncPlatform || "none"
    
    switch (platform) {
        case "youtube":
            return !!(
                YouTubeSync.isYouTubeAPIConfigured() &&
                userPreferences.youtubeAuth &&
                userPreferences.youtubePlaylistId
            )
        
        case "grayjay":
            return GrayjaySync.isGrayjayConfigured(userPreferences.grayjayConfig)
        
        case "none":
        default:
            return false
    }
}

/**
 * Get sync status message
 */
export function getSyncStatusMessage(userPreferences: UserPreferences): string {
    const platform = userPreferences.videoSyncPlatform || "none"
    
    switch (platform) {
        case "youtube":
            if (!YouTubeSync.isYouTubeAPIConfigured()) {
                return "YouTube API not configured"
            }
            if (!userPreferences.youtubeAuth) {
                return "Not connected to YouTube"
            }
            if (!userPreferences.youtubePlaylistId) {
                return "No playlist selected"
            }
            return "Ready to sync"
        
        case "grayjay":
            if (!GrayjaySync.isGrayjayConfigured(userPreferences.grayjayConfig)) {
                return "Grayjay not configured"
            }
            return "Ready to export"
        
        case "none":
        default:
            return "Sync disabled"
    }
}

/**
 * Grayjay integration for syncing video queue
 * 
 * Grayjay is a plugin-based video aggregator by FUTO. This service provides
 * a framework for potential integration with Grayjay's plugin system.
 * 
 * Note: As of this implementation, Grayjay's API/plugin system for external
 * integrations is still evolving. This serves as a foundation for future
 * integration when more documentation becomes available.
 * 
 * Potential integration approaches:
 * 1. Custom Grayjay plugin that reads from our Firebase
 * 2. Export/import playlist functionality
 * 3. Deep linking to Grayjay app
 * 4. Future Grayjay API when available
 */

import type { Video, GrayjayConfig } from "../types"

export interface GrayjayPlaylist {
    id: string
    name: string
    videos: GrayjayVideo[]
}

export interface GrayjayVideo {
    id: string
    title: string
    url: string
    thumbnailUrl?: string
}

/**
 * Check if Grayjay integration is configured and enabled
 */
export function isGrayjayConfigured(config?: GrayjayConfig): boolean {
    return config?.enabled === true
}

/**
 * Generate a Grayjay deep link for a video
 * Deep links allow opening videos directly in Grayjay app
 */
export function getGrayjayDeepLink(videoUrl: string): string {
    // Grayjay supports YouTube URLs directly
    // Format: grayjay://open?url=<encoded_url>
    const encodedUrl = encodeURIComponent(videoUrl)
    return `grayjay://open?url=${encodedUrl}`
}

/**
 * Export video queue to a format compatible with Grayjay
 * This creates a JSON structure that can be imported into Grayjay
 */
export function exportForGrayjay(videos: Video[]): string {
    const queuedVideos = videos.filter(v => v.status === "queued")
    
    const exportData = {
        version: "1.0",
        source: "Couples App Video Queue",
        exportDate: new Date().toISOString(),
        videos: queuedVideos.map(v => ({
            id: v.videoId,
            title: v.title,
            url: v.url,
            thumbnailUrl: v.thumbnailUrl,
            addedBy: v.createdBy,
            addedAt: v.createdAt.toDate().toISOString(),
        })),
    }
    
    return JSON.stringify(exportData, null, 2)
}

/**
 * Generate a text file with video URLs for manual import
 * This creates a simple list of YouTube URLs, one per line
 */
export function exportVideoUrlList(videos: Video[]): string {
    const queuedVideos = videos.filter(v => v.status === "queued")
    return queuedVideos.map(v => v.url).join("\n")
}

/**
 * Create a shareable text with video queue information
 * Useful for sharing via clipboard or messaging
 */
export function createShareableVideoList(videos: Video[]): string {
    const queuedVideos = videos.filter(v => v.status === "queued")
    
    let text = "📺 Our Video Queue:\n\n"
    queuedVideos.forEach((v, index) => {
        text += `${index + 1}. ${v.title}\n   ${v.url}\n\n`
    })
    
    return text
}

/**
 * Sync videos to Grayjay (placeholder for future implementation)
 * 
 * Current approach: Generate export file that user can manually import
 * Future approach: Direct API integration when available
 */
export async function syncVideosToGrayjay(
    config: GrayjayConfig,
    videos: Video[]
): Promise<{ success: boolean; exportData?: string; message: string }> {
    if (!isGrayjayConfigured(config)) {
        return {
            success: false,
            message: "Grayjay integration is not enabled",
        }
    }
    
    try {
        // For now, generate export data that user can manually import
        const exportData = exportForGrayjay(videos)
        
        return {
            success: true,
            exportData,
            message: "Export generated. Please import this file into Grayjay manually.",
        }
    } catch (error) {
        console.error("Error generating Grayjay export:", error)
        return {
            success: false,
            message: `Export failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        }
    }
}

/**
 * Instructions for manual Grayjay setup
 */
export function getGrayjaySetupInstructions(): string {
    return `
# Setting up Grayjay Integration

Grayjay is a privacy-focused video aggregator by FUTO. To use your video queue with Grayjay:

## Option 1: Deep Links (Recommended)
1. Enable Grayjay integration in settings
2. Click the Grayjay icon next to any video to open it directly in Grayjay app

## Option 2: Manual Export/Import
1. Click "Export for Grayjay" button
2. Save the generated JSON file
3. In Grayjay app, use the import playlist feature (when available)

## Option 3: URL List
1. Click "Export URL List" to get a simple list of video URLs
2. Add these URLs manually to your Grayjay playlist

## Future Integration
When Grayjay provides an API for external integrations, this app will support automatic syncing.

Learn more about Grayjay: https://grayjay.app/
`.trim()
}

/**
 * Download export data as a file
 * Helper function for browser download
 */
export function downloadExportFile(data: string, filename: string, mimeType: string = "application/json"): void {
    const blob = new Blob([data], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setTimeout(() => URL.revokeObjectURL(url), 100)
}

/**
 * Copy text to clipboard
 * Helper function for sharing
 */
export async function copyToClipboard(text: string): Promise<boolean> {
    try {
        // Modern Clipboard API (preferred)
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text)
            return true
        }
        
        // Fallback for browsers without Clipboard API
        // Create temporary textarea element
        const textarea = document.createElement("textarea")
        textarea.value = text
        
        // Make it invisible but still focusable
        textarea.style.position = "fixed"
        textarea.style.top = "0"
        textarea.style.left = "0"
        textarea.style.width = "2em"
        textarea.style.height = "2em"
        textarea.style.padding = "0"
        textarea.style.border = "none"
        textarea.style.outline = "none"
        textarea.style.boxShadow = "none"
        textarea.style.background = "transparent"
        textarea.style.opacity = "0"
        
        document.body.appendChild(textarea)
        
        // Select and attempt to copy
        textarea.focus()
        textarea.select()
        
        let success = false
        try {
            // Try the old method (deprecated but needed for older browsers)
            success = document.execCommand("copy")
            if (!success) {
                console.warn("Clipboard API not available and execCommand('copy') failed")
            }
        } catch (err) {
            console.warn("Copy fallback failed - Clipboard API not supported:", err)
        }
        
        document.body.removeChild(textarea)
        return success
    } catch (error) {
        console.error("Failed to copy to clipboard:", error)
        return false
    }
}

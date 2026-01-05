/**
 * YouTube utility functions for video URL parsing and metadata extraction
 */

export interface YouTubeVideoInfo {
    videoId: string
    url: string
}

/**
 * Extract YouTube video ID from various URL formats
 * Supports:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://www.youtube.com/v/VIDEO_ID
 */
export function parseYouTubeUrl(url: string): YouTubeVideoInfo | null {
    try {
        const urlObj = new URL(url)
        let videoId: string | null = null

        // Standard youtube.com URLs
        if (
            urlObj.hostname === "www.youtube.com" ||
            urlObj.hostname === "youtube.com" ||
            urlObj.hostname === "m.youtube.com"
        ) {
            // watch?v=VIDEO_ID
            if (urlObj.pathname === "/watch") {
                videoId = urlObj.searchParams.get("v")
            }
            // embed/VIDEO_ID or v/VIDEO_ID
            else if (urlObj.pathname.startsWith("/embed/") || urlObj.pathname.startsWith("/v/")) {
                videoId = urlObj.pathname.split("/")[2]
            }
        }
        // youtu.be short URLs
        else if (urlObj.hostname === "youtu.be") {
            videoId = urlObj.pathname.substring(1)
        }

        if (videoId) {
            return {
                videoId,
                url: `https://www.youtube.com/watch?v=${videoId}`,
            }
        }

        return null
    } catch (e) {
        return null
    }
}

/**
 * Get YouTube video thumbnail URL
 */
export function getYouTubeThumbnail(videoId: string): string {
    return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
}

/**
 * Get YouTube video embed URL
 */
export function getYouTubeEmbedUrl(videoId: string): string {
    return `https://www.youtube.com/embed/${videoId}`
}

/**
 * Validate if a string is a valid YouTube URL
 */
export function isYouTubeUrl(url: string): boolean {
    return parseYouTubeUrl(url) !== null
}

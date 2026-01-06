/**
 * Utility functions for iOS-specific image handling
 */

/**
 * Convert old Google Drive URLs to iOS-compatible thumbnail URLs
 * Handles both thumbnailLink and uc?export=view formats
 * For GIFs, uses uc?export=view to preserve animation
 */
export function getIOSCompatibleImageUrl(url: string): string {
    if (!url) return url

    // Extract file ID from various Google Drive URL formats
    let fileId: string | null = null

    // Format 1: https://drive.google.com/uc?export=view&id=FILE_ID
    if (url.includes("drive.google.com")) {
        const ucMatch = url.match(/[?&]id=([^&]+)/)
        if (ucMatch) {
            fileId = ucMatch[1]
        }
    }

    // Format 2: https://lh3.googleusercontent.com/d/FILE_ID
    if (!fileId && url.includes("googleusercontent.com")) {
        const googleUserContentMatch = url.match(/googleusercontent\.com\/d\/([^/?]+)/)
        if (googleUserContentMatch) {
            fileId = googleUserContentMatch[1]
        }
    }

    // Format 3: Direct file ID check in thumbnail URL
    if (!fileId && url.includes("drive.google.com/thumbnail")) {
        const thumbnailMatch = url.match(/thumbnail\?id=([^&]+)/)
        if (thumbnailMatch) {
            fileId = thumbnailMatch[1]
        }
    }

    // If we found a file ID, return iOS-compatible URL
    if (fileId) {
        const timestamp = Date.now()
        
        // Check if this is a GIF based on:
        // 1. The ext parameter in the URL (added by uploadFileToDrive)
        // 2. Filename hints in the URL
        const extMatch = url.match(/[?&]ext=([^&]+)/)
        const extension = extMatch ? extMatch[1].toLowerCase() : ''
        const isGif = extension === 'gif' || 
                      url.toLowerCase().includes('.gif') || 
                      url.toLowerCase().includes('_pfp.gif')
        
        if (isGif) {
            // Use uc?export=view for GIFs to preserve animation
            return `https://drive.google.com/uc?export=view&id=${fileId}&timestamp=${timestamp}`
        } else {
            // Use thumbnail endpoint for other images (better performance)
            return `https://drive.google.com/thumbnail?id=${fileId}&sz=w400&timestamp=${timestamp}`
        }
    }

    // Return original URL if no file ID found
    return url
}

/**
 * Check if running on iOS (including iPadOS)
 */
export function isIOS(): boolean {
    if (typeof navigator === "undefined") return false

    return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
           (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
}

/**
 * Force image reload on iOS to prevent caching issues
 * Call this when switching between users
 */
export function forceImageReload(imgElement: HTMLImageElement): void {
    if (!isIOS()) return

    const src = imgElement.src
    imgElement.src = ""
    // Use requestAnimationFrame to ensure the browser processes the change
    requestAnimationFrame(() => {
        imgElement.src = src
    })
}

/**
 * Get a cache-busted URL for iOS
 * Adds a timestamp query parameter to prevent aggressive caching
 */
export function getCacheBustedUrl(url: string): string {
    if (!isIOS() || !url) return url

    const separator = url.includes("?") ? "&" : "?"
    return `${url}${separator}_t=${Date.now()}`
}

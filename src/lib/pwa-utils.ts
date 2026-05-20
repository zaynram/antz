/**
 * Utilities for iOS Safari PWA-specific workarounds.
 */

/**
 * True when running on iOS/iPadOS Safari in standalone (PWA) mode.
 * Only evaluate once at module load time since device/mode doesn't change.
 */
export const isIOSPWA: boolean =
    typeof navigator !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    typeof window !== 'undefined' &&
    window.matchMedia('(display-mode: standalone)').matches

/**
 * Force a CSS repaint on iOS Safari PWA to work around rendering bugs where
 * conditional content may not visually appear despite the DOM having updated.
 * No-ops on non-iOS or non-PWA environments.
 */
export function forceRepaint(): void {
    if (!isIOSPWA) return
    requestAnimationFrame(() => {
        document.body.style.transform = 'translateZ(0)'
        requestAnimationFrame(() => {
            document.body.style.transform = ''
        })
    })
}

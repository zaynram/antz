/**
 * Haptic feedback utility for touch devices
 * Uses the Vibration API when available
 */

// Check if vibration is supported
const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator

/**
 * Light haptic feedback - for small interactions like toggles
 */
export function hapticLight(): void {
  if (canVibrate) {
    navigator.vibrate(10)
  }
}

/**
 * Medium haptic feedback - for meaningful actions like adding/removing items
 */
export function hapticMedium(): void {
  if (canVibrate) {
    navigator.vibrate(25)
  }
}

/**
 * Success haptic feedback - for completed actions
 */
export function hapticSuccess(): void {
  if (canVibrate) {
    navigator.vibrate([15, 50, 15])
  }
}

/**
 * Error/warning haptic feedback
 */
export function hapticError(): void {
  if (canVibrate) {
    navigator.vibrate([50, 30, 50])
  }
}

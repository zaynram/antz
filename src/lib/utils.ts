/**
 * Shared utility functions used across multiple components.
 */

/**
 * Cycle a half-star rating for a given star position.
 *
 * Transition sequence: null → half → full → null
 *
 * @param current - The current rating value for this user.
 * @param starIndex - The 1-based star being interacted with (1–5).
 * @returns The new rating value, or null to clear the rating.
 */
export function cycleRating(current: number | null, starIndex: number): number | null {
    const halfValue = starIndex - 0.5
    const fullValue = starIndex

    if (current === halfValue) {
        return fullValue // half → full
    } else if (current === fullValue) {
        return null // full → clear
    } else {
        return halfValue // anything else → half
    }
}

/**
 * Determine the fill state of a star in a half-star rating display.
 *
 * @param rating - The current rating value (supports halves, e.g. 3.5).
 * @param starIndex - The 1-based star position to evaluate (1–5).
 * @returns `'full'`, `'half'`, or `'empty'`.
 */
export function getStarFill(rating: number | null, starIndex: number): 'full' | 'half' | 'empty' {
    if (rating === null) return 'empty'
    if (rating >= starIndex) return 'full'
    if (rating >= starIndex - 0.5) return 'half'
    return 'empty'
}

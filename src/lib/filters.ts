/**
 * Media filtering and sorting utilities.
 * Designed for couples app use case - optimizing for quick decision-making
 * around "what should we watch/play together"
 */

import type { Media, MediaStatus, MediaType, UserId } from './types'
import { getDisplayRating } from './types'

// ─────────────────────────────────────────────────────────────────
// Filter Types
// ─────────────────────────────────────────────────────────────────

export interface MediaFilters {
    status: MediaStatus | 'all'
    type: MediaType | 'all'
    genres: string[] // Empty = all genres
    addedBy: UserId | 'all'
    hasRating: boolean | null // null = any, true = rated, false = unrated
    releaseDecade: number | null // e.g., 2020 for 2020s
    hasCollection: boolean | null // null = any
}

export type SortField = 
    | 'dateAdded' 
    | 'title' 
    | 'rating' 
    | 'releaseDate' 
    | 'watchDate'

export type SortDirection = 'asc' | 'desc'

export interface SortConfig {
    field: SortField
    direction: SortDirection
}

// ─────────────────────────────────────────────────────────────────
// Default Values
// ─────────────────────────────────────────────────────────────────

export const DEFAULT_FILTERS: MediaFilters = {
    status: 'all',
    type: 'all',
    genres: [],
    addedBy: 'all',
    hasRating: null,
    releaseDecade: null,
    hasCollection: null,
}

export const DEFAULT_SORT: SortConfig = {
    field: 'dateAdded',
    direction: 'desc',
}

// ─────────────────────────────────────────────────────────────────
// Filter Functions
// ─────────────────────────────────────────────────────────────────

export function applyFilters(media: Media[], filters: MediaFilters): Media[] {
    return media.filter(item => {
        // Status filter
        if (filters.status !== 'all' && item.status !== filters.status) {
            return false
        }

        // Type filter
        if (filters.type !== 'all' && item.type !== filters.type) {
            return false
        }

        // Genre filter (any match)
        if (filters.genres.length > 0) {
            const itemGenres = item.genres ?? []
            const hasMatchingGenre = filters.genres.some(g => 
                itemGenres.some(ig => ig.toLowerCase() === g.toLowerCase())
            )
            if (!hasMatchingGenre) return false
        }

        // Added by filter
        if (filters.addedBy !== 'all' && item.createdBy !== filters.addedBy) {
            return false
        }

        // Has rating filter
        if (filters.hasRating !== null) {
            const rating = getDisplayRating(item)
            const isRated = rating !== null
            if (filters.hasRating !== isRated) return false
        }

        // Release decade filter
        if (filters.releaseDecade !== null && item.releaseDate) {
            const year = parseInt(item.releaseDate.split('-')[0], 10)
            const decade = Math.floor(year / 10) * 10
            if (decade !== filters.releaseDecade) return false
        }

        // Has collection filter
        if (filters.hasCollection !== null) {
            const hasCollection = item.collection !== null && item.collection !== undefined
            if (filters.hasCollection !== hasCollection) return false
        }

        return true
    })
}

// ─────────────────────────────────────────────────────────────────
// Sort Functions
// ─────────────────────────────────────────────────────────────────

export function applySort(media: Media[], sort: SortConfig): Media[] {
    const sorted = [...media]
    const dir = sort.direction === 'asc' ? 1 : -1

    sorted.sort((a, b) => {
        switch (sort.field) {
            case 'title':
                return dir * a.title.localeCompare(b.title)

            case 'rating': {
                const rA = getDisplayRating(a) ?? 0
                const rB = getDisplayRating(b) ?? 0
                // When descending, higher ratings first
                return dir * (rA - rB)
            }

            case 'releaseDate': {
                const dateA = a.releaseDate ?? ''
                const dateB = b.releaseDate ?? ''
                return dir * dateA.localeCompare(dateB)
            }

            case 'watchDate': {
                const msA = a.watchDate?.toMillis() ?? 0
                const msB = b.watchDate?.toMillis() ?? 0
                return dir * (msA - msB)
            }

            case 'dateAdded':
            default: {
                const msA = a.createdAt?.toMillis() ?? 0
                const msB = b.createdAt?.toMillis() ?? 0
                return dir * (msA - msB)
            }
        }
    })

    return sorted
}

// ─────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────

/** Extract unique genres from media collection */
export function extractGenres(media: Media[]): string[] {
    const genreSet = new Set<string>()
    for (const item of media) {
        for (const genre of item.genres ?? []) {
            genreSet.add(genre)
        }
    }
    return Array.from(genreSet).sort()
}

/** Extract unique release decades from media collection */
export function extractDecades(media: Media[]): number[] {
    const decadeSet = new Set<number>()
    for (const item of media) {
        if (item.releaseDate) {
            const year = parseInt(item.releaseDate.split('-')[0], 10)
            if (!isNaN(year)) {
                decadeSet.add(Math.floor(year / 10) * 10)
            }
        }
    }
    return Array.from(decadeSet).sort((a, b) => b - a) // newest first
}

/** Check if any non-default filters are active */
export function hasActiveFilters(filters: MediaFilters): boolean {
    return (
        filters.status !== 'all' ||
        filters.type !== 'all' ||
        filters.genres.length > 0 ||
        filters.addedBy !== 'all' ||
        filters.hasRating !== null ||
        filters.releaseDecade !== null ||
        filters.hasCollection !== null
    )
}

/** Count active filter dimensions */
export function countActiveFilters(filters: MediaFilters): number {
    let count = 0
    if (filters.status !== 'all') count++
    if (filters.type !== 'all') count++
    if (filters.genres.length > 0) count++
    if (filters.addedBy !== 'all') count++
    if (filters.hasRating !== null) count++
    if (filters.releaseDecade !== null) count++
    if (filters.hasCollection !== null) count++
    return count
}

/** Format decade for display */
export function formatDecade(decade: number): string {
    return `${decade}s`
}

/** Get short sort label for UI */
export function getSortLabel(sort: SortConfig): string {
    const labels: Record<SortField, string> = {
        dateAdded: 'Added',
        title: 'Title',
        rating: 'Rating',
        releaseDate: 'Released',
        watchDate: 'Watched',
    }
    const arrow = sort.direction === 'asc' ? '↑' : '↓'
    return `${labels[sort.field]} ${arrow}`
}

import type { Timestamp } from "firebase/firestore"

export type UserId = "Z" | "T"

export type Theme = "light" | "dark"

export interface UserPreferences {
    theme: Theme
    accentColor: string
    name: string
}

export type UserPreferencesMap = Record<UserId, UserPreferences>

export interface BaseDocument {
    id?: string
    createdBy: UserId
    createdAt: Timestamp
    updatedAt: Timestamp
    updatedBy?: UserId
}

export interface Note extends BaseDocument {
    type: "note"
    title: string
    content: string
    tags: string[]
    read?: boolean
    readAt?: Timestamp
    archived?: boolean
}

export type MediaType = "tv" | "movie" | "game"
export type MediaStatus = "queued" | "watching" | "completed" | "dropped"

export interface MediaProgress {
    season?: number
    episode?: number
}

export interface MediaComment {
    id: string
    text: string
    createdBy: UserId
    createdAt: Timestamp
}

export interface Media extends BaseDocument {
    type: MediaType
    tmdbId?: number
    title: string
    posterPath: string | null
    releaseDate?: string
    overview?: string
    status: MediaStatus
    rating: number | null // Legacy field for backward compatibility
    ratings?: Record<UserId, number | null> // Per-user ratings
    notes: string
    progress?: MediaProgress
    // New metadata fields
    genres?: string[]
    watchDate?: Timestamp
    comments?: MediaComment[]
}

// Helper functions for ratings
export function getUserRating(media: Media, userId: UserId): number | null {
    // First check new ratings structure
    if (media.ratings && userId in media.ratings) {
        return media.ratings[userId];
    }
    // Fallback to legacy rating field
    return media.rating ?? null;
}

export function getAverageRating(media: Media): number | null {
    if (media.ratings) {
        const ratingZ = media.ratings.Z;
        const ratingT = media.ratings.T;
        
        // Both users have rated
        if (ratingZ !== null && ratingZ !== undefined && 
            ratingT !== null && ratingT !== undefined) {
            return (ratingZ + ratingT) / 2;
        }
        
        // Only one user has rated
        if (ratingZ !== null && ratingZ !== undefined) return ratingZ;
        if (ratingT !== null && ratingT !== undefined) return ratingT;
    }
    
    // Fallback to legacy rating
    return media.rating ?? null;
}

export function getDisplayRating(media: Media): number | null {
    // Priority: average of both ratings > individual rating > legacy rating
    return getAverageRating(media);
}

export type PlaceCategory = "restaurant" | "cafe" | "bar" | "attraction" | "park" | "other"

export interface Place extends BaseDocument {
    name: string
    category: PlaceCategory
    notes: string
    visited: boolean
    visitDates: Timestamp[]
    rating: number | null
}

export interface TMDBSearchResult {
    id: number
    media_type: "movie" | "tv"
    title?: string
    name?: string
    poster_path: string | null
    release_date?: string
    first_air_date?: string
    overview: string
    genre_ids?: number[]
}

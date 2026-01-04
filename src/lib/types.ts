import type { Timestamp } from "firebase/firestore"

export type UserId = "Z" | "T"

export type Theme = "light" | "dark"

export type LocationMode = "auto" | "manual" | "off"

export interface GeoLocation {
    lat: number
    lng: number
    address?: string
}

export interface UserPreferences {
    theme: Theme
    accentColor: string
    name: string
    profilePicture?: string // URL to profile picture in Firebase Storage
    // Location settings
    locationMode: LocationMode
    currentLocation?: GeoLocation // Auto-detected or manually set
    referenceLocation?: GeoLocation // For "suggest places near X"
    searchRadius: number // meters (default 5000)
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

export interface ProductionCompany {
    id: number
    name: string
}

export interface MediaCollection {
    id: number
    name: string
}

export interface Media extends BaseDocument {
    type: MediaType
    tmdbId?: number
    steamId?: number
    title: string
    posterPath: string | null
    releaseDate?: string
    overview?: string
    status: MediaStatus
    rating: number | null // Legacy field for backward compatibility
    ratings?: Record<UserId, number | null> // Per-user ratings
    notes: string
    progress?: MediaProgress
    // Metadata fields
    genres?: string[]
    watchDate?: Timestamp
    comments?: MediaComment[]
    // Collection/grouping fields
    collection?: MediaCollection | null
    productionCompanies?: ProductionCompany[]
    // Custom grouping (user-defined)
    customGroupId?: string
    customGroupName?: string
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

export interface PlaceComment {
    id: string
    text: string
    createdBy: UserId
    createdAt: Timestamp
}

export interface Place extends BaseDocument {
    name: string
    category: PlaceCategory
    notes: string
    visited: boolean
    visitDates: Timestamp[]
    rating: number | null // Legacy single rating
    ratings?: Record<UserId, number | null> // Per-user ratings
    comments?: PlaceComment[]
    location?: GeoLocation
    placeId?: string // Google Places ID for richer data
    tags?: string[] // User-defined tags
}

// Place rating helpers (mirror Media rating helpers)
export function getPlaceUserRating(place: Place, userId: UserId): number | null {
    if (place.ratings && userId in place.ratings) {
        return place.ratings[userId];
    }
    return place.rating ?? null;
}

export function getPlaceAverageRating(place: Place): number | null {
    if (place.ratings) {
        const ratingZ = place.ratings.Z;
        const ratingT = place.ratings.T;

        if (ratingZ !== null && ratingZ !== undefined &&
            ratingT !== null && ratingT !== undefined) {
            return (ratingZ + ratingT) / 2;
        }

        if (ratingZ !== null && ratingZ !== undefined) return ratingZ;
        if (ratingT !== null && ratingT !== undefined) return ratingT;
    }
    return place.rating ?? null;
}

export function getPlaceDisplayRating(place: Place): number | null {
    return getPlaceAverageRating(place);
}

// Helper to calculate distance between two coordinates (Haversine formula)
export function calculateDistance(
    loc1: GeoLocation,
    loc2: GeoLocation
): number {
    const R = 6371 // Earth's radius in km
    const dLat = (loc2.lat - loc1.lat) * Math.PI / 180
    const dLng = (loc2.lng - loc1.lng) * Math.PI / 180
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(loc1.lat * Math.PI / 180) * Math.cos(loc2.lat * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c // Distance in km
}

export function formatDistance(km: number): string {
    if (km < 1) return `${Math.round(km * 1000)} m`
    if (km < 10) return `${km.toFixed(1)} km`
    return `${Math.round(km)} km`
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

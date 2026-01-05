import type { Timestamp } from "firebase/firestore"

export type UserId = "Z" | "T"

// All user IDs in the system - used for iterating over users
export const ALL_USER_IDS: UserId[] = ["Z", "T"]

// Create an empty ratings object with null for all users
export function createEmptyRatings(): Record<UserId, null> {
    return ALL_USER_IDS.reduce((acc, userId) => {
        acc[userId] = null
        return acc
    }, {} as Record<UserId, null>)
}

export type Theme = "light" | "dark"

export type LocationMode = "auto" | "manual" | "off"

export type UnitSystem = "metric" | "imperial"

export type VideoSyncPlatform = "none" | "youtube" | "grayjay"

export interface YouTubeAuthTokens {
    accessToken: string
    refreshToken: string
    expiresAt: number // Timestamp when access token expires
}

export interface GrayjayConfig {
    // Configuration for Grayjay integration
    // This could include plugin settings or API endpoints
    enabled: boolean
    customSettings?: Record<string, unknown>
}

export interface GeoLocation {
    lat: number
    lng: number
    address?: string
}

export interface UserPreferences {
    theme: Theme
    accentColor: string
    name: string
    profilePicture?: string // URL to profile picture in Google Drive
    unitSystem: UnitSystem // metric or imperial
    // Location settings
    locationMode: LocationMode
    currentLocation?: GeoLocation // Auto-detected or manually set
    referenceLocation?: GeoLocation // For "suggest places near X"
    searchRadius: number // meters (default 5000)
    // Video sync settings
    videoSyncPlatform?: VideoSyncPlatform // Platform to sync video queue with
    youtubeAuth?: YouTubeAuthTokens // YouTube OAuth tokens
    youtubePlaylistId?: string // ID of the YouTube playlist to sync with
    grayjayConfig?: GrayjayConfig // Grayjay configuration
    lastUpdated?: number // Timestamp for conflict resolution
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
    photos?: string[] // URLs to photos in Google Drive
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
    photos?: string[] // URLs to photos in Google Drive
}

// Helper functions for ratings
export function getUserRating(media: Media, userId: UserId): number | null {
    // First check new ratings structure
    if (media.ratings && userId in media.ratings) {
        return media.ratings[userId]
    }
    // Fallback to legacy rating field
    return media.rating ?? null
}

export function getAverageRating(media: Media): number | null {
    if (media.ratings) {
        const ratingZ = media.ratings.Z
        const ratingT = media.ratings.T

        // Both users have rated
        if (
            ratingZ !== null &&
            ratingZ !== undefined &&
            ratingT !== null &&
            ratingT !== undefined
        ) {
            return (ratingZ + ratingT) / 2
        }

        // Only one user has rated
        if (ratingZ !== null && ratingZ !== undefined) return ratingZ
        if (ratingT !== null && ratingT !== undefined) return ratingT
    }

    // Fallback to legacy rating
    return media.rating ?? null
}

export function getDisplayRating(media: Media): number | null {
    // Priority: average of both ratings > individual rating > legacy rating
    return getAverageRating(media)
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
    photos?: string[] // URLs to photos in Google Drive
}

// Place rating helpers (mirror Media rating helpers)
export function getPlaceUserRating(place: Place, userId: UserId): number | null {
    if (place.ratings && userId in place.ratings) {
        return place.ratings[userId]
    }
    return place.rating ?? null
}

export function getPlaceAverageRating(place: Place): number | null {
    if (place.ratings) {
        const ratingZ = place.ratings.Z
        const ratingT = place.ratings.T

        if (
            ratingZ !== null &&
            ratingZ !== undefined &&
            ratingT !== null &&
            ratingT !== undefined
        ) {
            return (ratingZ + ratingT) / 2
        }

        if (ratingZ !== null && ratingZ !== undefined) return ratingZ
        if (ratingT !== null && ratingT !== undefined) return ratingT
    }
    return place.rating ?? null
}

export function getPlaceDisplayRating(place: Place): number | null {
    return getPlaceAverageRating(place)
}

// Helper to calculate distance between two coordinates (Haversine formula)
export function calculateDistance(loc1: GeoLocation, loc2: GeoLocation): number {
    const R = 6371 // Earth's radius in km
    const dLat = ((loc2.lat - loc1.lat) * Math.PI) / 180
    const dLng = ((loc2.lng - loc1.lng) * Math.PI) / 180
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((loc1.lat * Math.PI) / 180) *
            Math.cos((loc2.lat * Math.PI) / 180) *
            Math.sin(dLng / 2) *
            Math.sin(dLng / 2)
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

export type VideoStatus = "queued" | "watched" | "skipped"

export interface Video extends BaseDocument {
    title: string
    url: string
    videoId: string // YouTube video ID
    thumbnailUrl?: string
    duration?: string // e.g., "10:23"
    channelName?: string
    status: VideoStatus
    rating: number | null // Legacy field for backward compatibility
    ratings?: Record<UserId, number | null> // Per-user ratings
    notes: string
    watchedDate?: Timestamp
    comments?: MediaComment[]
}

// Helper functions for video ratings
export function getVideoUserRating(video: Video, userId: UserId): number | null {
    if (video.ratings && userId in video.ratings) {
        return video.ratings[userId]
    }
    return video.rating ?? null
}

export function getVideoAverageRating(video: Video): number | null {
    if (video.ratings) {
        const ratings = ALL_USER_IDS.map(userId => video.ratings?.[userId])
            .filter((r): r is number => r !== null && r !== undefined)

        if (ratings.length === 0) return video.rating ?? null
        if (ratings.length === 1) return ratings[0]
        
        return ratings.reduce((sum, r) => sum + r, 0) / ratings.length
    }
    return video.rating ?? null
}

export function getVideoDisplayRating(video: Video): number | null {
    return getVideoAverageRating(video)
}

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

export type NavMode = "sidebar" | "bottom-tabs" | "none"
export type FontPreset = "warm-rounded" | "refined-system"

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
    navMode?: NavMode    // Default: "bottom-tabs" on mobile, "sidebar" on desktop
    fontPreset?: FontPreset // Default: "warm-rounded"
    fontScale?: number   // Global text-scale multiplier (0.85..1.4), default 1
    reduceMotion?: boolean // Disable non-essential animations/transitions
    noteSignature?: string // Short handwritten-style sign-off shown on this identity's notes
    noteAutoToneShift?: boolean // Auto hue-shift note palette when both accents collide (default true)
    showIdentityPill?: boolean // Show the floating identity switcher (default true)
    bottomTabs?: string[] // Ordered tab keys shown in the bottom bar (rest go under "More")
    maxTabsShown?: number // How many chosen tabs render before overflowing to "More"
    corkboardColor?: string // Manual hex override for the notes board background
}

export type UserPreferencesMap = Record<UserId, UserPreferences>

export interface BaseDocument {
    id?: string
    createdBy: UserId
    createdAt: Timestamp
    updatedAt: Timestamp
    updatedBy?: UserId
}

// Tonal slot (t0..t5) resolved to a concrete color from the author's accent at
// render time. Legacy named colors are still accepted for notes stored before
// the per-identity palette migration.
export type NoteTone = "t0" | "t1" | "t2" | "t3" | "t4" | "t5"
export type LegacyNoteColor = "yellow" | "pink" | "blue" | "green" | "purple" | "orange"
export type NoteColor = NoteTone | LegacyNoteColor

export interface Note extends BaseDocument {
    type: "note"
    title: string
    content: string
    tags: string[]
    read?: boolean
    readAt?: Timestamp
    archived?: boolean
    photos?: string[] // URLs to photos in Google Drive
    color?: NoteColor // Sticky note tone slot for corkboard display
    customColor?: string // Manual hex override for this note's paper color
    pinned?: boolean // Pinned to top of corkboard
    threadId?: string // Root note id for a reply thread (unset = standalone/root)
    replyTo?: string // The specific note id this note replies to
    reactions?: Record<string, UserId[]> // emoji -> user ids who reacted
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
    imageOverride?: string // Manual full-URL image override when the source poster won't display
    releaseDate?: string
    overview?: string
    status: MediaStatus
    rating: number | null // Legacy field for backward compatibility
    ratings?: Record<UserId, number | null> // Per-user ratings
    seenBy?: UserId[] // Partners who have personally watched this (couple watch-state)
    unseenBy?: UserId[] // Partners explicitly marked NOT watched; suppresses rating-based inference
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

// ===== Couple watch-state =====
// From the viewer's perspective, how this title sits between the two partners.
export type TogethernessState = "both" | "mine" | "theirs" | "none"

/**
 * Has this specific partner personally watched the title? True when they're in
 * `seenBy`, or (zero-effort backfill) when they've left a personal rating —
 * a per-user rating implies they watched it. The legacy shared `rating` is
 * intentionally ignored here since it isn't attributable to one partner.
 */
export function hasWatched(media: Media, user: UserId): boolean {
    // Explicit marks win over inference, in both directions.
    if (media.seenBy?.includes(user)) return true
    if (media.unseenBy?.includes(user)) return false
    const r = media.ratings?.[user]
    return r !== null && r !== undefined
}

/** The explicit watch flags for a media item, as stored. */
export interface WatchFlags {
    seenBy: UserId[]
    unseenBy: UserId[]
}

/**
 * Set a partner's watched state explicitly. Marking un-watched records a
 * negative so a pre-existing rating can't keep inferring "watched" — otherwise
 * the toggle would be a no-op for anything either partner has rated.
 */
export function setWatched(media: Media, user: UserId, watched: boolean): WatchFlags {
    const seen = new Set(media.seenBy ?? [])
    const unseen = new Set(media.unseenBy ?? [])
    if (watched) {
        seen.add(user)
        unseen.delete(user)
    } else {
        seen.delete(user)
        unseen.add(user)
    }
    return {
        seenBy: ALL_USER_IDS.filter(u => seen.has(u)),
        unseenBy: ALL_USER_IDS.filter(u => unseen.has(u)),
    }
}

/** Flip a partner's watched state, honouring rating-based inference. */
export function toggleWatched(media: Media, user: UserId): WatchFlags {
    return setWatched(media, user, !hasWatched(media, user))
}

/** Classify a title by who of the pair has seen it, from `viewer`'s POV. */
export function watchTogetherness(media: Media, viewer: UserId, partner: UserId): TogethernessState {
    const mine = hasWatched(media, viewer)
    const theirs = hasWatched(media, partner)
    if (mine && theirs) return "both"
    if (mine) return "mine"
    if (theirs) return "theirs"
    return "none"
}


export type PlaceCategory =
    | "restaurant"
    | "cafe"
    | "bar"
    | "attraction"
    | "park"
    | "hotel"
    | "shop"
    | "museum"
    | "beach"
    | "viewpoint"
    | "entertainment"
    | "other"

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
    budget?: number | null // Price level: 0-4 (0=Free, 1=Inexpensive, 2=Moderate, 3=Expensive, 4=Very Expensive)
    revisitable?: boolean // Override for visited semantics (true = revisit-likely, false = one-and-done). Defaults by category.
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

// Budget helpers
export function formatBudget(budget: number | null | undefined): string {
    if (budget === null || budget === undefined || budget < 0 || budget > 4) return 'Unknown'
    const symbols = ['Free', '$', '$$', '$$$', '$$$$']
    return symbols[budget]
}

export function getBudgetLabel(budget: number | null | undefined): string {
    if (budget === null || budget === undefined || budget < 0 || budget > 4) return 'Unknown'
    const labels = [
        'Free',
        'Inexpensive',
        'Moderate',
        'Expensive',
        'Very Expensive'
    ]
    return labels[budget]
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
    imageOverride?: string // Manual full-URL image override when the source thumbnail won't display
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

export type ProfileCategory = 
    | "food" 
    | "drinks" 
    | "music" 
    | "movies" 
    | "books" 
    | "activities" 
    | "scents" 
    | "colors" 
    | "people" 
    | "places" 
    | "gifts" 
    | "other"

export interface ProfileItem extends BaseDocument {
    category: ProfileCategory
    title: string
    description?: string
    notes?: string
    tags?: string[]
    photos?: string[] // URLs to photos in Google Drive
    isFavorite?: boolean
    rating?: number // 1-5 scale for how much they like it
}

// Home dashboard types
export type HomeActivityType = "note" | "media" | "place"

export interface HomeActivity {
    type: HomeActivityType
    id: string
    title: string
    subtitle?: string       // e.g. status label or category
    createdBy: UserId
    actor: UserId           // Who performed the most recent activity (updatedBy ?? createdBy)
    updatedAt: Timestamp
    posterPath?: string | null // Media poster, if available
    imageOverride?: string     // Manual image override, if set
    mediaType?: MediaType      // Only set when type === "media"
}

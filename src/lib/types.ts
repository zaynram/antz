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
    rating: number | null
    notes: string
    progress?: MediaProgress
    // New metadata fields
    genres?: string[]
    watchDate?: Timestamp
    comments?: MediaComment[]
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

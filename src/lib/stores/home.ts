import { derived, writable } from "svelte/store"
import { subscribeToCollection } from "../firebase"
import type { HomeActivity, Media, Note, Place } from "../types"

interface DashboardState {
    recentActivity: HomeActivity[]
    inProgress: Media[]
    loading: boolean
    error: string | null
}

const INITIAL_STATE: DashboardState = {
    recentActivity: [],
    inProgress: [],
    loading: true,
    error: null,
}

// Internal writeable state
const _dashboardState = writable<DashboardState>(INITIAL_STATE)

let unsubscribeMedia: (() => void) | null = null
let unsubscribeNotes: (() => void) | null = null
let unsubscribePlaces: (() => void) | null = null

let latestMedia: Media[] = []
let latestNotes: Note[] = []
let latestPlaces: Place[] = []

function rebuildActivity(): void {
    const mediaItems: HomeActivity[] = latestMedia.map(m => ({
        type: "media" as const,
        id: m.id ?? "",
        title: m.title,
        subtitle: m.status,
        createdBy: m.createdBy,
        actor: m.updatedBy ?? m.createdBy,
        updatedAt: m.updatedAt,
        posterPath: m.posterPath,
        mediaType: m.type,
    }))

    const noteItems: HomeActivity[] = latestNotes.map(n => ({
        type: "note" as const,
        id: n.id ?? "",
        title: n.title || "(untitled)",
        subtitle: n.tags?.[0],
        createdBy: n.createdBy,
        actor: n.updatedBy ?? n.createdBy,
        updatedAt: n.updatedAt,
    }))

    const placeItems: HomeActivity[] = latestPlaces.map(p => ({
        type: "place" as const,
        id: p.id ?? "",
        title: p.name,
        subtitle: p.category,
        createdBy: p.createdBy,
        actor: p.updatedBy ?? p.createdBy,
        updatedAt: p.updatedAt,
    }))

    const all = [...mediaItems, ...noteItems, ...placeItems]
        .sort((a, b) => {
            const aTime = a.updatedAt?.toMillis?.() ?? 0
            const bTime = b.updatedAt?.toMillis?.() ?? 0
            return bTime - aTime
        })
        .slice(0, 6)

    const inProgress = latestMedia.filter(m => m.status === "watching")

    _dashboardState.update(s => ({
        ...s,
        recentActivity: all,
        inProgress,
        loading: false,
        error: null,
    }))
}

export function initHomeStore(): void {
    // Clean up any existing subscriptions before creating new ones
    if (unsubscribeMedia) { unsubscribeMedia(); unsubscribeMedia = null }
    if (unsubscribeNotes) { unsubscribeNotes(); unsubscribeNotes = null }
    if (unsubscribePlaces) { unsubscribePlaces(); unsubscribePlaces = null }

    _dashboardState.set(INITIAL_STATE)

    unsubscribeMedia = subscribeToCollection<Media>("media", items => {
        latestMedia = items
        rebuildActivity()
    }, "updatedAt")

    unsubscribeNotes = subscribeToCollection<Note>("notes", items => {
        latestNotes = items
        rebuildActivity()
    }, "updatedAt")

    unsubscribePlaces = subscribeToCollection<Place>("places", items => {
        latestPlaces = items
        rebuildActivity()
    }, "updatedAt")
}

export function cleanupHomeStore(): void {
    if (unsubscribeMedia) { unsubscribeMedia(); unsubscribeMedia = null }
    if (unsubscribeNotes) { unsubscribeNotes(); unsubscribeNotes = null }
    if (unsubscribePlaces) { unsubscribePlaces(); unsubscribePlaces = null }
    latestMedia = []
    latestNotes = []
    latestPlaces = []
    _dashboardState.set(INITIAL_STATE)
}

export const dashboardState = derived(_dashboardState, $s => $s)

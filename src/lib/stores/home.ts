import { derived, writable } from "svelte/store"
import { subscribeToCollection } from "../firebase"
import type { HomeActivity, Media, Note, Place } from "../types"

// Label for a note in activity lists: prefer the title, else backfill from the
// start of the body (truncated), else a neutral placeholder.
function noteLabel(n: Note): string {
    const title = n.title?.trim()
    if (title) return title
    const body = n.content?.trim().replace(/\s+/g, " ")
    if (body) return body.length > 48 ? body.slice(0, 47).trimEnd() + "…" : body
    return "Untitled note"
}

// The feed renders ACTIVITY_LIMIT rows drawn from three collections, so the
// activity-only subscriptions need supply at most that many candidates each —
// no reason to stream whole collections to the client for a six-row list.
const ACTIVITY_LIMIT = 6
const ACTIVITY_FETCH_LIMIT = 25

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
        imageOverride: m.imageOverride,
        mediaType: m.type,
    }))

    const noteItems: HomeActivity[] = latestNotes.map(n => ({
        type: "note" as const,
        id: n.id ?? "",
        title: noteLabel(n),
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
        .slice(0, ACTIVITY_LIMIT)

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

    // Media is deliberately NOT bounded: it also feeds the "in progress" list,
    // and a recency limit would silently drop a title still being watched once
    // enough other items had been touched more recently.
    unsubscribeMedia = subscribeToCollection<Media>("media", items => {
        latestMedia = items
        rebuildActivity()
    }, "updatedAt")

    unsubscribeNotes = subscribeToCollection<Note>("notes", items => {
        latestNotes = items
        rebuildActivity()
    }, "updatedAt", ACTIVITY_FETCH_LIMIT)

    unsubscribePlaces = subscribeToCollection<Place>("places", items => {
        latestPlaces = items
        rebuildActivity()
    }, "updatedAt", ACTIVITY_FETCH_LIMIT)
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

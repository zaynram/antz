// Pure reconciliation logic for the shared video queue.
//
// Kept free of network and Firestore concerns so the policy decisions — which
// are the genuinely tricky part of two-way sync — can be unit-tested directly.
//
// Mapping model: a YouTube playlist has no per-item watched state, so the
// playlist mirrors only what is still *queued*. Anything watched or skipped
// lives on locally but is removed from the playlist, which is what makes the
// playlist usable as an actual "what's next" list on the YouTube side.

import type { VideoStatus } from "../types"

/** A video as it exists in our Firestore queue. */
export interface LocalVideo {
    id?: string
    videoId: string
    title: string
    status: VideoStatus
}

/** A video as it exists in the linked YouTube playlist. */
export interface RemoteVideo {
    /** The playlistItem id — required to remove the item again. */
    itemId: string
    videoId: string
    title: string
    thumbnailUrl?: string
    position: number
}

export interface SyncPlan {
    /** On the playlist but not in our queue → create locally. */
    toImport: RemoteVideo[]
    /** Queued locally but missing from the playlist → add remotely. */
    toPush: LocalVideo[]
    /** No longer queued locally but still on the playlist → remove remotely. */
    toRemoveRemote: RemoteVideo[]
    /** Present and consistent on both sides. */
    inSyncCount: number
}

export interface SyncOptions {
    /**
     * Push local additions to the playlist. Off gives a read-only "import from
     * YouTube" sync, which is the safe default for a newly linked account.
     */
    push?: boolean
    /** Remove watched/skipped videos from the playlist. Requires `push`. */
    prune?: boolean
}

/** Statuses that should be mirrored onto the playlist. */
export function isQueued(status: VideoStatus): boolean {
    return status === "queued"
}

/**
 * Diff the local queue against a playlist's contents.
 *
 * Duplicates are tolerated on both sides: YouTube allows the same video to
 * appear in a playlist more than once, and only the first occurrence is treated
 * as canonical — the rest are surfaced for pruning rather than silently
 * re-imported as duplicate queue entries.
 */
export function planSync(
    local: LocalVideo[],
    remote: RemoteVideo[],
    options: SyncOptions = {},
): SyncPlan {
    const { push = false, prune = false } = options

    const localByVideoId = new Map<string, LocalVideo>()
    for (const v of local) {
        if (!localByVideoId.has(v.videoId)) localByVideoId.set(v.videoId, v)
    }

    const seenRemote = new Set<string>()
    const toImport: RemoteVideo[] = []
    const toRemoveRemote: RemoteVideo[] = []
    let inSyncCount = 0

    for (const r of remote) {
        const duplicate = seenRemote.has(r.videoId)
        seenRemote.add(r.videoId)

        const match = localByVideoId.get(r.videoId)
        if (!match) {
            // Unknown to us: import it (a duplicate row adds nothing).
            if (!duplicate) toImport.push(r)
            else if (prune) toRemoveRemote.push(r)
            continue
        }
        if (duplicate) {
            if (prune) toRemoveRemote.push(r)
            continue
        }
        if (isQueued(match.status)) inSyncCount++
        else if (prune) toRemoveRemote.push(r)
    }

    // Push from the de-duplicated view, so a video that somehow exists twice in
    // the local queue is only added to the playlist once.
    const toPush = push
        ? [...localByVideoId.values()].filter(v => isQueued(v.status) && !seenRemote.has(v.videoId))
        : []

    return { toImport, toPush, toRemoveRemote, inSyncCount }
}

/** Whether a plan would change anything on either side. */
export function isPlanEmpty(plan: SyncPlan): boolean {
    return plan.toImport.length === 0
        && plan.toPush.length === 0
        && plan.toRemoveRemote.length === 0
}

/** Human-readable one-line summary of what a sync did (or would do). */
export function describePlan(plan: SyncPlan): string {
    if (isPlanEmpty(plan)) return "Already in sync"
    const parts: string[] = []
    if (plan.toImport.length) parts.push(`${plan.toImport.length} imported`)
    if (plan.toPush.length) parts.push(`${plan.toPush.length} added to playlist`)
    if (plan.toRemoveRemote.length) parts.push(`${plan.toRemoveRemote.length} removed from playlist`)
    return parts.join(", ")
}

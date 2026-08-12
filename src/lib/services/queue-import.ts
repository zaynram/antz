// Parsing of externally-authored video lists back into queue candidates.
//
// Grayjay has no public sync API, so the round trip is file-based: we export a
// JSON/URL list and accept the same shapes back. Deliberately permissive about
// input — a hand-edited list, a playlist copied out of another app, or a plain
// wall of links should all work — but strict about producing valid entries.

import { parseYouTubeUrl } from "../youtube"

/** A video parsed from an imported list, ready to become a queue entry. */
export interface ImportCandidate {
    videoId: string
    url: string
    title: string
    thumbnailUrl?: string
}

export interface ImportResult {
    candidates: ImportCandidate[]
    /** Lines/entries that looked like content but weren't usable. */
    skipped: number
}

interface ExportedVideo {
    id?: unknown
    title?: unknown
    url?: unknown
    thumbnailUrl?: unknown
}

function candidateFromUrl(url: string, title?: string, thumbnailUrl?: string): ImportCandidate | null {
    const info = parseYouTubeUrl(url.trim())
    if (!info) return null
    return {
        videoId: info.videoId,
        url: info.url,
        title: title?.trim() || "Untitled Video",
        ...(thumbnailUrl ? { thumbnailUrl } : {}),
    }
}

/** De-duplicate by videoId, keeping the first (and best-titled) occurrence. */
function dedupe(candidates: ImportCandidate[]): ImportCandidate[] {
    const byId = new Map<string, ImportCandidate>()
    for (const c of candidates) {
        const existing = byId.get(c.videoId)
        if (!existing) byId.set(c.videoId, c)
        else if (existing.title === "Untitled Video" && c.title !== "Untitled Video") byId.set(c.videoId, c)
    }
    return [...byId.values()]
}

/** Parse our own JSON export shape (also what Grayjay round-trips). */
export function parseJsonExport(text: string): ImportResult {
    let parsed: unknown
    try {
        parsed = JSON.parse(text)
    } catch {
        return { candidates: [], skipped: 0 }
    }

    const list: unknown = Array.isArray(parsed)
        ? parsed
        : (parsed as { videos?: unknown })?.videos
    if (!Array.isArray(list)) return { candidates: [], skipped: 0 }

    const candidates: ImportCandidate[] = []
    let skipped = 0
    for (const entry of list as ExportedVideo[]) {
        if (!entry || typeof entry !== "object") { skipped++; continue }
        const url = typeof entry.url === "string" ? entry.url : null
        const title = typeof entry.title === "string" ? entry.title : undefined
        const thumb = typeof entry.thumbnailUrl === "string" ? entry.thumbnailUrl : undefined
        // Fall back to a bare video id when the export omitted the URL.
        const source = url ?? (typeof entry.id === "string" && entry.id
            ? `https://www.youtube.com/watch?v=${entry.id}`
            : null)
        if (!source) { skipped++; continue }
        const candidate = candidateFromUrl(source, title, thumb)
        if (candidate) candidates.push(candidate)
        else skipped++
    }
    return { candidates: dedupe(candidates), skipped }
}

/** Parse a newline-separated URL list, ignoring blanks and `#` comments. */
export function parseUrlList(text: string): ImportResult {
    const candidates: ImportCandidate[] = []
    let skipped = 0
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim()
        if (!line || line.startsWith("#")) continue
        const candidate = candidateFromUrl(line)
        if (candidate) candidates.push(candidate)
        else skipped++
    }
    return { candidates: dedupe(candidates), skipped }
}

/**
 * Parse an import of unknown shape — JSON export or URL list. Callers can hand
 * this a pasted blob or a dropped file without asking the user which it is.
 */
export function parseImport(text: string): ImportResult {
    const trimmed = text.trim()
    if (!trimmed) return { candidates: [], skipped: 0 }
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        const json = parseJsonExport(trimmed)
        // A JSON blob that yielded nothing may still contain bare URLs.
        if (json.candidates.length > 0) return json
    }
    return parseUrlList(trimmed)
}

/** Drop candidates already present in the queue, comparing by video id. */
export function excludeExisting(
    candidates: ImportCandidate[],
    existingVideoIds: Iterable<string>,
): ImportCandidate[] {
    const existing = new Set(existingVideoIds)
    return candidates.filter(c => !existing.has(c.videoId))
}

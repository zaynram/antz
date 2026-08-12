// Interpreting an incoming Web Share.
//
// Share sources are messy: some apps put the link in `url`, some put it in
// `text` alongside a title, some send only a blob of text with the link
// embedded, and titles often arrive with the platform's own suffix attached.
// This module turns any of that into a single usable candidate, with no
// network or account access involved — which is the point of the share-target
// approach over API sync.

import { parseYouTubeUrl } from "../youtube"

export interface SharePayload {
    title?: string | null
    text?: string | null
    url?: string | null
}

export interface SharedLink {
    /** The canonical link to store. */
    url: string
    /** Best available human title, or empty when the share carried none. */
    title: string
    /** Set when the link is a recognised YouTube video. */
    videoId?: string
}

const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi

/** Pull the first http(s) link out of arbitrary shared text. */
export function extractFirstUrl(text: string | null | undefined): string | null {
    if (!text) return null
    const matches = text.match(URL_PATTERN)
    if (!matches || matches.length === 0) return null
    // Trailing punctuation frequently rides along when a link ends a sentence.
    return matches[0].replace(/[).,;!?]+$/, "")
}

/**
 * Strip the platform boilerplate share sheets append to titles, e.g.
 * "Some Video - YouTube" or "Watch Some Video on YouTube".
 */
export function cleanSharedTitle(title: string | null | undefined): string {
    if (!title) return ""
    let out = title.trim()
    out = out.replace(/\s*[-–—|]\s*(YouTube|Grayjay|Vimeo|Twitch)\s*$/i, "")
    out = out.replace(/^Watch\s+/i, "")
    out = out.replace(/\s+on\s+(YouTube|Grayjay|Vimeo|Twitch)\s*$/i, "")
    // A share that put the URL in the title field isn't a title at all.
    if (/^https?:\/\/\S+$/i.test(out)) return ""
    return out.trim()
}

/**
 * Resolve a share payload into a single link, or null when it carries none.
 * Looks in `url` first, then any link embedded in `text`, then `title`.
 */
export function readShare(payload: SharePayload): SharedLink | null {
    const direct = payload.url?.trim()
    const candidate = (direct && extractFirstUrl(direct))
        || extractFirstUrl(payload.text)
        || extractFirstUrl(payload.title)
    if (!candidate) return null

    // Prefer the title field, but fall back to text when the title was just the
    // link (common on Android) and the text carries the real caption.
    let title = cleanSharedTitle(payload.title)
    if (!title) {
        const textWithoutUrl = (payload.text ?? "").replace(URL_PATTERN, "").trim()
        title = cleanSharedTitle(textWithoutUrl)
    }

    const youtube = parseYouTubeUrl(candidate)
    return {
        url: youtube ? youtube.url : candidate,
        title,
        ...(youtube ? { videoId: youtube.videoId } : {}),
    }
}

/** True when a share carries something we can actually add. */
export function hasShareData(payload: SharePayload): boolean {
    return readShare(payload) !== null
}

// Pure grouping logic for the notes board's stack "views". Kept free of
// Svelte/Firestore types so it can be unit-tested directly; callers pass plain
// millisecond timestamps.

export type StackView = "custom" | "day" | "week" | "month" | "year" | "similar"

export const STACK_VIEW_KEYS: StackView[] = ["custom", "day", "week", "month", "year", "similar"]

export function isStackView(value: unknown): value is StackView {
    return typeof value === "string" && (STACK_VIEW_KEYS as string[]).includes(value)
}

/** A note reduced to just what grouping needs. */
export interface StackableNote {
    id?: string
    threadId?: string
    title?: string
    content?: string
    createdAtMs: number
}

/**
 * ISO-8601 week number *and* its ISO week-year. The week-year is returned
 * because it can differ from the calendar year at the boundary (e.g. Jan 1 can
 * belong to week 52/53 of the previous ISO year) — keying a week bucket by the
 * calendar year would split one week into two stacks.
 */
export function isoWeekYear(d: Date): { year: number; week: number } {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    const day = date.getUTCDay() || 7
    date.setUTCDate(date.getUTCDate() + 4 - day) // shift to the week's Thursday
    const year = date.getUTCFullYear()
    const yearStart = new Date(Date.UTC(year, 0, 1))
    const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
    return { year, week }
}

/** Bucket key for the date-based views. `view` must not be custom/similar. */
export function dateBucket(createdAtMs: number, view: StackView): string {
    const d = new Date(createdAtMs)
    const y = d.getFullYear()
    if (view === "year") return `y:${y}`
    if (view === "month") return `m:${y}-${d.getMonth()}`
    if (view === "week") {
        const { year, week } = isoWeekYear(d)
        return `w:${year}-${week}`
    }
    return `d:${y}-${d.getMonth()}-${d.getDate()}`
}

/** Significant words of a note, for the "similar" view. */
export function tokenize(title?: string, content?: string): Set<string> {
    const text = `${title ?? ""} ${content ?? ""}`.toLowerCase()
    return new Set(text.split(/[^a-z0-9]+/).filter(w => w.length > 3))
}

/** Minimum shared significant words for two notes to land in one cluster. */
export const SIMILARITY_THRESHOLD = 2

/**
 * Greedy similarity clustering: oldest first, each note joins the cluster it
 * shares the most significant words with (when over the threshold), else it
 * starts its own. Returns note id -> cluster key.
 */
export function similarityClusters(notes: StackableNote[]): Map<string, string> {
    const map = new Map<string, string>()
    const sorted = [...notes].filter(n => n.id).sort((a, b) => a.createdAtMs - b.createdAtMs)
    const clusters: Array<{ key: string; tokens: Set<string> }> = []
    for (const n of sorted) {
        const toks = tokenize(n.title, n.content)
        let best: { key: string; tokens: Set<string> } | null = null
        let bestScore = 0
        for (const c of clusters) {
            let score = 0
            for (const t of toks) if (c.tokens.has(t)) score++
            if (score > bestScore) { bestScore = score; best = c }
        }
        if (best && bestScore >= SIMILARITY_THRESHOLD) {
            map.set(n.id!, best.key)
            for (const t of toks) best.tokens.add(t)
        } else {
            clusters.push({ key: n.id!, tokens: toks })
            map.set(n.id!, n.id!)
        }
    }
    return map
}

/** The manual (reply-thread) stack a note belongs to. */
export function threadKeyOf(n: Pick<StackableNote, "id" | "threadId">): string {
    return n.threadId ?? n.id ?? ""
}

/** The stack a note belongs to under the given view. */
export function groupKeyOf(
    n: StackableNote,
    view: StackView,
    similarity?: Map<string, string>,
): string {
    if (view === "custom") return threadKeyOf(n)
    if (view === "similar") return similarity?.get(n.id ?? "") ?? n.id ?? ""
    return dateBucket(n.createdAtMs, view)
}

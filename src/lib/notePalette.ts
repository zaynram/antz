// Derives per-identity sticky-note palettes from each user's accent color so
// that note authorship is legible at a glance: every note a user pins carries
// a tone from their own accent family (rose vs. violet, say). When both users
// pick near-identical accents, one family can be automatically hue-shifted so
// the two remain distinguishable.

import { hexToHsl, hslToHex, hueDistance, readableInk } from "./color"
import type { NoteColor, UserId, UserPreferencesMap } from "./types"
import { DEFAULT_ACCENT } from "./accents"

export interface NoteTone {
    /** Stored slot key (t0..t5). */
    key: string
    bgLight: string
    bgDark: string
    inkLight: string
    inkDark: string
    tack: string
}

// Six tonal slots. A note stores which slot it uses; the actual color is
// resolved from the author's accent at render time.
export const NOTE_TONE_KEYS = ["t0", "t1", "t2", "t3", "t4", "t5"] as const

// Legacy notes stored named colors; map them onto slots so old notes keep the
// same relative position within the new per-identity palette.
const LEGACY_COLOR_INDEX: Record<string, number> = {
    yellow: 0,
    pink: 1,
    blue: 2,
    green: 3,
    purple: 4,
    orange: 5,
    t0: 0,
    t1: 1,
    t2: 2,
    t3: 3,
    t4: 4,
    t5: 5,
}

const HUE_OFFSETS = [-16, -8, 0, 10, 20, 30]
const LIGHT_L = [90, 88, 91, 89, 87, 90]
const DARK_L = [33, 31, 35, 32, 30, 34]

// If two accents fall within this many degrees of hue, treat them as colliding.
export const COLLISION_HUE_THRESHOLD = 34
// How far to rotate the shifted identity's palette on collision.
export const COLLISION_SHIFT_DEG = 42

function toneIndex(color: NoteColor | string | undefined): number {
    if (!color) return 0
    return LEGACY_COLOR_INDEX[color] ?? 0
}

/** Build the six-tone paper palette for a given accent color. */
export function getNotePalette(accentHex: string, shiftDeg = 0): NoteTone[] {
    const base = hexToHsl(accentHex || DEFAULT_ACCENT)
    const h = base.h + shiftDeg
    const paperSat = Math.min(78, Math.max(42, base.s * 0.82))
    const deepSat = Math.min(52, Math.max(26, base.s * 0.5))
    const tackSat = Math.min(88, Math.max(48, base.s))

    return NOTE_TONE_KEYS.map((key, i) => {
        const hue = h + HUE_OFFSETS[i]
        const bgLight = hslToHex({ h: hue, s: paperSat, l: LIGHT_L[i] })
        const bgDark = hslToHex({ h: hue, s: deepSat, l: DARK_L[i] })
        return {
            key,
            bgLight,
            bgDark,
            inkLight: readableInk(bgLight),
            inkDark: readableInk(bgDark),
            tack: hslToHex({ h: hue, s: tackSat, l: 50 }),
        }
    })
}

/**
 * Decide how much (if any) to hue-shift each identity's palette. The first
 * identity (Z) always keeps its true accent; T is rotated only when the two
 * accents collide and auto tone-shift is enabled. Returns per-user shift in
 * degrees.
 */
export function resolveToneShift(
    prefs: UserPreferencesMap,
    autoShift: boolean
): Record<UserId, number> {
    const zAccent = prefs.Z?.accentColor ?? DEFAULT_ACCENT
    const tAccent = prefs.T?.accentColor ?? DEFAULT_ACCENT
    let tShift = 0
    if (autoShift) {
        const collide = hueDistance(hexToHsl(zAccent).h, hexToHsl(tAccent).h) < COLLISION_HUE_THRESHOLD
        if (collide) tShift = COLLISION_SHIFT_DEG
    }
    return { Z: 0, T: tShift }
}

/** Resolve the concrete tone for a single note, based on its author. */
export function resolveNoteTone(
    author: UserId,
    color: NoteColor | string | undefined,
    prefs: UserPreferencesMap,
    shiftByUser: Record<UserId, number>
): NoteTone {
    const accent = prefs[author]?.accentColor ?? DEFAULT_ACCENT
    const palette = getNotePalette(accent, shiftByUser[author] ?? 0)
    return palette[toneIndex(color)]
}

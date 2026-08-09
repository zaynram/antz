import { describe, it, expect } from "vitest"
import {
    getNotePalette,
    resolveToneShift,
    resolveNoteTone,
    NOTE_TONE_KEYS,
    COLLISION_SHIFT_DEG,
} from "./notePalette"
import type { UserPreferences, UserPreferencesMap } from "./types"

function prefs(zAccent: string, tAccent: string): UserPreferencesMap {
    const base: UserPreferences = {
        theme: "dark",
        accentColor: zAccent,
        name: "Z",
        unitSystem: "metric",
        locationMode: "off",
        searchRadius: 5000,
    }
    return {
        Z: { ...base, accentColor: zAccent, name: "Z" },
        T: { ...base, accentColor: tAccent, name: "T" },
    }
}

const isHex = (s: string) => /^#[0-9a-f]{6}$/.test(s)

describe("getNotePalette", () => {
    it("produces one tone per slot with valid colors", () => {
        const palette = getNotePalette("#e11d48")
        expect(palette).toHaveLength(NOTE_TONE_KEYS.length)
        palette.forEach((tone, i) => {
            expect(tone.key).toBe(NOTE_TONE_KEYS[i])
            expect(isHex(tone.bgLight)).toBe(true)
            expect(isHex(tone.bgDark)).toBe(true)
            expect(isHex(tone.tack)).toBe(true)
            expect(isHex(tone.inkLight)).toBe(true)
            expect(isHex(tone.inkDark)).toBe(true)
        })
    })

    it("light backgrounds are lighter than dark backgrounds", () => {
        const palette = getNotePalette("#7c3aed")
        // A crude check: the light paper tone should have a higher green+red sum
        // than the deep tone for the same slot.
        const light = parseInt(palette[0].bgLight.slice(1), 16)
        const dark = parseInt(palette[0].bgDark.slice(1), 16)
        expect(light).toBeGreaterThan(dark)
    })

    it("falls back gracefully for empty accent", () => {
        expect(getNotePalette("")).toHaveLength(6)
    })
})

describe("resolveToneShift", () => {
    it("does not shift when accents are far apart", () => {
        const shift = resolveToneShift(prefs("#e11d48", "#0d9488"), true)
        expect(shift.Z).toBe(0)
        expect(shift.T).toBe(0)
    })

    it("shifts T when accents collide and auto-shift is on", () => {
        const shift = resolveToneShift(prefs("#e11d48", "#e11d48"), true)
        expect(shift.Z).toBe(0)
        expect(shift.T).toBe(COLLISION_SHIFT_DEG)
    })

    it("never shifts when auto-shift is off", () => {
        const shift = resolveToneShift(prefs("#e11d48", "#e11d48"), false)
        expect(shift.T).toBe(0)
    })
})

describe("resolveNoteTone", () => {
    const p = prefs("#e11d48", "#7c3aed")
    const shift = resolveToneShift(p, true)

    it("maps a legacy named color onto a tonal slot", () => {
        const tone = resolveNoteTone("Z", "yellow", p, shift)
        expect(tone.key).toBe("t0")
    })

    it("uses the author's accent, not the viewer's", () => {
        const zTone = resolveNoteTone("Z", "t2", p, shift)
        const tTone = resolveNoteTone("T", "t2", p, shift)
        // Same slot, different authors → different resolved colors.
        expect(zTone.bgLight).not.toBe(tTone.bgLight)
    })

    it("defaults unknown colors to the first slot", () => {
        const tone = resolveNoteTone("Z", undefined, p, shift)
        expect(tone.key).toBe("t0")
    })
})

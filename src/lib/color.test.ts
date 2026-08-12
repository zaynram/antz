import { describe, it, expect } from "vitest"
import {
    normalizeHex,
    hexToRgb,
    hexToHsl,
    hslToHex,
    readableInk,
    shiftHue,
    hueDistance,
    relativeLuminance,
    contrastRatio,
    ensureReadable,
} from "./color"

describe("color utilities", () => {
    describe("normalizeHex", () => {
        it("expands 3-digit hex", () => {
            expect(normalizeHex("#abc")).toBe("#aabbcc")
        })
        it("lowercases and adds hash", () => {
            expect(normalizeHex("E11D48")).toBe("#e11d48")
        })
        it("rejects invalid input", () => {
            expect(normalizeHex("nope")).toBeNull()
            expect(normalizeHex("#12")).toBeNull()
        })
    })

    describe("hexToRgb", () => {
        it("parses channels", () => {
            expect(hexToRgb("#ff8000")).toEqual({ r: 255, g: 128, b: 0 })
        })
    })

    describe("hexToHsl / hslToHex round trip", () => {
        it("round-trips saturated colors within tolerance", () => {
            for (const hex of ["#e11d48", "#7c3aed", "#0d9488", "#3b82f6", "#10b981"]) {
                const back = hslToHex(hexToHsl(hex))
                const a = hexToRgb(hex)
                const b = hexToRgb(back)
                expect(Math.abs(a.r - b.r)).toBeLessThanOrEqual(2)
                expect(Math.abs(a.g - b.g)).toBeLessThanOrEqual(2)
                expect(Math.abs(a.b - b.b)).toBeLessThanOrEqual(2)
            }
        })
        it("handles greyscale (zero saturation)", () => {
            expect(hexToHsl("#000000").l).toBe(0)
            expect(hexToHsl("#ffffff").l).toBe(100)
            expect(hexToHsl("#808080").s).toBe(0)
        })
    })

    describe("readableInk", () => {
        it("returns dark ink on light backgrounds", () => {
            expect(readableInk("#fef08a")).toBe("#1c1917")
        })
        it("returns light ink on dark backgrounds", () => {
            expect(readableInk("#1e293b")).toBe("#fafaf9")
        })
    })

    describe("relativeLuminance", () => {
        it("orders black < grey < white", () => {
            expect(relativeLuminance("#000000")).toBeLessThan(relativeLuminance("#808080"))
            expect(relativeLuminance("#808080")).toBeLessThan(relativeLuminance("#ffffff"))
        })
    })

    describe("shiftHue", () => {
        it("rotating 360 degrees is a no-op within tolerance", () => {
            const hex = "#e11d48"
            const shifted = shiftHue(hex, 360)
            const a = hexToRgb(hex)
            const b = hexToRgb(shifted)
            expect(Math.abs(a.r - b.r)).toBeLessThanOrEqual(2)
            expect(Math.abs(a.g - b.g)).toBeLessThanOrEqual(2)
            expect(Math.abs(a.b - b.b)).toBeLessThanOrEqual(2)
        })
        it("changes hue for a partial rotation", () => {
            expect(shiftHue("#e11d48", 120)).not.toBe("#e11d48")
        })
    })

    describe("hueDistance", () => {
        it("is symmetric and wraps around 360", () => {
            expect(hueDistance(10, 350)).toBe(20)
            expect(hueDistance(350, 10)).toBe(20)
            expect(hueDistance(0, 180)).toBe(180)
            expect(hueDistance(90, 90)).toBe(0)
        })
    })

    describe("contrastRatio", () => {
        it("is maximal for black on white", () => {
            expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0)
        })
        it("is 1 for identical colors", () => {
            expect(contrastRatio("#e11d48", "#e11d48")).toBeCloseTo(1, 5)
        })
        it("is symmetric", () => {
            expect(contrastRatio("#123456", "#abcdef")).toBeCloseTo(
                contrastRatio("#abcdef", "#123456"), 5
            )
        })
    })

    describe("ensureReadable", () => {
        it("returns the color unchanged when it already contrasts", () => {
            expect(ensureReadable("#1c1917", "#fef08a", 3)).toBe("#1c1917")
        })
        it("recolors a same-as-background signature to be legible", () => {
            // tack === bg (the custom-color collision case)
            const out = ensureReadable("#e11d48", "#e11d48", 3.2)
            expect(out).not.toBe("#e11d48")
            expect(contrastRatio(out, "#e11d48")).toBeGreaterThanOrEqual(3.2)
        })
        it("preserves hue while adjusting lightness", () => {
            const out = ensureReadable("#e11d48", "#e11d48", 3.2)
            const target = hexToHsl("#e11d48")
            const got = hexToHsl(out)
            expect(hueDistance(got.h, target.h)).toBeLessThanOrEqual(4)
        })
    })
})

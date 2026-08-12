import { describe, it, expect } from "vitest"
import { anchoredPosition, NO_INSETS, type Rect } from "./popover"

const VP = { width: 400, height: 800 } // a phone-ish viewport
const MENU = { width: 240, height: 300 }
const anchor = (patch: Partial<Rect> = {}): Rect => ({ left: 100, top: 100, width: 36, height: 36, ...patch })

describe("anchoredPosition", () => {
    describe("horizontal", () => {
        it("right-aligns the menu to the anchor when there is room", () => {
            const { left } = anchoredPosition(anchor({ left: 300 }), MENU, VP, 8)
            expect(left).toBe(300 + 36 - 240)
        })

        it("slides back inside instead of overflowing the left edge", () => {
            const { left } = anchoredPosition(anchor({ left: 10 }), MENU, VP, 8)
            expect(left).toBe(8)
        })

        it("never pushes past the right edge", () => {
            const wide = { width: 380, height: 100 }
            const { left } = anchoredPosition(anchor({ left: 390 }), wide, VP, 8)
            expect(left + wide.width).toBeLessThanOrEqual(VP.width - 8)
        })

        it("respects left/right safe-area insets", () => {
            const insets = { top: 0, right: 20, bottom: 0, left: 20 }
            const { left } = anchoredPosition(anchor({ left: 5 }), MENU, VP, 8, insets)
            expect(left).toBe(28) // 20 inset + 8 gap
        })
    })

    describe("vertical", () => {
        it("opens below the anchor when it fits", () => {
            const a = anchor({ top: 100 })
            const { top, flipped } = anchoredPosition(a, MENU, VP, 8)
            expect(flipped).toBe(false)
            expect(top).toBe(100 + 36 + 8)
        })

        it("flips above when there is not enough room below", () => {
            const a = anchor({ top: 700 })
            const { top, flipped } = anchoredPosition(a, MENU, VP, 8)
            expect(flipped).toBe(true)
            expect(top).toBeGreaterThanOrEqual(8)
            expect(top).toBeLessThan(700)
        })

        it("stays below when neither side fits but below has more room", () => {
            const tall = { width: 240, height: 900 }
            const { flipped } = anchoredPosition(anchor({ top: 100 }), tall, VP, 8)
            expect(flipped).toBe(false)
        })

        it("reports the height available so the caller can scroll", () => {
            const a = anchor({ top: 700 })
            const { maxHeight } = anchoredPosition(a, MENU, VP, 8)
            expect(maxHeight).toBe(700 - 8) // space above, minus the gap
        })

        it("keeps clear of top and bottom safe areas", () => {
            const insets = { top: 60, right: 0, bottom: 40, left: 0 }
            const below = anchoredPosition(anchor({ top: 100 }), MENU, VP, 8, insets)
            expect(below.maxHeight).toBe(VP.height - 40 - 8 - 136)

            const flippedPlacement = anchoredPosition(anchor({ top: 740 }), MENU, VP, 8, insets)
            expect(flippedPlacement.flipped).toBe(true)
            expect(flippedPlacement.top).toBeGreaterThanOrEqual(60 + 8)
        })

        it("never returns a negative height", () => {
            const cramped = { width: 100, height: 50 }
            const { maxHeight } = anchoredPosition(anchor({ top: 0, height: 800 }), cramped, VP, 8, NO_INSETS)
            expect(maxHeight).toBeGreaterThanOrEqual(0)
        })
    })
})

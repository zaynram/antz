import { describe, it, expect } from "vitest"
import { clampPosition, flyoutPlacement, centerOf } from "./identityPill"

const VP = { width: 1000, height: 800 }

describe("identityPill geometry", () => {
    describe("clampPosition", () => {
        const size = { width: 44, height: 44 }

        it("leaves an in-bounds position untouched", () => {
            expect(clampPosition({ x: 500, y: 400 }, size, VP, 8)).toEqual({ x: 500, y: 400 })
        })

        it("pulls a bottom-right overflow back inside with the margin", () => {
            const out = clampPosition({ x: 5000, y: 5000 }, size, VP, 8)
            expect(out).toEqual({ x: 1000 - 44 - 8, y: 800 - 44 - 8 })
        })

        it("respects the top-left margin", () => {
            expect(clampPosition({ x: -100, y: -100 }, size, VP, 8)).toEqual({ x: 8, y: 8 })
        })

        it("clamps a wide panel (larger than viewport) to the margin", () => {
            const panel = { width: 2000, height: 300 }
            const out = clampPosition({ x: 900, y: 400 }, panel, VP, 8)
            expect(out.x).toBe(8)
        })
    })

    describe("flyoutPlacement", () => {
        it("opens up-left from the bottom-right quadrant", () => {
            expect(flyoutPlacement({ x: 900, y: 700 }, VP)).toEqual({ openLeft: true, openUp: true })
        })
        it("opens down-right from the top-left quadrant", () => {
            expect(flyoutPlacement({ x: 100, y: 100 }, VP)).toEqual({ openLeft: false, openUp: false })
        })
        it("opens up-right from the bottom-left quadrant", () => {
            expect(flyoutPlacement({ x: 100, y: 700 }, VP)).toEqual({ openLeft: false, openUp: true })
        })
    })

    describe("centerOf", () => {
        it("computes the box center", () => {
            expect(centerOf({ x: 10, y: 20 }, { width: 44, height: 44 })).toEqual({ x: 32, y: 42 })
        })
    })
})

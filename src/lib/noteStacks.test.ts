import { describe, it, expect } from "vitest"
import {
    isoWeekYear,
    dateBucket,
    tokenize,
    similarityClusters,
    threadKeyOf,
    groupKeyOf,
    isStackView,
    type StackableNote,
} from "./noteStacks"

// Local-time constructor so buckets (which use local calendar fields) are stable
// regardless of the runner's timezone.
const at = (y: number, m: number, d: number, h = 12): number => new Date(y, m, d, h).getTime()

const note = (patch: Partial<StackableNote> & { createdAtMs: number }): StackableNote => ({
    id: "n1",
    ...patch,
})

describe("noteStacks", () => {
    describe("isStackView", () => {
        it("accepts known views and rejects anything else", () => {
            expect(isStackView("custom")).toBe(true)
            expect(isStackView("similar")).toBe(true)
            expect(isStackView("nope")).toBe(false)
            expect(isStackView(undefined)).toBe(false)
        })
    })

    describe("isoWeekYear", () => {
        it("computes a mid-year week", () => {
            // 2026-08-12 is a Wednesday in ISO week 33.
            expect(isoWeekYear(new Date(2026, 7, 12))).toEqual({ year: 2026, week: 33 })
        })

        it("assigns early-January days to the previous ISO year when they belong to it", () => {
            // 2027-01-01 is a Friday → ISO week 53 of 2026.
            expect(isoWeekYear(new Date(2027, 0, 1))).toEqual({ year: 2026, week: 53 })
        })

        it("assigns late-December days to the next ISO year when they belong to it", () => {
            // 2024-12-30 is a Monday → ISO week 1 of 2025.
            expect(isoWeekYear(new Date(2024, 11, 30))).toEqual({ year: 2025, week: 1 })
        })
    })

    describe("dateBucket", () => {
        it("buckets by day, month and year", () => {
            const ms = at(2026, 7, 12)
            expect(dateBucket(ms, "day")).toBe("d:2026-7-12")
            expect(dateBucket(ms, "month")).toBe("m:2026-7")
            expect(dateBucket(ms, "year")).toBe("y:2026")
        })

        it("separates different days in the same month", () => {
            expect(dateBucket(at(2026, 7, 12), "day")).not.toBe(dateBucket(at(2026, 7, 13), "day"))
        })

        it("keeps one ISO week together across a calendar-year boundary", () => {
            // Dec 31 2026 (Thu) and Jan 1 2027 (Fri) are the same ISO week.
            const dec = dateBucket(at(2026, 11, 31), "week")
            const jan = dateBucket(at(2027, 0, 1), "week")
            expect(dec).toBe(jan)
        })

        it("still separates genuinely different weeks", () => {
            expect(dateBucket(at(2026, 7, 12), "week")).not.toBe(dateBucket(at(2026, 7, 20), "week"))
        })
    })

    describe("tokenize", () => {
        it("keeps only significant (>3 char) words, lowercased", () => {
            expect(tokenize("Dinner at Luigi's", "It was so good")).toEqual(
                new Set(["dinner", "luigi", "good"]),
            )
        })
        it("handles missing fields", () => {
            expect(tokenize(undefined, undefined)).toEqual(new Set())
        })
    })

    describe("similarityClusters", () => {
        it("groups notes sharing enough significant words", () => {
            const notes: StackableNote[] = [
                { id: "a", title: "Pizza night", content: "Luigi restaurant was great", createdAtMs: at(2026, 0, 1) },
                { id: "b", title: "Pizza again", content: "Luigi restaurant repeat", createdAtMs: at(2026, 0, 2) },
            ]
            const map = similarityClusters(notes)
            expect(map.get("b")).toBe(map.get("a"))
        })

        it("leaves unrelated notes in their own clusters", () => {
            const notes: StackableNote[] = [
                { id: "a", title: "Pizza night", content: "Luigi restaurant", createdAtMs: at(2026, 0, 1) },
                { id: "b", title: "Hiking trail", content: "Mountain sunrise", createdAtMs: at(2026, 0, 2) },
            ]
            const map = similarityClusters(notes)
            expect(map.get("a")).toBe("a")
            expect(map.get("b")).toBe("b")
        })

        it("roots a cluster at its oldest note regardless of input order", () => {
            const notes: StackableNote[] = [
                { id: "new", title: "Pizza again", content: "Luigi restaurant repeat", createdAtMs: at(2026, 0, 9) },
                { id: "old", title: "Pizza night", content: "Luigi restaurant great", createdAtMs: at(2026, 0, 1) },
            ]
            const map = similarityClusters(notes)
            expect(map.get("new")).toBe("old")
            expect(map.get("old")).toBe("old")
        })

        it("ignores notes without an id", () => {
            const map = similarityClusters([{ title: "x", content: "y", createdAtMs: 0 }])
            expect(map.size).toBe(0)
        })

        it("returns an empty map for no notes", () => {
            expect(similarityClusters([]).size).toBe(0)
        })

        it("stays fast on a large, mostly-distinct board", () => {
            // Guards the inverted-index implementation: the previous
            // cluster-scanning version was quadratic and took ~150ms here.
            const notes: StackableNote[] = Array.from({ length: 1000 }, (_, i) => ({
                id: `n${i}`,
                title: `Subject ${i}`,
                content: `Distinct body text number ${i} about topic ${i}`,
                createdAtMs: at(2026, 0, 1) + i * 1000,
            }))
            const started = performance.now()
            const map = similarityClusters(notes)
            expect(map.size).toBe(1000)
            expect(performance.now() - started).toBeLessThan(150)
        })
    })

    describe("threadKeyOf", () => {
        it("prefers threadId, falls back to the note's own id", () => {
            expect(threadKeyOf({ id: "n1", threadId: "root" })).toBe("root")
            expect(threadKeyOf({ id: "n1" })).toBe("n1")
            expect(threadKeyOf({})).toBe("")
        })
    })

    describe("groupKeyOf", () => {
        it("uses manual threads for the custom view", () => {
            const n = note({ id: "n1", threadId: "root", createdAtMs: at(2026, 7, 12) })
            expect(groupKeyOf(n, "custom")).toBe("root")
        })

        it("uses date buckets for date views, ignoring thread links", () => {
            const n = note({ id: "n1", threadId: "root", createdAtMs: at(2026, 7, 12) })
            expect(groupKeyOf(n, "day")).toBe("d:2026-7-12")
        })

        it("uses the similarity map for the similar view", () => {
            const n = note({ id: "n1", createdAtMs: at(2026, 7, 12) })
            expect(groupKeyOf(n, "similar", new Map([["n1", "cluster"]]))).toBe("cluster")
        })

        it("falls back to the note id when similarity has no entry", () => {
            const n = note({ id: "n1", createdAtMs: at(2026, 7, 12) })
            expect(groupKeyOf(n, "similar", new Map())).toBe("n1")
        })
    })
})

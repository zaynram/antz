import { describe, it, expect } from "vitest"
import { parseJsonExport, parseUrlList, parseImport, excludeExisting } from "./queue-import"

const WATCH = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
const SHORT = "https://youtu.be/oHg5SJYRHA0"

describe("queue-import", () => {
    describe("parseJsonExport", () => {
        it("parses our own export shape", () => {
            const text = JSON.stringify({
                version: "1.0",
                videos: [{ id: "dQw4w9WgXcQ", title: "Never Gonna", url: WATCH, thumbnailUrl: "t.jpg" }],
            })
            const { candidates, skipped } = parseJsonExport(text)
            expect(skipped).toBe(0)
            expect(candidates).toHaveLength(1)
            expect(candidates[0]).toMatchObject({
                videoId: "dQw4w9WgXcQ",
                title: "Never Gonna",
                thumbnailUrl: "t.jpg",
            })
        })

        it("accepts a bare array of entries", () => {
            const text = JSON.stringify([{ url: WATCH, title: "A" }])
            expect(parseJsonExport(text).candidates.map(c => c.videoId)).toEqual(["dQw4w9WgXcQ"])
        })

        it("falls back to the video id when the url is missing", () => {
            const text = JSON.stringify({ videos: [{ id: "dQw4w9WgXcQ", title: "A" }] })
            expect(parseJsonExport(text).candidates[0].videoId).toBe("dQw4w9WgXcQ")
        })

        it("defaults a missing title rather than dropping the entry", () => {
            const text = JSON.stringify({ videos: [{ url: WATCH }] })
            expect(parseJsonExport(text).candidates[0].title).toBe("Untitled Video")
        })

        it("counts unusable entries as skipped", () => {
            const text = JSON.stringify({ videos: [{ url: "https://example.com/nope" }, { junk: true }] })
            const result = parseJsonExport(text)
            expect(result.candidates).toEqual([])
            expect(result.skipped).toBe(2)
        })

        it("returns nothing for malformed JSON", () => {
            expect(parseJsonExport("{not json").candidates).toEqual([])
        })
    })

    describe("parseUrlList", () => {
        it("parses one url per line and normalises short links", () => {
            const { candidates } = parseUrlList(`${WATCH}\n${SHORT}`)
            expect(candidates.map(c => c.videoId)).toEqual(["dQw4w9WgXcQ", "oHg5SJYRHA0"])
        })

        it("ignores blank lines and comments", () => {
            const { candidates, skipped } = parseUrlList(`\n# a comment\n${WATCH}\n\n`)
            expect(candidates).toHaveLength(1)
            expect(skipped).toBe(0)
        })

        it("counts non-YouTube lines as skipped", () => {
            const { candidates, skipped } = parseUrlList(`${WATCH}\nhttps://vimeo.com/123`)
            expect(candidates).toHaveLength(1)
            expect(skipped).toBe(1)
        })

        it("de-duplicates repeated videos", () => {
            const { candidates } = parseUrlList(`${WATCH}\n${WATCH}`)
            expect(candidates).toHaveLength(1)
        })
    })

    describe("parseImport", () => {
        it("detects a JSON export", () => {
            const text = JSON.stringify({ videos: [{ url: WATCH, title: "A" }] })
            expect(parseImport(text).candidates[0].title).toBe("A")
        })

        it("detects a url list", () => {
            expect(parseImport(`${WATCH}\n${SHORT}`).candidates).toHaveLength(2)
        })

        it("falls back to url scanning when JSON yields nothing usable", () => {
            expect(parseImport("{}").candidates).toEqual([])
        })

        it("returns nothing for empty input", () => {
            expect(parseImport("   ").candidates).toEqual([])
        })
    })

    describe("excludeExisting", () => {
        it("drops candidates already in the queue", () => {
            const { candidates } = parseUrlList(`${WATCH}\n${SHORT}`)
            const fresh = excludeExisting(candidates, ["dQw4w9WgXcQ"])
            expect(fresh.map(c => c.videoId)).toEqual(["oHg5SJYRHA0"])
        })

        it("keeps everything when the queue is empty", () => {
            const { candidates } = parseUrlList(WATCH)
            expect(excludeExisting(candidates, [])).toHaveLength(1)
        })
    })
})

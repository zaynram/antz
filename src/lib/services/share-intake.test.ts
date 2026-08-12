import { describe, it, expect } from "vitest"
import { readShare, extractFirstUrl, cleanSharedTitle, hasShareData } from "./share-intake"

const WATCH = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

describe("share-intake", () => {
    describe("extractFirstUrl", () => {
        it("finds a link inside surrounding text", () => {
            expect(extractFirstUrl(`look at this ${WATCH} it's great`)).toBe(WATCH)
        })
        it("trims trailing sentence punctuation", () => {
            expect(extractFirstUrl(`watch ${WATCH}.`)).toBe(WATCH)
        })
        it("returns the first of several links", () => {
            expect(extractFirstUrl(`${WATCH} and https://example.com`)).toBe(WATCH)
        })
        it("returns null when there is no link", () => {
            expect(extractFirstUrl("no links here")).toBeNull()
            expect(extractFirstUrl(null)).toBeNull()
        })
    })

    describe("cleanSharedTitle", () => {
        it("strips a platform suffix", () => {
            expect(cleanSharedTitle("Some Video - YouTube")).toBe("Some Video")
            expect(cleanSharedTitle("Some Video | YouTube")).toBe("Some Video")
        })
        it("strips share-sheet phrasing", () => {
            expect(cleanSharedTitle("Watch Some Video on YouTube")).toBe("Some Video")
        })
        it("rejects a title that is just the link", () => {
            expect(cleanSharedTitle(WATCH)).toBe("")
        })
        it("leaves an ordinary title alone", () => {
            expect(cleanSharedTitle("Cooking with Z")).toBe("Cooking with Z")
        })
        it("handles missing input", () => {
            expect(cleanSharedTitle(undefined)).toBe("")
        })
    })

    describe("readShare", () => {
        it("reads a well-formed share", () => {
            const link = readShare({ title: "Never Gonna - YouTube", url: WATCH })
            expect(link).toMatchObject({ videoId: "dQw4w9WgXcQ", title: "Never Gonna" })
        })

        it("finds the link when it was put in the text (Android style)", () => {
            const link = readShare({ title: "Never Gonna", text: `Check this out ${WATCH}` })
            expect(link?.videoId).toBe("dQw4w9WgXcQ")
            expect(link?.title).toBe("Never Gonna")
        })

        it("falls back to the text for a title when the title was the link", () => {
            const link = readShare({ title: WATCH, text: `A great clip ${WATCH}` })
            expect(link?.title).toBe("A great clip")
        })

        it("normalises a short link to canonical form", () => {
            const link = readShare({ url: "https://youtu.be/dQw4w9WgXcQ" })
            expect(link?.videoId).toBe("dQw4w9WgXcQ")
            expect(link?.url).toContain("dQw4w9WgXcQ")
        })

        it("accepts non-YouTube links without a video id", () => {
            const link = readShare({ title: "A post", url: "https://example.com/clip" })
            expect(link).toMatchObject({ url: "https://example.com/clip", title: "A post" })
            expect(link?.videoId).toBeUndefined()
        })

        it("returns an empty title when the share carried none", () => {
            expect(readShare({ url: WATCH })?.title).toBe("")
        })

        it("returns null for a share with no link", () => {
            expect(readShare({ title: "just a note", text: "nothing here" })).toBeNull()
            expect(readShare({})).toBeNull()
        })
    })

    describe("hasShareData", () => {
        it("reports whether a payload is actionable", () => {
            expect(hasShareData({ url: WATCH })).toBe(true)
            expect(hasShareData({ text: "hello" })).toBe(false)
        })
    })
})

import { describe, it, expect } from "vitest"
import { getIOSCompatibleImageUrl } from "./ios-images"

describe("iOS Image Utilities", () => {
    describe("getIOSCompatibleImageUrl", () => {
        it("should convert old uc?export=view URLs", () => {
            const oldUrl = "https://drive.google.com/uc?export=view&id=ABC123"
            const result = getIOSCompatibleImageUrl(oldUrl)
            expect(result).toMatch(/^https:\/\/drive\.google\.com\/thumbnail\?id=ABC123&sz=w400&timestamp=\d+$/)
        })

        it("should convert googleusercontent URLs", () => {
            const oldUrl = "https://lh3.googleusercontent.com/d/XYZ789"
            const result = getIOSCompatibleImageUrl(oldUrl)
            expect(result).toMatch(/^https:\/\/drive\.google\.com\/thumbnail\?id=XYZ789&sz=w400&timestamp=\d+$/)
        })

        it("should update thumbnail URLs with fresh timestamps", () => {
            const oldUrl = "https://drive.google.com/thumbnail?id=TEST456&sz=w400&timestamp=1234567890"
            const result = getIOSCompatibleImageUrl(oldUrl)
            expect(result).toMatch(/^https:\/\/drive\.google\.com\/thumbnail\?id=TEST456&sz=w400&timestamp=\d+$/)
            expect(result).not.toContain("timestamp=1234567890")
        })

        it("should return original URL if no file ID found", () => {
            const unknownUrl = "https://example.com/image.jpg"
            const result = getIOSCompatibleImageUrl(unknownUrl)
            expect(result).toBe(unknownUrl)
        })

        it("should handle empty strings", () => {
            const result = getIOSCompatibleImageUrl("")
            expect(result).toBe("")
        })

        it("should use uc?export=view for GIF files (ext parameter)", () => {
            const gifUrl = "https://drive.google.com/thumbnail?id=GIF123&sz=w400&timestamp=123456&ext=gif"
            const result = getIOSCompatibleImageUrl(gifUrl)
            expect(result).toMatch(/^https:\/\/drive\.google\.com\/uc\?export=view&id=GIF123&timestamp=\d+$/)
        })

        it("should use uc?export=view for GIF files (filename hint)", () => {
            const gifUrl = "https://drive.google.com/uc?export=view&id=GIF456&name=z_pfp.gif"
            const result = getIOSCompatibleImageUrl(gifUrl)
            expect(result).toMatch(/^https:\/\/drive\.google\.com\/uc\?export=view&id=GIF456&timestamp=\d+$/)
        })

        it("should use thumbnail endpoint for non-GIF images", () => {
            const jpgUrl = "https://drive.google.com/thumbnail?id=JPG123&sz=w400&timestamp=123456&ext=jpg"
            const result = getIOSCompatibleImageUrl(jpgUrl)
            expect(result).toMatch(/^https:\/\/drive\.google\.com\/thumbnail\?id=JPG123&sz=w400&timestamp=\d+$/)
        })

        it("should use thumbnail endpoint for PNG images", () => {
            const pngUrl = "https://drive.google.com/thumbnail?id=PNG123&sz=w400&timestamp=123456&ext=png"
            const result = getIOSCompatibleImageUrl(pngUrl)
            expect(result).toMatch(/^https:\/\/drive\.google\.com\/thumbnail\?id=PNG123&sz=w400&timestamp=\d+$/)
        })
    })
})

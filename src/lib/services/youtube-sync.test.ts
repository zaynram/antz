import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
    isYouTubeAPIConfigured,
    loadGoogleIdentityServices,
    fetchUserPlaylists,
    createPlaylist,
    fetchPlaylistItems,
    addVideoToPlaylist,
    removeVideoFromPlaylist,
} from "./youtube-sync"

// Mock config
vi.mock("../config", () => ({
    youtubeAPIConfig: {
        clientId: "test-client-id",
        scopes: ["https://www.googleapis.com/auth/youtube.readonly"],
    },
}))

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe("youtube-sync.ts", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockFetch.mockReset()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe("isYouTubeAPIConfigured", () => {
        it("should return true when clientId is configured", () => {
            expect(isYouTubeAPIConfigured()).toBe(true)
        })
    })

    describe("loadGoogleIdentityServices", () => {
        it("should return true if google.accounts.oauth2 already exists", async () => {
            // @ts-ignore - Mock window object
            global.window = {
                google: {
                    accounts: {
                        oauth2: {
                            initTokenClient: vi.fn(),
                        },
                    },
                },
            }

            const result = await loadGoogleIdentityServices()
            expect(result).toBe(true)
        })

        it("should load script and return true on success", async () => {
            // @ts-ignore - Mock window object
            global.window = {}

            const mockScript = {
                src: "",
                async: false,
                defer: false,
                onload: null as any,
                onerror: null as any,
            }

            const mockDocument = {
                createElement: vi.fn(() => mockScript),
                head: {
                    appendChild: vi.fn((script: typeof mockScript) => {
                        // Simulate successful load
                        setTimeout(() => script.onload?.(), 0)
                        return script
                    }),
                },
            }

            // @ts-ignore - Mock document object
            global.document = mockDocument

            const result = await loadGoogleIdentityServices()
            expect(result).toBe(true)
        })
    })

    describe("fetchUserPlaylists", () => {
        it("should fetch playlists successfully", async () => {
            const mockResponse = {
                items: [
                    {
                        id: "playlist1",
                        snippet: { title: "My Playlist", description: "Test" },
                        contentDetails: { itemCount: 10 },
                    },
                ],
            }

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            })

            const playlists = await fetchUserPlaylists("test-token")

            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining("playlists"),
                expect.objectContaining({
                    headers: { Authorization: "Bearer test-token" },
                })
            )
            expect(playlists).toHaveLength(1)
            expect(playlists[0].id).toBe("playlist1")
            expect(playlists[0].title).toBe("My Playlist")
        })

        it("should handle pagination", async () => {
            const mockResponse1 = {
                items: [{ id: "p1", snippet: { title: "P1" }, contentDetails: { itemCount: 5 } }],
                nextPageToken: "token2",
            }
            const mockResponse2 = {
                items: [{ id: "p2", snippet: { title: "P2" }, contentDetails: { itemCount: 3 } }],
            }

            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => mockResponse1,
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => mockResponse2,
                })

            const playlists = await fetchUserPlaylists("test-token")

            expect(mockFetch).toHaveBeenCalledTimes(2)
            expect(playlists).toHaveLength(2)
        })

        it("should return empty array on API error", async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 403,
            })

            const playlists = await fetchUserPlaylists("test-token")
            expect(playlists).toEqual([])
        })
    })

    describe("createPlaylist", () => {
        it("should create playlist and return id", async () => {
            const mockResponse = { id: "new-playlist-id" }

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            })

            const id = await createPlaylist("test-token", "New Playlist", "Description")

            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining("playlists"),
                expect.objectContaining({
                    method: "POST",
                    headers: expect.objectContaining({
                        Authorization: "Bearer test-token",
                    }),
                })
            )
            expect(id).toBe("new-playlist-id")
        })

        it("should return null if response missing id", async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({}),
            })

            const id = await createPlaylist("test-token", "New Playlist", "Description")
            expect(id).toBeNull()
        })

        it("should return null on API error", async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 400,
            })

            const id = await createPlaylist("test-token", "New Playlist", "Description")
            expect(id).toBeNull()
        })
    })

    describe("fetchPlaylistItems", () => {
        it("should fetch playlist items successfully", async () => {
            const mockResponse = {
                items: [
                    {
                        id: "item1",
                        contentDetails: { videoId: "video1" },
                        snippet: {
                            title: "Video 1",
                            thumbnails: { default: { url: "thumb1.jpg" } },
                        },
                    },
                ],
            }

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            })

            const items = await fetchPlaylistItems("test-token", "playlist-id")

            expect(items).toHaveLength(1)
            expect(items[0].videoId).toBe("video1")
            expect(items[0].title).toBe("Video 1")
        })

        it("should handle pagination correctly", async () => {
            const mockResponse1 = {
                items: [
                    {
                        id: "item1",
                        contentDetails: { videoId: "v1" },
                        snippet: { title: "Video 1" },
                    },
                ],
                nextPageToken: "token2",
            }
            const mockResponse2 = {
                items: [
                    {
                        id: "item2",
                        contentDetails: { videoId: "v2" },
                        snippet: { title: "Video 2" },
                    },
                ],
            }

            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => mockResponse1,
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => mockResponse2,
                })

            const items = await fetchPlaylistItems("test-token", "playlist-id")

            expect(items).toHaveLength(2)
            expect(items[0].position).toBe(0)
            expect(items[1].position).toBe(1)
        })
    })

    describe("addVideoToPlaylist", () => {
        it("should add video successfully", async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({}),
            })

            const success = await addVideoToPlaylist("test-token", "playlist-id", "video-id")

            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining("playlistItems"),
                expect.objectContaining({
                    method: "POST",
                })
            )
            expect(success).toBe(true)
        })

        it("should return false on API error", async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 400,
            })

            const success = await addVideoToPlaylist("test-token", "playlist-id", "video-id")
            expect(success).toBe(false)
        })
    })

    describe("removeVideoFromPlaylist", () => {
        it("should remove video successfully", async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
            })

            const success = await removeVideoFromPlaylist("test-token", "item-id")

            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining("playlistItems"),
                expect.objectContaining({
                    method: "DELETE",
                })
            )
            expect(success).toBe(true)
        })

        it("should return false on API error", async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
            })

            const success = await removeVideoFromPlaylist("test-token", "item-id")
            expect(success).toBe(false)
        })
    })
})

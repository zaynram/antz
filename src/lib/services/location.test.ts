import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { calculateDistance, formatDistance, type Coordinates } from "./location"

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Store original navigator
const originalNavigator = global.navigator

describe("location.ts", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockFetch.mockReset()
    })

    afterEach(() => {
        // Restore navigator
        Object.defineProperty(global, "navigator", {
            value: originalNavigator,
            writable: true,
        })
    })

    describe("calculateDistance", () => {
        it("should return 0 for same coordinates", () => {
            const coords: Coordinates = { lat: 40.7128, lng: -74.006 }
            expect(calculateDistance(coords, coords)).toBe(0)
        })

        it("should calculate distance in meters between NYC and LA", () => {
            const nyc: Coordinates = { lat: 40.7128, lng: -74.006 }
            const la: Coordinates = { lat: 34.0522, lng: -118.2437 }
            const distance = calculateDistance(nyc, la)
            // ~3944 km = ~3,944,000 m
            expect(distance).toBeGreaterThan(3900000)
            expect(distance).toBeLessThan(4000000)
        })

        it("should calculate short distances accurately", () => {
            // Two points ~1km apart
            const point1: Coordinates = { lat: 51.5074, lng: -0.1278 }
            const point2: Coordinates = { lat: 51.5164, lng: -0.1278 } // ~1km north
            const distance = calculateDistance(point1, point2)
            expect(distance).toBeGreaterThan(900)
            expect(distance).toBeLessThan(1100)
        })

        it("should be symmetric", () => {
            const a: Coordinates = { lat: 40.7128, lng: -74.006 }
            const b: Coordinates = { lat: 34.0522, lng: -118.2437 }
            expect(calculateDistance(a, b)).toBeCloseTo(calculateDistance(b, a), 5)
        })

        it("should handle negative coordinates", () => {
            const sydney: Coordinates = { lat: -33.8688, lng: 151.2093 }
            const auckland: Coordinates = { lat: -36.8485, lng: 174.7633 }
            const distance = calculateDistance(sydney, auckland)
            expect(distance).toBeGreaterThan(0)
        })
    })

    describe("formatDistance", () => {
        it("should format meters for distances < 1000m", () => {
            expect(formatDistance(500)).toBe("500m")
            expect(formatDistance(999)).toBe("999m")
            expect(formatDistance(50)).toBe("50m")
        })

        it("should format km with 1 decimal for distances < 10km", () => {
            expect(formatDistance(1000)).toBe("1.0km")
            expect(formatDistance(1500)).toBe("1.5km")
            expect(formatDistance(9900)).toBe("9.9km")
        })

        it("should format km rounded for distances >= 10km", () => {
            expect(formatDistance(10000)).toBe("10km")
            expect(formatDistance(15700)).toBe("16km")
            expect(formatDistance(100400)).toBe("100km")
        })

        it("should handle edge cases", () => {
            expect(formatDistance(0)).toBe("0m")
            expect(formatDistance(1)).toBe("1m")
        })
    })

    describe("getCurrentPosition", () => {
        it("should resolve with coordinates on success", async () => {
            const mockGeolocation = {
                getCurrentPosition: vi.fn(success => {
                    success({
                        coords: {
                            latitude: 40.7128,
                            longitude: -74.006,
                        },
                    })
                }),
            }
            Object.defineProperty(global, "navigator", {
                value: { geolocation: mockGeolocation },
                writable: true,
            })

            const { getCurrentPosition } = await import("./location")
            const result = await getCurrentPosition()

            expect(result).toEqual({ lat: 40.7128, lng: -74.006 })
        })

        it("should reject when geolocation not supported", async () => {
            Object.defineProperty(global, "navigator", {
                value: { geolocation: undefined },
                writable: true,
            })

            // Re-import to get fresh module
            vi.resetModules()
            const { getCurrentPosition } = await import("./location")

            await expect(getCurrentPosition()).rejects.toThrow("Geolocation not supported")
        })

        it("should reject with permission denied error", async () => {
            const mockGeolocation = {
                getCurrentPosition: vi.fn((_success, error) => {
                    // Mock error needs PERMISSION_DENIED constant to match against
                    const mockError = { code: 1, message: "User denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }
                    error(mockError)
                }),
            }
            Object.defineProperty(global, "navigator", {
                value: { geolocation: mockGeolocation },
                writable: true,
            })

            vi.resetModules()
            const { getCurrentPosition } = await import("./location")

            await expect(getCurrentPosition()).rejects.toThrow("Location permission denied")
        })

        it("should reject with unavailable error", async () => {
            const mockGeolocation = {
                getCurrentPosition: vi.fn((_success, error) => {
                    const mockError = { code: 2, message: "Position unavailable", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }
                    error(mockError)
                }),
            }
            Object.defineProperty(global, "navigator", {
                value: { geolocation: mockGeolocation },
                writable: true,
            })

            vi.resetModules()
            const { getCurrentPosition } = await import("./location")

            await expect(getCurrentPosition()).rejects.toThrow("Location unavailable")
        })

        it("should reject with timeout error", async () => {
            const mockGeolocation = {
                getCurrentPosition: vi.fn((_success, error) => {
                    const mockError = { code: 3, message: "Timeout", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }
                    error(mockError)
                }),
            }
            Object.defineProperty(global, "navigator", {
                value: { geolocation: mockGeolocation },
                writable: true,
            })

            vi.resetModules()
            const { getCurrentPosition } = await import("./location")

            await expect(getCurrentPosition()).rejects.toThrow("Location request timed out")
        })
    })

    describe("geocode", () => {
        beforeEach(() => {
            vi.resetModules()
        })

        it("should return geocoded locations from Nominatim", async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => [
                    {
                        lat: "40.7128",
                        lon: "-74.006",
                        display_name: "New York, NY, USA",
                        address: {
                            city: "New York",
                            state: "New York",
                            country: "USA",
                        },
                    },
                ],
            })

            const { geocode } = await import("./location")
            const results = await geocode("New York")

            expect(results).toHaveLength(1)
            expect(results[0].coordinates).toEqual({ lat: 40.7128, lng: -74.006 })
            expect(results[0].displayName).toBe("New York, NY, USA")
            expect(results[0].address?.city).toBe("New York")
        })

        it("should throw on failed response", async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
            })

            const { geocode } = await import("./location")
            await expect(geocode("Invalid")).rejects.toThrow("Geocoding failed: 500")
        })

        it("should return empty array for no results", async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => [],
            })

            const { geocode } = await import("./location")
            const results = await geocode("xyznonexistent")
            expect(results).toHaveLength(0)
        })
    })

    describe("reverseGeocode", () => {
        beforeEach(() => {
            vi.resetModules()
        })

        it("should return location for valid coordinates", async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    display_name: "Central Park, New York, NY",
                    address: {
                        city: "New York",
                        state: "New York",
                        country: "USA",
                    },
                }),
            })

            const { reverseGeocode } = await import("./location")
            const result = await reverseGeocode({ lat: 40.7829, lng: -73.9654 })

            expect(result).not.toBeNull()
            expect(result?.displayName).toBe("Central Park, New York, NY")
            expect(result?.address?.city).toBe("New York")
        })

        it("should return null for error response from API", async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ error: "Unable to geocode" }),
            })

            const { reverseGeocode } = await import("./location")
            const result = await reverseGeocode({ lat: 0, lng: 0 })
            expect(result).toBeNull()
        })

        it("should throw on failed HTTP response", async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 503,
            })

            const { reverseGeocode } = await import("./location")
            await expect(reverseGeocode({ lat: 40.7128, lng: -74.006 })).rejects.toThrow(
                "Reverse geocoding failed: 503"
            )
        })
    })

    describe("searchNearbyPlaces", () => {
        beforeEach(() => {
            vi.resetModules()
        })

        it("should return places from Overpass API", async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    elements: [
                        {
                            id: 12345,
                            lat: 40.758,
                            lon: -73.9855,
                            tags: {
                                name: "Times Square Diner",
                                "addr:street": "Broadway",
                                "addr:city": "New York",
                            },
                        },
                    ],
                }),
            })

            const { searchNearbyPlaces } = await import("./location")
            const center = { lat: 40.7589, lng: -73.9851 }
            const results = await searchNearbyPlaces(center, "restaurant", 1000)

            expect(results).toHaveLength(1)
            expect(results[0].name).toBe("Times Square Diner")
            expect(results[0].category).toBe("restaurant")
            expect(results[0].distance).toBeGreaterThan(0)
        })

        it("should filter out places without names", async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    elements: [
                        { id: 1, lat: 40.75, lon: -73.98, tags: { name: "Named Place" } },
                        { id: 2, lat: 40.76, lon: -73.99, tags: {} }, // No name
                    ],
                }),
            })

            const { searchNearbyPlaces } = await import("./location")
            const results = await searchNearbyPlaces({ lat: 40.75, lng: -73.98 }, "cafe")

            expect(results).toHaveLength(1)
            expect(results[0].name).toBe("Named Place")
        })

        it("should sort results by distance", async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    elements: [
                        { id: 1, lat: 40.8, lon: -73.98, tags: { name: "Far Place" } },
                        { id: 2, lat: 40.7501, lon: -73.9801, tags: { name: "Close Place" } },
                    ],
                }),
            })

            const { searchNearbyPlaces } = await import("./location")
            const results = await searchNearbyPlaces({ lat: 40.75, lng: -73.98 }, "restaurant")

            expect(results[0].name).toBe("Close Place")
            expect(results[1].name).toBe("Far Place")
        })

        it("should throw on failed response", async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 429,
            })

            const { searchNearbyPlaces } = await import("./location")
            await expect(searchNearbyPlaces({ lat: 40.75, lng: -73.98 }, "bar")).rejects.toThrow(
                "Overpass query failed: 429"
            )
        })
    })

    describe("searchPlacesByName", () => {
        beforeEach(() => {
            vi.resetModules()
        })

        it("should search places by name using Nominatim", async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => [
                    {
                        place_id: 123,
                        display_name: "Central Park, Manhattan, New York",
                        lat: "40.7829",
                        lon: "-73.9654",
                        class: "leisure",
                        type: "park",
                    },
                ],
            })

            const { searchPlacesByName } = await import("./location")
            const results = await searchPlacesByName("Central Park")

            expect(results).toHaveLength(1)
            expect(results[0].name).toBe("Central Park")
            expect(results[0].category).toBe("park")
        })

        it("should calculate distance when nearCoords provided", async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => [
                    {
                        place_id: 123,
                        display_name: "Test Place",
                        lat: "40.7829",
                        lon: "-73.9654",
                        class: "amenity",
                        type: "restaurant",
                    },
                ],
            })

            const { searchPlacesByName } = await import("./location")
            const nearCoords = { lat: 40.7128, lng: -74.006 }
            const results = await searchPlacesByName("Test Place", nearCoords)

            expect(results[0].distance).toBeGreaterThan(0)
        })

        it("should map OSM types to categories correctly", async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => [
                    {
                        place_id: 1,
                        display_name: "A",
                        lat: "0",
                        lon: "0",
                        class: "amenity",
                        type: "restaurant",
                    },
                    {
                        place_id: 2,
                        display_name: "B",
                        lat: "0",
                        lon: "0",
                        class: "amenity",
                        type: "cafe",
                    },
                    {
                        place_id: 3,
                        display_name: "C",
                        lat: "0",
                        lon: "0",
                        class: "amenity",
                        type: "bar",
                    },
                    {
                        place_id: 4,
                        display_name: "D",
                        lat: "0",
                        lon: "0",
                        class: "tourism",
                        type: "museum",
                    },
                ],
            })

            const { searchPlacesByName } = await import("./location")
            const results = await searchPlacesByName("test")

            expect(results[0].category).toBe("restaurant")
            expect(results[1].category).toBe("cafe")
            expect(results[2].category).toBe("bar")
            expect(results[3].category).toBe("attraction")
        })
    })
})

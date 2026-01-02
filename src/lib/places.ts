import { googleMapsConfig } from './config'
import type { GeoLocation, PlaceCategory } from './types'

// Browser Geolocation API wrapper
export async function getCurrentLocation(): Promise<GeoLocation> {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocation not supported by browser'))
            return
        }

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude: lat, longitude: lng } = position.coords
                const address = await reverseGeocode({ lat, lng }).catch(() => undefined)
                resolve({ lat, lng, address })
            },
            (error) => {
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        reject(new Error('Location permission denied'))
                        break
                    case error.POSITION_UNAVAILABLE:
                        reject(new Error('Location unavailable'))
                        break
                    case error.TIMEOUT:
                        reject(new Error('Location request timed out'))
                        break
                    default:
                        reject(new Error('Failed to get location'))
                }
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
        )
    })
}

// Reverse geocode coordinates to address using Nominatim (free, no API key needed)
export async function reverseGeocode(location: GeoLocation): Promise<string | undefined> {
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${location.lat}&lon=${location.lng}&format=json`,
            { headers: { 'Accept-Language': 'en' } }
        )
        if (!response.ok) return undefined
        const data = await response.json()
        // Return a readable address (city, state/region, country)
        const { city, town, village, suburb, state, country } = data.address || {}
        const locality = city || town || village || suburb || ''
        return [locality, state, country].filter(Boolean).join(', ')
    } catch {
        return undefined
    }
}

// Forward geocode address to coordinates using Nominatim
export async function geocodeAddress(address: string): Promise<GeoLocation | null> {
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`,
            { headers: { 'Accept-Language': 'en' } }
        )
        if (!response.ok) return null
        const data = await response.json()
        if (data.length === 0) return null
        return {
            lat: parseFloat(data[0].lat),
            lng: parseFloat(data[0].lon),
            address: data[0].display_name
        }
    } catch {
        return null
    }
}

// Google Places API types
export interface GooglePlaceResult {
    place_id: string
    name: string
    formatted_address?: string
    geometry: {
        location: { lat: number; lng: number }
    }
    types: string[]
    rating?: number
    user_ratings_total?: number
    opening_hours?: { open_now: boolean }
    photos?: Array<{ photo_reference: string }>
    price_level?: number
}

export interface PlaceSuggestion {
    placeId: string
    name: string
    address?: string
    location: GeoLocation
    category: PlaceCategory
    rating?: number
    ratingsCount?: number
    isOpenNow?: boolean
    photoUrl?: string
    priceLevel?: number
    distance?: number
}

// Map Google place types to our categories
function mapGoogleTypeToCategory(types: string[]): PlaceCategory {
    if (types.includes('restaurant') || types.includes('food')) return 'restaurant'
    if (types.includes('cafe')) return 'cafe'
    if (types.includes('bar') || types.includes('night_club')) return 'bar'
    if (types.includes('park')) return 'park'
    if (types.includes('tourist_attraction') || types.includes('museum') || 
        types.includes('amusement_park') || types.includes('zoo')) return 'attraction'
    return 'other'
}

// Map our category to Google place type
function mapCategoryToGoogleType(category: PlaceCategory): string {
    switch (category) {
        case 'restaurant': return 'restaurant'
        case 'cafe': return 'cafe'
        case 'bar': return 'bar'
        case 'park': return 'park'
        case 'attraction': return 'tourist_attraction'
        default: return 'point_of_interest'
    }
}

// Check if Google Maps API is configured
export function isGoogleMapsConfigured(): boolean {
    return Boolean(googleMapsConfig.apiKey)
}

// Search for nearby places using Google Places API
export async function searchNearbyPlaces(
    location: GeoLocation,
    category: PlaceCategory,
    radiusKm: number = 5
): Promise<PlaceSuggestion[]> {
    if (!isGoogleMapsConfigured()) {
        console.warn('Google Maps API key not configured. Place suggestions unavailable.')
        return []
    }

    const type = mapCategoryToGoogleType(category)
    const radiusMeters = radiusKm * 1000

    try {
        // Note: Direct API calls from browser require CORS proxy or use Places SDK
        // For production, you'd use the Google Maps JavaScript API's PlacesService
        // This is a simplified implementation for demonstration
        const url = `${googleMapsConfig.placesApiUrl}/nearbysearch/json?` +
            `location=${location.lat},${location.lng}&` +
            `radius=${radiusMeters}&` +
            `type=${type}&` +
            `key=${googleMapsConfig.apiKey}`

        const response = await fetch(url)
        if (!response.ok) return []

        const data = await response.json()
        if (data.status !== 'OK') return []

        return (data.results as GooglePlaceResult[]).map(place => ({
            placeId: place.place_id,
            name: place.name,
            address: place.formatted_address,
            location: {
                lat: place.geometry.location.lat,
                lng: place.geometry.location.lng
            },
            category: mapGoogleTypeToCategory(place.types),
            rating: place.rating,
            ratingsCount: place.user_ratings_total,
            isOpenNow: place.opening_hours?.open_now,
            photoUrl: place.photos?.[0] 
                ? `${googleMapsConfig.placesApiUrl}/photo?maxwidth=400&photo_reference=${place.photos[0].photo_reference}&key=${googleMapsConfig.apiKey}`
                : undefined,
            priceLevel: place.price_level
        }))
    } catch (error) {
        console.error('Failed to search nearby places:', error)
        return []
    }
}

// Text search for places (autocomplete-style)
export async function searchPlaces(
    query: string,
    location?: GeoLocation
): Promise<PlaceSuggestion[]> {
    if (!isGoogleMapsConfigured()) {
        return []
    }

    try {
        let url = `${googleMapsConfig.placesApiUrl}/textsearch/json?` +
            `query=${encodeURIComponent(query)}&` +
            `key=${googleMapsConfig.apiKey}`

        if (location) {
            url += `&location=${location.lat},${location.lng}&radius=50000`
        }

        const response = await fetch(url)
        if (!response.ok) return []

        const data = await response.json()
        if (data.status !== 'OK') return []

        return (data.results as GooglePlaceResult[]).slice(0, 10).map(place => ({
            placeId: place.place_id,
            name: place.name,
            address: place.formatted_address,
            location: {
                lat: place.geometry.location.lat,
                lng: place.geometry.location.lng
            },
            category: mapGoogleTypeToCategory(place.types),
            rating: place.rating,
            ratingsCount: place.user_ratings_total,
            priceLevel: place.price_level
        }))
    } catch (error) {
        console.error('Failed to search places:', error)
        return []
    }
}

/**
 * Location services using free APIs (Nominatim/Overpass from OpenStreetMap)
 * 
 * Rate limits:
 * - Nominatim: 1 request/second (we debounce to 1.5s for safety)
 * - Overpass: No strict limit but be reasonable
 * 
 * No API keys required.
 */

import type { PlaceCategory } from '$lib/types';

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface GeocodedLocation {
  coordinates: Coordinates;
  displayName: string;
  address?: {
    road?: string;
    city?: string;
    state?: string;
    country?: string;
    postcode?: string;
  };
}

export interface PlaceSuggestion {
  id: string;
  name: string;
  category: PlaceCategory;
  coordinates: Coordinates;
  distance: number; // meters
  address?: string;
  tags?: Record<string, string>;
  priceLevel?: number; // 0-4 scale for budget (not available from free OSM API)
}

// Nominatim endpoint (OSM geocoding)
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
// Overpass endpoint (OSM POI queries)
const OVERPASS_BASE = 'https://overpass-api.de/api/interpreter';

// User-Agent required by Nominatim ToS
const USER_AGENT = 'AntzCouplesApp/1.0';

// Rate limiting state
let lastNominatimRequest = 0;
const NOMINATIM_DELAY_MS = 1500;

async function rateLimitedNominatimFetch(url: string): Promise<Response> {
  const now = Date.now();
  const elapsed = now - lastNominatimRequest;
  if (elapsed < NOMINATIM_DELAY_MS) {
    await new Promise(resolve => setTimeout(resolve, NOMINATIM_DELAY_MS - elapsed));
  }
  lastNominatimRequest = Date.now();
  
  return fetch(url, {
    headers: { 'User-Agent': USER_AGENT }
  });
}

/**
 * Get current position from browser Geolocation API
 */
export function getCurrentPosition(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            reject(new Error('Location permission denied'));
            break;
          case error.POSITION_UNAVAILABLE:
            reject(new Error('Location unavailable'));
            break;
          case error.TIMEOUT:
            reject(new Error('Location request timed out'));
            break;
          default:
            reject(new Error('Unknown location error'));
        }
      },
      {
        enableHighAccuracy: false, // Faster, good enough for city-level
        timeout: 10000,
        maximumAge: 300000 // 5 min cache
      }
    );
  });
}

/**
 * Geocode an address/place name to coordinates
 */
export async function geocode(query: string): Promise<GeocodedLocation[]> {
  const url = `${NOMINATIM_BASE}/search?` + new URLSearchParams({
    q: query,
    format: 'json',
    addressdetails: '1',
    limit: '5'
  });

  const response = await rateLimitedNominatimFetch(url);
  if (!response.ok) {
    throw new Error(`Geocoding failed: ${response.status}`);
  }

  const results = await response.json();
  
  return results.map((r: {
    lat: string;
    lon: string;
    display_name: string;
    address?: {
      road?: string;
      city?: string;
      town?: string;
      village?: string;
      state?: string;
      country?: string;
      postcode?: string;
    };
  }) => ({
    coordinates: {
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon)
    },
    displayName: r.display_name,
    address: r.address ? {
      road: r.address.road,
      city: r.address.city || r.address.town || r.address.village,
      state: r.address.state,
      country: r.address.country,
      postcode: r.address.postcode
    } : undefined
  }));
}

/**
 * Reverse geocode coordinates to address
 */
export async function reverseGeocode(coords: Coordinates): Promise<GeocodedLocation | null> {
  const url = `${NOMINATIM_BASE}/reverse?` + new URLSearchParams({
    lat: coords.lat.toString(),
    lon: coords.lng.toString(),
    format: 'json',
    addressdetails: '1'
  });

  const response = await rateLimitedNominatimFetch(url);
  if (!response.ok) {
    throw new Error(`Reverse geocoding failed: ${response.status}`);
  }

  const r = await response.json();
  
  if (r.error) {
    return null;
  }

  return {
    coordinates: coords,
    displayName: r.display_name,
    address: r.address ? {
      road: r.address.road,
      city: r.address.city || r.address.town || r.address.village,
      state: r.address.state,
      country: r.address.country,
      postcode: r.address.postcode
    } : undefined
  };
}

/**
 * Calculate distance between two coordinates (Haversine formula)
 * Returns distance in meters
 */
export function calculateDistance(a: Coordinates, b: Coordinates): number {
  const R = 6371000; // Earth radius in meters
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));

  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Format distance for display
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  const km = meters / 1000;
  if (km < 10) {
    return `${km.toFixed(1)}km`;
  }
  return `${Math.round(km)}km`;
}

// Map our categories to OSM amenity/leisure/tourism tags
const CATEGORY_TO_OSM: Record<PlaceCategory, string[]> = {
  restaurant: ['amenity=restaurant', 'amenity=fast_food'],
  cafe: ['amenity=cafe'],
  bar: ['amenity=bar', 'amenity=pub'],
  attraction: ['tourism=attraction', 'tourism=museum', 'tourism=theme_park', 'tourism=zoo'],
  park: ['leisure=park', 'leisure=garden', 'leisure=nature_reserve'],
  other: ['tourism=viewpoint', 'amenity=cinema', 'amenity=theatre']
};

/**
 * Search for nearby places using Overpass API
 */
export async function searchNearbyPlaces(
  center: Coordinates,
  category: PlaceCategory,
  radiusMeters: number = 5000
): Promise<PlaceSuggestion[]> {
  const osmTags = CATEGORY_TO_OSM[category];
  
  // Build Overpass query for multiple tags
  const tagQueries = osmTags.map(tag => {
    const [key, value] = tag.split('=');
    return `node[${key}=${value}](around:${radiusMeters},${center.lat},${center.lng});`;
  }).join('\n');

  const query = `
    [out:json][timeout:25];
    (
      ${tagQueries}
    );
    out body;
  `;

  const response = await fetch(OVERPASS_BASE, {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });

  if (!response.ok) {
    throw new Error(`Overpass query failed: ${response.status}`);
  }

  const data = await response.json();
  
  return data.elements
    .filter((el: { tags?: { name?: string } }) => el.tags?.name) // Must have a name
    .map((el: { id: number; lat: number; lon: number; tags: Record<string, string> }) => {
      const coords: Coordinates = { lat: el.lat, lng: el.lon };
      return {
        id: `osm-${el.id}`,
        name: el.tags.name,
        category,
        coordinates: coords,
        distance: calculateDistance(center, coords),
        address: formatOsmAddress(el.tags),
        tags: el.tags
      };
    })
    .sort((a: PlaceSuggestion, b: PlaceSuggestion) => a.distance - b.distance);
}

function formatOsmAddress(tags: Record<string, string>): string | undefined {
  const parts: string[] = [];
  if (tags['addr:housenumber'] && tags['addr:street']) {
    parts.push(`${tags['addr:housenumber']} ${tags['addr:street']}`);
  } else if (tags['addr:street']) {
    parts.push(tags['addr:street']);
  }
  if (tags['addr:city']) {
    parts.push(tags['addr:city']);
  }
  return parts.length > 0 ? parts.join(', ') : undefined;
}

/**
 * Search for places by name (general search, not category-specific)
 */
export async function searchPlacesByName(
  query: string,
  nearCoords?: Coordinates,
  limit: number = 10
): Promise<PlaceSuggestion[]> {
  // Use Nominatim for name search
  const params: Record<string, string> = {
    q: query,
    format: 'json',
    addressdetails: '1',
    limit: limit.toString()
  };

  // Bias results toward coordinates if provided
  if (nearCoords) {
    params.viewbox = [
      nearCoords.lng - 0.5,
      nearCoords.lat + 0.5,
      nearCoords.lng + 0.5,
      nearCoords.lat - 0.5
    ].join(',');
    params.bounded = '0'; // Prefer but don't restrict
  }

  const url = `${NOMINATIM_BASE}/search?` + new URLSearchParams(params);
  const response = await rateLimitedNominatimFetch(url);
  
  if (!response.ok) {
    throw new Error(`Place search failed: ${response.status}`);
  }

  const results = await response.json();
  
  return results.map((r: {
    place_id: number;
    display_name: string;
    lat: string;
    lon: string;
    class: string;
    type: string;
  }) => {
    const coords: Coordinates = {
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon)
    };
    return {
      id: `nominatim-${r.place_id}`,
      name: r.display_name.split(',')[0], // First part is usually the name
      category: mapOsmTypeToCategory(r.class, r.type),
      coordinates: coords,
      distance: nearCoords ? calculateDistance(nearCoords, coords) : 0,
      address: r.display_name
    };
  });
}

function mapOsmTypeToCategory(osmClass: string, osmType: string): PlaceCategory {
  if (osmType === 'restaurant' || osmType === 'fast_food') return 'restaurant';
  if (osmType === 'cafe') return 'cafe';
  if (osmType === 'bar' || osmType === 'pub') return 'bar';
  if (osmClass === 'tourism') return 'attraction';
  if (osmClass === 'leisure' && (osmType === 'park' || osmType === 'garden')) return 'park';
  return 'other';
}

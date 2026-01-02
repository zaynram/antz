import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock config before importing module
vi.mock('./config', () => ({
  googleMapsConfig: {
    apiKey: 'test-google-api-key',
    placesApiUrl: 'https://maps.googleapis.com/maps/api/place'
  }
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Store original navigator
const originalNavigator = global.navigator;

describe('places.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  afterEach(() => {
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true
    });
  });

  describe('isGoogleMapsConfigured', () => {
    it('should return true when API key is set', async () => {
      const { isGoogleMapsConfigured } = await import('./places');
      expect(isGoogleMapsConfigured()).toBe(true);
    });
  });

  describe('getCurrentLocation', () => {
    it('should resolve with location on success', async () => {
      const mockGeolocation = {
        getCurrentPosition: vi.fn((success) => {
          success({
            coords: {
              latitude: 40.7128,
              longitude: -74.006
            }
          });
        })
      };
      Object.defineProperty(global, 'navigator', {
        value: { geolocation: mockGeolocation },
        writable: true
      });

      // Mock reverse geocode
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          address: {
            city: 'New York',
            state: 'NY',
            country: 'USA'
          }
        })
      });

      vi.resetModules();
      const { getCurrentLocation } = await import('./places');
      const result = await getCurrentLocation();
      
      expect(result.lat).toBe(40.7128);
      expect(result.lng).toBe(-74.006);
    });

    it('should reject when geolocation not supported', async () => {
      Object.defineProperty(global, 'navigator', {
        value: { geolocation: undefined },
        writable: true
      });

      vi.resetModules();
      const { getCurrentLocation } = await import('./places');
      
      await expect(getCurrentLocation()).rejects.toThrow('Geolocation not supported by browser');
    });

    it('should reject with permission denied error', async () => {
      const mockGeolocation = {
        getCurrentPosition: vi.fn((_success, error) => {
          error({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
        })
      };
      Object.defineProperty(global, 'navigator', {
        value: { geolocation: mockGeolocation },
        writable: true
      });

      vi.resetModules();
      const { getCurrentLocation } = await import('./places');
      
      await expect(getCurrentLocation()).rejects.toThrow('Location permission denied');
    });

    it('should reject with unavailable error', async () => {
      const mockGeolocation = {
        getCurrentPosition: vi.fn((_success, error) => {
          error({ code: 2, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
        })
      };
      Object.defineProperty(global, 'navigator', {
        value: { geolocation: mockGeolocation },
        writable: true
      });

      vi.resetModules();
      const { getCurrentLocation } = await import('./places');
      
      await expect(getCurrentLocation()).rejects.toThrow('Location unavailable');
    });

    it('should reject with timeout error', async () => {
      const mockGeolocation = {
        getCurrentPosition: vi.fn((_success, error) => {
          error({ code: 3, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
        })
      };
      Object.defineProperty(global, 'navigator', {
        value: { geolocation: mockGeolocation },
        writable: true
      });

      vi.resetModules();
      const { getCurrentLocation } = await import('./places');
      
      await expect(getCurrentLocation()).rejects.toThrow('Location request timed out');
    });
  });

  describe('reverseGeocode', () => {
    it('should return formatted address', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          address: {
            city: 'New York',
            state: 'NY',
            country: 'USA'
          }
        })
      });

      vi.resetModules();
      const { reverseGeocode } = await import('./places');
      const address = await reverseGeocode({ lat: 40.7128, lng: -74.006 });
      
      expect(address).toBe('New York, NY, USA');
    });

    it('should handle town/village fallback', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          address: {
            village: 'Small Town',
            country: 'USA'
          }
        })
      });

      vi.resetModules();
      const { reverseGeocode } = await import('./places');
      const address = await reverseGeocode({ lat: 40, lng: -74 });
      
      expect(address).toBe('Small Town, USA');
    });

    it('should return undefined on error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false
      });

      vi.resetModules();
      const { reverseGeocode } = await import('./places');
      const address = await reverseGeocode({ lat: 0, lng: 0 });
      
      expect(address).toBeUndefined();
    });

    it('should return undefined on fetch failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      vi.resetModules();
      const { reverseGeocode } = await import('./places');
      const address = await reverseGeocode({ lat: 0, lng: 0 });
      
      expect(address).toBeUndefined();
    });
  });

  describe('geocodeAddress', () => {
    it('should return coordinates for valid address', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{
          lat: '40.7128',
          lon: '-74.006',
          display_name: 'New York, NY, USA'
        }]
      });

      vi.resetModules();
      const { geocodeAddress } = await import('./places');
      const location = await geocodeAddress('New York');
      
      expect(location).not.toBeNull();
      expect(location?.lat).toBe(40.7128);
      expect(location?.lng).toBe(-74.006);
      expect(location?.address).toBe('New York, NY, USA');
    });

    it('should return null for no results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => []
      });

      vi.resetModules();
      const { geocodeAddress } = await import('./places');
      const location = await geocodeAddress('xyznonexistent');
      
      expect(location).toBeNull();
    });

    it('should return null on error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false
      });

      vi.resetModules();
      const { geocodeAddress } = await import('./places');
      const location = await geocodeAddress('test');
      
      expect(location).toBeNull();
    });

    it('should return null on fetch failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      vi.resetModules();
      const { geocodeAddress } = await import('./places');
      const location = await geocodeAddress('test');
      
      expect(location).toBeNull();
    });
  });

  describe('searchNearbyPlaces', () => {
    it('should return places from Google Places API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'OK',
          results: [
            {
              place_id: 'abc123',
              name: 'Test Restaurant',
              formatted_address: '123 Main St',
              geometry: { location: { lat: 40.7128, lng: -74.006 } },
              types: ['restaurant', 'food'],
              rating: 4.5,
              user_ratings_total: 200,
              opening_hours: { open_now: true },
              price_level: 2
            }
          ]
        })
      });

      vi.resetModules();
      const { searchNearbyPlaces } = await import('./places');
      const results = await searchNearbyPlaces(
        { lat: 40.7128, lng: -74.006 },
        'restaurant'
      );
      
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Test Restaurant');
      expect(results[0].category).toBe('restaurant');
      expect(results[0].rating).toBe(4.5);
      expect(results[0].isOpenNow).toBe(true);
      expect(results[0].priceLevel).toBe(2);
    });

    it('should map various place types correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'OK',
          results: [
            { place_id: '1', name: 'A', geometry: { location: { lat: 0, lng: 0 } }, types: ['cafe'] },
            { place_id: '2', name: 'B', geometry: { location: { lat: 0, lng: 0 } }, types: ['bar'] },
            { place_id: '3', name: 'C', geometry: { location: { lat: 0, lng: 0 } }, types: ['park'] },
            { place_id: '4', name: 'D', geometry: { location: { lat: 0, lng: 0 } }, types: ['museum'] },
          ]
        })
      });

      vi.resetModules();
      const { searchNearbyPlaces } = await import('./places');
      const results = await searchNearbyPlaces({ lat: 0, lng: 0 }, 'restaurant');
      
      expect(results[0].category).toBe('cafe');
      expect(results[1].category).toBe('bar');
      expect(results[2].category).toBe('park');
      expect(results[3].category).toBe('attraction');
    });

    it('should return empty array on non-OK status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ZERO_RESULTS', results: [] })
      });

      vi.resetModules();
      const { searchNearbyPlaces } = await import('./places');
      const results = await searchNearbyPlaces({ lat: 0, lng: 0 }, 'restaurant');
      
      expect(results).toEqual([]);
    });

    it('should return empty array on fetch error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      vi.resetModules();
      const { searchNearbyPlaces } = await import('./places');
      const results = await searchNearbyPlaces({ lat: 0, lng: 0 }, 'restaurant');
      
      expect(results).toEqual([]);
    });

    it('should use correct radius in meters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'OK', results: [] })
      });

      vi.resetModules();
      const { searchNearbyPlaces } = await import('./places');
      await searchNearbyPlaces({ lat: 40, lng: -74 }, 'restaurant', 10);
      
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('radius=10000') // 10km = 10000m
      );
    });
  });

  describe('searchPlaces', () => {
    it('should search places by text query', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'OK',
          results: [
            {
              place_id: 'xyz789',
              name: 'Central Park',
              formatted_address: 'New York, NY',
              geometry: { location: { lat: 40.7829, lng: -73.9654 } },
              types: ['park'],
              rating: 4.8
            }
          ]
        })
      });

      vi.resetModules();
      const { searchPlaces } = await import('./places');
      const results = await searchPlaces('Central Park');
      
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Central Park');
      expect(results[0].category).toBe('park');
    });

    it('should bias results by location when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'OK', results: [] })
      });

      vi.resetModules();
      const { searchPlaces } = await import('./places');
      await searchPlaces('restaurant', { lat: 40.7128, lng: -74.006 });
      
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('location=40.7128,-74.006')
      );
    });

    it('should return empty array on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      vi.resetModules();
      const { searchPlaces } = await import('./places');
      const results = await searchPlaces('test');
      
      expect(results).toEqual([]);
    });

    it('should limit results to 10', async () => {
      const manyResults = Array(20).fill(null).map((_, i) => ({
        place_id: `id${i}`,
        name: `Place ${i}`,
        geometry: { location: { lat: 0, lng: 0 } },
        types: ['restaurant']
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'OK', results: manyResults })
      });

      vi.resetModules();
      const { searchPlaces } = await import('./places');
      const results = await searchPlaces('restaurant');
      
      expect(results).toHaveLength(10);
    });
  });

  describe('isGoogleMapsConfigured (unconfigured)', () => {
    it('should return false when API key not set', async () => {
      vi.resetModules();
      vi.doMock('./config', () => ({
        googleMapsConfig: {
          apiKey: '',
          placesApiUrl: 'https://maps.googleapis.com/maps/api/place'
        }
      }));

      const { isGoogleMapsConfigured } = await import('./places');
      expect(isGoogleMapsConfigured()).toBe(false);
    });

    it('should return empty results when unconfigured', async () => {
      vi.resetModules();
      vi.doMock('./config', () => ({
        googleMapsConfig: {
          apiKey: '',
          placesApiUrl: 'https://maps.googleapis.com/maps/api/place'
        }
      }));

      const { searchNearbyPlaces, searchPlaces } = await import('./places');
      
      const nearbyResults = await searchNearbyPlaces({ lat: 0, lng: 0 }, 'restaurant');
      const searchResults = await searchPlaces('test');
      
      expect(nearbyResults).toEqual([]);
      expect(searchResults).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});

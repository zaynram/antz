import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock config before importing module
vi.mock('./config', () => ({
  tmdbConfig: {
    baseUrl: 'https://api.themoviedb.org/3',
    apiKey: 'test-api-key'
  }
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('tmdb.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    // Reset module to clear caches
    vi.resetModules();
  });

  describe('getGenreMap', () => {
    it('should fetch and cache movie genres', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          genres: [
            { id: 28, name: 'Action' },
            { id: 35, name: 'Comedy' },
            { id: 18, name: 'Drama' }
          ]
        })
      });

      const { getGenreMap } = await import('./tmdb');
      const genreMap = await getGenreMap('movie');
      
      expect(genreMap.get(28)).toBe('Action');
      expect(genreMap.get(35)).toBe('Comedy');
      expect(genreMap.get(18)).toBe('Drama');
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/genre/movie/list')
      );
    });

    it('should use cache on subsequent calls', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          genres: [{ id: 28, name: 'Action' }]
        })
      });

      const { getGenreMap } = await import('./tmdb');
      
      // First call - fetches
      await getGenreMap('movie');
      // Second call - should use cache
      const genreMap = await getGenreMap('movie');
      
      expect(genreMap.get(28)).toBe('Action');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should fetch and cache TV genres separately', async () => {
      // Movie genres
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          genres: [{ id: 28, name: 'Action' }]
        })
      });
      // TV genres
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          genres: [{ id: 10759, name: 'Action & Adventure' }]
        })
      });

      const { getGenreMap } = await import('./tmdb');
      
      const movieGenres = await getGenreMap('movie');
      const tvGenres = await getGenreMap('tv');
      
      expect(movieGenres.get(28)).toBe('Action');
      expect(tvGenres.get(10759)).toBe('Action & Adventure');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('resolveGenreIds', () => {
    it('should resolve genre IDs to names', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          genres: [
            { id: 28, name: 'Action' },
            { id: 35, name: 'Comedy' },
            { id: 18, name: 'Drama' }
          ]
        })
      });

      const { resolveGenreIds } = await import('./tmdb');
      const names = await resolveGenreIds([28, 35], 'movie');
      
      expect(names).toEqual(['Action', 'Comedy']);
    });

    it('should filter out unknown genre IDs', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          genres: [{ id: 28, name: 'Action' }]
        })
      });

      const { resolveGenreIds } = await import('./tmdb');
      const names = await resolveGenreIds([28, 99999], 'movie');
      
      expect(names).toEqual(['Action']);
    });

    it('should return empty array for no matching IDs', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          genres: [{ id: 28, name: 'Action' }]
        })
      });

      const { resolveGenreIds } = await import('./tmdb');
      const names = await resolveGenreIds([99999], 'movie');
      
      expect(names).toEqual([]);
    });
  });

  describe('fetchMovieDetails', () => {
    it('should fetch movie details from TMDB', async () => {
      const mockMovie = {
        id: 550,
        title: 'Fight Club',
        overview: 'A ticking-Loss bomb...',
        poster_path: '/posterpath.jpg',
        release_date: '1999-10-15',
        genres: [{ id: 18, name: 'Drama' }, { id: 53, name: 'Thriller' }],
        belongs_to_collection: null,
        production_companies: [{ id: 123, name: 'Fox 2000 Pictures', logo_path: null, origin_country: 'US' }],
        runtime: 139
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMovie
      });

      const { fetchMovieDetails } = await import('./tmdb');
      const details = await fetchMovieDetails(550);
      
      expect(details.id).toBe(550);
      expect(details.title).toBe('Fight Club');
      expect(details.genres).toHaveLength(2);
      expect(details.runtime).toBe(139);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/movie/550')
      );
    });

    it('should throw on failed fetch', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404
      });

      const { fetchMovieDetails } = await import('./tmdb');
      
      await expect(fetchMovieDetails(99999999))
        .rejects.toThrow('Failed to fetch movie details: 404');
    });
  });

  describe('fetchTVDetails', () => {
    it('should fetch TV show details from TMDB', async () => {
      const mockTV = {
        id: 1396,
        name: 'Breaking Bad',
        overview: 'A chemistry teacher...',
        poster_path: '/posterpath.jpg',
        first_air_date: '2008-01-20',
        genres: [{ id: 18, name: 'Drama' }, { id: 80, name: 'Crime' }],
        production_companies: [{ id: 2605, name: 'AMC', logo_path: null, origin_country: 'US' }],
        number_of_seasons: 5,
        number_of_episodes: 62
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTV
      });

      const { fetchTVDetails } = await import('./tmdb');
      const details = await fetchTVDetails(1396);
      
      expect(details.id).toBe(1396);
      expect(details.name).toBe('Breaking Bad');
      expect(details.number_of_seasons).toBe(5);
      expect(details.number_of_episodes).toBe(62);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/tv/1396')
      );
    });

    it('should throw on failed fetch', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401
      });

      const { fetchTVDetails } = await import('./tmdb');
      
      await expect(fetchTVDetails(99999999))
        .rejects.toThrow('Failed to fetch TV details: 401');
    });
  });

  describe('enrichMediaData', () => {
    it('should enrich movie data with genres and collection', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 550,
          title: 'Fight Club',
          overview: '',
          poster_path: null,
          release_date: '',
          genres: [{ id: 18, name: 'Drama' }],
          belongs_to_collection: { id: 123, name: 'Collection Name', poster_path: null, backdrop_path: null },
          production_companies: [{ id: 1, name: 'Studio', logo_path: null, origin_country: 'US' }],
          runtime: 139
        })
      });

      const { enrichMediaData } = await import('./tmdb');
      const enriched = await enrichMediaData(550, 'movie');
      
      expect(enriched.genres).toEqual(['Drama']);
      expect(enriched.collection).toEqual({ id: 123, name: 'Collection Name' });
      expect(enriched.productionCompanies).toEqual([{ id: 1, name: 'Studio' }]);
    });

    it('should return null collection for movies without one', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 550,
          title: 'Fight Club',
          overview: '',
          poster_path: null,
          release_date: '',
          genres: [],
          belongs_to_collection: null,
          production_companies: [],
          runtime: 139
        })
      });

      const { enrichMediaData } = await import('./tmdb');
      const enriched = await enrichMediaData(550, 'movie');
      
      expect(enriched.collection).toBeNull();
    });

    it('should enrich TV data (no collections)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 1396,
          name: 'Breaking Bad',
          overview: '',
          poster_path: null,
          first_air_date: '',
          genres: [{ id: 18, name: 'Drama' }, { id: 80, name: 'Crime' }],
          production_companies: [{ id: 2605, name: 'AMC', logo_path: null, origin_country: 'US' }],
          number_of_seasons: 5,
          number_of_episodes: 62
        })
      });

      const { enrichMediaData } = await import('./tmdb');
      const enriched = await enrichMediaData(1396, 'tv');
      
      expect(enriched.genres).toEqual(['Drama', 'Crime']);
      expect(enriched.collection).toBeNull(); // TV shows don't have collections
      expect(enriched.productionCompanies).toEqual([{ id: 2605, name: 'AMC' }]);
    });
  });
});

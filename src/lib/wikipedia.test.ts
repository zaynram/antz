import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchGames, clearSearchCache } from './wikipedia';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('wikipedia.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    clearSearchCache(); // Clear cache between tests
  });

  describe('searchGames', () => {
    it('should return empty array for empty query', async () => {
      const results = await searchGames('');
      expect(results).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return empty array for whitespace query', async () => {
      const results = await searchGames('   ');
      expect(results).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should search and return game results', async () => {
      // First call: search
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          query: {
            search: [
              { pageid: 123, title: 'The Last of Us (video game)', snippet: 'Action-adventure game' }
            ]
          }
        })
      });

      // Second call: get thumbnails/extracts
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          query: {
            pages: {
              '123': {
                pageid: 123,
                title: 'The Last of Us (video game)',
                thumbnail: { source: 'https://upload.wikimedia.org/image.jpg' },
                extract: 'A survival horror game developed by Naughty Dog.'
              }
            }
          }
        })
      });

      const results = await searchGames('The Last of Us');
      
      expect(results).toHaveLength(1);
      expect(results[0].pageid).toBe(123);
      expect(results[0].title).toBe('The Last of Us'); // Stripped "(video game)"
      expect(results[0].thumbnail).toBe('https://upload.wikimedia.org/image.jpg');
      expect(results[0].description).toBe('A survival horror game developed by Naughty Dog.');
    });

    it('should strip "(video game)" from title', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          query: {
            search: [
              { pageid: 1, title: 'Halo (video game)', snippet: 'FPS' }
            ]
          }
        })
      });
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          query: { pages: { '1': { title: 'Halo (video game)' } } }
        })
      });

      const results = await searchGames('Halo');
      expect(results[0].title).toBe('Halo');
    });

    it('should strip "(2024 video game)" format from title', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          query: {
            search: [
              { pageid: 1, title: 'Dragon Age: The Veilguard (2024 video game)', snippet: 'RPG' }
            ]
          }
        })
      });
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          query: { pages: { '1': { title: 'Dragon Age: The Veilguard (2024 video game)' } } }
        })
      });

      const results = await searchGames('Dragon Age');
      expect(results[0].title).toBe('Dragon Age: The Veilguard');
    });

    it('should return null thumbnail when not available', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          query: {
            search: [{ pageid: 1, title: 'Obscure Game', snippet: 'Unknown' }]
          }
        })
      });
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          query: { pages: { '1': { title: 'Obscure Game' } } }
        })
      });

      const results = await searchGames('Obscure');
      expect(results[0].thumbnail).toBeNull();
    });

    it('should fallback to snippet when extract not available', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          query: {
            search: [{ pageid: 1, title: 'Test Game', snippet: '<span>Game description</span>' }]
          }
        })
      });
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          query: { pages: { '1': { title: 'Test Game' } } }
        })
      });

      const results = await searchGames('Test');
      expect(results[0].description).toBe('Game description'); // HTML stripped
    });

    it('should strip HTML from snippets', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          query: {
            search: [{ 
              pageid: 1, 
              title: 'Test', 
              snippet: '<span class="searchmatch">Test</span> is a &quot;great&quot; game &amp; more' 
            }]
          }
        })
      });
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          query: { pages: { '1': { title: 'Test' } } }
        })
      });

      const results = await searchGames('Test');
      expect(results[0].description).toBe('Test is a "great" game & more');
    });

    it('should handle empty search results', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          query: { search: [] }
        })
      });

      const results = await searchGames('xyznonexistentgame123');
      expect(results).toEqual([]);
    });

    it('should handle missing query in response', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({})
      });

      const results = await searchGames('test');
      expect(results).toEqual([]);
    });

    it('should handle fetch errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const results = await searchGames('test');
      expect(results).toEqual([]);
    });

    it('should append "video game" to search query', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({ query: { search: [] } })
      });

      await searchGames('Zelda');
      
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('srsearch=Zelda+video+game')
      );
    });

    it('should limit results to 8 items', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({ query: { search: [] } })
      });

      await searchGames('RPG');
      
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('srlimit=8')
      );
    });

    it('should use CORS origin parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({ query: { search: [] } })
      });

      await searchGames('test');
      
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('origin=*')
      );
    });

    it('should handle multiple results correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          query: {
            search: [
              { pageid: 1, title: 'Game One', snippet: 'First' },
              { pageid: 2, title: 'Game Two', snippet: 'Second' },
              { pageid: 3, title: 'Game Three', snippet: 'Third' }
            ]
          }
        })
      });
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          query: {
            pages: {
              '1': { title: 'Game One', extract: 'First game' },
              '2': { title: 'Game Two', extract: 'Second game' },
              '3': { title: 'Game Three', extract: 'Third game' }
            }
          }
        })
      });

      const results = await searchGames('Game');
      
      expect(results).toHaveLength(3);
      expect(results.map(r => r.title)).toEqual(['Game One', 'Game Two', 'Game Three']);
    });
  });
});

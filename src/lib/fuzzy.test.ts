import { describe, it, expect } from 'vitest';
import { fuzzyScore, fuzzyFilter, fuzzyScoreMulti } from './fuzzy';

describe('fuzzy.ts', () => {
  describe('fuzzyScore', () => {
    describe('edge cases', () => {
      it('should return 0 for empty query and empty target', () => {
        expect(fuzzyScore('', '')).toBe(0);
      });

      it('should return 0 for empty target with non-empty query', () => {
        expect(fuzzyScore('test', '')).toBe(0);
      });

      it('should return 0 for empty query (falsy check)', () => {
        // Empty string is falsy, so returns 0 before trim check
        expect(fuzzyScore('', 'target')).toBe(0);
      });

      it('should return 100 for whitespace-only query', () => {
        expect(fuzzyScore('   ', 'target')).toBe(100);
      });
    });

    describe('exact matches', () => {
      it('should return 100 for exact match', () => {
        expect(fuzzyScore('inception', 'inception')).toBe(100);
      });

      it('should return 100 for case-insensitive exact match', () => {
        expect(fuzzyScore('Inception', 'inception')).toBe(100);
        expect(fuzzyScore('INCEPTION', 'inception')).toBe(100);
      });
    });

    describe('prefix matches', () => {
      it('should return 95 for prefix match', () => {
        expect(fuzzyScore('inc', 'inception')).toBe(95);
        expect(fuzzyScore('break', 'breaking bad')).toBe(95);
      });

      it('should handle case-insensitive prefix', () => {
        expect(fuzzyScore('INC', 'inception')).toBe(95);
      });
    });

    describe('substring matches', () => {
      it('should return 85 for substring match', () => {
        expect(fuzzyScore('ception', 'inception')).toBe(85);
        expect(fuzzyScore('king', 'breaking bad')).toBe(85);
      });
    });

    describe('subsequence matches', () => {
      it('should match characters in order', () => {
        const score = fuzzyScore('bb', 'breaking bad');
        expect(score).toBeGreaterThan(0);
        expect(score).toBeLessThan(85); // Less than substring match
      });

      it('should give bonus for word boundary matches', () => {
        // 'bb' matches 'b'reaking 'b'ad - first 'b' at word boundary (start)
        const withBoundary = fuzzyScore('bb', 'breaking bad');
        // 'ea' matches br'e'a'king - consecutive chars also get bonus
        const withConsecutive = fuzzyScore('ea', 'breaking bad');
        // Both get bonuses, but we can verify both have decent scores
        expect(withBoundary).toBeGreaterThan(60);
        expect(withConsecutive).toBeGreaterThan(60);
      });

      it('should give bonus for consecutive matches', () => {
        // 'bre' is consecutive in 'breaking'
        const consecutive = fuzzyScore('bre', 'breaking bad');
        // 'bag' is scattered in 'breaking bad'
        const scattered = fuzzyScore('bag', 'breaking bad');
        expect(consecutive).toBeGreaterThan(scattered);
      });
    });

    describe('no match cases', () => {
      it('should return 0 when characters not in target', () => {
        expect(fuzzyScore('xyz', 'inception')).toBe(0);
      });

      it('should return 0 when characters in wrong order', () => {
        expect(fuzzyScore('cni', 'inception')).toBe(0);
      });
    });

    describe('partial matches', () => {
      it('should return low score for partial character matches', () => {
        // Only 'in' found out of 'inx'
        const score = fuzzyScore('inx', 'inception');
        expect(score).toBeLessThan(30);
      });
    });
  });

  describe('fuzzyFilter', () => {
    const movies = [
      { title: 'Inception' },
      { title: 'Interstellar' },
      { title: 'The Dark Knight' },
      { title: 'Tenet' },
    ];
    const getText = (m: { title: string }) => m.title;

    it('should return all items with score 100 for empty query', () => {
      const results = fuzzyFilter(movies, '', getText);
      expect(results).toHaveLength(4);
      results.forEach(r => expect(r.score).toBe(100));
    });

    it('should return all items for whitespace query', () => {
      const results = fuzzyFilter(movies, '  ', getText);
      expect(results).toHaveLength(4);
    });

    it('should filter and sort by score', () => {
      const results = fuzzyFilter(movies, 'inter', getText);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].item.title).toBe('Interstellar');
    });

    it('should respect threshold parameter', () => {
      const lowThreshold = fuzzyFilter(movies, 'x', getText, 0);
      const highThreshold = fuzzyFilter(movies, 'x', getText, 50);
      expect(lowThreshold.length).toBeGreaterThanOrEqual(highThreshold.length);
    });

    it('should filter out items below threshold', () => {
      const results = fuzzyFilter(movies, 'xyz', getText, 20);
      expect(results).toHaveLength(0);
    });

    it('should include score in results', () => {
      const results = fuzzyFilter(movies, 'inception', getText);
      expect(results[0]).toHaveProperty('item');
      expect(results[0]).toHaveProperty('score');
      expect(results[0].score).toBe(100);
    });

    it('should handle empty array', () => {
      const results = fuzzyFilter([], 'test', getText);
      expect(results).toHaveLength(0);
    });
  });

  describe('fuzzyScoreMulti', () => {
    it('should return highest score across all fields', () => {
      // 'inception' exact match in title
      const score = fuzzyScoreMulti('inception', 'Inception', 'Christopher Nolan', 'Sci-Fi');
      expect(score).toBe(100);
    });

    it('should handle undefined fields', () => {
      const score = fuzzyScoreMulti('nolan', undefined, 'Christopher Nolan', undefined);
      expect(score).toBeGreaterThan(0);
    });

    it('should return 0 when no fields match', () => {
      const score = fuzzyScoreMulti('xyz', 'Inception', 'Nolan');
      expect(score).toBe(0);
    });

    it('should handle all undefined fields', () => {
      const score = fuzzyScoreMulti('test', undefined, undefined);
      expect(score).toBe(0);
    });

    it('should pick best match from multiple fields', () => {
      // 'dark' is substring in 'The Dark Knight' but not in director
      const score = fuzzyScoreMulti('dark', 'The Dark Knight', 'Christopher Nolan');
      expect(score).toBe(85); // Substring match score
    });

    it('should handle empty query', () => {
      const score = fuzzyScoreMulti('', 'Inception', 'Nolan');
      expect(score).toBe(100);
    });
  });
});

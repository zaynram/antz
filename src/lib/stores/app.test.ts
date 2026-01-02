import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

describe('Store: app.ts', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    // Clear the module cache to ensure stores are recreated
    vi.resetModules();
  });

  describe('activeUser store', () => {
    it('should initialize with default value "Z"', async () => {
      const { activeUser } = await import('./app');
      const value = get(activeUser);
      expect(value).toBe('Z');
    });

    it('should persist value to localStorage', async () => {
      const { activeUser } = await import('./app');
      activeUser.set('T');
      expect(localStorage.getItem('activeUser')).toBe('"T"');
    });

    it('should restore value from localStorage', async () => {
      localStorage.setItem('activeUser', '"T"');
      // Reimport to test restoration
      const { activeUser } = await import('./app');
      const value = get(activeUser);
      expect(value).toBe('T');
    });
  });

  describe('userPreferences store', () => {
    it('should initialize with default preferences', async () => {
      const { userPreferences } = await import('./app');
      const prefs = get(userPreferences);
      expect(prefs).toHaveProperty('Z');
      expect(prefs).toHaveProperty('T');
      expect(prefs.Z.theme).toBe('dark');
      expect(prefs.T.theme).toBe('light');
    });

    it('should persist preferences to localStorage', async () => {
      const { userPreferences } = await import('./app');
      const newPrefs = {
        Z: { theme: 'light' as const, accentColor: '#000000', name: 'Zayn', locationMode: 'off' as const, searchRadius: 5000 },
        T: { theme: 'dark' as const, accentColor: '#ffffff', name: 'Tara', locationMode: 'off' as const, searchRadius: 5000 },
      };
      userPreferences.set(newPrefs);
      
      const stored = localStorage.getItem('userPreferences');
      expect(stored).toBeTruthy();
      expect(JSON.parse(stored!)).toEqual(newPrefs);
    });
  });

  describe('currentPreferences derived store', () => {
    it('should return preferences for active user', async () => {
      const { activeUser, currentPreferences } = await import('./app');
      activeUser.set('Z');
      // Small delay for derived store to update
      await new Promise(resolve => setTimeout(resolve, 0));
      const prefs = get(currentPreferences);
      expect(prefs.name).toBe('Z');
      expect(prefs.theme).toBe('dark');
    });

    it('should update when active user changes', async () => {
      const { activeUser, currentPreferences } = await import('./app');
      activeUser.set('Z');
      await new Promise(resolve => setTimeout(resolve, 0));
      let prefs = get(currentPreferences);
      expect(prefs.theme).toBe('dark');

      activeUser.set('T');
      await new Promise(resolve => setTimeout(resolve, 0));
      prefs = get(currentPreferences);
      expect(prefs.theme).toBe('light');
    });
  });

  describe('mediaSearchHistory store', () => {
    it('should initialize with empty array', async () => {
      const { mediaSearchHistory } = await import('./app');
      const history = get(mediaSearchHistory);
      expect(history).toEqual([]);
    });
  });

  describe('addToSearchHistory', () => {
    it('should add new search query to history', async () => {
      const { addToSearchHistory, mediaSearchHistory } = await import('./app');
      addToSearchHistory('Inception');
      const history = get(mediaSearchHistory);
      expect(history).toContain('Inception');
      expect(history[0]).toBe('Inception');
    });

    it('should trim whitespace from query', async () => {
      const { addToSearchHistory, mediaSearchHistory } = await import('./app');
      addToSearchHistory('  Interstellar  ');
      const history = get(mediaSearchHistory);
      expect(history[0]).toBe('Interstellar');
    });

    it('should not add empty or whitespace-only queries', async () => {
      const { addToSearchHistory, mediaSearchHistory } = await import('./app');
      addToSearchHistory('');
      addToSearchHistory('   ');
      const history = get(mediaSearchHistory);
      expect(history).toEqual([]);
    });

    it('should move existing query to front (case-insensitive)', async () => {
      const { addToSearchHistory, mediaSearchHistory } = await import('./app');
      addToSearchHistory('Inception');
      addToSearchHistory('Interstellar');
      addToSearchHistory('Tenet');
      addToSearchHistory('inception'); // Same as first, different case
      
      const history = get(mediaSearchHistory);
      expect(history[0]).toBe('inception');
      expect(history.filter(h => h.toLowerCase() === 'inception')).toHaveLength(1);
    });

    it('should limit history to 5 items', async () => {
      const { addToSearchHistory, mediaSearchHistory } = await import('./app');
      addToSearchHistory('Movie 1');
      addToSearchHistory('Movie 2');
      addToSearchHistory('Movie 3');
      addToSearchHistory('Movie 4');
      addToSearchHistory('Movie 5');
      addToSearchHistory('Movie 6');
      
      const history = get(mediaSearchHistory);
      expect(history).toHaveLength(5);
      expect(history[0]).toBe('Movie 6');
      expect(history).not.toContain('Movie 1');
    });

    it('should add queries in LIFO order', async () => {
      const { addToSearchHistory, mediaSearchHistory } = await import('./app');
      addToSearchHistory('First');
      addToSearchHistory('Second');
      addToSearchHistory('Third');
      
      const history = get(mediaSearchHistory);
      expect(history[0]).toBe('Third');
      expect(history[1]).toBe('Second');
      expect(history[2]).toBe('First');
    });
  });

  describe('removeFromSearchHistory', () => {
    it('should remove specific query from history', async () => {
      const { addToSearchHistory, removeFromSearchHistory, mediaSearchHistory } = await import('./app');
      addToSearchHistory('Inception');
      addToSearchHistory('Interstellar');
      addToSearchHistory('Tenet');
      
      removeFromSearchHistory('Interstellar');
      
      const history = get(mediaSearchHistory);
      expect(history).not.toContain('Interstellar');
      expect(history).toHaveLength(2);
    });

    it('should handle removing non-existent query', async () => {
      const { addToSearchHistory, removeFromSearchHistory, mediaSearchHistory } = await import('./app');
      addToSearchHistory('Inception');
      removeFromSearchHistory('NonExistent');
      
      const history = get(mediaSearchHistory);
      expect(history).toEqual(['Inception']);
    });

    it('should be case-sensitive when removing', async () => {
      const { addToSearchHistory, removeFromSearchHistory, mediaSearchHistory } = await import('./app');
      addToSearchHistory('Inception');
      removeFromSearchHistory('inception');
      
      const history = get(mediaSearchHistory);
      expect(history).toContain('Inception');
    });
  });

  describe('clearSearchHistory', () => {
    it('should clear all search history', async () => {
      const { addToSearchHistory, clearSearchHistory, mediaSearchHistory } = await import('./app');
      addToSearchHistory('Inception');
      addToSearchHistory('Interstellar');
      addToSearchHistory('Tenet');
      
      clearSearchHistory();
      
      const history = get(mediaSearchHistory);
      expect(history).toEqual([]);
    });

    it('should work on empty history', async () => {
      const { clearSearchHistory, mediaSearchHistory } = await import('./app');
      clearSearchHistory();
      const history = get(mediaSearchHistory);
      expect(history).toEqual([]);
    });
  });

  describe('localStorage persistence', () => {
    it('should persist search history to localStorage', async () => {
      const { addToSearchHistory } = await import('./app');
      addToSearchHistory('Inception');
      const stored = localStorage.getItem('mediaSearchHistory');
      expect(stored).toBeTruthy();
      expect(JSON.parse(stored!)).toContain('Inception');
    });

    it('should restore search history from localStorage', async () => {
      localStorage.setItem('mediaSearchHistory', JSON.stringify(['Saved Movie']));
      const { mediaSearchHistory } = await import('./app');
      const history = get(mediaSearchHistory);
      expect(history).toContain('Saved Movie');
    });
  });
});

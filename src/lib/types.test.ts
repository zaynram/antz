import { describe, it, expect } from 'vitest';
import type {
  UserId,
  Theme,
  UserPreferences,
  MediaType,
  MediaStatus,
  PlaceCategory,
  Note,
  Media,
  Place,
} from './types';
import { getUserRating, getAverageRating, getDisplayRating } from './types';

describe('Type definitions', () => {
  describe('UserId', () => {
    it('should allow "Z" as valid UserId', () => {
      const userId: UserId = 'Z';
      expect(userId).toBe('Z');
    });

    it('should allow "T" as valid UserId', () => {
      const userId: UserId = 'T';
      expect(userId).toBe('T');
    });
  });

  describe('Theme', () => {
    it('should allow "light" theme', () => {
      const theme: Theme = 'light';
      expect(theme).toBe('light');
    });

    it('should allow "dark" theme', () => {
      const theme: Theme = 'dark';
      expect(theme).toBe('dark');
    });
  });

  describe('MediaType', () => {
    it('should allow valid media types', () => {
      const types: MediaType[] = ['tv', 'movie', 'game'];
      expect(types).toHaveLength(3);
      types.forEach(type => {
        expect(['tv', 'movie', 'game']).toContain(type);
      });
    });
  });

  describe('MediaStatus', () => {
    it('should allow valid media statuses', () => {
      const statuses: MediaStatus[] = ['queued', 'watching', 'completed', 'dropped'];
      expect(statuses).toHaveLength(4);
      statuses.forEach(status => {
        expect(['queued', 'watching', 'completed', 'dropped']).toContain(status);
      });
    });
  });

  describe('PlaceCategory', () => {
    it('should allow valid place categories', () => {
      const categories: PlaceCategory[] = [
        'restaurant',
        'cafe',
        'bar',
        'attraction',
        'park',
        'other',
      ];
      expect(categories).toHaveLength(6);
    });
  });

  describe('UserPreferences interface', () => {
    it('should have required properties', () => {
      const prefs: UserPreferences = {
        theme: 'dark',
        accentColor: '#6366f1',
        name: 'Test User',
        locationMode: 'off',
        searchRadius: 5000,
      };
      
      expect(prefs).toHaveProperty('theme');
      expect(prefs).toHaveProperty('accentColor');
      expect(prefs).toHaveProperty('name');
    });

    it('should accept valid theme values', () => {
      const lightPrefs: UserPreferences = {
        theme: 'light',
        accentColor: '#000000',
        name: 'User',
        locationMode: 'off',
        searchRadius: 5000,
      };
      
      const darkPrefs: UserPreferences = {
        theme: 'dark',
        accentColor: '#ffffff',
        name: 'User',
        locationMode: 'off',
        searchRadius: 5000,
      };
      
      expect(lightPrefs.theme).toBe('light');
      expect(darkPrefs.theme).toBe('dark');
    });
  });

  describe('Note interface', () => {
    it('should have all required properties', () => {
      const note: Partial<Note> = {
        type: 'note',
        title: 'Test Note',
        content: 'Test content',
        tags: ['test', 'important'],
        createdBy: 'Z',
      };
      
      expect(note.type).toBe('note');
      expect(note.title).toBeTruthy();
      expect(note.content).toBeTruthy();
      expect(note.tags).toBeInstanceOf(Array);
      expect(note.createdBy).toBe('Z');
    });

    it('should support optional fields', () => {
      const note: Partial<Note> = {
        type: 'note',
        title: 'Test',
        content: 'Content',
        tags: [],
        createdBy: 'T',
        read: true,
        archived: false,
      };
      
      expect(note.read).toBe(true);
      expect(note.archived).toBe(false);
    });
  });

  describe('Media interface', () => {
    it('should support all media types', () => {
      const tvShow: Partial<Media> = {
        type: 'tv',
        title: 'Breaking Bad',
        status: 'completed',
        rating: 5,
        notes: '',
        posterPath: null,
        createdBy: 'Z',
      };
      
      const movie: Partial<Media> = {
        type: 'movie',
        title: 'Inception',
        status: 'watching',
        rating: null,
        notes: '',
        posterPath: '/poster.jpg',
        createdBy: 'T',
      };
      
      const game: Partial<Media> = {
        type: 'game',
        title: 'The Last of Us',
        status: 'queued',
        rating: null,
        notes: '',
        posterPath: null,
        createdBy: 'Z',
      };
      
      expect(tvShow.type).toBe('tv');
      expect(movie.type).toBe('movie');
      expect(game.type).toBe('game');
    });

    it('should support TV show progress', () => {
      const tvShow: Partial<Media> = {
        type: 'tv',
        title: 'Breaking Bad',
        status: 'watching',
        rating: null,
        notes: '',
        posterPath: null,
        createdBy: 'Z',
        progress: {
          season: 2,
          episode: 5,
        },
      };
      
      expect(tvShow.progress?.season).toBe(2);
      expect(tvShow.progress?.episode).toBe(5);
    });

    it('should support optional metadata fields', () => {
      const media: Partial<Media> = {
        type: 'movie',
        title: 'Test Movie',
        status: 'completed',
        rating: 4,
        notes: '',
        posterPath: null,
        createdBy: 'T',
        genres: ['Action', 'Sci-Fi'],
        tmdbId: 12345,
        releaseDate: '2024-01-01',
        overview: 'A test movie',
      };
      
      expect(media.genres).toEqual(['Action', 'Sci-Fi']);
      expect(media.tmdbId).toBe(12345);
      expect(media.releaseDate).toBe('2024-01-01');
      expect(media.overview).toBe('A test movie');
    });

    it('should allow watchDate to be undefined', () => {
      const mediaWithoutDate: Partial<Media> = {
        type: 'movie',
        title: 'Movie Without Date',
        status: 'completed',
        rating: 4,
        notes: '',
        posterPath: null,
        createdBy: 'T',
        watchDate: undefined,
      };
      
      expect(mediaWithoutDate.watchDate).toBeUndefined();
      expect(mediaWithoutDate.title).toBe('Movie Without Date');
      expect(mediaWithoutDate.type).toBe('movie');
    });

    it('should create Media object without specifying watchDate', () => {
      const mediaOmittedDate: Partial<Media> = {
        type: 'tv',
        title: 'TV Show',
        status: 'watching',
        rating: null,
        notes: 'Great show',
        posterPath: '/poster.jpg',
        createdBy: 'Z',
        // watchDate intentionally omitted
      };
      
      expect(mediaOmittedDate.watchDate).toBeUndefined();
      expect(mediaOmittedDate).not.toHaveProperty('watchDate');
      expect(mediaOmittedDate.title).toBe('TV Show');
    });
  });

  describe('Place interface', () => {
    it('should have all required properties', () => {
      const place: Partial<Place> = {
        name: 'Test Restaurant',
        category: 'restaurant',
        notes: 'Great food',
        visited: true,
        visitDates: [],
        rating: 5,
        createdBy: 'Z',
      };
      
      expect(place.name).toBeTruthy();
      expect(place.category).toBe('restaurant');
      expect(place.visited).toBe(true);
      expect(place.rating).toBe(5);
    });

    it('should support all place categories', () => {
      const categories: PlaceCategory[] = [
        'restaurant',
        'cafe',
        'bar',
        'attraction',
        'park',
        'other',
      ];
      
      categories.forEach(category => {
        const place: Partial<Place> = {
          name: 'Test Place',
          category,
          notes: '',
          visited: false,
          visitDates: [],
          rating: null,
          createdBy: 'T',
        };
        
        expect(place.category).toBe(category);
      });
    });

    it('should handle unvisited places', () => {
      const place: Partial<Place> = {
        name: 'Future Visit',
        category: 'restaurant',
        notes: 'Want to try',
        visited: false,
        visitDates: [],
        rating: null,
        createdBy: 'Z',
      };
      
      expect(place.visited).toBe(false);
      expect(place.visitDates).toHaveLength(0);
      expect(place.rating).toBeNull();
    });
  });

  describe('Rating helper functions', () => {
    describe('getUserRating', () => {
      it('should return user rating from ratings object', () => {
        const media: Partial<Media> = {
          type: 'movie',
          title: 'Test Movie',
          status: 'completed',
          rating: null,
          ratings: { Z: 5, T: 4 },
          notes: '',
          posterPath: null,
          createdBy: 'Z',
        };
        
        expect(getUserRating(media as Media, 'Z')).toBe(5);
        expect(getUserRating(media as Media, 'T')).toBe(4);
      });

      it('should return null if user has not rated', () => {
        const media: Partial<Media> = {
          type: 'movie',
          title: 'Test Movie',
          status: 'completed',
          rating: null,
          ratings: { Z: 5, T: null },
          notes: '',
          posterPath: null,
          createdBy: 'Z',
        };
        
        expect(getUserRating(media as Media, 'T')).toBeNull();
      });

      it('should fallback to legacy rating field if ratings object missing', () => {
        const media: Partial<Media> = {
          type: 'movie',
          title: 'Test Movie',
          status: 'completed',
          rating: 5,
          notes: '',
          posterPath: null,
          createdBy: 'Z',
        };
        
        expect(getUserRating(media as Media, 'Z')).toBe(5);
        expect(getUserRating(media as Media, 'T')).toBe(5);
      });
    });

    describe('getAverageRating', () => {
      it('should return average when both users have rated', () => {
        const media: Partial<Media> = {
          type: 'movie',
          title: 'Test Movie',
          status: 'completed',
          rating: null,
          ratings: { Z: 5, T: 3 },
          notes: '',
          posterPath: null,
          createdBy: 'Z',
        };
        
        expect(getAverageRating(media as Media)).toBe(4);
      });

      it('should return individual rating when only one user has rated', () => {
        const media: Partial<Media> = {
          type: 'movie',
          title: 'Test Movie',
          status: 'completed',
          rating: null,
          ratings: { Z: 5, T: null },
          notes: '',
          posterPath: null,
          createdBy: 'Z',
        };
        
        expect(getAverageRating(media as Media)).toBe(5);
      });

      it('should return null when no users have rated', () => {
        const media: Partial<Media> = {
          type: 'movie',
          title: 'Test Movie',
          status: 'completed',
          rating: null,
          ratings: { Z: null, T: null },
          notes: '',
          posterPath: null,
          createdBy: 'Z',
        };
        
        expect(getAverageRating(media as Media)).toBeNull();
      });

      it('should fallback to legacy rating field', () => {
        const media: Partial<Media> = {
          type: 'movie',
          title: 'Test Movie',
          status: 'completed',
          rating: 4,
          notes: '',
          posterPath: null,
          createdBy: 'Z',
        };
        
        expect(getAverageRating(media as Media)).toBe(4);
      });
    });

    describe('getDisplayRating', () => {
      it('should return average rating when available', () => {
        const media: Partial<Media> = {
          type: 'movie',
          title: 'Test Movie',
          status: 'completed',
          rating: null,
          ratings: { Z: 5, T: 3 },
          notes: '',
          posterPath: null,
          createdBy: 'Z',
        };
        
        expect(getDisplayRating(media as Media)).toBe(4);
      });

      it('should return individual rating when only one user rated', () => {
        const media: Partial<Media> = {
          type: 'movie',
          title: 'Test Movie',
          status: 'completed',
          rating: null,
          ratings: { Z: 5, T: null },
          notes: '',
          posterPath: null,
          createdBy: 'Z',
        };
        
        expect(getDisplayRating(media as Media)).toBe(5);
      });

      it('should fallback to legacy rating', () => {
        const media: Partial<Media> = {
          type: 'movie',
          title: 'Test Movie',
          status: 'completed',
          rating: 4,
          notes: '',
          posterPath: null,
          createdBy: 'Z',
        };
        
        expect(getDisplayRating(media as Media)).toBe(4);
      });
    });
  });
});

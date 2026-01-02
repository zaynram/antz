import { describe, it, expect } from 'vitest'
import type { Media } from './types'
import type { Timestamp } from 'firebase/firestore'
import {
    applyFilters,
    applySort,
    extractGenres,
    extractDecades,
    hasActiveFilters,
    countActiveFilters,
    formatDecade,
    getSortLabel,
    DEFAULT_FILTERS,
    DEFAULT_SORT,
    type MediaFilters,
    type SortConfig,
} from './filters'

// Mock Timestamp for tests
function mockTimestamp(ms: number): Timestamp {
    return {
        toMillis: () => ms,
        toDate: () => new Date(ms),
    } as Timestamp
}

// Factory for creating test media items
function createMedia(overrides: Partial<Media> = {}): Media {
    return {
        id: 'test-id',
        type: 'movie',
        title: 'Test Movie',
        posterPath: null,
        status: 'queued',
        rating: null,
        notes: '',
        createdBy: 'Z',
        createdAt: mockTimestamp(Date.now()),
        updatedAt: mockTimestamp(Date.now()),
        ...overrides,
    } as Media
}

describe('filters.ts', () => {
    describe('applyFilters', () => {
        describe('status filter', () => {
            it('should return all items when status is "all"', () => {
                const media = [
                    createMedia({ status: 'queued' }),
                    createMedia({ status: 'watching' }),
                    createMedia({ status: 'completed' }),
                ]
                const result = applyFilters(media, { ...DEFAULT_FILTERS, status: 'all' })
                expect(result).toHaveLength(3)
            })

            it('should filter by specific status', () => {
                const media = [
                    createMedia({ id: '1', status: 'queued' }),
                    createMedia({ id: '2', status: 'watching' }),
                    createMedia({ id: '3', status: 'completed' }),
                ]
                const result = applyFilters(media, { ...DEFAULT_FILTERS, status: 'completed' })
                expect(result).toHaveLength(1)
                expect(result[0].id).toBe('3')
            })
        })

        describe('type filter', () => {
            it('should return all items when type is "all"', () => {
                const media = [
                    createMedia({ type: 'movie' }),
                    createMedia({ type: 'tv' }),
                    createMedia({ type: 'game' }),
                ]
                const result = applyFilters(media, { ...DEFAULT_FILTERS, type: 'all' })
                expect(result).toHaveLength(3)
            })

            it('should filter by specific type', () => {
                const media = [
                    createMedia({ id: '1', type: 'movie' }),
                    createMedia({ id: '2', type: 'tv' }),
                    createMedia({ id: '3', type: 'game' }),
                ]
                const result = applyFilters(media, { ...DEFAULT_FILTERS, type: 'tv' })
                expect(result).toHaveLength(1)
                expect(result[0].id).toBe('2')
            })
        })

        describe('genre filter', () => {
            it('should return all items when genres is empty', () => {
                const media = [
                    createMedia({ genres: ['Action'] }),
                    createMedia({ genres: ['Comedy'] }),
                ]
                const result = applyFilters(media, { ...DEFAULT_FILTERS, genres: [] })
                expect(result).toHaveLength(2)
            })

            it('should filter by single genre', () => {
                const media = [
                    createMedia({ id: '1', genres: ['Action', 'Sci-Fi'] }),
                    createMedia({ id: '2', genres: ['Comedy'] }),
                    createMedia({ id: '3', genres: ['Action'] }),
                ]
                const result = applyFilters(media, { ...DEFAULT_FILTERS, genres: ['Action'] })
                expect(result).toHaveLength(2)
                expect(result.map(m => m.id).sort()).toEqual(['1', '3'])
            })

            it('should match any of multiple genres (OR logic)', () => {
                const media = [
                    createMedia({ id: '1', genres: ['Action'] }),
                    createMedia({ id: '2', genres: ['Comedy'] }),
                    createMedia({ id: '3', genres: ['Drama'] }),
                ]
                const result = applyFilters(media, { ...DEFAULT_FILTERS, genres: ['Action', 'Comedy'] })
                expect(result).toHaveLength(2)
            })

            it('should be case-insensitive', () => {
                const media = [
                    createMedia({ genres: ['Action'] }),
                    createMedia({ genres: ['action'] }),
                ]
                const result = applyFilters(media, { ...DEFAULT_FILTERS, genres: ['ACTION'] })
                expect(result).toHaveLength(2)
            })

            it('should handle items without genres', () => {
                const media = [
                    createMedia({ id: '1', genres: ['Action'] }),
                    createMedia({ id: '2', genres: undefined }),
                    createMedia({ id: '3', genres: [] }),
                ]
                const result = applyFilters(media, { ...DEFAULT_FILTERS, genres: ['Action'] })
                expect(result).toHaveLength(1)
                expect(result[0].id).toBe('1')
            })
        })

        describe('addedBy filter', () => {
            it('should return all items when addedBy is "all"', () => {
                const media = [
                    createMedia({ createdBy: 'Z' }),
                    createMedia({ createdBy: 'T' }),
                ]
                const result = applyFilters(media, { ...DEFAULT_FILTERS, addedBy: 'all' })
                expect(result).toHaveLength(2)
            })

            it('should filter by creator', () => {
                const media = [
                    createMedia({ id: '1', createdBy: 'Z' }),
                    createMedia({ id: '2', createdBy: 'T' }),
                    createMedia({ id: '3', createdBy: 'Z' }),
                ]
                const result = applyFilters(media, { ...DEFAULT_FILTERS, addedBy: 'T' })
                expect(result).toHaveLength(1)
                expect(result[0].id).toBe('2')
            })
        })

        describe('hasRating filter', () => {
            it('should return all items when hasRating is null', () => {
                const media = [
                    createMedia({ rating: 5 }),
                    createMedia({ rating: null }),
                ]
                const result = applyFilters(media, { ...DEFAULT_FILTERS, hasRating: null })
                expect(result).toHaveLength(2)
            })

            it('should filter rated items', () => {
                const media = [
                    createMedia({ id: '1', rating: 5 }),
                    createMedia({ id: '2', rating: null }),
                    createMedia({ id: '3', ratings: { Z: 4, T: null } }),
                ]
                const result = applyFilters(media, { ...DEFAULT_FILTERS, hasRating: true })
                expect(result).toHaveLength(2)
            })

            it('should filter unrated items', () => {
                const media = [
                    createMedia({ id: '1', rating: 5 }),
                    createMedia({ id: '2', rating: null }),
                    createMedia({ id: '3', ratings: { Z: null, T: null } }),
                ]
                const result = applyFilters(media, { ...DEFAULT_FILTERS, hasRating: false })
                expect(result).toHaveLength(2)
            })
        })

        describe('releaseDecade filter', () => {
            it('should return all items when releaseDecade is null', () => {
                const media = [
                    createMedia({ releaseDate: '2020-01-01' }),
                    createMedia({ releaseDate: '1990-06-15' }),
                ]
                const result = applyFilters(media, { ...DEFAULT_FILTERS, releaseDecade: null })
                expect(result).toHaveLength(2)
            })

            it('should filter by decade', () => {
                const media = [
                    createMedia({ id: '1', releaseDate: '2023-01-01' }),
                    createMedia({ id: '2', releaseDate: '2015-06-15' }),
                    createMedia({ id: '3', releaseDate: '2021-12-31' }),
                ]
                const result = applyFilters(media, { ...DEFAULT_FILTERS, releaseDecade: 2020 })
                expect(result).toHaveLength(2)
                expect(result.map(m => m.id).sort()).toEqual(['1', '3'])
            })

            it('should handle missing releaseDate', () => {
                const media = [
                    createMedia({ id: '1', releaseDate: '2020-01-01' }),
                    createMedia({ id: '2', releaseDate: undefined }),
                ]
                // Items without releaseDate should not match any decade filter
                const result = applyFilters(media, { ...DEFAULT_FILTERS, releaseDecade: 2020 })
                expect(result).toHaveLength(1)
                expect(result[0].id).toBe('1')
            })
        })

        describe('hasCollection filter', () => {
            it('should return all items when hasCollection is null', () => {
                const media = [
                    createMedia({ collection: { id: 1, name: 'MCU' } }),
                    createMedia({ collection: null }),
                ]
                const result = applyFilters(media, { ...DEFAULT_FILTERS, hasCollection: null })
                expect(result).toHaveLength(2)
            })

            it('should filter items with collection', () => {
                const media = [
                    createMedia({ id: '1', collection: { id: 1, name: 'MCU' } }),
                    createMedia({ id: '2', collection: null }),
                ]
                const result = applyFilters(media, { ...DEFAULT_FILTERS, hasCollection: true })
                expect(result).toHaveLength(1)
                expect(result[0].id).toBe('1')
            })

            it('should filter items without collection', () => {
                const media = [
                    createMedia({ id: '1', collection: { id: 1, name: 'MCU' } }),
                    createMedia({ id: '2', collection: null }),
                    createMedia({ id: '3', collection: undefined }),
                ]
                const result = applyFilters(media, { ...DEFAULT_FILTERS, hasCollection: false })
                expect(result).toHaveLength(2)
            })
        })

        describe('combined filters', () => {
            it('should apply multiple filters with AND logic', () => {
                const media = [
                    createMedia({ id: '1', status: 'completed', type: 'movie', genres: ['Action'] }),
                    createMedia({ id: '2', status: 'completed', type: 'movie', genres: ['Comedy'] }),
                    createMedia({ id: '3', status: 'watching', type: 'movie', genres: ['Action'] }),
                    createMedia({ id: '4', status: 'completed', type: 'tv', genres: ['Action'] }),
                ]
                const filters: MediaFilters = {
                    ...DEFAULT_FILTERS,
                    status: 'completed',
                    type: 'movie',
                    genres: ['Action'],
                }
                const result = applyFilters(media, filters)
                expect(result).toHaveLength(1)
                expect(result[0].id).toBe('1')
            })
        })
    })

    describe('applySort', () => {
        describe('title sort', () => {
            it('should sort alphabetically ascending', () => {
                const media = [
                    createMedia({ title: 'Zorro' }),
                    createMedia({ title: 'Alpha' }),
                    createMedia({ title: 'Matrix' }),
                ]
                const result = applySort(media, { field: 'title', direction: 'asc' })
                expect(result.map(m => m.title)).toEqual(['Alpha', 'Matrix', 'Zorro'])
            })

            it('should sort alphabetically descending', () => {
                const media = [
                    createMedia({ title: 'Alpha' }),
                    createMedia({ title: 'Zorro' }),
                    createMedia({ title: 'Matrix' }),
                ]
                const result = applySort(media, { field: 'title', direction: 'desc' })
                expect(result.map(m => m.title)).toEqual(['Zorro', 'Matrix', 'Alpha'])
            })
        })

        describe('rating sort', () => {
            it('should sort by rating descending (highest first)', () => {
                const media = [
                    createMedia({ id: '1', rating: 3 }),
                    createMedia({ id: '2', rating: 5 }),
                    createMedia({ id: '3', rating: null }),
                ]
                const result = applySort(media, { field: 'rating', direction: 'desc' })
                expect(result.map(m => m.id)).toEqual(['2', '1', '3'])
            })

            it('should sort by rating ascending (lowest first)', () => {
                const media = [
                    createMedia({ id: '1', rating: 3 }),
                    createMedia({ id: '2', rating: 5 }),
                    createMedia({ id: '3', rating: null }),
                ]
                const result = applySort(media, { field: 'rating', direction: 'asc' })
                expect(result.map(m => m.id)).toEqual(['3', '1', '2'])
            })
        })

        describe('releaseDate sort', () => {
            it('should sort by release date descending (newest first)', () => {
                const media = [
                    createMedia({ id: '1', releaseDate: '2010-01-01' }),
                    createMedia({ id: '2', releaseDate: '2023-06-15' }),
                    createMedia({ id: '3', releaseDate: '2015-03-20' }),
                ]
                const result = applySort(media, { field: 'releaseDate', direction: 'desc' })
                expect(result.map(m => m.id)).toEqual(['2', '3', '1'])
            })

            it('should handle missing release dates', () => {
                const media = [
                    createMedia({ id: '1', releaseDate: '2020-01-01' }),
                    createMedia({ id: '2', releaseDate: undefined }),
                ]
                const result = applySort(media, { field: 'releaseDate', direction: 'desc' })
                expect(result[0].id).toBe('1') // Items with dates come first
            })
        })

        describe('dateAdded sort', () => {
            it('should sort by createdAt descending (newest first)', () => {
                const media = [
                    createMedia({ id: '1', createdAt: mockTimestamp(1000) }),
                    createMedia({ id: '2', createdAt: mockTimestamp(3000) }),
                    createMedia({ id: '3', createdAt: mockTimestamp(2000) }),
                ]
                const result = applySort(media, { field: 'dateAdded', direction: 'desc' })
                expect(result.map(m => m.id)).toEqual(['2', '3', '1'])
            })
        })

        describe('watchDate sort', () => {
            it('should sort by watchDate descending', () => {
                const media = [
                    createMedia({ id: '1', watchDate: mockTimestamp(1000) }),
                    createMedia({ id: '2', watchDate: mockTimestamp(3000) }),
                    createMedia({ id: '3', watchDate: undefined }),
                ]
                const result = applySort(media, { field: 'watchDate', direction: 'desc' })
                expect(result.map(m => m.id)).toEqual(['2', '1', '3'])
            })
        })
    })

    describe('extractGenres', () => {
        it('should return empty array for empty media list', () => {
            expect(extractGenres([])).toEqual([])
        })

        it('should extract unique genres sorted alphabetically', () => {
            const media = [
                createMedia({ genres: ['Sci-Fi', 'Action'] }),
                createMedia({ genres: ['Comedy', 'Action'] }),
                createMedia({ genres: ['Drama'] }),
            ]
            expect(extractGenres(media)).toEqual(['Action', 'Comedy', 'Drama', 'Sci-Fi'])
        })

        it('should handle items without genres', () => {
            const media = [
                createMedia({ genres: ['Action'] }),
                createMedia({ genres: undefined }),
                createMedia({ genres: [] }),
            ]
            expect(extractGenres(media)).toEqual(['Action'])
        })
    })

    describe('extractDecades', () => {
        it('should return empty array for empty media list', () => {
            expect(extractDecades([])).toEqual([])
        })

        it('should extract unique decades sorted descending', () => {
            const media = [
                createMedia({ releaseDate: '2023-01-01' }),
                createMedia({ releaseDate: '1995-06-15' }),
                createMedia({ releaseDate: '2021-12-31' }),
                createMedia({ releaseDate: '1999-01-01' }),
            ]
            expect(extractDecades(media)).toEqual([2020, 1990])
        })

        it('should handle missing release dates', () => {
            const media = [
                createMedia({ releaseDate: '2020-01-01' }),
                createMedia({ releaseDate: undefined }),
            ]
            expect(extractDecades(media)).toEqual([2020])
        })
    })

    describe('hasActiveFilters', () => {
        it('should return false for default filters', () => {
            expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false)
        })

        it('should return true when any filter is non-default', () => {
            expect(hasActiveFilters({ ...DEFAULT_FILTERS, status: 'completed' })).toBe(true)
            expect(hasActiveFilters({ ...DEFAULT_FILTERS, genres: ['Action'] })).toBe(true)
            expect(hasActiveFilters({ ...DEFAULT_FILTERS, hasRating: true })).toBe(true)
        })
    })

    describe('countActiveFilters', () => {
        it('should return 0 for default filters', () => {
            expect(countActiveFilters(DEFAULT_FILTERS)).toBe(0)
        })

        it('should count each active filter dimension', () => {
            const filters: MediaFilters = {
                ...DEFAULT_FILTERS,
                status: 'completed',
                genres: ['Action', 'Comedy'], // counts as 1
                addedBy: 'Z',
            }
            expect(countActiveFilters(filters)).toBe(3)
        })
    })

    describe('formatDecade', () => {
        it('should format decade with "s" suffix', () => {
            expect(formatDecade(2020)).toBe('2020s')
            expect(formatDecade(1990)).toBe('1990s')
        })
    })

    describe('getSortLabel', () => {
        it('should return label with ascending arrow', () => {
            expect(getSortLabel({ field: 'title', direction: 'asc' })).toBe('Title ↑')
        })

        it('should return label with descending arrow', () => {
            expect(getSortLabel({ field: 'rating', direction: 'desc' })).toBe('Rating ↓')
        })

        it('should have labels for all sort fields', () => {
            const fields: SortConfig['field'][] = ['dateAdded', 'title', 'rating', 'releaseDate', 'watchDate']
            for (const field of fields) {
                const label = getSortLabel({ field, direction: 'asc' })
                expect(label).toBeTruthy()
                expect(label).not.toContain('undefined')
            }
        })
    })

    describe('DEFAULT_FILTERS', () => {
        it('should have all filters set to non-filtering values', () => {
            expect(DEFAULT_FILTERS.status).toBe('all')
            expect(DEFAULT_FILTERS.type).toBe('all')
            expect(DEFAULT_FILTERS.genres).toEqual([])
            expect(DEFAULT_FILTERS.addedBy).toBe('all')
            expect(DEFAULT_FILTERS.hasRating).toBeNull()
            expect(DEFAULT_FILTERS.releaseDecade).toBeNull()
            expect(DEFAULT_FILTERS.hasCollection).toBeNull()
        })
    })

    describe('DEFAULT_SORT', () => {
        it('should default to dateAdded descending', () => {
            expect(DEFAULT_SORT.field).toBe('dateAdded')
            expect(DEFAULT_SORT.direction).toBe('desc')
        })
    })
})

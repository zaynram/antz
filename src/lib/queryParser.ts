/**
 * Query language parser for universal search.
 *
 * Supports:
 * - @type filters: @movie, @tv, @game, @note, @place
 * - Quoted phrases: "exact phrase"
 * - Negation: -word or NOT word
 * - OR operator: word1 OR word2
 * - Numeric comparisons: rating>4, rating>=3, year:2020, year>2015
 * - Status filters: status:completed, status:queued
 * - User filters: by:Z, by:T, from:Z
 */

import type { MediaType, MediaStatus, UserId } from './types'

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export type ContentType = MediaType | 'note' | 'place' | 'all'

export interface ParsedQuery {
  // Text search terms
  terms: string[]           // Required terms (AND)
  exactPhrases: string[]    // Quoted phrases (must match exactly)
  excludeTerms: string[]    // Terms to exclude (NOT/-)
  orGroups: string[][]      // Groups of OR terms

  // Type filters
  types: ContentType[]      // Empty = all types

  // Media-specific filters
  status?: MediaStatus
  minRating?: number
  maxRating?: number
  year?: number
  yearMin?: number
  yearMax?: number
  genre?: string

  // User filters
  createdBy?: UserId

  // Place-specific
  visited?: boolean

  // Note-specific
  archived?: boolean
  unread?: boolean
}

export interface SearchableItem {
  id: string
  type: ContentType
  title: string
  content?: string
  tags?: string[]
  status?: MediaStatus
  rating?: number | null
  year?: number
  createdBy?: UserId
  visited?: boolean
  archived?: boolean
  read?: boolean
  genres?: string[]
}

// ─────────────────────────────────────────────────────────────────
// Parser
// ─────────────────────────────────────────────────────────────────

const TYPE_ALIASES: Record<string, ContentType> = {
  // Movies
  '@movie': 'movie',
  '@movies': 'movie',
  '@film': 'movie',
  '@films': 'movie',

  // TV
  '@tv': 'tv',
  '@show': 'tv',
  '@shows': 'tv',
  '@series': 'tv',

  // Games
  '@game': 'game',
  '@games': 'game',

  // Notes
  '@note': 'note',
  '@notes': 'note',
  '@message': 'note',
  '@messages': 'note',

  // Places
  '@place': 'place',
  '@places': 'place',
  '@location': 'place',
  '@locations': 'place',

  // Media (movies + tv + games)
  '@media': 'all', // Will be handled specially
}

const STATUS_ALIASES: Record<string, MediaStatus> = {
  'queued': 'queued',
  'queue': 'queued',
  'watching': 'watching',
  'playing': 'watching',
  'in-progress': 'watching',
  'inprogress': 'watching',
  'completed': 'completed',
  'done': 'completed',
  'finished': 'completed',
  'dropped': 'dropped',
  'abandoned': 'dropped',
}

export function parseQuery(query: string): ParsedQuery {
  const result: ParsedQuery = {
    terms: [],
    exactPhrases: [],
    excludeTerms: [],
    orGroups: [],
    types: [],
  }

  if (!query.trim()) return result

  // Track if we're handling @media specially
  let includeAllMedia = false

  // Extract quoted phrases first
  const quotedRegex = /"([^"]+)"/g
  let match: RegExpExecArray | null
  const quotedPositions: [number, number][] = []

  while ((match = quotedRegex.exec(query)) !== null) {
    result.exactPhrases.push(match[1].toLowerCase())
    quotedPositions.push([match.index, match.index + match[0].length])
  }

  // Remove quoted content for further parsing
  let remaining = query
  for (let i = quotedPositions.length - 1; i >= 0; i--) {
    const [start, end] = quotedPositions[i]
    remaining = remaining.slice(0, start) + ' ' + remaining.slice(end)
  }

  // Tokenize
  const tokens = remaining.split(/\s+/).filter(Boolean)

  let i = 0
  while (i < tokens.length) {
    const token = tokens[i]
    const lowerToken = token.toLowerCase()

    // Type filters (@movie, @tv, etc.)
    if (lowerToken in TYPE_ALIASES) {
      const type = TYPE_ALIASES[lowerToken]
      if (lowerToken === '@media') {
        includeAllMedia = true
      } else if (!result.types.includes(type)) {
        result.types.push(type)
      }
      i++
      continue
    }

    // Status filter (status:completed)
    if (lowerToken.startsWith('status:')) {
      const statusVal = lowerToken.slice(7)
      if (statusVal in STATUS_ALIASES) {
        result.status = STATUS_ALIASES[statusVal]
      }
      i++
      continue
    }

    // User filter (by:Z, from:T)
    if (lowerToken.startsWith('by:') || lowerToken.startsWith('from:')) {
      const userVal = lowerToken.includes('by:') ? lowerToken.slice(3) : lowerToken.slice(5)
      if (userVal.toUpperCase() === 'Z' || userVal.toUpperCase() === 'T') {
        result.createdBy = userVal.toUpperCase() as UserId
      }
      i++
      continue
    }

    // Rating filter (rating>4, rating>=3, rating:4)
    const ratingMatch = lowerToken.match(/^rating([><=]+)?(\d+)$/)
    if (ratingMatch) {
      const op = ratingMatch[1] || ':'
      const val = parseInt(ratingMatch[2], 10)
      if (op === '>' || op === '>=') {
        result.minRating = op === '>=' ? val : val + 1
      } else if (op === '<' || op === '<=') {
        result.maxRating = op === '<=' ? val : val - 1
      } else {
        result.minRating = val
        result.maxRating = val
      }
      i++
      continue
    }

    // Year filter (year:2020, year>2015)
    const yearMatch = lowerToken.match(/^year([><=]+)?(\d{4})$/)
    if (yearMatch) {
      const op = yearMatch[1] || ':'
      const val = parseInt(yearMatch[2], 10)
      if (op === '>' || op === '>=') {
        result.yearMin = op === '>=' ? val : val + 1
      } else if (op === '<' || op === '<=') {
        result.yearMax = op === '<=' ? val : val - 1
      } else {
        result.year = val
      }
      i++
      continue
    }

    // Genre filter (genre:action)
    if (lowerToken.startsWith('genre:')) {
      result.genre = lowerToken.slice(6)
      i++
      continue
    }

    // Visited filter for places (visited:yes, visited:no)
    if (lowerToken.startsWith('visited:')) {
      const val = lowerToken.slice(8)
      result.visited = val === 'yes' || val === 'true' || val === '1'
      i++
      continue
    }

    // Archived filter for notes
    if (lowerToken.startsWith('archived:')) {
      const val = lowerToken.slice(9)
      result.archived = val === 'yes' || val === 'true' || val === '1'
      i++
      continue
    }

    // Unread filter for notes
    if (lowerToken === 'unread' || lowerToken === 'is:unread') {
      result.unread = true
      i++
      continue
    }

    // Negation (NOT word or -word)
    if (lowerToken === 'not' && i + 1 < tokens.length) {
      result.excludeTerms.push(tokens[i + 1].toLowerCase())
      i += 2
      continue
    }
    if (lowerToken.startsWith('-') && lowerToken.length > 1) {
      result.excludeTerms.push(lowerToken.slice(1))
      i++
      continue
    }

    // OR groups (word1 OR word2)
    if (i + 2 < tokens.length && tokens[i + 1].toUpperCase() === 'OR') {
      const orGroup = [lowerToken]
      i += 2
      while (i < tokens.length) {
        orGroup.push(tokens[i].toLowerCase())
        if (i + 2 < tokens.length && tokens[i + 1].toUpperCase() === 'OR') {
          i += 2
        } else {
          i++
          break
        }
      }
      result.orGroups.push(orGroup)
      continue
    }

    // Regular search term
    result.terms.push(lowerToken)
    i++
  }

  // Handle @media - include all media types
  if (includeAllMedia && result.types.length === 0) {
    result.types = ['movie', 'tv', 'game']
  }

  return result
}

// ─────────────────────────────────────────────────────────────────
// Matcher
// ─────────────────────────────────────────────────────────────────

/**
 * Check if an item matches the parsed query.
 * Returns a score (0 = no match, higher = better match).
 */
export function matchesQuery(item: SearchableItem, query: ParsedQuery): number {
  // Type filter - if types specified, item must match one
  if (query.types.length > 0 && !query.types.includes(item.type)) {
    return 0
  }

  // Status filter (for media)
  if (query.status && item.status !== query.status) {
    return 0
  }

  // User filter
  if (query.createdBy && item.createdBy !== query.createdBy) {
    return 0
  }

  // Rating filters
  if (query.minRating !== undefined && (item.rating === null || item.rating === undefined || item.rating < query.minRating)) {
    return 0
  }
  if (query.maxRating !== undefined && (item.rating === null || item.rating === undefined || item.rating > query.maxRating)) {
    return 0
  }

  // Year filters
  if (query.year !== undefined && item.year !== query.year) {
    return 0
  }
  if (query.yearMin !== undefined && (item.year === undefined || item.year < query.yearMin)) {
    return 0
  }
  if (query.yearMax !== undefined && (item.year === undefined || item.year > query.yearMax)) {
    return 0
  }

  // Genre filter
  if (query.genre && (!item.genres || !item.genres.some(g => g.toLowerCase().includes(query.genre!)))) {
    return 0
  }

  // Place-specific: visited
  if (query.visited !== undefined && item.visited !== query.visited) {
    return 0
  }

  // Note-specific: archived
  if (query.archived !== undefined && item.archived !== query.archived) {
    return 0
  }

  // Note-specific: unread
  if (query.unread && item.read !== false) {
    return 0
  }

  // Build searchable text
  const searchText = [
    item.title,
    item.content || '',
    ...(item.tags || []),
    ...(item.genres || []),
  ].join(' ').toLowerCase()

  let score = 100 // Base score

  // Exact phrases must all match
  for (const phrase of query.exactPhrases) {
    if (!searchText.includes(phrase)) {
      return 0
    }
    score += 20 // Bonus for exact phrase match
  }

  // Excluded terms must not appear
  for (const term of query.excludeTerms) {
    if (searchText.includes(term)) {
      return 0
    }
  }

  // Required terms (AND) - all must match
  for (const term of query.terms) {
    if (!searchText.includes(term)) {
      return 0
    }
    // Bonus for title match
    if (item.title.toLowerCase().includes(term)) {
      score += 15
    } else {
      score += 5
    }
  }

  // OR groups - at least one term from each group must match
  for (const orGroup of query.orGroups) {
    const hasMatch = orGroup.some(term => searchText.includes(term))
    if (!hasMatch) {
      return 0
    }
    score += 10
  }

  // Bonus for title starting with first search term
  if (query.terms.length > 0 && item.title.toLowerCase().startsWith(query.terms[0])) {
    score += 25
  }

  return score
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

/**
 * Check if query has any actual search criteria.
 */
export function hasSearchCriteria(query: ParsedQuery): boolean {
  return (
    query.terms.length > 0 ||
    query.exactPhrases.length > 0 ||
    query.orGroups.length > 0 ||
    query.types.length > 0 ||
    query.status !== undefined ||
    query.createdBy !== undefined ||
    query.minRating !== undefined ||
    query.maxRating !== undefined ||
    query.year !== undefined ||
    query.yearMin !== undefined ||
    query.yearMax !== undefined ||
    query.genre !== undefined ||
    query.visited !== undefined ||
    query.archived !== undefined ||
    query.unread !== undefined
  )
}

/**
 * Get a description of active filters for display.
 */
export function getFilterSummary(query: ParsedQuery): string[] {
  const parts: string[] = []

  if (query.types.length > 0) {
    parts.push(`Type: ${query.types.join(', ')}`)
  }
  if (query.status) {
    parts.push(`Status: ${query.status}`)
  }
  if (query.createdBy) {
    parts.push(`By: ${query.createdBy}`)
  }
  if (query.minRating !== undefined || query.maxRating !== undefined) {
    if (query.minRating === query.maxRating) {
      parts.push(`Rating: ${query.minRating}`)
    } else if (query.minRating !== undefined && query.maxRating !== undefined) {
      parts.push(`Rating: ${query.minRating}-${query.maxRating}`)
    } else if (query.minRating !== undefined) {
      parts.push(`Rating: ≥${query.minRating}`)
    } else {
      parts.push(`Rating: ≤${query.maxRating}`)
    }
  }
  if (query.year !== undefined) {
    parts.push(`Year: ${query.year}`)
  }
  if (query.yearMin !== undefined || query.yearMax !== undefined) {
    if (query.yearMin !== undefined && query.yearMax !== undefined) {
      parts.push(`Year: ${query.yearMin}-${query.yearMax}`)
    } else if (query.yearMin !== undefined) {
      parts.push(`Year: ≥${query.yearMin}`)
    } else {
      parts.push(`Year: ≤${query.yearMax}`)
    }
  }
  if (query.genre) {
    parts.push(`Genre: ${query.genre}`)
  }
  if (query.visited !== undefined) {
    parts.push(`Visited: ${query.visited ? 'yes' : 'no'}`)
  }
  if (query.archived !== undefined) {
    parts.push(`Archived: ${query.archived ? 'yes' : 'no'}`)
  }
  if (query.unread) {
    parts.push('Unread')
  }

  return parts
}

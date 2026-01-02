/**
 * Simple fuzzy matching utility.
 * Returns a score (0-100) indicating match quality.
 */

export interface FuzzyResult<T> {
  item: T
  score: number
}

/**
 * Calculate fuzzy match score between query and target string.
 * Higher scores = better matches.
 */
export function fuzzyScore(query: string, target: string): number {
  if (!query || !target) return 0
  
  const q = query.toLowerCase().trim()
  const t = target.toLowerCase()
  
  if (!q) return 100 // Empty query matches everything
  if (t === q) return 100 // Exact match
  if (t.startsWith(q)) return 95 // Starts with query
  if (t.includes(q)) return 85 // Contains query as substring
  
  // Check if all query chars appear in order (subsequence match)
  let qIdx = 0
  let consecutiveBonus = 0
  let lastMatchIdx = -2
  
  for (let tIdx = 0; tIdx < t.length && qIdx < q.length; tIdx++) {
    if (t[tIdx] === q[qIdx]) {
      // Bonus for consecutive matches
      if (tIdx === lastMatchIdx + 1) {
        consecutiveBonus += 5
      }
      // Bonus for word boundary matches
      if (tIdx === 0 || t[tIdx - 1] === ' ' || t[tIdx - 1] === '-' || t[tIdx - 1] === ':') {
        consecutiveBonus += 10
      }
      lastMatchIdx = tIdx
      qIdx++
    }
  }
  
  if (qIdx === q.length) {
    // All query characters found in order
    const baseScore = 60
    const lengthPenalty = Math.min(20, (t.length - q.length) / 2)
    return Math.min(80, baseScore + consecutiveBonus - lengthPenalty)
  }
  
  // Partial match - some characters found
  const matchRatio = qIdx / q.length
  if (matchRatio > 0.5) {
    return Math.floor(30 * matchRatio)
  }
  
  return 0
}

/**
 * Filter and sort items by fuzzy match score.
 * Returns items with score > threshold, sorted by score descending.
 */
export function fuzzyFilter<T>(
  items: T[],
  query: string,
  getText: (item: T) => string,
  threshold: number = 20
): FuzzyResult<T>[] {
  if (!query.trim()) {
    return items.map(item => ({ item, score: 100 }))
  }
  
  return items
    .map(item => ({
      item,
      score: fuzzyScore(query, getText(item))
    }))
    .filter(result => result.score >= threshold)
    .sort((a, b) => b.score - a.score)
}

/**
 * Multi-field fuzzy matching.
 * Returns highest score across all fields.
 */
export function fuzzyScoreMulti(query: string, ...targets: (string | undefined)[]): number {
  let maxScore = 0
  for (const target of targets) {
    if (target) {
      const score = fuzzyScore(query, target)
      if (score > maxScore) maxScore = score
    }
  }
  return maxScore
}

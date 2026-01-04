/**
 * Wikipedia API for game search with images
 * CORS-friendly, no API key required
 */

export interface WikiSearchResult {
  pageid: number;
  title: string;
  snippet: string;
}

export interface WikiGameResult {
  pageid: number;
  title: string;
  description: string;
  thumbnail: string | null;
}

const WIKI_API = 'https://en.wikipedia.org/w/api.php';

// Cache for game search results
const searchCache = new Map<string, WikiGameResult[]>();

/** Clear the search cache (for testing) */
export function clearSearchCache(): void {
  searchCache.clear();
}

// Keywords that indicate a page is about a video game
const GAME_KEYWORDS = [
  'video game',
  'is a game',
  'is an action',
  'is a role-playing',
  'is a puzzle',
  'is a platformer',
  'is a racing',
  'is a simulation',
  'is a strategy',
  'is a shooter',
  'is a fighting',
  'is a sports',
  'is a horror',
  'is a survival',
  'is a sandbox',
  'is a roguelike',
  'developed by',
  'published by',
  'playstation',
  'xbox',
  'nintendo',
  'steam',
  'pc game',
];

// Filter to check if a result is likely a video game
function isLikelyGame(title: string, snippet: string): boolean {
  const combined = `${title} ${snippet}`.toLowerCase();

  // Strong indicators - title contains game suffix
  if (/\(.*video game.*\)/i.test(title) || /\(.*game.*\)/i.test(title)) {
    return true;
  }

  // Check for game keywords in snippet
  return GAME_KEYWORDS.some(keyword => combined.includes(keyword));
}

// Calculate relevance score for sorting
function getRelevanceScore(query: string, title: string, _snippet: string): number {
  const queryLower = query.toLowerCase();
  const titleLower = title.toLowerCase();
  const cleanTitle = titleLower.replace(/\s*\(.*\)\s*$/, ''); // Remove parenthetical suffix

  let score = 0;

  // Exact title match (highest priority)
  if (cleanTitle === queryLower) score += 100;
  // Title starts with query
  else if (cleanTitle.startsWith(queryLower)) score += 80;
  // Title contains query as word
  else if (new RegExp(`\\b${queryLower}\\b`).test(cleanTitle)) score += 60;
  // Title contains query
  else if (cleanTitle.includes(queryLower)) score += 40;

  // Bonus for having "(video game)" in title - indicates dedicated game page
  if (/\(video game\)/i.test(title)) score += 20;
  if (/\(\d{4} video game\)/i.test(title)) score += 25;

  // Penalty for disambiguation pages or lists
  if (titleLower.includes('list of') || titleLower.includes('(disambiguation)')) {
    score -= 50;
  }

  return score;
}

/**
 * Search Wikipedia for video games with improved relevance
 */
export async function searchGames(query: string): Promise<WikiGameResult[]> {
  if (!query.trim()) return [];

  // Check cache first
  const cacheKey = query.trim().toLowerCase();
  const cached = searchCache.get(cacheKey);
  if (cached) return cached;

  // Search with "video game" suffix for better results
  const searchQuery = `${query} video game`;

  const searchParams = new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: searchQuery,
    srlimit: '15', // Fetch more to filter down
    format: 'json',
    origin: '*'
  });

  try {
    const res = await fetch(`${WIKI_API}?${searchParams}`);
    if (res.ok === false) {
      console.warn(`Wikipedia search failed: ${res.status}`);
      return [];
    }
    const data = await res.json();
    const results = (data.query?.search || []) as WikiSearchResult[];

    if (results.length === 0) return [];

    // Filter and score results
    const scoredResults = results
      .filter(r => isLikelyGame(r.title, r.snippet))
      .map(r => ({
        ...r,
        score: getRelevanceScore(query, r.title, r.snippet)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8); // Take top 8

    if (scoredResults.length === 0) return [];

    // Fetch thumbnails and categories for all results
    const titles = scoredResults.map(r => r.title).join('|');
    const imageParams = new URLSearchParams({
      action: 'query',
      titles,
      prop: 'pageimages|extracts|categories',
      pithumbsize: '300', // Larger thumbnails
      exintro: '1',
      explaintext: '1',
      exsentences: '2',
      cllimit: '5',
      format: 'json',
      origin: '*'
    });

    const imageRes = await fetch(`${WIKI_API}?${imageParams}`);
    if (imageRes.ok === false) {
      console.warn(`Wikipedia image fetch failed: ${imageRes.status}`);
      return [];
    }
    const imageData = await imageRes.json();
    const pages = imageData.query?.pages || {};

    // Map results with thumbnails - first pass: filter and collect
    interface ProcessedResult {
      pageid: number;
      title: string;
      description: string;
      thumbnail: string | null;
    }

    const processedResults: ProcessedResult[] = [];
    const needsImageFetch: number[] = []; // Indices of results needing image fetch

    for (const r of scoredResults) {
      const page = Object.values(pages).find((p: unknown) => (p as { title: string }).title === r.title) as {
        pageid: number;
        title: string;
        thumbnail?: { source: string };
        extract?: string;
        categories?: Array<{ title: string }>;
      } | undefined;

      // Additional category-based filtering
      const categories = page?.categories?.map(c => c.title.toLowerCase()) || [];
      const hasGameCategory = categories.some(c =>
        c.includes('video game') || c.includes('games')
      );

      // Skip if no game category and low relevance
      if (!hasGameCategory && r.score < 40) continue;

      let thumbnail = page?.thumbnail?.source || null;

      // Try to get a higher resolution image if available
      if (thumbnail) {
        // Wikipedia thumbnail URLs can be modified to get larger versions
        thumbnail = thumbnail.replace(/\/\d+px-/, '/300px-');
      }

      const resultIndex = processedResults.length;
      processedResults.push({
        pageid: r.pageid,
        title: r.title
          .replace(/ \(video game\)$/i, '')
          .replace(/ \(\d{4} video game\)$/i, '')
          .replace(/ \(game\)$/i, ''),
        description: page?.extract || stripHtml(r.snippet),
        thumbnail
      });

      // Track which results need image fetch (parallel later)
      if (!thumbnail) {
        needsImageFetch.push(resultIndex);
      }
    }

    // Batch fetch missing images in parallel (fixes N+1 problem)
    if (needsImageFetch.length > 0) {
      const imagePromises = needsImageFetch.map(idx =>
        fetchPageImage(processedResults[idx].pageid)
      );
      const fetchedImages = await Promise.all(imagePromises);

      // Apply fetched images to results
      needsImageFetch.forEach((resultIdx, i) => {
        processedResults[resultIdx].thumbnail = fetchedImages[i];
      });
    }

    // Build final results
    const gameResults: WikiGameResult[] = processedResults

    // Cache and return
    searchCache.set(cacheKey, gameResults);
    return gameResults;
  } catch (e) {
    console.error('Wikipedia search failed:', e);
    return [];
  }
}

/**
 * Try to fetch the main image from a Wikipedia page
 */
async function fetchPageImage(pageid: number): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      action: 'query',
      pageids: String(pageid),
      prop: 'images',
      imlimit: '10',
      format: 'json',
      origin: '*'
    });

    const res = await fetch(`${WIKI_API}?${params}`);
    if (res.ok === false) return null;
    const data = await res.json();
    const page = data.query?.pages?.[pageid];

    if (!page?.images) return null;

    // Look for cover/box art images
    const images = page.images as Array<{ title: string }>;
    const coverImage = images.find(img => {
      const name = img.title.toLowerCase();
      return (
        (name.includes('cover') || name.includes('box') || name.includes('art')) &&
        !name.includes('logo') &&
        (name.endsWith('.jpg') || name.endsWith('.png'))
      );
    });

    if (!coverImage) return null;

    // Get the actual image URL
    const urlParams = new URLSearchParams({
      action: 'query',
      titles: coverImage.title,
      prop: 'imageinfo',
      iiprop: 'url',
      iiurlwidth: '300',
      format: 'json',
      origin: '*'
    });

    const urlRes = await fetch(`${WIKI_API}?${urlParams}`);
    if (urlRes.ok === false) return null;
    const urlData = await urlRes.json();
    const imagePages = urlData.query?.pages || {};
    const imagePage = Object.values(imagePages)[0] as {
      imageinfo?: Array<{ thumburl?: string; url?: string }>;
    } | undefined;

    return imagePage?.imageinfo?.[0]?.thumburl || imagePage?.imageinfo?.[0]?.url || null;
  } catch {
    return null;
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}

/**
 * Fetch a game thumbnail by title (for games added without images)
 * Returns the thumbnail URL or null if not found
 */
export async function fetchGameThumbnail(title: string): Promise<string | null> {
  if (!title.trim()) return null;

  try {
    // First search for the game to get its page ID
    const results = await searchGames(title);
    if (results.length === 0) return null;

    // Find exact or closest match
    const exactMatch = results.find(r =>
      r.title.toLowerCase() === title.toLowerCase()
    );
    const bestMatch = exactMatch || results[0];

    return bestMatch.thumbnail;
  } catch (e) {
    console.warn('Failed to fetch game thumbnail:', e);
    return null;
  }
}

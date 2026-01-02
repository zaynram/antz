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

/**
 * Search Wikipedia for video games
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
    srlimit: '8',
    format: 'json',
    origin: '*'
  });
  
  try {
    const res = await fetch(`${WIKI_API}?${searchParams}`);
    const data = await res.json();
    const results = (data.query?.search || []) as WikiSearchResult[];
    
    if (results.length === 0) return [];
    
    // Fetch thumbnails for all results in parallel
    const titles = results.map(r => r.title).join('|');
    const imageParams = new URLSearchParams({
      action: 'query',
      titles,
      prop: 'pageimages|extracts',
      pithumbsize: '200',
      exintro: '1',
      explaintext: '1',
      exsentences: '2',
      format: 'json',
      origin: '*'
    });
    
    const imageRes = await fetch(`${WIKI_API}?${imageParams}`);
    const imageData = await imageRes.json();
    const pages = imageData.query?.pages || {};
    
    // Map results with thumbnails
    const gameResults = results.map(r => {
      const page = Object.values(pages).find((p: unknown) => (p as { title: string }).title === r.title) as {
        pageid: number;
        title: string;
        thumbnail?: { source: string };
        extract?: string;
      } | undefined;

      return {
        pageid: r.pageid,
        title: r.title.replace(/ \(video game\)$/i, '').replace(/ \(\d{4} video game\)$/i, ''),
        description: page?.extract || stripHtml(r.snippet),
        thumbnail: page?.thumbnail?.source || null
      };
    });

    // Cache and return
    searchCache.set(cacheKey, gameResults);
    return gameResults;
  } catch (e) {
    console.error('Wikipedia search failed:', e);
    return [];
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}

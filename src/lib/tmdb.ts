import { tmdbConfig } from './config'

export interface TMDBGenre {
    id: number
    name: string
}

export interface TMDBProductionCompany {
    id: number
    name: string
    logo_path: string | null
    origin_country: string
}

export interface TMDBCollection {
    id: number
    name: string
    poster_path: string | null
    backdrop_path: string | null
}

export interface TMDBMovieDetails {
    id: number
    title: string
    overview: string
    poster_path: string | null
    release_date: string
    genres: TMDBGenre[]
    belongs_to_collection: TMDBCollection | null
    production_companies: TMDBProductionCompany[]
    runtime: number | null
}

export interface TMDBTVDetails {
    id: number
    name: string
    overview: string
    poster_path: string | null
    first_air_date: string
    genres: TMDBGenre[]
    production_companies: TMDBProductionCompany[]
    number_of_seasons: number
    number_of_episodes: number
}

// Genre cache - populated on first use
let movieGenreCache: Map<number, string> | null = null
let tvGenreCache: Map<number, string> | null = null

// Details cache for movie/TV info
const movieDetailsCache = new Map<number, TMDBMovieDetails>()
const tvDetailsCache = new Map<number, TMDBTVDetails>()

async function fetchGenreList(type: 'movie' | 'tv'): Promise<Map<number, string>> {
    const res = await fetch(
        `${tmdbConfig.baseUrl}/genre/${type}/list?api_key=${tmdbConfig.apiKey}`
    )
    const data = await res.json()
    const map = new Map<number, string>()
    for (const genre of data.genres as TMDBGenre[]) {
        map.set(genre.id, genre.name)
    }
    return map
}

export async function getGenreMap(type: 'movie' | 'tv'): Promise<Map<number, string>> {
    if (type === 'movie') {
        if (!movieGenreCache) {
            movieGenreCache = await fetchGenreList('movie')
        }
        return movieGenreCache
    } else {
        if (!tvGenreCache) {
            tvGenreCache = await fetchGenreList('tv')
        }
        return tvGenreCache
    }
}

export async function resolveGenreIds(ids: number[], type: 'movie' | 'tv'): Promise<string[]> {
    const map = await getGenreMap(type)
    return ids.map(id => map.get(id)).filter((name): name is string => name !== undefined)
}

export async function fetchMovieDetails(tmdbId: number): Promise<TMDBMovieDetails> {
    // Return cached if available
    const cached = movieDetailsCache.get(tmdbId)
    if (cached) return cached

    const res = await fetch(
        `${tmdbConfig.baseUrl}/movie/${tmdbId}?api_key=${tmdbConfig.apiKey}`
    )
    if (!res.ok) {
        throw new Error(`Failed to fetch movie details: ${res.status}`)
    }
    const data = await res.json()
    movieDetailsCache.set(tmdbId, data)
    return data
}

export async function fetchTVDetails(tmdbId: number): Promise<TMDBTVDetails> {
    // Return cached if available
    const cached = tvDetailsCache.get(tmdbId)
    if (cached) return cached

    const res = await fetch(
        `${tmdbConfig.baseUrl}/tv/${tmdbId}?api_key=${tmdbConfig.apiKey}`
    )
    if (!res.ok) {
        throw new Error(`Failed to fetch TV details: ${res.status}`)
    }
    const data = await res.json()
    tvDetailsCache.set(tmdbId, data)
    return data
}

export interface ProductionCompany {
    id: number
    name: string
}

export interface MediaCollection {
    id: number
    name: string
}

export interface EnrichedMediaData {
    genres: string[]
    collection: MediaCollection | null
    productionCompanies: ProductionCompany[]
}

export async function enrichMediaData(
    tmdbId: number,
    mediaType: 'movie' | 'tv'
): Promise<EnrichedMediaData> {
    if (mediaType === 'movie') {
        const details = await fetchMovieDetails(tmdbId)
        return {
            genres: details.genres.map(g => g.name),
            collection: details.belongs_to_collection
                ? { id: details.belongs_to_collection.id, name: details.belongs_to_collection.name }
                : null,
            productionCompanies: details.production_companies.map(c => ({ id: c.id, name: c.name }))
        }
    } else {
        const details = await fetchTVDetails(tmdbId)
        return {
            genres: details.genres.map(g => g.name),
            collection: null, // TV shows don't have collections in TMDB
            productionCompanies: details.production_companies.map(c => ({ id: c.id, name: c.name }))
        }
    }
}

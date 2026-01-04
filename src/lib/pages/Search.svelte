<script lang="ts">
  import { subscribeToCollection, addDocument } from '$lib/firebase'
  import { activeUser, displayNames, currentPreferences } from '$lib/stores/app'
  import type { Media, Note, Place, MediaType } from '$lib/types'
  import { getDisplayRating } from '$lib/types'
  import { onMount } from 'svelte'
  import { parseQuery, matchesQuery, hasSearchCriteria, getFilterSummary, type SearchableItem } from '$lib/queryParser'
  import { tmdbConfig } from '$lib/config'
  import { Film, Tv, Gamepad2, StickyNote, MapPin, Search as SearchIcon, HelpCircle, ChevronDown, ChevronUp, X, Check, ChevronRight, Archive, ArchiveRestore, Trash2, Plus, Library, Compass, Loader2 } from 'lucide-svelte'
  import { deleteDocument } from '$lib/firebase'
  import { toast } from 'svelte-sonner'
  import { hapticLight, hapticSuccess } from '$lib/haptics'
  import MediaDetailModal from '$lib/components/MediaDetailModal.svelte'
  import PlaceDetailModal from '$lib/components/PlaceDetailModal.svelte'
  import EmptyState from '$lib/components/ui/EmptyState.svelte'
  import { updateDocument } from '$lib/firebase'
  import { Timestamp } from 'firebase/firestore'
  import { searchMovies, searchTV, type TMDBSearchResult } from '$lib/tmdb'
  import { searchGames, type WikiGameResult, fetchGameThumbnail } from '$lib/wikipedia'

  interface Props {
    navigate: (path: string) => void
  }

  let { navigate }: Props = $props()

  // Search mode
  type SearchMode = 'library' | 'discover'
  let searchMode = $state<SearchMode>('library')

  // Data stores
  let media = $state<Media[]>([])
  let notes = $state<Note[]>([])
  let places = $state<Place[]>([])

  // Search state
  let searchQuery = $state('')
  let debouncedQuery = $state('') // Debounced query for expensive search operations
  let searchInput = $state<HTMLInputElement | null>(null)
  let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null
  const SEARCH_DEBOUNCE_MS = 300 // Slightly longer for API calls

  // Discover state
  let discoverResults = $state<{
    movies: TMDBSearchResult[]
    tv: TMDBSearchResult[]
    games: WikiGameResult[]
  }>({ movies: [], tv: [], games: [] })
  let isSearching = $state(false)
  let discoverRequestId = 0
  let addingItems = $state<Set<string>>(new Set())

  // Discover category filter
  type DiscoverCategory = 'all' | 'movie' | 'tv' | 'game'
  let discoverCategory = $state<DiscoverCategory>('all')

  // Tips toggle (persisted)
  let showTips = $state(true)

  // Selected items for detail views
  let selectedMedia = $state<Media | null>(null)
  let selectedPlace = $state<Place | null>(null)
  let expandedNoteId = $state<string | null>(null)

  // Subscriptions
  let unsubMedia: (() => void) | undefined
  let unsubNotes: (() => void) | undefined
  let unsubPlaces: (() => void) | undefined

  onMount(() => {
    // Load tips preference
    try {
      const stored = localStorage.getItem('search-tips-visible')
      if (stored !== null) {
        showTips = stored === 'true'
      }
    } catch (e) {
      console.warn('Failed to load tips preference:', e)
    }

    unsubMedia = subscribeToCollection<Media>('media', (items) => { media = items })
    unsubNotes = subscribeToCollection<Note>('notes', (items) => { notes = items })
    unsubPlaces = subscribeToCollection<Place>('places', (items) => { places = items })

    // Focus search input on mount (slight delay for mobile keyboards)
    setTimeout(() => searchInput?.focus(), 100)

    return () => {
      unsubMedia?.()
      unsubNotes?.()
      unsubPlaces?.()
    }
  })

  // Persist tips preference
  function toggleTips() {
    showTips = !showTips
    try {
      localStorage.setItem('search-tips-visible', String(showTips))
    } catch (e) {
      console.warn('Failed to save tips preference:', e)
    }
  }

  // Debounce search query to prevent expensive recalculations on every keystroke
  $effect(() => {
    const query = searchQuery // Read synchronously to track dependency
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
    searchDebounceTimer = setTimeout(() => {
      debouncedQuery = query
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
    }
  })

  // Parse query - use debounced query for expensive operations
  let parsedQuery = $derived(parseQuery(debouncedQuery))
  let hasQuery = $derived(hasSearchCriteria(parsedQuery))
  let filterSummary = $derived(getFilterSummary(parsedQuery))

  // Discover search effect
  $effect(() => {
    if (searchMode !== 'discover' || !debouncedQuery.trim()) {
      discoverResults = { movies: [], tv: [], games: [] }
      return
    }

    const currentId = ++discoverRequestId
    isSearching = true

    // Determine limits based on category filter
    const movieLimit = discoverCategory === 'all' ? 6 : (discoverCategory === 'movie' ? 15 : 0)
    const tvLimit = discoverCategory === 'all' ? 6 : (discoverCategory === 'tv' ? 15 : 0)
    const gameLimit = discoverCategory === 'all' ? 6 : (discoverCategory === 'game' ? 15 : 0)

    // Run searches in parallel
    Promise.all([
      movieLimit > 0 ? searchMovies(debouncedQuery, movieLimit) : Promise.resolve([]),
      tvLimit > 0 ? searchTV(debouncedQuery, tvLimit) : Promise.resolve([]),
      gameLimit > 0 ? searchGames(debouncedQuery) : Promise.resolve([])
    ]).then(([movies, tv, games]) => {
      // Only update if this is still the current request
      if (currentId === discoverRequestId) {
        discoverResults = {
          movies,
          tv,
          games: games.slice(0, gameLimit)
        }
        isSearching = false
      }
    }).catch(e => {
      console.error('Discover search failed:', e)
      if (currentId === discoverRequestId) {
        isSearching = false
      }
    })
  })

  // Check if item is already in library
  function isInLibrary(type: MediaType, tmdbId?: number, title?: string): boolean {
    if (tmdbId) {
      return media.some(m => m.type === type && m.tmdbId === tmdbId)
    }
    // For games, check by title
    return media.some(m => m.type === type && m.title.toLowerCase() === title?.toLowerCase())
  }

  // Add item to library
  async function addToLibrary(
    type: MediaType,
    title: string,
    posterPath: string | null,
    releaseDate: string | undefined,
    overview: string,
    tmdbId?: number
  ) {
    const itemKey = `${type}-${tmdbId || title}`
    if (addingItems.has(itemKey)) return

    addingItems = new Set([...addingItems, itemKey])

    try {
      // For games without posters, try to fetch from Wikipedia
      let finalPosterPath = posterPath
      if (type === 'game' && !posterPath) {
        const thumbnail = await fetchGameThumbnail(title)
        if (thumbnail) {
          finalPosterPath = thumbnail
        }
      }

      await addDocument<Media>('media', {
        type,
        title,
        posterPath: finalPosterPath,
        releaseDate,
        overview,
        tmdbId,
        status: 'queued',
        rating: null,
        ratings: { Z: null, T: null },
        notes: ''
      }, $activeUser)

      hapticSuccess()
      toast.success(`Added "${title}" to library`)
    } catch (e) {
      console.error('Failed to add to library:', e)
      toast.error('Failed to add to library')
    } finally {
      addingItems = new Set([...addingItems].filter(k => k !== itemKey))
    }
  }

  // Combined discover results for display
  let combinedDiscoverResults = $derived.by(() => {
    const results: Array<{
      type: 'movie' | 'tv' | 'game'
      id: string
      title: string
      posterPath: string | null
      releaseDate: string | undefined
      overview: string
      tmdbId?: number
      inLibrary: boolean
    }> = []

    for (const m of discoverResults.movies) {
      results.push({
        type: 'movie',
        id: `movie-${m.id}`,
        title: m.title || '',
        posterPath: m.poster_path,
        releaseDate: m.release_date,
        overview: m.overview,
        tmdbId: m.id,
        inLibrary: isInLibrary('movie', m.id)
      })
    }

    for (const t of discoverResults.tv) {
      results.push({
        type: 'tv',
        id: `tv-${t.id}`,
        title: t.name || '',
        posterPath: t.poster_path,
        releaseDate: t.first_air_date,
        overview: t.overview,
        tmdbId: t.id,
        inLibrary: isInLibrary('tv', t.id)
      })
    }

    for (const g of discoverResults.games) {
      results.push({
        type: 'game',
        id: `game-${g.pageid}`,
        title: g.title,
        posterPath: g.thumbnail,
        releaseDate: undefined,
        overview: g.description,
        inLibrary: isInLibrary('game', undefined, g.title)
      })
    }

    return results
  })

  let hasDiscoverResults = $derived(combinedDiscoverResults.length > 0)

  // Convert items to searchable format
  function mediaToSearchable(item: Media): SearchableItem {
    return {
      id: item.id || '',
      type: item.type,
      title: item.title,
      content: item.overview,
      status: item.status,
      rating: getDisplayRating(item),
      year: item.releaseDate ? parseInt(item.releaseDate.split('-')[0], 10) : undefined,
      createdBy: item.createdBy,
      genres: item.genres,
    }
  }

  function noteToSearchable(item: Note): SearchableItem {
    return {
      id: item.id || '',
      type: 'note',
      title: item.title || '(No subject)',
      content: item.content,
      tags: item.tags,
      createdBy: item.createdBy,
      archived: item.archived,
      read: item.read,
    }
  }

  function placeToSearchable(item: Place): SearchableItem {
    return {
      id: item.id || '',
      type: 'place',
      title: item.name,
      content: item.notes,
      createdBy: item.createdBy,
      visited: item.visited,
    }
  }

  // Search results with performance optimization
  let results = $derived.by(() => {
    if (!hasQuery) return []

    const allItems: Array<{ item: SearchableItem; score: number; original: Media | Note | Place }> = []

    // Search media
    for (const m of media) {
      const searchable = mediaToSearchable(m)
      const score = matchesQuery(searchable, parsedQuery)
      if (score > 0) {
        allItems.push({ item: searchable, score, original: m })
      }
    }

    // Search notes
    for (const n of notes) {
      const searchable = noteToSearchable(n)
      const score = matchesQuery(searchable, parsedQuery)
      if (score > 0) {
        allItems.push({ item: searchable, score, original: n })
      }
    }

    // Search places
    for (const p of places) {
      const searchable = placeToSearchable(p)
      const score = matchesQuery(searchable, parsedQuery)
      if (score > 0) {
        allItems.push({ item: searchable, score, original: p })
      }
    }

    // Sort by score descending, limit for performance
    return allItems.sort((a, b) => b.score - a.score).slice(0, 50)
  })

  function posterUrl(path: string | null | undefined): string | null {
    if (!path) return null
    if (path.startsWith('http')) return path
    return `${tmdbConfig.imageBaseUrl}/w185${path}`
  }

  function clearSearch() {
    searchQuery = ''
    debouncedQuery = ''
    searchInput?.focus()
  }

  // Immediately execute search (flush debounce) - for Enter key and search button
  function executeSearch() {
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer)
      searchDebounceTimer = null
    }
    debouncedQuery = searchQuery
  }

  // Open media detail modal
  function openMediaDetail(item: Media) {
    selectedMedia = item
  }

  function closeMediaDetail() {
    selectedMedia = null
  }

  // Keep selected items in sync with real-time updates
  $effect(() => {
    if (selectedMedia) {
      const updated = media.find(m => m.id === selectedMedia!.id)
      if (updated) selectedMedia = updated
    }
  })

  $effect(() => {
    if (selectedPlace) {
      const updated = places.find(p => p.id === selectedPlace!.id)
      if (updated) selectedPlace = updated
    }
  })

  // Place modal handlers
  function openPlaceDetail(place: Place) {
    selectedPlace = place
  }

  function closePlaceDetail() {
    selectedPlace = null
  }

  // Note expansion handler
  function toggleNoteExpand(note: Note) {
    if (expandedNoteId === note.id) {
      expandedNoteId = null
    } else {
      expandedNoteId = note.id || null
      // Mark as read if unread and from other user
      if (!note.read && note.createdBy !== $activeUser && note.id) {
        updateDocument<Note>('notes', note.id, {
          read: true,
          readAt: Timestamp.now()
        }, $activeUser)
      }
    }
  }

  // Note action handlers
  async function toggleNoteArchive(note: Note) {
    if (!note.id) return
    hapticLight()
    await updateDocument<Note>('notes', note.id, {
      archived: !note.archived
    }, $activeUser)
    toast.success(note.archived ? 'Note unarchived' : 'Note archived')
  }

  async function deleteNote(note: Note) {
    if (!note.id) return
    if (confirm('Delete this note permanently?')) {
      try {
        await deleteDocument('notes', note.id)
        expandedNoteId = null
        toast.success('Note deleted')
      } catch (e) {
        console.error('Failed to delete note:', e)
        toast.error('Failed to delete note')
      }
    }
  }

  // Format relative time for notes
  function getRelativeTime(timestamp: { toDate: () => Date } | undefined): string {
    if (!timestamp) return ''
    const date = timestamp.toDate()
    const now = Date.now()
    const diffMs = now - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  // Quick filter buttons (library mode)
  const libraryFilters = [
    { label: 'Movies', query: '@movie', icon: Film },
    { label: 'TV', query: '@tv', icon: Tv },
    { label: 'Games', query: '@game', icon: Gamepad2 },
    { label: 'Notes', query: '@note', icon: StickyNote },
    { label: 'Places', query: '@place', icon: MapPin },
  ]

  // Category filters (discover mode)
  const discoverFilters: Array<{ label: string; value: DiscoverCategory; icon: typeof Film }> = [
    { label: 'All', value: 'all', icon: Compass },
    { label: 'Movies', value: 'movie', icon: Film },
    { label: 'TV', value: 'tv', icon: Tv },
    { label: 'Games', value: 'game', icon: Gamepad2 },
  ]

  // Check if a quick filter is active in the current search query
  function isFilterActive(filterQuery: string): boolean {
    // Match the filter term as a complete token (word boundary or end of string)
    const regex = new RegExp(`${filterQuery}(?:\\s|$)`, 'i')
    return regex.test(searchQuery)
  }

  function applyQuickFilter(query: string) {
    if (isFilterActive(query)) {
      // Remove the filter from the query
      const regex = new RegExp(`${query}\\s*`, 'gi')
      searchQuery = searchQuery.replace(regex, '').trim()
    } else {
      // Add the filter to the beginning of the query
      searchQuery = query + ' ' + searchQuery.trim()
    }
    searchInput?.focus()
  }

  // Example searches
  const exampleSearches = [
    { query: '@movie rating>4', desc: 'Highly rated movies' },
    { query: '@tv status:watching', desc: 'TV shows in progress' },
    { query: '"star wars"', desc: 'Exact phrase' },
    { query: '@place visited:no', desc: 'Places to visit' },
    { query: 'horror OR thriller', desc: 'Horror or thriller' },
    { query: 'status:completed', desc: 'All completed' },
  ]

  // Stats for empty state
  let stats = $derived({
    movies: media.filter(m => m.type === 'movie').length,
    tv: media.filter(m => m.type === 'tv').length,
    games: media.filter(m => m.type === 'game').length,
    notes: notes.length,
    places: places.length,
    total: media.length + notes.length + places.length,
  })
</script>

<div class="max-w-3xl mx-auto">
  <!-- Welcome -->
  <section class="text-center mb-6">
    <h1 class="text-2xl font-bold mb-1">Hi, {$currentPreferences.name}</h1>
    <p class="text-slate-500 dark:text-slate-400 text-sm">
      {stats.total} items in your collection
    </p>
  </section>

  <!-- Mode toggle -->
  <div class="flex justify-center mb-4">
    <div class="inline-flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
      <button
        type="button"
        class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors touch-manipulation {searchMode === 'library' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}"
        onclick={() => { searchMode = 'library'; hapticLight() }}
      >
        <Library size={16} />
        <span>Library</span>
      </button>
      <button
        type="button"
        class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors touch-manipulation {searchMode === 'discover' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}"
        onclick={() => { searchMode = 'discover'; hapticLight() }}
      >
        <Compass size={16} />
        <span>Discover</span>
      </button>
    </div>
  </div>

  <!-- Search input -->
  <form
    class="relative mb-4 flex gap-2"
    onsubmit={(e) => { e.preventDefault(); executeSearch(); }}
  >
    <div class="relative flex-1">
      <input
        type="text"
        bind:this={searchInput}
        bind:value={searchQuery}
        placeholder={searchMode === 'library' ? 'Search your library...' : 'Search movies, TV & games...'}
        class="w-full px-5 py-4 pl-12 pr-12 bg-surface border border-slate-200 dark:border-slate-700 rounded-2xl text-slate-900 dark:text-slate-100 text-lg focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-all"
      />
      {#if isSearching}
        <Loader2 class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-accent animate-spin" />
      {:else}
        <SearchIcon class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
      {/if}
      {#if searchQuery}
        <button
          type="button"
          class="absolute right-4 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 touch-manipulation"
          onclick={clearSearch}
          aria-label="Clear search"
        >
          <X size={20} />
        </button>
      {/if}
    </div>
    <button
      type="submit"
      class="shrink-0 w-14 h-14 flex items-center justify-center bg-accent text-white rounded-2xl hover:opacity-90 transition-opacity touch-manipulation"
      aria-label="Search"
    >
      <SearchIcon size={22} />
    </button>
  </form>

  <!-- Filters (different for each mode) -->
  {#if searchMode === 'library'}
    <!-- Library quick filters -->
    <div class="flex gap-1.5 sm:gap-2 mb-6 justify-center overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:overflow-visible scrollbar-none">
      {#each libraryFilters as filter}
        {@const active = isFilterActive(filter.query)}
        <button
          type="button"
          class="flex items-center gap-1 sm:gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm rounded-lg sm:rounded-xl transition-colors touch-manipulation whitespace-nowrap shrink-0 {active ? 'bg-accent text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-accent hover:text-white'}"
          onclick={() => applyQuickFilter(filter.query)}
          aria-pressed={active}
        >
          <filter.icon size={14} class="sm:w-4 sm:h-4" />
          <span>{filter.label}</span>
        </button>
      {/each}
    </div>
  {:else}
    <!-- Discover category filters -->
    <div class="flex gap-1.5 sm:gap-2 mb-6 justify-center overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:overflow-visible scrollbar-none">
      {#each discoverFilters as filter}
        {@const active = discoverCategory === filter.value}
        <button
          type="button"
          class="flex items-center gap-1 sm:gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm rounded-lg sm:rounded-xl transition-colors touch-manipulation whitespace-nowrap shrink-0 {active ? 'bg-accent text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-accent hover:text-white'}"
          onclick={() => { discoverCategory = filter.value; hapticLight() }}
          aria-pressed={active}
        >
          <filter.icon size={14} class="sm:w-4 sm:h-4" />
          <span>{filter.label}</span>
        </button>
      {/each}
    </div>
  {/if}

  <!-- Active filters (library mode only) -->
  {#if searchMode === 'library' && filterSummary.length > 0}
    <div class="flex flex-wrap gap-2 mb-4 justify-center">
      {#each filterSummary as filter}
        <span class="px-2.5 py-1 bg-accent/10 text-accent rounded-lg text-sm">{filter}</span>
      {/each}
    </div>
  {/if}

  <!-- Results based on mode -->
  {#if searchMode === 'discover'}
    <!-- Discover results -->
    {#if debouncedQuery.trim()}
      {#if isSearching}
        <div class="flex justify-center py-12">
          <Loader2 class="w-8 h-8 text-accent animate-spin" />
        </div>
      {:else if hasDiscoverResults}
        <p class="text-sm text-slate-500 dark:text-slate-400 mb-4">
          {combinedDiscoverResults.length} result{combinedDiscoverResults.length === 1 ? '' : 's'} from external sources
        </p>

        <div class="space-y-2">
          {#each combinedDiscoverResults as item (item.id)}
            {@const isAdding = addingItems.has(`${item.type}-${item.tmdbId || item.title}`)}
            <div class="flex items-center gap-4 p-4 card transition-colors">
              <div class="shrink-0 w-12 h-18 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden">
                {#if item.posterPath}
                  <img
                    src={item.type === 'game' ? item.posterPath : posterUrl(item.posterPath)}
                    alt=""
                    class="w-full h-full object-cover"
                    loading="lazy"
                  />
                {:else}
                  <div class="w-full h-full flex items-center justify-center text-slate-300">
                    {#if item.type === 'game'}
                      <Gamepad2 size={20} />
                    {:else if item.type === 'tv'}
                      <Tv size={20} />
                    {:else}
                      <Film size={20} />
                    {/if}
                  </div>
                {/if}
              </div>

              <div class="flex-1 min-w-0">
                <h3 class="font-medium truncate">{item.title}</h3>
                <div class="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                  <span class="uppercase">{item.type}</span>
                  {#if item.releaseDate}
                    <span>·</span>
                    <span>{item.releaseDate.split('-')[0]}</span>
                  {/if}
                </div>
                {#if item.overview}
                  <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{item.overview}</p>
                {/if}
              </div>

              {#if item.inLibrary}
                <span class="shrink-0 badge badge-completed flex items-center gap-1">
                  <Check size={12} />
                  In Library
                </span>
              {:else}
                <button
                  type="button"
                  class="shrink-0 w-10 h-10 flex items-center justify-center rounded-xl bg-accent text-white hover:opacity-90 transition-opacity touch-manipulation disabled:opacity-50"
                  onclick={() => addToLibrary(item.type, item.title, item.posterPath, item.releaseDate, item.overview, item.tmdbId)}
                  disabled={isAdding}
                  aria-label="Add to library"
                >
                  {#if isAdding}
                    <Loader2 size={18} class="animate-spin" />
                  {:else}
                    <Plus size={20} />
                  {/if}
                </button>
              {/if}
            </div>
          {/each}
        </div>
      {:else}
        <EmptyState
          icon={Compass}
          title="No results found"
          description="Try a different search term"
        />
      {/if}
    {:else}
      <!-- Discover empty state -->
      <div class="text-center py-12">
        <Compass size={48} class="mx-auto text-slate-300 dark:text-slate-600 mb-4" />
        <h3 class="text-lg font-medium mb-2">Discover new content</h3>
        <p class="text-slate-500 dark:text-slate-400 text-sm">
          Search for movies, TV shows, and games to add to your library
        </p>
      </div>
    {/if}
  {:else if hasQuery}
    {#if results.length > 0}
      <p class="text-sm text-slate-500 dark:text-slate-400 mb-4">
        {results.length}{results.length === 50 ? '+' : ''} result{results.length === 1 ? '' : 's'}
      </p>

      <div class="space-y-2">
        {#each results as { item, original } (item.id)}
          {#if item.type === 'movie' || item.type === 'tv' || item.type === 'game'}
            {@const m = original as Media}
            <button
              type="button"
              class="w-full flex items-center gap-4 p-4 card hover:border-accent transition-colors text-left touch-manipulation"
              onclick={() => openMediaDetail(m)}
            >
              <div class="shrink-0 w-12 h-18 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden">
                {#if m.posterPath}
                  <img src={posterUrl(m.posterPath)} alt="" class="w-full h-full object-cover" loading="lazy" />
                {:else}
                  <div class="w-full h-full flex items-center justify-center text-slate-300">
                    {#if item.type === 'game'}
                      <Gamepad2 size={20} />
                    {:else if item.type === 'tv'}
                      <Tv size={20} />
                    {:else}
                      <Film size={20} />
                    {/if}
                  </div>
                {/if}
              </div>

              <div class="flex-1 min-w-0">
                <h3 class="font-medium truncate">{m.title}</h3>
                <div class="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                  <span class="uppercase">{item.type}</span>
                  {#if m.releaseDate}
                    <span>·</span>
                    <span>{m.releaseDate.split('-')[0]}</span>
                  {/if}
                  {#if item.rating}
                    <span>·</span>
                    <span class="text-amber-500">{'★'.repeat(Math.round(item.rating))}</span>
                  {/if}
                </div>
              </div>

              <span class="shrink-0 badge badge-{m.status}">
                {m.status}
              </span>
            </button>
          {:else if item.type === 'note'}
            {@const n = original as Note}
            {@const isExpanded = expandedNoteId === n.id}
            {@const isUnread = !n.read && n.createdBy !== $activeUser}
            <div
              class="card transition-colors {isExpanded ? 'border-accent bg-accent/5' : 'hover:border-accent'} {isUnread && !isExpanded ? 'border-accent/50 bg-accent/5' : ''}"
            >
              <button
                type="button"
                class="w-full p-4 text-left touch-manipulation"
                onclick={() => toggleNoteExpand(n)}
              >
                <div class="flex items-start gap-3">
                  <div class="shrink-0 w-11 h-11 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                    <StickyNote size={20} />
                  </div>
                  <div class="flex-1 min-w-0">
                    <h3 class="font-medium {isExpanded ? '' : 'truncate'} {isUnread ? 'font-semibold' : ''}">{n.title || '(No subject)'}</h3>
                    <div class="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                      <span class="{n.createdBy === $activeUser ? '' : 'text-accent'}">
                        {n.createdBy === $activeUser ? 'You' : $displayNames[n.createdBy]}
                      </span>
                      <span>·</span>
                      <span>{getRelativeTime(n.createdAt)}</span>
                      {#if n.read && n.readAt && n.createdBy === $activeUser}
                        <span>·</span>
                        <span class="text-emerald-500 flex items-center gap-0.5"><Check size={12} /> Read</span>
                      {/if}
                      {#if isUnread}
                        <span>·</span>
                        <span class="text-accent font-medium">Unread</span>
                      {/if}
                    </div>
                    {#if n.content}
                      <p class="mt-2 text-sm text-slate-600 dark:text-slate-300 {isExpanded ? 'whitespace-pre-wrap' : 'line-clamp-2'}">
                        {n.content}
                      </p>
                    {/if}
                  </div>
                  <div class="shrink-0 text-slate-400 transition-transform {isExpanded ? 'rotate-90' : ''}">
                    <ChevronRight size={18} />
                  </div>
                </div>
              </button>

              {#if isExpanded}
                <div class="flex items-center gap-2 px-4 pb-4 pt-2 border-t border-slate-100 dark:border-slate-700/50 mt-2">
                  <button
                    type="button"
                    class="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors touch-manipulation"
                    onclick={() => toggleNoteArchive(n)}
                  >
                    {#if n.archived}
                      <ArchiveRestore size={16} />
                      <span>Unarchive</span>
                    {:else}
                      <Archive size={16} />
                      <span>Archive</span>
                    {/if}
                  </button>
                  <button
                    type="button"
                    class="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-slate-100 dark:bg-slate-700 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors touch-manipulation"
                    onclick={() => deleteNote(n)}
                  >
                    <Trash2 size={16} />
                    <span>Delete</span>
                  </button>
                </div>
              {/if}
            </div>
          {:else if item.type === 'place'}
            {@const p = original as Place}
            <button
              type="button"
              class="w-full flex items-center gap-4 p-4 card hover:border-accent transition-colors text-left touch-manipulation"
              onclick={() => openPlaceDetail(p)}
            >
              <div class="shrink-0 w-11 h-11 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                <MapPin size={20} />
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="font-medium truncate">{p.name}</h3>
                <p class="text-xs text-slate-400 truncate capitalize mt-0.5">{p.category}</p>
              </div>
              <span class="shrink-0 badge {p.visited ? 'badge-completed' : 'badge-queued'}">
                {p.visited ? 'Visited' : 'To visit'}
              </span>
            </button>
          {/if}
        {/each}
      </div>
    {:else}
      <EmptyState
        icon={SearchIcon}
        title="No results found"
        description="Try different keywords or filters"
      />
    {/if}
  {:else}
    <!-- Empty state -->
    <div class="space-y-6">
      <!-- Collection stats -->
      <div class="grid grid-cols-5 gap-2 text-center">
        <button
          type="button"
          class="p-3 min-h-[72px] bg-slate-50 dark:bg-slate-800/50 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors touch-manipulation"
          onclick={() => navigate('/library/movies')}
        >
          <Film size={20} class="mx-auto text-slate-400 mb-1" />
          <p class="text-lg font-bold">{stats.movies}</p>
          <p class="text-[10px] text-slate-400 uppercase">Movies</p>
        </button>
        <button
          type="button"
          class="p-3 min-h-[72px] bg-slate-50 dark:bg-slate-800/50 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors touch-manipulation"
          onclick={() => navigate('/library/tv')}
        >
          <Tv size={20} class="mx-auto text-slate-400 mb-1" />
          <p class="text-lg font-bold">{stats.tv}</p>
          <p class="text-[10px] text-slate-400 uppercase">TV</p>
        </button>
        <button
          type="button"
          class="p-3 min-h-[72px] bg-slate-50 dark:bg-slate-800/50 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors touch-manipulation"
          onclick={() => navigate('/library/games')}
        >
          <Gamepad2 size={20} class="mx-auto text-slate-400 mb-1" />
          <p class="text-lg font-bold">{stats.games}</p>
          <p class="text-[10px] text-slate-400 uppercase">Games</p>
        </button>
        <button
          type="button"
          class="p-3 min-h-[72px] bg-slate-50 dark:bg-slate-800/50 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors touch-manipulation"
          onclick={() => navigate('/notes')}
        >
          <StickyNote size={20} class="mx-auto text-slate-400 mb-1" />
          <p class="text-lg font-bold">{stats.notes}</p>
          <p class="text-[10px] text-slate-400 uppercase">Notes</p>
        </button>
        <button
          type="button"
          class="p-3 min-h-[72px] bg-slate-50 dark:bg-slate-800/50 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors touch-manipulation"
          onclick={() => navigate('/places')}
        >
          <MapPin size={20} class="mx-auto text-slate-400 mb-1" />
          <p class="text-lg font-bold">{stats.places}</p>
          <p class="text-[10px] text-slate-400 uppercase">Places</p>
        </button>
      </div>

      <!-- Collapsible tips -->
      <div class="bg-slate-50 dark:bg-slate-800/50 rounded-xl overflow-hidden">
        <button
          type="button"
          class="w-full flex items-center justify-between p-4 text-left touch-manipulation"
          onclick={toggleTips}
        >
          <div class="flex items-center gap-2">
            <HelpCircle size={18} class="text-slate-400" />
            <span class="font-medium text-slate-700 dark:text-slate-300">Search Tips</span>
          </div>
          {#if showTips}
            <ChevronUp size={18} class="text-slate-400" />
          {:else}
            <ChevronDown size={18} class="text-slate-400" />
          {/if}
        </button>

        {#if showTips}
          <div class="px-4 pb-4 space-y-3">
            <div class="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p class="font-medium text-slate-600 dark:text-slate-400 mb-1">Type filters</p>
                <p class="text-xs text-slate-400">@movie @tv @game @note @place</p>
              </div>
              <div>
                <p class="font-medium text-slate-600 dark:text-slate-400 mb-1">Exact match</p>
                <p class="text-xs text-slate-400">"star wars"</p>
              </div>
              <div>
                <p class="font-medium text-slate-600 dark:text-slate-400 mb-1">Operators</p>
                <p class="text-xs text-slate-400">OR -exclude NOT</p>
              </div>
              <div>
                <p class="font-medium text-slate-600 dark:text-slate-400 mb-1">Filters</p>
                <p class="text-xs text-slate-400">rating>4 year:2024 by:Z</p>
              </div>
            </div>

            <div>
              <p class="text-xs text-slate-500 dark:text-slate-400 mb-2">Try these examples:</p>
              <div class="flex flex-wrap gap-1.5">
                {#each exampleSearches as example}
                  <button
                    type="button"
                    class="px-3 py-2 text-xs bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-accent hover:text-white transition-colors touch-manipulation min-h-[44px]"
                    onclick={() => { searchQuery = example.query }}
                    title={example.desc}
                  >
                    {example.query}
                  </button>
                {/each}
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<!-- Media Detail Modal -->
<MediaDetailModal media={selectedMedia} onClose={closeMediaDetail} />

<!-- Place Detail Modal -->
<PlaceDetailModal place={selectedPlace} onClose={closePlaceDetail} />

<script lang="ts">
  import { subscribeToCollection } from '$lib/firebase'
  import { activeUser, displayNames, currentPreferences } from '$lib/stores/app'
  import type { Media, Note, Place } from '$lib/types'
  import { getDisplayRating } from '$lib/types'
  import { onMount } from 'svelte'
  import { parseQuery, matchesQuery, hasSearchCriteria, getFilterSummary, type SearchableItem } from '$lib/queryParser'
  import { tmdbConfig } from '$lib/config'
  import { Film, Tv, Gamepad2, StickyNote, MapPin, Search as SearchIcon, HelpCircle, ChevronDown, ChevronUp, X } from 'lucide-svelte'
  import MediaDetailModal from '$lib/components/MediaDetailModal.svelte'
  import EmptyState from '$lib/components/ui/EmptyState.svelte'

  interface Props {
    navigate: (path: string) => void
  }

  let { navigate }: Props = $props()

  // Data stores
  let media = $state<Media[]>([])
  let notes = $state<Note[]>([])
  let places = $state<Place[]>([])

  // Search state
  let searchQuery = $state('')
  let debouncedQuery = $state('') // Debounced query for expensive search operations
  let searchInput = $state<HTMLInputElement | null>(null)
  let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null
  const SEARCH_DEBOUNCE_MS = 150

  // Tips toggle (persisted)
  let showTips = $state(true)

  // Selected media for detail modal
  let selectedMedia = $state<Media | null>(null)

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
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
    searchDebounceTimer = setTimeout(() => {
      debouncedQuery = searchQuery
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
    }
  })

  // Parse query - use debounced query for expensive operations
  let parsedQuery = $derived(parseQuery(debouncedQuery))
  let hasQuery = $derived(hasSearchCriteria(parsedQuery))
  let filterSummary = $derived(getFilterSummary(parsedQuery))

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
    searchInput?.focus()
  }

  // Open media detail modal
  function openMediaDetail(item: Media) {
    selectedMedia = item
  }

  function closeMediaDetail() {
    selectedMedia = null
  }

  // Keep selected media in sync with real-time updates
  $effect(() => {
    if (selectedMedia) {
      const updated = media.find(m => m.id === selectedMedia!.id)
      if (updated) selectedMedia = updated
    }
  })

  // Quick filter buttons
  const quickFilters = [
    { label: 'Movies', query: '@movie', icon: Film },
    { label: 'TV', query: '@tv', icon: Tv },
    { label: 'Games', query: '@game', icon: Gamepad2 },
    { label: 'Notes', query: '@note', icon: StickyNote },
    { label: 'Places', query: '@place', icon: MapPin },
  ]

  function applyQuickFilter(query: string) {
    searchQuery = query + ' '
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

  <!-- Search input -->
  <div class="relative mb-4">
    <input
      type="text"
      bind:this={searchInput}
      bind:value={searchQuery}
      placeholder="Search everything..."
      class="w-full px-5 py-4 pl-12 bg-surface border border-slate-200 dark:border-slate-700 rounded-2xl text-slate-900 dark:text-slate-100 text-lg focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-all"
    />
    <SearchIcon class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
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

  <!-- Quick filters -->
  <div class="flex gap-1.5 sm:gap-2 mb-6 justify-center overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:overflow-visible scrollbar-none">
    {#each quickFilters as filter}
      <button
        type="button"
        class="flex items-center gap-1 sm:gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm rounded-lg sm:rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-accent hover:text-white transition-colors touch-manipulation whitespace-nowrap shrink-0"
        onclick={() => applyQuickFilter(filter.query)}
      >
        <filter.icon size={14} class="sm:w-4 sm:h-4" />
        <span>{filter.label}</span>
      </button>
    {/each}
  </div>

  <!-- Active filters -->
  {#if filterSummary.length > 0}
    <div class="flex flex-wrap gap-2 mb-4 justify-center">
      {#each filterSummary as filter}
        <span class="px-2.5 py-1 bg-accent/10 text-accent rounded-lg text-sm">{filter}</span>
      {/each}
    </div>
  {/if}

  <!-- Results or empty state -->
  {#if hasQuery}
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
            <button
              type="button"
              class="w-full flex items-center gap-4 p-4 card hover:border-accent transition-colors text-left touch-manipulation"
              onclick={() => navigate('/notes')}
            >
              <div class="shrink-0 w-11 h-11 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                <StickyNote size={20} />
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="font-medium truncate">{n.title || '(No subject)'}</h3>
                <p class="text-xs text-slate-400 truncate mt-0.5">
                  From {$displayNames[n.createdBy]}
                  {#if !n.read && n.createdBy !== $activeUser}
                    · <span class="text-accent font-medium">Unread</span>
                  {/if}
                </p>
              </div>
            </button>
          {:else if item.type === 'place'}
            {@const p = original as Place}
            <button
              type="button"
              class="w-full flex items-center gap-4 p-4 card hover:border-accent transition-colors text-left touch-manipulation"
              onclick={() => navigate('/places')}
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

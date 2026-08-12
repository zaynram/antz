<script lang="ts">
  import { tmdbConfig } from '$lib/config'
  import { addDocument, deleteDocument, subscribeToCollection, updateDocument } from '$lib/firebase'
  import { activeUser, displayNames, displayAbbreviations, userPreferences, mediaGridSize, type GridSize } from '$lib/stores/app'
  import type { Media, MediaStatus, MediaType, TMDBSearchResult, UserId, ProductionCompany, MediaCollection, TogethernessState } from '$lib/types'
  import { toast } from 'svelte-sonner'
  import { getDisplayRating, hasWatched, watchTogetherness, toggleWatched } from '$lib/types'
  import { DEFAULT_ACCENT } from '$lib/accents'
  import { enrichMediaData } from '$lib/tmdb'
  import { searchGames, type WikiGameResult } from '$lib/wikipedia'
  import {
    applyFilters,
    applySort,
    extractGenres,
    countActiveFilters,
    DEFAULT_FILTERS,
    DEFAULT_SORT,
    type MediaFilters,
    type SortConfig,
    type SortField,
  } from '$lib/filters'
  import { onMount } from 'svelte'
  import { consumeQueryParam } from '$lib/stores/nav'
  import MediaDetailModal from '$lib/components/MediaDetailModal.svelte'
  import IconButton from '$lib/components/ui/IconButton.svelte'
  import EmptyState from '$lib/components/ui/EmptyState.svelte'
  import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte'
    import { Film, Tv, Gamepad2, Filter, Plus, Search, X, Check } from 'lucide-svelte'
  import { hapticSuccess } from '$lib/haptics'
  import { forceRepaint } from '$lib/pwa-utils'
  import { cycleRating, getStarFill } from '$lib/utils'

  interface Props {
    type: MediaType
    navigate: (path: string) => void
  }

  let { type, navigate }: Props = $props()

  // Core state
  let media = $state<Media[]>([])
  let unsubscribe: (() => void) | undefined
  let selectedMedia = $state<Media | null>(null)

  // Local search over the existing library (distinct from the discovery search)
  let librarySearch = $state('')

  // "Between Us" couple lens — filter by who of the pair has watched, from the
  // active user's perspective.
  let betweenUs = $state<TogethernessState | 'all'>('all')
  let partner = $derived<UserId>($activeUser === 'Z' ? 'T' : 'Z')

  // Search state (for adding new items)
  let searchQuery = $state('')
  let discoverResults = $state<TMDBSearchResult[]>([])
  let gameResults = $state<WikiGameResult[]>([])
  let searching = $state(false)
  let adding = $state<string | null>(null)
  let showAddPanel = $state(false)

  // Filter & Sort state
  let showFilters = $state(false)
  // svelte-ignore state_referenced_locally
  // Type prop is intentionally captured at init - component is recreated for different types
  let filters = $state<MediaFilters>({ ...DEFAULT_FILTERS, type })
  let sort = $state<SortConfig>({ ...DEFAULT_SORT })

  // Debounce and request cancellation
  let searchTimer: ReturnType<typeof setTimeout> | null = null
  let searchAbortController: AbortController | null = null
  const DEBOUNCE_MS = 300

  // Type info
  const typeInfo: Record<MediaType, { label: string; plural: string; icon: typeof Film }> = {
    movie: { label: 'Movie', plural: 'Movies', icon: Film },
    tv: { label: 'TV Show', plural: 'TV Shows', icon: Tv },
    game: { label: 'Game', plural: 'Games', icon: Gamepad2 },
  }

  const statusOptions: Array<{ key: MediaStatus | 'all'; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'queued', label: 'Queued' },
    { key: 'watching', label: 'In Progress' },
    { key: 'completed', label: 'Completed' },
    { key: 'dropped', label: 'Dropped' },
  ]

  const sortOptions: Array<{ field: SortField; label: string; defaultDir: 'asc' | 'desc' }> = [
    { field: 'dateAdded', label: 'Added', defaultDir: 'desc' },
    { field: 'title', label: 'Title', defaultDir: 'asc' },
    { field: 'rating', label: 'Rating', defaultDir: 'desc' },
    { field: 'releaseDate', label: 'Released', defaultDir: 'desc' },
  ]

  // Quick navigation between library types
  const libraryTypes: MediaType[] = ['movie', 'tv', 'game']
  const coupleUsers: UserId[] = ['Z', 'T']

  onMount(() => {
    // Open the add/discover panel directly when arriving via a quick-add link.
    if (consumeQueryParam('add') !== null) showAddPanel = true

    unsubscribe = subscribeToCollection<Media>('media', (items) => {
      media = items
      if (selectedMedia) {
        const updated = items.find(m => m.id === selectedMedia!.id)
        if (updated) selectedMedia = updated
      }
    })
    return () => {
      unsubscribe?.()
      if (searchTimer) clearTimeout(searchTimer)
      if (searchAbortController) searchAbortController.abort()
    }
  })

  // Reset filters when type changes
  $effect(() => {
    filters = { ...DEFAULT_FILTERS, type }
    showAddPanel = false
    searchQuery = ''
    librarySearch = ''
    discoverResults = []
    gameResults = []
  })

  function toggleFilters() {
    showFilters = !showFilters
    forceRepaint()
  }

  function toggleAddPanel() {
    showAddPanel = !showAddPanel
    if (!showAddPanel) {
      searchQuery = ''
      discoverResults = []
      gameResults = []
    }
    forceRepaint()
  }

  // Live search effect with proper abort handling
  let searchRequestId = 0 // Track request sequence to prevent stale updates
  $effect(() => {
    const query = searchQuery.trim()
    const currentRequestId = ++searchRequestId

    if (searchTimer) clearTimeout(searchTimer)
    if (searchAbortController) {
      searchAbortController.abort()
      searchAbortController = null
    }

    if (!query || !showAddPanel) {
      discoverResults = []
      gameResults = []
      return
    }

    // Create AbortController before timeout to ensure proper cleanup
    const controller = new AbortController()
    searchAbortController = controller

    searchTimer = setTimeout(async () => {
      // Verify this is still the current request before proceeding
      if (currentRequestId !== searchRequestId) return

      if (type === 'game') {
        await searchWikipedia(query, controller.signal)
      } else {
        await searchTMDB(query, controller.signal)
      }
    }, DEBOUNCE_MS)
  })

  async function searchTMDB(query: string, signal?: AbortSignal): Promise<void> {
    searching = true
    try {
      const endpoint = type === 'movie' ? 'movie' : 'tv'
      const res = await fetch(
        `${tmdbConfig.baseUrl}/search/${endpoint}?api_key=${tmdbConfig.apiKey}&query=${encodeURIComponent(query)}`,
        { signal }
      )
      const data = await res.json()
      let results = data.results as TMDBSearchResult[]
      results = results.map(r => ({ ...r, media_type: endpoint as 'movie' | 'tv' }))
      discoverResults = results.slice(0, 8)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      console.error('TMDB search failed:', e)
      discoverResults = []
    } finally {
      searching = false
    }
  }

  async function searchWikipedia(query: string, _signal?: AbortSignal): Promise<void> {
    searching = true
    try {
      gameResults = await searchGames(query)
      gameResults = gameResults.slice(0, 8)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      console.error('Wikipedia search failed:', e)
      gameResults = []
    } finally {
      searching = false
    }
  }

  async function addFromTMDB(item: TMDBSearchResult): Promise<void> {
    const key = `tmdb-${item.id}`
    if (adding) return
    adding = key

    try {
      const isTV = item.media_type === 'tv'
      const mediaType: 'movie' | 'tv' = isTV ? 'tv' : 'movie'

      let genres: string[] = []
      let collection: MediaCollection | null = null
      let productionCompanies: ProductionCompany[] = []

      try {
        const enriched = await enrichMediaData(item.id, mediaType)
        genres = enriched.genres
        collection = enriched.collection
        productionCompanies = enriched.productionCompanies
      } catch (e) {
        console.warn('Enrichment failed:', e)
      }

      await addDocument<Media>('media', {
        type: mediaType,
        tmdbId: item.id,
        title: item.title || item.name || '',
        posterPath: item.poster_path,
        releaseDate: item.release_date || item.first_air_date,
        overview: item.overview,
        status: 'queued',
        rating: null,
        notes: '',
        genres,
        collection,
        productionCompanies,
        ...(isTV && { progress: { season: 1, episode: 1 } }),
      }, $activeUser)

      discoverResults = discoverResults.filter(r => r.id !== item.id)
      hapticSuccess()
      toast.success(`Added "${item.title || item.name}"`)
    } catch (e) {
      console.error('Failed to add:', e)
      toast.error('Failed to add item')
    } finally {
      adding = null
    }
  }

  async function addFromWikipedia(game: WikiGameResult): Promise<void> {
    const key = `wiki-${game.pageid}`
    if (adding) return
    adding = key

    try {
      await addDocument<Media>('media', {
        type: 'game',
        title: game.title,
        posterPath: game.thumbnail,
        overview: game.description,
        status: 'queued',
        rating: null,
        notes: '',
      }, $activeUser)

      gameResults = gameResults.filter(g => g.pageid !== game.pageid)
      hapticSuccess()
      toast.success(`Added "${game.title}"`)
    } catch (e) {
      console.error('Failed to add game:', e)
      toast.error('Failed to add game')
    } finally {
      adding = null
    }
  }

  async function quickStatusChange(item: Media, status: MediaStatus): Promise<void> {
    if (!item.id) return
    await updateDocument<Media>('media', item.id, { status }, $activeUser)
  }

  async function quickRate(item: Media, starIndex: number): Promise<void> {
    if (!item.id) return
    const currentRatings = item.ratings || { Z: null, T: null }
    const userRating = currentRatings[$activeUser as UserId]
    const newRating = cycleRating(userRating, starIndex)
    await updateDocument<Media>('media', item.id, {
      ratings: { ...currentRatings, [$activeUser]: newRating }
    }, $activeUser)
  }

  // Confirm dialog state
  let pendingConfirm = $state<{ message: string; onConfirm: () => void } | null>(null)

  async function removeItem(id: string): Promise<void> {
    pendingConfirm = {
      message: 'Remove this item?',
      onConfirm: async () => {
        pendingConfirm = null
        try {
          await deleteDocument('media', id)
          toast.success('Removed from library')
        } catch (e) {
          console.error('Failed to remove:', e)
          toast.error('Failed to remove item')
        }
      }
    }
  }

  function clearFilters(): void {
    filters = { ...DEFAULT_FILTERS, type }
    sort = { ...DEFAULT_SORT }
  }

  function toggleGenre(genre: string): void {
    const current = filters.genres
    if (current.includes(genre)) {
      filters = { ...filters, genres: current.filter(g => g !== genre) }
    } else {
      filters = { ...filters, genres: [...current, genre] }
    }
  }

  function toggleSort(field: SortField): void {
    if (sort.field === field) {
      sort = { ...sort, direction: sort.direction === 'asc' ? 'desc' : 'asc' }
    } else {
      const option = sortOptions.find(o => o.field === field)
      sort = { field, direction: option?.defaultDir ?? 'desc' }
    }
  }

  // Filtered media for this type only
  let typeMedia = $derived(media.filter(m => m.type === type))
  let availableGenres = $derived(extractGenres(typeMedia))
  let activeFilterCount = $derived(countActiveFilters({ ...filters, type: 'all' }))

  let filteredMedia = $derived.by(() => {
    let result = applyFilters(typeMedia, { ...filters, type: 'all' }) // Type already filtered
    const q = librarySearch.trim().toLowerCase()
    if (q) {
      result = result.filter(m =>
        m.title.toLowerCase().includes(q) ||
        (m.overview?.toLowerCase().includes(q) ?? false) ||
        (m.genres?.some(g => g.toLowerCase().includes(q)) ?? false)
      )
    }
    if (betweenUs !== 'all') {
      result = result.filter(m => watchTogetherness(m, $activeUser, partner) === betweenUs)
    }
    result = applySort(result, sort)
    return result
  })

  // Counts per couple-state (over this type), for the lens chips.
  let betweenUsCounts = $derived.by(() => {
    const counts: Record<TogethernessState, number> = { both: 0, mine: 0, theirs: 0, none: 0 }
    for (const m of typeMedia) counts[watchTogetherness(m, $activeUser, partner)]++
    return counts
  })

  // The lens options, labelled from the viewer's POV.
  let lensOptions = $derived<Array<{ key: TogethernessState | 'all'; label: string; count?: number }>>([
    { key: 'all', label: 'All' },
    { key: 'none', label: 'New to us', count: betweenUsCounts.none },
    { key: 'theirs', label: 'Waiting on you', count: betweenUsCounts.theirs },
    { key: 'mine', label: `Waiting on ${$displayNames[partner]}`, count: betweenUsCounts.mine },
    { key: 'both', label: 'Seen together', count: betweenUsCounts.both },
  ])

  async function toggleSeen(item: Media, user: UserId): Promise<void> {
    if (!item.id) return
    hapticSuccess()
    await updateDocument<Media>('media', item.id, toggleWatched(item, user), $activeUser)
  }

  function posterUrl(path: string | null | undefined, size: 'sm' | 'md' = 'sm'): string | null {
    if (!path) return null
    if (path.startsWith('http')) return path
    const w = size === 'sm' ? 'w185' : 'w342'
    return `${tmdbConfig.imageBaseUrl}/${w}${path}`
  }

  const STATUS_COLORS: Record<MediaStatus, string> = {
    queued: 'bg-slate-500',
    watching: 'bg-amber-500',
    completed: 'bg-emerald-500',
    dropped: 'bg-red-500',
  }

  // Grid sizing
  let gridContainer = $state<HTMLElement | null>(null)
  let containerWidth = $state(0)

  const gridConfigs: Record<GridSize, [number, number, number, number]> = {
    small: [3, 4, 5, 6],
    medium: [2, 3, 4, 5],
    large: [1, 2, 3, 4],
  }

  let columns = $derived.by(() => {
    const config = gridConfigs[$mediaGridSize]
    if (containerWidth >= 1024) return config[3]
    if (containerWidth >= 768) return config[2]
    if (containerWidth >= 640) return config[1]
    return config[0]
  })

  function cycleGridSize() {
    const sizes: GridSize[] = ['small', 'medium', 'large']
    const currentIndex = sizes.indexOf($mediaGridSize)
    const nextIndex = (currentIndex + 1) % sizes.length
    $mediaGridSize = sizes[nextIndex]
  }

  const gridSizeIcons: Record<GridSize, string> = {
    small: '▪▪▪',
    medium: '◼◼',
    large: '⬛',
  }

  // Debounced ResizeObserver to prevent excessive recalculations
  let resizeTimer: ReturnType<typeof setTimeout> | null = null
  $effect(() => {
    if (!gridContainer) return
    const resizeObserver = new ResizeObserver((entries) => {
      // Debounce resize updates to prevent continuous recalculations
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        for (const entry of entries) {
          containerWidth = entry.contentRect.width
        }
      }, 100) // 100ms debounce
    })
    resizeObserver.observe(gridContainer)
    containerWidth = gridContainer.clientWidth
    return () => {
      resizeObserver.disconnect()
      if (resizeTimer) clearTimeout(resizeTimer)
    }
  })

  // Keyboard navigation for media grid
  function handleGridKeydown(e: KeyboardEvent, index: number): void {
    const total = filteredMedia.length
    if (total === 0) return

    let newIndex = index

    switch (e.key) {
      case 'ArrowRight':
        newIndex = (index + 1) % total
        e.preventDefault()
        break
      case 'ArrowLeft':
        newIndex = (index - 1 + total) % total
        e.preventDefault()
        break
      case 'ArrowDown':
        newIndex = Math.min(index + columns, total - 1)
        e.preventDefault()
        break
      case 'ArrowUp':
        newIndex = Math.max(index - columns, 0)
        e.preventDefault()
        break
      case 'Enter':
      case ' ':
        selectedMedia = filteredMedia[index]
        e.preventDefault()
        return
      default:
        return
    }

    // Focus the new item
    const gridItems = gridContainer?.querySelectorAll('[data-grid-item]')
    if (gridItems && gridItems[newIndex]) {
      (gridItems[newIndex] as HTMLElement).focus()
    }
  }

</script>

<MediaDetailModal media={selectedMedia} onClose={() => selectedMedia = null} />

<ConfirmModal
  open={pendingConfirm !== null}
  message={pendingConfirm?.message ?? ''}
  danger={true}
  onConfirm={() => pendingConfirm?.onConfirm()}
  onCancel={() => pendingConfirm = null}
/>

<div class="max-w-6xl mx-auto">
  <!-- Marquee header with type navigation -->
  <div class="marquee mb-5">
    <div class="marquee-lights" aria-hidden="true"></div>
    <div class="marquee-inner">
      <div class="flex items-end justify-between gap-3 flex-wrap">
        <div class="min-w-0">
          <p class="marquee-eyebrow">Now showing</p>
          <h1 class="marquee-title">{typeInfo[type].plural}</h1>
        </div>
        <span class="marquee-count">{typeMedia.length} item{typeMedia.length === 1 ? '' : 's'}</span>
      </div>

      <!-- Type tickets -->
      <div class="flex gap-2 overflow-x-auto scrollbar-none mt-3">
        {#each libraryTypes as t (t)}
          <button
            type="button"
            class="ticket {t === type ? 'is-on' : ''}"
            onclick={() => navigate(`/library/${t === 'tv' ? 'tv' : t + 's'}`)}
          >
            {typeInfo[t].plural}
          </button>
        {/each}
      </div>
    </div>
  </div>

  <!-- Action bar -->
  <div class="flex items-center justify-between gap-2 mb-4">
    <button
      type="button"
      class="btn-primary"
      onclick={toggleAddPanel}
    >
      {#if showAddPanel}
        <X size={18} />
        <span>Cancel</span>
      {:else}
        <Plus size={18} />
        <span>Add {typeInfo[type].label}</span>
      {/if}
    </button>

    <div class="flex items-center gap-1">
      <IconButton label="Change grid size" onclick={cycleGridSize}>
        {#snippet children()}
          <span class="text-xs font-mono">{gridSizeIcons[$mediaGridSize]}</span>
        {/snippet}
      </IconButton>

      <IconButton
        icon={Filter}
        label="Filters"
        active={showFilters}
        badge={activeFilterCount > 0 ? activeFilterCount : undefined}
        onclick={toggleFilters}
      />
    </div>
  </div>

  <!-- Search within the current library -->
  <div class="relative mb-4">
    <Search size={18} class="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
    <input
      type="search"
      placeholder="Search your {typeInfo[type].plural.toLowerCase()}…"
      class="input pl-11"
      bind:value={librarySearch}
    />
    {#if librarySearch}
      <button
        type="button"
        class="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-600 touch-manipulation"
        onclick={() => librarySearch = ''}
        aria-label="Clear search"
      >
        <X size={16} />
      </button>
    {/if}
  </div>

  <!-- "Between Us" couple lens -->
  <div class="flex items-center gap-1.5 overflow-x-auto scrollbar-none mb-4 -mx-1 px-1">
    {#each lensOptions as opt (opt.key)}
      <button
        type="button"
        class="lens-chip {betweenUs === opt.key ? 'is-on' : ''}"
        onclick={() => { betweenUs = betweenUs === opt.key ? 'all' : opt.key }}
      >
        <span>{opt.label}</span>
        {#if opt.count !== undefined && opt.count > 0}<span class="lens-count">{opt.count}</span>{/if}
      </button>
    {/each}
  </div>

  <!-- Add panel -->
  {#if showAddPanel}
    <div class="card p-4 mb-6" style="transform: translateZ(0);">
      <div class="relative mb-4">
        <input
          type="text"
          placeholder="Search for {typeInfo[type].plural.toLowerCase()} to add..."
          class="input pl-11"
          bind:value={searchQuery}
        />
        <Search size={18} class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        {#if searching}
          <div class="absolute right-4 top-1/2 -translate-y-1/2">
            <div class="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
          </div>
        {/if}
      </div>

      {#if type === 'game' ? gameResults.length > 0 : discoverResults.length > 0}
        <div class="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
          {#if type === 'game'}
            {#each gameResults as game (game.pageid)}
              {@const isAdding = adding === `wiki-${game.pageid}`}
              <button
                type="button"
                class="group relative bg-slate-50 dark:bg-slate-800 rounded-lg overflow-hidden hover:ring-2 hover:ring-accent transition-all disabled:opacity-50 touch-manipulation"
                onclick={() => addFromWikipedia(game)}
                disabled={!!adding}
              >
                <div class="aspect-[2/3] bg-slate-100 dark:bg-slate-700">
                  {#if game.thumbnail}
                    <img src={game.thumbnail} alt={game.title} loading="lazy" class="w-full h-full object-cover" />
                  {:else}
                    <div class="w-full h-full flex items-center justify-center text-slate-300">
                      <Gamepad2 size={24} />
                    </div>
                  {/if}
                </div>
                <p class="text-[10px] p-1 truncate">{game.title}</p>
                <div class="absolute inset-0 bg-accent/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  {#if isAdding}
                    <div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  {:else}
                    <Plus size={24} class="text-white" />
                  {/if}
                </div>
              </button>
            {/each}
          {:else}
            {#each discoverResults as result (result.id)}
              {@const isAdding = adding === `tmdb-${result.id}`}
              <button
                type="button"
                class="group relative bg-slate-50 dark:bg-slate-800 rounded-lg overflow-hidden hover:ring-2 hover:ring-accent transition-all disabled:opacity-50 touch-manipulation"
                onclick={() => addFromTMDB(result)}
                disabled={!!adding}
              >
                <div class="aspect-[2/3] bg-slate-100 dark:bg-slate-700">
                  {#if result.poster_path}
                    <img src={posterUrl(result.poster_path)} alt={result.title || result.name} loading="lazy" class="w-full h-full object-cover" />
                  {:else}
                    {@const TypeIcon = typeInfo[type].icon}
                    <div class="w-full h-full flex items-center justify-center text-slate-300">
                      <TypeIcon size={24} />
                    </div>
                  {/if}
                </div>
                <p class="text-[10px] p-1 truncate">{result.title || result.name}</p>
                <div class="absolute inset-0 bg-accent/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  {#if isAdding}
                    <div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  {:else}
                    <Plus size={24} class="text-white" />
                  {/if}
                </div>
              </button>
            {/each}
          {/if}
        </div>
      {:else if searchQuery.trim()}
        <p class="text-center text-slate-400 py-4">No results found</p>
      {:else}
        <p class="text-center text-slate-400 py-4">Type to search for {typeInfo[type].plural.toLowerCase()}</p>
      {/if}
    </div>
  {/if}

  <!-- Filters panel -->
  {#if showFilters}
    <div class="card p-4 mb-4 space-y-4" style="transform: translateZ(0);">
      <div class="flex flex-wrap gap-4">
        <div class="flex-1 min-w-[120px]">
          <label for="library-filter-status" class="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">Status</label>
          <select
            id="library-filter-status"
            bind:value={filters.status}
            class="input-sm"
          >
            {#each statusOptions as opt}
              <option value={opt.key}>{opt.label}</option>
            {/each}
          </select>
        </div>

        <div class="flex-1 min-w-[120px]">
          <label for="library-filter-added-by" class="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">Added By</label>
          <select
            id="library-filter-added-by"
            bind:value={filters.addedBy}
            class="input-sm"
          >
            <option value="all">Anyone</option>
            <option value="Z">{$displayNames.Z}</option>
            <option value="T">{$displayNames.T}</option>
          </select>
        </div>

        <div class="flex-1 min-w-[140px]">
          <span class="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">Sort</span>
          <div class="flex gap-1 flex-wrap">
            {#each sortOptions as opt}
              <button
                type="button"
                class="px-3 py-2 text-xs rounded-lg transition-colors touch-manipulation min-h-[44px] {sort.field === opt.field
                  ? 'bg-accent text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}"
                onclick={() => toggleSort(opt.field)}
              >
                {opt.label}
                {#if sort.field === opt.field}
                  <span class="ml-0.5">{sort.direction === 'asc' ? '↑' : '↓'}</span>
                {/if}
              </button>
            {/each}
          </div>
        </div>
      </div>

      {#if availableGenres.length > 0}
        <div>
          <span class="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">Genres</span>
          <div class="flex flex-wrap gap-2">
            {#each availableGenres as genre}
              <button
                type="button"
                class="px-3 py-2 text-xs rounded-full transition-colors touch-manipulation min-h-[44px] {filters.genres.includes(genre)
                  ? 'bg-accent text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}"
                onclick={() => toggleGenre(genre)}
              >
                {genre}
              </button>
            {/each}
          </div>
        </div>
      {/if}

      {#if activeFilterCount > 0}
        <button
          type="button"
          class="text-sm text-red-500 hover:underline"
          onclick={clearFilters}
        >
          Clear {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'}
        </button>
      {/if}
    </div>
  {/if}

  <!-- Grid -->
  <div bind:this={gridContainer}>
    {#if filteredMedia.length === 0}
      {@const isFiltered = activeFilterCount > 0 || !!librarySearch.trim() || betweenUs !== 'all'}
      <EmptyState
        icon={typeInfo[type].icon}
        title={isFiltered ? `No ${typeInfo[type].plural.toLowerCase()} match` : `No ${typeInfo[type].plural.toLowerCase()} in your library`}
        description={isFiltered ? 'Try adjusting your search or filters' : `Add your first ${typeInfo[type].label.toLowerCase()}`}
        actionLabel={isFiltered ? undefined : `Add ${typeInfo[type].label}`}
        onAction={isFiltered ? undefined : toggleAddPanel}
      />
    {:else}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex a11y_no_noninteractive_element_interactions -->
      <div class="grid gap-4" style="grid-template-columns: repeat({columns}, minmax(0, 1fr));" role="grid">
        {#each filteredMedia as item, index (item.id)}
          <div
            class="group relative bg-surface border border-[var(--color-border)] rounded-xl overflow-hidden hover:shadow-lg focus:ring-2 focus:ring-accent focus:outline-none transition-all"
            tabindex="0"
            role="gridcell"
            data-grid-item
            onkeydown={(e) => handleGridKeydown(e, index)}
          >
            <!-- Delete button -->
            <button
              type="button"
              class="absolute top-1 right-1 z-20 w-11 h-11 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-red-500 transition-all touch-manipulation"
              onclick={(e) => { e.stopPropagation(); item.id && removeItem(item.id); }}
            >
              <X size={18} />
            </button>

            <!-- Status indicator -->
            <div class="absolute top-2 left-2 z-10">
              <div class="w-2.5 h-2.5 rounded-full {STATUS_COLORS[item.status]} ring-2 ring-white dark:ring-slate-900"></div>
            </div>

            <!-- Poster -->
            <button
              type="button"
              class="w-full text-left touch-manipulation"
              onclick={() => selectedMedia = item}
            >
              <div class="aspect-[2/3] bg-slate-100 dark:bg-slate-800 relative">
                {#if item.imageOverride || item.posterPath}
                  <img
                    src={item.imageOverride || posterUrl(item.posterPath, 'md')}
                    alt={item.title}
                    loading="lazy"
                    class="w-full h-full object-cover"
                    class:opacity-40={item.status === 'completed'}
                  />
                {:else}
                  {@const TypeIcon = typeInfo[type].icon}
                  <div class="w-full h-full flex items-center justify-center text-slate-300">
                    <TypeIcon size={48} />
                  </div>
                {/if}
                {#if item.status === 'completed'}
                  <div class="absolute inset-0 flex items-center justify-center">
                    <div class="w-12 h-12 rounded-full bg-emerald-500/90 flex items-center justify-center">
                      <svg class="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  </div>
                {/if}
              </div>
            </button>

            <!-- Info -->
            <div class="p-3">
              <h3 class="font-medium text-sm truncate mb-1" class:line-through={item.status === 'dropped'} class:text-slate-400={item.status === 'dropped'}>
                {item.title}
              </h3>

              {#if item.releaseDate}
                <p class="text-xs text-slate-400 mb-1">{item.releaseDate.split('-')[0]}</p>
              {/if}

              <div class="flex items-center">
                {#each [1, 2, 3, 4, 5] as star}
                  {@const displayRating = getDisplayRating(item)}
                  {@const fill = getStarFill(displayRating, star)}
                  <button
                    type="button"
                    class="w-7 h-7 text-lg flex items-center justify-center transition-colors touch-manipulation relative"
                    onclick={() => quickRate(item, star)}
                  >
                    <span class="text-slate-200 dark:text-slate-700">★</span>
                    {#if fill === 'full'}
                      <span class="absolute inset-0 flex items-center justify-center text-amber-400">★</span>
                    {:else if fill === 'half'}
                      <span class="absolute inset-0 flex items-center justify-center text-amber-400 overflow-hidden" style="clip-path: inset(0 50% 0 0)">★</span>
                    {/if}
                  </button>
                {/each}
              </div>

              <!-- Seen-by (couple watch-state): tap a face to toggle who's watched -->
              <div class="flex items-center gap-1 mt-1.5">
                {#each coupleUsers as u}
                  {@const seen = hasWatched(item, u)}
                  <button
                    type="button"
                    class="seen-dot {seen ? 'is-seen' : ''}"
                    style={seen ? `background-color:${$userPreferences[u]?.accentColor ?? DEFAULT_ACCENT}` : ''}
                    onclick={(e) => { e.stopPropagation(); toggleSeen(item, u) }}
                    aria-pressed={seen}
                    title="{$displayNames[u]} {seen ? 'has watched — tap to unmark' : 'hasn’t watched — tap to mark'}"
                  >
                    <span>{$displayAbbreviations[u]}</span>
                    {#if seen}<span class="seen-check"><Check size={9} strokeWidth={3.5} /></span>{/if}
                  </button>
                {/each}
              </div>

              <div class="flex gap-1.5 mt-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                {#if item.status !== 'watching'}
                  <button
                    type="button"
                    class="flex-1 py-2.5 text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-lg touch-manipulation"
                    onclick={() => quickStatusChange(item, 'watching')}
                  >
                    Start
                  </button>
                {/if}
                {#if item.status !== 'completed'}
                  <button
                    type="button"
                    class="flex-1 py-2.5 text-xs font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-lg touch-manipulation"
                    onclick={() => quickStatusChange(item, 'completed')}
                  >
                    Done
                  </button>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  @media (hover: none) {
    .group:active .group-hover\:opacity-100,
    .group:focus-within .group-hover\:opacity-100 {
      opacity: 1;
    }
  }

  /* ===== "Between Us" couple lens ===== */
  .lens-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    flex: 0 0 auto;
    padding: 0.4rem 0.8rem;
    border-radius: 999px;
    font-size: 0.8rem;
    font-weight: 600;
    white-space: nowrap;
    color: var(--color-text-muted, #57534e);
    background: var(--color-surface-2);
    border: 1px solid transparent;
    transition: background 120ms, color 120ms, border-color 120ms;
  }
  .lens-chip.is-on {
    background: var(--color-accent);
    color: #fff;
  }
  .lens-count {
    font-size: 0.68rem;
    font-weight: 800;
    padding: 0.02rem 0.35rem;
    border-radius: 999px;
    background: rgba(0,0,0,0.12);
  }
  .lens-chip.is-on .lens-count { background: rgba(255,255,255,0.25); }

  /* ===== Per-card seen-by faces ===== */
  .seen-dot {
    position: relative;
    width: 1.4rem;
    height: 1.4rem;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.6rem;
    font-weight: 800;
    color: var(--color-text-hint, #78716c);
    background: transparent;
    border: 1.5px dashed var(--color-border);
    transition: transform 100ms;
  }
  .seen-dot.is-seen {
    color: #fff;
    border-style: solid;
    border-color: transparent;
  }
  .seen-dot:active { transform: scale(0.9); }
  .seen-check {
    position: absolute;
    right: -3px;
    bottom: -3px;
    width: 0.72rem;
    height: 0.72rem;
    border-radius: 50%;
    background: #10b981;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 0 1.5px var(--color-surface);
  }

  /* ===== Cinema marquee header ===== */
  .marquee {
    position: relative;
    border-radius: 1.1rem;
    padding-top: 0.5rem;
    background:
      radial-gradient(120% 140% at 50% -20%, color-mix(in srgb, var(--color-accent) 55%, #1a1420) 0%, #1a1420 60%, #120e16 100%);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 10px 26px rgba(0,0,0,0.28);
    overflow: hidden;
  }
  .marquee-lights {
    height: 0.5rem;
    background-image: radial-gradient(circle, #ffe9a8 0 40%, transparent 45%);
    background-size: 1.05rem 0.5rem;
    background-position: center;
    background-repeat: repeat-x;
    filter: drop-shadow(0 0 3px rgba(255,214,120,0.8));
    opacity: 0.9;
  }
  .marquee-inner { padding: 0.9rem 1.1rem 1rem; }
  .marquee-eyebrow {
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #ffcf6a;
    text-shadow: 0 0 8px rgba(255,180,80,0.5);
    margin-bottom: 0.1rem;
  }
  .marquee-title {
    font-size: 1.7rem;
    font-weight: 800;
    line-height: 1.05;
    letter-spacing: -0.01em;
    color: #fdf6e9;
  }
  .marquee-count {
    font-size: 0.75rem;
    font-weight: 700;
    color: rgba(253,246,233,0.7);
    padding-bottom: 0.2rem;
  }

  /* Ticket-stub type tabs */
  .ticket {
    position: relative;
    height: 2.25rem;
    padding: 0 0.95rem;
    border-radius: 0.5rem;
    font-size: 0.82rem;
    font-weight: 700;
    white-space: nowrap;
    color: #efe6d6;
    background: rgba(255,255,255,0.08);
    -webkit-mask:
      radial-gradient(circle 5px at 0 50%, transparent 98%, #000) left,
      radial-gradient(circle 5px at 100% 50%, transparent 98%, #000) right;
    -webkit-mask-size: 51% 100%;
    -webkit-mask-repeat: no-repeat;
    mask:
      radial-gradient(circle 5px at 0 50%, transparent 98%, #000) left,
      radial-gradient(circle 5px at 100% 50%, transparent 98%, #000) right;
    mask-size: 51% 100%;
    mask-repeat: no-repeat;
    transition: background 120ms, color 120ms;
  }
  .ticket.is-on { background: #ffcf6a; color: #2a1e10; }
</style>

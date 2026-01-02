<script lang="ts">
  import { tmdbConfig } from '$lib/config'
  import { addDocument, deleteDocument, subscribeToCollection, updateDocument } from '$lib/firebase'
  import { activeUser, displayNames, mediaGridSize, type GridSize } from '$lib/stores/app'
  import type { Media, MediaStatus, MediaType, TMDBSearchResult, UserId, ProductionCompany, MediaCollection } from '$lib/types'
  import { toast } from 'svelte-sonner'
  import { getDisplayRating } from '$lib/types'
  import { enrichMediaData } from '$lib/tmdb'
  import { searchGames, type WikiGameResult } from '$lib/wikipedia'
  import { fuzzyScoreMulti } from '$lib/fuzzy'
  import {
    applyFilters,
    applySort,
    extractGenres,
    extractDecades,
    countActiveFilters,
    formatDecade,
    getSortLabel,
    DEFAULT_FILTERS,
    DEFAULT_SORT,
    type MediaFilters,
    type SortConfig,
    type SortField,
  } from '$lib/filters'
  import { onMount } from 'svelte'
  import MediaDetailModal from '$lib/components/MediaDetailModal.svelte'
  import SvelteVirtualList from '@humanspeak/svelte-virtual-list'
  import { Library, Film, Tv, Gamepad2, FolderOpen } from 'lucide-svelte'

  // Core state
  let media = $state<Media[]>([]);
  let unsubscribe: (() => void) | undefined;
  let selectedMedia = $state<Media | null>(null);

  // Search state
  let searchQuery = $state('');
  let discoverResults = $state<TMDBSearchResult[]>([]);
  let gameResults = $state<WikiGameResult[]>([]);
  let searching = $state(false);
  let adding = $state<string | null>(null);

  // Filter & Sort state
  let showFilters = $state(false);
  let filters = $state<MediaFilters>({ ...DEFAULT_FILTERS });
  let sort = $state<SortConfig>({ ...DEFAULT_SORT });

  // Debounce and request cancellation
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  let searchAbortController: AbortController | null = null;
  const DEBOUNCE_MS = 300;

  const tabs: Array<{ key: MediaType | 'all'; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'movie', label: 'Movies' },
    { key: 'tv', label: 'TV' },
    { key: 'game', label: 'Games' },
  ];

  const statusOptions: Array<{ key: MediaStatus | 'all'; label: string }> = [
    { key: 'all', label: 'All Statuses' },
    { key: 'queued', label: 'Queued' },
    { key: 'watching', label: 'In Progress' },
    { key: 'completed', label: 'Completed' },
    { key: 'dropped', label: 'Dropped' },
  ];

  const sortOptions: Array<{ field: SortField; label: string; defaultDir: 'asc' | 'desc' }> = [
    { field: 'dateAdded', label: 'Date Added', defaultDir: 'desc' },
    { field: 'title', label: 'Title', defaultDir: 'asc' },
    { field: 'rating', label: 'Rating', defaultDir: 'desc' },
    { field: 'releaseDate', label: 'Release Date', defaultDir: 'desc' },
    { field: 'watchDate', label: 'Watch Date', defaultDir: 'desc' },
  ];

  const FUZZY_THRESHOLD = 25;

  onMount(() => {
    unsubscribe = subscribeToCollection<Media>('media', (items) => {
      media = items;
      if (selectedMedia) {
        const updated = items.find(m => m.id === selectedMedia!.id);
        if (updated) selectedMedia = updated;
      }
    });
    return () => {
      unsubscribe?.();
      if (searchTimer) clearTimeout(searchTimer);
      if (searchAbortController) searchAbortController.abort();
    };
  });

  // Sync tab to type filter
  function setTab(tab: MediaType | 'all') {
    filters = { ...filters, type: tab };
  }

  // Live search effect
  $effect(() => {
    const query = searchQuery.trim();
    const currentType = filters.type;

    if (searchTimer) clearTimeout(searchTimer);
    // Cancel any in-flight requests
    if (searchAbortController) {
      searchAbortController.abort();
      searchAbortController = null;
    }

    if (!query) {
      discoverResults = [];
      gameResults = [];
      return;
    }

    searchTimer = setTimeout(() => {
      searchAbortController = new AbortController();
      if (currentType === 'game') {
        searchWikipedia(query, searchAbortController.signal);
      } else {
        searchTMDB(query, currentType, searchAbortController.signal);
      }
    }, DEBOUNCE_MS);
  });

  async function searchTMDB(query: string, tab: 'all' | MediaType, signal?: AbortSignal): Promise<void> {
    searching = true;
    try {
      const endpoint = tab === 'movie' ? 'movie' : tab === 'tv' ? 'tv' : 'multi';
      const res = await fetch(
        `${tmdbConfig.baseUrl}/search/${endpoint}?api_key=${tmdbConfig.apiKey}&query=${encodeURIComponent(query)}`,
        { signal }
      );
      const data = await res.json();
      let results = data.results as TMDBSearchResult[];

      if (endpoint !== 'multi') {
        results = results.map(r => ({ ...r, media_type: endpoint as 'movie' | 'tv' }));
      } else {
        results = results.filter(r => r.media_type === 'movie' || r.media_type === 'tv');
      }

      discoverResults = results.slice(0, 12);
    } catch (e) {
      // Ignore abort errors
      if (e instanceof DOMException && e.name === 'AbortError') return;
      console.error('TMDB search failed:', e);
      discoverResults = [];
    } finally {
      searching = false;
    }
  }

  async function searchWikipedia(query: string, _signal?: AbortSignal): Promise<void> {
    searching = true;
    try {
      gameResults = await searchGames(query);
    } catch (e) {
      // Ignore abort errors
      if (e instanceof DOMException && e.name === 'AbortError') return;
      console.error('Wikipedia search failed:', e);
      gameResults = [];
    } finally {
      searching = false;
    }
  }

  async function addFromTMDB(item: TMDBSearchResult): Promise<void> {
    const key = `tmdb-${item.id}`;
    if (adding) return;
    adding = key;

    try {
      const isTV = item.media_type === 'tv';
      const mediaType: 'movie' | 'tv' = isTV ? 'tv' : 'movie';
      
      let genres: string[] = [];
      let collection: MediaCollection | null = null;
      let productionCompanies: ProductionCompany[] = [];

      try {
        const enriched = await enrichMediaData(item.id, mediaType);
        genres = enriched.genres;
        collection = enriched.collection;
        productionCompanies = enriched.productionCompanies;
      } catch (e) {
        console.warn('Enrichment failed:', e);
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
      }, $activeUser);

      discoverResults = discoverResults.filter(r => r.id !== item.id);
      toast.success(`Added "${item.title || item.name}"`);
    } catch (e) {
      console.error('Failed to add:', e);
      toast.error('Failed to add item');
    } finally {
      adding = null;
    }
  }

  async function addFromWikipedia(game: WikiGameResult): Promise<void> {
    const key = `wiki-${game.pageid}`;
    if (adding) return;
    adding = key;

    try {
      await addDocument<Media>('media', {
        type: 'game',
        title: game.title,
        posterPath: game.thumbnail,
        overview: game.description,
        status: 'queued',
        rating: null,
        notes: '',
      }, $activeUser);

      gameResults = gameResults.filter(g => g.pageid !== game.pageid);
      toast.success(`Added "${game.title}"`);
    } catch (e) {
      console.error('Failed to add game:', e);
      toast.error('Failed to add game');
    } finally {
      adding = null;
    }
  }

  async function quickStatusChange(item: Media, status: MediaStatus): Promise<void> {
    if (!item.id) return;
    await updateDocument<Media>('media', item.id, { status }, $activeUser);
  }

  async function quickRate(item: Media, rating: number): Promise<void> {
    if (!item.id) return;
    const currentRatings = item.ratings || { Z: null, T: null };
    const userRating = currentRatings[$activeUser as UserId];
    const newRating = userRating === rating ? null : rating;
    await updateDocument<Media>('media', item.id, { 
      ratings: { ...currentRatings, [$activeUser]: newRating } 
    }, $activeUser);
  }

  async function removeItem(id: string): Promise<void> {
    if (confirm('Remove this item?')) {
      try {
        await deleteDocument('media', id);
        toast.success('Removed from collection');
      } catch (e) {
        console.error('Failed to remove:', e);
        toast.error('Failed to remove item');
      }
    }
  }

  function clearFilters(): void {
    filters = { ...DEFAULT_FILTERS, type: filters.type }; // Keep tab selection
    sort = { ...DEFAULT_SORT };
  }

  function toggleGenre(genre: string): void {
    const current = filters.genres;
    if (current.includes(genre)) {
      filters = { ...filters, genres: current.filter(g => g !== genre) };
    } else {
      filters = { ...filters, genres: [...current, genre] };
    }
  }

  function toggleSort(field: SortField): void {
    if (sort.field === field) {
      // Toggle direction
      sort = { ...sort, direction: sort.direction === 'asc' ? 'desc' : 'asc' };
    } else {
      // New field, use its default direction
      const option = sortOptions.find(o => o.field === field);
      sort = { field, direction: option?.defaultDir ?? 'desc' };
    }
  }

  // Memoization caches
  let genreCache = $state<{ key: string; genres: string[] } | null>(null);
  let decadeCache = $state<{ key: string; decades: number[] } | null>(null);
  let searchCache = $state<Map<string, Media[]>>(new Map());

  // Derived data from media with memoization
  let availableGenres = $derived.by(() => {
    const key = media.map(m => m.id).join(',');
    if (genreCache?.key === key) return genreCache.genres;
    const genres = extractGenres(media);
    genreCache = { key, genres };
    return genres;
  });

  let availableDecades = $derived.by(() => {
    const key = media.map(m => m.id).join(',');
    if (decadeCache?.key === key) return decadeCache.decades;
    const decades = extractDecades(media);
    decadeCache = { key, decades };
    return decades;
  });

  let activeFilterCount = $derived(countActiveFilters({ ...filters, type: 'all' })); // Don't count type tab

  // Filtered and sorted library with search caching
  let filteredMedia = $derived.by(() => {
    let result = media;
    const query = searchQuery.trim().toLowerCase();

    // Apply structured filters
    result = applyFilters(result, filters);

    // Search filter with fuzzy matching (cached)
    if (query) {
      const cacheKey = `${query}|${result.map(m => m.id).join(',')}`;
      const cached = searchCache.get(cacheKey);
      if (cached) return cached;

      const searched = result
        .map(item => ({
          item,
          score: fuzzyScoreMulti(query, item.title, item.overview, ...(item.genres ?? []))
        }))
        .filter(r => r.score >= FUZZY_THRESHOLD)
        .sort((a, b) => b.score - a.score)
        .map(r => r.item);

      // Keep cache small (last 10 searches)
      if (searchCache.size > 10) {
        const firstKey = searchCache.keys().next().value;
        if (firstKey) searchCache.delete(firstKey);
      }
      searchCache.set(cacheKey, searched);
      return searched;
    } else {
      // Apply sort when not searching
      result = applySort(result, sort);
    }

    return result;
  });

  function posterUrl(path: string | null | undefined, size: 'sm' | 'md' = 'sm'): string | null {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    const w = size === 'sm' ? 'w185' : 'w342';
    return `${tmdbConfig.imageBaseUrl}/${w}${path}`;
  }

  function getStatusColor(status: MediaStatus): string {
    const colors: Record<MediaStatus, string> = {
      queued: 'bg-slate-500',
      watching: 'bg-amber-500',
      completed: 'bg-emerald-500',
      dropped: 'bg-red-500',
    };
    return colors[status];
  }

  let isSearching = $derived(searchQuery.trim().length > 0);
  let hasDiscoverResults = $derived(filters.type === 'game' ? gameResults.length > 0 : discoverResults.length > 0);

  // Virtual scrolling state
  let gridContainer = $state<HTMLElement | null>(null);
  let containerWidth = $state(0);

  // Grid size configurations: [mobile, sm, md, lg]
  const gridConfigs: Record<GridSize, [number, number, number, number]> = {
    small: [3, 4, 5, 6],   // Compact, matches discovery
    medium: [2, 3, 4, 5],  // Default
    large: [1, 2, 3, 4],   // Large cards
  };

  // Calculate columns based on container width and grid size preference
  let columns = $derived.by(() => {
    const config = gridConfigs[$mediaGridSize];
    if (containerWidth >= 1024) return config[3]; // lg
    if (containerWidth >= 768) return config[2];  // md
    if (containerWidth >= 640) return config[1];  // sm
    return config[0]; // mobile
  });

  function cycleGridSize() {
    const sizes: GridSize[] = ['small', 'medium', 'large'];
    const currentIndex = sizes.indexOf($mediaGridSize);
    const nextIndex = (currentIndex + 1) % sizes.length;
    $mediaGridSize = sizes[nextIndex];
  }

  const gridSizeIcons: Record<GridSize, string> = {
    small: '▪▪▪',
    medium: '◼◼',
    large: '⬛',
  };

  // Group media items into rows for virtual scrolling
  type MediaRow = { id: string; items: Media[] };
  let mediaRows = $derived.by(() => {
    const rows: MediaRow[] = [];
    for (let i = 0; i < filteredMedia.length; i += columns) {
      const rowItems = filteredMedia.slice(i, i + columns);
      rows.push({
        id: `row-${i}-${columns}`,
        items: rowItems
      });
    }
    return rows;
  });

  // Track container width with ResizeObserver
  $effect(() => {
    if (!gridContainer) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        containerWidth = entry.contentRect.width;
      }
    });

    resizeObserver.observe(gridContainer);
    containerWidth = gridContainer.clientWidth;

    return () => resizeObserver.disconnect();
  });
</script>

<MediaDetailModal media={selectedMedia} onClose={() => selectedMedia = null} />

<div class="max-w-6xl mx-auto">
  <!-- Header -->
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-bold">Media</h1>
    <div class="flex items-center gap-1">
      <!-- Grid size toggle -->
      <button
        type="button"
        class="min-w-[44px] min-h-[44px] p-2.5 rounded-lg bg-surface-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 active:bg-slate-200 dark:active:bg-slate-700 transition-colors text-xs font-mono cursor-pointer touch-manipulation"
        onclick={cycleGridSize}
        aria-label="Change grid size: {$mediaGridSize}"
      >
        {gridSizeIcons[$mediaGridSize]}
      </button>

      <!-- Filter toggle -->
      <button
        type="button"
        class="relative min-w-[44px] min-h-[44px] p-2.5 rounded-lg transition-colors cursor-pointer touch-manipulation {showFilters ? 'bg-accent text-white' : 'bg-surface-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 active:bg-slate-200 dark:active:bg-slate-700'}"
        onclick={() => showFilters = !showFilters}
        aria-label="Filters & Sort"
        aria-expanded={showFilters}
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
        {#if activeFilterCount > 0}
          <span class="absolute -top-1 -right-1 w-4 h-4 bg-accent text-white text-[10px] font-bold rounded-full flex items-center justify-center" aria-hidden="true">
            {activeFilterCount}
          </span>
        {/if}
      </button>
    </div>
  </div>

  <!-- Search -->
  <div class="relative mb-4">
    <input
      type="text"
      placeholder="Search your collection or discover new titles..."
      class="w-full px-4 py-3 pl-11 bg-surface border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-all"
      bind:value={searchQuery}
    />
    <svg class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
    {#if searching}
      <div class="absolute right-4 top-1/2 -translate-y-1/2">
        <div class="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
      </div>
    {:else if searchQuery}
      <button
        class="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
        onclick={() => searchQuery = ''}
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    {/if}
  </div>

  <!-- Tabs -->
  <div class="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-4">
    {#each tabs as tab (tab.key)}
      <button
        class="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all {filters.type === tab.key ? 'bg-surface shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}"
        onclick={() => setTab(tab.key)}
      >
        {#if tab.key === 'all'}
          <Library size={18} />
        {:else if tab.key === 'movie'}
          <Film size={18} />
        {:else if tab.key === 'tv'}
          <Tv size={18} />
        {:else if tab.key === 'game'}
          <Gamepad2 size={18} />
        {/if}
        <span class="hidden sm:inline">{tab.label}</span>
      </button>
    {/each}
  </div>

  <!-- Filters Panel (collapsible) -->
  {#if showFilters}
    <div class="p-4 bg-surface border border-slate-200 dark:border-slate-700 rounded-xl mb-4 space-y-4">
      <!-- Row 1: Status, Added By, Sort -->
      <div class="flex flex-wrap gap-4">
        <div class="flex-1 min-w-[120px]">
          <label class="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">Status</label>
          <select
            bind:value={filters.status}
            class="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg"
          >
            {#each statusOptions as opt}
              <option value={opt.key}>{opt.label}</option>
            {/each}
          </select>
        </div>

        <div class="flex-1 min-w-[120px]">
          <label class="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">Added By</label>
          <select
            bind:value={filters.addedBy}
            class="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg"
          >
            <option value="all">Anyone</option>
            <option value="Z">{$displayNames.Z}</option>
            <option value="T">{$displayNames.T}</option>
          </select>
        </div>

        <div class="flex-1 min-w-[140px]">
          <label class="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">Sort By</label>
          <div class="flex gap-1 flex-wrap">
            {#each sortOptions as opt}
              <button
                class="px-2 py-1.5 text-xs rounded-lg transition-colors {sort.field === opt.field 
                  ? 'bg-accent text-white' 
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'}"
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

      <!-- Row 2: Decade, Rating Filter -->
      <div class="flex flex-wrap gap-4">
        {#if availableDecades.length > 0}
          <div class="flex-1 min-w-[120px]">
            <label class="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">Decade</label>
            <select
              bind:value={filters.releaseDecade}
              class="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg"
            >
              <option value={null}>Any Decade</option>
              {#each availableDecades as decade}
                <option value={decade}>{formatDecade(decade)}</option>
              {/each}
            </select>
          </div>
        {/if}

        <div class="flex-1 min-w-[120px]">
          <label class="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">Rating</label>
          <select
            bind:value={filters.hasRating}
            class="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg"
          >
            <option value={null}>Any</option>
            <option value={true}>Rated</option>
            <option value={false}>Unrated</option>
          </select>
        </div>

        <div class="flex-1 min-w-[120px]">
          <label class="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">Collection</label>
          <select
            bind:value={filters.hasCollection}
            class="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg"
          >
            <option value={null}>Any</option>
            <option value={true}>In Collection</option>
            <option value={false}>Standalone</option>
          </select>
        </div>
      </div>

      <!-- Row 3: Genres (chips) -->
      {#if availableGenres.length > 0}
        <div>
          <label class="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">Genres</label>
          <div class="flex flex-wrap gap-1.5">
            {#each availableGenres as genre}
              <button
                class="px-2.5 py-1 text-xs rounded-full transition-colors {filters.genres.includes(genre)
                  ? 'bg-accent text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'}"
                onclick={() => toggleGenre(genre)}
              >
                {genre}
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Clear Button -->
      {#if activeFilterCount > 0}
        <div class="pt-2 border-t border-slate-200 dark:border-slate-700">
          <button
            class="text-sm text-slate-500 hover:text-red-500 transition-colors"
            onclick={clearFilters}
          >
            Clear {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'}
          </button>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Quick filter summary (when collapsed but active) -->
  {#if !showFilters && activeFilterCount > 0}
    <div class="flex items-center gap-2 mb-4 text-sm text-slate-500">
      <span>{activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'} active</span>
      <span>·</span>
      <span>{getSortLabel(sort)}</span>
      <button
        class="text-accent hover:underline"
        onclick={() => showFilters = true}
      >
        Edit
      </button>
      <button
        class="text-red-500 hover:underline"
        onclick={clearFilters}
      >
        Clear
      </button>
    </div>
  {/if}

  <!-- Discover Results (when searching) -->
  {#if isSearching && hasDiscoverResults}
    <div class="mb-6">
      <h2 class="text-sm font-medium text-slate-500 dark:text-slate-400 mb-3">
        Add to collection
      </h2>
      <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
        {#if filters.type === 'game'}
          {#each gameResults as game (game.pageid)}
            {@const isAdding = adding === `wiki-${game.pageid}`}
            <button
              class="group relative bg-surface border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden hover:border-accent hover:shadow-lg transition-all disabled:opacity-50"
              onclick={() => addFromWikipedia(game)}
              disabled={!!adding}
            >
              <div class="aspect-[2/3] bg-slate-100 dark:bg-slate-800">
                {#if game.thumbnail}
                  <img src={game.thumbnail} alt={game.title} loading="lazy" class="w-full h-full object-cover" />
                {:else}
                  <div class="w-full h-full flex items-center justify-center text-slate-300">
                    <Gamepad2 size={48} />
                  </div>
                {/if}
              </div>
              <div class="p-2">
                <p class="text-xs font-medium truncate">{game.title}</p>
              </div>
              <div class="absolute inset-0 bg-accent/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                {#if isAdding}
                  <div class="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                {:else}
                  <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                  </svg>
                {/if}
              </div>
            </button>
          {/each}
        {:else}
          {#each discoverResults as result (result.id)}
            {@const isAdding = adding === `tmdb-${result.id}`}
            <button
              class="group relative bg-surface border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden hover:border-accent hover:shadow-lg transition-all disabled:opacity-50"
              onclick={() => addFromTMDB(result)}
              disabled={!!adding}
            >
              <div class="aspect-[2/3] bg-slate-100 dark:bg-slate-800">
                {#if result.poster_path}
                  <img src={posterUrl(result.poster_path)} alt={result.title || result.name} loading="lazy" class="w-full h-full object-cover" />
                {:else}
                  <div class="w-full h-full flex items-center justify-center text-3xl text-slate-300">?</div>
                {/if}
              </div>
              <div class="p-2">
                <p class="text-xs font-medium truncate">{result.title || result.name}</p>
                <p class="text-[10px] text-slate-400 uppercase">{result.media_type}</p>
              </div>
              <div class="absolute inset-0 bg-accent/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                {#if isAdding}
                  <div class="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                {:else}
                  <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                  </svg>
                {/if}
              </div>
            </button>
          {/each}
        {/if}
      </div>
    </div>
  {/if}

  <!-- Library -->
  <div bind:this={gridContainer}>
    {#if isSearching}
      <h2 class="text-sm font-medium text-slate-500 dark:text-slate-400 mb-3">
        In your collection ({filteredMedia.length})
      </h2>
    {/if}

    {#if filteredMedia.length === 0}
      <div class="text-center py-16">
        <div class="text-slate-300 dark:text-slate-600 mb-4 flex justify-center">
          {#if filters.type === 'game'}
            <Gamepad2 size={64} />
          {:else if filters.type === 'movie'}
            <Film size={64} />
          {:else if filters.type === 'tv'}
            <Tv size={64} />
          {:else}
            <FolderOpen size={64} />
          {/if}
        </div>
        {#if isSearching || activeFilterCount > 0}
          <p class="text-slate-500 dark:text-slate-400">No matches found</p>
          <p class="text-sm text-slate-400 mt-1">
            {#if activeFilterCount > 0}
              Try adjusting your filters
            {:else}
              Try adding from the results above
            {/if}
          </p>
        {:else}
          <p class="text-slate-500 dark:text-slate-400">Nothing here yet</p>
          <p class="text-sm text-slate-400 mt-1">Search for something to add</p>
        {/if}
      </div>
    {:else}
      {@const rowHeight = $mediaGridSize === 'large' ? 420 : $mediaGridSize === 'small' ? 240 : 320}
      <SvelteVirtualList
        items={mediaRows}
        defaultEstimatedItemHeight={rowHeight}
        viewportClass="virtual-grid-viewport"
        contentClass="virtual-grid-content"
      >
        {#snippet renderItem(row: MediaRow)}
          <div class="grid gap-4 pb-4" style="grid-template-columns: repeat({columns}, minmax(0, 1fr));">
            {#each row.items as item (item.id)}
              <article class="group relative bg-surface border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden hover:shadow-lg transition-all touch-manipulation">
                <!-- Delete button (visible on hover/focus-within for touch) -->
                <button
                  type="button"
                  class="absolute top-2 right-2 z-20 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-red-500 active:bg-red-500 transition-all sm:w-7 sm:h-7"
                  onclick={(e) => { e.stopPropagation(); item.id && removeItem(item.id); }}
                  aria-label="Remove {item.title}"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>

                <!-- Status indicator -->
                <div class="absolute top-2 left-2 z-10">
                  <div class="w-2.5 h-2.5 rounded-full {getStatusColor(item.status)} ring-2 ring-white dark:ring-slate-900" title={item.status}></div>
                </div>

                <!-- Poster (clickable) -->
                <button
                  class="w-full text-left"
                  onclick={() => selectedMedia = item}
                >
                  <div class="aspect-[2/3] bg-slate-100 dark:bg-slate-800 relative">
                    {#if item.posterPath}
                      <img
                        src={posterUrl(item.posterPath, 'md')}
                        alt={item.title}
                        loading="lazy"
                        class="w-full h-full object-cover"
                        class:opacity-40={item.status === 'completed'}
                      />
                    {:else}
                      <div class="w-full h-full flex items-center justify-center text-slate-300">
                        {#if item.type === 'game'}
                          <Gamepad2 size={48} />
                        {:else if item.type === 'tv'}
                          <Tv size={48} />
                        {:else}
                          <Film size={48} />
                        {/if}
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

                  <!-- Release year & collection badge -->
                  {#if item.releaseDate || item.collection}
                    <div class="flex items-center gap-1.5 mb-1 text-[10px] text-slate-400">
                      {#if item.releaseDate}
                        <span>{item.releaseDate.split('-')[0]}</span>
                      {/if}
                      {#if item.collection}
                        <span class="px-1 py-0.5 bg-accent/10 text-accent rounded text-[9px] truncate max-w-[80px]" title={item.collection.name}>
                          {item.collection.name}
                        </span>
                      {/if}
                    </div>
                  {/if}

                  <!-- Rating -->
                  <div class="flex items-center gap-0.5">
                    {#each [1, 2, 3, 4, 5] as star}
                      {@const displayRating = getDisplayRating(item)}
                      <button
                        class="text-base transition-colors {(displayRating ?? 0) >= star ? 'text-amber-400' : 'text-slate-200 dark:text-slate-700 hover:text-amber-300'}"
                        onclick={() => quickRate(item, star)}
                      >
                        ★
                      </button>
                    {/each}
                  </div>

                  <!-- Quick status buttons (visible on hover/focus-within for touch) -->
                  <div class="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                    {#if item.status !== 'watching'}
                      <button
                        type="button"
                        class="flex-1 py-1.5 text-[10px] font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded hover:bg-amber-200 dark:hover:bg-amber-900/50 active:bg-amber-200 dark:active:bg-amber-900/50 transition-colors touch-manipulation"
                        onclick={() => quickStatusChange(item, 'watching')}
                      >
                        Start
                      </button>
                    {/if}
                    {#if item.status !== 'completed'}
                      <button
                        type="button"
                        class="flex-1 py-1.5 text-[10px] font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded hover:bg-emerald-200 dark:hover:bg-emerald-900/50 active:bg-emerald-200 dark:active:bg-emerald-900/50 transition-colors touch-manipulation"
                        onclick={() => quickStatusChange(item, 'completed')}
                      >
                        Done
                      </button>
                    {/if}
                  </div>
                </div>
              </article>
            {/each}
          </div>
        {/snippet}
      </SvelteVirtualList>
    {/if}
  </div>
</div>

<style>
  :global(.virtual-grid-viewport) {
    /* Use flex-based height from parent - works better with PWA */
    height: calc(100dvh - 220px);
    min-height: 300px;
    max-height: calc(100dvh - 180px);
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    /* Ensure touch scrolling works */
    touch-action: pan-y;
  }

  /* Fallback for browsers without dvh support */
  @supports not (height: 100dvh) {
    :global(.virtual-grid-viewport) {
      height: calc(100vh - 220px);
      max-height: calc(100vh - 180px);
    }
  }

  /* On touch devices, show hover elements when the article is focused/active */
  @media (hover: none) {
    .group:active .group-hover\:opacity-100,
    .group:focus-within .group-hover\:opacity-100 {
      opacity: 1;
    }
  }
</style>

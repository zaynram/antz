<script lang="ts">
  import { tmdbConfig } from '$lib/config'
  import { addDocument, deleteDocument, subscribeToCollection, updateDocument } from '$lib/firebase'
  import { activeUser } from '$lib/stores/app'
  import type { Media, MediaStatus, MediaType, TMDBSearchResult, UserId, ProductionCompany, MediaCollection } from '$lib/types'
  import { getDisplayRating } from '$lib/types'
  import { enrichMediaData } from '$lib/tmdb'
  import { searchGames, type WikiGameResult } from '$lib/wikipedia'
  import { fuzzyScoreMulti } from '$lib/fuzzy'
  import { onMount } from 'svelte'
  import MediaDetailModal from '$lib/components/MediaDetailModal.svelte'

  // Core state
  let media = $state<Media[]>([]);
  let unsubscribe: (() => void) | undefined;
  let activeTab = $state<'all' | MediaType>('all');
  let selectedMedia = $state<Media | null>(null);

  // Search state
  let searchQuery = $state('');
  let discoverResults = $state<TMDBSearchResult[]>([]);
  let gameResults = $state<WikiGameResult[]>([]);
  let searching = $state(false);
  let adding = $state<string | null>(null); // Track which item is being added

  // Filter state (collapsed by default)
  let showFilters = $state(false);
  let filterStatus = $state<MediaStatus | 'all'>('all');
  let sortField = $state<'dateAdded' | 'title' | 'rating'>('dateAdded');

  // Debounce
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  const DEBOUNCE_MS = 300;

  const tabs: Array<{ key: 'all' | MediaType; label: string; icon: string }> = [
    { key: 'all', label: 'All', icon: '📚' },
    { key: 'movie', label: 'Movies', icon: '🎬' },
    { key: 'tv', label: 'TV', icon: '📺' },
    { key: 'game', label: 'Games', icon: '🎮' },
  ];

  const statusFilters: Array<{ key: MediaStatus | 'all'; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'queued', label: 'Queued' },
    { key: 'watching', label: 'In Progress' },
    { key: 'completed', label: 'Completed' },
    { key: 'dropped', label: 'Dropped' },
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
    };
  });

  // Live search effect
  $effect(() => {
    const query = searchQuery.trim();
    const tab = activeTab;
    
    if (searchTimer) clearTimeout(searchTimer);
    
    if (!query) {
      discoverResults = [];
      gameResults = [];
      return;
    }
    
    searchTimer = setTimeout(() => {
      if (tab === 'game') {
        searchWikipedia(query);
      } else {
        searchTMDB(query, tab);
      }
    }, DEBOUNCE_MS);
  });

  async function searchTMDB(query: string, tab: 'all' | MediaType): Promise<void> {
    searching = true;
    try {
      const endpoint = tab === 'movie' ? 'movie' : tab === 'tv' ? 'tv' : 'multi';
      const res = await fetch(
        `${tmdbConfig.baseUrl}/search/${endpoint}?api_key=${tmdbConfig.apiKey}&query=${encodeURIComponent(query)}`
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
      console.error('TMDB search failed:', e);
      discoverResults = [];
    } finally {
      searching = false;
    }
  }

  async function searchWikipedia(query: string): Promise<void> {
    searching = true;
    try {
      gameResults = await searchGames(query);
    } catch (e) {
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
      
      // Clear from results after adding
      discoverResults = discoverResults.filter(r => r.id !== item.id);
    } catch (e) {
      console.error('Failed to add:', e);
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
    } catch (e) {
      console.error('Failed to add game:', e);
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
      await deleteDocument('media', id);
    }
  }

  // Filtered and sorted library
  let filteredMedia = $derived.by(() => {
    let result = media;
    const query = searchQuery.trim().toLowerCase();

    // Tab filter
    if (activeTab !== 'all') {
      result = result.filter(m => m.type === activeTab);
    }

    // Status filter
    if (filterStatus !== 'all') {
      result = result.filter(m => m.status === filterStatus);
    }

    // Search filter with fuzzy matching
    if (query) {
      result = result
        .map(item => ({
          item,
          score: fuzzyScoreMulti(query, item.title, item.overview, ...(item.genres ?? []))
        }))
        .filter(r => r.score >= FUZZY_THRESHOLD)
        .sort((a, b) => b.score - a.score)
        .map(r => r.item);
    } else {
      // Sort when not searching
      result = [...result].sort((a, b) => {
        switch (sortField) {
          case 'title':
            return a.title.localeCompare(b.title);
          case 'rating': {
            const rA = getDisplayRating(a) ?? 0;
            const rB = getDisplayRating(b) ?? 0;
            return rB - rA;
          }
          default: // dateAdded
            return (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0);
        }
      });
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
  let hasDiscoverResults = $derived(activeTab === 'game' ? gameResults.length > 0 : discoverResults.length > 0);
</script>

<MediaDetailModal media={selectedMedia} onClose={() => selectedMedia = null} />

<div class="max-w-6xl mx-auto">
  <!-- Header -->
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-bold">Media</h1>
    <div class="flex items-center gap-2">
      <button
        class="p-2 rounded-lg transition-colors {showFilters ? 'bg-accent text-white' : 'bg-surface-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}"
        onclick={() => showFilters = !showFilters}
        title="Filters"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
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
        class="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all {activeTab === tab.key ? 'bg-surface shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}"
        onclick={() => activeTab = tab.key}
      >
        <span>{tab.icon}</span>
        <span class="hidden sm:inline">{tab.label}</span>
      </button>
    {/each}
  </div>

  <!-- Filters (collapsible) -->
  {#if showFilters}
    <div class="flex flex-wrap items-center gap-4 p-4 bg-surface border border-slate-200 dark:border-slate-700 rounded-xl mb-4">
      <div class="flex items-center gap-2">
        <span class="text-sm text-slate-500">Status:</span>
        <select
          bind:value={filterStatus}
          class="px-3 py-1.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg"
        >
          {#each statusFilters as sf}
            <option value={sf.key}>{sf.label}</option>
          {/each}
        </select>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-sm text-slate-500">Sort:</span>
        <select
          bind:value={sortField}
          class="px-3 py-1.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg"
        >
          <option value="dateAdded">Recently Added</option>
          <option value="title">Title</option>
          <option value="rating">Rating</option>
        </select>
      </div>
      {#if filterStatus !== 'all'}
        <button
          class="ml-auto text-sm text-slate-500 hover:text-red-500"
          onclick={() => filterStatus = 'all'}
        >
          Clear
        </button>
      {/if}
    </div>
  {/if}

  <!-- Discover Results (when searching) -->
  {#if isSearching && hasDiscoverResults}
    <div class="mb-6">
      <h2 class="text-sm font-medium text-slate-500 dark:text-slate-400 mb-3">
        Add to collection
      </h2>
      <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
        {#if activeTab === 'game'}
          {#each gameResults as game (game.pageid)}
            {@const isAdding = adding === `wiki-${game.pageid}`}
            <button
              class="group relative bg-surface border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden hover:border-accent hover:shadow-lg transition-all disabled:opacity-50"
              onclick={() => addFromWikipedia(game)}
              disabled={!!adding}
            >
              <div class="aspect-[2/3] bg-slate-100 dark:bg-slate-800">
                {#if game.thumbnail}
                  <img src={game.thumbnail} alt="" class="w-full h-full object-cover" />
                {:else}
                  <div class="w-full h-full flex items-center justify-center text-3xl text-slate-300">🎮</div>
                {/if}
              </div>
              <div class="p-2">
                <p class="text-xs font-medium truncate">{game.title}</p>
              </div>
              <!-- Add overlay -->
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
                  <img src={posterUrl(result.poster_path)} alt="" class="w-full h-full object-cover" />
                {:else}
                  <div class="w-full h-full flex items-center justify-center text-3xl text-slate-300">?</div>
                {/if}
              </div>
              <div class="p-2">
                <p class="text-xs font-medium truncate">{result.title || result.name}</p>
                <p class="text-[10px] text-slate-400 uppercase">{result.media_type}</p>
              </div>
              <!-- Add overlay -->
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
  <div>
    {#if isSearching}
      <h2 class="text-sm font-medium text-slate-500 dark:text-slate-400 mb-3">
        In your collection ({filteredMedia.length})
      </h2>
    {/if}

    {#if filteredMedia.length === 0}
      <div class="text-center py-16">
        <div class="text-5xl mb-4">{activeTab === 'game' ? '🎮' : activeTab === 'movie' ? '🎬' : activeTab === 'tv' ? '📺' : '📚'}</div>
        {#if isSearching}
          <p class="text-slate-500 dark:text-slate-400">No matches in your collection</p>
          <p class="text-sm text-slate-400 mt-1">Try adding from the results above</p>
        {:else}
          <p class="text-slate-500 dark:text-slate-400">Nothing here yet</p>
          <p class="text-sm text-slate-400 mt-1">Search for something to add</p>
        {/if}
      </div>
    {:else}
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {#each filteredMedia as item (item.id)}
          <article class="group relative bg-surface border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden hover:shadow-lg transition-all">
            <!-- Delete button -->
            <button
              class="absolute top-2 right-2 z-20 w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-500 transition-all"
              onclick={(e) => { e.stopPropagation(); item.id && removeItem(item.id); }}
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
                    alt="" 
                    class="w-full h-full object-cover"
                    class:opacity-40={item.status === 'completed'}
                  />
                {:else}
                  <div class="w-full h-full flex items-center justify-center text-4xl text-slate-300">
                    {item.type === 'game' ? '🎮' : item.type === 'tv' ? '📺' : '🎬'}
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

              <!-- Quick status buttons -->
              <div class="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                {#if item.status !== 'watching'}
                  <button
                    class="flex-1 py-1 text-[10px] font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
                    onclick={() => quickStatusChange(item, 'watching')}
                  >
                    Start
                  </button>
                {/if}
                {#if item.status !== 'completed'}
                  <button
                    class="flex-1 py-1 text-[10px] font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors"
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
    {/if}
  </div>
</div>

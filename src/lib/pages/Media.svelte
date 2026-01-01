<script lang="ts">
  import { tmdbConfig } from '$lib/config'
  import { addDocument, deleteDocument, subscribeToCollection, updateDocument } from '$lib/firebase'
  import { activeUser } from '$lib/stores/app'
  import type { Media, MediaStatus, MediaType, TMDBSearchResult } from '$lib/types'
  import { onMount } from 'svelte'

  let media = $state<Media[]>([]);
  let unsubscribe: (() => void) | undefined;
  let searchQuery = $state('');
  let searchResults = $state<TMDBSearchResult[]>([]);
  let allSearchResults = $state<TMDBSearchResult[]>([]);
  let visibleResultCount = $state(10);
  let searching = $state(false);
  let activeTab = $state<'all' | MediaType>('all');

  const tabs: Array<'all' | MediaType> = ['all', 'tv', 'movie', 'game'];
  const statusOptions: MediaStatus[] = ['queued', 'watching', 'completed', 'dropped'];
  const DEFAULT_RESULT_COUNT = 10;

  onMount(() => {
    unsubscribe = subscribeToCollection<Media>('media', (items) => {
      media = items;
    });

    return () => unsubscribe?.();
  });

  async function searchTMDB(): Promise<void> {
    if (!searchQuery.trim()) return;
    searching = true;
    visibleResultCount = DEFAULT_RESULT_COUNT;

    try {
      const res = await fetch(
        `${tmdbConfig.baseUrl}/search/multi?api_key=${tmdbConfig.apiKey}&query=${encodeURIComponent(searchQuery)}`
      );
      const data = await res.json();
      allSearchResults = (data.results as TMDBSearchResult[])
        .filter((r) => r.media_type === 'movie' || r.media_type === 'tv');
      searchResults = allSearchResults.slice(0, visibleResultCount);
    } catch (e) {
      console.error('Search failed:', e);
      allSearchResults = [];
      searchResults = [];
    } finally {
      searching = false;
    }
  }

  function showMoreResults(): void {
    visibleResultCount += 10;
    searchResults = allSearchResults.slice(0, visibleResultCount);
  }

  async function addFromSearch(item: TMDBSearchResult): Promise<void> {
    try {
      const isTV = item.media_type === 'tv';
      
      const mediaData: Omit<Media, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'> = {
        type: isTV ? 'tv' : 'movie',
        tmdbId: item.id,
        title: item.title || item.name || '',
        posterPath: item.poster_path,
        releaseDate: item.release_date || item.first_air_date,
        overview: item.overview,
        status: 'queued',
        rating: null,
        notes: ''
      };
      
      if (isTV) {
        mediaData.progress = { season: 1, episode: 1 };
      }

      await addDocument<Media>('media', mediaData, $activeUser);

      searchQuery = '';
      searchResults = [];
    } catch (e) {
      console.error('Failed to add media:', e);
      alert('Failed to add: ' + (e instanceof Error ? e.message : 'Unknown error'));
    }
  }

  async function addManualGame(): Promise<void> {
    const title = prompt('Game title:');
    if (!title) return;

    await addDocument<Media>(
      'media',
      {
        type: 'game',
        title,
        posterPath: null,
        status: 'queued',
        rating: null,
        notes: ''
      },
      $activeUser
    );
  }

  async function updateStatus(id: string, status: string): Promise<void> {
    await updateDocument<Media>('media', id, { status: status as MediaStatus }, $activeUser);
  }

  async function remove(id: string): Promise<void> {
    if (confirm('Remove this?')) {
      await deleteDocument('media', id);
    }
  }

  function posterUrl(path: string | null): string | null {
    if (!path) return null;
    return `${tmdbConfig.imageBaseUrl}/w185${path}`;
  }

  function getStatusBadgeClass(status: MediaStatus): string {
    switch (status) {
      case 'completed':
        return 'bg-emerald-500 text-white';
      case 'watching':
        return 'bg-amber-500 text-amber-900';
      case 'dropped':
        return 'bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-300';
      default:
        return 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300';
    }
  }

  function getStatusLabel(status: MediaStatus): string {
    switch (status) {
      case 'completed':
        return '✓ Done';
      case 'watching':
        return '▶ Watching';
      case 'dropped':
        return '✕ Dropped';
      default:
        return '○ Queued';
    }
  }

  let filteredMedia = $derived(activeTab === 'all' ? media : media.filter((m) => m.type === activeTab));
</script>

<div>
  <h1 class="text-2xl font-bold mb-6">Media</h1>

  <div class="flex gap-4 mb-4">
    <form class="flex gap-2 flex-1" onsubmit={(e) => { e.preventDefault(); searchTMDB(); }}>
      <input
        type="text"
        placeholder="Search movies & TV shows..."
        class="flex-1 px-4 py-3 bg-surface border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:border-accent"
        bind:value={searchQuery}
      />
      <button
        type="submit"
        disabled={searching}
        class="px-4 py-3 bg-accent text-white rounded-lg font-medium disabled:opacity-60"
      >
        {searching ? '...' : 'Search'}
      </button>
    </form>
    {#if activeTab === 'game'}
      <button
        class="px-4 py-3 bg-surface-2 text-slate-900 dark:text-slate-100 rounded-lg font-medium"
        onclick={addManualGame}
      >
        + Add Game
      </button>
    {/if}
  </div>

  {#if searchResults.length > 0}
    <div class="flex gap-3 overflow-x-auto py-4 mb-2">
      {#each searchResults as result}
        <button
          class="shrink-0 w-24 p-0 bg-surface border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden text-center cursor-pointer hover:border-accent"
          onclick={() => addFromSearch(result)}
        >
          {#if result.poster_path}
            <img
              src={posterUrl(result.poster_path)}
              alt=""
              class="w-full h-36 object-cover"
            />
          {:else}
            <div
              class="w-full h-36 flex items-center justify-center bg-surface-2 text-2xl text-slate-400"
            >
              ?
            </div>
          {/if}
          <span
            class="block px-2 py-2 text-xs truncate text-slate-900 dark:text-slate-100"
          >
            {result.title || result.name}
          </span>
          <span class="block text-[10px] text-slate-400 pb-2 uppercase">
            {result.media_type}
          </span>
        </button>
      {/each}
    </div>
    {#if allSearchResults.length > visibleResultCount}
      <button
        class="w-full py-2 mb-4 text-sm text-slate-500 dark:text-slate-400 hover:text-accent transition-colors"
        onclick={showMoreResults}
      >
        View More ({allSearchResults.length - visibleResultCount} remaining)
      </button>
    {/if}
  {/if}

  <div class="flex gap-2 mb-6">
    {#each tabs as tab}
      <button
        class="px-4 py-2 rounded-lg font-medium capitalize transition-colors"
        class:bg-accent={activeTab === tab}
        class:text-white={activeTab === tab}
        class:bg-surface={activeTab !== tab}
        class:text-slate-400={activeTab !== tab}
        onclick={() => (activeTab = tab)}
      >
        {tab}
      </button>
    {/each}
  </div>

  <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
    {#each filteredMedia as item (item.id)}
      <article
        class="bg-surface border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden group relative"
      >
        <!-- Status badge -->
        <div
          class="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide {getStatusBadgeClass(item.status)}"
        >
          {getStatusLabel(item.status)}
        </div>
        
        <div class="relative">
          {#if item.posterPath}
            <img 
              src={posterUrl(item.posterPath)} 
              alt="" 
              class="w-full h-48 object-cover"
              class:opacity-50={item.status === 'completed'}
            />
          {:else}
            <div
              class="w-full h-48 flex items-center justify-center bg-surface-2 text-4xl"
              class:opacity-50={item.status === 'completed'}
            >
              {item.type === 'game' ? '🎮' : '?'}
            </div>
          {/if}
          {#if item.status === 'completed'}
            <div class="absolute inset-0 flex items-center justify-center">
              <span class="text-5xl opacity-80">✓</span>
            </div>
          {/if}
        </div>
        
        <div class="p-3 relative">
          <h3 class="text-sm font-semibold mb-1 truncate" class:line-through={item.status === 'dropped'}>{item.title}</h3>
          <span class="text-[10px] uppercase text-slate-400">{item.type}</span>
          <select
            value={item.status}
            onchange={(e) => item.id && updateStatus(item.id, e.currentTarget.value)}
            class="w-full mt-2 p-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded"
          >
            {#each statusOptions as status}
              <option value={status}>{status}</option>
            {/each}
          </select>
          <button
            class="absolute top-2 right-2 w-5 h-5 text-slate-400 text-sm opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-500"
            onclick={() => item.id && remove(item.id)}
          >
            ×
          </button>
        </div>
      </article>
    {:else}
      <p class="col-span-full text-center text-slate-500 dark:text-slate-400 py-12">
        Nothing here yet. Search for something to track!
      </p>
    {/each}
  </div>
</div>

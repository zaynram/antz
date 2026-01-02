<script lang="ts">
  import { tmdbConfig, steamConfig } from '$lib/config'
  import { addDocument, deleteDocument, subscribeToCollection, updateDocument } from '$lib/firebase'
  import { activeUser, mediaSearchHistory, addToSearchHistory, removeFromSearchHistory } from '$lib/stores/app'
  import type { Media, MediaStatus, MediaType, TMDBSearchResult, UserId, ProductionCompany, MediaCollection } from '$lib/types'
  import { getDisplayRating } from '$lib/types'
  import { enrichMediaData } from '$lib/tmdb'
  import { fuzzyScoreMulti } from '$lib/fuzzy'
  import { onMount } from 'svelte'
  import MediaDetailModal from '$lib/components/MediaDetailModal.svelte'

  let media = $state<Media[]>([]);
  let unsubscribe: (() => void) | undefined;
  let searchQuery = $state('');
  let searchResults = $state<TMDBSearchResult[]>([]);
  let allSearchResults = $state<TMDBSearchResult[]>([]);
  let visibleResultCount = $state(10);
  let searching = $state(false);
  let adding = $state(false);
  let activeTab = $state<'all' | MediaType>('all');
  let selectedMedia = $state<Media | null>(null);
  let showSearchHistory = $state(false);
  let searchInputRef = $state<HTMLInputElement | null>(null);

  // Search source: 'saved' | 'discover' | 'both'
  type SearchSource = 'saved' | 'discover' | 'both';
  let searchSource = $state<SearchSource>('both');

  // Filter/Sort state
  type SortField = 'title' | 'rating' | 'dateAdded' | 'releaseYear' | 'watchDate' | 'relevance';
  type SortDirection = 'asc' | 'desc';
  type GroupBy = 'none' | 'collection' | 'studio' | 'status' | 'custom';

  let sortField = $state<SortField>('dateAdded');
  let sortDirection = $state<SortDirection>('desc');
  let filterGenres = $state<string[]>([]);
  let filterStatus = $state<MediaStatus[]>([]);
  let groupBy = $state<GroupBy>('none');
  let showFilters = $state(false);

  // Custom groups state
  let showCustomGroupModal = $state(false);
  let pendingCustomGroups = $state<Map<string, string>>(new Map()); // groups created but not yet assigned to media
  let editingGroupId = $state<string | null>(null);
  let newGroupName = $state('');

  // Manual game modal state
  let showAddGameModal = $state(false);
  let gameSearchQuery = $state('');
  let gameSearchResults = $state<SteamSearchResult[]>([]);
  let gameSearching = $state(false);
  let manualGameTitle = $state('');

  // Steam search result type
  interface SteamSearchResult {
    type: string;
    name: string;
    id: number;
    tiny_image: string;
    metascore?: string;
  }

  // Live search debounce
  let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  const SEARCH_DEBOUNCE_MS = 350;

  const tabs: Array<'all' | MediaType> = ['all', 'tv', 'movie', 'game'];
  const statusOptions: MediaStatus[] = ['queued', 'watching', 'completed', 'dropped'];
  const sortOptions: { value: SortField; label: string }[] = [
    { value: 'relevance', label: 'Relevance' },
    { value: 'dateAdded', label: 'Date Added' },
    { value: 'title', label: 'Title' },
    { value: 'rating', label: 'Rating' },
    { value: 'releaseYear', label: 'Release Year' },
    { value: 'watchDate', label: 'Watch Date' },
  ];
  const groupOptions: { value: GroupBy; label: string }[] = [
    { value: 'none', label: 'No Grouping' },
    { value: 'collection', label: 'Collection/Franchise' },
    { value: 'studio', label: 'Studio' },
    { value: 'status', label: 'Status' },
    { value: 'custom', label: 'Custom Groups' },
  ];

  const DEFAULT_RESULT_COUNT = 10;
  const SEARCH_HISTORY_CLOSE_DELAY_MS = 150;
  const FUZZY_THRESHOLD = 25;

  // Derive available genres from current media
  let availableGenres = $derived.by(() => {
    const genres = new Set<string>();
    for (const m of media) {
      if (m.genres) {
        for (const g of m.genres) {
          genres.add(g);
        }
      }
    }
    return Array.from(genres).sort();
  });

  // Derive custom groups from media + pending (avoids $effect -> $state anti-pattern)
  let customGroups = $derived.by(() => {
    const groups = new Map<string, string>();
    // Groups from persisted media
    for (const m of media) {
      if (m.customGroupId && m.customGroupName) {
        groups.set(m.customGroupId, m.customGroupName);
      }
    }
    // Pending groups not yet assigned to any media
    for (const [id, name] of pendingCustomGroups) {
      if (!groups.has(id)) {
        groups.set(id, name);
      }
    }
    return groups;
  });

  // Memoized array for template iteration (avoids repeated Array.from)
  let customGroupsArray = $derived(Array.from(customGroups.entries()));

  // Memoized group item counts for modal display
  let groupItemCounts = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const m of media) {
      if (m.customGroupId) {
        counts.set(m.customGroupId, (counts.get(m.customGroupId) ?? 0) + 1);
      }
    }
    return counts;
  });

  onMount(() => {
    unsubscribe = subscribeToCollection<Media>('media', (items) => {
      media = items;
      if (selectedMedia) {
        const currentId = selectedMedia.id;
        const updated = items.find(m => m.id === currentId);
        if (updated) {
          selectedMedia = updated;
        }
      }
    });

    return () => {
      unsubscribe?.();
      if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    };
  });

  // Live search effect - triggers TMDB/Steam search on query or tab change
  $effect(() => {
    const query = searchQuery.trim();
    const currentTab = activeTab; // Track tab changes
    
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
    }
    
    if (!query) {
      searchResults = [];
      allSearchResults = [];
      return;
    }
    
    // Auto-switch to relevance sort when searching
    if (query && sortField !== 'relevance') {
      sortField = 'relevance';
    }
    
    // Only search external sources if source includes discover
    if (searchSource === 'discover' || searchSource === 'both') {
      searchDebounceTimer = setTimeout(() => {
        if (currentTab === 'game') {
          searchSteam(query);
        } else {
          searchTMDB(query);
        }
      }, SEARCH_DEBOUNCE_MS);
    } else {
      searchResults = [];
      allSearchResults = [];
    }
  });

  async function searchTMDB(query: string): Promise<void> {
    if (!query.trim()) return;
    
    searching = true;
    visibleResultCount = DEFAULT_RESULT_COUNT;

    try {
      // Use specific endpoint based on active tab
      const endpoint = activeTab === 'movie' ? 'movie' : activeTab === 'tv' ? 'tv' : 'multi';
      const res = await fetch(
        `${tmdbConfig.baseUrl}/search/${endpoint}?api_key=${tmdbConfig.apiKey}&query=${encodeURIComponent(query)}`
      );
      const data = await res.json();
      let results = data.results as TMDBSearchResult[];
      
      // Non-multi endpoints don't include media_type, add it
      if (endpoint !== 'multi') {
        results = results.map(r => ({ ...r, media_type: endpoint as 'movie' | 'tv' }));
      } else {
        results = results.filter((r) => r.media_type === 'movie' || r.media_type === 'tv');
      }
      
      allSearchResults = results;
      searchResults = allSearchResults.slice(0, visibleResultCount);
      
      if (allSearchResults.length > 0) {
        addToSearchHistory(query);
      }
    } catch (e) {
      console.error('TMDB search failed:', e);
      allSearchResults = [];
      searchResults = [];
    } finally {
      searching = false;
    }
  }

  async function searchSteam(query: string): Promise<void> {
    if (!query.trim()) return;
    
    searching = true;
    visibleResultCount = DEFAULT_RESULT_COUNT;

    try {
      const res = await fetch(
        `${steamConfig.searchUrl}/?term=${encodeURIComponent(query)}&l=english&cc=US`
      );
      const data = await res.json();
      const steamResults = (data.items || []) as SteamSearchResult[];
      
      // Convert Steam results to TMDB-like format for unified rendering
      allSearchResults = steamResults.map(r => ({
        id: r.id,
        media_type: 'game' as const,
        name: r.name,
        poster_path: r.tiny_image, // Will need special handling in posterUrl
        overview: r.metascore ? `Metascore: ${r.metascore}` : '',
      } as unknown as TMDBSearchResult));
      
      searchResults = allSearchResults.slice(0, visibleResultCount);
      
      if (allSearchResults.length > 0) {
        addToSearchHistory(query);
      }
    } catch (e) {
      console.error('Steam search failed:', e);
      allSearchResults = [];
      searchResults = [];
    } finally {
      searching = false;
    }
  }

  async function searchSteamForModal(query: string): Promise<void> {
    if (!query.trim()) {
      gameSearchResults = [];
      return;
    }
    
    gameSearching = true;

    try {
      const res = await fetch(
        `${steamConfig.searchUrl}/?term=${encodeURIComponent(query)}&l=english&cc=US`
      );
      const data = await res.json();
      gameSearchResults = (data.items || []) as SteamSearchResult[];
    } catch (e) {
      console.error('Steam search failed:', e);
      gameSearchResults = [];
    } finally {
      gameSearching = false;
    }
  }

  function showMoreResults(): void {
    visibleResultCount += 10;
    searchResults = allSearchResults.slice(0, visibleResultCount);
  }

  function handleSearchFocus(): void {
    if ($mediaSearchHistory.length > 0 && !searchQuery.trim()) {
      showSearchHistory = true;
    }
  }

  function handleSearchBlur(): void {
    setTimeout(() => {
      showSearchHistory = false;
    }, SEARCH_HISTORY_CLOSE_DELAY_MS);
  }

  function handleSearchKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      showSearchHistory = false;
      showFilters = false;
      searchInputRef?.blur();
    } else if (e.key === 'Escape') {
      showSearchHistory = false;
      searchInputRef?.blur();
    }
  }

  function selectFromHistory(query: string): void {
    searchQuery = query;
    showSearchHistory = false;
  }

  function clearSearch(): void {
    searchQuery = '';
    searchResults = [];
    allSearchResults = [];
    if (sortField === 'relevance') {
      sortField = 'dateAdded';
    }
  }

  function openAddGameModal(): void {
    showAddGameModal = true;
    gameSearchQuery = '';
    gameSearchResults = [];
    manualGameTitle = '';
  }

  function closeAddGameModal(): void {
    showAddGameModal = false;
    gameSearchQuery = '';
    gameSearchResults = [];
    manualGameTitle = '';
  }

  async function addGameFromSteam(steamGame: SteamSearchResult): Promise<void> {
    await addDocument<Media>(
      'media',
      {
        type: 'game',
        title: steamGame.name,
        steamId: steamGame.id,
        posterPath: steamGame.tiny_image,
        status: 'queued',
        rating: null,
        notes: steamGame.metascore ? `Metascore: ${steamGame.metascore}` : ''
      },
      $activeUser
    );
    closeAddGameModal();
  }

  async function addManualGame(): Promise<void> {
    if (!manualGameTitle.trim()) return;

    await addDocument<Media>(
      'media',
      {
        type: 'game',
        title: manualGameTitle.trim(),
        posterPath: null,
        status: 'queued',
        rating: null,
        notes: ''
      },
      $activeUser
    );
    closeAddGameModal();
  }

  async function addFromSearch(item: TMDBSearchResult): Promise<void> {
    if (adding) return;
    adding = true;

    try {
      // Handle Steam game results
      if ((item as unknown as { media_type: string }).media_type === 'game') {
        await addDocument<Media>(
          'media',
          {
            type: 'game',
            title: item.name || '',
            steamId: item.id,
            posterPath: item.poster_path, // Steam tiny_image URL
            status: 'queued',
            rating: null,
            notes: item.overview || ''
          },
          $activeUser
        );
        adding = false;
        return;
      }

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
        console.warn('Failed to enrich media data, using basic info:', e);
      }
      
      const mediaData: Omit<Media, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'> = {
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
      };
      
      if (isTV) {
        mediaData.progress = { season: 1, episode: 1 };
      }

      await addDocument<Media>('media', mediaData, $activeUser);
    } catch (e) {
      console.error('Failed to add media:', e);
      alert('Failed to add: ' + (e instanceof Error ? e.message : 'Unknown error'));
    } finally {
      adding = false;
    }
  }

  async function updateStatus(id: string, status: string): Promise<void> {
    await updateDocument<Media>('media', id, { status: status as MediaStatus }, $activeUser);
  }

  async function updateRating(id: string, userId: UserId, rating: number | null): Promise<void> {
    const item = media.find(m => m.id === id);
    if (!item) return;
    
    const currentRatings = item.ratings || { Z: null, T: null };
    const updatedRatings = { ...currentRatings, [userId]: rating };
    
    await updateDocument<Media>('media', id, { ratings: updatedRatings }, $activeUser);
  }

  async function remove(id: string): Promise<void> {
    if (confirm('Remove this?')) {
      await deleteDocument('media', id);
    }
  }

  // Custom group functions
  function createCustomGroup(): void {
    const name = newGroupName.trim();
    if (!name) return;
    
    const id = crypto.randomUUID();
    pendingCustomGroups = new Map(pendingCustomGroups).set(id, name);
    newGroupName = '';
  }

  async function assignToGroup(mediaId: string, groupId: string | null, groupName: string | null): Promise<void> {
    await updateDocument<Media>('media', mediaId, { 
      customGroupId: groupId ?? undefined,
      customGroupName: groupName ?? undefined
    }, $activeUser);
  }

  async function renameGroup(groupId: string, newName: string): Promise<void> {
    // Update all media in this group
    const itemsInGroup = media.filter(m => m.customGroupId === groupId);
    for (const item of itemsInGroup) {
      if (item.id) {
        await updateDocument<Media>('media', item.id, { customGroupName: newName }, $activeUser);
      }
    }
    editingGroupId = null;
  }

  async function deleteGroup(groupId: string): Promise<void> {
    if (!confirm('Remove this group? Items will be ungrouped.')) return;
    
    const itemsInGroup = media.filter(m => m.customGroupId === groupId);
    for (const item of itemsInGroup) {
      if (item.id) {
        await updateDocument<Media>('media', item.id, { 
          customGroupId: undefined, 
          customGroupName: undefined 
        }, $activeUser);
      }
    }
  }

  function posterUrl(path: string | null): string | null {
    if (!path) return null;
    // Steam URLs are already complete, TMDB paths need base URL
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }
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

  function openDetail(item: Media): void {
    selectedMedia = item;
  }

  function closeDetail(): void {
    selectedMedia = null;
  }

  function toggleGenreFilter(genre: string): void {
    if (filterGenres.includes(genre)) {
      filterGenres = filterGenres.filter(g => g !== genre);
    } else {
      filterGenres = [...filterGenres, genre];
    }
  }

  function toggleStatusFilter(status: MediaStatus): void {
    if (filterStatus.includes(status)) {
      filterStatus = filterStatus.filter(s => s !== status);
    } else {
      filterStatus = [...filterStatus, status];
    }
  }

  function clearFilters(): void {
    filterGenres = [];
    filterStatus = [];
    sortField = searchQuery.trim() ? 'relevance' : 'dateAdded';
    sortDirection = 'desc';
    groupBy = 'none';
  }

  // Filter and sort logic with fuzzy matching
  let processedMedia = $derived.by(() => {
    let result = media;
    const query = searchQuery.trim();

    // Type filter (tabs)
    if (activeTab !== 'all') {
      result = result.filter(m => m.type === activeTab);
    }

    // Genre filter (OR logic - match any selected genre)
    if (filterGenres.length > 0) {
      result = result.filter(m => 
        m.genres?.some(g => filterGenres.includes(g)) ?? false
      );
    }

    // Status filter (OR logic)
    if (filterStatus.length > 0) {
      result = result.filter(m => filterStatus.includes(m.status));
    }

    // Fuzzy search filter (only if searching library)
    const shouldSearchLibrary = searchSource === 'saved' || searchSource === 'both';
    let scoredResults: { item: Media; score: number }[] = result.map(item => ({
      item,
      score: (query && shouldSearchLibrary)
        ? fuzzyScoreMulti(
            query,
            item.title,
            item.overview,
            item.collection?.name,
            ...(item.genres ?? []),
            ...(item.productionCompanies?.map(c => c.name) ?? [])
          )
        : 100
    }));

    // Filter by threshold if searching
    if (query && shouldSearchLibrary) {
      scoredResults = scoredResults.filter(r => r.score >= FUZZY_THRESHOLD);
    }

    // Sorting
    scoredResults.sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'relevance':
          comparison = a.score - b.score;
          break;
        case 'title':
          comparison = a.item.title.localeCompare(b.item.title);
          break;
        case 'rating': {
          const ratingA = getDisplayRating(a.item) ?? -1;
          const ratingB = getDisplayRating(b.item) ?? -1;
          comparison = ratingA - ratingB;
          break;
        }
        case 'dateAdded': {
          const dateA = a.item.createdAt?.toMillis() ?? 0;
          const dateB = b.item.createdAt?.toMillis() ?? 0;
          comparison = dateA - dateB;
          break;
        }
        case 'releaseYear': {
          const yearA = a.item.releaseDate ? parseInt(a.item.releaseDate.split('-')[0]) : 0;
          const yearB = b.item.releaseDate ? parseInt(b.item.releaseDate.split('-')[0]) : 0;
          comparison = yearA - yearB;
          break;
        }
        case 'watchDate': {
          const watchA = a.item.watchDate?.toMillis() ?? 0;
          const watchB = b.item.watchDate?.toMillis() ?? 0;
          comparison = watchA - watchB;
          break;
        }
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return scoredResults.map(r => r.item);
  });

  // Grouping logic
  interface MediaGroup {
    key: string;
    label: string;
    items: Media[];
  }

  let groupedMedia = $derived.by((): MediaGroup[] => {
    if (groupBy === 'none') {
      return [{ key: 'all', label: '', items: processedMedia }];
    }

    const groups = new Map<string, Media[]>();
    const ungrouped: Media[] = [];

    for (const item of processedMedia) {
      let groupKey: string | null = null;
      let groupLabel: string | null = null;

      switch (groupBy) {
        case 'collection':
          if (item.collection) {
            groupKey = `collection-${item.collection.id}`;
            groupLabel = item.collection.name;
          }
          break;
        case 'studio':
          if (item.productionCompanies?.[0]) {
            groupKey = `studio-${item.productionCompanies[0].id}`;
            groupLabel = item.productionCompanies[0].name;
          }
          break;
        case 'status':
          groupKey = `status-${item.status}`;
          groupLabel = item.status.charAt(0).toUpperCase() + item.status.slice(1);
          break;
        case 'custom':
          if (item.customGroupId && item.customGroupName) {
            groupKey = `custom-${item.customGroupId}`;
            groupLabel = item.customGroupName;
          }
          break;
      }

      if (groupKey && groupLabel) {
        if (!groups.has(groupKey)) {
          groups.set(groupKey, []);
        }
        groups.get(groupKey)!.push(item);
      } else {
        ungrouped.push(item);
      }
    }

    const result: MediaGroup[] = [];
    
    const sortedGroups = Array.from(groups.entries()).sort((a, b) => {
      const labelA = a[0];
      const labelB = b[0];
      return labelA.localeCompare(labelB);
    });

    for (const [key, items] of sortedGroups) {
      let label = key;
      if (key.startsWith('collection-')) {
        label = items[0]?.collection?.name ?? 'Unknown Collection';
      } else if (key.startsWith('studio-')) {
        label = items[0]?.productionCompanies?.[0]?.name ?? 'Unknown Studio';
      } else if (key.startsWith('status-')) {
        label = items[0]?.status ?? 'Unknown';
        label = label.charAt(0).toUpperCase() + label.slice(1);
      } else if (key.startsWith('custom-')) {
        label = items[0]?.customGroupName ?? 'Unknown Group';
      }
      result.push({ key, label, items });
    }

    if (ungrouped.length > 0) {
      result.push({ key: 'ungrouped', label: 'Ungrouped', items: ungrouped });
    }

    return result;
  });

  let hasActiveFilters = $derived(
    filterGenres.length > 0 || 
    filterStatus.length > 0 || 
    (sortField !== 'dateAdded' && sortField !== 'relevance') || 
    sortDirection !== 'desc' ||
    groupBy !== 'none'
  );

  let isSearching = $derived(searchQuery.trim().length > 0);
  let showDiscoverResults = $derived(searchSource === 'discover' || searchSource === 'both');
  let showSavedResults = $derived(searchSource === 'saved' || searchSource === 'both');
</script>

<MediaDetailModal media={selectedMedia} onClose={closeDetail} />

<!-- Custom Group Management Modal -->
{#if showCustomGroupModal}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    onclick={(e) => e.target === e.currentTarget && (showCustomGroupModal = false)}
    onkeydown={(e) => e.key === 'Escape' && (showCustomGroupModal = false)}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div class="bg-surface rounded-xl max-w-md w-full shadow-2xl">
      <div class="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
        <h2 class="text-lg font-semibold">Manage Custom Groups</h2>
        <button
          class="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500"
          onclick={() => showCustomGroupModal = false}
        >
          ×
        </button>
      </div>
      
      <div class="p-4 space-y-4">
        <!-- Create new group -->
        <div class="flex gap-2">
          <input
            type="text"
            bind:value={newGroupName}
            placeholder="New group name..."
            class="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:border-accent"
            onkeydown={(e) => e.key === 'Enter' && createCustomGroup()}
          />
          <button
            onclick={createCustomGroup}
            disabled={!newGroupName.trim()}
            class="px-4 py-2 bg-accent text-white rounded-lg font-medium disabled:opacity-50"
          >
            Add
          </button>
        </div>
        
        <!-- Existing groups -->
        <div class="space-y-2 max-h-64 overflow-y-auto">
          {#each customGroupsArray as [groupId, groupName] (groupId)}
            <div class="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
              {#if editingGroupId === groupId}
                <input
                  type="text"
                  value={groupName}
                  class="flex-1 px-2 py-1 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded"
                  onkeydown={(e) => {
                    if (e.key === 'Enter') renameGroup(groupId, e.currentTarget.value);
                    if (e.key === 'Escape') editingGroupId = null;
                  }}
                  onblur={(e) => renameGroup(groupId, e.currentTarget.value)}
                />
              {:else}
                <span class="flex-1">{groupName}</span>
                <span class="text-xs text-slate-400">
                  {groupItemCounts.get(groupId) ?? 0} items
                </span>
                <button
                  class="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  onclick={() => editingGroupId = groupId}
                  title="Rename"
                >
                  ✎
                </button>
                <button
                  class="p-1 text-slate-400 hover:text-red-500"
                  onclick={() => deleteGroup(groupId)}
                  title="Delete"
                >
                  ×
                </button>
              {/if}
            </div>
          {:else}
            <p class="text-center text-slate-400 py-4">No custom groups yet</p>
          {/each}
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Add Game Modal -->
{#if showAddGameModal}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    onclick={(e) => e.target === e.currentTarget && closeAddGameModal()}
    onkeydown={(e) => e.key === 'Escape' && closeAddGameModal()}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div class="bg-surface rounded-xl max-w-md w-full shadow-2xl">
      <div class="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
        <h2 class="text-lg font-semibold">Add Game</h2>
        <button
          class="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500"
          onclick={closeAddGameModal}
        >
          ×
        </button>
      </div>
      
      <div class="p-4 space-y-4">
        <!-- Steam Search -->
        <div>
          <label class="block text-sm font-medium mb-2">Search Steam</label>
          <div class="flex gap-2">
            <input
              type="text"
              bind:value={gameSearchQuery}
              placeholder="Search for a game..."
              class="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:border-accent"
              onkeydown={(e) => e.key === 'Enter' && searchSteamForModal(gameSearchQuery)}
            />
            <button
              onclick={() => searchSteamForModal(gameSearchQuery)}
              disabled={gameSearching || !gameSearchQuery.trim()}
              class="px-4 py-2 bg-accent text-white rounded-lg font-medium disabled:opacity-50"
            >
              {gameSearching ? '...' : 'Search'}
            </button>
          </div>
        </div>
        
        <!-- Steam Results -->
        {#if gameSearchResults.length > 0}
          <div class="max-h-48 overflow-y-auto space-y-2">
            {#each gameSearchResults as game (game.id)}
              <button
                class="w-full flex items-center gap-3 p-2 bg-slate-50 dark:bg-slate-800 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-left"
                onclick={() => addGameFromSteam(game)}
              >
                {#if game.tiny_image}
                  <img src={game.tiny_image} alt="" class="w-12 h-12 object-cover rounded" />
                {:else}
                  <div class="w-12 h-12 bg-surface-2 rounded flex items-center justify-center text-xl">🎮</div>
                {/if}
                <div class="flex-1 min-w-0">
                  <div class="font-medium truncate">{game.name}</div>
                  {#if game.metascore}
                    <div class="text-xs text-slate-400">Metascore: {game.metascore}</div>
                  {/if}
                </div>
              </button>
            {/each}
          </div>
        {:else if gameSearchQuery && !gameSearching}
          <p class="text-sm text-slate-500 dark:text-slate-400 text-center py-4">
            No results found. Try a different search or add manually below.
          </p>
        {/if}
        
        <!-- Manual Entry Divider -->
        <div class="relative">
          <div class="absolute inset-0 flex items-center">
            <div class="w-full border-t border-slate-200 dark:border-slate-700"></div>
          </div>
          <div class="relative flex justify-center text-xs">
            <span class="px-2 bg-surface text-slate-500 dark:text-slate-400">or add manually</span>
          </div>
        </div>
        
        <!-- Manual Entry -->
        <div class="flex gap-2">
          <input
            type="text"
            bind:value={manualGameTitle}
            placeholder="Enter game title..."
            class="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:border-accent"
            onkeydown={(e) => e.key === 'Enter' && addManualGame()}
          />
          <button
            onclick={addManualGame}
            disabled={!manualGameTitle.trim()}
            class="px-4 py-2 bg-slate-600 text-white rounded-lg font-medium disabled:opacity-50 hover:bg-slate-700 transition-colors"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<div>
  <h1 class="text-2xl font-bold mb-6">Media</h1>

  <!-- Search Bar with Source Toggle -->
  <div class="flex flex-col gap-2 mb-4">
    <div class="flex gap-2 flex-1">
      <div class="flex-1 relative">
        <input
          bind:this={searchInputRef}
          type="text"
          placeholder={searchSource === 'discover' ? 'Discover new titles...' : searchSource === 'saved' ? 'Search your collection...' : 'Search collection & discover...'}
          class="w-full px-4 py-3 bg-surface border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:border-accent pr-10"
          bind:value={searchQuery}
          onfocus={handleSearchFocus}
          onblur={handleSearchBlur}
          onkeydown={handleSearchKeydown}
        />
        
        {#if searchQuery}
          <button
            class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            onclick={clearSearch}
            title="Clear search"
          >
            ×
          </button>
        {/if}
        
        {#if searching}
          <div class="absolute right-10 top-1/2 -translate-y-1/2">
            <div class="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
          </div>
        {/if}
        
        <!-- Search History Dropdown - positioned below search, above filter panel -->
        {#if showSearchHistory && $mediaSearchHistory.length > 0}
          <div class="absolute top-full left-0 right-0 mt-1 bg-surface border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-40 overflow-hidden">
            <div class="px-3 py-2 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
              Recent searches
            </div>
            {#each $mediaSearchHistory as historyItem}
              <div class="flex items-center hover:bg-slate-50 dark:hover:bg-slate-800">
                <button
                  type="button"
                  class="flex-1 px-3 py-2 text-left text-sm"
                  onmousedown={() => selectFromHistory(historyItem)}
                >
                  {historyItem}
                </button>
                <button
                  type="button"
                  class="px-3 py-2 text-slate-400 hover:text-red-500"
                  onmousedown={() => removeFromSearchHistory(historyItem)}
                >
                  ×
                </button>
              </div>
            {/each}
          </div>
        {/if}
      </div>
      {#if activeTab === 'game'}
        <button
          class="px-4 py-3 bg-surface-2 text-slate-900 dark:text-slate-100 rounded-lg font-medium"
          onclick={openAddGameModal}
        >
          + Add Game
        </button>
      {/if}
    </div>
    
    <!-- Search Source Toggle -->
    <div class="flex items-center gap-2">
      <span class="text-xs text-slate-500 dark:text-slate-400">Search:</span>
      <div class="flex rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600">
        <button
          class="px-3 py-1 text-xs font-medium transition-colors {searchSource === 'saved' ? 'bg-accent text-white' : 'bg-surface text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}"
          onclick={() => searchSource = 'saved'}
        >
          Saved
        </button>
        <button
          class="px-3 py-1 text-xs font-medium transition-colors border-x border-slate-200 dark:border-slate-600 {searchSource === 'both' ? 'bg-accent text-white' : 'bg-surface text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}"
          onclick={() => searchSource = 'both'}
        >
          Both
        </button>
        <button
          class="px-3 py-1 text-xs font-medium transition-colors {searchSource === 'discover' ? 'bg-accent text-white' : 'bg-surface text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}"
          onclick={() => searchSource = 'discover'}
        >
          Discover
        </button>
      </div>
    </div>
  </div>

  <!-- Discover Search Results (new titles to add) -->
  {#if searchResults.length > 0 && showDiscoverResults}
    <div class="mb-4">
      <div class="text-xs text-slate-500 dark:text-slate-400 mb-2">
        {activeTab === 'game' ? 'Add from Steam:' : 'Add from TMDB:'}
      </div>
      <div class="flex gap-3 overflow-x-auto py-2">
        {#each searchResults as result}
          <button
            class="shrink-0 w-24 p-0 bg-surface border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden text-center cursor-pointer hover:border-accent disabled:opacity-50 disabled:cursor-wait"
            onclick={() => addFromSearch(result)}
            disabled={adding}
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
          class="w-full py-2 text-sm text-slate-500 dark:text-slate-400 hover:text-accent transition-colors"
          onclick={showMoreResults}
        >
          View More ({allSearchResults.length - visibleResultCount} remaining)
        </button>
      {/if}
    </div>
  {/if}

  <!-- Tabs -->
  <div class="flex items-center gap-4 mb-4">
    <div class="flex rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600">
      {#each tabs as tab, i}
        <button
          class="px-3 py-1.5 text-sm font-medium capitalize transition-colors {activeTab === tab ? 'bg-accent text-white' : 'bg-surface text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'} {i > 0 ? 'border-l border-slate-200 dark:border-slate-600' : ''}"
          onclick={() => (activeTab = tab)}
        >
          {tab === 'tv' ? 'TV' : tab}
        </button>
      {/each}
    </div>
    
    <div class="flex-1"></div>
    
    <!-- Custom Groups Button -->
    {#if groupBy === 'custom'}
      <button
        class="px-4 py-2 rounded-lg font-medium transition-colors bg-surface text-slate-600 dark:text-slate-300 hover:bg-surface-2"
        onclick={() => showCustomGroupModal = true}
      >
        Manage Groups
      </button>
    {/if}
    
    <!-- Filter Toggle -->
    <button
      class="px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
      class:bg-accent={showFilters}
      class:text-white={showFilters}
      class:bg-surface={!showFilters}
      class:text-slate-400={!showFilters}
      onclick={() => showFilters = !showFilters}
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
      </svg>
      Filter
      {#if hasActiveFilters}
        <span class="w-2 h-2 rounded-full bg-amber-400"></span>
      {/if}
    </button>
  </div>

  <!-- Filter Panel -->
  {#if showFilters}
    <div class="mb-6 p-4 bg-surface border border-slate-200 dark:border-slate-700 rounded-xl space-y-4 relative z-10">
      <!-- Sort Row -->
      <div class="flex flex-wrap gap-4 items-center">
        <div class="flex items-center gap-2">
          <span class="text-sm text-slate-500 dark:text-slate-400">Sort by:</span>
          <select
            bind:value={sortField}
            class="px-3 py-1.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg"
          >
            {#each sortOptions as opt}
              <option value={opt.value} disabled={opt.value === 'relevance' && !isSearching}>
                {opt.label}{opt.value === 'relevance' && !isSearching ? ' (search first)' : ''}
              </option>
            {/each}
          </select>
          <button
            class="px-2 py-1.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg"
            onclick={() => sortDirection = sortDirection === 'asc' ? 'desc' : 'asc'}
            title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
          >
            {sortDirection === 'asc' ? '↑' : '↓'}
          </button>
        </div>

        <div class="flex items-center gap-2">
          <span class="text-sm text-slate-500 dark:text-slate-400">Group by:</span>
          <select
            bind:value={groupBy}
            class="px-3 py-1.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg"
          >
            {#each groupOptions as opt}
              <option value={opt.value}>{opt.label}</option>
            {/each}
          </select>
        </div>

        {#if hasActiveFilters}
          <button
            class="ml-auto px-3 py-1.5 text-sm text-slate-500 hover:text-red-500 transition-colors"
            onclick={clearFilters}
          >
            Clear All
          </button>
        {/if}
      </div>

      <!-- Status Filter -->
      <div>
        <span class="block text-xs text-slate-500 dark:text-slate-400 mb-2">Status</span>
        <div class="flex flex-wrap gap-2">
          {#each statusOptions as status}
            <button
              class="px-3 py-1 text-sm rounded-full border transition-colors"
              class:bg-accent={filterStatus.includes(status)}
              class:text-white={filterStatus.includes(status)}
              class:border-accent={filterStatus.includes(status)}
              class:border-slate-200={!filterStatus.includes(status)}
              class:dark:border-slate-600={!filterStatus.includes(status)}
              onclick={() => toggleStatusFilter(status)}
            >
              {status}
            </button>
          {/each}
        </div>
      </div>

      <!-- Genre Filter -->
      {#if availableGenres.length > 0}
        <div>
          <span class="block text-xs text-slate-500 dark:text-slate-400 mb-2">Genres</span>
          <div class="flex flex-wrap gap-2">
            {#each availableGenres as genre}
              <button
                class="px-3 py-1 text-sm rounded-full border transition-colors"
                class:bg-accent={filterGenres.includes(genre)}
                class:text-white={filterGenres.includes(genre)}
                class:border-accent={filterGenres.includes(genre)}
                class:border-slate-200={!filterGenres.includes(genre)}
                class:dark:border-slate-600={!filterGenres.includes(genre)}
                onclick={() => toggleGenreFilter(genre)}
              >
                {genre}
              </button>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Results Count -->
  {#if showSavedResults}
    <div class="text-sm text-slate-500 dark:text-slate-400 mb-4">
      {processedMedia.length} item{processedMedia.length !== 1 ? 's' : ''}
      {#if isSearching}
        <span class="text-xs">matching "{searchQuery}"</span>
      {/if}
      {#if hasActiveFilters}
        <span class="text-xs">(filtered)</span>
      {/if}
    </div>

    <!-- Media Grid (Grouped) -->
    {#each groupedMedia as group (group.key)}
      {#if group.label}
        <div class="mb-2 mt-6 first:mt-0 flex items-center justify-between">
          <h2 class="text-lg font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
            {group.label}
            <span class="text-sm font-normal text-slate-400">({group.items.length})</span>
          </h2>
        </div>
      {/if}
      
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-6">
        {#each group.items as item (item.id)}
          <article
            class="bg-surface border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden group relative"
          >
            <button
              class="absolute top-2 right-2 z-20 w-6 h-6 rounded-full bg-slate-900/50 text-white text-sm flex items-center justify-center transition-all hover:bg-red-500 active:bg-red-600 md:opacity-0 md:group-hover:opacity-100"
              onclick={(e) => { e.stopPropagation(); item.id && remove(item.id); }}
              title="Remove"
            >
              ×
            </button>
            
            <div
              class="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide {getStatusBadgeClass(item.status)}"
            >
              {getStatusLabel(item.status)}
            </div>
            
            <!-- Custom group assignment dropdown -->
            {#if groupBy === 'custom'}
              <select
                class="absolute top-10 left-2 z-10 text-[10px] bg-slate-900/70 text-white rounded px-1 py-0.5 max-w-[calc(100%-16px)]"
                value={item.customGroupId ?? ''}
                onchange={(e) => {
                  const groupId = e.currentTarget.value || null;
                  const groupName = groupId ? customGroups.get(groupId) ?? null : null;
                  if (item.id) assignToGroup(item.id, groupId, groupName);
                }}
                onclick={(e) => e.stopPropagation()}
              >
                <option value="">No group</option>
                {#each customGroupsArray as [gId, gName] (gId)}
                  <option value={gId}>{gName}</option>
                {/each}
              </select>
            {/if}
            
            <button
              class="w-full text-left cursor-pointer"
              onclick={() => openDetail(item)}
              title="View details"
            >
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
            </button>
            
            <div class="p-3">
              <h3 class="text-sm font-semibold mb-1 truncate" class:line-through={item.status === 'dropped'}>{item.title}</h3>
              <span class="text-[10px] uppercase text-slate-400">{item.type}</span>
              
              <div class="flex items-center gap-0.5 mt-2">
                {#each [1, 2, 3, 4, 5] as star}
                  {@const displayRating = getDisplayRating(item)}
                  {@const userRating = item.ratings?.[($activeUser as UserId)] ?? null}
                  <button
                    class="text-sm transition-colors {(displayRating ?? 0) >= star ? 'text-amber-400' : 'text-slate-300 dark:text-slate-600 hover:text-amber-300'}"
                    onclick={() => item.id && updateRating(item.id, $activeUser, userRating === star ? null : star)}
                    title={userRating === star ? 'Clear your rating' : `Rate ${star} star${star > 1 ? 's' : ''}`}
                  >
                    ★
                  </button>
                {/each}
              </div>
              
              <select
                value={item.status}
                onchange={(e) => item.id && updateStatus(item.id, e.currentTarget.value)}
                class="w-full mt-2 p-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded"
              >
                {#each statusOptions as status}
                  <option value={status}>{status}</option>
                {/each}
              </select>
            </div>
          </article>
        {:else}
          <p class="col-span-full text-center text-slate-500 dark:text-slate-400 py-12">
            {#if isSearching}
              No matches found for "{searchQuery}"
            {:else}
              Nothing here yet. Search for something to track!
            {/if}
          </p>
        {/each}
      </div>
    {/each}
  {/if}
</div>

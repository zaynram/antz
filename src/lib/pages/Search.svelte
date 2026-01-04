<script lang="ts">
  import { subscribeToCollection } from '$lib/firebase'
  import { activeUser, displayNames, currentPreferences } from '$lib/stores/app'
  import type { Media, Note, Place } from '$lib/types'
  import { getDisplayRating } from '$lib/types'
  import { onMount } from 'svelte'
  import { parseQuery, matchesQuery, hasSearchCriteria, getFilterSummary, type SearchableItem } from '$lib/queryParser'
  import { tmdbConfig } from '$lib/config'
  import { Film, Tv, Gamepad2, StickyNote, MapPin, Search as SearchIcon, Sparkles, X } from 'lucide-svelte'

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
  let searchInput = $state<HTMLInputElement | null>(null)

  // Subscriptions
  let unsubMedia: (() => void) | undefined
  let unsubNotes: (() => void) | undefined
  let unsubPlaces: (() => void) | undefined

  onMount(() => {
    unsubMedia = subscribeToCollection<Media>('media', (items) => { media = items })
    unsubNotes = subscribeToCollection<Note>('notes', (items) => { notes = items })
    unsubPlaces = subscribeToCollection<Place>('places', (items) => { places = items })

    // Focus search input on mount
    searchInput?.focus()

    return () => {
      unsubMedia?.()
      unsubNotes?.()
      unsubPlaces?.()
    }
  })

  // Parse query
  let parsedQuery = $derived(parseQuery(searchQuery))
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

  // Search results
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

    // Sort by score descending
    return allItems.sort((a, b) => b.score - a.score)
  })

  // Group results by type for display
  let groupedResults = $derived.by(() => {
    const groups: Record<string, typeof results> = {}
    for (const r of results) {
      const type = r.item.type
      if (!groups[type]) groups[type] = []
      groups[type].push(r)
    }
    return groups
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

  // Quick filter buttons
  const quickFilters = [
    { label: 'Movies', query: '@movie' },
    { label: 'TV Shows', query: '@tv' },
    { label: 'Games', query: '@game' },
    { label: 'Notes', query: '@note' },
    { label: 'Places', query: '@place' },
  ]

  function applyQuickFilter(query: string) {
    searchQuery = query + ' '
    searchInput?.focus()
  }

  // Example searches for empty state
  const exampleSearches = [
    { query: '@movie rating>4', desc: 'Highly rated movies' },
    { query: '@tv status:watching', desc: 'TV shows in progress' },
    { query: '"star wars"', desc: 'Exact phrase search' },
    { query: '@place visited:no', desc: 'Places to visit' },
    { query: 'horror OR thriller', desc: 'Horror or thriller' },
    { query: '@game by:Z', desc: 'Games added by Z' },
  ]
</script>

<div class="max-w-4xl mx-auto">
  <!-- Welcome message -->
  <section class="text-center mb-8">
    <h1 class="text-2xl font-bold mb-1">Welcome back, {$currentPreferences.name}</h1>
    <p class="text-slate-500 dark:text-slate-400 text-sm">Search your shared collection</p>
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
        class="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1"
        onclick={clearSearch}
      >
        <X size={20} />
      </button>
    {/if}
  </div>

  <!-- Quick filters -->
  <div class="flex flex-wrap gap-2 mb-6 justify-center">
    {#each quickFilters as filter}
      <button
        type="button"
        class="px-3 py-1.5 text-sm rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-accent hover:text-white transition-colors"
        onclick={() => applyQuickFilter(filter.query)}
      >
        {filter.label}
      </button>
    {/each}
  </div>

  <!-- Active filters display -->
  {#if filterSummary.length > 0}
    <div class="flex flex-wrap gap-2 mb-4 text-sm">
      {#each filterSummary as filter}
        <span class="px-2 py-1 bg-accent/10 text-accent rounded">{filter}</span>
      {/each}
    </div>
  {/if}

  <!-- Results or empty state -->
  {#if hasQuery}
    {#if results.length > 0}
      <!-- Results count -->
      <p class="text-sm text-slate-500 dark:text-slate-400 mb-4">
        {results.length} result{results.length === 1 ? '' : 's'}
      </p>

      <!-- Results list -->
      <div class="space-y-3">
        {#each results as { item, original } (item.id)}
          {#if item.type === 'movie' || item.type === 'tv' || item.type === 'game'}
            {@const m = original as Media}
            <button
              type="button"
              class="w-full flex items-start gap-4 p-4 bg-surface border border-slate-200 dark:border-slate-700 rounded-xl hover:border-accent transition-colors text-left"
              onclick={() => navigate('/media')}
            >
              <!-- Poster -->
              <div class="shrink-0 w-16 h-24 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden">
                {#if m.posterPath}
                  <img src={posterUrl(m.posterPath)} alt={m.title} class="w-full h-full object-cover" />
                {:else}
                  <div class="w-full h-full flex items-center justify-center text-slate-300">
                    {#if item.type === 'game'}
                      <Gamepad2 size={24} />
                    {:else if item.type === 'tv'}
                      <Tv size={24} />
                    {:else}
                      <Film size={24} />
                    {/if}
                  </div>
                {/if}
              </div>

              <!-- Info -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-slate-400">
                    {#if item.type === 'game'}
                      <Gamepad2 size={14} />
                    {:else if item.type === 'tv'}
                      <Tv size={14} />
                    {:else}
                      <Film size={14} />
                    {/if}
                  </span>
                  <span class="text-xs text-slate-400 uppercase">{item.type}</span>
                </div>
                <h3 class="font-medium truncate">{m.title}</h3>
                {#if m.releaseDate}
                  <p class="text-sm text-slate-500 dark:text-slate-400">{m.releaseDate.split('-')[0]}</p>
                {/if}
                {#if item.rating}
                  <div class="flex items-center gap-0.5 mt-1">
                    {#each [1, 2, 3, 4, 5] as star}
                      <span class={item.rating >= star ? 'text-amber-400' : 'text-slate-200 dark:text-slate-700'}>★</span>
                    {/each}
                  </div>
                {/if}
              </div>

              <!-- Status badge -->
              <div class="shrink-0">
                <span class="text-xs px-2 py-1 rounded-full {m.status === 'completed' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : m.status === 'watching' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}">
                  {m.status}
                </span>
              </div>
            </button>
          {:else if item.type === 'note'}
            {@const n = original as Note}
            <button
              type="button"
              class="w-full flex items-start gap-4 p-4 bg-surface border border-slate-200 dark:border-slate-700 rounded-xl hover:border-accent transition-colors text-left"
              onclick={() => navigate('/notes')}
            >
              <div class="shrink-0 w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent">
                <StickyNote size={20} />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-xs text-slate-400 uppercase">Note</span>
                  {#if !n.read && n.createdBy !== $activeUser}
                    <span class="text-xs px-1.5 py-0.5 bg-accent text-white rounded">Unread</span>
                  {/if}
                </div>
                <h3 class="font-medium truncate">{n.title || '(No subject)'}</h3>
                {#if n.content}
                  <p class="text-sm text-slate-500 dark:text-slate-400 truncate">{n.content}</p>
                {/if}
                <p class="text-xs text-slate-400 mt-1">From {$displayNames[n.createdBy]}</p>
              </div>
            </button>
          {:else if item.type === 'place'}
            {@const p = original as Place}
            <button
              type="button"
              class="w-full flex items-start gap-4 p-4 bg-surface border border-slate-200 dark:border-slate-700 rounded-xl hover:border-accent transition-colors text-left"
              onclick={() => navigate('/places')}
            >
              <div class="shrink-0 w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent">
                <MapPin size={20} />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-xs text-slate-400 uppercase">Place</span>
                  <span class="text-xs px-1.5 py-0.5 rounded {p.visited ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}">
                    {p.visited ? 'Visited' : 'To visit'}
                  </span>
                </div>
                <h3 class="font-medium truncate">{p.name}</h3>
                {#if p.location?.address}
                  <p class="text-sm text-slate-500 dark:text-slate-400 truncate">{p.location.address}</p>
                {/if}
                <p class="text-xs text-slate-400 mt-1 capitalize">{p.category}</p>
              </div>
            </button>
          {/if}
        {/each}
      </div>
    {:else}
      <!-- No results -->
      <div class="text-center py-12">
        <div class="text-slate-300 dark:text-slate-600 mb-4 flex justify-center">
          <SearchIcon size={48} />
        </div>
        <p class="text-slate-500 dark:text-slate-400 mb-2">No results found</p>
        <p class="text-sm text-slate-400">Try different keywords or filters</p>
      </div>
    {/if}
  {:else}
    <!-- Empty state with tips -->
    <div class="text-center py-8">
      <div class="text-accent/20 mb-6 flex justify-center">
        <Sparkles size={64} />
      </div>

      <div class="max-w-md mx-auto">
        <h2 class="font-semibold mb-4 text-slate-700 dark:text-slate-300">Search Tips</h2>

        <div class="text-left space-y-3 mb-8">
          <div class="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
            <p class="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Type filters</p>
            <p class="text-xs text-slate-500 dark:text-slate-400">Use <code class="bg-slate-200 dark:bg-slate-700 px-1 rounded">@movie</code> <code class="bg-slate-200 dark:bg-slate-700 px-1 rounded">@tv</code> <code class="bg-slate-200 dark:bg-slate-700 px-1 rounded">@game</code> <code class="bg-slate-200 dark:bg-slate-700 px-1 rounded">@note</code> <code class="bg-slate-200 dark:bg-slate-700 px-1 rounded">@place</code></p>
          </div>

          <div class="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
            <p class="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Exact phrases</p>
            <p class="text-xs text-slate-500 dark:text-slate-400">Use quotes: <code class="bg-slate-200 dark:bg-slate-700 px-1 rounded">"star wars"</code></p>
          </div>

          <div class="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
            <p class="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Operators</p>
            <p class="text-xs text-slate-500 dark:text-slate-400">Use <code class="bg-slate-200 dark:bg-slate-700 px-1 rounded">OR</code> for alternatives, <code class="bg-slate-200 dark:bg-slate-700 px-1 rounded">-word</code> to exclude</p>
          </div>

          <div class="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
            <p class="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Filters</p>
            <p class="text-xs text-slate-500 dark:text-slate-400"><code class="bg-slate-200 dark:bg-slate-700 px-1 rounded">rating>4</code> <code class="bg-slate-200 dark:bg-slate-700 px-1 rounded">year:2024</code> <code class="bg-slate-200 dark:bg-slate-700 px-1 rounded">status:completed</code> <code class="bg-slate-200 dark:bg-slate-700 px-1 rounded">by:Z</code></p>
          </div>
        </div>

        <h3 class="font-medium mb-3 text-slate-600 dark:text-slate-400 text-sm">Try these</h3>
        <div class="flex flex-wrap gap-2 justify-center">
          {#each exampleSearches as example}
            <button
              type="button"
              class="px-3 py-1.5 text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full hover:bg-accent hover:text-white transition-colors"
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

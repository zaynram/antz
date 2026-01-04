<script lang="ts">
  import { addDocument, deleteDocument, subscribeToCollection, updateDocument } from '$lib/firebase'
  import { activeUser, currentPreferences, displayNames } from '$lib/stores/app'
  import type { Place, PlaceCategory, GeoLocation, UserId } from '$lib/types'
  import { getPlaceDisplayRating, calculateDistance, formatDistance } from '$lib/types'
  import { toast } from 'svelte-sonner'
  import { Timestamp } from 'firebase/firestore'
  import { onMount } from 'svelte'
  import PlaceSuggestions from '$lib/components/PlaceSuggestions.svelte'
  import LocationPicker from '$lib/components/LocationPicker.svelte'
  import PlaceDetailModal from '$lib/components/PlaceDetailModal.svelte'
  import PageHeader from '$lib/components/ui/PageHeader.svelte'
  import IconButton from '$lib/components/ui/IconButton.svelte'
  import EmptyState from '$lib/components/ui/EmptyState.svelte'
  import Tabs from '$lib/components/ui/Tabs.svelte'
  import type { PlaceSuggestion } from '$lib/services/location'
  import { UtensilsCrossed, Coffee, Wine, Sparkles, Trees, MapPin, Check, X, Plus, Filter } from 'lucide-svelte'
  import type { ComponentType } from 'svelte'
  import { hapticSuccess, hapticLight } from '$lib/haptics'

  const categoryIcons: Record<PlaceCategory, ComponentType> = {
    restaurant: UtensilsCrossed,
    cafe: Coffee,
    bar: Wine,
    attraction: Sparkles,
    park: Trees,
    other: MapPin
  }

  const categoryLabels: Record<PlaceCategory, string> = {
    restaurant: 'Restaurant',
    cafe: 'Cafe',
    bar: 'Bar',
    attraction: 'Attraction',
    park: 'Park',
    other: 'Other'
  }

  let places = $state<Place[]>([])
  let unsubscribe: (() => void) | undefined
  let showForm = $state(false)
  let showFilters = $state(false)
  let selectedPlace = $state<Place | null>(null)
  let newPlace = $state({ name: '', category: 'restaurant' as PlaceCategory, notes: '', location: undefined as GeoLocation | undefined })

  type TabKey = 'all' | 'to-visit' | 'visited'
  let activeTab = $state<TabKey>('all')

  // Filter state
  let filterCategory = $state<PlaceCategory | 'all'>('all')
  let filterAddedBy = $state<UserId | 'all'>('all')
  let sortField = $state<'name' | 'distance' | 'rating' | 'visits'>('distance')
  let sortDirection = $state<'asc' | 'desc'>('asc')

  const categories: PlaceCategory[] = ['restaurant', 'cafe', 'bar', 'attraction', 'park', 'other']

  const sortOptions: Array<{ field: typeof sortField; label: string }> = [
    { field: 'distance', label: 'Distance' },
    { field: 'name', label: 'Name' },
    { field: 'rating', label: 'Rating' },
    { field: 'visits', label: 'Visits' }
  ]

  // Force repaint for iOS Safari PWA
  function forceRepaint() {
    requestAnimationFrame(() => {
      document.body.style.transform = 'translateZ(0)'
      requestAnimationFrame(() => {
        document.body.style.transform = ''
      })
    })
  }

  onMount(() => {
    unsubscribe = subscribeToCollection<Place>('places', (items) => {
      places = items
      // Keep selected place in sync
      if (selectedPlace) {
        const updated = items.find(p => p.id === selectedPlace!.id)
        if (updated) selectedPlace = updated
      }
    })

    return () => unsubscribe?.()
  })

  async function addPlace(): Promise<void> {
    if (!newPlace.name.trim()) return

    try {
      await addDocument<Place>(
        'places',
        {
          name: newPlace.name,
          category: newPlace.category,
          notes: newPlace.notes,
          visited: false,
          visitDates: [],
          rating: null,
          location: newPlace.location
        },
        $activeUser
      )
      hapticSuccess()
      toast.success(`Added "${newPlace.name}"`)
      newPlace = { name: '', category: 'restaurant', notes: '', location: undefined }
      showForm = false
    } catch (e) {
      console.error('Failed to add place:', e)
      toast.error('Failed to add place')
    }
  }

  async function addFromSuggestion(suggestion: PlaceSuggestion): Promise<void> {
    try {
      await addDocument<Place>(
        'places',
        {
          name: suggestion.name,
          category: suggestion.category,
          notes: '',
          visited: false,
          visitDates: [],
          rating: null,
          location: {
            lat: suggestion.coordinates.lat,
            lng: suggestion.coordinates.lng,
            address: suggestion.address
          }
        },
        $activeUser
      )
      hapticSuccess()
      toast.success(`Added "${suggestion.name}"`)
    } catch (e) {
      console.error('Failed to add place:', e)
      toast.error('Failed to add place')
    }
  }

  async function toggleVisited(place: Place): Promise<void> {
    if (!place.id) return
    hapticLight()
    const now = Timestamp.now()
    const visitDates = place.visited ? place.visitDates : [...(place.visitDates || []), now]

    await updateDocument<Place>(
      'places',
      place.id,
      {
        visited: !place.visited,
        visitDates
      },
      $activeUser
    )
  }

  async function remove(id: string): Promise<void> {
    if (confirm('Remove this place?')) {
      try {
        await deleteDocument('places', id)
        toast.success('Place removed')
      } catch (e) {
        console.error('Failed to remove:', e)
        toast.error('Failed to remove place')
      }
    }
  }

  function getDistanceFromReference(place: Place): number | null {
    if (!place.location) return null

    const ref = $currentPreferences.referenceLocation || $currentPreferences.currentLocation
    if (!ref) return null

    return calculateDistance(ref, place.location)
  }

  // Pre-compute distance cache to avoid recalculating during sort and render
  let distanceCache = $derived.by(() => {
    const map = new Map<string, number | null>()
    for (const place of places) {
      if (place.id) {
        map.set(place.id, getDistanceFromReference(place))
      }
    }
    return map
  })

  function getDisplayNameForUser(userId: UserId): string {
    return $displayNames[userId]
  }

  function toggleFilters() {
    showFilters = !showFilters
    forceRepaint()
  }

  function toggleForm() {
    showForm = !showForm
    if (!showForm) {
      newPlace = { name: '', category: 'restaurant', notes: '', location: undefined }
    }
    forceRepaint()
  }

  function toggleSort(field: typeof sortField) {
    if (sortField === field) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc'
    } else {
      sortField = field
      sortDirection = field === 'rating' || field === 'visits' ? 'desc' : 'asc'
    }
  }

  function clearFilters() {
    filterCategory = 'all'
    filterAddedBy = 'all'
    sortField = 'distance'
    sortDirection = 'asc'
  }

  // Count active filters
  let activeFilterCount = $derived(
    (filterCategory !== 'all' ? 1 : 0) +
    (filterAddedBy !== 'all' ? 1 : 0)
  )

  // Count tabs
  let toVisitCount = $derived(places.filter(p => !p.visited).length)
  let visitedCount = $derived(places.filter(p => p.visited).length)

  let tabsWithBadges = $derived([
    { key: 'all' as TabKey, label: 'All' },
    { key: 'to-visit' as TabKey, label: 'To Visit', badge: toVisitCount },
    { key: 'visited' as TabKey, label: 'Visited', badge: visitedCount }
  ])

  let filteredPlaces = $derived.by(() => {
    let result = places

    // Tab filter
    if (activeTab === 'visited') result = result.filter(p => p.visited)
    else if (activeTab === 'to-visit') result = result.filter(p => !p.visited)

    // Category filter
    if (filterCategory !== 'all') {
      result = result.filter(p => p.category === filterCategory)
    }

    // Added by filter
    if (filterAddedBy !== 'all') {
      result = result.filter(p => p.createdBy === filterAddedBy)
    }

    // Sort
    result = [...result].sort((a, b) => {
      let cmp = 0

      switch (sortField) {
        case 'name':
          cmp = a.name.localeCompare(b.name)
          break
        case 'distance':
          const distA = a.id ? distanceCache.get(a.id) ?? null : null
          const distB = b.id ? distanceCache.get(b.id) ?? null : null
          if (distA !== null && distB !== null) cmp = distA - distB
          else if (distA !== null) cmp = -1
          else if (distB !== null) cmp = 1
          break
        case 'rating':
          const ratingA = getPlaceDisplayRating(a) ?? 0
          const ratingB = getPlaceDisplayRating(b) ?? 0
          cmp = ratingA - ratingB
          break
        case 'visits':
          cmp = (a.visitDates?.length || 0) - (b.visitDates?.length || 0)
          break
      }

      return sortDirection === 'asc' ? cmp : -cmp
    })

    return result
  })
</script>

<PlaceDetailModal place={selectedPlace} onClose={() => selectedPlace = null} />

<div class="max-w-4xl mx-auto">
  <PageHeader
    title="Places"
    icon={MapPin}
    subtitle="{places.length} place{places.length === 1 ? '' : 's'}"
  />

  <!-- Action Bar -->
  <div class="flex items-center justify-between gap-2 mb-4">
    <button
      type="button"
      class="btn-primary"
      onclick={toggleForm}
    >
      {#if showForm}
        <X size={18} />
        <span>Cancel</span>
      {:else}
        <Plus size={18} />
        <span>Add Place</span>
      {/if}
    </button>

    <div class="flex items-center gap-1">
      <IconButton
        icon={Filter}
        label="Filters"
        active={showFilters}
        badge={activeFilterCount > 0 ? activeFilterCount : undefined}
        onclick={toggleFilters}
      />
    </div>
  </div>

  <!-- Add form -->
  {#if showForm}
    <form
      class="card p-4 mb-6 space-y-3"
      style="transform: translateZ(0)"
      onsubmit={(e) => { e.preventDefault(); addPlace(); }}
    >
      <input
        type="text"
        placeholder="Place name"
        class="input"
        bind:value={newPlace.name}
      />

      <div class="grid grid-cols-2 gap-3">
        <select
          class="input"
          bind:value={newPlace.category}
        >
          {#each categories as cat}
            <option value={cat}>{categoryLabels[cat]}</option>
          {/each}
        </select>

        <LocationPicker
          value={newPlace.location}
          onChange={(loc) => newPlace.location = loc}
          placeholder="Location..."
        />
      </div>

      <textarea
        placeholder="Notes (optional)"
        rows="2"
        class="input resize-y"
        bind:value={newPlace.notes}
      ></textarea>

      <div class="flex justify-end">
        <button type="submit" class="btn-primary">
          <Plus size={18} />
          <span>Add Place</span>
        </button>
      </div>
    </form>
  {/if}

  <!-- Place Suggestions -->
  <PlaceSuggestions onAddPlace={addFromSuggestion} />

  <!-- Filters panel -->
  {#if showFilters}
    <div class="card p-4 mb-4 space-y-4" style="transform: translateZ(0)">
      <div class="flex flex-wrap gap-4">
        <div class="flex-1 min-w-[140px]">
          <label class="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">Category</label>
          <select bind:value={filterCategory} class="input-sm">
            <option value="all">All Categories</option>
            {#each categories as cat}
              <option value={cat}>{categoryLabels[cat]}</option>
            {/each}
          </select>
        </div>

        <div class="flex-1 min-w-[120px]">
          <label class="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">Added By</label>
          <select bind:value={filterAddedBy} class="input-sm">
            <option value="all">Anyone</option>
            <option value="Z">{$displayNames.Z}</option>
            <option value="T">{$displayNames.T}</option>
          </select>
        </div>

        <div class="flex-1 min-w-[180px]">
          <label class="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">Sort</label>
          <div class="flex gap-1 flex-wrap">
            {#each sortOptions as opt}
              <button
                type="button"
                class="px-3 py-2 text-xs rounded-lg transition-colors touch-manipulation min-h-[44px] {sortField === opt.field
                  ? 'bg-accent text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}"
                onclick={() => toggleSort(opt.field)}
              >
                {opt.label}
                {#if sortField === opt.field}
                  <span class="ml-0.5">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                {/if}
              </button>
            {/each}
          </div>
        </div>
      </div>

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

  <!-- Tabs -->
  <Tabs tabs={tabsWithBadges} active={activeTab} onchange={(t) => activeTab = t} />

  <!-- Places list -->
  <div class="flex flex-col gap-3">
    {#each filteredPlaces as place (place.id)}
      {@const distance = place.id ? distanceCache.get(place.id) ?? null : null}
      {@const Icon = categoryIcons[place.category]}
      {@const rating = getPlaceDisplayRating(place)}
      <article
        class="group card p-4 transition-all cursor-pointer hover:border-accent"
        class:opacity-70={place.visited}
        onclick={() => selectedPlace = place}
        role="button"
        tabindex="0"
        onkeydown={(e) => e.key === 'Enter' && (selectedPlace = place)}
      >
        <div class="flex items-start gap-4">
          <!-- Icon -->
          <div class="shrink-0 w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
            <Icon size={24} />
          </div>

          <!-- Content -->
          <div class="flex-1 min-w-0">
            <div class="flex items-start justify-between gap-2">
              <h3 class="font-medium" class:line-through={place.visited}>{place.name}</h3>
              {#if rating}
                <div class="shrink-0 flex items-center gap-0.5 text-amber-400">
                  <span>★</span>
                  <span class="text-sm font-medium">{rating.toFixed(1)}</span>
                </div>
              {/if}
            </div>

            <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mt-1">
              <span class="capitalize">{categoryLabels[place.category]}</span>
              {#if distance !== null}
                <span>·</span>
                <span class="flex items-center gap-0.5">
                  <MapPin size={12} />
                  {formatDistance(distance)}
                </span>
              {/if}
              {#if place.visitDates?.length}
                <span>·</span>
                <span>{place.visitDates.length} visit{place.visitDates.length === 1 ? '' : 's'}</span>
              {/if}
            </div>

            {#if place.notes}
              <p class="text-sm text-slate-500 dark:text-slate-400 mt-1.5 line-clamp-2">{place.notes}</p>
            {/if}

            <span class="text-xs text-slate-400 mt-1.5 block">
              Added by {getDisplayNameForUser(place.createdBy)}
            </span>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-2 shrink-0">
            <button
              type="button"
              class="w-11 h-11 rounded-xl border-2 flex items-center justify-center transition-colors touch-manipulation {place.visited
                ? 'bg-emerald-500 border-emerald-500 text-white'
                : 'bg-transparent border-slate-200 dark:border-slate-600 text-slate-400 hover:border-emerald-500 hover:text-emerald-500'}"
              onclick={(e) => { e.stopPropagation(); toggleVisited(place); }}
              aria-label={place.visited ? 'Mark as not visited' : 'Mark as visited'}
            >
              <Check size={20} />
            </button>

            <button
              type="button"
              class="w-11 h-11 rounded-xl border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-400 hover:text-red-500 hover:border-red-500 transition-colors opacity-0 group-hover:opacity-100 touch-manipulation"
              onclick={(e) => { e.stopPropagation(); place.id && remove(place.id); }}
              aria-label="Remove place"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      </article>
    {:else}
      <EmptyState
        icon={MapPin}
        title={activeFilterCount > 0 ? 'No places match your filters' : 'No places yet'}
        description={activeFilterCount > 0 ? 'Try adjusting your filters' : 'Add somewhere you want to go!'}
        actionLabel={activeFilterCount > 0 ? undefined : 'Add First Place'}
        onAction={activeFilterCount > 0 ? undefined : toggleForm}
      />
    {/each}
  </div>
</div>

<style>
  @media (hover: none) {
    .group:active .opacity-0 {
      opacity: 1;
    }
  }
</style>

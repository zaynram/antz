<script lang="ts">
  import { addDocument, deleteDocument, subscribeToCollection, updateDocument } from '$lib/firebase'
  import { activeUser, currentPreferences } from '$lib/stores/app'
  import type { Place, PlaceCategory, GeoLocation } from '$lib/types'
  import { getPlaceDisplayRating, calculateDistance, formatDistance, formatBudget } from '$lib/types'
  import { toast } from 'svelte-sonner'
  import { Timestamp } from 'firebase/firestore'
  import { onMount, tick } from 'svelte'
  import LocationPicker from '$lib/components/LocationPicker.svelte'
  import PlaceDetailModal from '$lib/components/PlaceDetailModal.svelte'
  import EmptyState from '$lib/components/ui/EmptyState.svelte'
  import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte'
  import {
    getCurrentPosition, geocode, discoverInBounds,
    type MapBounds,
  } from '$lib/services/location'
  import {
    CATEGORY_DEFS, CATEGORY_KEYS, CATEGORY_QUERY,
    categoryDef, isRevisitable, categoryFromOSM,
  } from '$lib/places'
  import { MapPin, Plus, X, Search, LocateFixed, Compass, Check, RotateCw } from 'lucide-svelte'
  import { hapticSuccess, hapticLight } from '$lib/haptics'
  import { forceRepaint } from '$lib/pwa-utils'
  import { consumeQueryParam } from '$lib/stores/nav'
  import 'leaflet/dist/leaflet.css'
  import type { Map as LeafletMap, LayerGroup, Marker } from 'leaflet'

  // ---- Data ----
  let places = $state<Place[]>([])
  let unsubscribe: (() => void) | undefined
  let selectedPlace = $state<Place | null>(null)

  // ---- Map ----
  let mapEl = $state<HTMLDivElement | null>(null)
  let map: LeafletMap | undefined
  let savedLayer: LayerGroup | undefined
  let discoverLayer: LayerGroup | undefined
  let L: typeof import('leaflet') | undefined
  let mapReady = $state(false)
  const markerById = new Map<string, Marker>()

  // ---- UI state ----
  let showForm = $state(false)
  let searchQuery = $state('')
  let filterCategory = $state<PlaceCategory | 'all'>('all')
  let filterStatus = $state<'all' | 'to-visit' | 'visited'>('all')
  let autoCenter = $state(false)

  // ---- Discovery ----
  let discoverOpen = $state(false)
  let discoverCategory = $state<PlaceCategory>('restaurant')
  let discoverLoading = $state(false)
  let discoverError = $state<string | null>(null)
  let discoverCandidates = $state<Awaited<ReturnType<typeof discoverInBounds>>>([])
  let discoverIndex = $state(0)

  let newPlace = $state({
    name: '', category: 'restaurant' as PlaceCategory, notes: '',
    location: undefined as GeoLocation | undefined, budget: null as number | null,
  })

  // ---- Derived ----
  function refLocation(): GeoLocation | undefined {
    return $currentPreferences.referenceLocation || $currentPreferences.currentLocation
  }

  function distanceOf(place: Place): number | null {
    const ref = refLocation()
    if (!ref || !place.location) return null
    return calculateDistance(ref, place.location)
  }

  // Pins on the map respect category + status filters (stable while typing).
  let mapPlaces = $derived.by(() => {
    let r = places.filter(p => p.location)
    if (filterCategory !== 'all') r = r.filter(p => p.category === filterCategory)
    if (filterStatus === 'visited') r = r.filter(p => p.visited)
    else if (filterStatus === 'to-visit') r = r.filter(p => !p.visited)
    return r
  })

  // The list additionally narrows by the search text (name / address / category).
  let listPlaces = $derived.by(() => {
    let r = places
    if (filterCategory !== 'all') r = r.filter(p => p.category === filterCategory)
    if (filterStatus === 'visited') r = r.filter(p => p.visited)
    else if (filterStatus === 'to-visit') r = r.filter(p => !p.visited)
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      r = r.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.location?.address?.toLowerCase().includes(q) ?? false) ||
        categoryDef(p.category).label.toLowerCase().includes(q))
    }
    // Sort by distance when we have a reference, else by name.
    return [...r].sort((a, b) => {
      const da = distanceOf(a), db = distanceOf(b)
      if (da !== null && db !== null) return da - db
      if (da !== null) return -1
      if (db !== null) return 1
      return a.name.localeCompare(b.name)
    })
  })

  let visitedCount = $derived(places.filter(p => p.visited).length)

  // ---- Map lifecycle ----
  onMount(() => {
    if (consumeQueryParam('add') !== null) showForm = true

    unsubscribe = subscribeToCollection<Place>('places', (items) => {
      places = items
      if (selectedPlace) {
        const updated = items.find(p => p.id === selectedPlace!.id)
        if (updated) selectedPlace = updated
      }
    })

    let disposed = false
    ;(async () => {
      const leaflet = await import('leaflet')
      if (disposed || !mapEl) return
      L = leaflet.default ?? leaflet

      const start = refLocation()
      const center: [number, number] = start
        ? [start.lat, start.lng]
        : [39.5, -98.35] // continental US fallback
      const zoom = start ? 13 : 4

      map = L.map(mapEl, { zoomControl: true, attributionControl: true }).setView(center, zoom)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap',
      }).addTo(map)
      savedLayer = L.layerGroup().addTo(map)
      discoverLayer = L.layerGroup().addTo(map)
      mapReady = true

      await tick()
      map.invalidateSize()
      rebuildSavedMarkers()

      if ($currentPreferences.locationMode === 'auto' && !start) locateMe(false)
    })()

    return () => {
      disposed = true
      unsubscribe?.()
      map?.remove()
      map = undefined
      mapReady = false
    }
  })

  // Rebuild pins whenever the visible set changes.
  $effect(() => {
    // reference reactive deps
    void mapPlaces
    void mapReady
    rebuildSavedMarkers()
  })

  function pinHtml(category: PlaceCategory, badge: string, discover = false): string {
    const def = categoryDef(category)
    return `<div class="map-pin${discover ? ' map-pin--discover' : ''}" style="--pin:${def.color}">`
      + `<span class="map-pin__glyph">${def.emoji}</span>`
      + (badge ? `<span class="map-pin__badge">${badge}</span>` : '')
      + `</div>`
  }

  function pinBadge(place: Place): string {
    const count = place.visitDates?.length ?? 0
    if (isRevisitable(place)) return count > 0 ? (count > 9 ? '9+' : String(count)) : ''
    return place.visited ? '✓' : ''
  }

  function rebuildSavedMarkers(): void {
    if (!L || !map || !savedLayer) return
    savedLayer.clearLayers()
    markerById.clear()
    for (const place of mapPlaces) {
      if (!place.location || !place.id) continue
      const icon = L.divIcon({
        html: pinHtml(place.category, pinBadge(place)),
        className: 'map-pin-wrap',
        iconSize: [34, 34],
        iconAnchor: [17, 34],
        popupAnchor: [0, -32],
      })
      const marker = L.marker([place.location.lat, place.location.lng], { icon, title: place.name })
      marker.on('click', () => { selectedPlace = place })
      marker.addTo(savedLayer)
      markerById.set(place.id, marker)
    }
  }

  function focusPlace(place: Place): void {
    if (place.location && map) {
      map.flyTo([place.location.lat, place.location.lng], Math.max(map.getZoom(), 15), { duration: 0.6 })
    }
    hapticLight()
    selectedPlace = place
  }

  async function locateMe(fly = true): Promise<void> {
    try {
      const coords = await getCurrentPosition()
      if (map) {
        if (fly) map.flyTo([coords.lat, coords.lng], 14, { duration: 0.7 })
        else map.setView([coords.lat, coords.lng], 14)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not get your location')
      autoCenter = false
    }
  }

  function toggleAutoCenter(): void {
    autoCenter = !autoCenter
    hapticLight()
    if (autoCenter) locateMe(true)
  }

  // Search: when the query names no saved place, offer to geocode + center there.
  let geoCentering = $state(false)
  async function centerOnQuery(): Promise<void> {
    const q = searchQuery.trim()
    if (!q || !map) return
    geoCentering = true
    try {
      const results = await geocode(q)
      if (results.length === 0) { toast.error('No matching location found'); return }
      const { lat, lng } = results[0].coordinates
      map.flyTo([lat, lng], 13, { duration: 0.7 })
    } catch {
      toast.error('Location lookup failed')
    } finally {
      geoCentering = false
    }
  }

  // ---- Discovery (reroll, one at a time) ----
  function currentBounds(): MapBounds | null {
    if (!map) return null
    const b = map.getBounds()
    return { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() }
  }

  async function runDiscovery(): Promise<void> {
    const bounds = currentBounds()
    if (!bounds) return
    discoverLoading = true
    discoverError = null
    discoverCandidates = []
    discoverIndex = 0
    try {
      const found = await discoverInBounds(CATEGORY_QUERY[discoverCategory], bounds, 12)
      // Drop candidates that essentially match a place we already have.
      const known = new Set(places.map(p => p.name.toLowerCase()))
      discoverCandidates = found.filter(c => !known.has(c.name.toLowerCase()))
      if (discoverCandidates.length === 0) {
        discoverError = `No new ${categoryDef(discoverCategory).label.toLowerCase()} spots in view — pan the map and try again.`
      }
    } catch (e) {
      discoverError = e instanceof Error ? e.message : 'Discovery failed'
    } finally {
      discoverLoading = false
      renderDiscoverPin()
    }
  }

  function rerollDiscovery(): void {
    if (discoverCandidates.length === 0) return
    discoverIndex = (discoverIndex + 1) % discoverCandidates.length
    hapticLight()
    renderDiscoverPin()
  }

  let currentCandidate = $derived(discoverCandidates[discoverIndex] ?? null)

  function renderDiscoverPin(): void {
    if (!L || !map || !discoverLayer) return
    discoverLayer.clearLayers()
    const cand = discoverCandidates[discoverIndex]
    if (!cand) return
    const cat = categoryFromOSM(cand.osmClass, cand.osmType)
    const icon = L.divIcon({
      html: pinHtml(cat, '?', true),
      className: 'map-pin-wrap',
      iconSize: [34, 34],
      iconAnchor: [17, 34],
      popupAnchor: [0, -32],
    })
    L.marker([cand.coordinates.lat, cand.coordinates.lng], { icon, title: cand.name })
      .addTo(discoverLayer)
    map.flyTo([cand.coordinates.lat, cand.coordinates.lng], Math.max(map.getZoom(), 15), { duration: 0.5 })
  }

  function closeDiscovery(): void {
    discoverOpen = false
    discoverCandidates = []
    discoverIndex = 0
    discoverError = null
    discoverLayer?.clearLayers()
  }

  async function addCandidate(): Promise<void> {
    const cand = discoverCandidates[discoverIndex]
    if (!cand) return
    const cat = categoryFromOSM(cand.osmClass, cand.osmType)
    try {
      await addDocument<Place>('places', {
        name: cand.name,
        category: cat,
        notes: '',
        visited: false,
        visitDates: [],
        rating: null,
        location: { lat: cand.coordinates.lat, lng: cand.coordinates.lng, address: cand.address },
        budget: cand.priceLevel ?? null,
      }, $activeUser)
      hapticSuccess()
      toast.success(`Added "${cand.name}"`)
      // Remove it from the candidate pool and advance.
      discoverCandidates = discoverCandidates.filter((_, i) => i !== discoverIndex)
      if (discoverIndex >= discoverCandidates.length) discoverIndex = 0
      renderDiscoverPin()
    } catch (e) {
      console.error('Failed to add place:', e)
      toast.error('Failed to add place')
    }
  }

  // ---- CRUD ----
  async function addPlace(): Promise<void> {
    if (!newPlace.name.trim()) return
    try {
      await addDocument<Place>('places', {
        name: newPlace.name,
        category: newPlace.category,
        notes: newPlace.notes,
        visited: false,
        visitDates: [],
        rating: null,
        location: newPlace.location,
        budget: newPlace.budget,
      }, $activeUser)
      hapticSuccess()
      toast.success(`Added "${newPlace.name}"`)
      newPlace = { name: '', category: 'restaurant', notes: '', location: undefined, budget: null }
      showForm = false
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
    await updateDocument<Place>('places', place.id, { visited: !place.visited, visitDates }, $activeUser)
  }

  let pendingConfirm = $state<{ message: string; onConfirm: () => void } | null>(null)

  function remove(id: string): void {
    pendingConfirm = {
      message: 'Remove this place?',
      onConfirm: async () => {
        pendingConfirm = null
        try {
          await deleteDocument('places', id)
          toast.success('Place removed')
        } catch (e) {
          console.error('Failed to remove:', e)
          toast.error('Failed to remove place')
        }
      },
    }
  }

  function toggleForm(): void {
    showForm = !showForm
    if (!showForm) newPlace = { name: '', category: 'restaurant', notes: '', location: undefined, budget: null }
    forceRepaint()
  }
</script>

<PlaceDetailModal place={selectedPlace} onClose={() => selectedPlace = null} />

<ConfirmModal
  open={pendingConfirm !== null}
  message={pendingConfirm?.message ?? ''}
  danger={true}
  onConfirm={() => pendingConfirm?.onConfirm()}
  onCancel={() => pendingConfirm = null}
/>

<div class="max-w-4xl mx-auto">
  <!-- Travel-journal header -->
  <div class="journal mb-4">
    <div class="journal-inner">
      <div class="flex items-end justify-between gap-3 flex-wrap">
        <div class="min-w-0">
          <p class="journal-eyebrow">Our map</p>
          <h1 class="journal-title">Places</h1>
        </div>
        <span class="journal-count">
          {#if places.length > 0}
            {visitedCount}/{places.length} visited
          {:else}
            0 places
          {/if}
        </span>
      </div>
    </div>
  </div>

  <!-- Search + map tools -->
  <div class="flex items-center gap-2 mb-3">
    <div class="relative flex-1">
      <Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <input
        type="text"
        placeholder="Search your places…"
        class="input pl-9"
        bind:value={searchQuery}
      />
      {#if searchQuery}
        <button
          type="button"
          class="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-600 touch-manipulation"
          onclick={() => searchQuery = ''}
          aria-label="Clear search"
        >
          <X size={16} />
        </button>
      {/if}
    </div>
    <button
      type="button"
      class="map-tool {autoCenter ? 'map-tool--on' : ''}"
      onclick={toggleAutoCenter}
      aria-label="Center on my location"
      title="Center on my location"
    >
      <LocateFixed size={18} />
    </button>
    <button
      type="button"
      class="map-tool {discoverOpen ? 'map-tool--on' : ''}"
      onclick={() => { discoverOpen ? closeDiscovery() : (discoverOpen = true) }}
      aria-label="Discover places"
      title="Discover places nearby"
    >
      <Compass size={18} />
    </button>
    <button type="button" class="btn-primary shrink-0" onclick={toggleForm}>
      {#if showForm}<X size={18} /><span class="hidden sm:inline">Cancel</span>
      {:else}<Plus size={18} /><span class="hidden sm:inline">Add</span>{/if}
    </button>
  </div>

  {#if searchQuery.trim()}
    <button type="button" class="center-query mb-3" onclick={centerOnQuery} disabled={geoCentering}>
      <MapPin size={14} />
      <span>{geoCentering ? 'Finding…' : `Center map on “${searchQuery.trim()}”`}</span>
    </button>
  {/if}

  <!-- Map -->
  <div class="map-frame mb-3">
    <div class="map-canvas" bind:this={mapEl}></div>
    {#if !mapReady}
      <div class="map-loading">
        <div class="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
      </div>
    {/if}

    <!-- Discovery overlay -->
    {#if discoverOpen}
      <div class="discover-panel">
        <div class="flex items-center justify-between gap-2 mb-2">
          <span class="text-xs font-bold uppercase tracking-wide text-accent">Discover</span>
          <button type="button" class="text-slate-400 hover:text-slate-600 touch-manipulation" onclick={closeDiscovery} aria-label="Close discovery">
            <X size={16} />
          </button>
        </div>
        <div class="flex items-center gap-2 mb-2">
          <select class="input-sm flex-1" bind:value={discoverCategory}>
            {#each CATEGORY_DEFS as def}
              <option value={def.key}>{def.emoji} {def.label}</option>
            {/each}
          </select>
          <button type="button" class="btn-primary py-2 px-3 text-sm" onclick={runDiscovery} disabled={discoverLoading}>
            {discoverLoading ? 'Searching…' : 'Search view'}
          </button>
        </div>

        {#if discoverError}
          <p class="text-xs text-slate-500 dark:text-slate-400 py-1">{discoverError}</p>
        {:else if currentCandidate}
          <div class="discover-card">
            <div class="flex-1 min-w-0">
              <div class="font-medium text-sm truncate">{currentCandidate.name}</div>
              <div class="text-xs text-slate-500 dark:text-slate-400 truncate">
                {categoryDef(categoryFromOSM(currentCandidate.osmClass, currentCandidate.osmType)).label}
                · {discoverIndex + 1}/{discoverCandidates.length}
              </div>
            </div>
            <button type="button" class="disc-btn" onclick={rerollDiscovery} title="Show another" aria-label="Reroll">
              <RotateCw size={16} />
            </button>
            <button type="button" class="disc-btn disc-btn--add" onclick={addCandidate} title="Add this place" aria-label="Add">
              <Plus size={16} />
            </button>
          </div>
        {:else if !discoverLoading}
          <p class="text-xs text-slate-500 dark:text-slate-400 py-1">
            Pan/zoom the map to an area, then search the current view.
          </p>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Filters -->
  <div class="flex flex-wrap items-center gap-1.5 mb-3">
    <button
      type="button"
      class="chip {filterCategory === 'all' ? 'chip--on' : ''}"
      onclick={() => filterCategory = 'all'}
    >All</button>
    {#each CATEGORY_KEYS as key}
      {@const def = categoryDef(key)}
      <button
        type="button"
        class="chip {filterCategory === key ? 'chip--on' : ''}"
        onclick={() => filterCategory = filterCategory === key ? 'all' : key}
        title={def.label}
      >
        <span>{def.emoji}</span>
        <span class="hidden xs:inline">{def.label}</span>
      </button>
    {/each}
  </div>

  <div class="flex items-center gap-1.5 mb-4">
    {#each [['all', 'All'], ['to-visit', 'To visit'], ['visited', 'Visited']] as [key, label]}
      <button
        type="button"
        class="seg {filterStatus === key ? 'seg--on' : ''}"
        onclick={() => filterStatus = key as typeof filterStatus}
      >{label}</button>
    {/each}
  </div>

  <!-- Add form -->
  {#if showForm}
    <form
      class="card p-4 mb-5 space-y-3"
      style="transform: translateZ(0)"
      onsubmit={(e) => { e.preventDefault(); addPlace() }}
    >
      <input type="text" placeholder="Place name" class="input" bind:value={newPlace.name} />
      <div class="grid grid-cols-2 gap-3">
        <select class="input" bind:value={newPlace.category}>
          {#each CATEGORY_DEFS as def}
            <option value={def.key}>{def.label}</option>
          {/each}
        </select>
        <select class="input" bind:value={newPlace.budget}>
          <option value={null}>Budget (optional)</option>
          <option value={0}>Free</option>
          <option value={1}>$ - Inexpensive</option>
          <option value={2}>$$ - Moderate</option>
          <option value={3}>$$$ - Expensive</option>
          <option value={4}>$$$$ - Very Expensive</option>
        </select>
      </div>
      <LocationPicker value={newPlace.location} onChange={(loc) => newPlace.location = loc} placeholder="Location..." />
      <textarea placeholder="Notes (optional)" rows="2" class="input resize-y" bind:value={newPlace.notes}></textarea>
      <div class="flex justify-end">
        <button type="submit" class="btn-primary"><Plus size={18} /><span>Add Place</span></button>
      </div>
    </form>
  {/if}

  <!-- Place list (doubles as the search result list) -->
  <div class="flex flex-col gap-2">
    {#each listPlaces as place (place.id)}
      {@const def = categoryDef(place.category)}
      {@const Icon = def.icon}
      {@const distance = distanceOf(place)}
      {@const rating = getPlaceDisplayRating(place)}
      {@const revisit = isRevisitable(place)}
      {@const visits = place.visitDates?.length ?? 0}
      <div
        class="group card p-3 flex items-center gap-3 cursor-pointer hover:border-accent transition-colors touch-feedback"
        onclick={() => focusPlace(place)}
        role="button"
        tabindex="0"
        onkeydown={(e) => e.key === 'Enter' && focusPlace(place)}
      >
        <div class="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-white" style="background-color: {def.color}">
          <Icon size={20} />
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-2">
            <h3 class="font-medium truncate">{place.name}</h3>
            {#if rating}
              <span class="shrink-0 flex items-center gap-0.5 text-amber-400 text-sm">★ <span class="font-medium">{rating.toFixed(1)}</span></span>
            {/if}
          </div>
          <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            <span>{def.label}</span>
            {#if place.budget !== null && place.budget !== undefined}
              <span>·</span><span>{formatBudget(place.budget)}</span>
            {/if}
            {#if distance !== null}
              <span>·</span><span class="flex items-center gap-0.5"><MapPin size={11} />{formatDistance(distance)}</span>
            {/if}
            {#if revisit && visits > 0}
              <span>·</span><span>{visits} visit{visits === 1 ? '' : 's'}</span>
            {:else if !revisit && place.visited}
              <span>·</span><span class="text-emerald-600 dark:text-emerald-400">Visited</span>
            {/if}
          </div>
        </div>
        <button
          type="button"
          class="shrink-0 w-10 h-10 rounded-xl border-2 flex items-center justify-center transition-colors touch-manipulation {place.visited
            ? 'bg-emerald-500 border-emerald-500 text-white'
            : 'bg-transparent border-[var(--color-border)] text-slate-400 hover:border-emerald-500 hover:text-emerald-500'}"
          onclick={(e) => { e.stopPropagation(); toggleVisited(place) }}
          aria-label={place.visited ? 'Mark as not visited' : 'Mark as visited'}
        >
          <Check size={18} />
        </button>
        <button
          type="button"
          class="shrink-0 w-10 h-10 rounded-xl border border-[var(--color-border)] flex items-center justify-center text-slate-400 hover:text-red-500 hover:border-red-500 transition-colors opacity-0 group-hover:opacity-100 touch-manipulation"
          onclick={(e) => { e.stopPropagation(); place.id && remove(place.id) }}
          aria-label="Remove place"
        >
          <X size={16} />
        </button>
      </div>
    {:else}
      <EmptyState
        icon={MapPin}
        title={searchQuery || filterCategory !== 'all' || filterStatus !== 'all' ? 'No places match' : 'No places yet'}
        description={searchQuery || filterCategory !== 'all' || filterStatus !== 'all' ? 'Try adjusting your search or filters' : 'Add somewhere you want to go, or use Discover to find spots nearby!'}
        actionLabel={searchQuery || filterCategory !== 'all' || filterStatus !== 'all' ? undefined : 'Add First Place'}
        onAction={searchQuery || filterCategory !== 'all' || filterStatus !== 'all' ? undefined : toggleForm}
      />
    {/each}
  </div>
</div>

<style>
  /* ===== Map frame + hand-drawn skin ===== */
  .map-frame {
    position: relative;
    height: 46vh;
    min-height: 300px;
    max-height: 460px;
    border-radius: 1.1rem;
    overflow: hidden;
    border: 1.5px solid color-mix(in srgb, var(--color-accent) 22%, #b7a381);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.15), 0 10px 26px rgba(70,50,25,0.16);
  }
  .map-canvas { position: absolute; inset: 0; background: #ece3d2; }
  /* Give real OSM tiles an aged, hand-drawn cartography feel. */
  .map-frame :global(.leaflet-tile-pane) {
    filter: grayscale(0.55) sepia(0.4) saturate(0.85) contrast(1.05) brightness(1.04);
  }
  :global(.dark) .map-frame :global(.leaflet-tile-pane) {
    filter: grayscale(0.6) sepia(0.25) saturate(0.7) contrast(0.95) brightness(0.72) invert(0.9) hue-rotate(180deg);
  }
  /* Parchment wash + soft vignette over the tiles. */
  .map-frame::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      radial-gradient(120% 120% at 50% 40%, transparent 60%, rgba(80,55,25,0.16) 100%),
      linear-gradient(0deg, rgba(226,205,160,0.10), rgba(226,205,160,0.10));
    mix-blend-mode: multiply;
    z-index: 400;
  }
  :global(.dark) .map-frame::after {
    background: radial-gradient(120% 120% at 50% 40%, transparent 62%, rgba(0,0,0,0.4) 100%);
    mix-blend-mode: normal;
  }
  .map-loading {
    position: absolute; inset: 0; z-index: 500;
    display: flex; align-items: center; justify-content: center;
    background: #ece3d2;
  }
  :global(.dark) .map-loading { background: #2a2620; }

  /* ===== Map pins (divIcon) ===== */
  .map-frame :global(.map-pin-wrap) { background: transparent; border: none; }
  .map-frame :global(.map-pin) {
    position: relative;
    width: 34px; height: 34px;
    display: flex; align-items: center; justify-content: center;
    background: var(--pin);
    border: 2px solid #fff;
    border-radius: 50% 50% 50% 0;
    transform: rotate(-45deg);
    box-shadow: 0 3px 6px rgba(0,0,0,0.35);
  }
  .map-frame :global(.map-pin__glyph) {
    transform: rotate(45deg);
    font-size: 15px;
    line-height: 1;
  }
  .map-frame :global(.map-pin--discover) {
    border-style: dashed;
    opacity: 0.95;
    animation: pinpop 0.25s ease-out;
  }
  @keyframes pinpop { from { transform: rotate(-45deg) scale(0.6); } to { transform: rotate(-45deg) scale(1); } }
  .map-frame :global(.map-pin__badge) {
    position: absolute;
    top: -6px; right: -6px;
    transform: rotate(45deg);
    min-width: 17px; height: 17px;
    padding: 0 3px;
    display: flex; align-items: center; justify-content: center;
    background: #fff; color: #1f2937;
    border-radius: 999px;
    font-size: 10px; font-weight: 800; line-height: 1;
    box-shadow: 0 1px 2px rgba(0,0,0,0.3);
  }

  /* ===== Map tool buttons ===== */
  .map-tool {
    flex-shrink: 0;
    width: 44px; height: 44px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 0.75rem;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text-muted, #64748b);
    transition: all 0.15s;
  }
  .map-tool:hover { border-color: var(--color-accent); color: var(--color-accent); }
  .map-tool--on { background: var(--color-accent); border-color: var(--color-accent); color: #fff; }

  /* ===== Discovery overlay panel ===== */
  .discover-panel {
    position: absolute;
    left: 0.6rem; right: 0.6rem; bottom: 0.6rem;
    z-index: 600;
    padding: 0.7rem 0.8rem;
    border-radius: 0.9rem;
    background: color-mix(in srgb, var(--color-surface) 92%, transparent);
    backdrop-filter: blur(8px);
    border: 1px solid var(--color-border);
    box-shadow: 0 8px 24px rgba(0,0,0,0.22);
  }
  .discover-card {
    display: flex; align-items: center; gap: 0.5rem;
    padding-top: 0.15rem;
  }
  .disc-btn {
    flex-shrink: 0;
    width: 38px; height: 38px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 0.6rem;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text-muted, #64748b);
    transition: all 0.15s;
  }
  .disc-btn:hover { border-color: var(--color-accent); color: var(--color-accent); }
  .disc-btn--add { background: var(--color-accent); border-color: var(--color-accent); color: #fff; }
  .disc-btn--add:hover { filter: brightness(1.08); color: #fff; }

  /* ===== Filter chips + status segments ===== */
  .chip {
    display: inline-flex; align-items: center; gap: 0.3rem;
    padding: 0.35rem 0.6rem;
    border-radius: 999px;
    font-size: 0.78rem; font-weight: 600;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    color: var(--color-text-muted, #64748b);
    transition: all 0.15s;
    min-height: 34px;
  }
  .chip--on { background: var(--color-accent); border-color: var(--color-accent); color: #fff; }
  .seg {
    flex: 1;
    padding: 0.5rem 0.4rem;
    border-radius: 0.6rem;
    font-size: 0.8rem; font-weight: 600;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    color: var(--color-text-muted, #64748b);
    transition: all 0.15s;
    min-height: 40px;
  }
  .seg--on { background: var(--color-accent); border-color: var(--color-accent); color: #fff; }

  .center-query {
    display: inline-flex; align-items: center; gap: 0.35rem;
    padding: 0.35rem 0.7rem;
    border-radius: 999px;
    font-size: 0.78rem; font-weight: 600;
    color: var(--color-accent);
    background: color-mix(in srgb, var(--color-accent) 10%, transparent);
    border: 1px dashed color-mix(in srgb, var(--color-accent) 45%, transparent);
    transition: all 0.15s;
  }
  .center-query:hover { background: color-mix(in srgb, var(--color-accent) 18%, transparent); }
  .center-query:disabled { opacity: 0.6; }

  @media (min-width: 400px) {
    :global(.xs\:inline) { display: inline; }
  }

  /* ===== Travel-journal / passport header ===== */
  .journal {
    position: relative;
    border-radius: 1.1rem;
    background:
      radial-gradient(120% 140% at 50% -20%, color-mix(in srgb, var(--color-accent) 30%, #4a3524) 0%, #3d2b1c 55%, #2c1e14 100%);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 10px 26px rgba(0,0,0,0.28);
    overflow: hidden;
  }
  .journal::before {
    content: "";
    position: absolute;
    inset: 0.5rem;
    border: 1.5px dashed rgba(255,236,200,0.35);
    border-radius: 0.7rem;
    pointer-events: none;
  }
  .journal-inner { position: relative; padding: 1rem 1.2rem; }
  .journal-eyebrow {
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #e9c893;
    text-shadow: 0 0 8px rgba(220,170,90,0.35);
    margin-bottom: 0.1rem;
  }
  .journal-title {
    font-size: 1.6rem;
    font-weight: 800;
    line-height: 1.05;
    letter-spacing: -0.01em;
    color: #fbf1df;
  }
  .journal-count {
    font-size: 0.75rem;
    font-weight: 700;
    color: rgba(251,241,223,0.72);
    padding-bottom: 0.2rem;
  }

  @media (hover: none) {
    .group:active .opacity-0 { opacity: 1; }
  }
</style>

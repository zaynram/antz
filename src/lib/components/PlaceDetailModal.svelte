<script lang="ts">
  import LocationPicker from '$lib/components/LocationPicker.svelte'
  import PhotoGallery from '$lib/components/ui/PhotoGallery.svelte'
  import Modal from '$lib/components/ui/Modal.svelte'
  import { updateDocument } from '$lib/firebase'
  import { hapticLight } from '$lib/haptics'
  import { activeUser, displayNames } from '$lib/stores/app'
  import type { Place, PlaceCategory, PlaceComment, UserId } from '$lib/types'
  import { getPlaceAverageRating, getPlaceUserRating } from '$lib/types'
  import { CATEGORY_DEFS, categoryDef, isRevisitable } from '$lib/places'
  import { Timestamp } from 'firebase/firestore'
  import { Calendar, Check, ExternalLink, MapPin, Repeat, X } from 'lucide-svelte'
  import { cycleRating, getStarFill } from '$lib/utils'
  import 'leaflet/dist/leaflet.css'
  import type { Map as LeafletMap } from 'leaflet'

  interface Props {
    place: Place | null
    onClose: () => void
  }

  let { place, onClose }: Props = $props()

  let editedNotes = $state('')
  let newComment = $state('')
  let editedCategory = $state<PlaceCategory>('restaurant')
  let editedBudget = $state<number | null>(null)

  let previousPlaceId: string | undefined = undefined

  $effect(() => {
    if (place && place.id !== previousPlaceId) {
      editedNotes = place.notes || ''
      editedCategory = place.category
      editedBudget = place.budget ?? null
      previousPlaceId = place.id
    }
  })

  // ===== Embedded, non-pannable location preview map =====
  let mapEl = $state<HTMLDivElement | null>(null)
  let miniMap: LeafletMap | undefined

  // Depend on primitives, not the `place` object: the parent reassigns the
  // selected place on every Firestore snapshot, and depending on the object
  // would tear down and rebuild the map (losing the user's zoom and re-fetching
  // tiles) on every unrelated write — a rating tap, a notes blur, a visit toggle.
  let pinLat = $derived(place?.location?.lat ?? null)
  let pinLng = $derived(place?.location?.lng ?? null)
  let pinColor = $derived(place ? categoryDef(place.category).color : '')
  let pinEmoji = $derived(place ? categoryDef(place.category).emoji : '')

  $effect(() => {
    const lat = pinLat, lng = pinLng, color = pinColor, emoji = pinEmoji
    const el = mapEl
    if (lat === null || lng === null || !el) return
    let disposed = false
    ;(async () => {
      const leaflet = await import('leaflet')
      if (disposed || !mapEl) return
      const L = leaflet.default ?? leaflet
      // Display-only: no dragging, but pinch/scroll/buttons can still zoom.
      miniMap = L.map(el, {
        dragging: false,
        scrollWheelZoom: false,
        touchZoom: true,
        doubleClickZoom: true,
        boxZoom: false,
        keyboard: false,
        zoomControl: true,
        attributionControl: false,
      }).setView([lat, lng], 15)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(miniMap)
      const icon = L.divIcon({
        html: `<div class="mini-pin" style="--pin:${color}"><span>${emoji}</span></div>`,
        className: 'mini-pin-wrap',
        iconSize: [30, 30],
        iconAnchor: [15, 30],
      })
      L.marker([lat, lng], { icon }).addTo(miniMap)
      requestAnimationFrame(() => miniMap?.invalidateSize())
    })()
    return () => {
      disposed = true
      miniMap?.remove()
      miniMap = undefined
    }
  })

  function getDisplayNameForUser(userId: UserId): string {
    return $displayNames[userId]
  }

  async function updateNotes(): Promise<void> {
    if (!place?.id) return
    await updateDocument<Place>('places', place.id, { notes: editedNotes }, $activeUser)
  }

  async function updateCategory(): Promise<void> {
    if (!place?.id) return
    await updateDocument<Place>('places', place.id, { category: editedCategory }, $activeUser)
  }

  async function updateBudget(): Promise<void> {
    if (!place?.id) return
    await updateDocument<Place>('places', place.id, { budget: editedBudget }, $activeUser)
  }

  async function toggleRevisitable(): Promise<void> {
    if (!place?.id) return
    hapticLight()
    await updateDocument<Place>('places', place.id, { revisitable: !isRevisitable(place) }, $activeUser)
  }

  async function updateLocation(location: { lat: number; lng: number; address?: string } | undefined): Promise<void> {
    if (!place?.id) return
    await updateDocument<Place>('places', place.id, { location }, $activeUser)
  }

  async function updateRating(userId: UserId, starIndex: number): Promise<void> {
    if (!place?.id) return
    hapticLight()

    const currentRating = getPlaceUserRating(place, userId)
    const newRating = cycleRating(currentRating, starIndex)

    const currentRatings = place.ratings || { Z: null, T: null }
    const updatedRatings = { ...currentRatings, [userId]: newRating }

    await updateDocument<Place>('places', place.id, { ratings: updatedRatings }, $activeUser)
  }

  async function toggleVisited(): Promise<void> {
    if (!place?.id) return
    hapticLight()

    const now = Timestamp.now()
    const visitDates = place.visited ? place.visitDates : [...(place.visitDates || []), now]

    await updateDocument<Place>('places', place.id, {
      visited: !place.visited,
      visitDates
    }, $activeUser)
  }

  async function addVisit(): Promise<void> {
    if (!place?.id) return
    hapticLight()

    const now = Timestamp.now()
    const visitDates = [...(place.visitDates || []), now]

    await updateDocument<Place>('places', place.id, {
      visited: true,
      visitDates
    }, $activeUser)
  }

  async function removeVisit(index: number): Promise<void> {
    if (!place?.id) return
    hapticLight()

    const visitDates = [...(place.visitDates || [])]
    visitDates.splice(index, 1)

    await updateDocument<Place>('places', place.id, {
      visited: visitDates.length > 0,
      visitDates
    }, $activeUser)
  }

  function parseDateLocal(dateStr: string): Date {
    // Parse YYYY-MM-DD as local time to avoid UTC off-by-one
    const [year, month, day] = dateStr.split('-').map(Number)
    return new Date(year, month - 1, day)
  }

  async function addSingleDateVisit(): Promise<void> {
    if (!place?.id || !singleDate) return
    hapticLight()

    const date = Timestamp.fromDate(parseDateLocal(singleDate))
    const visitDates = [...(place.visitDates || []), date]

    await updateDocument<Place>('places', place.id, {
      visited: true,
      visitDates
    }, $activeUser)

    singleDate = ''
    showMode = null
  }

  async function addDateRangeVisit(): Promise<void> {
    if (!place?.id || !rangeStartDate || !rangeEndDate) return
    hapticLight()

    const start = Timestamp.fromDate(parseDateLocal(rangeStartDate))
    const end = Timestamp.fromDate(parseDateLocal(rangeEndDate))

    // Add all dates in range (for trips spanning multiple days)
    const visitDates = [...(place.visitDates || []), start]
    // Only add end date if different from start
    if (rangeStartDate !== rangeEndDate) {
      visitDates.push(end)
    }

    await updateDocument<Place>('places', place.id, {
      visited: true,
      visitDates
    }, $activeUser)

    // Reset the date inputs
    rangeStartDate = ''
    rangeEndDate = ''
    showMode = null
  }

  let showMode = $state<'single' | 'range' | null>(null)
  let singleDate = $state('')
  let rangeStartDate = $state('')
  let rangeEndDate = $state('')

  async function addComment(): Promise<void> {
    if (!place?.id || !newComment.trim()) return

    const comment: PlaceComment = {
      id: crypto.randomUUID(),
      text: newComment.trim(),
      createdBy: $activeUser,
      createdAt: Timestamp.now()
    }

    const comments = [...(place.comments || []), comment]
    await updateDocument<Place>('places', place.id, { comments }, $activeUser)
    newComment = ''
  }

  async function removeComment(commentId: string): Promise<void> {
    if (!place?.id) return
    const comments = (place.comments || []).filter(c => c.id !== commentId)
    await updateDocument<Place>('places', place.id, { comments }, $activeUser)
  }

  async function updatePhotos(photos: string[]): Promise<void> {
    if (!place?.id) return
    await updateDocument<Place>('places', place.id, { photos }, $activeUser)
  }

  function formatDate(timestamp: Timestamp | undefined): string {
    if (!timestamp) return ''
    return timestamp.toDate().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  function openInMaps(): void {
    if (!place?.location) return
    const { lat, lng } = place.location
    const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
    window.open(url, '_blank')
  }
</script>

{#if place}
  {@const CategoryIcon = categoryDef(place.category).icon}
  {@const revisit = isRevisitable(place)}
  <Modal open={true} onclose={onClose} title={place.name}>
    {#snippet header()}
      <!-- Header -->
      <div class="relative bg-accent/10 p-6 shrink-0">
        <button
          class="absolute top-2 right-2 w-11 h-11 rounded-full bg-black/20 text-white flex items-center justify-center hover:bg-black/40 transition-colors touch-manipulation"
          onclick={onClose}
        >
          <X size={20} />
        </button>

        <div class="flex items-center gap-4">
          <div class="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center text-white shrink-0">
            <CategoryIcon size={28} />
          </div>
          <div class="flex-1 min-w-0">
            <h2 class="text-xl font-bold truncate">{place.name}</h2>
            <div class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <span>{categoryDef(place.category).label}</span>
              {#if revisit && place.visitDates?.length}
                <span>·</span>
                <span>{place.visitDates.length} visit{place.visitDates.length === 1 ? '' : 's'}</span>
              {/if}
            </div>
          </div>
        </div>

        {#if place.location}
          <div class="mt-4 flex items-center gap-2 text-sm">
            <MapPin size={16} class="text-accent shrink-0" />
            <span class="truncate text-slate-600 dark:text-slate-400">
              {place.location.address || `${place.location.lat.toFixed(4)}, ${place.location.lng.toFixed(4)}`}
            </span>
            <button
              type="button"
              class="shrink-0 w-9 h-9 flex items-center justify-center text-accent hover:bg-accent/10 rounded-lg transition-colors touch-manipulation"
              onclick={openInMaps}
              aria-label="Open in Maps"
            >
              <ExternalLink size={18} />
            </button>
          </div>
        {/if}
      </div>
    {/snippet}

    <div class="space-y-5">
        <!-- Status & Actions -->
        <div class="flex items-center gap-3">
          <button
            type="button"
            class="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition-colors touch-manipulation {place.visited
              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}"
            onclick={toggleVisited}
          >
            <Check size={20} />
            <span>{place.visited ? 'Visited' : 'Mark as Visited'}</span>
          </button>

          <button
            type="button"
            class="flex items-center justify-center gap-2 px-3 py-3 rounded-xl font-medium transition-colors touch-manipulation {revisit
              ? 'bg-accent/10 text-accent'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}"
            onclick={toggleRevisitable}
            title={revisit ? 'Tracking repeat visits' : 'One-and-done'}
            aria-pressed={revisit}
          >
            <Repeat size={18} />
            <span class="text-sm">{revisit ? 'Repeat' : 'One-time'}</span>
          </button>
        </div>

        <!-- Visit history -->
        {#if revisit && place.visitDates?.length}
          <div>
            <span class="block text-xs text-slate-500 dark:text-slate-400 mb-2">Visit History</span>
            <div class="flex flex-wrap gap-2">
              {#each place.visitDates as date, index}
                <span class="group/visit px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs flex items-center gap-1">
                  {formatDate(date)}
                  <button
                    type="button"
                    class="w-4 h-4 rounded-full hover:bg-red-500 hover:text-white text-slate-400 flex items-center justify-center opacity-0 group-hover/visit:opacity-100 [@media(pointer:coarse)]:opacity-100 transition-opacity"
                    onclick={() => removeVisit(index)}
                    aria-label="Remove visit"
                  >
                    <X size={10} />
                  </button>
                </span>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Add visit with date options (only when tracking repeat visits) -->
        {#if place.visited && revisit}
          <div>
            {#if showMode === 'single'}
              <div class="flex flex-wrap gap-2 items-end">
                <div class="flex-1 min-w-[140px]">
                  <label for="single-date" class="block text-xs text-slate-500 dark:text-slate-400 mb-1">Date</label>
                  <input
                    id="single-date"
                    type="date"
                    bind:value={singleDate}
                    class="input-sm w-full"
                  />
                </div>
                <div class="flex gap-2">
                  <button
                    type="button"
                    class="px-3 py-2 text-sm bg-accent text-white rounded-lg disabled:opacity-50 touch-manipulation"
                    onclick={addSingleDateVisit}
                    disabled={!singleDate}
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    class="px-3 py-2 text-sm bg-slate-100 dark:bg-slate-700 rounded-lg touch-manipulation"
                    onclick={() => showMode = null}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            {:else if showMode === 'range'}
              <div class="flex flex-wrap gap-2 items-end">
                <div class="flex-1 min-w-[120px]">
                  <label for="range-start" class="block text-xs text-slate-500 dark:text-slate-400 mb-1">Start Date</label>
                  <input
                    id="range-start"
                    type="date"
                    bind:value={rangeStartDate}
                    class="input-sm w-full"
                  />
                </div>
                <div class="flex-1 min-w-[120px]">
                  <label for="range-end" class="block text-xs text-slate-500 dark:text-slate-400 mb-1">End Date</label>
                  <input
                    id="range-end"
                    type="date"
                    bind:value={rangeEndDate}
                    class="input-sm w-full"
                  />
                </div>
                <div class="flex gap-2">
                  <button
                    type="button"
                    class="px-3 py-2 text-sm bg-accent text-white rounded-lg disabled:opacity-50 touch-manipulation"
                    onclick={addDateRangeVisit}
                    disabled={!rangeStartDate || !rangeEndDate}
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    class="px-3 py-2 text-sm bg-slate-100 dark:bg-slate-700 rounded-lg touch-manipulation"
                    onclick={() => showMode = null}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            {:else}
              <div class="flex gap-2 flex-wrap">
                <button
                  type="button"
                  class="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-accent/10 text-accent font-medium hover:bg-accent/20 transition-colors touch-manipulation"
                  onclick={addVisit}
                >
                  <Calendar size={16} />
                  <span>Add Today</span>
                </button>
                <button
                  type="button"
                  class="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors touch-manipulation"
                  onclick={() => showMode = 'single'}
                >
                  <Calendar size={16} />
                  <span>Add Date</span>
                </button>
                <button
                  type="button"
                  class="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors touch-manipulation"
                  onclick={() => showMode = 'range'}
                >
                  <span>Add Date Range</span>
                </button>
              </div>
            {/if}
          </div>
        {/if}

        <!-- Category, Budget & Rating row -->
        <div class="flex flex-wrap gap-4 items-start">
          <div class="flex-1 min-w-[120px]">
            <label for="place-category" class="block text-xs text-slate-500 dark:text-slate-400 mb-1">Category</label>
            <select
              id="place-category"
              bind:value={editedCategory}
              onchange={updateCategory}
              class="input-sm"
            >
              {#each CATEGORY_DEFS as def}
                <option value={def.key}>{def.label}</option>
              {/each}
            </select>
          </div>

          <div class="flex-1 min-w-[120px]">
            <label for="place-budget" class="block text-xs text-slate-500 dark:text-slate-400 mb-1">Budget</label>
            <select
              id="place-budget"
              bind:value={editedBudget}
              onchange={updateBudget}
              class="input-sm"
            >
              <option value={null}>Not set</option>
              <option value={0}>Free</option>
              <option value={1}>$ - Inexpensive</option>
              <option value={2}>$$ - Moderate</option>
              <option value={3}>$$$ - Expensive</option>
              <option value={4}>$$$$ - Very Expensive</option>
            </select>
          </div>

          <div class="flex-1 min-w-[200px]">
            <span class="block text-xs text-slate-500 dark:text-slate-400 mb-1">Ratings</span>

            <!-- User Z Rating -->
            <div class="mb-2">
              <div class="text-xs text-slate-400 mb-0.5">{getDisplayNameForUser('Z')}'s Rating</div>
              <div class="flex">
                {#each [1, 2, 3, 4, 5] as star}
                  {@const fill = getStarFill(getPlaceUserRating(place, 'Z'), star)}
                  <button
                    type="button"
                    class="w-9 h-9 text-xl flex items-center justify-center transition-colors touch-manipulation relative"
                    onclick={() => updateRating('Z', star)}
                  >
                    <span class="text-slate-300 dark:text-slate-600">★</span>
                    {#if fill === 'full'}
                      <span class="absolute inset-0 flex items-center justify-center text-amber-400">★</span>
                    {:else if fill === 'half'}
                      <span class="absolute inset-0 flex items-center justify-center text-amber-400 overflow-hidden" style="clip-path: inset(0 50% 0 0)">★</span>
                    {/if}
                  </button>
                {/each}
              </div>
            </div>

            <!-- User T Rating -->
            <div class="mb-2">
              <div class="text-xs text-slate-400 mb-0.5">{getDisplayNameForUser('T')}'s Rating</div>
              <div class="flex">
                {#each [1, 2, 3, 4, 5] as star}
                  {@const fill = getStarFill(getPlaceUserRating(place, 'T'), star)}
                  <button
                    type="button"
                    class="w-9 h-9 text-xl flex items-center justify-center transition-colors touch-manipulation relative"
                    onclick={() => updateRating('T', star)}
                  >
                    <span class="text-slate-300 dark:text-slate-600">★</span>
                    {#if fill === 'full'}
                      <span class="absolute inset-0 flex items-center justify-center text-amber-400">★</span>
                    {:else if fill === 'half'}
                      <span class="absolute inset-0 flex items-center justify-center text-amber-400 overflow-hidden" style="clip-path: inset(0 50% 0 0)">★</span>
                    {/if}
                  </button>
                {/each}
              </div>
            </div>

            <!-- Average Rating -->
            {#if getPlaceAverageRating(place) !== null}
              <div class="pt-2 border-t border-[var(--color-border)]">
                <div class="text-xs text-slate-400 mb-0.5">Average</div>
                <div class="flex items-center gap-2">
                  <div class="flex gap-0.5">
                    {#each [1, 2, 3, 4, 5] as star}
                      <span
                        class="text-lg {(getPlaceAverageRating(place) ?? 0) >= star ? 'text-amber-400' : (getPlaceAverageRating(place) ?? 0) >= star - 0.5 ? 'text-amber-300' : 'text-slate-300 dark:text-slate-600'}"
                      >
                        ★
                      </span>
                    {/each}
                  </div>
                  <span class="text-sm font-semibold text-slate-600 dark:text-slate-300">
                    {getPlaceAverageRating(place)?.toFixed(1)}
                  </span>
                </div>
              </div>
            {/if}
          </div>
        </div>

        <!-- Location picker + embedded preview map -->
        <div>
          <span class="block text-xs text-slate-500 dark:text-slate-400 mb-1">Location</span>
          <LocationPicker
            value={place.location}
            onChange={updateLocation}
            placeholder="Search for address..."
          />
          {#if place.location}
            <div class="mini-map-frame mt-2">
              <div class="mini-map-canvas" bind:this={mapEl}></div>
            </div>
          {/if}
        </div>

        <!-- Notes -->
        <div>
          <label for="place-notes" class="block text-xs text-slate-500 dark:text-slate-400 mb-1">Notes</label>
          <textarea
            id="place-notes"
            bind:value={editedNotes}
            onblur={updateNotes}
            placeholder="Add notes about this place..."
            rows="3"
            class="input resize-y"
          ></textarea>
        </div>

        <!-- Photos -->
        <div>
          <span class="block text-xs text-slate-500 dark:text-slate-400 mb-2">Photos</span>
          <PhotoGallery
            photos={place.photos}
            folderPath={['places']}
            onUpdate={updatePhotos}
            maxPhotos={20}
          />
        </div>

        <!-- Comments section -->
        <div>
          <span class="block text-xs text-slate-500 dark:text-slate-400 mb-2">Comments</span>

          {#if place.comments?.length}
            <div class="space-y-2 mb-3">
              {#each place.comments as comment (comment.id)}
                <div class="flex gap-2 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg group">
                  <div class="flex-1">
                    <p class="text-sm">{comment.text}</p>
                    <span class="text-xs text-slate-400">
                      {getDisplayNameForUser(comment.createdBy)} · {formatDate(comment.createdAt)}
                    </span>
                  </div>
                  <button
                    type="button"
                    class="btn-icon-sm opacity-0 group-hover:opacity-100 transition-opacity"
                    onclick={() => removeComment(comment.id)}
                    aria-label="Remove comment"
                  >
                    <X size={14} />
                  </button>
                </div>
              {/each}
            </div>
          {/if}

          <form class="flex gap-2" onsubmit={(e) => { e.preventDefault(); addComment(); }}>
            <input
              type="text"
              bind:value={newComment}
              placeholder="Add a comment..."
              class="input-sm flex-1"
            />
            <button
              type="submit"
              disabled={!newComment.trim()}
              class="btn-primary px-3 py-2 text-sm"
            >
              Add
            </button>
          </form>
        </div>

        <!-- Metadata info -->
        <div class="text-xs text-slate-400 pt-2 border-t border-[var(--color-border)]">
          Added by {getDisplayNameForUser(place.createdBy)} · {formatDate(place.createdAt)}
          {#if place.updatedBy}
            · Updated by {getDisplayNameForUser(place.updatedBy)}
          {/if}
        </div>
    </div>
  </Modal>
{/if}

<style>
  .mini-map-frame {
    position: relative;
    isolation: isolate;
    height: 180px;
    border-radius: 0.75rem;
    overflow: hidden;
    border: 1px solid var(--color-border);
  }
  .mini-map-canvas { position: absolute; inset: 0; background: #ece3d2; }
  /* Same aged-cartography wash as the main Places map, lighter touch. */
  .mini-map-frame :global(.leaflet-tile-pane) {
    filter: grayscale(0.5) sepia(0.35) saturate(0.85) contrast(1.03) brightness(1.03);
  }
  :global(.dark) .mini-map-frame :global(.leaflet-tile-pane) {
    filter: grayscale(0.6) sepia(0.25) saturate(0.7) contrast(0.95) brightness(0.72) invert(0.9) hue-rotate(180deg);
  }
  .mini-map-frame :global(.mini-pin-wrap) { background: transparent; border: none; }
  .mini-map-frame :global(.mini-pin) {
    width: 30px; height: 30px;
    display: flex; align-items: center; justify-content: center;
    background: var(--pin);
    border: 2px solid #fff;
    border-radius: 50% 50% 50% 0;
    transform: rotate(-45deg);
    box-shadow: 0 3px 6px rgba(0,0,0,0.35);
  }
  .mini-map-frame :global(.mini-pin span) { transform: rotate(45deg); font-size: 13px; line-height: 1; }
</style>

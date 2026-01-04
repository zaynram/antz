<script lang="ts">
  import LocationPicker from '$lib/components/LocationPicker.svelte'
  import PhotoGallery from '$lib/components/ui/PhotoGallery.svelte'
  import { updateDocument } from '$lib/firebase'
  import { hapticLight } from '$lib/haptics'
  import { activeUser, displayNames } from '$lib/stores/app'
  import type { Place, PlaceCategory, PlaceComment, UserId } from '$lib/types'
  import { getPlaceAverageRating, getPlaceUserRating } from '$lib/types'
  import { Timestamp } from 'firebase/firestore'
  import { Calendar, Check, Coffee, ExternalLink, MapPin, Sparkles, Trees, UtensilsCrossed, Wine, X } from 'lucide-svelte'
  import type { ComponentType } from 'svelte'

  interface Props {
    place: Place | null
    onClose: () => void
  }

  let { place, onClose }: Props = $props()

  let editedNotes = $state('')
  let newComment = $state('')
  let editedCategory = $state<PlaceCategory>('restaurant')

  let previousPlaceId: string | undefined = undefined

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

  const categories: PlaceCategory[] = ['restaurant', 'cafe', 'bar', 'attraction', 'park', 'other']

  $effect(() => {
    if (place && place.id !== previousPlaceId) {
      editedNotes = place.notes || ''
      editedCategory = place.category
      previousPlaceId = place.id
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

  async function updateLocation(location: { lat: number; lng: number; address?: string } | undefined): Promise<void> {
    if (!place?.id) return
    await updateDocument<Place>('places', place.id, { location }, $activeUser)
  }

  // Cycle rating: null → half → full → null
  function cycleRating(current: number | null, starIndex: number): number | null {
    const halfValue = starIndex - 0.5
    const fullValue = starIndex

    if (current === halfValue) {
      return fullValue // half → full
    } else if (current === fullValue) {
      return null // full → clear
    } else {
      return halfValue // anything else → half
    }
  }

  // Get star fill state: 'full', 'half', or 'empty'
  function getStarFill(rating: number | null, starIndex: number): 'full' | 'half' | 'empty' {
    if (rating === null) return 'empty'
    if (rating >= starIndex) return 'full'
    if (rating >= starIndex - 0.5) return 'half'
    return 'empty'
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

  async function addDateRangeVisit(): Promise<void> {
    if (!place?.id || !rangeStartDate || !rangeEndDate) return
    hapticLight()

    const start = Timestamp.fromDate(new Date(rangeStartDate))
    const end = Timestamp.fromDate(new Date(rangeEndDate))

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
    showDateRange = false
  }

  let showDateRange = $state(false)
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

  function handleBackdropClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      onClose()
    }
  }

  function openInMaps(): void {
    if (!place?.location) return
    const { lat, lng } = place.location
    const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
    window.open(url, '_blank')
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if place}
  {@const CategoryIcon = categoryIcons[place.category]}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    onclick={handleBackdropClick}
    onkeydown={handleKeydown}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div class="bg-surface rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
      <!-- Header -->
      <div class="relative bg-accent/10 p-6">
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
              <span class="capitalize">{categoryLabels[place.category]}</span>
              {#if place.visitDates?.length}
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

      <div class="p-4 space-y-5">
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
        </div>

        <!-- Visit history -->
        {#if place.visitDates?.length}
          <div>
            <span class="block text-xs text-slate-500 dark:text-slate-400 mb-2">Visit History</span>
            <div class="flex flex-wrap gap-2">
              {#each place.visitDates as date, index}
                <span class="group/visit px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs flex items-center gap-1">
                  {formatDate(date)}
                  <button
                    type="button"
                    class="w-4 h-4 rounded-full hover:bg-red-500 hover:text-white text-slate-400 flex items-center justify-center opacity-0 group-hover/visit:opacity-100 transition-opacity"
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

        <!-- Add visit with date range -->
        {#if place.visited}
          <div>
            {#if showDateRange}
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
                    onclick={() => showDateRange = false}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            {:else}
              <div class="flex gap-2">
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
                  onclick={() => showDateRange = true}
                >
                  <span>Add Date Range</span>
                </button>
              </div>
            {/if}
          </div>
        {/if}

        <!-- Category & Rating row -->
        <div class="flex flex-wrap gap-4 items-start">
          <div class="flex-1 min-w-[120px]">
            <label for="place-category" class="block text-xs text-slate-500 dark:text-slate-400 mb-1">Category</label>
            <select
              id="place-category"
              bind:value={editedCategory}
              onchange={updateCategory}
              class="input-sm"
            >
              {#each categories as cat}
                <option value={cat}>{categoryLabels[cat]}</option>
              {/each}
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
              <div class="pt-2 border-t border-slate-200 dark:border-slate-600">
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

        <!-- Location picker -->
        <div>
          <span class="block text-xs text-slate-500 dark:text-slate-400 mb-1">Location</span>
          <LocationPicker
            value={place.location}
            onChange={updateLocation}
            placeholder="Search for address..."
          />
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
        <div class="text-xs text-slate-400 pt-2 border-t border-slate-200 dark:border-slate-700">
          Added by {getDisplayNameForUser(place.createdBy)} · {formatDate(place.createdAt)}
          {#if place.updatedBy}
            · Updated by {getDisplayNameForUser(place.updatedBy)}
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

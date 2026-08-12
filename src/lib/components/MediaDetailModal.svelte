<script lang="ts">
  import { tmdbConfig } from '$lib/config'
  import { updateDocument } from '$lib/firebase'
  import { activeUser, displayNames, displayAbbreviations, userPreferences } from '$lib/stores/app'
  import type { Media, MediaComment, MediaStatus, UserId } from '$lib/types'
  import { getUserRating, getAverageRating, hasWatched, toggleWatched } from '$lib/types'
  import { DEFAULT_ACCENT } from '$lib/accents'
  import { Timestamp } from 'firebase/firestore'
  import { Film, Tv, Gamepad2 } from 'lucide-svelte'
  import { hapticLight } from '$lib/haptics'
  import { cycleRating, getStarFill } from '$lib/utils'
  import Modal from '$lib/components/ui/Modal.svelte'

  interface Props {
    media: Media | null;
    onClose: () => void;
  }

  let { media, onClose }: Props = $props();

  let editedNotes = $state('');
  let newComment = $state('');
  let watchDateInput = $state('');
  let editedImageOverride = $state('');
  
  // Non-reactive tracking - prevents effect from creating dependencies on local form state
  let previousMediaId: string | undefined = undefined;
  let previousWatchDate: Timestamp | undefined = undefined;
  
  const statusOptions: MediaStatus[] = ['queued', 'watching', 'completed', 'dropped'];

  $effect(() => {
    if (media) {
      // Only sync when viewing a different media item
      if (media.id !== previousMediaId) {
        editedNotes = media.notes || '';
        editedImageOverride = media.imageOverride || '';

        if (media.watchDate) {
          const d = new Date(media.watchDate.toDate());
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          watchDateInput = `${year}-${month}-${day}`;
        } else {
          watchDateInput = '';
        }
        
        previousMediaId = media.id;
        previousWatchDate = media.watchDate;
      }
      // Also sync watch date if it changed externally (e.g., real-time update from other user)
      else if (media.watchDate !== previousWatchDate) {
        if (media.watchDate) {
          const d = new Date(media.watchDate.toDate());
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          watchDateInput = `${year}-${month}-${day}`;
        } else {
          watchDateInput = '';
        }
        previousWatchDate = media.watchDate;
      }
    }
  });

  function getDisplayNameForUser(userId: UserId): string {
    return $displayNames[userId];
  }

  function posterUrl(path: string | null): string | null {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    return `${tmdbConfig.imageBaseUrl}/w342${path}`;
  }

  async function updateNotes(): Promise<void> {
    if (!media?.id) return;
    await updateDocument<Media>('media', media.id, { notes: editedNotes }, $activeUser);
  }

  async function updateImageOverride(): Promise<void> {
    if (!media?.id) return;
    await updateDocument<Media>('media', media.id, { imageOverride: editedImageOverride.trim() }, $activeUser);
  }
  function clearImageOverride(): void {
    editedImageOverride = '';
    updateImageOverride();
  }

  async function updateStatus(status: MediaStatus): Promise<void> {
    if (!media?.id) return;
    hapticLight();
    await updateDocument<Media>('media', media.id, { status }, $activeUser);
  }

  const coupleUsers: UserId[] = ['Z', 'T']

  async function toggleSeen(userId: UserId): Promise<void> {
    if (!media?.id) return
    hapticLight()
    await updateDocument<Media>('media', media.id, toggleWatched(media, userId), $activeUser)
  }

  async function updateRating(userId: UserId, starIndex: number): Promise<void> {
    if (!media?.id) return;
    hapticLight();

    const currentRating = getUserRating(media, userId)
    const newRating = cycleRating(currentRating, starIndex)

    // Create or update the ratings object
    const currentRatings = media.ratings || { Z: null, T: null };
    const updatedRatings = { ...currentRatings, [userId]: newRating };

    await updateDocument<Media>('media', media.id, { ratings: updatedRatings }, $activeUser);
  }




  async function updateWatchDate(): Promise<void> {
    if (!media?.id) return;
    const watchDate = watchDateInput 
      ? Timestamp.fromDate(new Date(watchDateInput)) 
      : undefined;
    await updateDocument<Media>('media', media.id, { watchDate }, $activeUser);
  }

  async function addComment(): Promise<void> {
    if (!media?.id || !newComment.trim()) return;
    
    const comment: MediaComment = {
      id: crypto.randomUUID(),
      text: newComment.trim(),
      createdBy: $activeUser,
      createdAt: Timestamp.now()
    };
    
    const comments = [...(media.comments || []), comment];
    await updateDocument<Media>('media', media.id, { comments }, $activeUser);
    newComment = '';
  }

  async function removeComment(commentId: string): Promise<void> {
    if (!media?.id) return;
    const comments = (media.comments || []).filter(c => c.id !== commentId);
    await updateDocument<Media>('media', media.id, { comments }, $activeUser);
  }

  function formatDate(timestamp: Timestamp | undefined): string {
    if (!timestamp) return '';
    return timestamp.toDate().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }


</script>

{#if media}
  <Modal open={true} onclose={onClose} title={media.title}>
    {#snippet header()}
      <!-- Header with poster -->
      <div class="relative shrink-0">
        {#if media.imageOverride || media.posterPath}
          <img
            src={posterUrl(media.imageOverride || media.posterPath)}
            alt={media.title}
            loading="lazy"
            class="w-full h-48 object-cover rounded-t-xl"
          />
          <div class="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent rounded-t-xl"></div>
        {:else}
          <div class="w-full h-32 bg-surface-2 rounded-t-xl flex items-center justify-center text-slate-300">
            {#if media.type === 'game'}
              <Gamepad2 size={64} />
            {:else if media.type === 'tv'}
              <Tv size={64} />
            {:else}
              <Film size={64} />
            {/if}
          </div>
        {/if}

        <button
          class="absolute top-2 right-2 w-11 h-11 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors touch-manipulation"
          onclick={onClose}
        >
          ×
        </button>

        <div class="absolute bottom-3 left-4 right-4 text-white">
          <h2 class="text-xl font-bold drop-shadow-lg">{media.title}</h2>
          <div class="flex items-center gap-2 text-sm opacity-90">
            <span class="uppercase">{media.type}</span>
            {#if media.releaseDate}
              <span>·</span>
              <span>{media.releaseDate.split('-')[0]}</span>
            {/if}
            {#if media.genres?.length}
              <span>·</span>
              <span>{media.genres.slice(0, 2).join(', ')}</span>
            {/if}
          </div>
        </div>
      </div>
    {/snippet}
      
    <div class="space-y-4">
        <!-- Status & Rating row -->
        <div class="flex flex-wrap gap-4 items-start">
          <div class="flex-1 min-w-[120px]">
            <label for="media-status" class="block text-xs text-slate-500 dark:text-slate-400 mb-1">Status</label>
            <select
              id="media-status"
              value={media.status}
              onchange={(e) => updateStatus(e.currentTarget.value as MediaStatus)}
              class="w-full p-2 text-sm bg-slate-50 dark:bg-slate-800 border border-[var(--color-border)] rounded-lg"
            >
              {#each statusOptions as status}
                <option value={status}>{status}</option>
              {/each}
            </select>
          </div>
          
          <div class="flex-1 min-w-[160px]">
            <span class="block text-xs text-slate-500 dark:text-slate-400 mb-1">Watched by</span>
            <div class="flex flex-wrap gap-1.5">
              {#each coupleUsers as u}
                {@const seen = hasWatched(media, u)}
                {@const accent = $userPreferences[u]?.accentColor ?? DEFAULT_ACCENT}
                <button
                  type="button"
                  class="watch-chip touch-sm {seen ? 'is-seen' : ''}"
                  style={seen ? `background-color:${accent};border-color:${accent}` : ''}
                  onclick={() => toggleSeen(u)}
                  aria-pressed={seen}
                  title="{getDisplayNameForUser(u)} {seen ? 'has watched this' : 'has not watched this'}"
                >
                  <span class="watch-chip__badge" style={seen ? '' : `background-color:${accent}22;color:${accent}`}>
                    {$displayAbbreviations[u]}
                  </span>
                  <span class="truncate">{getDisplayNameForUser(u)}</span>
                </button>
              {/each}
            </div>
          </div>

          <div class="flex-1 min-w-[200px]">
            <span class="block text-xs text-slate-500 dark:text-slate-400 mb-1">Ratings</span>
            
            <!-- User Z Rating -->
            <div class="mb-2">
              <div class="text-xs text-slate-400 mb-0.5">{getDisplayNameForUser('Z')}'s Rating</div>
              <div class="flex">
                {#each [1, 2, 3, 4, 5] as star}
                  {@const fill = getStarFill(getUserRating(media, 'Z'), star)}
                  <button
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
                  {@const fill = getStarFill(getUserRating(media, 'T'), star)}
                  <button
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
            {#if getAverageRating(media) !== null}
              <div class="pt-2 border-t border-[var(--color-border)]">
                <div class="text-xs text-slate-400 mb-0.5">Average</div>
                <div class="flex items-center gap-2">
                  <div class="flex gap-0.5">
                    {#each [1, 2, 3, 4, 5] as star}
                      <span
                        class="text-lg {(getAverageRating(media) ?? 0) >= star ? 'text-amber-400' : (getAverageRating(media) ?? 0) >= star - 0.5 ? 'text-amber-300' : 'text-slate-300 dark:text-slate-600'}"
                      >
                        ★
                      </span>
                    {/each}
                  </div>
                  <span class="text-sm font-semibold text-slate-600 dark:text-slate-300">
                    {getAverageRating(media)?.toFixed(1)}
                  </span>
                </div>
              </div>
            {/if}
          </div>
          
          <div class="flex-1 min-w-[140px]">
            <label for="media-watch-date" class="block text-xs text-slate-500 dark:text-slate-400 mb-1">Watch Date</label>
            <div class="flex gap-2">
              <input
                id="media-watch-date"
                type="date"
                bind:value={watchDateInput}
                onchange={updateWatchDate}
                class="flex-1 p-2 text-sm bg-slate-50 dark:bg-slate-800 border border-[var(--color-border)] rounded-lg"
              />
              {#if watchDateInput}
                <button
                  onclick={() => { watchDateInput = ''; updateWatchDate(); }}
                  title="Clear date"
                  class="px-3 py-2 text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                >
                  Clear
                </button>
              {/if}
            </div>
            {#if !watchDateInput}
              <span class="text-xs text-slate-400 mt-1 block">Not specified</span>
            {/if}
          </div>
        </div>
        
        <!-- Collection & Studio Info -->
        {#if media.collection || media.productionCompanies?.length}
          <div class="flex flex-wrap gap-4">
            {#if media.collection}
              <div class="flex-1 min-w-[120px]">
                <span class="block text-xs text-slate-500 dark:text-slate-400 mb-1">Collection</span>
                <span class="text-sm font-medium text-accent">{media.collection.name}</span>
              </div>
            {/if}
            {#if media.productionCompanies?.length}
              <div class="flex-1 min-w-[120px]">
                <span class="block text-xs text-slate-500 dark:text-slate-400 mb-1">Studio</span>
                <span class="text-sm">{media.productionCompanies.map(c => c.name).join(', ')}</span>
              </div>
            {/if}
          </div>
        {/if}
        
        <!-- Overview -->
        {#if media.overview}
          <div>
            <span class="block text-xs text-slate-500 dark:text-slate-400 mb-1">Overview</span>
            <p class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{media.overview}</p>
          </div>
        {/if}
        
        <!-- Custom image override -->
        <div>
          <label for="media-image-override" class="block text-xs text-slate-500 dark:text-slate-400 mb-1">Custom image URL</label>
          <div class="flex gap-2">
            <input
              id="media-image-override"
              type="url"
              bind:value={editedImageOverride}
              onblur={updateImageOverride}
              placeholder="https://…  (overrides the poster)"
              class="flex-1 p-2 text-sm bg-slate-50 dark:bg-slate-800 border border-[var(--color-border)] rounded-lg focus:outline-none focus:border-accent"
            />
            {#if editedImageOverride}
              <button type="button" class="btn-icon-sm touch-sm" onclick={clearImageOverride} aria-label="Clear custom image">✕</button>
            {/if}
          </div>
          <p class="text-xs text-slate-400 mt-1">Use when the poster exists but won't load.</p>
        </div>

        <!-- Notes -->
        <div>
          <label for="media-notes" class="block text-xs text-slate-500 dark:text-slate-400 mb-1">Personal Notes</label>
          <textarea
            id="media-notes"
            bind:value={editedNotes}
            onblur={updateNotes}
            placeholder="Add your thoughts..."
            rows="2"
            class="w-full p-2 text-sm bg-slate-50 dark:bg-slate-800 border border-[var(--color-border)] rounded-lg resize-y focus:outline-none focus:border-accent"
          ></textarea>
        </div>
        
        <!-- Comments section -->
        <div>
          <span class="block text-xs text-slate-500 dark:text-slate-400 mb-2">Comments</span>
          
          {#if media.comments?.length}
            <div class="space-y-2 mb-3">
              {#each media.comments as comment (comment.id)}
                <div class="flex gap-2 p-2 bg-slate-50 dark:bg-slate-800 rounded-lg group">
                  <div class="flex-1">
                    <p class="text-sm">{comment.text}</p>
                    <span class="text-xs text-slate-400">
                      {getDisplayNameForUser(comment.createdBy)} · {formatDate(comment.createdAt)}
                    </span>
                  </div>
                  <button
                    class="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 md:opacity-100 transition-opacity touch-manipulation"
                    onclick={() => removeComment(comment.id)}
                  >
                    ×
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
              class="flex-1 px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-[var(--color-border)] rounded-lg focus:outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={!newComment.trim()}
              class="px-4 py-2.5 min-h-[44px] bg-accent text-white rounded-lg text-sm font-medium disabled:opacity-50 touch-manipulation"
            >
              Add
            </button>
          </form>
        </div>
        
        <!-- Metadata info -->
        <div class="text-xs text-slate-400 pt-2 border-t border-[var(--color-border)]">
          Added by {getDisplayNameForUser(media.createdBy)} · {formatDate(media.createdAt)}
          {#if media.updatedBy}
            · Updated by {getDisplayNameForUser(media.updatedBy)}
          {/if}
        </div>
    </div>
  </Modal>
{/if}

<style>
  /* Compact watched-by chips. `touch-sm` opts out of the global 44px
     coarse-pointer minimum, which stretched these into tall slabs; the chip
     keeps a comfortable 32px target without the wasted vertical padding. */
  .watch-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 2rem;
    padding: 0.2rem 0.6rem 0.2rem 0.25rem;
    border-radius: 999px;
    border: 1px solid var(--color-border);
    font-size: 0.8rem;
    font-weight: 600;
    line-height: 1;
    color: var(--color-text-muted, #57534e);
    max-width: 100%;
    transition: background-color 120ms, border-color 120ms, color 120ms;
  }
  .watch-chip.is-seen { color: #fff; }
  .watch-chip__badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.4rem;
    height: 1.4rem;
    flex: 0 0 auto;
    border-radius: 50%;
    font-size: 0.62rem;
    font-weight: 800;
    line-height: 1;
  }
  .watch-chip.is-seen .watch-chip__badge {
    background: rgba(255, 255, 255, 0.28);
    color: #fff;
  }
</style>

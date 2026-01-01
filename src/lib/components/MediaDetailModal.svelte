<script lang="ts">
  import { tmdbConfig } from '$lib/config'
  import { updateDocument } from '$lib/firebase'
  import { activeUser } from '$lib/stores/app'
  import type { Media, MediaComment, MediaStatus } from '$lib/types'
  import { Timestamp } from 'firebase/firestore'

  interface Props {
    media: Media | null;
    onClose: () => void;
  }

  let { media, onClose }: Props = $props();

  let editedNotes = $state('');
  let newComment = $state('');
  let watchDateInput = $state('');
  
  const statusOptions: MediaStatus[] = ['queued', 'watching', 'completed', 'dropped'];

  $effect(() => {
    if (media) {
      const newNotes = media.notes || '';
      const newWatchDate = media.watchDate 
        ? new Date(media.watchDate.toDate()).toISOString().split('T')[0] 
        : '';
      
      // Only update if values have changed to prevent redundant state updates
      if (editedNotes !== newNotes) {
        editedNotes = newNotes;
      }
      if (watchDateInput !== newWatchDate) {
        watchDateInput = newWatchDate;
      }
    }
  });

  function posterUrl(path: string | null): string | null {
    if (!path) return null;
    return `${tmdbConfig.imageBaseUrl}/w342${path}`;
  }

  async function updateNotes(): Promise<void> {
    if (!media?.id) return;
    await updateDocument<Media>('media', media.id, { notes: editedNotes }, $activeUser);
  }

  async function updateStatus(status: MediaStatus): Promise<void> {
    if (!media?.id) return;
    await updateDocument<Media>('media', media.id, { status }, $activeUser);
  }

  async function updateRating(rating: number | null): Promise<void> {
    if (!media?.id) return;
    await updateDocument<Media>('media', media.id, { rating }, $activeUser);
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

  function handleBackdropClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if media}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    onclick={handleBackdropClick}
    role="dialog"
    aria-modal="true"
  >
    <div class="bg-surface rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
      <!-- Header with poster -->
      <div class="relative">
        {#if media.posterPath}
          <img
            src={posterUrl(media.posterPath)}
            alt={media.title}
            class="w-full h-48 object-cover rounded-t-xl"
          />
          <div class="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent rounded-t-xl"></div>
        {:else}
          <div class="w-full h-32 bg-surface-2 rounded-t-xl flex items-center justify-center text-6xl">
            {media.type === 'game' ? '🎮' : media.type === 'tv' ? '📺' : '🎬'}
          </div>
        {/if}
        
        <button
          class="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
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
      
      <div class="p-4 space-y-4">
        <!-- Status & Rating row -->
        <div class="flex flex-wrap gap-4 items-center">
          <div class="flex-1 min-w-[120px]">
            <label class="block text-xs text-slate-500 dark:text-slate-400 mb-1">Status</label>
            <select
              value={media.status}
              onchange={(e) => updateStatus(e.currentTarget.value as MediaStatus)}
              class="w-full p-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg"
            >
              {#each statusOptions as status}
                <option value={status}>{status}</option>
              {/each}
            </select>
          </div>
          
          <div>
            <label class="block text-xs text-slate-500 dark:text-slate-400 mb-1">Rating</label>
            <div class="flex gap-1">
              {#each [1, 2, 3, 4, 5] as star}
                <button
                  class="text-xl transition-colors {(media.rating ?? 0) >= star ? 'text-amber-400' : 'text-slate-300 dark:text-slate-600 hover:text-amber-300'}"
                  onclick={() => updateRating(media.rating === star ? null : star)}
                >
                  ★
                </button>
              {/each}
            </div>
          </div>
          
          <div class="flex-1 min-w-[140px]">
            <label class="block text-xs text-slate-500 dark:text-slate-400 mb-1">Watch Date</label>
            <input
              type="date"
              bind:value={watchDateInput}
              onchange={updateWatchDate}
              class="w-full p-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg"
            />
          </div>
        </div>
        
        <!-- Overview -->
        {#if media.overview}
          <div>
            <label class="block text-xs text-slate-500 dark:text-slate-400 mb-1">Overview</label>
            <p class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{media.overview}</p>
          </div>
        {/if}
        
        <!-- Notes -->
        <div>
          <label class="block text-xs text-slate-500 dark:text-slate-400 mb-1">Personal Notes</label>
          <textarea
            bind:value={editedNotes}
            onblur={updateNotes}
            placeholder="Add your thoughts..."
            rows="2"
            class="w-full p-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg resize-y focus:outline-none focus:border-accent"
          ></textarea>
        </div>
        
        <!-- Comments section -->
        <div>
          <label class="block text-xs text-slate-500 dark:text-slate-400 mb-2">Comments</label>
          
          {#if media.comments?.length}
            <div class="space-y-2 mb-3">
              {#each media.comments as comment (comment.id)}
                <div class="flex gap-2 p-2 bg-slate-50 dark:bg-slate-800 rounded-lg group">
                  <div class="flex-1">
                    <p class="text-sm">{comment.text}</p>
                    <span class="text-xs text-slate-400">
                      {comment.createdBy} · {formatDate(comment.createdAt)}
                    </span>
                  </div>
                  <button
                    class="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 md:opacity-100 transition-opacity"
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
              class="flex-1 p-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={!newComment.trim()}
              class="px-3 py-2 bg-accent text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              Add
            </button>
          </form>
        </div>
        
        <!-- Metadata info -->
        <div class="text-xs text-slate-400 pt-2 border-t border-slate-200 dark:border-slate-700">
          Added by {media.createdBy} · {formatDate(media.createdAt)}
          {#if media.updatedBy}
            · Updated by {media.updatedBy}
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

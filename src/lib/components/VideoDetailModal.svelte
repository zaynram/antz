<script lang="ts">
  import { updateDocument } from '$lib/firebase'
  import { activeUser, displayNames } from '$lib/stores/app'
  import { getYouTubeEmbedUrl } from '$lib/youtube'
  import type { Video, VideoStatus, MediaComment, UserId } from '$lib/types'
  import { getVideoUserRating, getVideoAverageRating, createEmptyRatings, ALL_USER_IDS } from '$lib/types'
  import { Timestamp } from 'firebase/firestore'
  import { X, ExternalLink, MessageCircle, Trash2 } from 'lucide-svelte'
  import { hapticLight, hapticSuccess } from '$lib/haptics'

  interface Props {
    video: Video | null;
    onClose: () => void;
  }

  let { video, onClose }: Props = $props();

  let editedNotes = $state('');
  let newComment = $state('');
  let watchedDateInput = $state('');
  
  // Non-reactive tracking
  let previousVideoId: string | undefined = undefined;
  let previousWatchedDate: Timestamp | undefined = undefined;
  
  const statusOptions: VideoStatus[] = ['queued', 'watched', 'skipped'];

  $effect(() => {
    if (video) {
      if (video.id !== previousVideoId) {
        editedNotes = video.notes || '';
        
        if (video.watchedDate) {
          watchedDateInput = new Date(video.watchedDate.toDate()).toISOString().split('T')[0];
        } else {
          watchedDateInput = '';
        }
        
        previousVideoId = video.id;
        previousWatchedDate = video.watchedDate;
      }
      else if (video.watchedDate !== previousWatchedDate) {
        if (video.watchedDate) {
          watchedDateInput = new Date(video.watchedDate.toDate()).toISOString().split('T')[0];
        } else {
          watchedDateInput = '';
        }
        previousWatchedDate = video.watchedDate;
      }
    }
  });

  function getDisplayNameForUser(userId: UserId): string {
    return $displayNames[userId];
  }

  async function updateNotes(): Promise<void> {
    if (!video?.id) return;
    await updateDocument<Video>('videos', video.id, { notes: editedNotes }, $activeUser);
  }

  async function updateStatus(status: VideoStatus): Promise<void> {
    if (!video?.id) return;
    hapticLight();
    
    // If marking as watched, set watched date to today if not already set
    const updates: Partial<Video> = { status };
    if (status === 'watched' && !video.watchedDate) {
      updates.watchedDate = Timestamp.now();
    }
    
    await updateDocument<Video>('videos', video.id, updates, $activeUser);
  }

  // Cycle rating: null → half → full → null
  function cycleRating(current: number | null, starIndex: number): number | null {
    const halfValue = starIndex - 0.5
    const fullValue = starIndex

    if (current === halfValue) {
      return fullValue
    } else if (current === fullValue) {
      return null
    } else if (current === null || current > fullValue) {
      // When there is no rating yet, or when reducing from a higher star,
      // reset to the clicked star's half value.
      return halfValue
    } else {
      // For other cases (e.g., a lower rating from another star), keep the current rating.
      return current
    }
  }

  async function updateRating(userId: UserId, starIndex: number): Promise<void> {
    if (!video?.id) return;
    hapticLight();

    const currentRating = getVideoUserRating(video, userId)
    const newRating = cycleRating(currentRating, starIndex)

    const currentRatings = video.ratings || createEmptyRatings();
    const updatedRatings = { ...currentRatings, [userId]: newRating };

    await updateDocument<Video>('videos', video.id, { ratings: updatedRatings }, $activeUser);
  }

  async function updateWatchedDate(): Promise<void> {
    if (!video?.id) return;
    
    if (watchedDateInput) {
      const [yearStr, monthStr, dayStr] = watchedDateInput.split('-');
      const year = Number(yearStr);
      const month = Number(monthStr);
      const day = Number(dayStr);

      // Guard against invalid date input; do not update if parsing fails
      if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
        return;
      }

      const dateUtc = new Date(Date.UTC(year, month - 1, day));

      await updateDocument<Video>('videos', video.id, { 
        watchedDate: Timestamp.fromDate(dateUtc) 
      }, $activeUser);
    } else {
      await updateDocument<Video>('videos', video.id, { 
        watchedDate: undefined 
      }, $activeUser);
    }
  }

  async function addComment(): Promise<void> {
    if (!video?.id || !newComment.trim()) return;

    const comment: MediaComment = {
      id: crypto.randomUUID(),
      text: newComment.trim(),
      createdBy: $activeUser,
      createdAt: Timestamp.now(),
    };

    const updatedComments = [...(video.comments || []), comment];
    await updateDocument<Video>('videos', video.id, { comments: updatedComments }, $activeUser);
    newComment = '';
    hapticSuccess();
  }

  async function deleteComment(commentId: string): Promise<void> {
    if (!video?.id) return;
    
    const updatedComments = (video.comments || []).filter(c => c.id !== commentId);
    await updateDocument<Video>('videos', video.id, { comments: updatedComments }, $activeUser);
    hapticLight();
  }

  function formatDate(timestamp: Timestamp): string {
    return new Date(timestamp.toDate()).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function getStatusLabel(status: VideoStatus): string {
    const labels = {
      queued: 'Queued',
      watched: 'Watched',
      skipped: 'Skipped',
    };
    return labels[status];
  }
</script>

{#if video}
  <div 
    class="fixed inset-0 z-50 overflow-y-auto bg-black/50" 
    onclick={onClose}
    onkeydown={(e) => e.key === 'Escape' && onClose()}
    role="button"
    tabindex="-1"
  >
    <div class="min-h-screen px-4 py-8">
      <div 
        class="bg-white dark:bg-slate-800 rounded-lg max-w-4xl mx-auto shadow-xl"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        tabindex="0"
      >
        <!-- Header -->
        <div class="flex items-start justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <div class="flex-1 pr-4">
            <h2 class="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
              {video.title}
            </h2>
            <div class="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
              <span>Added by {getDisplayNameForUser(video.createdBy)}</span>
              <span>•</span>
              <span>{formatDate(video.createdAt)}</span>
            </div>
          </div>
          <button 
            onclick={onClose}
            class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-2 touch-feedback"
          >
            <X size={24} />
          </button>
        </div>

        <!-- Video Embed -->
        <div class="p-6 border-b border-slate-200 dark:border-slate-700">
          <div class="aspect-video bg-slate-900 rounded-lg overflow-hidden mb-4">
            <iframe
              src={getYouTubeEmbedUrl(video.videoId)}
              title={video.title}
              class="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowfullscreen
            ></iframe>
          </div>
          <a
            href={video.url}
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-2 text-accent hover:opacity-70 transition-opacity"
          >
            <ExternalLink size={16} />
            <span>Open in YouTube</span>
          </a>
        </div>

        <!-- Status & Watched Date -->
        <div class="p-6 border-b border-slate-200 dark:border-slate-700 space-y-4">
          <div>
            <span class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Status
            </span>
            <div class="flex gap-2">
              {#each statusOptions as status}
                <button
                  onclick={() => updateStatus(status)}
                  class="px-4 py-2 rounded-lg text-sm font-medium transition-all touch-feedback {video.status === status ? 'bg-accent text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'}"
                >
                  {getStatusLabel(status)}
                </button>
              {/each}
            </div>
          </div>

          {#if video.status === 'watched'}
            <div>
              <label for="watched-date" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Watched Date
              </label>
              <input
                id="watched-date"
                type="date"
                bind:value={watchedDateInput}
                onchange={updateWatchedDate}
                class="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              />
            </div>
          {/if}
        </div>

        <!-- Ratings -->
        <div class="p-6 border-b border-slate-200 dark:border-slate-700">
          <h3 class="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Ratings</h3>
          
          {#each ALL_USER_IDS as userId}
            <div class="mb-4">
              <p class="text-sm text-slate-600 dark:text-slate-400 mb-2">
                {getDisplayNameForUser(userId)}
              </p>
              <div class="flex gap-1">
                {#each [1, 2, 3, 4, 5] as star}
                  {@const userRating = getVideoUserRating(video, userId)}
                  {@const isFull = userRating !== null && userRating >= star}
                  {@const isHalf = userRating !== null && userRating >= star - 0.5 && userRating < star}
                  <button
                    onclick={() => updateRating(userId, star)}
                    class="text-2xl transition-transform hover:scale-110 touch-feedback {isFull || isHalf ? 'text-amber-400' : 'text-slate-300 dark:text-slate-600'}"
                  >
                    {isFull ? '★' : isHalf ? '⯨' : '☆'}
                  </button>
                {/each}
                {#if getVideoUserRating(video, userId)}
                  <span class="ml-2 text-sm text-slate-600 dark:text-slate-400">
                    {getVideoUserRating(video, userId)}
                  </span>
                {/if}
              </div>
            </div>
          {/each}

          {#if getVideoAverageRating(video)}
            <div class="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
              <p class="text-sm font-medium text-slate-700 dark:text-slate-300">
                Average: {getVideoAverageRating(video)?.toFixed(1)} / 5.0
              </p>
            </div>
          {/if}
        </div>

        <!-- Notes -->
        <div class="p-6 border-b border-slate-200 dark:border-slate-700">
          <label for="notes" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Notes
          </label>
          <textarea
            id="notes"
            bind:value={editedNotes}
            onblur={updateNotes}
            placeholder="Add your thoughts about this video..."
            rows="4"
            class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 resize-none"
          ></textarea>
        </div>

        <!-- Comments -->
        <div class="p-6">
          <h3 class="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
            <MessageCircle size={20} />
            <span>Comments</span>
            {#if video.comments?.length}
              <span class="text-sm text-slate-500">({video.comments.length})</span>
            {/if}
          </h3>

          {#if video.comments && video.comments.length > 0}
            <div class="space-y-3 mb-4">
              {#each video.comments as comment (comment.id)}
                <div class="bg-slate-50 dark:bg-slate-900 rounded-lg p-3">
                  <div class="flex items-start justify-between mb-2">
                    <div class="text-sm">
                      <span class="font-medium text-slate-900 dark:text-slate-100">
                        {getDisplayNameForUser(comment.createdBy)}
                      </span>
                      <span class="text-slate-500 dark:text-slate-400 ml-2">
                        {formatDate(comment.createdAt)}
                      </span>
                    </div>
                    <button
                      onclick={() => deleteComment(comment.id)}
                      class="text-slate-400 hover:text-red-500 transition-colors p-1"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <p class="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                    {comment.text}
                  </p>
                </div>
              {/each}
            </div>
          {/if}

          <div class="flex gap-2">
            <input
              type="text"
              bind:value={newComment}
              placeholder="Add a comment..."
              onkeydown={(e) => e.key === 'Enter' && addComment()}
              class="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
            />
            <button
              onclick={addComment}
              disabled={!newComment.trim()}
              class="px-4 py-2 bg-accent text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

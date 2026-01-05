<script lang="ts">
  import { addDocument, updateDocument, deleteDocument, subscribeToCollection } from '$lib/firebase'
  import { activeUser, displayNames, currentPreferences } from '$lib/stores/app'
  import { parseYouTubeUrl, getYouTubeThumbnail } from '$lib/youtube'
  import type { Video, VideoStatus } from '$lib/types'
  import { getVideoDisplayRating, createEmptyRatings } from '$lib/types'
  import { Timestamp } from 'firebase/firestore'
  import { Plus, ExternalLink, Trash2, Video as VideoIcon, RefreshCw, Download, Share2, Info } from 'lucide-svelte'
  import { hapticLight, hapticSuccess, hapticError } from '$lib/haptics'
  import { toast } from 'svelte-sonner'
  import VideoDetailModal from '$lib/components/VideoDetailModal.svelte'
  import { syncVideoQueue, isSyncAvailable, getSyncStatusMessage, getPlatformDisplayName } from '$lib/services/video-sync'
  import { exportForGrayjay, exportVideoUrlList, createShareableVideoList, downloadExportFile, copyToClipboard } from '$lib/services/grayjay-sync'

  let videos = $state<Video[]>([])
  let loading = $state(true)
  let showAddModal = $state(false)
  let selectedVideo = $state<Video | null>(null)
  let newVideoUrl = $state('')
  let newVideoTitle = $state('')
  let filterStatus = $state<VideoStatus | 'all'>('all')
  let syncing = $state(false)
  let showExportMenu = $state(false)

  // Close export menu on click outside
  $effect(() => {
    if (!showExportMenu) return
    
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-export-menu]')) {
        showExportMenu = false
      }
    }
    
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  })

  // Subscribe to videos collection
  $effect(() => {
    const unsubscribe = subscribeToCollection<Video>('videos', (updatedVideos) => {
      videos = updatedVideos.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())
      loading = false
    })

    return () => {
      unsubscribe()
    }
  })

  // Filter videos by status
  let filteredVideos = $derived(
    filterStatus === 'all' 
      ? videos 
      : videos.filter(v => v.status === filterStatus)
  )

  function openAddModal() {
    showAddModal = true
    newVideoUrl = ''
    newVideoTitle = ''
  }

  function closeAddModal() {
    showAddModal = false
    newVideoUrl = ''
    newVideoTitle = ''
  }

  async function addVideo() {
    const trimmedUrl = newVideoUrl.trim()
    if (!trimmedUrl) {
      toast.error('Please enter a video URL')
      hapticError()
      return
    }

    const videoInfo = parseYouTubeUrl(trimmedUrl)
    if (!videoInfo) {
      toast.error('Invalid YouTube URL')
      hapticError()
      return
    }

    try {
      const video: Omit<Video, 'id'> = {
        title: newVideoTitle.trim() || 'Untitled Video',
        url: videoInfo.url,
        videoId: videoInfo.videoId,
        thumbnailUrl: getYouTubeThumbnail(videoInfo.videoId),
        status: 'queued',
        rating: null,
        ratings: createEmptyRatings(),
        notes: '',
        createdBy: $activeUser,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      }

      await addDocument('videos', video, $activeUser)
      hapticSuccess()
      toast.success('Video added to queue')
      closeAddModal()
    } catch (error) {
      console.error('Error adding video:', error)
      hapticError()
      toast.error('Failed to add video')
    }
  }

  function openVideoDetail(video: Video) {
    selectedVideo = video
  }

  function closeVideoDetail() {
    selectedVideo = null
  }

  async function deleteVideo(videoId: string) {
    if (!confirm('Are you sure you want to delete this video?')) return
    
    try {
      await deleteDocument('videos', videoId)
      hapticLight()
      toast.success('Video deleted')
    } catch (error) {
      console.error('Error deleting video:', error)
      hapticError()
      toast.error('Failed to delete video')
    }
  }

  async function quickUpdateStatus(videoId: string, status: VideoStatus) {
    try {
      await updateDocument<Video>('videos', videoId, { status }, $activeUser)
      hapticLight()
    } catch (error) {
      console.error('Error updating status:', error)
      hapticError()
    }
  }

  function getStatusLabel(status: VideoStatus): string {
    const labels = {
      queued: 'Queued',
      watched: 'Watched',
      skipped: 'Skipped',
    }
    return labels[status]
  }

  function getStatusColor(status: VideoStatus): string {
    const colors = {
      queued: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
      watched: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
      skipped: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
    }
    return colors[status]
  }

  function renderStars(rating: number | null): string {
    if (rating === null) return '☆☆☆☆☆'
    const fullStars = Math.floor(rating)
    const hasHalf = rating % 1 !== 0
    let stars = '★'.repeat(fullStars)
    if (hasHalf) stars += '⯨'
    stars += '☆'.repeat(5 - fullStars - (hasHalf ? 1 : 0))
    return stars
  }

  async function handleSync() {
    if (!$currentPreferences) {
      toast.error('Preferences not loaded')
      return
    }

    if (!isSyncAvailable($currentPreferences)) {
      toast.error('Sync not configured. Please check settings.')
      return
    }

    syncing = true
    hapticLight()
    
    try {
      const result = await syncVideoQueue($currentPreferences, videos)
      
      if (result.success) {
        hapticSuccess()
        toast.success(result.message)
      } else {
        hapticError()
        if (result.errors && result.errors.length > 0) {
          toast.error(`${result.message}\n${result.errors.join('\n')}`)
        } else {
          toast.error(result.message)
        }
      }
    } catch (error) {
      console.error('Sync error:', error)
      hapticError()
      toast.error('Sync failed. Please try again.')
    } finally {
      syncing = false
    }
  }

  function handleExportJSON() {
    const data = exportForGrayjay(videos)
    downloadExportFile(data, 'video-queue.json', 'application/json')
    toast.success('Exported video queue as JSON')
    showExportMenu = false
  }

  function handleExportURLList() {
    const data = exportVideoUrlList(videos)
    downloadExportFile(data, 'video-urls.txt', 'text/plain')
    toast.success('Exported video URLs as text')
    showExportMenu = false
  }

  async function handleShareList() {
    const text = createShareableVideoList(videos)
    const success = await copyToClipboard(text)
    if (success) {
      toast.success('Video list copied to clipboard')
    } else {
      toast.error('Failed to copy to clipboard')
    }
    showExportMenu = false
  }

</script>

<div class="min-h-screen bg-slate-50 dark:bg-slate-900">
  <!-- Header -->
  <div class="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
    <div class="max-w-7xl mx-auto px-4 py-4">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
          <VideoIcon size={28} class="text-accent" />
          <h1 class="text-2xl font-bold text-slate-900 dark:text-slate-100">Video Queue</h1>
        </div>
        <div class="flex items-center gap-2">
          <!-- Sync button -->
          {#if $currentPreferences && $currentPreferences.videoSyncPlatform !== 'none'}
            <button
              onclick={handleSync}
              disabled={syncing || !isSyncAvailable($currentPreferences)}
              class="flex items-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:opacity-90 transition-opacity touch-feedback disabled:opacity-50"
              title={getSyncStatusMessage($currentPreferences)}
            >
              <RefreshCw size={18} class={syncing ? 'animate-spin' : ''} />
              <span class="hidden sm:inline">{syncing ? 'Syncing...' : getPlatformDisplayName($currentPreferences.videoSyncPlatform || 'none')}</span>
            </button>
          {/if}
          
          <!-- Export menu for Grayjay -->
          {#if $currentPreferences && $currentPreferences.videoSyncPlatform === 'grayjay'}
            <div class="relative" data-export-menu>
              <button
                onclick={() => showExportMenu = !showExportMenu}
                class="flex items-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:opacity-90 transition-opacity touch-feedback"
              >
                <Download size={18} />
                <span class="hidden sm:inline">Export</span>
              </button>
              
              {#if showExportMenu}
                <div class="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden z-10">
                  <button
                    onclick={handleExportJSON}
                    class="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                  >
                    <Download size={16} />
                    Export JSON
                  </button>
                  <button
                    onclick={handleExportURLList}
                    class="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                  >
                    <Download size={16} />
                    Export URLs
                  </button>
                  <button
                    onclick={handleShareList}
                    class="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                  >
                    <Share2 size={16} />
                    Copy to Clipboard
                  </button>
                </div>
              {/if}
            </div>
          {/if}
          
          <button
            onclick={openAddModal}
            class="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg hover:opacity-90 transition-opacity touch-feedback"
          >
            <Plus size={20} />
            <span>Add Video</span>
          </button>
        </div>
      </div>

      <!-- Sync status info -->
      {#if $currentPreferences && $currentPreferences.videoSyncPlatform !== 'none'}
        <div class="mb-3 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center gap-2 text-sm">
          <Info size={16} class="text-blue-600 dark:text-blue-400" />
          <span class="text-blue-800 dark:text-blue-200">
            Syncing to {getPlatformDisplayName($currentPreferences.videoSyncPlatform || 'none')}: {getSyncStatusMessage($currentPreferences)}
          </span>
        </div>
      {/if}

      <!-- Filter tabs -->
      <div class="flex gap-2 overflow-x-auto">
        <button
          onclick={() => { filterStatus = 'all'; hapticLight() }}
          class="px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap {filterStatus === 'all' ? 'bg-accent text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'}"
        >
          All ({videos.length})
        </button>
        <button
          onclick={() => { filterStatus = 'queued'; hapticLight() }}
          class="px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap {filterStatus === 'queued' ? 'bg-accent text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'}"
        >
          Queued ({videos.filter(v => v.status === 'queued').length})
        </button>
        <button
          onclick={() => { filterStatus = 'watched'; hapticLight() }}
          class="px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap {filterStatus === 'watched' ? 'bg-accent text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'}"
        >
          Watched ({videos.filter(v => v.status === 'watched').length})
        </button>
      </div>
    </div>
  </div>

  <!-- Content -->
  <div class="max-w-7xl mx-auto px-4 py-6">
    {#if loading}
      <div class="text-center py-12">
        <div class="inline-block w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin"></div>
      </div>
    {:else if filteredVideos.length === 0}
      <div class="text-center py-12">
        <VideoIcon size={48} class="mx-auto text-slate-300 dark:text-slate-600 mb-4" />
        <p class="text-slate-500 dark:text-slate-400">
          {filterStatus === 'all' ? 'No videos yet. Add your first video!' : `No ${filterStatus} videos`}
        </p>
      </div>
    {:else}
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {#each filteredVideos as video (video.id)}
          <div class="bg-white dark:bg-slate-800 rounded-lg overflow-hidden shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-md transition-shadow">
            <!-- Thumbnail -->
            <button
              onclick={() => openVideoDetail(video)}
              class="relative w-full aspect-video bg-slate-100 dark:bg-slate-900 overflow-hidden group"
            >
              {#if video.thumbnailUrl}
                <img
                  src={video.thumbnailUrl}
                  alt={video.title}
                  class="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
              {/if}
              <div class="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                <div class="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 dark:bg-slate-800/90 rounded-full p-3">
                  <VideoIcon size={24} class="text-accent" />
                </div>
              </div>
            </button>

            <!-- Info -->
            <div class="p-4">
              <div class="flex items-start justify-between gap-2 mb-2">
                <h3 class="font-semibold text-slate-900 dark:text-slate-100 line-clamp-2 flex-1">
                  {video.title}
                </h3>
                <button
                  onclick={() => window.open(video.url, '_blank')}
                  class="text-accent hover:opacity-70 transition-opacity p-1 touch-feedback"
                  title="Open in YouTube"
                >
                  <ExternalLink size={18} />
                </button>
              </div>

              <!-- Status badge -->
              <div class="flex items-center gap-2 mb-3">
                <span class="text-xs px-2 py-1 rounded-full {getStatusColor(video.status)}">
                  {getStatusLabel(video.status)}
                </span>
                {#if getVideoDisplayRating(video)}
                  <span class="text-sm text-amber-500">
                    {renderStars(getVideoDisplayRating(video))}
                  </span>
                {/if}
              </div>

              <!-- Added by -->
              <p class="text-xs text-slate-500 dark:text-slate-400 mb-3">
                Added by {$displayNames[video.createdBy]}
              </p>

              <!-- Actions -->
              <div class="flex gap-2">
                {#if video.status === 'queued'}
                  <button
                    onclick={() => quickUpdateStatus(video.id!, 'watched')}
                    class="flex-1 px-3 py-1.5 text-sm bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 rounded hover:opacity-80 transition-opacity touch-feedback"
                  >
                    Mark Watched
                  </button>
                {:else if video.status === 'watched'}
                  <button
                    onclick={() => openVideoDetail(video)}
                    class="flex-1 px-3 py-1.5 text-sm bg-accent text-white rounded hover:opacity-80 transition-opacity touch-feedback"
                  >
                    View Details
                  </button>
                {/if}
                <button
                  onclick={() => deleteVideo(video.id!)}
                  class="px-3 py-1.5 text-sm bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 rounded hover:opacity-80 transition-opacity touch-feedback"
                  title="Delete video"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<!-- Add Video Modal -->
{#if showAddModal}
  <div 
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" 
    onclick={closeAddModal}
    onkeydown={(e) => e.key === 'Escape' && closeAddModal()}
    role="button"
    tabindex="-1"
    aria-label="Close modal"
  >
    <div 
      class="bg-white dark:bg-slate-800 rounded-lg max-w-md w-full p-6 shadow-xl" 
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      tabindex="0"
    >
      <h2 class="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4">Add Video</h2>
      
      <div class="space-y-4">
        <div>
          <label for="video-url" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            YouTube URL *
          </label>
          <input
            id="video-url"
            type="text"
            bind:value={newVideoUrl}
            placeholder="https://www.youtube.com/watch?v=..."
            class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
          />
        </div>

        <div>
          <label for="video-title" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Title (optional)
          </label>
          <input
            id="video-title"
            type="text"
            bind:value={newVideoTitle}
            placeholder="Enter a custom title"
            class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
          />
        </div>
      </div>

      <div class="flex gap-3 mt-6">
        <button
          onclick={closeAddModal}
          class="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          Cancel
        </button>
        <button
          onclick={addVideo}
          class="flex-1 px-4 py-2 bg-accent text-white rounded-lg hover:opacity-90 transition-opacity"
        >
          Add Video
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Video Detail Modal -->
{#if selectedVideo}
  <VideoDetailModal video={selectedVideo} onClose={closeVideoDetail} />
{/if}

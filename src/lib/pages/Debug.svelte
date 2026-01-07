<script lang="ts">
  import { tmdbConfig } from '$lib/config'
  import { db, subscribeToCollection } from '$lib/firebase'
  import { createComment, createIssue, formatDate, hasGitHubToken, listComments, listIssues, testGitHubToken, updateIssue, type GitHubApiError, type GitHubIssue, type GitHubComment } from '$lib/github'
  import { activeUser, currentPreferences } from '$lib/stores/app'
  import type { Media, Note, Place, Video } from '$lib/types'
  import { createEmptyRatings } from '$lib/types'
  import { fetchGameThumbnail } from '$lib/wikipedia'
  import { collection, doc, getDocs, updateDoc } from 'firebase/firestore'
  import { Bug, Cpu, Database, Download, Edit, ExternalLink, GitBranch, HardDrive, Image, MessageSquare, Plus, RefreshCw, Trash2, Upload, Wifi, X } from 'lucide-svelte'
  import { onMount } from 'svelte'
  import { toast } from 'svelte-sonner'

  // Data stats
  let media = $state<Media[]>([])
  let notes = $state<Note[]>([])
  let places = $state<Place[]>([])
  let unsubMedia: (() => void) | undefined
  let unsubNotes: (() => void) | undefined
  let unsubPlaces: (() => void) | undefined

  // Migration state
  let migrating = $state(false)
  let migrationLog = $state<string[]>([])
  let migrationStats = $state({ updated: 0, skipped: 0, failed: 0 })

  // Image migration state
  let imageMigrating = $state(false)
  let imageMigrationLog = $state<string[]>([])
  let imageMigrationStats = $state({ updated: 0, skipped: 0, failed: 0 })
  type ImageMigrationType = 'all' | 'games' | 'movies' | 'tv'
  let imageMigrationType = $state<ImageMigrationType>('all')

  // Video ratings migration state
  let videoRatingsMigrating = $state(false)
  let videoRatingsMigrationLog = $state<string[]>([])
  let videoRatingsMigrationStats = $state({ updated: 0, skipped: 0, failed: 0 })

  // GitHub issues state
  let issues = $state<GitHubIssue[]>([])
  let issuesLoading = $state(false)
  let issuesPage = $state(1)
  // let issuesHasMore = $state(false) // Reserved for pagination
  let issuesState = $state<'open' | 'closed' | 'all'>('all')
  let selectedIssue = $state<GitHubIssue | null>(null)
  let issueComments = $state<GitHubComment[]>([])
  let commentsLoading = $state(false)
  let showCreateIssue = $state(false)
  let showEditIssue = $state(false)
  let newIssueTitle = $state('')
  let newIssueBody = $state('')
  let editIssueTitle = $state('')
  let editIssueBody = $state('')
  let newCommentBody = $state('')
  let isSubmitting = $state(false)

  // System info
  let systemInfo = $state({
    userAgent: '',
    platform: '',
    language: '',
    online: true,
    serviceWorker: false,
    storage: { used: 0, quota: 0 },
  })

  onMount(() => {
    unsubMedia = subscribeToCollection<Media>('media', (items) => { media = items })
    unsubNotes = subscribeToCollection<Note>('notes', (items) => { notes = items })
    unsubPlaces = subscribeToCollection<Place>('places', (items) => { places = items })

    // Gather system info
    systemInfo.userAgent = navigator.userAgent
    systemInfo.platform = navigator.platform
    systemInfo.language = navigator.language
    systemInfo.online = navigator.onLine
    systemInfo.serviceWorker = 'serviceWorker' in navigator

    // Get storage estimate
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      navigator.storage.estimate().then((estimate) => {
        systemInfo.storage = {
          used: estimate.usage || 0,
          quota: estimate.quota || 0,
        }
      })
    }

    return () => {
      unsubMedia?.()
      unsubNotes?.()
      unsubPlaces?.()
    }
  })

  // Stats
  let dataStats = $derived({
    totalMedia: media.length,
    movies: media.filter(m => m.type === 'movie').length,
    tv: media.filter(m => m.type === 'tv').length,
    games: media.filter(m => m.type === 'game').length,
    completed: media.filter(m => m.status === 'completed').length,
    watching: media.filter(m => m.status === 'watching').length,
    queued: media.filter(m => m.status === 'queued').length,
    withGenres: media.filter(m => m.genres && m.genres.length > 0).length,
    withCollection: media.filter(m => m.collection).length,
    notes: notes.length,
    places: places.length,
    visitedPlaces: places.filter(p => p.visited).length,
    // Image stats
    missingImages: media.filter(m => !m.posterPath).length,
    gamesMissingImages: media.filter(m => m.type === 'game' && !m.posterPath).length,
    moviesMissingImages: media.filter(m => m.type === 'movie' && !m.posterPath).length,
    tvMissingImages: media.filter(m => m.type === 'tv' && !m.posterPath).length,
  })

  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  // Migration functions
  async function fetchMovieDetails(tmdbId: number) {
    const res = await fetch(`${tmdbConfig.baseUrl}/movie/${tmdbId}?api_key=${tmdbConfig.apiKey}`)
    if (res.ok === false) throw new Error(`Failed: ${res.status}`)
    return res.json()
  }

  async function fetchTVDetails(tmdbId: number) {
    const res = await fetch(`${tmdbConfig.baseUrl}/tv/${tmdbId}?api_key=${tmdbConfig.apiKey}`)
    if (res.ok === false) throw new Error(`Failed: ${res.status}`)
    return res.json()
  }

  async function enrichMedia(tmdbId: number, mediaType: 'movie' | 'tv') {
    if (mediaType === 'movie') {
      const details = await fetchMovieDetails(tmdbId)
      return {
        genres: details.genres?.map((g: {name: string}) => g.name) ?? [],
        collection: details.belongs_to_collection
          ? { id: details.belongs_to_collection.id, name: details.belongs_to_collection.name }
          : null,
        productionCompanies: details.production_companies?.map((c: {id: number, name: string}) => ({ id: c.id, name: c.name })) ?? []
      }
    } else {
      const details = await fetchTVDetails(tmdbId)
      return {
        genres: details.genres?.map((g: {name: string}) => g.name) ?? [],
        collection: null,
        productionCompanies: details.production_companies?.map((c: {id: number, name: string}) => ({ id: c.id, name: c.name })) ?? []
      }
    }
  }

  async function runMigration() {
    migrating = true
    migrationLog = ['Starting migration...']
    migrationStats = { updated: 0, skipped: 0, failed: 0 }

    try {
      const mediaRef = collection(db, 'media')
      const snapshot = await getDocs(mediaRef)

      migrationLog = [...migrationLog, `Found ${snapshot.docs.length} media items`]

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data()
        const { tmdbId, type, genres, title } = data

        if (genres?.length > 0 || !tmdbId || type === 'game') {
          migrationLog = [...migrationLog, `Skip: ${title}`]
          migrationStats.skipped++
          continue
        }

        try {
          migrationLog = [...migrationLog, `Enriching: ${title}...`]
          const enriched = await enrichMedia(tmdbId, type as 'movie' | 'tv')

          await updateDoc(doc(db, 'media', docSnap.id), {
            genres: enriched.genres,
            collection: enriched.collection,
            productionCompanies: enriched.productionCompanies
          })

          migrationLog = [...migrationLog, `  âœ“ ${enriched.genres.join(', ')}`]
          migrationStats.updated++

          await new Promise(r => setTimeout(r, 300))
        } catch (e) {
          migrationLog = [...migrationLog, `  âœ— Failed: ${e}`]
          migrationStats.failed++
        }
      }

      migrationLog = [...migrationLog, '', `Complete: ${migrationStats.updated} updated, ${migrationStats.skipped} skipped, ${migrationStats.failed} failed`]
    } catch (e) {
      migrationLog = [...migrationLog, `Error: ${e}`]
    } finally {
      migrating = false
    }
  }

  // Fetch TMDB poster for movie/TV
  async function fetchTMDBPoster(tmdbId: number, mediaType: 'movie' | 'tv'): Promise<string | null> {
    try {
      const endpoint = mediaType === 'movie' ? 'movie' : 'tv'
      const res = await fetch(`${tmdbConfig.baseUrl}/${endpoint}/${tmdbId}?api_key=${tmdbConfig.apiKey}`)
      if (res.ok === false) return null
      const data = await res.json()
      return data.poster_path || null
    } catch {
      return null
    }
  }

  // Search TMDB for movie/TV by title
  async function searchTMDBByTitle(title: string, mediaType: 'movie' | 'tv'): Promise<{ tmdbId: number; posterPath: string } | null> {
    try {
      const endpoint = mediaType === 'movie' ? 'movie' : 'tv'
      const params = new URLSearchParams({
        api_key: tmdbConfig.apiKey,
        query: title,
        include_adult: 'false'
      })
      const res = await fetch(`${tmdbConfig.baseUrl}/search/${endpoint}?${params}`)
      if (res.ok === false) return null
      const data = await res.json()
      const first = data.results?.[0]
      if (first && first.poster_path) {
        return { tmdbId: first.id, posterPath: first.poster_path }
      }
      return null
    } catch {
      return null
    }
  }

  // Run image migration
  async function runImageMigration() {
    imageMigrating = true
    imageMigrationLog = [`Starting image migration (${imageMigrationType})...`]
    imageMigrationStats = { updated: 0, skipped: 0, failed: 0 }

    try {
      const mediaRef = collection(db, 'media')
      const snapshot = await getDocs(mediaRef)

      // Filter based on type selection
      const itemsToProcess = snapshot.docs.filter((docSnap: { data: () => { [_: string]: string } }) => {
        const data = docSnap.data()
        if (data.posterPath) return false // Already has image
        if (imageMigrationType === 'all') return true
        return data.type === imageMigrationType.replace('s', '') // 'games' -> 'game'
      })

      imageMigrationLog = [...imageMigrationLog, `Found ${itemsToProcess.length} items missing images`]

      for (const docSnap of itemsToProcess) {
        const data = docSnap.data()
        const { type, title, tmdbId } = data

        try {
          let posterPath: string | null = null

          if (type === 'game') {
            // Use Wikipedia for games
            imageMigrationLog = [...imageMigrationLog, `Searching Wikipedia: ${title}...`]
            posterPath = await fetchGameThumbnail(title)
          } else if (type === 'movie' || type === 'tv') {
            // Try TMDB - first by ID if available, then by title search
            if (tmdbId) {
              imageMigrationLog = [...imageMigrationLog, `Fetching TMDB (ID ${tmdbId}): ${title}...`]
              posterPath = await fetchTMDBPoster(tmdbId, type)
            }

            if (!posterPath) {
              imageMigrationLog = [...imageMigrationLog, `Searching TMDB: ${title}...`]
              const result = await searchTMDBByTitle(title, type)
              if (result) {
                posterPath = result.posterPath
                // Also update tmdbId if we didn't have one
                if (!tmdbId) {
                  await updateDoc(doc(db, 'media', docSnap.id), {
                    tmdbId: result.tmdbId,
                    posterPath: posterPath
                  })
                  imageMigrationLog = [...imageMigrationLog, `  âœ“ Found + linked TMDB ID ${result.tmdbId}`]
                  imageMigrationStats.updated++
                  await new Promise(r => setTimeout(r, 300))
                  continue
                }
              }
            }
          }

          if (posterPath) {
            await updateDoc(doc(db, 'media', docSnap.id), { posterPath })
            imageMigrationLog = [...imageMigrationLog, `  âœ“ Updated image`]
            imageMigrationStats.updated++
          } else {
            imageMigrationLog = [...imageMigrationLog, `  - No image found`]
            imageMigrationStats.skipped++
          }

          // Rate limiting
          await new Promise(r => setTimeout(r, 300))
        } catch (e) {
          imageMigrationLog = [...imageMigrationLog, `  âœ— Failed: ${e}`]
          imageMigrationStats.failed++
        }
      }

      imageMigrationLog = [...imageMigrationLog, '', `Complete: ${imageMigrationStats.updated} updated, ${imageMigrationStats.skipped} no image found, ${imageMigrationStats.failed} failed`]
    } catch (e) {
      imageMigrationLog = [...imageMigrationLog, `Error: ${e}`]
    } finally {
      imageMigrating = false
    }
  }

  // Video ratings migration - ensures all videos have proper ratings structure
  async function runVideoRatingsMigration() {
    videoRatingsMigrating = true
    videoRatingsMigrationLog = ['Starting video ratings migration...']
    videoRatingsMigrationStats = { updated: 0, skipped: 0, failed: 0 }

    try {
      const videosSnapshot = await getDocs(collection(db, 'videos'))
      videoRatingsMigrationLog = [...videoRatingsMigrationLog, `Found ${videosSnapshot.docs.length} videos`]

      for (const videoDoc of videosSnapshot.docs) {
        const data = videoDoc.data() as Video
        const title = data.title || 'Untitled'

        try {
          // Check if ratings structure needs updating
          const needsUpdate = !data.ratings ||
                             Object.keys(data.ratings).length === 0 ||
                             typeof data.ratings !== 'object'

          if (needsUpdate) {
            videoRatingsMigrationLog = [...videoRatingsMigrationLog, `Updating: ${title}...`]

            const updates: Partial<Video> = {
              ratings: createEmptyRatings()
            }

            await updateDoc(doc(db, 'videos', videoDoc.id), updates)
            videoRatingsMigrationLog = [...videoRatingsMigrationLog, `  âœ“ Updated ratings structure`]
            videoRatingsMigrationStats.updated++
          } else {
            videoRatingsMigrationLog = [...videoRatingsMigrationLog, `Skip: ${title} (already has ratings)`]
            videoRatingsMigrationStats.skipped++
          }
        } catch (e) {
          videoRatingsMigrationLog = [...videoRatingsMigrationLog, `  âœ— Failed: ${e}`]
          videoRatingsMigrationStats.failed++
        }
      }

      videoRatingsMigrationLog = [...videoRatingsMigrationLog, '', `Complete: ${videoRatingsMigrationStats.updated} updated, ${videoRatingsMigrationStats.skipped} skipped, ${videoRatingsMigrationStats.failed} failed`]
    } catch (e) {
      videoRatingsMigrationLog = [...videoRatingsMigrationLog, `Error: ${e}`]
    } finally {
      videoRatingsMigrating = false
    }
  }

  // GitHub issues functions
  async function loadIssues() {
    if (!hasGitHubToken()) {
      toast.error('GitHub token not configured')
      return
    }

    issuesLoading = true
    try {
      const result = await listIssues(issuesState, issuesPage)
      issues = result.issues
      // issuesHasMore = result.hasMore // Reserved for pagination
    } catch (err) {
      console.error('Failed to load issues:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to load issues'
      toast.error(errorMessage)
      
      // Test token if we got an auth error (401 or 403 status code)
      if (err && typeof err === 'object' && 'status' in err) {
        const apiError = err as GitHubApiError
        if (apiError.status === 401 || apiError.status === 403) {
          const tokenTest = await testGitHubToken()
          if (!tokenTest.valid) {
            console.error('Token validation failed:', tokenTest.error)
            toast.error(`Token issue: ${tokenTest.error}`)
          }
        }
      }
    } finally {
      issuesLoading = false
    }
  }

  async function selectIssue(issue: GitHubIssue) {
    selectedIssue = issue
    issueComments = []
    commentsLoading = true
    try {
      const comments = await listComments(issue.number)
      issueComments = comments
    } catch (err) {
      console.error('Failed to load comments:', err)
      toast.error('Failed to load comments')
    } finally {
      commentsLoading = false
    }
  }

  async function handleCreateIssue() {
    if (!newIssueTitle.trim()) {
      toast.error('Issue title is required')
      return
    }

    isSubmitting = true
    try {
      await createIssue({
        title: newIssueTitle.trim(),
        body: newIssueBody.trim() || '',
      })
      toast.success('Issue created successfully')
      showCreateIssue = false
      newIssueTitle = ''
      newIssueBody = ''
      await loadIssues()
    } catch (err) {
      console.error('Failed to create issue:', err)
      toast.error('Failed to create issue')
    } finally {
      isSubmitting = false
    }
  }

  async function handleEditIssue() {
    if (!selectedIssue || !editIssueTitle.trim()) {
      toast.error('Issue title is required')
      return
    }

    isSubmitting = true
    try {
      const updated = await updateIssue(selectedIssue.number, {
        title: editIssueTitle.trim(),
        body: editIssueBody.trim() || '',
      })
      toast.success('Issue updated successfully')
      showEditIssue = false
      selectedIssue = updated
      await loadIssues()
    } catch (err) {
      console.error('Failed to update issue:', err)
      toast.error('Failed to update issue')
    } finally {
      isSubmitting = false
    }
  }

  async function handleAddComment() {
    if (!selectedIssue || !newCommentBody.trim()) {
      toast.error('Comment body is required')
      return
    }

    isSubmitting = true
    try {
      const comment = await createComment(selectedIssue.number, newCommentBody.trim())
      issueComments = [...issueComments, comment]
      newCommentBody = ''
      toast.success('Comment added successfully')
    } catch (err) {
      console.error('Failed to add comment:', err)
      toast.error('Failed to add comment')
    } finally {
      isSubmitting = false
    }
  }

  async function handleToggleIssueState() {
    if (!selectedIssue) return

    const newState = selectedIssue.state === 'open' ? 'closed' : 'open'
    isSubmitting = true
    try {
      const updated = await updateIssue(selectedIssue.number, { state: newState })
      toast.success(`Issue ${newState}`)
      selectedIssue = updated
      await loadIssues()
    } catch (err) {
      console.error('Failed to toggle issue state:', err)
      toast.error('Failed to toggle issue state')
    } finally {
      isSubmitting = false
    }
  }

  function openEditIssue() {
    if (!selectedIssue) return
    editIssueTitle = selectedIssue.title
    editIssueBody = selectedIssue.body || ''
    showEditIssue = true
  }

  // Cache management
  async function clearCache() {
    if (!confirm('Clear all cached data? This will reload the page.')) return

    try {
      // Clear localStorage
      localStorage.clear()

      // Clear service worker caches
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map(key => caches.delete(key)))
      }

      // Unregister service worker
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations()
        await Promise.all(registrations.map(reg => reg.unregister()))
      }

      window.location.reload()
    } catch (e) {
      console.error('Failed to clear cache:', e)
    }
  }

  // Export data
  function exportData() {
    const data = {
      exportedAt: new Date().toISOString(),
      media: media,
      notes: notes,
      places: places,
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `antz-backup-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }
</script>

<div class="max-w-3xl mx-auto space-y-6">
  <header class="flex items-center gap-3">
    <Bug size={28} class="text-accent" />
    <h1 class="text-2xl font-bold">Debug Panel</h1>
  </header>

  <!-- Data Stats -->
  <section class="bg-surface border border-slate-200 dark:border-slate-700 rounded-xl p-4">
    <div class="flex items-center gap-2 mb-4">
      <Database size={18} class="text-slate-400" />
      <h2 class="font-semibold">Data Statistics</h2>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
      <div>
        <p class="text-slate-400 text-xs uppercase">Media</p>
        <p class="text-xl font-bold">{dataStats.totalMedia}</p>
        <p class="text-xs text-slate-500">
          {dataStats.movies} movies Â· {dataStats.tv} TV Â· {dataStats.games} games
        </p>
      </div>
      <div>
        <p class="text-slate-400 text-xs uppercase">Status</p>
        <p class="text-xl font-bold">{dataStats.completed}</p>
        <p class="text-xs text-slate-500">
          completed Â· {dataStats.watching} watching Â· {dataStats.queued} queued
        </p>
      </div>
      <div>
        <p class="text-slate-400 text-xs uppercase">Enriched</p>
        <p class="text-xl font-bold">{dataStats.withGenres}</p>
        <p class="text-xs text-slate-500">
          with genres Â· {dataStats.withCollection} in collections
        </p>
      </div>
      <div>
        <p class="text-slate-400 text-xs uppercase">Other</p>
        <p class="text-xl font-bold">{dataStats.notes + dataStats.places}</p>
        <p class="text-xs text-slate-500">
          {dataStats.notes} notes Â· {dataStats.places} places ({dataStats.visitedPlaces} visited)
        </p>
      </div>
    </div>
  </section>

  <!-- System Info -->
  <section class="bg-surface border border-slate-200 dark:border-slate-700 rounded-xl p-4">
    <div class="flex items-center gap-2 mb-4">
      <Cpu size={18} class="text-slate-400" />
      <h2 class="font-semibold">System Info</h2>
    </div>

    <div class="space-y-2 text-sm">
      <div class="flex items-center gap-2">
        <Wifi size={14} class={systemInfo.online ? 'text-emerald-500' : 'text-red-500'} />
        <span>{systemInfo.online ? 'Online' : 'Offline'}</span>
      </div>
      <div class="flex items-center gap-2">
        <HardDrive size={14} class="text-slate-400" />
        <span>Storage: {formatBytes(systemInfo.storage.used)} / {formatBytes(systemInfo.storage.quota)}</span>
      </div>
      <div class="text-xs text-slate-400 font-mono break-all">
        {systemInfo.platform} Â· {systemInfo.language}
      </div>
      <div class="text-xs text-slate-400">
        SW: {systemInfo.serviceWorker ? 'Supported' : 'Not supported'} Â· User: {$activeUser}
      </div>
    </div>
  </section>

  <!-- Quick Actions -->
  <section class="bg-surface border border-slate-200 dark:border-slate-700 rounded-xl p-4">
    <h2 class="font-semibold mb-4">Quick Actions</h2>

    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        class="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
        onclick={exportData}
      >
        <Download size={16} />
        Export Data
      </button>

      <button
        type="button"
        class="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
        onclick={() => window.location.reload()}
      >
        <RefreshCw size={16} />
        Reload App
      </button>

      <button
        type="button"
        class="flex items-center gap-2 px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
        onclick={clearCache}
      >
        <Trash2 size={16} />
        Clear Cache
      </button>
    </div>
  </section>

  <!-- Migration Tool -->
  <section class="bg-surface border border-slate-200 dark:border-slate-700 rounded-xl p-4">
    <h2 class="font-semibold mb-2">Media Migration</h2>
    <p class="text-sm text-slate-500 mb-4">
      Backfill existing media with TMDB genres, collections, and production companies.
      Only processes items without genres.
    </p>

    <button
      type="button"
      onclick={runMigration}
      disabled={migrating}
      class="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium disabled:opacity-50 mb-4"
    >
      {#if migrating}
        <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
        Migrating...
      {:else}
        <Upload size={16} />
        Run Migration
      {/if}
    </button>

    {#if migrationLog.length > 0}
      <div class="flex gap-4 mb-3 text-xs">
        <span class="text-emerald-500">Updated: {migrationStats.updated}</span>
        <span class="text-slate-400">Skipped: {migrationStats.skipped}</span>
        <span class="text-red-500">Failed: {migrationStats.failed}</span>
      </div>

      <div class="bg-slate-900 text-slate-300 p-3 rounded-lg font-mono text-xs max-h-48 overflow-y-auto">
        {#each migrationLog as line}
          <div class:text-emerald-400={line.includes('âœ“')} class:text-red-400={line.includes('âœ—')}>{line}</div>
        {/each}
      </div>
    {/if}
  </section>

  <!-- Image Migration Tool -->
  <section class="bg-surface border border-slate-200 dark:border-slate-700 rounded-xl p-4">
    <div class="flex items-center gap-2 mb-2">
      <Image size={18} class="text-slate-400" />
      <h2 class="font-semibold">Fix Missing Images</h2>
    </div>
    <p class="text-sm text-slate-500 mb-4">
      Fetch missing poster images from TMDB (movies/TV) and Wikipedia (games).
      {#if dataStats.missingImages > 0}
        <span class="text-amber-500 font-medium">
          {dataStats.missingImages} items missing images
          ({dataStats.gamesMissingImages} games, {dataStats.moviesMissingImages} movies, {dataStats.tvMissingImages} TV)
        </span>
      {:else}
        <span class="text-emerald-500">All items have images!</span>
      {/if}
    </p>

    <div class="flex flex-wrap items-center gap-3 mb-4">
      <select
        bind:value={imageMigrationType}
        class="px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
        disabled={imageMigrating}
      >
        <option value="all">All Types ({dataStats.missingImages})</option>
        <option value="games">Games Only ({dataStats.gamesMissingImages})</option>
        <option value="movies">Movies Only ({dataStats.moviesMissingImages})</option>
        <option value="tv">TV Only ({dataStats.tvMissingImages})</option>
      </select>

      <button
        type="button"
        onclick={runImageMigration}
        disabled={imageMigrating || dataStats.missingImages === 0}
        class="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium disabled:opacity-50"
      >
        {#if imageMigrating}
          <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          Fetching Images...
        {:else}
          <Image size={16} />
          Fetch Images
        {/if}
      </button>
    </div>

    {#if imageMigrationLog.length > 0}
      <div class="flex gap-4 mb-3 text-xs">
        <span class="text-emerald-500">Updated: {imageMigrationStats.updated}</span>
        <span class="text-slate-400">Not found: {imageMigrationStats.skipped}</span>
        <span class="text-red-500">Failed: {imageMigrationStats.failed}</span>
      </div>

      <div class="bg-slate-900 text-slate-300 p-3 rounded-lg font-mono text-xs max-h-48 overflow-y-auto">
        {#each imageMigrationLog as line}
          <div class:text-emerald-400={line.includes('âœ“')} class:text-red-400={line.includes('âœ—')} class:text-slate-500={line.includes('- No')}>{line}</div>
        {/each}
      </div>
    {/if}
  </section>

  <!-- Video Ratings Migration Tool -->
  <section class="bg-surface border border-slate-200 dark:border-slate-700 rounded-xl p-4">
    <h2 class="font-semibold mb-2">Video Ratings Migration</h2>
    <p class="text-sm text-slate-600 dark:text-slate-400 mb-4">
      Ensures all videos have the proper ratings structure for per-user ratings.
    </p>

    <button
      type="button"
      onclick={runVideoRatingsMigration}
      disabled={videoRatingsMigrating}
      class="px-4 py-2 bg-accent text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity flex items-center gap-2"
    >
      {#if videoRatingsMigrating}
        <RefreshCw size={16} class="animate-spin" />
        <span>Migrating...</span>
      {:else}
        <Database size={16} />
        <span>Run Video Ratings Migration</span>
      {/if}
    </button>

    {#if videoRatingsMigrationLog.length > 0}
      <div class="mt-4 flex gap-4 text-sm">
        <span class="text-emerald-500">Updated: {videoRatingsMigrationStats.updated}</span>
        <span class="text-slate-400">Skipped: {videoRatingsMigrationStats.skipped}</span>
        <span class="text-red-500">Failed: {videoRatingsMigrationStats.failed}</span>
      </div>

      <div class="mt-4 bg-slate-900 text-slate-300 p-3 rounded-lg font-mono text-xs overflow-y-auto max-h-96">
        {#each videoRatingsMigrationLog as line}
          <div class:text-emerald-400={line.includes('âœ“')} class:text-red-400={line.includes('âœ—')}>{line}</div>
        {/each}
      </div>
    {/if}
  </section>

  <!-- GitHub Issues -->
  <section class="bg-surface border border-slate-200 dark:border-slate-700 rounded-xl p-4">
    <div class="flex items-center gap-2 mb-2">
      <GitBranch size={18} class="text-slate-400" />
      <h2 class="font-semibold">GitHub Issues</h2>
    </div>
    <p class="text-sm text-slate-500 mb-4">
      Manage GitHub issues for this repository.
      {#if !hasGitHubToken()}
        <span class="text-amber-500 font-medium">Configure GitHub token in config.ts to enable.</span>
      {/if}
    </p>

    {#if hasGitHubToken()}
      <div class="space-y-4">
        <!-- Issue List View -->
        {#if !selectedIssue && !showCreateIssue}
          <div class="flex flex-wrap items-center gap-3 mb-4">
            <label for="issue-state-filter" class="sr-only">Filter issues by state</label>
            <select
              id="issue-state-filter"
              bind:value={issuesState}
              onchange={loadIssues}
              class="px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
            >
              <option value="all">All Issues</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </select>

            <button
              type="button"
              onclick={loadIssues}
              disabled={issuesLoading}
              class="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
            >
              {#if issuesLoading}
                <div class="w-4 h-4 border-2 border-slate-600 border-t-transparent rounded-full animate-spin" aria-hidden="true"></div>
                <span class="sr-only" role="status" aria-live="polite">Loading issues...</span>
                Loading...
              {:else}
                <RefreshCw size={16} />
                Refresh
              {/if}
            </button>

            <button
              type="button"
              onclick={() => showCreateIssue = true}
              class="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:opacity-90"
            >
              <Plus size={16} />
              New Issue
            </button>
          </div>

          {#if issues.length > 0}
            <div class="space-y-2 max-h-96 overflow-y-auto">
              {#each issues as issue (issue.number)}
                <button
                  type="button"
                  onclick={() => selectIssue(issue)}
                  class="w-full text-left p-3 bg-slate-50 dark:bg-slate-800 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <div class="flex items-start gap-2">
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 mb-1">
                        <span class="text-sm font-medium truncate">{issue.title}</span>
                        <span class="text-xs px-2 py-0.5 rounded-full {issue.state === 'open' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'}">
                          {issue.state}
                        </span>
                      </div>
                      <div class="flex items-center gap-2 text-xs text-slate-500">
                        <span>#{issue.number}</span>
                        <span>â€¢</span>
                        <span>{formatDate(issue.updated_at)}</span>
                        {#if issue.comments > 0}
                          <span>â€¢</span>
                          <span class="flex items-center gap-1">
                            <MessageSquare size={12} />
                            {issue.comments}
                          </span>
                        {/if}
                      </div>
                    </div>
                  </div>
                </button>
              {/each}
            </div>
          {:else if !issuesLoading}
            <div class="text-center py-8 text-slate-400">
              <p>No issues found</p>
            </div>
          {/if}
        {/if}

        <!-- Create Issue Form -->
        {#if showCreateIssue}
          <div class="space-y-4">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-semibold">Create New Issue</h3>
              <button
                type="button"
                onclick={() => { showCreateIssue = false; newIssueTitle = ''; newIssueBody = '' }}
                class="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"
                aria-label="Close create issue form"
              >
                <X size={16} />
              </button>
            </div>

            <div>
              <label for="new-issue-title" class="block text-sm font-medium mb-2">Title</label>
              <input
                id="new-issue-title"
                type="text"
                bind:value={newIssueTitle}
                placeholder="Issue title"
                class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:border-accent"
              />
            </div>

            <div>
              <label for="new-issue-body" class="block text-sm font-medium mb-2">Description</label>
              <textarea
                id="new-issue-body"
                bind:value={newIssueBody}
                placeholder="Describe the issue..."
                rows="6"
                class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:border-accent resize-none"
              ></textarea>
            </div>

            <div class="flex gap-2">
              <button
                type="button"
                onclick={handleCreateIssue}
                disabled={isSubmitting || !newIssueTitle.trim()}
                class="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
              >
                {#if isSubmitting}
                  <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true"></div>
                  <span class="sr-only" role="status" aria-live="polite">Creating issue...</span>
                  Creating...
                {:else}
                  Create Issue
                {/if}
              </button>
              <button
                type="button"
                onclick={() => { showCreateIssue = false; newIssueTitle = ''; newIssueBody = '' }}
                class="px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        {/if}

        <!-- Issue Detail View -->
        {#if selectedIssue && !showEditIssue}
          <div class="space-y-4">
            <div class="flex items-start justify-between gap-2 mb-4">
              <button
                type="button"
                onclick={() => { selectedIssue = null; issueComments = [] }}
                class="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                â† Back to list
              </button>
              <div class="flex gap-2">
                <button
                  type="button"
                  onclick={openEditIssue}
                  class="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                  title="Edit issue"
                >
                  <Edit size={16} />
                </button>
                <a
                  href={selectedIssue.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                  title="Open on GitHub"
                >
                  <ExternalLink size={16} />
                </a>
              </div>
            </div>

            <div class="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg">
              <div class="flex items-center gap-2 mb-2">
                <h3 class="font-semibold text-lg">{selectedIssue.title}</h3>
                <span class="text-xs px-2 py-1 rounded-full {selectedIssue.state === 'open' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'}">
                  {selectedIssue.state}
                </span>
              </div>
              <div class="text-xs text-slate-500 mb-3">
                <span>#{selectedIssue.number}</span>
                <span> â€¢ opened {formatDate(selectedIssue.created_at)}</span>
                <span> by {selectedIssue.user.login}</span>
              </div>
              {#if selectedIssue.body}
                <div class="text-sm whitespace-pre-wrap">{selectedIssue.body}</div>
              {:else}
                <div class="text-sm text-slate-400 italic">No description provided</div>
              {/if}
            </div>

            <div class="flex gap-2">
              <button
                type="button"
                onclick={handleToggleIssueState}
                disabled={isSubmitting}
                class="px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-sm hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50"
              >
                {isSubmitting ? 'Updating...' : selectedIssue.state === 'open' ? 'Close Issue' : 'Reopen Issue'}
              </button>
            </div>

            <!-- Comments Section -->
            <div class="border-t border-slate-200 dark:border-slate-700 pt-4">
              <h4 class="font-semibold mb-3">
                Comments ({issueComments.length})
              </h4>

              {#if commentsLoading}
                <div class="text-center py-4">
                  <div class="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" aria-hidden="true"></div>
                  <span class="sr-only" role="status" aria-live="polite">Loading comments...</span>
                </div>
              {:else if issueComments.length > 0}
                <div class="space-y-3 mb-4 max-h-64 overflow-y-auto">
                  {#each issueComments as comment (comment.id)}
                    <div class="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg">
                      <div class="text-xs text-slate-500 mb-2">
                        <span class="font-medium">{comment.user.login}</span>
                        <span> â€¢ {formatDate(comment.created_at)}</span>
                      </div>
                      <div class="text-sm whitespace-pre-wrap">{comment.body}</div>
                    </div>
                  {/each}
                </div>
              {/if}

              <!-- Add Comment Form -->
              <div class="space-y-2">
                <textarea
                  bind:value={newCommentBody}
                  placeholder="Add a comment..."
                  rows="3"
                  class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:border-accent resize-none text-sm"
                ></textarea>
                <button
                  type="button"
                  onclick={handleAddComment}
                  disabled={isSubmitting || !newCommentBody.trim()}
                  class="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {#if isSubmitting}
                    <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true"></div>
                    <span class="sr-only" role="status" aria-live="polite">Adding comment...</span>
                    Adding...
                  {:else}
                    <MessageSquare size={16} />
                    Add Comment
                  {/if}
                </button>
              </div>
            </div>
          </div>
        {/if}

        <!-- Edit Issue Form -->
        {#if showEditIssue && selectedIssue}
          <div class="space-y-4">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-semibold">Edit Issue #{selectedIssue.number}</h3>
              <button
                type="button"
                onclick={() => { showEditIssue = false; editIssueTitle = ''; editIssueBody = '' }}
                class="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"
                aria-label="Close edit issue form"
              >
                <X size={16} />
              </button>
            </div>

            <div>
              <label for="edit-issue-title" class="block text-sm font-medium mb-2">Title</label>
              <input
                id="edit-issue-title"
                type="text"
                bind:value={editIssueTitle}
                placeholder="Issue title"
                class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:border-accent"
              />
            </div>

            <div>
              <label for="edit-issue-body" class="block text-sm font-medium mb-2">Description</label>
              <textarea
                id="edit-issue-body"
                bind:value={editIssueBody}
                placeholder="Describe the issue..."
                rows="6"
                class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:border-accent resize-none"
              ></textarea>
            </div>

            <div class="flex gap-2">
              <button
                type="button"
                onclick={handleEditIssue}
                disabled={isSubmitting || !editIssueTitle.trim()}
                class="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
              >
                {#if isSubmitting}
                  <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true"></div>
                  <span class="sr-only" role="status" aria-live="polite">Updating issue...</span>
                  Updating...
                {:else}
                  Update Issue
                {/if}
              </button>
              <button
                type="button"
                onclick={() => { showEditIssue = false; editIssueTitle = ''; editIssueBody = '' }}
                class="px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </section>

  <!-- Current Preferences -->
  <section class="bg-surface border border-slate-200 dark:border-slate-700 rounded-xl p-4">
    <h2 class="font-semibold mb-2">Current Preferences</h2>
    <pre class="bg-slate-900 text-slate-300 p-3 rounded-lg font-mono text-xs overflow-x-auto">{JSON.stringify($currentPreferences, null, 2)}</pre>
  </section>
</div>

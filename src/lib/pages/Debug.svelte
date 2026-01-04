<script lang="ts">
  import { collection, getDocs, updateDoc, doc } from 'firebase/firestore'
  import { db, subscribeToCollection } from '$lib/firebase'
  import { tmdbConfig } from '$lib/config'
  import { activeUser, currentPreferences } from '$lib/stores/app'
  import type { Media, Note, Place } from '$lib/types'
  import { onMount } from 'svelte'
  import { Bug, Database, Trash2, RefreshCw, Download, Upload, Cpu, HardDrive, Wifi, Image } from 'lucide-svelte'
  import { fetchGameThumbnail } from '$lib/wikipedia'

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

          migrationLog = [...migrationLog, `  ✓ ${enriched.genres.join(', ')}`]
          migrationStats.updated++

          await new Promise(r => setTimeout(r, 300))
        } catch (e) {
          migrationLog = [...migrationLog, `  ✗ Failed: ${e}`]
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
      const itemsToProcess = snapshot.docs.filter(docSnap => {
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
                  imageMigrationLog = [...imageMigrationLog, `  ✓ Found + linked TMDB ID ${result.tmdbId}`]
                  imageMigrationStats.updated++
                  await new Promise(r => setTimeout(r, 300))
                  continue
                }
              }
            }
          }

          if (posterPath) {
            await updateDoc(doc(db, 'media', docSnap.id), { posterPath })
            imageMigrationLog = [...imageMigrationLog, `  ✓ Updated image`]
            imageMigrationStats.updated++
          } else {
            imageMigrationLog = [...imageMigrationLog, `  - No image found`]
            imageMigrationStats.skipped++
          }

          // Rate limiting
          await new Promise(r => setTimeout(r, 300))
        } catch (e) {
          imageMigrationLog = [...imageMigrationLog, `  ✗ Failed: ${e}`]
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
          {dataStats.movies} movies · {dataStats.tv} TV · {dataStats.games} games
        </p>
      </div>
      <div>
        <p class="text-slate-400 text-xs uppercase">Status</p>
        <p class="text-xl font-bold">{dataStats.completed}</p>
        <p class="text-xs text-slate-500">
          completed · {dataStats.watching} watching · {dataStats.queued} queued
        </p>
      </div>
      <div>
        <p class="text-slate-400 text-xs uppercase">Enriched</p>
        <p class="text-xl font-bold">{dataStats.withGenres}</p>
        <p class="text-xs text-slate-500">
          with genres · {dataStats.withCollection} in collections
        </p>
      </div>
      <div>
        <p class="text-slate-400 text-xs uppercase">Other</p>
        <p class="text-xl font-bold">{dataStats.notes + dataStats.places}</p>
        <p class="text-xs text-slate-500">
          {dataStats.notes} notes · {dataStats.places} places ({dataStats.visitedPlaces} visited)
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
        {systemInfo.platform} · {systemInfo.language}
      </div>
      <div class="text-xs text-slate-400">
        SW: {systemInfo.serviceWorker ? 'Supported' : 'Not supported'} · User: {$activeUser}
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
          <div class:text-emerald-400={line.includes('✓')} class:text-red-400={line.includes('✗')}>{line}</div>
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
          <div class:text-emerald-400={line.includes('✓')} class:text-red-400={line.includes('✗')} class:text-slate-500={line.includes('- No')}>{line}</div>
        {/each}
      </div>
    {/if}
  </section>

  <!-- Current Preferences -->
  <section class="bg-surface border border-slate-200 dark:border-slate-700 rounded-xl p-4">
    <h2 class="font-semibold mb-2">Current Preferences</h2>
    <pre class="bg-slate-900 text-slate-300 p-3 rounded-lg font-mono text-xs overflow-x-auto">{JSON.stringify($currentPreferences, null, 2)}</pre>
  </section>
</div>

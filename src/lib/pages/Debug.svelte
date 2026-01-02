<script lang="ts">
  import { collection, getDocs, updateDoc, doc } from 'firebase/firestore'
  import { db } from '$lib/firebase'
  import { tmdbConfig } from '$lib/config'

  let migrating = $state(false);
  let log = $state<string[]>([]);
  let stats = $state({ updated: 0, skipped: 0, failed: 0 });

  async function fetchMovieDetails(tmdbId: number) {
    const res = await fetch(`${tmdbConfig.baseUrl}/movie/${tmdbId}?api_key=${tmdbConfig.apiKey}`)
    if (!res.ok) throw new Error(`Failed: ${res.status}`)
    return res.json()
  }

  async function fetchTVDetails(tmdbId: number) {
    const res = await fetch(`${tmdbConfig.baseUrl}/tv/${tmdbId}?api_key=${tmdbConfig.apiKey}`)
    if (!res.ok) throw new Error(`Failed: ${res.status}`)
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
    migrating = true;
    log = [];
    stats = { updated: 0, skipped: 0, failed: 0 };

    try {
      const mediaRef = collection(db, 'media')
      const snapshot = await getDocs(mediaRef)
      
      log = [...log, `Found ${snapshot.docs.length} media items`]
      
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data()
        const { tmdbId, type, genres, title } = data
        
        if (genres?.length > 0 || !tmdbId || type === 'game') {
          log = [...log, `Skip: ${title} (${!tmdbId ? 'no tmdbId' : genres?.length ? 'has genres' : 'game'})`]
          stats.skipped++
          continue
        }
        
        try {
          log = [...log, `Enriching: ${title}...`]
          const enriched = await enrichMedia(tmdbId, type as 'movie' | 'tv')
          
          await updateDoc(doc(db, 'media', docSnap.id), {
            genres: enriched.genres,
            collection: enriched.collection,
            productionCompanies: enriched.productionCompanies
          })
          
          log = [...log, `  ✓ ${enriched.genres.length} genres, collection: ${enriched.collection?.name ?? 'none'}`]
          stats.updated++
          
          await new Promise(r => setTimeout(r, 300))
        } catch (e) {
          log = [...log, `  ✗ Failed: ${e}`]
          stats.failed++
        }
      }
      
      log = [...log, `Done: ${stats.updated} updated, ${stats.skipped} skipped, ${stats.failed} failed`]
    } catch (e) {
      log = [...log, `Error: ${e}`]
    } finally {
      migrating = false
    }
  }
</script>

<div class="p-6 max-w-2xl mx-auto">
  <h1 class="text-2xl font-bold mb-4">Debug Panel</h1>
  
  <section class="mb-8">
    <h2 class="text-lg font-semibold mb-2">Media Migration</h2>
    <p class="text-slate-500 mb-4">Backfill existing media with TMDB genres, collections, and production companies.</p>
  
  <button
    onclick={runMigration}
    disabled={migrating}
    class="px-4 py-2 bg-accent text-white rounded-lg font-medium disabled:opacity-50 mb-4"
  >
    {migrating ? 'Migrating...' : 'Run Migration'}
  </button>
  
  <div class="flex gap-4 mb-4 text-sm">
    <span class="text-emerald-500">Updated: {stats.updated}</span>
    <span class="text-slate-400">Skipped: {stats.skipped}</span>
    <span class="text-red-500">Failed: {stats.failed}</span>
  </div>
  
  <div class="bg-slate-900 text-slate-100 p-4 rounded-lg font-mono text-xs h-96 overflow-y-auto">
    {#each log as line}
      <div>{line}</div>
    {/each}
  </div>
  </section>
</div>

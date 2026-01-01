<script lang="ts">
  import { addDocument, deleteDocument, subscribeToCollection, updateDocument } from '$lib/firebase'
  import { activeUser } from '$lib/stores/app'
  import type { Place, PlaceCategory } from '$lib/types'
  import { Timestamp } from 'firebase/firestore'
  import { onMount } from 'svelte'

  let places = $state<Place[]>([]);
  let unsubscribe: (() => void) | undefined;
  let showForm = $state(false);
  let newPlace = $state({ name: '', category: 'restaurant' as PlaceCategory, notes: '' });
  let activeTab = $state<'all' | 'to-visit' | 'visited'>('all');

  const categories: PlaceCategory[] = ['restaurant', 'cafe', 'bar', 'attraction', 'park', 'other'];
  const tabs: Array<'all' | 'to-visit' | 'visited'> = ['all', 'to-visit', 'visited'];

  const categoryIcons: Record<PlaceCategory, string> = {
    restaurant: '🍽️',
    cafe: '☕',
    bar: '🍸',
    attraction: '🎢',
    park: '🌳',
    other: '📍'
  };

  onMount(() => {
    unsubscribe = subscribeToCollection<Place>('places', (items) => {
      places = items;
    });

    return () => unsubscribe?.();
  });

  async function addPlace(): Promise<void> {
    if (!newPlace.name.trim()) return;

    await addDocument<Place>(
      'places',
      {
        name: newPlace.name,
        category: newPlace.category,
        notes: newPlace.notes,
        visited: false,
        visitDates: [],
        rating: null
      },
      $activeUser
    );

    newPlace = { name: '', category: 'restaurant', notes: '' };
    showForm = false;
  }

  async function toggleVisited(place: Place): Promise<void> {
    if (!place.id) return;
    const now = Timestamp.now();
    const visitDates = place.visited ? place.visitDates : [...(place.visitDates || []), now];

    await updateDocument<Place>(
      'places',
      place.id,
      {
        visited: !place.visited,
        visitDates
      },
      $activeUser
    );
  }

  async function remove(id: string): Promise<void> {
    if (confirm('Remove this place?')) {
      await deleteDocument('places', id);
    }
  }

  let filteredPlaces = $derived(places.filter((p) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'visited') return p.visited;
    if (activeTab === 'to-visit') return !p.visited;
    return true;
  }));
</script>

<div>
  <header class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-bold">Places</h1>
    <button
      class="w-9 h-9 rounded-full bg-accent text-white text-2xl leading-none"
      onclick={() => (showForm = !showForm)}
    >
      {showForm ? '×' : '+'}
    </button>
  </header>

  {#if showForm}
    <form
      class="flex flex-col gap-3 p-4 mb-6 bg-surface border border-slate-200 dark:border-slate-700 rounded-xl"
      onsubmit={(e) => { e.preventDefault(); addPlace(); }}
    >
      <input
        type="text"
        placeholder="Place name"
        class="px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:border-accent"
        bind:value={newPlace.name}
      />
      <select
        class="px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg"
        bind:value={newPlace.category}
      >
        {#each categories as cat}
          <option value={cat}>{categoryIcons[cat]} {cat}</option>
        {/each}
      </select>
      <textarea
        placeholder="Notes (optional)"
        rows="2"
        class="px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg resize-y focus:outline-none focus:border-accent"
        bind:value={newPlace.notes}
      ></textarea>
      <button
        type="submit"
        class="self-end px-6 py-2 bg-accent text-white rounded-lg font-medium"
      >
        Add Place
      </button>
    </form>
  {/if}

  <div class="flex gap-2 mb-6">
    {#each tabs as tab}
      <button
        class="px-4 py-2 rounded-lg font-medium capitalize transition-colors"
        class:bg-accent={activeTab === tab}
        class:text-white={activeTab === tab}
        class:bg-surface={activeTab !== tab}
        class:text-slate-400={activeTab !== tab}
        onclick={() => (activeTab = tab)}
      >
        {tab}
      </button>
    {/each}
  </div>

  <div class="flex flex-col gap-3">
    {#each filteredPlaces as place (place.id)}
      <article
        class="flex items-start gap-4 p-4 bg-surface border border-slate-200 dark:border-slate-700 rounded-xl transition-opacity"
        class:opacity-70={place.visited}
      >
        <span class="text-2xl shrink-0">{categoryIcons[place.category]}</span>
        <div class="flex-1 min-w-0">
          <h3 class="font-medium" class:line-through={place.visited}>{place.name}</h3>
          {#if place.notes}
            <p class="text-sm text-slate-500 dark:text-slate-400 mb-1">{place.notes}</p>
          {/if}
          <span class="text-xs text-slate-400">
            Added by {place.createdBy}
            {#if place.visited && place.visitDates?.length}
              · Visited {place.visitDates.length}×
            {/if}
          </span>
        </div>
        <div class="flex gap-2">
          <button
            class="w-8 h-8 rounded-full border flex items-center justify-center transition-colors"
            class:bg-accent={place.visited}
            class:border-accent={place.visited}
            class:text-white={place.visited}
            class:bg-slate-50={!place.visited}
            class:dark:bg-slate-800={!place.visited}
            class:border-slate-200={!place.visited}
            class:dark:border-slate-600={!place.visited}
            class:text-slate-400={!place.visited}
            onclick={() => toggleVisited(place)}
          >
            {place.visited ? '✓' : '○'}
          </button>
          <button
            class="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-red-500 hover:border-red-500 transition-colors"
            onclick={() => place.id && remove(place.id)}
          >
            ×
          </button>
        </div>
      </article>
    {:else}
      <p class="text-center text-slate-500 dark:text-slate-400 py-12">
        No places yet. Add somewhere you want to go!
      </p>
    {/each}
  </div>
</div>

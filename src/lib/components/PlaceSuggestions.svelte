<script lang="ts">
  import { searchNearbyPlaces, getCurrentPosition, formatDistance, type PlaceSuggestion, type Coordinates } from '$lib/services/location';
  import { currentPreferences } from '$lib/stores/app';
  import type { PlaceCategory } from '$lib/types';

  interface Props {
    onAddPlace: (suggestion: PlaceSuggestion) => void;
  }

  let { onAddPlace }: Props = $props();

  let suggestions = $state<PlaceSuggestion[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let selectedCategory = $state<PlaceCategory>('restaurant');
  let expanded = $state(false);

  const categories: PlaceCategory[] = ['restaurant', 'cafe', 'bar', 'attraction', 'park', 'other'];
  const categoryIcons: Record<PlaceCategory, string> = {
    restaurant: '🍽️',
    cafe: '☕',
    bar: '🍸',
    attraction: '🎢',
    park: '🌳',
    other: '📍'
  };

  async function loadSuggestions(): Promise<void> {
    error = null;
    loading = true;
    suggestions = [];
    
    try {
      let coords: Coordinates | null = null;
      
      // Priority: reference location > current location > auto-detect
      if ($currentPreferences.referenceLocation) {
        coords = {
          lat: $currentPreferences.referenceLocation.lat,
          lng: $currentPreferences.referenceLocation.lng
        };
      } else if ($currentPreferences.currentLocation) {
        coords = {
          lat: $currentPreferences.currentLocation.lat,
          lng: $currentPreferences.currentLocation.lng
        };
      } else if ($currentPreferences.locationMode === 'auto') {
        coords = await getCurrentPosition();
      }
      
      if (!coords) {
        error = 'Set a location in Preferences to get suggestions';
        return;
      }
      
      const radius = $currentPreferences.searchRadius || 5000;
      suggestions = await searchNearbyPlaces(coords, selectedCategory, radius);
      
      if (suggestions.length === 0) {
        error = `No ${selectedCategory}s found within ${formatDistance(radius)}`;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load suggestions';
    } finally {
      loading = false;
    }
  }

  function handleAdd(suggestion: PlaceSuggestion): void {
    onAddPlace(suggestion);
    // Remove from suggestions list
    suggestions = suggestions.filter(s => s.id !== suggestion.id);
  }

  // Check if location is configured
  let hasLocation = $derived(
    $currentPreferences.locationMode !== 'off' && 
    ($currentPreferences.referenceLocation || $currentPreferences.currentLocation || $currentPreferences.locationMode === 'auto')
  );
</script>

<div class="mb-6">
  <button
    class="w-full flex items-center justify-between p-4 bg-surface border border-slate-200 dark:border-slate-700 rounded-xl hover:border-accent transition-colors"
    onclick={() => expanded = !expanded}
  >
    <div class="flex items-center gap-2">
      <span class="text-xl">✨</span>
      <span class="font-medium">Discover Places</span>
      {#if $currentPreferences.referenceLocation}
        <span class="text-xs text-slate-400">
          near {$currentPreferences.referenceLocation.address?.split(',')[0] || 'reference'}
        </span>
      {/if}
    </div>
    <span class="text-slate-400 transition-transform" class:rotate-180={expanded}>▼</span>
  </button>
  
  {#if expanded}
    <div class="mt-2 p-4 bg-surface border border-slate-200 dark:border-slate-700 rounded-xl">
      {#if !hasLocation}
        <p class="text-sm text-slate-500 dark:text-slate-400 text-center py-4">
          Enable location in <span class="font-medium">Preferences</span> to discover nearby places
        </p>
      {:else}
        <div class="flex flex-wrap gap-2 mb-4">
          {#each categories as cat}
            <button
              class="px-3 py-1.5 rounded-full text-sm transition-colors {selectedCategory === cat ? 'bg-accent text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}"
              onclick={() => { selectedCategory = cat; loadSuggestions(); }}
            >
              {categoryIcons[cat]} {cat}
            </button>
          {/each}
        </div>
        
        {#if loading}
          <div class="flex items-center justify-center py-8">
            <div class="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
          </div>
        {:else if error}
          <p class="text-sm text-slate-500 dark:text-slate-400 text-center py-4">{error}</p>
        {:else if suggestions.length > 0}
          <div class="space-y-2 max-h-64 overflow-y-auto">
            {#each suggestions.slice(0, 10) as suggestion (suggestion.id)}
              <div class="flex items-center gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors">
                <span class="text-lg shrink-0">{categoryIcons[suggestion.category]}</span>
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-sm truncate">{suggestion.name}</div>
                  <div class="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    <span>{formatDistance(suggestion.distance)}</span>
                    {#if suggestion.address}
                      <span class="truncate">· {suggestion.address}</span>
                    {/if}
                  </div>
                </div>
                <button
                  class="shrink-0 w-7 h-7 rounded-full bg-accent/10 text-accent flex items-center justify-center hover:bg-accent hover:text-white transition-colors"
                  onclick={() => handleAdd(suggestion)}
                  title="Add to list"
                >
                  +
                </button>
              </div>
            {/each}
          </div>
          {#if suggestions.length > 10}
            <p class="text-xs text-slate-400 text-center mt-2">
              Showing 10 of {suggestions.length} results
            </p>
          {/if}
        {:else}
          <button
            class="w-full py-3 text-sm text-accent hover:bg-accent/10 rounded-lg transition-colors"
            onclick={loadSuggestions}
          >
            Search {categoryIcons[selectedCategory]} {selectedCategory}s nearby
          </button>
        {/if}
      {/if}
    </div>
  {/if}
</div>

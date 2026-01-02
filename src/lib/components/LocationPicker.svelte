<script lang="ts">
  import { geocode, reverseGeocode, getCurrentPosition, type GeocodedLocation } from '$lib/services/location';
  import type { GeoLocation } from '$lib/types';

  interface Props {
    value: GeoLocation | undefined;
    onChange: (location: GeoLocation | undefined) => void;
    placeholder?: string;
  }

  let { value, onChange, placeholder = 'Search for a location...' }: Props = $props();

  let searchQuery = $state('');
  let searchResults = $state<GeocodedLocation[]>([]);
  let searching = $state(false);
  let detectingLocation = $state(false);
  let error = $state<string | null>(null);
  let showDropdown = $state(false);

  // Debounce search
  let searchTimeout: ReturnType<typeof setTimeout> | null = null;

  function handleSearchInput(): void {
    error = null;
    
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    
    if (!searchQuery.trim()) {
      searchResults = [];
      showDropdown = false;
      return;
    }

    searching = true;
    searchTimeout = setTimeout(async () => {
      try {
        searchResults = await geocode(searchQuery);
        showDropdown = searchResults.length > 0;
      } catch (e) {
        error = e instanceof Error ? e.message : 'Search failed';
        searchResults = [];
      } finally {
        searching = false;
      }
    }, 500); // Debounce + rate limit buffer
  }

  function selectResult(result: GeocodedLocation): void {
    onChange({
      lat: result.coordinates.lat,
      lng: result.coordinates.lng,
      address: result.displayName
    });
    searchQuery = '';
    searchResults = [];
    showDropdown = false;
  }

  async function detectCurrentLocation(): Promise<void> {
    detectingLocation = true;
    error = null;
    
    try {
      const coords = await getCurrentPosition();
      const location = await reverseGeocode(coords);
      
      if (location) {
        onChange({
          lat: coords.lat,
          lng: coords.lng,
          address: location.displayName
        });
      } else {
        onChange({
          lat: coords.lat,
          lng: coords.lng
        });
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to get location';
    } finally {
      detectingLocation = false;
    }
  }

  function clearLocation(): void {
    onChange(undefined);
    searchQuery = '';
    error = null;
  }

  function handleBlur(): void {
    // Delay to allow click on dropdown items
    setTimeout(() => {
      showDropdown = false;
    }, 200);
  }
</script>

<div class="space-y-2">
  {#if value}
    <div class="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600">
      <span class="text-accent">📍</span>
      <span class="flex-1 text-sm truncate" title={value.address || `${value.lat.toFixed(4)}, ${value.lng.toFixed(4)}`}>
        {value.address || `${value.lat.toFixed(4)}, ${value.lng.toFixed(4)}`}
      </span>
      <button
        type="button"
        class="text-slate-400 hover:text-red-500 transition-colors"
        onclick={clearLocation}
        title="Clear location"
      >
        ×
      </button>
    </div>
  {:else}
    <div class="relative">
      <div class="flex gap-2">
        <div class="flex-1 relative">
          <input
            type="text"
            bind:value={searchQuery}
            oninput={handleSearchInput}
            onfocus={() => searchResults.length > 0 && (showDropdown = true)}
            onblur={handleBlur}
            class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:border-accent"
            {placeholder}
          />
          {#if searching}
            <div class="absolute right-3 top-1/2 -translate-y-1/2">
              <div class="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
            </div>
          {/if}
        </div>
        
        <button
          type="button"
          class="px-3 py-2 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
          onclick={detectCurrentLocation}
          disabled={detectingLocation}
          title="Use current location"
        >
          {#if detectingLocation}
            <span class="inline-block w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin"></span>
          {:else}
            📍
          {/if}
        </button>
      </div>
      
      {#if showDropdown && searchResults.length > 0}
        <div class="absolute top-full left-0 right-0 mt-1 bg-surface border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
          {#each searchResults as result}
            <button
              type="button"
              class="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border-b border-slate-100 dark:border-slate-700 last:border-b-0"
              onclick={() => selectResult(result)}
            >
              <div class="font-medium truncate">{result.displayName.split(',')[0]}</div>
              <div class="text-xs text-slate-500 dark:text-slate-400 truncate">
                {result.displayName.split(',').slice(1).join(',').trim()}
              </div>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
  
  {#if error}
    <p class="text-xs text-red-500">{error}</p>
  {/if}
</div>

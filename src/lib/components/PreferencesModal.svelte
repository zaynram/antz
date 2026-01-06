<script lang="ts">
  import { activeUser, userPreferences, currentPreferences } from '$lib/stores/app'
  import { uploadProfilePicture, deleteProfilePicture } from '$lib/firebase'
  import type { Theme, LocationMode, GeoLocation } from '$lib/types'
  import LocationPicker from './LocationPicker.svelte'
  import { getIOSCompatibleImageUrl } from '$lib/ios-images'
  import { Sun, Moon, MapPin, Camera, X, Loader2 } from 'lucide-svelte'
  import { toast } from 'svelte-sonner'

  interface Props {
    open: boolean;
    onClose: () => void;
  }

  let { open, onClose }: Props = $props();

  let localTheme = $state<Theme>('dark');
  let localAccentColor = $state('#6366f1');
  let localName = $state('');
  let localProfilePicture = $state<string | undefined>(undefined);
  let uploadingPicture = $state(false);
  let fileInput = $state<HTMLInputElement | null>(null);
  // Location settings
  let localLocationMode = $state<LocationMode>('off');
  let localCurrentLocation = $state<GeoLocation | undefined>(undefined);
  let localReferenceLocation = $state<GeoLocation | undefined>(undefined);
  let localSearchRadius = $state(5000);

  // Non-reactive tracking for sync triggers
  let previousOpen = false;
  let previousUser: 'Z' | 'T' | null = null;

  const presetColors = [
    '#6366f1', // Indigo
    '#ec4899', // Pink
    '#8b5cf6', // Violet
    '#06b6d4', // Cyan
    '#10b981', // Emerald
    '#f59e0b', // Amber
    '#ef4444', // Red
    '#3b82f6', // Blue
  ];

  const radiusOptions = [
    { value: 1000, label: '1 km' },
    { value: 2500, label: '2.5 km' },
    { value: 5000, label: '5 km' },
    { value: 10000, label: '10 km' },
    { value: 25000, label: '25 km' },
    { value: 50000, label: '50 km' },
  ];

  $effect(() => {
    // Only sync local state when modal opens or user switches
    const justOpened = open && !previousOpen;
    const userSwitched = open && $activeUser !== previousUser;

    if ((justOpened || userSwitched) && $currentPreferences) {
      localTheme = $currentPreferences.theme;
      localAccentColor = $currentPreferences.accentColor;
      localName = $currentPreferences.name;
      localProfilePicture = $currentPreferences.profilePicture;
      localLocationMode = $currentPreferences.locationMode;
      localCurrentLocation = $currentPreferences.currentLocation;
      localReferenceLocation = $currentPreferences.referenceLocation;
      localSearchRadius = $currentPreferences.searchRadius;
    }

    previousOpen = open;
    previousUser = $activeUser;
  });

  async function handleFileSelect(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    // Validate file type and size
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    uploadingPicture = true;
    try {
      const url = await uploadProfilePicture($activeUser, file);
      localProfilePicture = url;
      toast.success('Profile picture uploaded');
    } catch (err) {
      console.error('Upload failed:', err);
      toast.error('Failed to upload picture');
    } finally {
      uploadingPicture = false;
      input.value = '';
    }
  }

  async function removePicture(): Promise<void> {
    uploadingPicture = true;
    try {
      await deleteProfilePicture($activeUser);
      localProfilePicture = undefined;
      toast.success('Profile picture removed');
    } catch (err) {
      console.error('Delete failed:', err);
      toast.error('Failed to remove picture');
    } finally {
      uploadingPicture = false;
    }
  }

  function savePreferences(): void {
    userPreferences.update(prefs => ({
      ...prefs,
      [$activeUser]: {
        theme: localTheme,
        accentColor: localAccentColor,
        name: localName,
        profilePicture: localProfilePicture,
        locationMode: localLocationMode,
        currentLocation: localCurrentLocation,
        referenceLocation: localReferenceLocation,
        searchRadius: localSearchRadius
      }
    }));
    onClose();
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

  function handleModalClick(e: MouseEvent): void {
    e.stopPropagation();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    onclick={handleBackdropClick}
    onkeydown={handleKeydown}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="bg-surface rounded-xl max-w-md w-full shadow-2xl max-h-[90vh] flex flex-col" onclick={handleModalClick}>
      <div class="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
        <h2 class="text-lg font-semibold">Preferences for {$activeUser}</h2>
        <button
          class="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500"
          onclick={onClose}
        >
          ×
        </button>
      </div>
      
      <div class="p-4 space-y-5 overflow-y-auto flex-1">
        <!-- Profile Picture -->
        <div>
          <span class="block text-sm font-medium mb-2">Profile Picture</span>
          <div class="flex items-center gap-4">
            <div class="relative">
              {#if localProfilePicture}
                {#key $activeUser}
                  <img
                    src={getIOSCompatibleImageUrl(localProfilePicture)}
                    alt="Profile"
                    class="w-16 h-16 rounded-full object-cover"
                  />
                {/key}
                <button
                  type="button"
                  class="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
                  onclick={removePicture}
                  disabled={uploadingPicture}
                >
                  <X size={12} />
                </button>
              {:else}
                <div
                  class="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-semibold"
                  style:background-color={localAccentColor}
                >
                  {$activeUser}
                </div>
              {/if}
              {#if uploadingPicture}
                <div class="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
                  <Loader2 size={20} class="text-white animate-spin" />
                </div>
              {/if}
            </div>
            <div class="flex-1">
              <input
                type="file"
                accept="image/*"
                class="hidden"
                bind:this={fileInput}
                onchange={handleFileSelect}
              />
              <button
                type="button"
                class="flex items-center gap-2 px-3 py-2 text-sm bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700"
                onclick={() => fileInput?.click()}
                disabled={uploadingPicture}
              >
                <Camera size={16} />
                {localProfilePicture ? 'Change' : 'Upload'} Photo
              </button>
              <p class="text-xs text-slate-400 mt-1">Max 5MB, JPG/PNG</p>
            </div>
          </div>
        </div>

        <!-- Display Name -->
        <div>
          <label for="prefs-display-name" class="block text-sm font-medium mb-2">Display Name</label>
          <input
            id="prefs-display-name"
            type="text"
            bind:value={localName}
            class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:border-accent"
            placeholder="Your name"
          />
        </div>

        <!-- Theme -->
        <div>
          <span class="block text-sm font-medium mb-2">Theme</span>
          <div class="flex gap-3">
            <button
              class="flex-1 py-3 px-4 rounded-lg border-2 transition-all flex items-center justify-center gap-2 {localTheme === 'light' ? 'border-accent bg-accent/10' : 'border-slate-200 dark:border-slate-700'}"
              onclick={() => localTheme = 'light'}
            >
              <Sun size={20} />
              <span>Light</span>
            </button>
            <button
              class="flex-1 py-3 px-4 rounded-lg border-2 transition-all flex items-center justify-center gap-2 {localTheme === 'dark' ? 'border-accent bg-accent/10' : 'border-slate-200 dark:border-slate-700'}"
              onclick={() => localTheme = 'dark'}
            >
              <Moon size={20} />
              <span>Dark</span>
            </button>
          </div>
        </div>
        
        <!-- Accent Color -->
        <div>
          <span class="block text-sm font-medium mb-2">Accent Color</span>
          <div class="flex flex-wrap gap-2 mb-3">
            {#each presetColors as color}
              <button
                class="w-10 h-10 rounded-full border-2 transition-transform hover:scale-110"
                style:background-color={color}
                class:border-white={localAccentColor === color}
                class:border-transparent={localAccentColor !== color}
                class:ring-2={localAccentColor === color}
                class:ring-offset-2={localAccentColor === color}
                class:ring-slate-400={localAccentColor === color}
                onclick={() => localAccentColor = color}
                aria-label="Select {color}"
              ></button>
            {/each}
          </div>
          <div class="flex items-center gap-3">
            <label for="prefs-custom-color" class="text-sm text-slate-500 dark:text-slate-400">Custom:</label>
            <input
              id="prefs-custom-color"
              type="color"
              bind:value={localAccentColor}
              class="w-10 h-10 rounded cursor-pointer border-0"
            />
            <input
              type="text"
              bind:value={localAccentColor}
              class="flex-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg font-mono"
              pattern="^#[0-9A-Fa-f]{6}$"
              aria-label="Custom color hex value"
            />
          </div>
        </div>
        
        <!-- Location Settings -->
        <div class="pt-2 border-t border-slate-200 dark:border-slate-700">
          <span class="flex items-center gap-2 text-sm font-medium mb-3">
            <MapPin size={16} />
            Location Settings
          </span>

          <!-- Location Mode -->
          <div class="mb-4">
            <span class="block text-xs text-slate-500 dark:text-slate-400 mb-2">Location Mode</span>
            <div class="flex gap-2">
              <button
                class="flex-1 py-2 px-3 rounded-lg border-2 text-sm transition-all {localLocationMode === 'off' ? 'border-accent bg-accent/10' : 'border-slate-200 dark:border-slate-700'}"
                onclick={() => localLocationMode = 'off'}
              >
                Off
              </button>
              <button
                class="flex-1 py-2 px-3 rounded-lg border-2 text-sm transition-all {localLocationMode === 'manual' ? 'border-accent bg-accent/10' : 'border-slate-200 dark:border-slate-700'}"
                onclick={() => localLocationMode = 'manual'}
              >
                Manual
              </button>
              <button
                class="flex-1 py-2 px-3 rounded-lg border-2 text-sm transition-all {localLocationMode === 'auto' ? 'border-accent bg-accent/10' : 'border-slate-200 dark:border-slate-700'}"
                onclick={() => localLocationMode = 'auto'}
              >
                Auto
              </button>
            </div>
            <p class="text-xs text-slate-400 mt-1">
              {#if localLocationMode === 'off'}
                Location features disabled
              {:else if localLocationMode === 'manual'}
                Set your location manually below
              {:else}
                Request location when needed
              {/if}
            </p>
          </div>
          
          {#if localLocationMode !== 'off'}
            <!-- Current Location -->
            <div class="mb-4">
              <span class="block text-xs text-slate-500 dark:text-slate-400 mb-2">
                {localLocationMode === 'manual' ? 'Your Location' : 'Default Location (fallback)'}
              </span>
              <LocationPicker
                value={localCurrentLocation}
                onChange={(loc) => localCurrentLocation = loc}
                placeholder="Search or detect location..."
              />
            </div>

            <!-- Reference Location -->
            <div class="mb-4">
              <span class="block text-xs text-slate-500 dark:text-slate-400 mb-2">
                Reference Point <span class="text-slate-400">(for suggestions)</span>
              </span>
              <LocationPicker
                value={localReferenceLocation}
                onChange={(loc) => localReferenceLocation = loc}
                placeholder="e.g., downtown, campus..."
              />
              <p class="text-xs text-slate-400 mt-1">
                Place suggestions will be relative to this point
              </p>
            </div>

            <!-- Search Radius -->
            <div>
              <label for="prefs-search-radius" class="block text-xs text-slate-500 dark:text-slate-400 mb-2">Search Radius</label>
              <select
                id="prefs-search-radius"
                bind:value={localSearchRadius}
                class="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg"
              >
                {#each radiusOptions as opt}
                  <option value={opt.value}>{opt.label}</option>
                {/each}
              </select>
            </div>
          {/if}
        </div>
        
        <!-- Preview -->
        <div class="p-3 rounded-lg border border-slate-200 dark:border-slate-700">
          <span class="block text-xs text-slate-500 dark:text-slate-400 mb-2">Preview</span>
          <div class="flex items-center gap-3">
            {#if localProfilePicture}
              <img
                src={localProfilePicture}
                alt="Profile"
                class="w-8 h-8 rounded-full object-cover"
              />
            {:else}
              <div
                class="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold"
                style:background-color={localAccentColor}
              >
                {$activeUser}
              </div>
            {/if}
            <span class="font-medium">{localName || $activeUser}</span>
            <button
              class="ml-auto px-3 py-1 rounded text-white text-sm"
              style:background-color={localAccentColor}
            >
              Button
            </button>
          </div>
        </div>
      </div>
      
      <div class="flex gap-3 p-4 border-t border-slate-200 dark:border-slate-700 shrink-0">
        <button
          class="flex-1 py-2 px-4 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          onclick={onClose}
        >
          Cancel
        </button>
        <button
          class="flex-1 py-2 px-4 rounded-lg bg-accent text-white font-medium hover:opacity-90 transition-opacity"
          onclick={savePreferences}
        >
          Save
        </button>
      </div>
    </div>
  </div>
{/if}

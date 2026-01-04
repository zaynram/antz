<script lang="ts">
  import { activeUser, userPreferences, currentPreferences } from '$lib/stores/app'
  import { uploadProfilePicture, deleteProfilePicture, logOut } from '$lib/firebase'
  import type { Theme, LocationMode, GeoLocation } from '$lib/types'
  import LocationPicker from '$lib/components/LocationPicker.svelte'
  import { Sun, Moon, MapPin, Camera, X, Loader2, RefreshCw, LogOut, User, Palette, Info } from 'lucide-svelte'
  import { toast } from 'svelte-sonner'

  interface Props {
    navigate: (path: string) => void;
  }

  let { navigate }: Props = $props();

  // Local state for form
  let localTheme = $state<Theme>('dark');
  let localAccentColor = $state('#6366f1');
  let localName = $state('');
  let localProfilePicture = $state<string | undefined>(undefined);
  let uploadingPicture = $state(false);
  let fileInput = $state<HTMLInputElement | null>(null);
  let localLocationMode = $state<LocationMode>('off');
  let localCurrentLocation = $state<GeoLocation | undefined>(undefined);
  let localReferenceLocation = $state<GeoLocation | undefined>(undefined);
  let localSearchRadius = $state(5000);

  // App state
  let isReloading = $state(false);
  let updateAvailable = $state(false);

  // Tap-5-times for debug access
  let tapCount = 0;
  let tapTimer: ReturnType<typeof setTimeout> | null = null;
  const TAP_THRESHOLD = 5;
  const TAP_RESET_MS = 1500;

  // Track previous user to detect switches
  let previousUser: 'Z' | 'T' | null = null;

  // Cleanup timers on unmount
  $effect(() => {
    return () => {
      if (tapTimer) {
        clearTimeout(tapTimer);
        tapTimer = null;
      }
    };
  });

  const presetColors = [
    '#6366f1', '#ec4899', '#8b5cf6', '#06b6d4',
    '#10b981', '#f59e0b', '#ef4444', '#3b82f6',
  ];

  const radiusOptions = [
    { value: 1000, label: '1 km' },
    { value: 2500, label: '2.5 km' },
    { value: 5000, label: '5 km' },
    { value: 10000, label: '10 km' },
    { value: 25000, label: '25 km' },
    { value: 50000, label: '50 km' },
  ];

  // Sync local state when user changes
  $effect(() => {
    if ($activeUser !== previousUser && $currentPreferences) {
      localTheme = $currentPreferences.theme;
      localAccentColor = $currentPreferences.accentColor;
      localName = $currentPreferences.name;
      localProfilePicture = $currentPreferences.profilePicture;
      localLocationMode = $currentPreferences.locationMode;
      localCurrentLocation = $currentPreferences.currentLocation;
      localReferenceLocation = $currentPreferences.referenceLocation;
      localSearchRadius = $currentPreferences.searchRadius;
      previousUser = $activeUser;
    }
  });

  // Check for service worker updates
  $effect(() => {
    if (!('serviceWorker' in navigator)) return;

    let registration: ServiceWorkerRegistration | null = null;
    const handleUpdateFound = () => {
      updateAvailable = true;
    };

    navigator.serviceWorker.ready.then(reg => {
      registration = reg;
      reg.addEventListener('updatefound', handleUpdateFound);
    });

    return () => {
      if (registration) {
        registration.removeEventListener('updatefound', handleUpdateFound);
      }
    };
  });

  async function handleFileSelect(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

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
      savePreferences();
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
      savePreferences();
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
  }

  // Auto-save on changes
  function handleThemeChange(theme: Theme): void {
    localTheme = theme;
    savePreferences();
  }

  function handleColorChange(color: string): void {
    localAccentColor = color;
    savePreferences();
  }

  function handleNameChange(): void {
    savePreferences();
  }

  function handleLocationModeChange(mode: LocationMode): void {
    localLocationMode = mode;
    savePreferences();
  }

  function handleRadiusChange(): void {
    savePreferences();
  }

  async function reloadApp(): Promise<void> {
    isReloading = true;

    try {
      // Unregister service worker and clear caches
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
        }
      }

      // Clear caches
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      }

      toast.success('Updating app...');

      // Reload the page
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (err) {
      console.error('Reload failed:', err);
      toast.error('Failed to update');
      isReloading = false;
    }
  }

  function handleVersionTap(): void {
    tapCount++;

    // Reset timer on each tap
    if (tapTimer) clearTimeout(tapTimer);
    tapTimer = setTimeout(() => {
      tapCount = 0;
    }, TAP_RESET_MS);

    if (tapCount >= TAP_THRESHOLD) {
      tapCount = 0;
      if (tapTimer) clearTimeout(tapTimer);
      toast.success('Entering debug mode...');
      navigate('/debug');
    } else if (tapCount >= 3) {
      toast.info(`${TAP_THRESHOLD - tapCount} more taps for debug mode`);
    }
  }

  async function handleLogout(): Promise<void> {
    try {
      await logOut();
      navigate('/');
    } catch (err) {
      console.error('Logout failed:', err);
      toast.error('Failed to log out');
    }
  }
</script>

<div class="max-w-2xl mx-auto space-y-6">
  <h1 class="text-2xl font-bold">Settings</h1>

  <!-- User Switcher -->
  <section class="bg-surface border border-slate-200 dark:border-slate-700 rounded-xl p-4">
    <h2 class="text-sm font-medium text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
      <User size={16} />
      Active Profile
    </h2>
    <div class="flex gap-2">
      <button
        class="flex-1 py-3 px-4 rounded-lg border-2 transition-all flex items-center justify-center gap-3 {$activeUser === 'Z' ? 'border-accent bg-accent/10' : 'border-slate-200 dark:border-slate-700'}"
        onclick={() => activeUser.set('Z')}
      >
        {#if $userPreferences.Z?.profilePicture}
          <img src={$userPreferences.Z.profilePicture} alt="Z" class="w-8 h-8 rounded-full object-cover" />
        {:else}
          <div class="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold" style:background-color={$userPreferences.Z?.accentColor || '#6366f1'}>
            Z
          </div>
        {/if}
        <span class="font-medium">{$userPreferences.Z?.name || 'Z'}</span>
      </button>
      <button
        class="flex-1 py-3 px-4 rounded-lg border-2 transition-all flex items-center justify-center gap-3 {$activeUser === 'T' ? 'border-accent bg-accent/10' : 'border-slate-200 dark:border-slate-700'}"
        onclick={() => activeUser.set('T')}
      >
        {#if $userPreferences.T?.profilePicture}
          <img src={$userPreferences.T.profilePicture} alt="T" class="w-8 h-8 rounded-full object-cover" />
        {:else}
          <div class="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold" style:background-color={$userPreferences.T?.accentColor || '#ec4899'}>
            T
          </div>
        {/if}
        <span class="font-medium">{$userPreferences.T?.name || 'T'}</span>
      </button>
    </div>
  </section>

  <!-- Profile Settings -->
  <section class="bg-surface border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-4">
    <h2 class="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
      <Palette size={16} />
      Profile for {$activeUser}
    </h2>

    <!-- Profile Picture -->
    <div>
      <label class="block text-sm font-medium mb-2">Profile Picture</label>
      <div class="flex items-center gap-4">
        <div class="relative">
          {#if localProfilePicture}
            <img src={localProfilePicture} alt="Profile" class="w-16 h-16 rounded-full object-cover" />
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
        <div>
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
      <label class="block text-sm font-medium mb-2">Display Name</label>
      <input
        type="text"
        bind:value={localName}
        onblur={handleNameChange}
        class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:border-accent"
        placeholder="Your name"
      />
    </div>

    <!-- Theme -->
    <div>
      <label class="block text-sm font-medium mb-2">Theme</label>
      <div class="flex gap-3">
        <button
          class="flex-1 py-3 px-4 rounded-lg border-2 transition-all flex items-center justify-center gap-2 {localTheme === 'light' ? 'border-accent bg-accent/10' : 'border-slate-200 dark:border-slate-700'}"
          onclick={() => handleThemeChange('light')}
        >
          <Sun size={20} />
          <span>Light</span>
        </button>
        <button
          class="flex-1 py-3 px-4 rounded-lg border-2 transition-all flex items-center justify-center gap-2 {localTheme === 'dark' ? 'border-accent bg-accent/10' : 'border-slate-200 dark:border-slate-700'}"
          onclick={() => handleThemeChange('dark')}
        >
          <Moon size={20} />
          <span>Dark</span>
        </button>
      </div>
    </div>

    <!-- Accent Color -->
    <div>
      <label class="block text-sm font-medium mb-2">Accent Color</label>
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
            onclick={() => handleColorChange(color)}
          ></button>
        {/each}
      </div>
      <div class="flex items-center gap-3">
        <label class="text-sm text-slate-500">Custom:</label>
        <input
          type="color"
          bind:value={localAccentColor}
          onchange={() => handleColorChange(localAccentColor)}
          class="w-10 h-10 rounded cursor-pointer border-0"
        />
        <input
          type="text"
          bind:value={localAccentColor}
          onblur={() => handleColorChange(localAccentColor)}
          class="flex-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg font-mono"
          pattern="^#[0-9A-Fa-f]{6}$"
        />
      </div>
    </div>
  </section>

  <!-- Location Settings -->
  <section class="bg-surface border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-4">
    <h2 class="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
      <MapPin size={16} />
      Location Settings
    </h2>

    <div>
      <label class="block text-xs text-slate-500 dark:text-slate-400 mb-2">Location Mode</label>
      <div class="flex gap-2">
        <button
          class="flex-1 py-2 px-3 rounded-lg border-2 text-sm transition-all {localLocationMode === 'off' ? 'border-accent bg-accent/10' : 'border-slate-200 dark:border-slate-700'}"
          onclick={() => handleLocationModeChange('off')}
        >
          Off
        </button>
        <button
          class="flex-1 py-2 px-3 rounded-lg border-2 text-sm transition-all {localLocationMode === 'manual' ? 'border-accent bg-accent/10' : 'border-slate-200 dark:border-slate-700'}"
          onclick={() => handleLocationModeChange('manual')}
        >
          Manual
        </button>
        <button
          class="flex-1 py-2 px-3 rounded-lg border-2 text-sm transition-all {localLocationMode === 'auto' ? 'border-accent bg-accent/10' : 'border-slate-200 dark:border-slate-700'}"
          onclick={() => handleLocationModeChange('auto')}
        >
          Auto
        </button>
      </div>
    </div>

    {#if localLocationMode !== 'off'}
      <div>
        <label class="block text-xs text-slate-500 dark:text-slate-400 mb-2">
          {localLocationMode === 'manual' ? 'Your Location' : 'Default Location'}
        </label>
        <LocationPicker
          value={localCurrentLocation}
          onChange={(loc) => { localCurrentLocation = loc; savePreferences(); }}
          placeholder="Search or detect location..."
        />
      </div>

      <div>
        <label class="block text-xs text-slate-500 dark:text-slate-400 mb-2">Search Radius</label>
        <select
          bind:value={localSearchRadius}
          onchange={handleRadiusChange}
          class="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg"
        >
          {#each radiusOptions as opt}
            <option value={opt.value}>{opt.label}</option>
          {/each}
        </select>
      </div>
    {/if}
  </section>

  <!-- App Settings -->
  <section class="bg-surface border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-4">
    <h2 class="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
      <Info size={16} />
      App
    </h2>

    <!-- Update/Reload Button -->
    <button
      class="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors touch-manipulation"
      onclick={reloadApp}
      disabled={isReloading}
    >
      <RefreshCw size={18} class={isReloading ? 'animate-spin' : ''} />
      <span>{isReloading ? 'Updating...' : 'Check for Updates'}</span>
      {#if updateAvailable}
        <span class="ml-2 px-2 py-0.5 text-xs bg-accent text-white rounded-full">New</span>
      {/if}
    </button>

    <!-- Logout Button -->
    <button
      class="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors touch-manipulation"
      onclick={handleLogout}
    >
      <LogOut size={18} />
      <span>Log Out</span>
    </button>

    <!-- Version Info (tap 5 times for debug) -->
    <button
      type="button"
      class="w-full text-center text-xs text-slate-400 pt-2 cursor-default"
      onclick={handleVersionTap}
    >
      <p>Us - Couples App v0.1.0</p>
      <p class="mt-1">Preferences sync across devices</p>
    </button>
  </section>
</div>

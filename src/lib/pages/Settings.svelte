<script lang="ts">
  import LocationPicker from '$lib/components/LocationPicker.svelte'
  import PageHeader from '$lib/components/ui/PageHeader.svelte'
  import { deleteProfilePicture, logOut, uploadProfilePicture } from '$lib/firebase'
  import { hapticLight } from '$lib/haptics'
  import { activeUser, currentPreferences, displayAbbreviations, immediateSavePreferences, userPreferences } from '$lib/stores/app'
  import type { GeoLocation, LocationMode, Theme, VideoSyncPlatform } from '$lib/types'
  import { Camera, Info, Loader2, LogOut, MapPin, Moon, Palette, RefreshCw, Settings, Sun, User, Video, X, Download, ExternalLink as ExternalLinkIcon } from 'lucide-svelte'
  import { toast } from 'svelte-sonner'
  import { isYouTubeAPIConfigured, getYouTubeAuthUrl } from '$lib/services/youtube-sync'

  interface Props {
    navigate: (path: string) => void
  }

  let { navigate }: Props = $props()

  // Local state for form
  let localTheme = $state<Theme>('dark')
  let localAccentColor = $state('#6366f1')
  let localName = $state('')
  let localProfilePicture = $state<string | undefined>(undefined)
  let uploadingPicture = $state(false)
  let fileInput = $state<HTMLInputElement | null>(null)
  let localUnitSystem = $state<'metric' | 'imperial'>('metric')
  let localLocationMode = $state<LocationMode>('off')
  let localCurrentLocation = $state<GeoLocation | undefined>(undefined)
  let localReferenceLocation = $state<GeoLocation | undefined>(undefined)
  let localSearchRadius = $state(5000)
  let localVideoSyncPlatform = $state<VideoSyncPlatform>('none')

  // App state
  let isReloading = $state(false)
  let updateAvailable = $state(false)
  let showGrayjayInstructions = $state(false)

  // Tap-5-times for debug access
  let tapCount = 0
  let tapTimer: ReturnType<typeof setTimeout> | null = null
  const TAP_THRESHOLD = 5
  const TAP_RESET_MS = 1500

  // Track previous user to detect switches
  let previousUser: 'Z' | 'T' | null = null

  // Cleanup timers on unmount
  $effect(() => {
    return () => {
      if (tapTimer) {
        clearTimeout(tapTimer)
        tapTimer = null
      }
    }
  })

  const presetColors = [
    '#6366f1', '#ec4899', '#8b5cf6', '#06b6d4',
    '#10b981', '#f59e0b', '#ef4444', '#3b82f6',
  ]

  // Dynamic radius options based on unit system
  const radiusOptions = $derived(localUnitSystem === 'imperial' ? [
    { value: 1609, label: '1 mi' },
    { value: 3219, label: '2 mi' },
    { value: 8047, label: '5 mi' },
    { value: 16093, label: '10 mi' },
    { value: 40234, label: '25 mi' },
    { value: 80467, label: '50 mi' },
  ] : [
    { value: 1000, label: '1 km' },
    { value: 2500, label: '2.5 km' },
    { value: 5000, label: '5 km' },
    { value: 10000, label: '10 km' },
    { value: 25000, label: '25 km' },
    { value: 50000, label: '50 km' },
  ])

  // Sync local state when user changes
  $effect(() => {
    if ($activeUser !== previousUser && $currentPreferences) {
      localTheme = $currentPreferences.theme
      localAccentColor = $currentPreferences.accentColor
      localName = $currentPreferences.name
      localProfilePicture = $currentPreferences.profilePicture
      localUnitSystem = $currentPreferences.unitSystem
      localLocationMode = $currentPreferences.locationMode
      localCurrentLocation = $currentPreferences.currentLocation
      localReferenceLocation = $currentPreferences.referenceLocation
      localSearchRadius = $currentPreferences.searchRadius
      localVideoSyncPlatform = $currentPreferences.videoSyncPlatform || 'none'
      previousUser = $activeUser
    }
  })

  // Check for service worker updates
  $effect(() => {
    if (!('serviceWorker' in navigator)) return

    let registration: ServiceWorkerRegistration | null = null
    const handleUpdateFound = () => {
      updateAvailable = true
    }

    navigator.serviceWorker.ready.then(reg => {
      registration = reg
      reg.addEventListener('updatefound', handleUpdateFound)
    })

    return () => {
      if (registration) {
        registration.removeEventListener('updatefound', handleUpdateFound)
      }
    }
  })

  async function handleFileSelect(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB')
      return
    }

    uploadingPicture = true
    try {
      const url = await uploadProfilePicture($activeUser, file)
      if (!url) {
        throw new Error('No URL returned from upload')
      }
      localProfilePicture = url
      savePreferences()
      await immediateSavePreferences()
      toast.success('Profile picture uploaded')
    } catch (err) {
      console.error('Upload failed:', err)
      const message = err instanceof Error ? err.message : 'Unknown error'
      toast.error(`Upload failed: ${message}`)
    } finally {
      uploadingPicture = false
      input.value = ''
    }
  }

  async function removePicture(): Promise<void> {
    uploadingPicture = true
    try {
      await deleteProfilePicture($activeUser)
      localProfilePicture = undefined
      savePreferences()
      await immediateSavePreferences()
      toast.success('Profile picture removed')
    } catch (err) {
      console.error('Delete failed:', err)
      toast.error('Failed to remove picture')
    } finally {
      uploadingPicture = false
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
        unitSystem: localUnitSystem,
        locationMode: localLocationMode,
        currentLocation: localCurrentLocation,
        referenceLocation: localReferenceLocation,
        searchRadius: localSearchRadius,
        videoSyncPlatform: localVideoSyncPlatform,
        youtubeAuth: prefs[$activeUser]?.youtubeAuth,
        youtubePlaylistId: prefs[$activeUser]?.youtubePlaylistId,
        grayjayConfig: prefs[$activeUser]?.grayjayConfig,
        lastUpdated: Date.now()
      }
    }))
  }

  function handleThemeChange(theme: Theme): void {
    hapticLight()
    localTheme = theme
    savePreferences()
  }

  function handleColorChange(color: string): void {
    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
      toast.error('Invalid color format')
      return
    }
    hapticLight()
    localAccentColor = color
    savePreferences()
  }

  function handleNameChange(): void {
    savePreferences()
  }

  function handleUnitSystemChange(system: 'metric' | 'imperial'): void {
    hapticLight()
    localUnitSystem = system
    // Convert radius to closest equivalent in new unit system
    if (system === 'imperial') {
      // Convert meters to closest mile option
      if (localSearchRadius <= 1804) localSearchRadius = 1609 // 1 mi
      else if (localSearchRadius <= 5633) localSearchRadius = 3219 // 2 mi
      else if (localSearchRadius <= 12070) localSearchRadius = 8047 // 5 mi
      else if (localSearchRadius <= 28163) localSearchRadius = 16093 // 10 mi
      else if (localSearchRadius <= 60350) localSearchRadius = 40234 // 25 mi
      else localSearchRadius = 80467 // 50 mi
    } else {
      // Convert to closest km option
      if (localSearchRadius <= 1750) localSearchRadius = 1000 // 1 km
      else if (localSearchRadius <= 3750) localSearchRadius = 2500 // 2.5 km
      else if (localSearchRadius <= 7500) localSearchRadius = 5000 // 5 km
      else if (localSearchRadius <= 17500) localSearchRadius = 10000 // 10 km
      else if (localSearchRadius <= 37500) localSearchRadius = 25000 // 25 km
      else localSearchRadius = 50000 // 50 km
    }
    savePreferences()
  }

  function handleLocationModeChange(mode: LocationMode): void {
    hapticLight()
    localLocationMode = mode
    savePreferences()
  }

  function handleRadiusChange(): void {
    savePreferences()
  }

  function handleVideoSyncPlatformChange(platform: VideoSyncPlatform): void {
    hapticLight()
    localVideoSyncPlatform = platform
    savePreferences()
  }

  function handleConnectYouTube(): void {
    if (!isYouTubeAPIConfigured()) {
      toast.error('YouTube API is not configured. Please contact the administrator.')
      return
    }
    
    // Generate state token for CSRF protection
    const state = Math.random().toString(36).substring(7)
    localStorage.setItem('youtube_oauth_state', state)
    
    // Redirect to YouTube OAuth
    const authUrl = getYouTubeAuthUrl(state)
    window.location.href = authUrl
  }

  function handleDisconnectYouTube(): void {
    userPreferences.update(prefs => ({
      ...prefs,
      [$activeUser]: {
        ...prefs[$activeUser],
        youtubeAuth: undefined,
        youtubePlaylistId: undefined,
        lastUpdated: Date.now()
      }
    }))
    toast.success('Disconnected from YouTube')
  }

  function handleExportForGrayjay(): void {
    // This requires access to videos, which we'll handle in the Videos page instead
    toast.info('Please use the export button on the Videos page')
  }

  function handleShowGrayjayInstructions(): void {
    showGrayjayInstructions = true
  }

  async function reloadApp(): Promise<void> {
    isReloading = true

    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations()
        for (const registration of registrations) {
          await registration.unregister()
        }
      }

      if ('caches' in window) {
        const cacheNames = await caches.keys()
        await Promise.all(cacheNames.map(name => caches.delete(name)))
      }

      toast.success('Updating app...')

      setTimeout(() => {
        window.location.reload()
      }, 500)
    } catch (err) {
      console.error('Reload failed:', err)
      toast.error('Failed to update')
      isReloading = false
    }
  }

  function handleVersionTap(): void {
    tapCount++

    if (tapTimer) clearTimeout(tapTimer)
    tapTimer = setTimeout(() => {
      tapCount = 0
    }, TAP_RESET_MS)

    if (tapCount >= TAP_THRESHOLD) {
      tapCount = 0
      if (tapTimer) clearTimeout(tapTimer)
      toast.success('Entering debug mode...')
      navigate('/debug')
    } else if (tapCount >= 3) {
      toast.info(`${TAP_THRESHOLD - tapCount} more taps for debug mode`)
    }
  }

  async function handleLogout(): Promise<void> {
    try {
      await logOut()
      navigate('/')
    } catch (err) {
      console.error('Logout failed:', err)
      toast.error('Failed to log out')
    }
  }

  function handleUserSwitch(user: 'Z' | 'T'): void {
    hapticLight()
    activeUser.set(user)
  }
</script>

<div class="max-w-2xl mx-auto">
  <PageHeader
    title="Settings"
    icon={Settings}
  />

  <div class="space-y-6">
    <!-- User Switcher -->
    <section class="card p-4">
      <h2 class="text-sm font-medium text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
        <User size={16} />
        Active Profile
      </h2>
      <div class="flex gap-2">
        <button
          type="button"
          class="flex-1 py-3 px-4 rounded-xl border-2 transition-all flex items-center justify-center gap-3 touch-manipulation {$activeUser === 'Z' ? 'border-accent bg-accent/10' : 'border-slate-200 dark:border-slate-700'}"
          onclick={() => handleUserSwitch('Z')}
        >
          {#if $userPreferences.Z?.profilePicture}
            <img src={$userPreferences.Z.profilePicture} alt={$displayAbbreviations.Z} class="w-8 h-8 rounded-full object-cover" />
          {:else}
            <div class="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold" style:background-color={$userPreferences.Z?.accentColor || '#6366f1'}>
              {$displayAbbreviations.Z}
            </div>
          {/if}
          <span class="font-medium">{$userPreferences.Z?.name || 'Z'}</span>
        </button>
        <button
          type="button"
          class="flex-1 py-3 px-4 rounded-xl border-2 transition-all flex items-center justify-center gap-3 touch-manipulation {$activeUser === 'T' ? 'border-accent bg-accent/10' : 'border-slate-200 dark:border-slate-700'}"
          onclick={() => handleUserSwitch('T')}
        >
          {#if $userPreferences.T?.profilePicture}
            <img src={$userPreferences.T.profilePicture} alt={$displayAbbreviations.T} class="w-8 h-8 rounded-full object-cover" />
          {:else}
            <div class="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold" style:background-color={$userPreferences.T?.accentColor || '#ec4899'}>
              {$displayAbbreviations.T}
            </div>
          {/if}
          <span class="font-medium">{$userPreferences.T?.name || 'T'}</span>
        </button>
      </div>
    </section>

    <!-- Profile Settings -->
    <section class="card p-4 space-y-4">
      <h2 class="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
        <Palette size={16} />
        Profile for {$activeUser}
      </h2>

      <!-- Profile Picture -->
      <div>
        <span class="block text-sm font-medium mb-2">Profile Picture</span>
        <div class="flex items-center gap-4">
          <div class="relative">
            {#if localProfilePicture}
              <img src={localProfilePicture} alt="Profile" class="w-16 h-16 rounded-full object-cover" />
              <button
                type="button"
                class="absolute -top-1 -right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 touch-manipulation"
                onclick={removePicture}
                disabled={uploadingPicture}
              >
                <X size={14} />
              </button>
            {:else}
              <div
                class="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-semibold"
                style:background-color={localAccentColor}
              >
                {$displayAbbreviations[$activeUser]}
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
              class="btn-secondary text-sm"
              onclick={() => fileInput?.click()}
              disabled={uploadingPicture}
            >
              <Camera size={16} />
              <span>{localProfilePicture ? 'Change' : 'Upload'} Photo</span>
            </button>
            <p class="text-xs text-slate-400 mt-1">Max 5MB, JPG/PNG</p>
          </div>
        </div>
      </div>

      <!-- Display Name -->
      <div>
        <label for="settings-display-name" class="block text-sm font-medium mb-2">Display Name</label>
        <input
          id="settings-display-name"
          type="text"
          bind:value={localName}
          onblur={handleNameChange}
          class="input"
          placeholder="Your name"
        />
      </div>

      <!-- Theme -->
      <div>
        <span class="block text-sm font-medium mb-2">Theme</span>
        <div class="flex gap-3">
          <button
            type="button"
            class="flex-1 py-3 px-4 rounded-xl border-2 transition-all flex items-center justify-center gap-2 touch-manipulation {localTheme === 'light' ? 'border-accent bg-accent/10' : 'border-slate-200 dark:border-slate-700'}"
            onclick={() => handleThemeChange('light')}
          >
            <Sun size={20} />
            <span>Light</span>
          </button>
          <button
            type="button"
            class="flex-1 py-3 px-4 rounded-xl border-2 transition-all flex items-center justify-center gap-2 touch-manipulation {localTheme === 'dark' ? 'border-accent bg-accent/10' : 'border-slate-200 dark:border-slate-700'}"
            onclick={() => handleThemeChange('dark')}
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
              type="button"
              class="w-10 h-10 rounded-full border-2 transition-transform hover:scale-110 touch-manipulation"
              style:background-color={color}
              class:border-white={localAccentColor === color}
              class:border-transparent={localAccentColor !== color}
              class:ring-2={localAccentColor === color}
              class:ring-offset-2={localAccentColor === color}
              class:ring-slate-400={localAccentColor === color}
              onclick={() => handleColorChange(color)}
              aria-label="Select color {color}"
            ></button>
          {/each}
        </div>
        <div class="flex items-center gap-3">
          <label for="settings-custom-color" class="text-sm text-slate-500">Custom:</label>
          <input
            id="settings-custom-color"
            type="color"
            bind:value={localAccentColor}
            onchange={() => handleColorChange(localAccentColor)}
            class="w-10 h-10 rounded cursor-pointer border-0"
          />
          <input
            type="text"
            bind:value={localAccentColor}
            onblur={() => handleColorChange(localAccentColor)}
            class="input-sm flex-1 font-mono"
            pattern="^#[0-9A-Fa-f]{6}$"
            aria-label="Custom color hex value"
          />
        </div>
      </div>
    </section>

    <!-- Unit System -->
    <section class="card p-4 space-y-4">
      <h2 class="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
        <Settings size={16} />
        Unit System
      </h2>

      <div>
        <span class="block text-sm font-medium mb-2">Distance Units</span>
        <div class="flex gap-3">
          <button
            type="button"
            class="flex-1 py-3 px-4 rounded-xl border-2 transition-all flex items-center justify-center gap-2 touch-manipulation {localUnitSystem === 'metric' ? 'border-accent bg-accent/10' : 'border-slate-200 dark:border-slate-700'}"
            onclick={() => handleUnitSystemChange('metric')}
          >
            <span>Metric (km)</span>
          </button>
          <button
            type="button"
            class="flex-1 py-3 px-4 rounded-xl border-2 transition-all flex items-center justify-center gap-2 touch-manipulation {localUnitSystem === 'imperial' ? 'border-accent bg-accent/10' : 'border-slate-200 dark:border-slate-700'}"
            onclick={() => handleUnitSystemChange('imperial')}
          >
            <span>Imperial (mi)</span>
          </button>
        </div>
      </div>
    </section>

    <!-- Location Settings -->
    <section class="card p-4 space-y-4">
      <h2 class="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
        <MapPin size={16} />
        Location Settings
      </h2>

      <div>
        <span class="block text-xs text-slate-500 dark:text-slate-400 mb-2">Location Mode</span>
        <div class="flex gap-2">
          <button
            type="button"
            class="flex-1 py-2.5 px-3 rounded-xl border-2 text-sm transition-all touch-manipulation {localLocationMode === 'off' ? 'border-accent bg-accent/10' : 'border-slate-200 dark:border-slate-700'}"
            onclick={() => handleLocationModeChange('off')}
          >
            Off
          </button>
          <button
            type="button"
            class="flex-1 py-2.5 px-3 rounded-xl border-2 text-sm transition-all touch-manipulation {localLocationMode === 'manual' ? 'border-accent bg-accent/10' : 'border-slate-200 dark:border-slate-700'}"
            onclick={() => handleLocationModeChange('manual')}
          >
            Manual
          </button>
          <button
            type="button"
            class="flex-1 py-2.5 px-3 rounded-xl border-2 text-sm transition-all touch-manipulation {localLocationMode === 'auto' ? 'border-accent bg-accent/10' : 'border-slate-200 dark:border-slate-700'}"
            onclick={() => handleLocationModeChange('auto')}
          >
            Auto
          </button>
        </div>
      </div>

      {#if localLocationMode !== 'off'}
        <div>
          <span class="block text-xs text-slate-500 dark:text-slate-400 mb-2">
            {localLocationMode === 'manual' ? 'Your Location' : 'Default Location'}
          </span>
          <LocationPicker
            value={localCurrentLocation}
            onChange={(loc) => { localCurrentLocation = loc; savePreferences(); }}
            placeholder="Search or detect location..."
          />
        </div>

        <div>
          <label for="settings-search-radius" class="block text-xs text-slate-500 dark:text-slate-400 mb-2">Search Radius</label>
          <select
            id="settings-search-radius"
            bind:value={localSearchRadius}
            onchange={handleRadiusChange}
            class="input-sm"
          >
            {#each radiusOptions as opt}
              <option value={opt.value}>{opt.label}</option>
            {/each}
          </select>
        </div>
      {/if}
    </section>

    <!-- Video Queue Integration Settings -->
    <section class="card p-4 space-y-4">
      <h2 class="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
        <Video size={16} />
        Video Queue Integration
      </h2>

      <div>
        <span class="block text-xs text-slate-500 dark:text-slate-400 mb-2">Sync Platform</span>
        <div class="flex gap-2">
          <button
            type="button"
            class="flex-1 py-2.5 px-3 rounded-xl border-2 text-sm transition-all touch-manipulation {localVideoSyncPlatform === 'none' ? 'border-accent bg-accent/10' : 'border-slate-200 dark:border-slate-700'}"
            onclick={() => handleVideoSyncPlatformChange('none')}
          >
            None
          </button>
          <button
            type="button"
            class="flex-1 py-2.5 px-3 rounded-xl border-2 text-sm transition-all touch-manipulation {localVideoSyncPlatform === 'youtube' ? 'border-accent bg-accent/10' : 'border-slate-200 dark:border-slate-700'}"
            onclick={() => handleVideoSyncPlatformChange('youtube')}
          >
            YouTube
          </button>
          <button
            type="button"
            class="flex-1 py-2.5 px-3 rounded-xl border-2 text-sm transition-all touch-manipulation {localVideoSyncPlatform === 'grayjay' ? 'border-accent bg-accent/10' : 'border-slate-200 dark:border-slate-700'}"
            onclick={() => handleVideoSyncPlatformChange('grayjay')}
          >
            Grayjay
          </button>
        </div>
      </div>

      {#if localVideoSyncPlatform === 'youtube'}
        <div class="space-y-3 pt-2">
          <p class="text-sm text-slate-600 dark:text-slate-400">
            Sync your video queue with a YouTube playlist. Videos marked as "queued" will be added to the playlist.
          </p>
          
          {#if !isYouTubeAPIConfigured()}
            <div class="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p class="text-sm text-amber-800 dark:text-amber-200">
                YouTube API is not configured. Please contact the administrator to set up YouTube integration.
              </p>
            </div>
          {:else if $currentPreferences?.youtubeAuth}
            <div class="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <p class="text-sm text-green-800 dark:text-green-200 mb-2">
                ✓ Connected to YouTube
              </p>
              <button
                type="button"
                class="btn-secondary text-sm"
                onclick={handleDisconnectYouTube}
              >
                Disconnect
              </button>
            </div>
          {:else}
            <button
              type="button"
              class="btn-primary w-full"
              onclick={handleConnectYouTube}
            >
              <ExternalLinkIcon size={18} />
              <span>Connect YouTube Account</span>
            </button>
          {/if}
        </div>
      {/if}

      {#if localVideoSyncPlatform === 'grayjay'}
        <div class="space-y-3 pt-2">
          <p class="text-sm text-slate-600 dark:text-slate-400">
            Export your video queue for use with Grayjay. Grayjay is a privacy-focused video aggregator by FUTO.
          </p>
          
          <div class="flex gap-2">
            <button
              type="button"
              class="btn-secondary flex-1 text-sm"
              onclick={handleShowGrayjayInstructions}
            >
              <Info size={16} />
              <span>Instructions</span>
            </button>
            <button
              type="button"
              class="btn-secondary flex-1 text-sm"
              onclick={handleExportForGrayjay}
            >
              <Download size={16} />
              <span>Export</span>
            </button>
          </div>

          <p class="text-xs text-slate-500 dark:text-slate-400">
            Note: Use the Export button on the Videos page to download your queue for Grayjay.
          </p>
        </div>
      {/if}
    </section>

    <!-- App Settings -->
    <section class="card p-4 space-y-4">
      <h2 class="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
        <Info size={16} />
        App
      </h2>

      <!-- Update/Reload Button -->
      <button
        type="button"
        class="btn-secondary w-full"
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
        type="button"
        class="btn-danger w-full"
        onclick={handleLogout}
      >
        <LogOut size={18} />
        <span>Log Out</span>
      </button>

      <!-- Version Info -->
      <button
        type="button"
        class="w-full text-center text-xs text-slate-400 pt-2 cursor-default touch-manipulation"
        onclick={handleVersionTap}
      >
        <p>Us - Couples App v0.1.0</p>
        <p class="mt-1">Preferences sync across devices</p>
      </button>
    </section>
  </div>
</div>

<!-- Grayjay Instructions Modal -->
{#if showGrayjayInstructions}
  <div 
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" 
    onclick={() => showGrayjayInstructions = false}
    onkeydown={(e) => e.key === 'Escape' && (showGrayjayInstructions = false)}
    role="button"
    tabindex="-1"
    aria-label="Close modal"
  >
    <div 
      class="bg-white dark:bg-slate-800 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6 shadow-xl" 
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      tabindex="0"
    >
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-bold text-slate-900 dark:text-slate-100">Grayjay Integration</h2>
        <button
          onclick={() => showGrayjayInstructions = false}
          class="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
        >
          <X size={20} />
        </button>
      </div>
      
      <div class="prose prose-sm dark:prose-invert max-w-none">
        <p class="text-slate-600 dark:text-slate-400">
          Grayjay is a privacy-focused video aggregator by FUTO that allows you to follow creators across multiple platforms.
        </p>
        
        <h3 class="text-lg font-semibold mt-4 mb-2">Integration Options</h3>
        
        <div class="space-y-4">
          <div class="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
            <h4 class="font-semibold mb-1">Option 1: Deep Links</h4>
            <p class="text-sm text-slate-600 dark:text-slate-400">
              Click the Grayjay icon next to any video in your queue to open it directly in the Grayjay app (if installed).
            </p>
          </div>
          
          <div class="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
            <h4 class="font-semibold mb-1">Option 2: Export & Import</h4>
            <p class="text-sm text-slate-600 dark:text-slate-400 mb-2">
              Export your video queue and import it into Grayjay:
            </p>
            <ol class="text-sm text-slate-600 dark:text-slate-400 list-decimal list-inside space-y-1">
              <li>Go to the Videos page</li>
              <li>Click "Export for Grayjay"</li>
              <li>Save the JSON file</li>
              <li>Import the file in Grayjay (feature availability may vary)</li>
            </ol>
          </div>
          
          <div class="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
            <h4 class="font-semibold mb-1">Option 3: URL List</h4>
            <p class="text-sm text-slate-600 dark:text-slate-400">
              Export a simple list of YouTube URLs to manually add to Grayjay playlists.
            </p>
          </div>
        </div>
        
        <div class="mt-6 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <p class="text-sm text-blue-800 dark:text-blue-200">
            <strong>Future Enhancement:</strong> When Grayjay provides an API for external integrations, this app will support automatic syncing.
          </p>
        </div>
        
        <div class="mt-4">
          <a 
            href="https://grayjay.app/" 
            target="_blank" 
            rel="noopener noreferrer"
            class="text-accent hover:underline inline-flex items-center gap-1"
          >
            Learn more about Grayjay
            <ExternalLinkIcon size={14} />
          </a>
        </div>
      </div>
      
      <div class="flex justify-end mt-6">
        <button
          onclick={() => showGrayjayInstructions = false}
          class="btn-primary"
        >
          Got it
        </button>
      </div>
    </div>
  </div>
{/if}

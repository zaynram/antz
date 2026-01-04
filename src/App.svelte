<script lang="ts">
  import { onAuthChange } from '$lib/firebase'
  import { authLoading, authUser, currentPreferences, initPreferencesSync, cleanupPreferencesSync } from '$lib/stores/app'
  import { onMount } from 'svelte'
  import { Toaster } from 'svelte-sonner'
  import { SearchX, WifiOff } from 'lucide-svelte'

  import Sidebar from '$lib/components/Sidebar.svelte'
  import BackToTop from '$lib/components/ui/BackToTop.svelte'
  import Search from '$lib/pages/Search.svelte'
  import Login from '$lib/pages/Login.svelte'
  import Library from '$lib/pages/Library.svelte'
  import Debug from '$lib/pages/Debug.svelte'
  import Notes from '$lib/pages/Notes.svelte'
  import Places from '$lib/pages/Places.svelte'
  import Settings from '$lib/pages/Settings.svelte'

  let currentPath = $state(window.location.pathname)
  let isOffline = $state(!navigator.onLine)

  onMount(() => {
    const handleOnline = () => { isOffline = false }
    const handleOffline = () => { isOffline = true }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    const unsubscribe = onAuthChange((user) => {
      authUser.set(user)
      authLoading.set(false)

      if (user) {
        initPreferencesSync()
      } else {
        cleanupPreferencesSync()
      }
    })

    const handlePopState = () => {
      currentPath = window.location.pathname
    }
    window.addEventListener('popstate', handlePopState)

    return () => {
      unsubscribe()
      cleanupPreferencesSync()
      window.removeEventListener('popstate', handlePopState)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  })

  function navigate(path: string) {
    window.history.pushState({}, '', path)
    currentPath = path
  }

  // Non-reactive tracking to prevent effect double-runs
  let prevTheme: string | undefined = undefined
  let prevAccentColor: string | undefined = undefined

  $effect(() => {
    if ($currentPreferences) {
      const root = document.documentElement
      const { theme, accentColor } = $currentPreferences

      if (prevTheme !== theme) {
        root.classList.toggle('dark', theme === 'dark')
        prevTheme = theme
      }

      if (prevAccentColor !== accentColor) {
        root.style.setProperty('--color-accent', accentColor)
        prevAccentColor = accentColor
      }
    }
  })

  // Determine library type from path
  let libraryType = $derived.by(() => {
    if (currentPath === '/library/movies') return 'movie' as const
    if (currentPath === '/library/tv') return 'tv' as const
    if (currentPath === '/library/games') return 'game' as const
    return null
  })
</script>

<Toaster richColors position="bottom-center" />

{#if isOffline}
  <div class="fixed top-0 left-0 right-0 z-40 bg-amber-500 text-amber-950 text-sm font-medium py-2 px-4 flex items-center justify-center gap-2">
    <WifiOff size={16} />
    <span>You're offline</span>
  </div>
{/if}

{#if $authLoading}
  <div class="flex items-center justify-center h-screen">
    <div class="flex flex-col items-center gap-3">
      <div class="w-10 h-10 border-3 border-accent border-t-transparent rounded-full animate-spin"></div>
      <span class="text-slate-500 dark:text-slate-400">Loading...</span>
    </div>
  </div>
{:else if !$authUser}
  <Login />
{:else}
  <Sidebar {currentPath} {navigate} />

  <main
    class="min-h-screen pt-16 pb-8 px-4 sm:px-6 transition-all"
    class:pt-24={isOffline}
  >
    <div class="max-w-5xl mx-auto">
      {#if currentPath === '/'}
        <Search {navigate} />
      {:else if currentPath === '/notes'}
        <Notes />
      {:else if libraryType}
        <Library type={libraryType} {navigate} />
      {:else if currentPath === '/places'}
        <Places />
      {:else if currentPath === '/debug'}
        <Debug />
      {:else if currentPath === '/settings'}
        <Settings {navigate} />
      {:else}
        <!-- 404 Not Found -->
        <div class="text-center py-16">
          <div class="text-slate-300 dark:text-slate-600 mb-4 flex justify-center">
            <SearchX size={80} />
          </div>
          <h1 class="text-2xl font-bold mb-2">Page not found</h1>
          <p class="text-slate-500 dark:text-slate-400 mb-6">The page you're looking for doesn't exist.</p>
          <button
            onclick={() => navigate('/')}
            class="px-6 py-2 bg-accent text-white rounded-lg font-medium hover:opacity-90"
          >
            Go to Search
          </button>
        </div>
      {/if}
    </div>
  </main>

  <BackToTop />
{/if}

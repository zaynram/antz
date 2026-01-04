<script lang="ts">
  import { onAuthChange } from '$lib/firebase'
  import { authLoading, authUser, currentPreferences, initPreferencesSync, cleanupPreferencesSync } from '$lib/stores/app'
  import { onMount } from 'svelte'
  import { Toaster } from 'svelte-sonner'
  import { Home as HomeIcon, StickyNote, Film, MapPin, SearchX, WifiOff } from 'lucide-svelte'

  import UserToggle from '$lib/components/UserToggle.svelte'
  import Home from '$lib/pages/Home.svelte'
  import Login from '$lib/pages/Login.svelte'
  import Media from '$lib/pages/Media.svelte'
  import Debug from '$lib/pages/Debug.svelte'
  import Notes from '$lib/pages/Notes.svelte'
  import Places from '$lib/pages/Places.svelte'
  import Settings from '$lib/pages/Settings.svelte'

  let currentPath = $state(window.location.pathname);
  let isOffline = $state(!navigator.onLine);

  onMount(() => {
    // Track online/offline status
    const handleOnline = () => { isOffline = false; };
    const handleOffline = () => { isOffline = true; };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const unsubscribe = onAuthChange((user) => {
      authUser.set(user);
      authLoading.set(false);

      if (user) {
        // Initialize preference sync when authenticated
        initPreferencesSync();
      } else {
        // Cleanup sync on logout
        cleanupPreferencesSync();
      }
    });

    const handlePopState = () => {
      currentPath = window.location.pathname;
    };
    window.addEventListener('popstate', handlePopState);

    return () => {
      unsubscribe();
      cleanupPreferencesSync();
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  });

  function navigate(path: string) {
    window.history.pushState({}, '', path);
    currentPath = path;
  }

  // Non-reactive tracking to prevent effect double-runs
  let prevTheme: string | undefined = undefined;
  let prevAccentColor: string | undefined = undefined;

  $effect(() => {
    if ($currentPreferences) {
      const root = document.documentElement;
      const { theme, accentColor } = $currentPreferences;

      if (prevTheme !== theme) {
        root.classList.toggle('dark', theme === 'dark');
        prevTheme = theme;
      }

      if (prevAccentColor !== accentColor) {
        root.style.setProperty('--color-accent', accentColor);
        prevAccentColor = accentColor;
      }
    }
  });
</script>

<Toaster richColors position="bottom-center" />

{#if isOffline}
  <div class="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-amber-950 text-sm font-medium py-2 px-4 flex items-center justify-center gap-2 safe-area-top">
    <WifiOff size={16} />
    <span>You're offline - some features may be unavailable</span>
  </div>
{/if}

{#if $authLoading}
  <div class="flex items-center justify-center h-screen text-xl text-slate-500">
    Loading...
  </div>
{:else if !$authUser}
  <Login />
{:else}
  <div class="h-full flex flex-col overflow-hidden">
    <header
      class="flex items-center justify-between px-6 py-4 bg-surface border-b border-slate-200 dark:border-slate-700 shrink-0 safe-area-x"
      class:pt-[calc(1rem+env(safe-area-inset-top))]={isOffline}
    >
      <nav class="flex gap-4 sm:gap-6">
        <button
          onclick={() => navigate('/')}
          class="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-medium hover:text-accent transition-colors"
          class:text-accent={currentPath === '/'}
        >
          <HomeIcon size={18} />
          <span class="hidden sm:inline">Home</span>
        </button>
        <button
          onclick={() => navigate('/notes')}
          class="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-medium hover:text-accent transition-colors"
          class:text-accent={currentPath === '/notes'}
        >
          <StickyNote size={18} />
          <span class="hidden sm:inline">Notes</span>
        </button>
        <button
          onclick={() => navigate('/media')}
          class="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-medium hover:text-accent transition-colors"
          class:text-accent={currentPath === '/media'}
        >
          <Film size={18} />
          <span class="hidden sm:inline">Media</span>
        </button>
        <button
          onclick={() => navigate('/places')}
          class="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-medium hover:text-accent transition-colors"
          class:text-accent={currentPath === '/places'}
        >
          <MapPin size={18} />
          <span class="hidden sm:inline">Places</span>
        </button>
      </nav>
      <UserToggle {navigate} />
    </header>

    <main class="flex-1 overflow-y-auto overflow-x-hidden p-6 max-w-5xl mx-auto w-full safe-area-x safe-area-bottom">
      {#if currentPath === '/'}
        <Home {navigate} />
      {:else if currentPath === '/notes'}
        <Notes />
      {:else if currentPath === '/media'}
        <Media />
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
            Go Home
          </button>
        </div>
      {/if}
    </main>
  </div>
{/if}

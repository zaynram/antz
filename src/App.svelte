<script lang="ts">
  import { onAuthChange } from '$lib/firebase'
  import { authLoading, authUser, currentPreferences } from '$lib/stores/app'
  import { onMount } from 'svelte'

  import UserToggle from '$lib/components/UserToggle.svelte'
  import Home from '$lib/pages/Home.svelte'
  import Login from '$lib/pages/Login.svelte'
  import Media from '$lib/pages/Media.svelte'
  import Notes from '$lib/pages/Notes.svelte'
  import Places from '$lib/pages/Places.svelte'

  let currentPath = $state(window.location.pathname);

  onMount(() => {
    const unsubscribe = onAuthChange((user) => {
      authUser.set(user);
      authLoading.set(false);
    });

    const handlePopState = () => {
      currentPath = window.location.pathname;
    };
    window.addEventListener('popstate', handlePopState);

    return () => {
      unsubscribe();
      window.removeEventListener('popstate', handlePopState);
    };
  });

  function navigate(path: string) {
    window.history.pushState({}, '', path);
    currentPath = path;
  }

  let prevTheme = $state<string>('');
  let prevAccentColor = $state<string>('');

  $effect(() => {
    if ($currentPreferences) {
      const root = document.documentElement;
      const isDark = $currentPreferences.theme === 'dark';
      const accentColor = $currentPreferences.accentColor;

      // Only update theme if it changed
      if (prevTheme !== $currentPreferences.theme) {
        root.classList.toggle('dark', isDark);
        prevTheme = $currentPreferences.theme;
      }

      // Only update accent color if it changed
      if (prevAccentColor !== accentColor) {
        root.style.setProperty('--color-accent', accentColor);
        prevAccentColor = accentColor;
      }
    }
  });
</script>

{#if $authLoading}
  <div class="flex items-center justify-center h-screen text-xl text-slate-500">
    Loading...
  </div>
{:else if !$authUser}
  <Login />
{:else}
  <div class="min-h-screen flex flex-col">
    <header
      class="flex items-center justify-between px-6 py-4 bg-surface border-b border-slate-200 dark:border-slate-700"
    >
      <nav class="flex gap-6">
        <button
          onclick={() => navigate('/')}
          class="text-slate-500 dark:text-slate-400 font-medium hover:text-accent transition-colors"
          class:text-accent={currentPath === '/'}
        >
          Home
        </button>
        <button
          onclick={() => navigate('/notes')}
          class="text-slate-500 dark:text-slate-400 font-medium hover:text-accent transition-colors"
          class:text-accent={currentPath === '/notes'}
        >
          Notes
        </button>
        <button
          onclick={() => navigate('/media')}
          class="text-slate-500 dark:text-slate-400 font-medium hover:text-accent transition-colors"
          class:text-accent={currentPath === '/media'}
        >
          Media
        </button>
        <button
          onclick={() => navigate('/places')}
          class="text-slate-500 dark:text-slate-400 font-medium hover:text-accent transition-colors"
          class:text-accent={currentPath === '/places'}
        >
          Places
        </button>
      </nav>
      <UserToggle />
    </header>

    <main class="flex-1 p-6 max-w-5xl mx-auto w-full">
      {#if currentPath === '/'}
        <Home {navigate} />
      {:else if currentPath === '/notes'}
        <Notes />
      {:else if currentPath === '/media'}
        <Media />
      {:else if currentPath === '/places'}
        <Places />
      {/if}
    </main>
  </div>
{/if}

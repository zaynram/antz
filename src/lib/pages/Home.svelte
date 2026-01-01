<script lang="ts">
  import { logOut } from '$lib/firebase'
  import { currentPreferences } from '$lib/stores/app'

  interface Props {
    navigate: (path: string) => void;
  }

  let { navigate }: Props = $props();
</script>

<div class="max-w-3xl mx-auto">
  <section class="text-center mb-12">
    <h1 class="text-3xl font-bold mb-2">Welcome back, {$currentPreferences.name}</h1>
    <p class="text-slate-500 dark:text-slate-400">What would you like to do today?</p>
  </section>

  <section class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12">
    <button
      onclick={() => navigate('/notes')}
      class="block p-6 bg-surface border border-slate-200 dark:border-slate-700 rounded-xl transition-all hover:border-accent hover:-translate-y-0.5 text-left text-slate-900 dark:text-slate-100"
    >
      <span class="text-3xl block mb-3">📝</span>
      <h2 class="text-xl font-semibold mb-1 text-slate-900 dark:text-slate-100">Notes</h2>
      <p class="text-slate-500 dark:text-slate-400 text-sm">Thoughts, memories, and letters</p>
    </button>

    <button
      onclick={() => navigate('/media')}
      class="block p-6 bg-surface border border-slate-200 dark:border-slate-700 rounded-xl transition-all hover:border-accent hover:-translate-y-0.5 text-left text-slate-900 dark:text-slate-100"
    >
      <span class="text-3xl block mb-3">🎬</span>
      <h2 class="text-xl font-semibold mb-1 text-slate-900 dark:text-slate-100">Media</h2>
      <p class="text-slate-500 dark:text-slate-400 text-sm">Shows, movies, and games</p>
    </button>

    <button
      onclick={() => navigate('/places')}
      class="block p-6 bg-surface border border-slate-200 dark:border-slate-700 rounded-xl transition-all hover:border-accent hover:-translate-y-0.5 text-left text-slate-900 dark:text-slate-100"
    >
      <span class="text-3xl block mb-3">📍</span>
      <h2 class="text-xl font-semibold mb-1 text-slate-900 dark:text-slate-100">Places</h2>
      <p class="text-slate-500 dark:text-slate-400 text-sm">Restaurants and spots to visit</p>
    </button>
  </section>

  <button
    class="block mx-auto px-4 py-2 text-sm text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-slate-400 dark:hover:border-slate-500 transition-colors"
    onclick={logOut}
  >
    Sign out
  </button>
</div>

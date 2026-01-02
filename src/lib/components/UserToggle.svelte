<script lang="ts">
  import { onMount } from 'svelte';
  import { activeUser, userPreferences } from '$lib/stores/app';
  import { Settings } from 'lucide-svelte';

  interface Props {
    navigate?: (path: string) => void;
  }

  let { navigate }: Props = $props();

  let transitioning = $state(false);
  let transitionDirection = $state<'left' | 'right'>('right');

  // Get preferences for both users
  let zPrefs = $derived($userPreferences.Z);
  let tPrefs = $derived($userPreferences.T);

  function setUser(user: 'Z' | 'T'): void {
    if ($activeUser === user) return;

    transitionDirection = user === 'T' ? 'right' : 'left';
    transitioning = true;

    setTimeout(() => {
      activeUser.set(user);
      setTimeout(() => {
        transitioning = false;
      }, 150);
    }, 50);
  }

  onMount(() => {
    function handleKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'u') {
        e.preventDefault();
        setUser($activeUser === 'Z' ? 'T' : 'Z');
      }
    }
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });
</script>

<div class="flex items-center gap-2">
  <button
    class="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
    onclick={() => navigate?.('/settings')}
    title="Settings"
  >
    <Settings size={18} />
  </button>
  
  <div class="flex gap-1 p-1 rounded-full bg-surface-2" title="Ctrl+U to toggle">
    <button
      onclick={() => setUser('Z')}
      class="w-8 h-8 rounded-full text-sm font-semibold transition-all duration-150 ease-out overflow-hidden flex items-center justify-center"
      style:background-color={$activeUser === 'Z' && !zPrefs?.profilePicture ? zPrefs?.accentColor : 'transparent'}
      style:transform={transitioning && transitionDirection === 'left' ? 'translateX(4px)' : 'translateX(0)'}
      class:text-white={$activeUser === 'Z' && !zPrefs?.profilePicture}
      class:text-slate-400={$activeUser !== 'Z'}
      class:ring-2={$activeUser === 'Z'}
      style:--tw-ring-color={zPrefs?.accentColor}
    >
      {#if zPrefs?.profilePicture}
        <img src={zPrefs.profilePicture} alt="Z" class="w-full h-full object-cover" />
      {:else}
        Z
      {/if}
    </button>
    <button
      onclick={() => setUser('T')}
      class="w-8 h-8 rounded-full text-sm font-semibold transition-all duration-150 ease-out overflow-hidden flex items-center justify-center"
      style:background-color={$activeUser === 'T' && !tPrefs?.profilePicture ? tPrefs?.accentColor : 'transparent'}
      style:transform={transitioning && transitionDirection === 'right' ? 'translateX(-4px)' : 'translateX(0)'}
      class:text-white={$activeUser === 'T' && !tPrefs?.profilePicture}
      class:text-slate-400={$activeUser !== 'T'}
      class:ring-2={$activeUser === 'T'}
      style:--tw-ring-color={tPrefs?.accentColor}
    >
      {#if tPrefs?.profilePicture}
        <img src={tPrefs.profilePicture} alt="T" class="w-full h-full object-cover" />
      {:else}
        T
      {/if}
    </button>
  </div>
</div>

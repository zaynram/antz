<script lang="ts">
  import { onMount } from 'svelte';
  import { activeUser, currentPreferences } from '$lib/stores/app';

  let transitioning = $state(false);
  let transitionDirection = $state<'left' | 'right'>('right');

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

<div class="flex gap-1 p-1 rounded-full bg-surface-2" title="Ctrl+U to toggle">
  <button
    onclick={() => setUser('Z')}
    class="w-8 h-8 rounded-full text-sm font-semibold transition-all duration-150 ease-out"
    style:background-color={$activeUser === 'Z' ? $currentPreferences.accentColor : 'transparent'}
    style:transform={transitioning && transitionDirection === 'left' ? 'translateX(4px)' : 'translateX(0)'}
    class:text-white={$activeUser === 'Z'}
    class:text-slate-400={$activeUser !== 'Z'}
  >
    Z
  </button>
  <button
    onclick={() => setUser('T')}
    class="w-8 h-8 rounded-full text-sm font-semibold transition-all duration-150 ease-out"
    style:background-color={$activeUser === 'T' ? $currentPreferences.accentColor : 'transparent'}
    style:transform={transitioning && transitionDirection === 'right' ? 'translateX(-4px)' : 'translateX(0)'}
    class:text-white={$activeUser === 'T'}
    class:text-slate-400={$activeUser !== 'T'}
  >
    T
  </button>
</div>

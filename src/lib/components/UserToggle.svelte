<script lang="ts">
  import { onMount } from 'svelte';
  import { activeUser, currentPreferences } from '$lib/stores/app';
  import PreferencesModal from './PreferencesModal.svelte';

  let transitioning = $state(false);
  let transitionDirection = $state<'left' | 'right'>('right');
  let showPreferences = $state(false);

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

<PreferencesModal open={showPreferences} onClose={() => showPreferences = false} />

<div class="flex items-center gap-2">
  <button
    class="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
    onclick={() => showPreferences = true}
    title="Preferences"
  >
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  </button>
  
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
</div>

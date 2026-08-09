<script lang="ts">
  import { activeUser, displayAbbreviations, userPreferences } from '$lib/stores/app'
  import { hapticLight } from '$lib/haptics'
  import type { UserId } from '$lib/types'

  let isExpanded = $state(false)
  let pillEl = $state<HTMLDivElement | null>(null)

  function toggle(): void {
    isExpanded = !isExpanded
  }

  function selectUser(userId: UserId): void {
    hapticLight()
    activeUser.set(userId)
    isExpanded = false
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && isExpanded) {
      isExpanded = false
    }
  }

  function handleOutsideClick(e: MouseEvent): void {
    if (pillEl && !pillEl.contains(e.target as Node)) {
      isExpanded = false
    }
  }

  const users: UserId[] = ['Z', 'T']
</script>

<svelte:window onkeydown={handleKeydown} onclick={handleOutsideClick} />

<div bind:this={pillEl} class="fixed bottom-20 right-4 z-30">
  {#if isExpanded}
    <!-- Expanded picker -->
    <div
      class="flex items-center gap-1 p-1 rounded-full bg-surface border border-slate-200 dark:border-slate-700 shadow-lg"
      role="listbox"
      aria-label="Switch user"
    >
      {#each users as userId (userId)}
        {@const prefs = $userPreferences[userId]}
        <button
          type="button"
          role="option"
          aria-selected={$activeUser === userId}
          class="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold transition-transform hover:scale-105 touch-manipulation
            {$activeUser === userId ? 'ring-2 ring-offset-1 ring-accent' : ''}"
          style:background-color={prefs?.accentColor ?? '#6366f1'}
          onclick={() => selectUser(userId)}
        >
          {$displayAbbreviations[userId]}
        </button>
      {/each}
    </div>
  {:else}
    <!-- Collapsed trigger -->
    <button
      type="button"
      aria-label="Switch user"
      class="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-lg transition-transform hover:scale-105 touch-manipulation"
      style:background-color={$userPreferences[$activeUser]?.accentColor ?? '#6366f1'}
      onclick={toggle}
    >
      {$displayAbbreviations[$activeUser]}
    </button>
  {/if}
</div>

<script lang="ts">
  import { activeUser, displayAbbreviations, userPreferences } from '$lib/stores/app'
  import { hapticLight } from '$lib/haptics'
  import { DEFAULT_ACCENT } from '$lib/accents'
  import type { UserId } from '$lib/types'

  let isExpanded = $state(false)
  let pillEl = $state<HTMLDivElement | null>(null)

  // stopPropagation keeps the window click handler from seeing this tap and
  // immediately collapsing the pill (the toggle re-renders and detaches the
  // trigger, so an outside-click check would otherwise wrongly fire).
  function toggle(e: MouseEvent): void {
    e.stopPropagation()
    isExpanded = !isExpanded
  }

  function selectUser(e: MouseEvent, userId: UserId): void {
    e.stopPropagation()
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
      class="flex items-center gap-1 p-1 rounded-full bg-surface border border-[var(--color-border)] shadow-lg"
      role="listbox"
      aria-label="Switch user"
    >
      {#each users as userId (userId)}
        {@const prefs = $userPreferences[userId]}
        <button
          type="button"
          role="option"
          aria-selected={$activeUser === userId}
          class="w-11 h-11 rounded-full flex items-center justify-center text-white text-sm font-bold transition-transform hover:scale-105 touch-manipulation
            {$activeUser === userId ? 'ring-2 ring-offset-1 ring-accent' : ''}"
          style:background-color={prefs?.accentColor ?? DEFAULT_ACCENT}
          onclick={(e) => selectUser(e, userId)}
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
      class="w-11 h-11 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-lg transition-transform hover:scale-105 touch-manipulation"
      style:background-color={$userPreferences[$activeUser]?.accentColor ?? DEFAULT_ACCENT}
      onclick={toggle}
    >
      {$displayAbbreviations[$activeUser]}
    </button>
  {/if}
</div>

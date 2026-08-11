<script lang="ts">
  import { onMount } from 'svelte'
  import { Heart, User } from 'lucide-svelte'
  import { activeUser, displayAbbreviations, displayNames, userPreferences } from '$lib/stores/app'
  import { navigate } from '$lib/stores/nav'
  import { hapticLight } from '$lib/haptics'
  import { DEFAULT_ACCENT } from '$lib/accents'
  import type { UserId } from '$lib/types'

  const STORAGE_KEY = 'identity-pill-pos'
  const DRAG_THRESHOLD = 6
  const EDGE_MARGIN = 8

  let isExpanded = $state(false)
  let pillEl = $state<HTMLDivElement | null>(null)
  // Persisted top-left position (px). Null = default bottom-right anchor.
  let pos = $state<{ x: number; y: number } | null>(null)
  let dragging = $state(false)

  // Non-reactive drag internals
  let pointerId: number | null = null
  let grabDX = 0
  let grabDY = 0
  let startX = 0
  let startY = 0
  let justDragged = false

  onMount(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) pos = JSON.parse(stored)
    } catch (e) {
      console.warn('Failed to load pill position:', e)
    }
    // Clamp after layout so a resized viewport can't strand the pill offscreen.
    requestAnimationFrame(clampIntoView)
    const onResize = () => clampIntoView()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  })

  function clampIntoView(): void {
    if (!pos || !pillEl) return
    const rect = pillEl.getBoundingClientRect()
    const maxX = Math.max(EDGE_MARGIN, window.innerWidth - rect.width - EDGE_MARGIN)
    const maxY = Math.max(EDGE_MARGIN, window.innerHeight - rect.height - EDGE_MARGIN)
    pos = {
      x: Math.min(Math.max(EDGE_MARGIN, pos.x), maxX),
      y: Math.min(Math.max(EDGE_MARGIN, pos.y), maxY),
    }
  }

  function onPointerDown(e: PointerEvent): void {
    if (e.button && e.button !== 0) return
    if (!pillEl) return
    const rect = pillEl.getBoundingClientRect()
    grabDX = e.clientX - rect.left
    grabDY = e.clientY - rect.top
    startX = e.clientX
    startY = e.clientY
    dragging = false
    pointerId = e.pointerId
    pillEl.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: PointerEvent): void {
    if (pointerId === null || !pillEl) return
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    if (!dragging && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      dragging = true
      hapticLight()
    }
    if (dragging) {
      e.preventDefault()
      const rect = pillEl.getBoundingClientRect()
      const maxX = window.innerWidth - rect.width - EDGE_MARGIN
      const maxY = window.innerHeight - rect.height - EDGE_MARGIN
      pos = {
        x: Math.min(Math.max(EDGE_MARGIN, e.clientX - grabDX), maxX),
        y: Math.min(Math.max(EDGE_MARGIN, e.clientY - grabDY), maxY),
      }
    }
  }

  function onPointerUp(e: PointerEvent): void {
    if (pointerId === null || !pillEl) return
    try { pillEl.releasePointerCapture(e.pointerId) } catch { /* already released */ }
    pointerId = null
    if (dragging) {
      // Suppress the click that follows a drag so it doesn't toggle/select.
      justDragged = true
      setTimeout(() => { justDragged = false }, 0)
      try {
        if (pos) localStorage.setItem(STORAGE_KEY, JSON.stringify(pos))
      } catch (err) {
        console.warn('Failed to save pill position:', err)
      }
    }
    dragging = false
  }

  function toggle(e: MouseEvent): void {
    e.stopPropagation()
    if (justDragged) return
    isExpanded = !isExpanded
  }

  function selectUser(e: MouseEvent, userId: UserId): void {
    e.stopPropagation()
    if (justDragged) return
    hapticLight()
    activeUser.set(userId)
    isExpanded = false
  }

  function goProfiles(e: MouseEvent, view: 'mine' | 'theirs'): void {
    e.stopPropagation()
    if (justDragged) return
    hapticLight()
    navigate(`/profiles?view=${view}`)
    isExpanded = false
  }

  let otherUser = $derived<UserId>($activeUser === 'Z' ? 'T' : 'Z')

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

  let posStyle = $derived(pos ? `left:${pos.x}px; top:${pos.y}px; right:auto; bottom:auto;` : '')
</script>

<svelte:window onkeydown={handleKeydown} onclick={handleOutsideClick} />

<div
  bind:this={pillEl}
  class="pill-root fixed z-30 touch-none select-none {pos ? '' : 'bottom-20 right-4'} {dragging ? 'is-dragging' : ''}"
  style={posStyle}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerUp}
>
  {#if isExpanded}
    <!-- Expanded panel: switch identity + profile access -->
    <div
      class="flex flex-col gap-2 p-2 rounded-2xl bg-surface border border-[var(--color-border)] shadow-xl w-52"
      role="dialog"
      aria-label="Identity and profiles"
    >
      <div class="flex items-center gap-2" role="listbox" aria-label="Switch user">
        {#each users as userId (userId)}
          {@const prefs = $userPreferences[userId]}
          <button
            type="button"
            role="option"
            aria-selected={$activeUser === userId}
            class="flex-1 flex items-center gap-2 p-1.5 rounded-xl transition-colors touch-manipulation
              {$activeUser === userId ? 'bg-accent/10' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}"
            onclick={(e) => selectUser(e, userId)}
          >
            <span
              class="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 {$activeUser === userId ? 'ring-2 ring-offset-1 ring-accent' : ''}"
              style:background-color={prefs?.accentColor ?? DEFAULT_ACCENT}
            >{$displayAbbreviations[userId]}</span>
            <span class="text-sm font-medium truncate">{$displayNames[userId]}</span>
          </button>
        {/each}
      </div>

      <div class="h-px bg-[var(--color-border)]"></div>

      <button
        type="button"
        class="flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left text-sm font-medium transition-colors touch-manipulation hover:bg-slate-100 dark:hover:bg-slate-800"
        onclick={(e) => goProfiles(e, 'mine')}
      >
        <User size={16} class="text-accent" />
        My keepsakes
      </button>
      <button
        type="button"
        class="flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left text-sm font-medium transition-colors touch-manipulation hover:bg-slate-100 dark:hover:bg-slate-800"
        onclick={(e) => goProfiles(e, 'theirs')}
      >
        <Heart size={16} class="text-accent" />
        {$displayNames[otherUser]}'s keepsakes
      </button>
    </div>
  {:else}
    <!-- Collapsed trigger (tap to switch, hold and drag to move) -->
    <button
      type="button"
      aria-label="Switch user — hold and drag to move"
      class="w-11 h-11 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-lg transition-transform hover:scale-105 touch-manipulation"
      style:background-color={$userPreferences[$activeUser]?.accentColor ?? DEFAULT_ACCENT}
      onclick={toggle}
    >
      {$displayAbbreviations[$activeUser]}
    </button>
  {/if}
</div>

<style>
  .pill-root :global(button) { cursor: grab; }
  .pill-root.is-dragging { cursor: grabbing; }
  .pill-root.is-dragging :global(button) { cursor: grabbing; }
</style>

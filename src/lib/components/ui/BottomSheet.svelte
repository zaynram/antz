<script lang="ts">
  import { X } from 'lucide-svelte'
  import type { Snippet } from 'svelte'

  interface Props {
    open: boolean
    onClose: () => void
    title?: string
    maxHeight?: string
    children?: Snippet
  }

  let { open, onClose, title, maxHeight = '90vh', children }: Props = $props()

  // Drag state
  let sheetEl = $state<HTMLDivElement | null>(null)
  let dragStartY = $state(0)
  let dragCurrentY = $state(0)
  let isDragging = $state(false)

  function handleTouchStart(e: TouchEvent): void {
    dragStartY = e.touches[0].clientY
    dragCurrentY = dragStartY
    isDragging = true
  }

  function handleTouchMove(e: TouchEvent): void {
    if (!isDragging) return
    dragCurrentY = e.touches[0].clientY
  }

  function handleTouchEnd(): void {
    if (!isDragging || !sheetEl) return
    isDragging = false

    const diff = dragCurrentY - dragStartY
    const sheetHeight = sheetEl.offsetHeight
    if (diff > sheetHeight * 0.5) {
      onClose()
    }

    dragStartY = 0
    dragCurrentY = 0
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') onClose()
  }

  let dragOffset = $derived(isDragging ? Math.max(0, dragCurrentY - dragStartY) : 0)
  let dragStyle = $derived(dragOffset > 0 ? `transform: translateY(${dragOffset}px)` : '')
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <!-- Backdrop -->
  <button
    type="button"
    class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
    onclick={onClose}
    aria-label="Close"
    tabindex="-1"
  ></button>

  <!-- Sheet -->
  <div
    bind:this={sheetEl}
    class="fixed bottom-0 left-0 right-0 z-50 bg-surface rounded-t-2xl shadow-2xl safe-area-bottom flex flex-col overflow-hidden transition-transform"
    style="max-height: {maxHeight}; {dragStyle}"
    role="dialog"
    aria-modal="true"
    aria-labelledby={title ? 'bottomsheet-title' : undefined}
    ontouchstart={handleTouchStart}
    ontouchmove={handleTouchMove}
    ontouchend={handleTouchEnd}
  >
    <!-- Drag handle -->
    <div class="flex-shrink-0 flex items-center justify-center pt-3 pb-1">
      <div class="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600"></div>
    </div>

    {#if title}
      <div class="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
        <h2 id="bottomsheet-title" class="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
        <button
          type="button"
          class="btn-icon-sm"
          onclick={onClose}
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </div>
    {/if}

    <div class="flex-1 overflow-y-auto px-4 pb-4">
      {#if children}
        {@render children()}
      {/if}
    </div>
  </div>
{/if}

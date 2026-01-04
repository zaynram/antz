<script lang="ts">
  import type { Snippet } from 'svelte'
  import { X } from 'lucide-svelte'
  import IconButton from './IconButton.svelte'

  interface Props {
    open: boolean
    title: string
    onclose: () => void
    size?: 'sm' | 'md' | 'lg'
    header?: Snippet
    children: Snippet
    footer?: Snippet
  }

  let {
    open,
    title,
    onclose,
    size = 'md',
    header,
    children,
    footer
  }: Props = $props()

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl'
  }

  function handleBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onclose()
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onclose()
    }
  }
</script>

<svelte:window onkeydown={open ? handleKeydown : undefined} />

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    onclick={handleBackdrop}
    onkeydown={handleKeydown}
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
    tabindex="-1"
  >
    <div class="bg-surface rounded-xl {sizes[size]} w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
      <!-- Header -->
      {#if header}
        {@render header()}
      {:else}
        <header class="shrink-0 border-b border-slate-200 dark:border-slate-700 p-4 flex items-center justify-between">
          <h2 id="modal-title" class="text-lg font-bold">{title}</h2>
          <IconButton icon={X} onclick={onclose} label="Close" variant="ghost" size="sm" />
        </header>
      {/if}

      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-4">
        {@render children()}
      </div>

      <!-- Footer -->
      {#if footer}
        <footer class="shrink-0 border-t border-slate-200 dark:border-slate-700 p-4">
          {@render footer()}
        </footer>
      {/if}
    </div>
  </div>
{/if}

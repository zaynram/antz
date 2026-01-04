<script lang="ts">
  import type { ComponentType, Snippet } from 'svelte'
  import { Plus } from 'lucide-svelte'

  interface Props {
    icon: ComponentType
    title: string
    description?: string
    actionLabel?: string
    onAction?: () => void
    children?: Snippet
  }

  let {
    icon: Icon,
    title,
    description,
    actionLabel,
    onAction,
    children
  }: Props = $props()
</script>

<div class="text-center py-16">
  <div class="flex justify-center mb-4 text-slate-300 dark:text-slate-600">
    <Icon size={48} />
  </div>
  <h3 class="text-lg font-medium mb-2">{title}</h3>
  {#if description}
    <p class="text-slate-500 dark:text-slate-400 mb-4">
      {description}
    </p>
  {/if}
  {#if actionLabel && onAction}
    <button
      type="button"
      class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent text-white font-medium hover:opacity-90 transition-opacity touch-manipulation"
      onclick={onAction}
    >
      <Plus size={18} />
      <span>{actionLabel}</span>
    </button>
  {/if}
  {#if children}
    {@render children()}
  {/if}
</div>

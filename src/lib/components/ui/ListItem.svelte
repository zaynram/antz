<script lang="ts">
  import type { ComponentType, Snippet } from 'svelte'

  interface Props {
    icon?: ComponentType
    iconBg?: string
    title: string
    subtitle?: string
    meta?: string
    dimmed?: boolean
    strikethrough?: boolean
    onclick?: () => void
    children?: Snippet
    actions?: Snippet
  }

  let {
    icon,
    iconBg = 'bg-accent/10 text-accent',
    title,
    subtitle,
    meta,
    dimmed = false,
    strikethrough = false,
    onclick,
    children,
    actions
  }: Props = $props()
</script>

<article
  class="group flex items-start gap-4 p-4 bg-surface border border-slate-200 dark:border-slate-700 rounded-xl transition-all"
  class:opacity-70={dimmed}
  class:cursor-pointer={onclick}
  class:hover:border-accent={onclick}
  role={onclick ? 'button' : undefined}
  tabindex={onclick ? 0 : undefined}
  onclick={onclick}
  onkeydown={onclick ? (e) => e.key === 'Enter' && onclick() : undefined}
>
  {#if icon}
    <div class="shrink-0 w-10 h-10 rounded-full flex items-center justify-center {iconBg}">
      <svelte:component this={icon} size={20} />
    </div>
  {/if}

  {#if children}
    {@render children()}
  {:else}
    <div class="flex-1 min-w-0">
      <h3 class="font-medium truncate" class:line-through={strikethrough}>
        {title}
      </h3>
      {#if subtitle}
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          {subtitle}
        </p>
      {/if}
      {#if meta}
        <span class="text-xs text-slate-400 mt-1 block">
          {meta}
        </span>
      {/if}
    </div>
  {/if}

  {#if actions}
    <div class="flex items-center gap-2 shrink-0">
      {@render actions()}
    </div>
  {/if}
</article>

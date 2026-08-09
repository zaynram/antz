<script lang="ts">
  import type { ComponentType, Snippet } from 'svelte'

  interface Props {
    title: string
    subtitle?: string
    icon?: ComponentType
    iconSize?: number
    children?: Snippet
  }

  let {
    title,
    subtitle,
    icon,
    iconSize = 24,
    children
  }: Props = $props()
</script>

<header class="mb-6">
  <div class="flex items-center gap-3">
    {#if icon}
      {@const Icon = icon}
      <div class="flex items-center justify-center w-11 h-11 rounded-2xl bg-accent/10 text-accent shrink-0">
        <Icon size={iconSize} />
      </div>
    {/if}
    <div class="min-w-0">
      <h1 class="text-2xl font-extrabold leading-tight tracking-tight truncate">{title}</h1>
      {#if subtitle}
        <p class="text-slate-500 dark:text-slate-400 text-sm truncate">
          {subtitle}
        </p>
      {/if}
    </div>
  </div>
  {#if children}
    <div class="mt-4">
      {@render children()}
    </div>
  {/if}
</header>

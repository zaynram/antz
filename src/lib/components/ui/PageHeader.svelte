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
  <div class="flex items-center justify-center gap-3 mb-1">
    {#if icon}
      {@const Icon = icon}
      <Icon size={iconSize} class="text-accent" />
    {/if}
    <h1 class="text-2xl font-bold">{title}</h1>
  </div>
  {#if subtitle}
    <p class="text-center text-slate-500 dark:text-slate-400 text-sm">
      {subtitle}
    </p>
  {/if}
  {#if children}
    <div class="mt-4">
      {@render children()}
    </div>
  {/if}
</header>

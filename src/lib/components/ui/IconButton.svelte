<script lang="ts">
  import type { ComponentType, Snippet } from 'svelte'

  interface Props {
    icon?: ComponentType
    onclick?: (e: MouseEvent) => void
    label: string
    size?: 'sm' | 'md' | 'lg'
    variant?: 'default' | 'primary' | 'danger' | 'ghost'
    active?: boolean
    disabled?: boolean
    badge?: number | string
    class?: string
    children?: Snippet
  }

  let {
    icon,
    onclick,
    label,
    size = 'md',
    variant = 'default',
    active = false,
    disabled = false,
    badge,
    class: className = '',
    children
  }: Props = $props()

  const sizes = {
    sm: 'w-9 h-9',
    md: 'w-11 h-11',
    lg: 'w-14 h-14'
  }

  const iconSizes = {
    sm: 16,
    md: 20,
    lg: 24
  }

  const variants = {
    default: 'bg-surface-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300',
    primary: 'bg-accent text-white hover:opacity-90',
    danger: 'bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30',
    ghost: 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
  }
</script>

<button
  type="button"
  class="relative flex items-center justify-center rounded-xl transition-colors touch-manipulation disabled:opacity-50 {sizes[size]} {active ? 'bg-accent text-white' : variants[variant]} {className}"
  {onclick}
  {disabled}
  aria-label={label}
>
  {#if icon}
    <svelte:component this={icon} size={iconSizes[size]} />
  {:else if children}
    {@render children()}
  {/if}

  {#if badge !== undefined}
    <span class="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-accent text-white text-[10px] font-bold rounded-full flex items-center justify-center">
      {badge}
    </span>
  {/if}
</button>

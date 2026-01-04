<script lang="ts" generics="T extends string">
  interface Option {
    key: T
    label: string
    icon?: import('svelte').ComponentType
  }

  interface Props {
    options: Option[]
    selected: T
    onchange: (key: T) => void
    size?: 'sm' | 'md'
  }

  let { options, selected, onchange, size = 'md' }: Props = $props()

  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm'
  }
</script>

<div class="flex flex-wrap gap-2">
  {#each options as option (option.key)}
    <button
      type="button"
      class="flex items-center gap-1.5 rounded-full font-medium transition-colors touch-manipulation {sizes[size]} {selected === option.key
        ? 'bg-accent text-white'
        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}"
      onclick={() => onchange(option.key)}
    >
      {#if option.icon}
        <svelte:component this={option.icon} size={size === 'sm' ? 14 : 16} />
      {/if}
      <span>{option.label}</span>
    </button>
  {/each}
</div>

<script lang="ts" generics="T extends string">
  interface Tab {
    key: T
    label: string
    badge?: number
  }

  interface Props {
    tabs: Tab[]
    active: T
    onchange: (tab: T) => void
  }

  let { tabs, active, onchange }: Props = $props()
</script>

<div class="flex gap-1 mb-4 border-b border-slate-200 dark:border-slate-700">
  {#each tabs as tab (tab.key)}
    <button
      type="button"
      class="relative px-4 py-2.5 font-medium transition-colors touch-manipulation {active === tab.key
        ? 'text-accent border-b-2 border-accent -mb-px'
        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}"
      onclick={() => onchange(tab.key)}
    >
      {tab.label}
      {#if tab.badge !== undefined && tab.badge > 0}
        <span class="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-accent text-white text-[10px] font-bold rounded-full flex items-center justify-center">
          {tab.badge}
        </span>
      {/if}
    </button>
  {/each}
</div>

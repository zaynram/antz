<script lang="ts">
  import { MoreHorizontal } from 'lucide-svelte'
  import { navMode } from '$lib/stores/nav'
  import { currentPreferences } from '$lib/stores/app'
  import { TAB_DEFS, resolveTabs, clampMaxTabsShown, type TabDef } from '$lib/tabs'
  import BottomSheet from './ui/BottomSheet.svelte'

  interface Props {
    activeRoute: string
    onNavigate: (route: string) => void
  }

  let { activeRoute, onNavigate }: Props = $props()

  let moreOpen = $state(false)

  // Chosen tabs come from the user's config; the first `maxTabsShown` render in
  // the bar and any remainder (plus unchosen destinations) spill into "More".
  let chosenTabs = $derived(resolveTabs($currentPreferences?.bottomTabs))
  let maxShown = $derived(clampMaxTabsShown($currentPreferences?.maxTabsShown))
  let primaryTabs = $derived(chosenTabs.slice(0, maxShown))
  // Keepsakes lives in the identity pill's fly-out, so it's only surfaced as a
  // navigable destination when that pill is switched off — otherwise it would
  // add a redundant entry (and force a "More" tab) for a place you can already
  // reach. It still appears if the user explicitly picks it for the bar.
  let pillHidden = $derived(($currentPreferences?.showIdentityPill ?? true) === false)
  let moreItems = $derived.by(() => {
    const shown = new Set(primaryTabs.map(t => t.key))
    const overflow = chosenTabs.slice(maxShown)
    const unchosen = TAB_DEFS.filter(t =>
      !chosenTabs.some(c => c.key === t.key) && (t.key !== 'profiles' || pillHidden)
    )
    return [...overflow, ...unchosen].filter(t => !shown.has(t.key))
  })

  function isActive(tab: TabDef): boolean {
    if (tab.matchPrefix) return activeRoute.startsWith(tab.matchPrefix)
    return activeRoute === tab.path
  }

  function handleMoreItem(path: string): void {
    moreOpen = false
    onNavigate(path)
  }
</script>

{#if $navMode === 'bottom-tabs'}
  <nav
    class="fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-[var(--color-border)] safe-area-bottom"
    aria-label="Main navigation"
  >
    <div class="flex items-stretch h-14">
      {#each primaryTabs as tab (tab.key)}
        {@const active = isActive(tab)}
        <button
          type="button"
          aria-current={active ? 'page' : undefined}
          aria-label={tab.label}
          class="flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors touch-manipulation
            {active ? 'text-accent' : 'text-slate-500 dark:text-slate-400'}"
          onclick={() => onNavigate(tab.path)}
        >
          <tab.icon size={22} />
          <span class="text-[10px] font-medium">{tab.label}</span>
        </button>
      {/each}

      {#if moreItems.length > 0}
        <!-- More button -->
        <button
          type="button"
          aria-label="More"
          class="flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors touch-manipulation text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          onclick={() => { moreOpen = true }}
        >
          <MoreHorizontal size={22} />
          <span class="text-[10px] font-medium">More</span>
        </button>
      {/if}
    </div>
  </nav>

  <BottomSheet open={moreOpen} onClose={() => { moreOpen = false }} title="More">
    {#snippet children()}
      <nav class="space-y-1 py-2">
        {#each moreItems as item (item.key)}
          <button
            type="button"
            class="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors touch-manipulation
              {isActive(item) ? 'bg-accent/10 text-accent' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}"
            onclick={() => handleMoreItem(item.path)}
          >
            <item.icon size={20} />
            <span class="font-medium">{item.label}</span>
          </button>
        {/each}
      </nav>
    {/snippet}
  </BottomSheet>
{/if}

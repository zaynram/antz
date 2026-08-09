<script lang="ts">
  import { Home, Library, StickyNote, MapPin, MoreHorizontal } from 'lucide-svelte'
  import { navMode } from '$lib/stores/nav'
  import BottomSheet from './ui/BottomSheet.svelte'
  import { Search, Video, Heart, Settings } from 'lucide-svelte'

  interface Props {
    activeRoute: string
    onNavigate: (route: string) => void
  }

  let { activeRoute, onNavigate }: Props = $props()

  let moreOpen = $state(false)

  const tabs = [
    { path: '/', label: 'Home', icon: Home },
    { path: '/library/movies', label: 'Library', icon: Library, matchPrefix: '/library' },
    { path: '/notes', label: 'Notes', icon: StickyNote },
    { path: '/places', label: 'Places', icon: MapPin },
  ]

  const moreItems = [
    { path: '/search', label: 'Search', icon: Search },
    { path: '/videos', label: 'Videos', icon: Video },
    { path: '/profiles', label: 'Profiles', icon: Heart },
    { path: '/settings', label: 'Settings', icon: Settings },
  ]

  function isActive(tab: { path: string; matchPrefix?: string }): boolean {
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
    class="fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-slate-200 dark:border-slate-700 safe-area-bottom"
    aria-label="Main navigation"
  >
    <div class="flex items-stretch h-14">
      {#each tabs as tab (tab.path)}
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
    </div>
  </nav>

  <!-- Extra bottom padding so content isn't hidden behind tab bar -->
  <div class="h-14"></div>

  <BottomSheet open={moreOpen} onClose={() => { moreOpen = false }} title="More">
    {#snippet children()}
      <nav class="space-y-1 py-2">
        {#each moreItems as item (item.path)}
          <button
            type="button"
            class="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors touch-manipulation
              {activeRoute === item.path ? 'bg-accent/10 text-accent' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}"
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

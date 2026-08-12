<script lang="ts">
  import type { HomeActivity } from '$lib/types'

  interface Props {
    items: HomeActivity[]
    loading: boolean
    onItemClick: (item: HomeActivity) => void
  }

  let { items, loading, onItemClick }: Props = $props()

  function relativeTime(activity: HomeActivity): string {
    const ms = activity.updatedAt?.toMillis?.() ?? 0
    if (!ms) return ''
    const diff = Date.now() - ms
    const min = Math.floor(diff / 60000)
    if (min < 1) return 'just now'
    if (min < 60) return `${min}m ago`
    const hr = Math.floor(min / 60)
    if (hr < 24) return `${hr}h ago`
    const days = Math.floor(hr / 24)
    return `${days}d ago`
  }

  const typeLabels: Record<HomeActivity['type'], string> = {
    note: 'Note',
    media: 'Media',
    place: 'Place',
  }
</script>

<section>
  <h2 class="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
    Recent Activity
  </h2>

  {#if loading}
    <div class="space-y-3">
      {#each [0, 1, 2] as _}
        <div class="h-14 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse"></div>
      {/each}
    </div>
  {:else if items.length === 0}
    <p class="text-sm text-slate-400 dark:text-slate-500 py-4 text-center">
      Nothing yet — add a note, place, or something to watch.
    </p>
  {:else}
    <ul class="space-y-2">
      {#each items as item (item.type + item.id)}
        <li>
          <button
            type="button"
            class="w-full flex items-center gap-3 px-3 py-3 rounded-xl bg-surface border border-[var(--color-border)] hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors touch-manipulation text-left"
            onclick={() => onItemClick(item)}
          >
            {#if item.imageOverride || item.posterPath}
              <img
                src={item.imageOverride || `https://image.tmdb.org/t/p/w92${item.posterPath}`}
                alt={item.title}
                class="w-10 h-10 rounded-lg object-cover flex-shrink-0"
              />
            {:else}
              <div class="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0 text-xs font-bold text-slate-400">
                {typeLabels[item.type].charAt(0)}
              </div>
            {/if}

            <div class="flex-1 min-w-0">
              <p class="font-medium text-slate-900 dark:text-slate-100 truncate text-sm">{item.title}</p>
              {#if item.subtitle}
                <p class="text-xs text-slate-500 dark:text-slate-400 truncate capitalize">{item.subtitle}</p>
              {/if}
            </div>

            <div class="flex flex-col items-end gap-1 flex-shrink-0">
              <span class="text-xs font-medium text-accent">{item.actor}</span>
              <span class="text-xs text-slate-400">{relativeTime(item)}</span>
            </div>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

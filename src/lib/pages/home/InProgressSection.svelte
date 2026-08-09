<script lang="ts">
  import type { Media } from '$lib/types'

  interface Props {
    items: Media[]
    loading: boolean
    onItemClick: (item: Media) => void
  }

  let { items, loading, onItemClick }: Props = $props()

  const typeLabel: Record<Media['type'], string> = {
    movie: 'Movie',
    tv: 'TV',
    game: 'Game',
  }

  let visible = $derived(items.length > 0 || loading)
</script>

{#if visible}
  <section>
    <h2 class="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
      In Progress
    </h2>

    {#if loading}
      <div class="flex gap-3 overflow-x-auto scrollbar-none pb-1">
        {#each [0, 1, 2] as _}
          <div class="w-24 h-36 flex-shrink-0 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse"></div>
        {/each}
      </div>
    {:else}
      <div class="flex gap-3 overflow-x-auto scrollbar-none pb-1">
        {#each items.slice(0, 4) as item (item.id)}
          <button
            type="button"
            class="flex-shrink-0 w-24 touch-manipulation"
            onclick={() => onItemClick(item)}
          >
            {#if item.posterPath}
              <img
                src="https://image.tmdb.org/t/p/w154{item.posterPath}"
                alt={item.title}
                class="w-24 h-36 object-cover rounded-xl shadow-md"
              />
            {:else}
              <div class="w-24 h-36 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-400 text-xs font-medium px-2 text-center shadow-md">
                {item.title}
              </div>
            {/if}
            <p class="text-xs text-slate-600 dark:text-slate-400 mt-1 truncate font-medium">{item.title}</p>
            <span class="text-xs text-slate-400 capitalize">{typeLabel[item.type]}</span>
          </button>
        {/each}
      </div>
    {/if}
  </section>
{/if}

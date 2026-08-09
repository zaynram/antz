<script lang="ts">
  import { currentPreferences } from '$lib/stores/app'
  import { dashboardState } from '$lib/stores/home'
  import HomeGreeting from './home/HomeGreeting.svelte'
  import RecentActivityFeed from './home/RecentActivityFeed.svelte'
  import InProgressSection from './home/InProgressSection.svelte'
  import QuickAddBar from './home/QuickAddBar.svelte'
  import type { HomeActivity, Media } from '$lib/types'

  interface Props {
    navigate: (path: string) => void
  }

  let { navigate }: Props = $props()

  let userName = $derived($currentPreferences?.name || 'there')

  function handleActivityClick(item: HomeActivity): void {
    if (item.type === 'media') {
      const route = item.mediaType === 'tv' ? '/library/tv' : item.mediaType === 'game' ? '/library/games' : '/library/movies'
      navigate(route)
    } else if (item.type === 'note') navigate('/notes')
    else if (item.type === 'place') navigate('/places')
  }

  function handleMediaClick(item: Media): void {
    const route = item.type === 'tv' ? '/library/tv' : item.type === 'game' ? '/library/games' : '/library/movies'
    navigate(route)
  }

  function handleAddNote(): void {
    navigate('/notes?add=1')
  }

  function handleAddPlace(): void {
    navigate('/places?add=1')
  }

  function handleAddMedia(): void {
    navigate('/search?discover=1')
  }
</script>

<div class="max-w-2xl mx-auto space-y-6 pb-6">
  <HomeGreeting {userName} />

  <QuickAddBar
    onAddNote={handleAddNote}
    onAddPlace={handleAddPlace}
    onAddMedia={handleAddMedia}
  />

  {#if $dashboardState.error}
    <p class="text-sm text-red-500 dark:text-red-400">{$dashboardState.error}</p>
  {/if}

  <InProgressSection
    items={$dashboardState.inProgress}
    loading={$dashboardState.loading}
    onItemClick={handleMediaClick}
  />

  <RecentActivityFeed
    items={$dashboardState.recentActivity}
    loading={$dashboardState.loading}
    onItemClick={handleActivityClick}
  />
</div>

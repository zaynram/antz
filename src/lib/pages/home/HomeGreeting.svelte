<script lang="ts">
  interface Props {
    userName: string
  }

  let { userName }: Props = $props()

  function getGreeting(): string {
    const hour = new Date().getHours()
    if (hour >= 5 && hour < 12) return 'Good morning'
    if (hour >= 12 && hour < 18) return 'Good afternoon'
    if (hour >= 18 && hour < 22) return 'Good evening'
    return 'Good night'
  }

  let greeting = $derived(getGreeting())
</script>

<div class="py-2">
  <h1 class="text-2xl font-bold text-slate-900 dark:text-slate-50">
    {greeting}, {userName}
  </h1>
</div>

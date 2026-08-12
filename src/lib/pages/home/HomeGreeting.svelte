<script lang="ts">
  import { Sun, Sunrise, Sunset, Moon } from 'lucide-svelte'

  interface Props {
    userName: string
  }

  let { userName }: Props = $props()

  function partOfDay(): { greeting: string; icon: typeof Sun } {
    const hour = new Date().getHours()
    if (hour >= 5 && hour < 12) return { greeting: 'Good morning', icon: Sunrise }
    if (hour >= 12 && hour < 18) return { greeting: 'Good afternoon', icon: Sun }
    if (hour >= 18 && hour < 22) return { greeting: 'Good evening', icon: Sunset }
    return { greeting: 'Good night', icon: Moon }
  }

  // Re-evaluated on a timer: this is a PWA that people leave open, so an
  // install left running overnight would otherwise still greet "Good evening"
  // and show yesterday's date.
  let now = $state(Date.now())
  $effect(() => {
    const id = setInterval(() => { now = Date.now() }, 60_000)
    return () => clearInterval(id)
  })

  let today = $derived(
    new Date(now).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  )
  let part = $derived((() => { void now; return partOfDay() })())
</script>

<div class="hearth">
  <div class="hearth-icon">
    {#key part.greeting}
      {@const Icon = part.icon}
      <Icon size={20} />
    {/key}
  </div>
  <div class="min-w-0">
    <p class="hearth-eyebrow">{today}</p>
    <h1 class="hearth-title">{part.greeting}, {userName}</h1>
    <p class="hearth-sub">Here's what's new between us.</p>
  </div>
</div>

<style>
  .hearth {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    padding: 1.1rem 1.2rem;
    border-radius: 1.1rem;
    background:
      radial-gradient(120% 160% at 0% 0%, color-mix(in srgb, var(--color-accent) 16%, var(--color-surface)) 0%, var(--color-surface) 60%);
    border: 1px solid var(--color-border);
    box-shadow: 0 1px 2px rgba(0,0,0,0.05), 0 8px 20px rgba(0,0,0,0.05);
  }
  .hearth-icon {
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 50%;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    color: #fff;
    background: var(--color-accent);
    box-shadow: 0 2px 8px color-mix(in srgb, var(--color-accent) 45%, transparent);
  }
  .hearth-eyebrow {
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--color-text-hint, #78716c);
    margin-bottom: 0.05rem;
  }
  .hearth-title {
    font-size: 1.45rem;
    font-weight: 800;
    line-height: 1.1;
    letter-spacing: -0.01em;
    color: var(--color-text);
    text-wrap: balance;
  }
  .hearth-sub {
    font-size: 0.82rem;
    color: var(--color-text-muted, #57534e);
    margin-top: 0.1rem;
  }
</style>

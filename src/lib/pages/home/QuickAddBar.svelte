<script lang="ts">
  import { StickyNote, MapPin, Film, Plus } from 'lucide-svelte'

  interface Props {
    onAddNote: () => void
    onAddPlace: () => void
    onAddMedia: () => void
  }

  let { onAddNote, onAddPlace, onAddMedia }: Props = $props()

  const actions = [
    { key: 'note', label: 'New note', icon: StickyNote },
    { key: 'place', label: 'New place', icon: MapPin },
    { key: 'media', label: 'Add media', icon: Film },
  ] as const

  function run(key: string): void {
    if (key === 'note') onAddNote()
    else if (key === 'place') onAddPlace()
    else onAddMedia()
  }
</script>

<div class="grid grid-cols-3 gap-2.5">
  {#each actions as a (a.key)}
    {@const Icon = a.icon}
    <button type="button" class="quick-add touch-feedback" onclick={() => run(a.key)}>
      <span class="quick-add-chip">
        <Icon size={18} />
        <span class="quick-add-plus"><Plus size={11} strokeWidth={3} /></span>
      </span>
      <span class="quick-add-label">{a.label}</span>
    </button>
  {/each}
</div>

<style>
  .quick-add {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 0.85rem 0.5rem;
    border-radius: 1rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    transition: border-color 120ms, box-shadow 120ms, transform 120ms;
  }
  .quick-add:hover {
    border-color: color-mix(in srgb, var(--color-accent) 55%, var(--color-border));
    box-shadow: 0 4px 14px rgba(0,0,0,0.08);
  }
  .quick-add-chip {
    position: relative;
    width: 2.6rem;
    height: 2.6rem;
    border-radius: 0.9rem;
    display: grid;
    place-items: center;
    color: var(--color-accent);
    background: color-mix(in srgb, var(--color-accent) 12%, transparent);
  }
  /* The "+" badge makes it read as an add action, not navigation. */
  .quick-add-plus {
    position: absolute;
    right: -0.28rem;
    bottom: -0.28rem;
    width: 1.15rem;
    height: 1.15rem;
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: #fff;
    background: var(--color-accent);
    box-shadow: 0 1px 3px rgba(0,0,0,0.3), 0 0 0 2px var(--color-surface);
  }
  .quick-add-label {
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--color-text);
  }
</style>

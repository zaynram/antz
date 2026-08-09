<script lang="ts">
  import { StickyNote, MapPin, Film } from 'lucide-svelte'

  interface Props {
    onAddNote: () => void
    onAddPlace: () => void
    onAddMedia: () => void
  }

  let { onAddNote, onAddPlace, onAddMedia }: Props = $props()
</script>

<div class="flex gap-2">
  <button
    type="button"
    class="btn-primary flex-1 text-sm rounded-full py-2"
    onclick={onAddNote}
  >
    <StickyNote size={16} />
    Note
  </button>
  <button
    type="button"
    class="btn-primary flex-1 text-sm rounded-full py-2"
    onclick={onAddPlace}
  >
    <MapPin size={16} />
    Place
  </button>
  <button
    type="button"
    class="btn-primary flex-1 text-sm rounded-full py-2"
    onclick={onAddMedia}
  >
    <Film size={16} />
    Media
  </button>
</div>

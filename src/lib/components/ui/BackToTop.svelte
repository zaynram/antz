<script lang="ts">
  import { ArrowUp } from 'lucide-svelte'
  import { hapticLight } from '$lib/haptics'

  interface Props {
    /** Scroll threshold in pixels before showing the button */
    threshold?: number
    /** Target element to scroll (defaults to document) */
    target?: HTMLElement | null
  }

  let { threshold = 400, target = null }: Props = $props()

  let visible = $state(false)

  function handleScroll(): void {
    if (target) {
      visible = target.scrollTop > threshold
    } else {
      visible = window.scrollY > threshold
    }
  }

  function scrollToTop(): void {
    hapticLight()
    if (target) {
      target.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  $effect(() => {
    const scrollTarget = target || window
    scrollTarget.addEventListener('scroll', handleScroll, { passive: true })
    // Initial check
    handleScroll()
    return () => scrollTarget.removeEventListener('scroll', handleScroll)
  })
</script>

{#if visible}
  <button
    type="button"
    class="fixed bottom-20 right-4 z-40 w-12 h-12 bg-accent text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 touch-manipulation animate-fade-in"
    onclick={scrollToTop}
    aria-label="Back to top"
  >
    <ArrowUp size={24} />
  </button>
{/if}

<style>
  @keyframes fade-in {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .animate-fade-in {
    animation: fade-in 0.2s ease-out;
  }
</style>

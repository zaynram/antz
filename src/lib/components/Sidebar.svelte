<script lang="ts">
  import { activeUser, currentPreferences } from '$lib/stores/app'
  import { logOut } from '$lib/firebase'
  import { hapticLight } from '$lib/haptics'
  import {
    Search,
    Library,
    Film,
    Tv,
    Gamepad2,
    StickyNote,
    MapPin,
    Settings,
    Menu,
    X,
    LogOut,
    ChevronRight
  } from 'lucide-svelte'

  interface Props {
    currentPath: string
    navigate: (path: string) => void
  }

  let { currentPath, navigate }: Props = $props()

  let isOpen = $state(false)
  let libraryExpanded = $state(false)

  // Swipe gesture state (for closing sidebar)
  let touchStartX = $state(0)
  let touchCurrentX = $state(0)
  let isSwiping = $state(false)
  const SWIPE_THRESHOLD = 50

  // Check if current path is a library path
  let isLibraryPath = $derived(currentPath.startsWith('/library'))

  // Auto-expand library section if on a library page
  $effect(() => {
    if (isLibraryPath) {
      libraryExpanded = true
    }
  })

  function handleNavigate(path: string) {
    navigate(path)
    isOpen = false
  }

  function toggleSidebar() {
    isOpen = !isOpen
  }

  function closeSidebar() {
    isOpen = false
  }

  function toggleLibrary() {
    libraryExpanded = !libraryExpanded
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && isOpen) {
      closeSidebar()
    }
  }

  // Toggle active user
  function toggleUser() {
    hapticLight()
    $activeUser = $activeUser === 'Z' ? 'T' : 'Z'
  }

  // Swipe gesture handlers
  function handleTouchStart(e: TouchEvent) {
    touchStartX = e.touches[0].clientX
    touchCurrentX = touchStartX
    isSwiping = true
  }

  function handleTouchMove(e: TouchEvent) {
    if (!isSwiping) return
    touchCurrentX = e.touches[0].clientX
  }

  function handleTouchEnd() {
    if (!isSwiping) return

    const swipeDistance = touchStartX - touchCurrentX

    // If swiped left beyond threshold, close sidebar
    if (swipeDistance > SWIPE_THRESHOLD) {
      hapticLight()
      closeSidebar()
    }

    isSwiping = false
    touchStartX = 0
    touchCurrentX = 0
  }

  // Calculate sidebar transform during swipe (closing)
  let swipeTransform = $derived.by(() => {
    if (!isSwiping || !isOpen) return ''
    const diff = touchStartX - touchCurrentX
    if (diff <= 0) return ''
    // Limit drag to sidebar width
    const clampedDiff = Math.min(diff, 288) // w-72 = 288px
    return `translateX(-${clampedDiff}px)`
  })

  const navItems = [
    { path: '/', label: 'Search', icon: Search },
    { path: '/notes', label: 'Notes', icon: StickyNote },
    { path: '/places', label: 'Places', icon: MapPin },
  ]

  const libraryItems = [
    { path: '/library/movies', label: 'Movies', icon: Film },
    { path: '/library/tv', label: 'TV Shows', icon: Tv },
    { path: '/library/games', label: 'Games', icon: Gamepad2 },
  ]
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Top navigation bar -->
<nav class="fixed top-0 left-0 right-0 z-50 h-14 flex items-center justify-between px-3 safe-area-top">
  <!-- Hamburger button - top left -->
  <button
    type="button"
    class="flex items-center justify-center w-11 h-11 rounded-xl bg-surface border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-sm transition-all touch-manipulation"
    onclick={toggleSidebar}
    aria-label={isOpen ? 'Close menu' : 'Open menu'}
    aria-expanded={isOpen}
  >
    {#if isOpen}
      <X size={22} />
    {:else}
      <Menu size={22} />
    {/if}
  </button>

  <!-- Home/Search button - top right -->
  <button
    type="button"
    class="flex items-center justify-center w-11 h-11 rounded-xl bg-surface border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-sm transition-all touch-manipulation {currentPath === '/' ? 'bg-accent text-white border-accent hover:bg-accent/90' : ''}"
    onclick={() => handleNavigate('/')}
    aria-label="Go to search"
  >
    <Search size={20} />
  </button>
</nav>

<!-- Backdrop -->
{#if isOpen}
  <button
    type="button"
    class="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity"
    onclick={closeSidebar}
    aria-label="Close menu"
    tabindex="-1"
  ></button>
{/if}

<!-- Sidebar -->
<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
<aside
  class="fixed top-0 left-0 z-50 h-full w-72 bg-surface border-r border-slate-200 dark:border-slate-700 shadow-2xl transform flex flex-col"
  class:-translate-x-full={!isOpen && !isSwiping}
  class:translate-x-0={isOpen && !isSwiping}
  class:transition-transform={!isSwiping}
  class:duration-300={!isSwiping}
  class:ease-out={!isSwiping}
  style={swipeTransform ? `transform: ${swipeTransform}` : ''}
  role="dialog"
  aria-modal="true"
  aria-label="Navigation menu"
  ontouchstart={handleTouchStart}
  ontouchmove={handleTouchMove}
  ontouchend={handleTouchEnd}
>
  <!-- Header with user info -->
  <header class="p-4 pt-6 border-b border-slate-200 dark:border-slate-700">
    <button
      type="button"
      class="w-full flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors touch-manipulation"
      onclick={toggleUser}
    >
      {#if $currentPreferences.profilePicture}
        <img
          src={$currentPreferences.profilePicture}
          alt={$currentPreferences.name}
          class="w-10 h-10 rounded-full object-cover ring-2 ring-accent"
        />
      {:else}
        <div class="w-10 h-10 rounded-full bg-accent flex items-center justify-center text-white font-bold">
          {$activeUser}
        </div>
      {/if}
      <div class="flex-1 text-left">
        <p class="font-medium text-slate-900 dark:text-white">{$currentPreferences.name}</p>
        <p class="text-xs text-slate-500 dark:text-slate-400">Tap to switch user</p>
      </div>
      <ChevronRight size={16} class="text-slate-400" />
    </button>
  </header>

  <!-- Navigation -->
  <nav class="flex-1 overflow-y-auto p-3 space-y-1">
    <!-- Main nav items -->
    {#each navItems as item (item.path)}
      <button
        type="button"
        class="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors touch-manipulation {currentPath === item.path
          ? 'bg-accent text-white'
          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}"
        onclick={() => handleNavigate(item.path)}
      >
        <item.icon size={20} />
        <span class="font-medium">{item.label}</span>
      </button>
    {/each}

    <!-- Library section (expandable) -->
    <div class="pt-2">
      <button
        type="button"
        class="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors touch-manipulation {isLibraryPath
          ? 'bg-accent/10 text-accent'
          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}"
        onclick={toggleLibrary}
      >
        <Library size={20} />
        <span class="font-medium flex-1">Library</span>
        <ChevronRight
          size={16}
          class="transition-transform duration-200 {libraryExpanded ? 'rotate-90' : ''}"
        />
      </button>

      <!-- Library sub-items -->
      {#if libraryExpanded}
        <div class="ml-4 mt-1 space-y-1 border-l-2 border-slate-200 dark:border-slate-700 pl-4">
          {#each libraryItems as item (item.path)}
            <button
              type="button"
              class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors touch-manipulation text-sm {currentPath === item.path
                ? 'bg-accent text-white'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200'}"
              onclick={() => handleNavigate(item.path)}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </nav>

  <!-- Footer with settings and logout -->
  <footer class="p-3 border-t border-slate-200 dark:border-slate-700 space-y-1">
    <button
      type="button"
      class="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors touch-manipulation {currentPath === '/settings'
        ? 'bg-accent text-white'
        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}"
      onclick={() => handleNavigate('/settings')}
    >
      <Settings size={20} />
      <span class="font-medium">Settings</span>
    </button>

    <button
      type="button"
      class="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors touch-manipulation"
      onclick={() => { logOut(); closeSidebar(); }}
    >
      <LogOut size={20} />
      <span class="font-medium">Sign out</span>
    </button>
  </footer>
</aside>

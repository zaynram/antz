<script lang="ts">
  import EmptyState from '$lib/components/ui/EmptyState.svelte'
  import Tabs from '$lib/components/ui/Tabs.svelte'
  import Modal from '$lib/components/ui/Modal.svelte'
  import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte'
  import { addDocument, deleteDocument, subscribeToCollection, updateDocument } from '$lib/firebase'
  import { hapticLight, hapticSuccess } from '$lib/haptics'
  import { activeUser, displayNames, userPreferences } from '$lib/stores/app'
  import { DEFAULT_ACCENT } from '$lib/accents'
  import { consumeQueryParam } from '$lib/stores/nav'
  import type { ProfileItem, ProfileCategory, UserId } from '$lib/types'
  import { Heart, Pencil, Plus, Star, Trash2, Gift, Coffee, Music, Film, BookOpen, Zap, Sparkles, Palette, Users, MapPin, Utensils } from 'lucide-svelte'
  import { onMount } from 'svelte'
  import { toast } from 'svelte-sonner'

  let profileItems = $state<ProfileItem[]>([])
  let unsubscribe: (() => void) | undefined

  // Categories with icons
  const categoryInfo: Record<ProfileCategory, { label: string; icon: any; emoji: string }> = {
    food: { label: 'Food', icon: Utensils, emoji: '🍕' },
    drinks: { label: 'Drinks', icon: Coffee, emoji: '☕' },
    music: { label: 'Music', icon: Music, emoji: '🎵' },
    movies: { label: 'Movies', icon: Film, emoji: '🎬' },
    books: { label: 'Books', icon: BookOpen, emoji: '📚' },
    activities: { label: 'Activities', icon: Zap, emoji: '⚡' },
    scents: { label: 'Scents', icon: Sparkles, emoji: '✨' },
    colors: { label: 'Colors', icon: Palette, emoji: '🎨' },
    people: { label: 'People', icon: Users, emoji: '👥' },
    places: { label: 'Places', icon: MapPin, emoji: '📍' },
    gifts: { label: 'Gift Ideas', icon: Gift, emoji: '🎁' },
    other: { label: 'Other', icon: Heart, emoji: '💝' }
  }

  type TabKey = 'all' | ProfileCategory
  let activeTab = $state<TabKey>('all')

  // Modal state
  let showAddModal = $state(false)
  let editingItem = $state<ProfileItem | null>(null)
  let newItem = $state<Partial<ProfileItem>>({
    category: 'food',
    title: '',
    description: '',
    notes: '',
    isFavorite: false,
    rating: undefined
  })

  // View mode
  type ViewMode = 'mine' | 'theirs' | 'both'
  let viewMode = $state<ViewMode>('both')

  onMount(() => {
    // Arriving from the identity pill: /profiles?view=mine|theirs
    const view = consumeQueryParam('view')
    if (view === 'mine' || view === 'theirs' || view === 'both') viewMode = view

    unsubscribe = subscribeToCollection<ProfileItem>('profiles', (items) => {
      profileItems = items
    })

    return () => {
      unsubscribe?.()
    }
  })

  // Filter items
  let filteredItems = $derived.by(() => {
    let items = profileItems

    // Filter by view mode
    if (viewMode === 'mine') {
      items = items.filter(item => item.createdBy === $activeUser)
    } else if (viewMode === 'theirs') {
      const otherUser: UserId = $activeUser === 'Z' ? 'T' : 'Z'
      items = items.filter(item => item.createdBy === otherUser)
    }

    // Filter by category
    if (activeTab !== 'all') {
      items = items.filter(item => item.category === activeTab)
    }

    return items
  })

  // Group items by user for "both" view
  let itemsByUser = $derived.by(() => {
    const byUser: Record<UserId, ProfileItem[]> = { Z: [], T: [] }
    filteredItems.forEach(item => {
      byUser[item.createdBy].push(item)
    })
    return byUser
  })

  async function saveItem(): Promise<void> {
    if (!newItem.title?.trim()) {
      toast.error('Please enter a title')
      return
    }

    try {
      if (editingItem?.id) {
        // Update existing
        await updateDocument<ProfileItem>('profiles', editingItem.id, {
          category: newItem.category!,
          title: newItem.title,
          description: newItem.description || '',
          notes: newItem.notes,
          isFavorite: newItem.isFavorite,
          rating: newItem.rating
        }, $activeUser)
        toast.success('Item updated')
      } else {
        // Add new
        await addDocument<ProfileItem>('profiles', {
          category: newItem.category as ProfileCategory,
          title: newItem.title,
          description: newItem.description || '',
          notes: newItem.notes,
          isFavorite: newItem.isFavorite || false,
          rating: newItem.rating
        }, $activeUser)
        toast.success('Item added')
      }
      
      hapticSuccess()
      closeModal()
    } catch (e) {
      console.error('Failed to save item:', e)
      toast.error('Failed to save item')
    }
  }

  // Confirm dialog state
  let pendingConfirm = $state<{ message: string; onConfirm: () => void } | null>(null)

  async function deleteItem(id: string): Promise<void> {
    pendingConfirm = {
      message: 'Delete this item?',
      onConfirm: async () => {
        pendingConfirm = null
        try {
          await deleteDocument('profiles', id)
          toast.success('Item deleted')
        } catch (e) {
          console.error('Failed to delete:', e)
          toast.error('Failed to delete item')
        }
      }
    }
  }

  function openAddModal(category?: ProfileCategory) {
    editingItem = null
    newItem = {
      category: category || 'food',
      title: '',
      description: '',
      notes: '',
      isFavorite: false,
      rating: undefined
    }
    showAddModal = true
  }

  function openEditModal(item: ProfileItem) {
    editingItem = item
    newItem = {
      category: item.category,
      title: item.title,
      description: item.description,
      notes: item.notes,
      isFavorite: item.isFavorite,
      rating: item.rating
    }
    showAddModal = true
  }

  function closeModal() {
    showAddModal = false
    editingItem = null
    newItem = {
      category: 'food',
      title: '',
      description: '',
      notes: '',
      isFavorite: false,
      rating: undefined
    }
  }

  // Get display name for user
  function getUserDisplayName(userId: UserId): string {
    return $displayNames[userId] || userId
  }

  // Tint each keepsake by its author's accent, echoing the notes system.
  function accentFor(userId: UserId): string {
    return $userPreferences[userId]?.accentColor ?? DEFAULT_ACCENT
  }
</script>

<div class="max-w-2xl mx-auto">

<!-- Keepsake-box header -->
<div class="keepbox mb-5">
  <div class="keepbox-inner">
    <div class="min-w-0 mb-3">
      <p class="keepbox-eyebrow">Little things</p>
      <h1 class="keepbox-title">Our Keepsakes</h1>
      <p class="keepbox-sub">The things we love, kept</p>
    </div>
    <!-- View mode toggle -->
    <div class="flex gap-1.5">
      {#each [{ k: 'both', l: 'Both' }, { k: 'mine', l: 'Mine' }, { k: 'theirs', l: 'Theirs' }] as m}
        <button
          type="button"
          class="keepbox-chip {viewMode === m.k ? 'is-on' : ''}"
          onclick={() => { viewMode = m.k as typeof viewMode; hapticLight() }}
        >
          {m.l}
        </button>
      {/each}
    </div>
  </div>
</div>

<!-- Category tabs + Add button -->
<div class="flex items-center gap-2">
  <div class="flex-1 min-w-0">
    <Tabs
      tabs={[
        { key: 'all', label: 'All', badge: profileItems.length },
        ...Object.entries(categoryInfo).map(([key, info]) => ({
          key,
          label: info.label,
          badge: profileItems.filter(i => i.category === key).length
        }))
      ]}
      active={activeTab}
      onchange={(key: string) => { activeTab = key as TabKey; hapticLight() }}
    />
  </div>
  <div class="shrink-0 pb-4">
    <button
      onclick={() => openAddModal(activeTab === 'all' ? undefined : activeTab)}
      class="btn-primary"
    >
      <Plus size={18} />
      Add
    </button>
  </div>
</div>

<!-- Items list -->
{#if filteredItems.length === 0}
  <EmptyState
    icon={activeTab === 'all' ? Heart : categoryInfo[activeTab].icon}
    title="No items yet"
    description="Add items to keep track of things you like"
    actionLabel="Add Item"
    onAction={() => openAddModal(activeTab === 'all' ? undefined : activeTab)}
  />
{:else if viewMode === 'both'}
  <!-- Show items grouped by user -->
  {#each ['Z', 'T'] as userId}
    {@const userItems = itemsByUser[userId as UserId]}
    {#if userItems.length > 0}
      <div class="mb-8">
        <h3 class="text-lg font-semibold mb-4 text-slate-700 dark:text-slate-300">
          {getUserDisplayName(userId as UserId)}'s Favorites
        </h3>
        <div class="grid gap-3 md:grid-cols-2">
          {#each userItems as item (item.id)}
            <div class="keepsake" style="--keepsake-accent: {accentFor(item.createdBy)}">
              <div class="flex items-start justify-between mb-2">
                <div class="flex items-center gap-2 flex-1">
                  <span class="text-2xl">{categoryInfo[item.category].emoji}</span>
                  <div class="flex-1">
                    <h4 class="font-semibold text-slate-900 dark:text-white">{item.title}</h4>
                    {#if item.description}
                      <p class="text-sm text-slate-600 dark:text-slate-400 mt-1">{item.description}</p>
                    {/if}
                  </div>
                </div>
                <div class="flex items-center gap-1">
                  {#if item.isFavorite}
                    <Star size={16} class="text-yellow-500 fill-yellow-500 mx-1" />
                  {/if}
                  {#if item.createdBy === $activeUser}
                    <button
                      onclick={() => openEditModal(item)}
                      class="btn-icon-sm"
                      aria-label="Edit"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onclick={() => item.id && deleteItem(item.id)}
                      class="btn-icon-sm hover:text-red-500"
                      aria-label="Delete"
                    >
                      <Trash2 size={15} />
                    </button>
                  {/if}
                </div>
              </div>
              {#if item.rating}
                <div class="flex items-center gap-1 mb-2">
                  {#each Array(5) as _, i}
                    <Star size={14} class={i < item.rating ? 'text-yellow-500 fill-yellow-500' : 'text-slate-300 dark:text-slate-600'} />
                  {/each}
                </div>
              {/if}
              {#if item.notes}
                <p class="text-sm text-slate-500 dark:text-slate-400 italic mt-2">{item.notes}</p>
              {/if}
              <div class="mt-2">
                <span class="keepsake-tag">{categoryInfo[item.category].label}</span>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/each}
{:else}
  <!-- Regular list view -->
  <div class="grid gap-3 md:grid-cols-2">
    {#each filteredItems as item (item.id)}
      <div class="keepsake" style="--keepsake-accent: {accentFor(item.createdBy)}">
        <div class="flex items-start justify-between mb-2">
          <div class="flex items-center gap-2 flex-1">
            <span class="text-2xl">{categoryInfo[item.category].emoji}</span>
            <div class="flex-1">
              <h4 class="font-semibold text-slate-900 dark:text-white">{item.title}</h4>
              {#if item.description}
                <p class="text-sm text-slate-600 dark:text-slate-400 mt-1">{item.description}</p>
              {/if}
            </div>
          </div>
          <div class="flex items-center gap-1">
            {#if item.isFavorite}
              <Star size={16} class="text-yellow-500 fill-yellow-500 mx-1" />
            {/if}
            {#if item.createdBy === $activeUser}
              <button
                onclick={() => openEditModal(item)}
                class="btn-icon-sm"
                aria-label="Edit"
              >
                <Pencil size={15} />
              </button>
              <button
                onclick={() => item.id && deleteItem(item.id)}
                class="btn-icon-sm hover:text-red-500"
                aria-label="Delete"
              >
                <Trash2 size={15} />
              </button>
            {/if}
          </div>
        </div>
        {#if item.rating}
          <div class="flex items-center gap-1 mb-2">
            {#each Array(5) as _, i}
              <Star size={14} class={i < item.rating ? 'text-yellow-500 fill-yellow-500' : 'text-slate-300 dark:text-slate-600'} />
            {/each}
          </div>
        {/if}
        {#if item.notes}
          <p class="text-sm text-slate-500 dark:text-slate-400 italic mt-2">{item.notes}</p>
        {/if}
        <div class="mt-2">
          <span class="keepsake-tag">{categoryInfo[item.category].label}</span>
        </div>
      </div>
    {/each}
  </div>
{/if}

<!-- Add/Edit Modal -->
<Modal
  open={showAddModal}
  title={editingItem ? 'Edit Item' : 'Add Item'}
  onclose={closeModal}
  size="sm"
>
  <div class="space-y-4">
    <!-- Category -->
    <div>
      <label for="category-select" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
        Category
      </label>
      <select
        id="category-select"
        bind:value={newItem.category}
        class="input-sm"
      >
        {#each Object.entries(categoryInfo) as [key, info]}
          <option value={key}>{info.emoji} {info.label}</option>
        {/each}
      </select>
    </div>

    <!-- Title -->
    <div>
      <label for="item-title" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
        Title *
      </label>
      <input
        id="item-title"
        type="text"
        bind:value={newItem.title}
        placeholder="e.g., Margherita Pizza"
        class="input"
      />
    </div>

    <!-- Description -->
    <div>
      <label for="item-description" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
        Description
      </label>
      <input
        id="item-description"
        type="text"
        bind:value={newItem.description}
        placeholder="Brief description"
        class="input"
      />
    </div>

    <!-- Rating -->
    <div>
      <label for="item-rating" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
        Rating (1–5)
      </label>
      <div id="item-rating" class="flex gap-1" role="group" aria-label="Rating selection">
        {#each [1, 2, 3, 4, 5] as rating}
          <button
            type="button"
            onclick={() => { newItem.rating = rating; hapticLight() }}
            class="btn-icon-sm"
            aria-label={`Rate ${rating} stars`}
            aria-pressed={newItem.rating === rating}
          >
            <Star
              size={22}
              class={newItem.rating && rating <= newItem.rating ? 'text-yellow-500 fill-yellow-500' : 'text-slate-300 dark:text-slate-600'}
            />
          </button>
        {/each}
        {#if newItem.rating}
          <button
            type="button"
            onclick={() => { newItem.rating = undefined; hapticLight() }}
            class="btn-ghost text-sm px-3 py-1.5"
          >
            Clear
          </button>
        {/if}
      </div>
    </div>

    <!-- Notes -->
    <div>
      <label for="item-notes" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
        Notes
      </label>
      <textarea
        id="item-notes"
        bind:value={newItem.notes}
        placeholder="Additional notes..."
        rows="3"
        class="input resize-none"
      ></textarea>
    </div>

    <!-- Favorite toggle -->
    <div class="flex items-center gap-2">
      <input
        type="checkbox"
        id="favorite"
        bind:checked={newItem.isFavorite}
        class="w-4 h-4 accent-accent"
      />
      <label for="favorite" class="text-sm text-slate-700 dark:text-slate-300">
        Mark as favorite
      </label>
    </div>
  </div>

  {#snippet footer()}
    <div class="flex gap-3">
      <button onclick={closeModal} class="btn-secondary flex-1">Cancel</button>
      <button onclick={saveItem} class="btn-primary flex-1">
        {editingItem ? 'Update' : 'Add'}
      </button>
    </div>
  {/snippet}
</Modal>

<ConfirmModal
  open={pendingConfirm !== null}
  message={pendingConfirm?.message ?? ''}
  danger={true}
  onConfirm={() => pendingConfirm?.onConfirm()}
  onCancel={() => pendingConfirm = null}
/>

</div>

<style>
  /* ===== Keepsake-box header ===== */
  .keepbox {
    position: relative;
    border-radius: 1.1rem;
    background:
      radial-gradient(120% 140% at 50% -20%, color-mix(in srgb, var(--color-accent) 34%, #3a2540) 0%, #33203a 55%, #241729 100%);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.07), 0 10px 26px rgba(0,0,0,0.28);
    overflow: hidden;
  }
  .keepbox-inner { padding: 1.1rem 1.3rem; }
  .keepbox-eyebrow {
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #f3c6e6;
    text-shadow: 0 0 8px rgba(230,150,210,0.4);
    margin-bottom: 0.1rem;
  }
  .keepbox-title {
    font-size: 1.7rem;
    font-weight: 800;
    line-height: 1.05;
    letter-spacing: -0.01em;
    color: #fbeef7;
  }
  .keepbox-sub {
    font-size: 0.8rem;
    color: rgba(251,238,247,0.68);
    margin-top: 0.15rem;
  }
  .keepbox-chip {
    height: 2.25rem;
    padding: 0 0.9rem;
    border-radius: 999px;
    font-size: 0.8rem;
    font-weight: 700;
    color: #f3e7ef;
    background: rgba(255,255,255,0.1);
    transition: background 120ms, color 120ms;
  }
  .keepbox-chip.is-on { background: #f3c6e6; color: #3a1f33; }

  /* ===== Keepsake item cards ===== */
  .keepsake {
    position: relative;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-left: 3px solid var(--keepsake-accent, var(--color-accent));
    border-radius: 0.85rem;
    padding: 1rem;
    box-shadow: 0 1px 2px rgba(0,0,0,0.06), 0 6px 14px rgba(0,0,0,0.05);
    transition: transform 140ms ease, box-shadow 140ms ease;
  }
  .keepsake:hover {
    transform: rotate(-0.4deg) translateY(-2px);
    box-shadow: 0 3px 8px rgba(0,0,0,0.1), 0 12px 24px rgba(0,0,0,0.1);
  }

  .keepsake-tag {
    display: inline-flex;
    align-items: center;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.03em;
    color: var(--color-text-muted, #57534e);
    background: var(--color-surface-2);
    padding: 0.12rem 0.55rem;
    border-radius: 999px;
  }

  @media (prefers-reduced-motion: reduce) {
    .keepsake:hover { transform: none; }
  }
</style>

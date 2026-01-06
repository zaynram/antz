<script lang="ts">
  import EmptyState from '$lib/components/ui/EmptyState.svelte'
  import PageHeader from '$lib/components/ui/PageHeader.svelte'
  import Tabs from '$lib/components/ui/Tabs.svelte'
  import { addDocument, deleteDocument, subscribeToCollection, updateDocument } from '$lib/firebase'
  import { hapticLight, hapticSuccess } from '$lib/haptics'
  import { activeUser, displayNames } from '$lib/stores/app'
  import type { ProfileItem, ProfileCategory, UserId } from '$lib/types'
  import { Heart, Plus, Star, Trash2, X, Gift, Coffee, Music, Film, BookOpen, Zap, Sparkles, Palette, Users, MapPin, Utensils } from 'lucide-svelte'
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

  async function deleteItem(id: string): Promise<void> {
    if (confirm('Delete this item?')) {
      try {
        await deleteDocument('profiles', id)
        toast.success('Item deleted')
      } catch (e) {
        console.error('Failed to delete:', e)
        toast.error('Failed to delete item')
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
</script>

<PageHeader title="Partner Profiles" subtitle="Keep track of things we like" />

<!-- View mode toggle -->
<div class="mb-4 flex gap-2 justify-center">
  <button
    class="px-4 py-2 rounded-lg font-medium transition-colors {viewMode === 'both' ? 'bg-accent text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}"
    onclick={() => { viewMode = 'both'; hapticLight() }}
  >
    Both
  </button>
  <button
    class="px-4 py-2 rounded-lg font-medium transition-colors {viewMode === 'mine' ? 'bg-accent text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}"
    onclick={() => { viewMode = 'mine'; hapticLight() }}
  >
    Mine
  </button>
  <button
    class="px-4 py-2 rounded-lg font-medium transition-colors {viewMode === 'theirs' ? 'bg-accent text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}"
    onclick={() => { viewMode = 'theirs'; hapticLight() }}
  >
    Theirs
  </button>
</div>

<!-- Category tabs -->
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

<!-- Add button -->
<div class="mb-6 flex justify-end">
  <button
    onclick={() => openAddModal(activeTab === 'all' ? undefined : activeTab)}
    class="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
  >
    <Plus size={20} />
    Add Item
  </button>
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
            <div class="bg-surface border border-slate-200 dark:border-slate-700 rounded-lg p-4">
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
                <div class="flex items-center gap-2">
                  {#if item.isFavorite}
                    <Star size={16} class="text-yellow-500 fill-yellow-500" />
                  {/if}
                  {#if item.createdBy === $activeUser}
                    <button
                      onclick={() => openEditModal(item)}
                      class="text-slate-400 hover:text-accent"
                      aria-label="Edit"
                    >
                      <Heart size={16} />
                    </button>
                    <button
                      onclick={() => item.id && deleteItem(item.id)}
                      class="text-slate-400 hover:text-red-500"
                      aria-label="Delete"
                    >
                      <Trash2 size={16} />
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
              <div class="mt-2 text-xs text-slate-400 dark:text-slate-500">
                {categoryInfo[item.category].label}
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
      <div class="bg-surface border border-slate-200 dark:border-slate-700 rounded-lg p-4">
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
          <div class="flex items-center gap-2">
            {#if item.isFavorite}
              <Star size={16} class="text-yellow-500 fill-yellow-500" />
            {/if}
            {#if item.createdBy === $activeUser}
              <button
                onclick={() => openEditModal(item)}
                class="text-slate-400 hover:text-accent"
                aria-label="Edit"
              >
                <Heart size={16} />
              </button>
              <button
                onclick={() => item.id && deleteItem(item.id)}
                class="text-slate-400 hover:text-red-500"
                aria-label="Delete"
              >
                <Trash2 size={16} />
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
        <div class="mt-2 text-xs text-slate-400 dark:text-slate-500">
          {categoryInfo[item.category].label}
        </div>
      </div>
    {/each}
  </div>
{/if}

<!-- Add/Edit Modal -->
{#if showAddModal}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
    on:keydown={(event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeModal();
      }
    }}
  >
    <div class="bg-surface rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
      <div class="sticky top-0 bg-surface border-b border-slate-200 dark:border-slate-700 p-4 flex items-center justify-between">
        <h2 class="text-xl font-bold">
          {editingItem ? 'Edit Item' : 'Add Item'}
        </h2>
        <button
          onclick={closeModal}
          class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          aria-label="Close"
        >
          <X size={24} />
        </button>
      </div>

      <div class="p-4 space-y-4">
        <!-- Category -->
        <div>
          <label for="category-select" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Category
          </label>
          <select
            id="category-select"
            bind:value={newItem.category}
            class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
          >
            {#each Object.entries(categoryInfo) as [key, info]}
              <option value={key}>{info.emoji} {info.label}</option>
            {/each}
          </select>
        </div>

        <!-- Title -->
        <div>
          <label for="item-title" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Title *
          </label>
          <input
            id="item-title"
            type="text"
            bind:value={newItem.title}
            placeholder="e.g., Margherita Pizza"
            class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
          />
        </div>

        <!-- Description -->
        <div>
          <label for="item-description" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Description
          </label>
          <input
            id="item-description"
            type="text"
            bind:value={newItem.description}
            placeholder="Brief description"
            class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
          />
        </div>

        <!-- Rating -->
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Rating (1-5)
          </label>
          <div class="flex gap-2" role="group" aria-label="Rating selection">
            {#each [1, 2, 3, 4, 5] as rating}
              <button
                type="button"
                onclick={() => { newItem.rating = rating; hapticLight() }}
                class="p-2"
                aria-label={`Rate ${rating} stars`}
              >
                <Star
                  size={24}
                  class={newItem.rating && rating <= newItem.rating ? 'text-yellow-500 fill-yellow-500' : 'text-slate-300 dark:text-slate-600'}
                />
              </button>
            {/each}
            {#if newItem.rating}
              <button
                type="button"
                onclick={() => { newItem.rating = undefined; hapticLight() }}
                class="ml-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                Clear
              </button>
            {/if}
          </div>
        </div>

        <!-- Notes -->
        <div>
          <label for="item-notes" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Notes
          </label>
          <textarea
            id="item-notes"
            bind:value={newItem.notes}
            placeholder="Additional notes..."
            rows="3"
            class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white resize-none"
          ></textarea>
        </div>

        <!-- Favorite toggle -->
        <div class="flex items-center gap-2">
          <input
            type="checkbox"
            id="favorite"
            bind:checked={newItem.isFavorite}
            class="w-4 h-4"
          />
          <label for="favorite" class="text-sm text-slate-700 dark:text-slate-300">
            Mark as favorite
          </label>
        </div>
      </div>

      <div class="sticky bottom-0 bg-surface border-t border-slate-200 dark:border-slate-700 p-4 flex gap-3">
        <button
          onclick={closeModal}
          class="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
        <button
          onclick={saveItem}
          class="flex-1 px-4 py-2 bg-accent text-white rounded-lg font-medium hover:opacity-90"
        >
          {editingItem ? 'Update' : 'Add'}
        </button>
      </div>
    </div>
  </div>
{/if}

# Component Documentation

This document details reusable components and their patterns.

## UI Primitives (`src/lib/components/ui/`)

### PageHeader

Consistent page header with icon, title, and optional subtitle.

```svelte
<script>
  import PageHeader from '$lib/components/ui/PageHeader.svelte'
  import { Film } from 'lucide-svelte'
</script>

<PageHeader
  title="Movies"
  icon={Film}
  subtitle="42 items"
>
  <!-- Optional children slot for additional content below subtitle -->
  <div class="flex gap-2">
    <span class="badge">Action</span>
    <span class="badge">Comedy</span>
  </div>
</PageHeader>
```

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | `string` | required | Page title |
| `icon` | `ComponentType` | `undefined` | Lucide icon component |
| `iconSize` | `number` | `24` | Icon size in pixels |
| `subtitle` | `string` | `undefined` | Subtitle text |
| `children` | `Snippet` | `undefined` | Additional content slot |

---

### IconButton

Touch-friendly icon button with size variants.

```svelte
<script>
  import IconButton from '$lib/components/ui/IconButton.svelte'
  import { Filter, Plus, X } from 'lucide-svelte'
</script>

<!-- Basic usage -->
<IconButton icon={Filter} label="Filter" onclick={handleClick} />

<!-- Size variants -->
<IconButton icon={Plus} label="Add" size="lg" />
<IconButton icon={X} label="Close" size="sm" />

<!-- Variants -->
<IconButton icon={X} label="Delete" variant="danger" />
<IconButton icon={Filter} label="Active Filter" variant="primary" active />

<!-- With badge -->
<IconButton icon={Filter} label="Filters" badge={3} />
```

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `icon` | `ComponentType` | `undefined` | Lucide icon component |
| `label` | `string` | required | Aria label (required for a11y) |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Button size |
| `variant` | `'default' \| 'primary' \| 'danger' \| 'ghost'` | `'default'` | Visual style |
| `active` | `boolean` | `false` | Active/pressed state |
| `disabled` | `boolean` | `false` | Disabled state |
| `badge` | `number \| string` | `undefined` | Badge counter |
| `children` | `Snippet` | `undefined` | Custom content instead of icon |

**Size specifications:**
| Size | Dimensions | Icon Size |
|------|------------|-----------|
| `sm` | 36x36px | 16px |
| `md` | 44x44px | 20px |
| `lg` | 56x56px | 24px |

---

### EmptyState

Empty state placeholder with icon, title, description, and optional action.

```svelte
<script>
  import EmptyState from '$lib/components/ui/EmptyState.svelte'
  import { Inbox, Plus } from 'lucide-svelte'
</script>

<!-- Basic -->
<EmptyState
  icon={Inbox}
  title="No messages"
  description="Messages you receive will appear here"
/>

<!-- With action button -->
<EmptyState
  icon={Inbox}
  title="No items yet"
  description="Start by adding your first item"
  actionLabel="Add Item"
  actionIcon={Plus}
  onaction={handleAdd}
/>
```

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `icon` | `ComponentType` | required | Large icon (48px) |
| `title` | `string` | required | Title text |
| `description` | `string` | `''` | Description text |
| `actionLabel` | `string` | `undefined` | Button label |
| `actionIcon` | `ComponentType` | `undefined` | Button icon |
| `onaction` | `() => void` | `undefined` | Button click handler |

---

### Tabs

Generic tab component with badge support.

```svelte
<script lang="ts">
  import Tabs from '$lib/components/ui/Tabs.svelte'

  type TabKey = 'all' | 'active' | 'completed'
  let activeTab = $state<TabKey>('all')

  const tabs = [
    { key: 'all' as TabKey, label: 'All' },
    { key: 'active' as TabKey, label: 'Active', badge: 5 },
    { key: 'completed' as TabKey, label: 'Completed' }
  ]
</script>

<Tabs {tabs} active={activeTab} onchange={(tab) => activeTab = tab} />
```

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `tabs` | `Array<{key: T, label: string, badge?: number}>` | required | Tab definitions |
| `active` | `T` | required | Currently active tab key |
| `onchange` | `(key: T) => void` | required | Tab change handler |

---

### FilterPills

Pill-style filter buttons.

```svelte
<script>
  import FilterPills from '$lib/components/ui/FilterPills.svelte'
  import { Film, Tv, Gamepad2 } from 'lucide-svelte'

  let selected = $state('all')

  const options = [
    { value: 'all', label: 'All' },
    { value: 'movie', label: 'Movies', icon: Film },
    { value: 'tv', label: 'TV', icon: Tv },
    { value: 'game', label: 'Games', icon: Gamepad2 }
  ]
</script>

<FilterPills {options} bind:selected onchange={handleChange} />
```

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `options` | `Array<{value: string, label: string, icon?: ComponentType}>` | required | Options |
| `selected` | `string` | required | Selected value |
| `size` | `'sm' \| 'md'` | `'md'` | Button size |
| `onchange` | `(value: string) => void` | `undefined` | Change handler |

---

### ListItem

Consistent list item layout with icon, content, and actions.

```svelte
<script>
  import ListItem from '$lib/components/ui/ListItem.svelte'
  import IconButton from '$lib/components/ui/IconButton.svelte'
  import { MapPin, Check, X } from 'lucide-svelte'
</script>

<ListItem
  icon={MapPin}
  title="Coffee Shop"
  subtitle="Downtown"
  meta="Added 2 days ago"
  iconBg="bg-accent/10 text-accent"
  onclick={handleClick}
>
  {#snippet actions()}
    <IconButton icon={Check} label="Mark visited" size="sm" />
    <IconButton icon={X} label="Remove" size="sm" variant="danger" />
  {/snippet}
</ListItem>
```

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `icon` | `ComponentType` | `undefined` | Leading icon |
| `iconBg` | `string` | `'bg-slate-100'` | Icon background classes |
| `title` | `string` | `''` | Title text |
| `subtitle` | `string` | `''` | Subtitle text |
| `meta` | `string` | `''` | Meta text (smallest) |
| `dimmed` | `boolean` | `false` | Reduces opacity |
| `strikethrough` | `boolean` | `false` | Strikes through title |
| `onclick` | `() => void` | `undefined` | Makes item clickable |
| `actions` | `Snippet` | `undefined` | Action buttons slot |
| `children` | `Snippet` | `undefined` | Custom content (replaces title/subtitle/meta) |

---

### Modal

Reusable modal dialog.

```svelte
<script>
  import Modal from '$lib/components/ui/Modal.svelte'

  let showModal = $state(false)
</script>

{#if showModal}
  <Modal title="Edit Item" onClose={() => showModal = false}>
    <p>Modal content here</p>

    {#snippet footer()}
      <button class="btn-secondary" onclick={() => showModal = false}>Cancel</button>
      <button class="btn-primary" onclick={save}>Save</button>
    {/snippet}
  </Modal>
{/if}
```

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | `string` | `''` | Modal title |
| `onClose` | `() => void` | required | Close handler |
| `children` | `Snippet` | required | Modal content |
| `footer` | `Snippet` | `undefined` | Footer with actions |

---

## Application Components

### Sidebar (`src/lib/components/Sidebar.svelte`)

Navigation sidebar with user switcher. Features:
- Collapsible on mobile (FAB trigger)
- User identity switcher (Z/T)
- Navigation links with active state
- Swipe-to-close gesture on touch devices

**Usage:** Rendered once in `App.svelte`, receives `currentPath` and `navigate` props.

---

### MediaDetailModal (`src/lib/components/MediaDetailModal.svelte`)

Full-featured detail modal for media items (movies/TV/games).

**Features:**
- Poster header with gradient overlay
- Per-user ratings (Z and T)
- Status selector (queued/watching/completed/dropped)
- Watch date picker
- Personal notes textarea
- Comments thread
- Collection and studio info

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `media` | `Media \| null` | Media item to display |
| `onClose` | `() => void` | Close handler |

---

### PlaceDetailModal (`src/lib/components/PlaceDetailModal.svelte`)

Detail modal for places with feature parity to MediaDetailModal.

**Features:**
- Category icon header
- Per-user ratings
- Visit tracking with history
- Location picker integration
- Comments thread
- Google Maps link

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `place` | `Place \| null` | Place item to display |
| `onClose` | `() => void` | Close handler |

---

### LocationPicker (`src/lib/components/LocationPicker.svelte`)

Location input with Google Places autocomplete fallback.

**Features:**
- Manual coordinate entry
- Address autocomplete (when configured)
- Current location button
- Address display

---

### PlaceSuggestions (`src/lib/components/PlaceSuggestions.svelte`)

Displays place suggestions based on user's location preferences.

---

### PreferencesModal (`src/lib/components/PreferencesModal.svelte`)

User preferences editor:
- Theme (light/dark)
- Accent color
- Profile picture
- Display name
- Location settings

---

## Component Patterns

### 1. Svelte 5 Runes Style

Components use Svelte 5's runes API:

```svelte
<script lang="ts">
  import type { Snippet, ComponentType } from 'svelte'

  interface Props {
    title: string
    icon?: ComponentType
    children?: Snippet
    onclick?: () => void
  }

  let { title, icon, children, onclick }: Props = $props()
</script>
```

### 2. Dynamic Icon Rendering

Icons are passed as component types and rendered dynamically:

```svelte
<script>
  import type { ComponentType } from 'svelte'

  interface Props {
    icon: ComponentType
  }

  let { icon }: Props = $props()
</script>

<svelte:component this={icon} size={20} />
```

### 3. Snippet Slots

Svelte 5 uses snippets for slots:

```svelte
<!-- Parent -->
<ListItem title="Item">
  {#snippet actions()}
    <button>Edit</button>
  {/snippet}
</ListItem>

<!-- ListItem.svelte -->
<script>
  interface Props {
    actions?: Snippet
  }
  let { actions }: Props = $props()
</script>

{#if actions}
  {@render actions()}
{/if}
```

### 4. Touch Manipulation

All interactive elements include `touch-manipulation` for better mobile UX:

```svelte
<button class="... touch-manipulation">
```

### 5. Haptic Feedback

Import and use haptic utilities for meaningful interactions:

```svelte
<script>
  import { hapticLight, hapticSuccess } from '$lib/haptics'
</script>

<button onclick={() => { hapticLight(); doAction() }}>
```

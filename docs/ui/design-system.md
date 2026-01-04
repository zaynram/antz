# Design System

This document defines the visual language and component patterns for the Antz PWA.

## Design Principles

1. **Touch-First** - Minimum 44px touch targets, generous spacing
2. **Consistent** - Same patterns across all pages
3. **Responsive** - Works on all screen sizes, optimized for mobile
4. **Accessible** - WCAG AA compliant, proper focus states
5. **Fast** - Minimal re-renders, efficient animations

---

## Spacing Scale

Use Tailwind's spacing scale consistently:

| Token | Value | Usage |
|-------|-------|-------|
| `1` | 4px | Tight gaps (icon + text) |
| `2` | 8px | Element gaps |
| `3` | 12px | Component internal padding |
| `4` | 16px | Standard padding, gaps between items |
| `5` | 20px | Section spacing |
| `6` | 24px | Page section margins |

**Standard patterns:**
- Page content: `px-4 py-4`
- Cards/panels: `p-4`
- List item gaps: `gap-3` or `gap-4`
- Button internal: `px-4 py-2.5`

---

## Icon Sizes

Use only these sizes for consistency:

| Size | Pixels | Usage |
|------|--------|-------|
| `sm` | 16px | Inline with small text, badges |
| `md` | 20px | Standard buttons, list items |
| `lg` | 24px | Headers, emphasis |
| `xl` | 32px | Section headers |
| `2xl` | 48px | Empty states |

**Icon centering:**
Always use flex container with `items-center justify-center`:
```svelte
<button class="flex items-center justify-center w-11 h-11">
  <Icon size={20} />
</button>
```

---

## Touch Targets

Minimum dimensions for interactive elements:

| Element | Minimum Size | Standard Class |
|---------|--------------|----------------|
| Icon buttons | 44x44px | `w-11 h-11` or `min-w-[44px] min-h-[44px]` |
| Text buttons | 44px height | `py-3` or `min-h-[44px]` |
| List items | 48px height | `min-h-[48px]` or `py-3` |
| Tab buttons | 44px height | `py-2.5` with touch-manipulation |

Always add `touch-manipulation` class to buttons.

---

## Colors

### Semantic Colors

| Name | CSS Variable | Light | Dark | Usage |
|------|--------------|-------|------|-------|
| Accent | `--color-accent` | User-defined | User-defined | Primary actions, highlights |
| Surface | `--color-surface` | `#f8fafc` | `#1e293b` | Card backgrounds |
| Surface-2 | `--color-surface-2` | `#e2e8f0` | `#334155` | Secondary backgrounds |

### Status Colors

| Status | Color | Background Class |
|--------|-------|------------------|
| Queued | Slate | `bg-slate-500` |
| Watching/In Progress | Amber | `bg-amber-500` |
| Completed/Visited | Emerald | `bg-emerald-500` |
| Dropped | Red | `bg-red-500` |

### Text Colors

| Usage | Light | Dark |
|-------|-------|------|
| Primary | `text-slate-900` | `text-slate-100` |
| Secondary | `text-slate-600` | `text-slate-300` |
| Muted | `text-slate-500` | `text-slate-400` |
| Hint | `text-slate-400` | `text-slate-500` |

---

## Border Radius

| Size | Class | Usage |
|------|-------|-------|
| Small | `rounded-lg` | Inputs, small buttons |
| Medium | `rounded-xl` | Cards, panels, modals |
| Large | `rounded-2xl` | Search input, major containers |
| Full | `rounded-full` | Avatars, icon buttons, pills |

---

## Shadows

Use sparingly:
- `shadow-lg` - Modals, floating panels
- `shadow-2xl` - Sidebar
- No shadow - Standard cards (use border instead)

---

## Component Patterns

### Page Header

Every page should have a consistent header:

```svelte
<header class="mb-6">
  <div class="flex items-center justify-center gap-3 mb-2">
    <Icon size={24} class="text-accent" />
    <h1 class="text-2xl font-bold">Page Title</h1>
  </div>
  <p class="text-center text-slate-500 dark:text-slate-400 text-sm">
    Subtitle or count
  </p>
</header>
```

### Action Bar

Consistent actions below header:

```svelte
<div class="flex items-center justify-between gap-2 mb-4">
  <!-- Primary action (left) -->
  <button class="btn-primary">
    <Plus size={18} />
    <span>Add Item</span>
  </button>

  <!-- Secondary actions (right) -->
  <div class="flex items-center gap-1">
    <IconButton icon={Filter} label="Filter" />
    <IconButton icon={Search} label="Search" />
  </div>
</div>
```

### List Item

Consistent list item structure:

```svelte
<article class="flex items-start gap-4 p-4 bg-surface border border-slate-200 dark:border-slate-700 rounded-xl">
  <!-- Icon/Image (fixed width) -->
  <div class="shrink-0 w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent">
    <Icon size={20} />
  </div>

  <!-- Content (flexible) -->
  <div class="flex-1 min-w-0">
    <h3 class="font-medium truncate">Title</h3>
    <p class="text-sm text-slate-500 dark:text-slate-400">Subtitle</p>
  </div>

  <!-- Actions (fixed) -->
  <div class="flex items-center gap-2">
    <IconButton icon={Check} size="sm" />
    <IconButton icon={X} size="sm" variant="danger" />
  </div>
</article>
```

### Empty State

```svelte
<div class="text-center py-16">
  <div class="flex justify-center mb-4 text-slate-300 dark:text-slate-600">
    <Icon size={48} />
  </div>
  <h3 class="text-lg font-medium mb-2">No items yet</h3>
  <p class="text-slate-500 dark:text-slate-400 mb-4">
    Description of how to add items
  </p>
  <button class="btn-primary">
    <Plus size={18} />
    <span>Add First Item</span>
  </button>
</div>
```

### Modal

```svelte
<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
  <div class="bg-surface rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
    <!-- Header -->
    <header class="sticky top-0 bg-surface border-b border-slate-200 dark:border-slate-700 p-4 flex items-center justify-between">
      <h2 class="text-lg font-bold">Modal Title</h2>
      <IconButton icon={X} onclick={onClose} label="Close" />
    </header>

    <!-- Content -->
    <div class="p-4 space-y-4">
      <!-- ... -->
    </div>
  </div>
</div>
```

---

## Button Classes

### Primary Button
```css
.btn-primary {
  @apply flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent text-white font-medium
         hover:opacity-90 transition-opacity touch-manipulation;
}
```

### Secondary Button
```css
.btn-secondary {
  @apply flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface-2 text-slate-700 dark:text-slate-200
         font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors touch-manipulation;
}
```

### Icon Button
```css
.btn-icon {
  @apply flex items-center justify-center w-11 h-11 rounded-xl bg-surface-2
         text-slate-500 hover:text-slate-700 dark:hover:text-slate-300
         transition-colors touch-manipulation;
}
```

### Danger Button
```css
.btn-danger {
  @apply flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/20
         text-red-600 dark:text-red-400 font-medium
         hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors touch-manipulation;
}
```

---

## Form Elements

### Text Input
```svelte
<input
  type="text"
  class="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:border-accent"
  placeholder="Placeholder..."
/>
```

### Select
```svelte
<select class="w-full px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg">
  <option>Option</option>
</select>
```

### Textarea
```svelte
<textarea
  rows="3"
  class="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg resize-y focus:outline-none focus:border-accent"
></textarea>
```

---

## Tabs

Consistent tab pattern:

```svelte
<div class="flex gap-2 mb-4 border-b border-slate-200 dark:border-slate-700">
  {#each tabs as tab}
    <button
      class="px-4 py-2.5 font-medium transition-colors relative touch-manipulation {active === tab
        ? 'text-accent border-b-2 border-accent -mb-px'
        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}"
      onclick={() => active = tab}
    >
      {tab.label}
      {#if tab.badge}
        <span class="absolute -top-1 -right-1 w-5 h-5 bg-accent text-white text-xs rounded-full flex items-center justify-center">
          {tab.badge}
        </span>
      {/if}
    </button>
  {/each}
</div>
```

---

## Filter Pills

```svelte
<div class="flex flex-wrap gap-2">
  {#each options as option}
    <button
      class="px-4 py-2 rounded-full text-sm font-medium transition-colors touch-manipulation {selected === option
        ? 'bg-accent text-white'
        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}"
    >
      {option.label}
    </button>
  {/each}
</div>
```

---

## Animations

### Touch Feedback
Applied automatically via `@media (pointer: coarse)`:
- Scale to 97% on tap
- 75ms transition

### Transitions
Standard duration: `duration-200` or `transition-colors`

### Loading Spinner
```svelte
<div class="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
```

---

## iOS PWA Considerations

1. **Force Repaint** - Use for conditional content:
```typescript
function forceRepaint() {
  requestAnimationFrame(() => {
    document.body.style.transform = 'translateZ(0)'
    requestAnimationFrame(() => {
      document.body.style.transform = ''
    })
  })
}
```

2. **GPU Compositing** - Add to dynamic elements:
```svelte
<div style="transform: translateZ(0);">
  <!-- Conditional content -->
</div>
```

3. **Safe Areas** - Use for edge-to-edge content:
```svelte
<div class="safe-area-bottom">
  <!-- Bottom navigation -->
</div>
```

---

## File Organization

```
src/lib/components/
  ui/                    # Design system components
    IconButton.svelte
    PageHeader.svelte
    ActionBar.svelte
    ListItem.svelte
    EmptyState.svelte
    Tabs.svelte
    FilterPills.svelte
    Modal.svelte
  Sidebar.svelte         # App-specific components
  MediaDetailModal.svelte
  PlaceDetailModal.svelte
  ...
```

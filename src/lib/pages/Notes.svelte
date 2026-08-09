<script lang="ts">
  import EmptyState from '$lib/components/ui/EmptyState.svelte'
  import PhotoGallery from '$lib/components/ui/PhotoGallery.svelte'
  import Modal from '$lib/components/ui/Modal.svelte'
  import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte'
  import { addDocument, deleteDocument, subscribeToCollection, updateDocument } from '$lib/firebase'
  import { hapticLight, hapticMedium, hapticSuccess } from '$lib/haptics'
  import { activeUser, displayNames } from '$lib/stores/app'
  import { consumeQueryParam } from '$lib/stores/nav'
  import type { Note, NoteColor, UserId } from '$lib/types'
  import { Timestamp, type Timestamp as TimestampType } from 'firebase/firestore'
  import { Archive, ArchiveRestore, Check, Image as ImageIcon, Pencil, Pin, StickyNote, Trash2, X } from 'lucide-svelte'
  import { onMount } from 'svelte'
  import { toast } from 'svelte-sonner'

  let notes = $state<Note[]>([])
  let unsubscribe: (() => void) | undefined
  let selectedNote = $state<Note | null>(null)
  let editingNote = $state<Note | null>(null)

  // Compose form state
  let composing = $state(false)
  let newNote = $state({ title: '', content: '', color: 'yellow' as NoteColor })

  // View: 'corkboard' | 'archive'
  type ViewKey = 'corkboard' | 'archive'
  let activeView = $state<ViewKey>('corkboard')

  // Cached timestamp for relative time calculations - updates every 60 seconds
  let now = $state(Date.now())

  // Get the other user's ID
  let otherUserId = $derived<UserId>($activeUser === 'Z' ? 'T' : 'Z')

  const NOTE_COLORS: NoteColor[] = ['yellow', 'pink', 'blue', 'green', 'purple', 'orange']

  // Deterministic rotation based on note id - slight tilt for realism
  function getNoteRotation(noteId: string | undefined): number {
    if (!noteId) return 0
    // Hash the id to a stable rotation in range [-3, 3] degrees
    let hash = 0
    for (let i = 0; i < noteId.length; i++) {
      hash = (hash * 31 + noteId.charCodeAt(i)) & 0xffffffff
    }
    return ((hash % 7) - 3) * 0.8
  }

  onMount(() => {
    // Open the compose form directly when arriving via a quick-add link.
    if (consumeQueryParam('add') !== null) composing = true

    unsubscribe = subscribeToCollection<Note>('notes', (items) => {
      notes = items
    })

    const timeInterval = setInterval(() => {
      now = Date.now()
    }, 60000)

    return () => {
      unsubscribe?.()
      clearInterval(timeInterval)
    }
  })

  async function addNote(): Promise<void> {
    if (!newNote.title.trim() && !newNote.content.trim()) return

    try {
      await addDocument<Note>(
        'notes',
        {
          type: 'note',
          title: newNote.title,
          content: newNote.content,
          tags: [],
          read: false,
          archived: false,
          color: newNote.color
        },
        $activeUser
      )
      newNote = { title: '', content: '', color: 'yellow' }
      composing = false
      hapticSuccess()
      toast.success('Note pinned to board')
    } catch (e) {
      console.error('Failed to pin note:', e)
      toast.error('Failed to pin note')
    }
  }

  async function saveEditedNote(): Promise<void> {
    if (!editingNote?.id) return
    try {
      await updateDocument<Note>('notes', editingNote.id, {
        title: editingNote.title,
        content: editingNote.content,
        color: editingNote.color
      }, $activeUser)
      editingNote = null
      hapticSuccess()
      toast.success('Note updated')
    } catch (e) {
      console.error('Failed to update note:', e)
      toast.error('Failed to update note')
    }
  }

  async function markAsRead(note: Note): Promise<void> {
    if (!note.id || note.read || note.createdBy === $activeUser) return
    hapticLight()
    await updateDocument<Note>('notes', note.id, {
      read: true,
      readAt: Timestamp.now()
    }, $activeUser)
  }

  async function toggleArchive(note: Note): Promise<void> {
    if (!note.id) return
    hapticLight()
    await updateDocument<Note>('notes', note.id, {
      archived: !note.archived
    }, $activeUser)
    toast.success(note.archived ? 'Returned to board' : 'Moved to archive')
  }

  async function togglePin(note: Note): Promise<void> {
    if (!note.id) return
    hapticMedium()
    await updateDocument<Note>('notes', note.id, {
      pinned: !note.pinned
    }, $activeUser)
  }

  // Confirm dialog state
  let pendingConfirm = $state<{ message: string; onConfirm: () => void } | null>(null)

  async function removeNote(id: string): Promise<void> {
    pendingConfirm = {
      message: 'Tear up this note permanently?',
      onConfirm: async () => {
        pendingConfirm = null
        try {
          await deleteDocument('notes', id)
          toast.success('Note torn up')
        } catch (e) {
          console.error('Failed to delete:', e)
          toast.error('Failed to delete note')
        }
      }
    }
  }

  function formatDate(timestamp: TimestampType | undefined): string {
    if (!timestamp) return ''
    const date = timestamp.toDate()
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  }

  function getRelativeTime(timestamp: TimestampType | undefined): string {
    if (!timestamp) return ''
    const date = timestamp.toDate()
    const diffMs = now - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return formatDate(timestamp)
  }

  function getDisplayNameForUser(userId: UserId): string {
    return $displayNames[userId]
  }

  async function updatePhotos(noteId: string, photos: string[]): Promise<void> {
    await updateDocument<Note>('notes', noteId, { photos }, $activeUser)
  }

  function openNoteDetail(note: Note): void {
    selectedNote = note
    markAsRead(note)
  }

  function closeNoteDetail(): void {
    selectedNote = null
  }

  function startEditing(note: Note): void {
    editingNote = { ...note }
    selectedNote = null
  }

  // Board notes: unarchived, pinned first then chronological
  let boardNotes = $derived.by(() => {
    const active = notes.filter(n => !n.archived)
    return [...active].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      // Newest first
      const ta = a.createdAt?.toMillis?.() ?? 0
      const tb = b.createdAt?.toMillis?.() ?? 0
      return tb - ta
    })
  })

  let archivedNotes = $derived(notes.filter(n => n.archived))

  // Unread count from other user
  let unreadCount = $derived(
    notes.filter(n => n.createdBy === otherUserId && !n.read && !n.archived).length
  )
</script>

<!-- Cork board page -->
<div class="corkboard-page">
  <!-- Header bar -->
  <div class="corkboard-header">
    <div class="flex items-center gap-3">
      <div class="corkboard-pin-icon">
        <Pin size={18} />
      </div>
      <div>
        <h1 class="text-lg font-bold text-slate-800 dark:text-slate-100 leading-tight">Our Board</h1>
        <p class="text-xs text-slate-500 dark:text-slate-400">{boardNotes.length} note{boardNotes.length === 1 ? '' : 's'} pinned</p>
      </div>
    </div>

    <div class="flex items-center gap-2">
      {#if unreadCount > 0}
        <span class="unread-bubble">{unreadCount} new</span>
      {/if}

      <!-- View toggle -->
      <button
        type="button"
        class="btn-ghost text-sm px-3 py-2 {activeView === 'archive' ? 'text-accent' : ''}"
        onclick={() => { activeView = activeView === 'corkboard' ? 'archive' : 'corkboard'; hapticLight(); }}
      >
        {#if activeView === 'archive'}
          <StickyNote size={16} />
          <span>Board</span>
        {:else}
          <Archive size={16} />
          <span>Archive {archivedNotes.length > 0 ? `(${archivedNotes.length})` : ''}</span>
        {/if}
      </button>

      <!-- Add note button -->
      {#if activeView === 'corkboard'}
        <button
          type="button"
          class="btn-primary text-sm"
          onclick={() => { composing = !composing; hapticLight(); }}
          aria-label="Write a note"
        >
          <Pencil size={16} />
          <span class="hidden sm:inline">Write</span>
        </button>
      {/if}
    </div>
  </div>

  <!-- Cork texture board area -->
  {#if activeView === 'corkboard'}
    <div class="cork-surface">

      <!-- Compose sticky inline -->
      {#if composing}
        <div class="compose-sticky note-{newNote.color}">
          <div class="sticky-top-tape"></div>
          <div class="p-4 pt-5 space-y-2">
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs font-semibold uppercase tracking-wider" style="color: rgba(0,0,0,0.55)">New note</span>
              <button
                type="button"
                class="transition-colors"
                style="color: rgba(0,0,0,0.5)"
                onclick={() => { composing = false; newNote = { title: '', content: '', color: 'yellow' }; }}
              >
                <X size={16} />
              </button>
            </div>
            <input
              type="text"
              placeholder="Title (optional)"
              class="sticky-input font-semibold text-base"
              bind:value={newNote.title}
            />
            <textarea
              placeholder="Write something..."
              rows="4"
              class="sticky-input resize-none text-sm leading-relaxed"
              bind:value={newNote.content}
            ></textarea>

            <!-- Color picker -->
            <div class="flex items-center gap-2 pt-1">
              <span class="text-xs" style="color: rgba(0,0,0,0.5)">Color:</span>
              <div class="flex gap-1.5">
                {#each NOTE_COLORS as color}
                  <button
                    type="button"
                    class="touch-sm color-swatch note-{color} {newNote.color === color ? 'ring-2 ring-slate-600 ring-offset-1' : ''}"
                    onclick={() => newNote.color = color}
                    aria-label="Color {color}"
                  ></button>
                {/each}
              </div>
            </div>

            <div class="flex justify-end pt-1">
              <button
                type="button"
                class="pin-btn"
                onclick={addNote}
              >
                <Pin size={14} />
                Pin it
              </button>
            </div>
          </div>
        </div>
      {/if}

      <!-- Notes masonry grid -->
      {#if boardNotes.length === 0 && !composing}
        <div class="cork-empty">
          <EmptyState
            icon={StickyNote}
            title="The board is empty"
            description="Pin your first note for {$displayNames[otherUserId]}"
          />
        </div>
      {:else}
        <div class="notes-masonry">
          {#each boardNotes as note (note.id)}
            {@const isUnread = !note.read && note.createdBy !== $activeUser}
            {@const rot = getNoteRotation(note.id)}
            <div
              class="sticky-note note-{note.color ?? 'yellow'} {note.pinned ? 'is-pinned' : ''} {isUnread ? 'is-unread' : ''}"
              style="--rot: {rot}deg"
              onclick={() => openNoteDetail(note)}
              role="button"
              tabindex="0"
              onkeydown={(e) => e.key === 'Enter' && openNoteDetail(note)}
            >
              <!-- Thumbtack -->
              <div class="thumbtack {note.pinned ? 'thumbtack-pinned' : ''}">
                <div class="thumbtack-head"></div>
                <div class="thumbtack-stem"></div>
              </div>

              <!-- Unread dot -->
              {#if isUnread}
                <div class="unread-dot"></div>
              {/if}

              <!-- Note content -->
              <div class="sticky-body">
                {#if note.title}
                  <h3 class="sticky-title">{note.title}</h3>
                {/if}
                {#if note.content}
                  <p class="sticky-content">{note.content}</p>
                {/if}
                {#if note.photos?.length}
                  <div class="flex items-center gap-1 mt-2 text-xs opacity-60">
                    <ImageIcon size={12} />
                    <span>{note.photos.length} photo{note.photos.length === 1 ? '' : 's'}</span>
                  </div>
                {/if}
              </div>

              <!-- Footer: author + time -->
              <div class="sticky-footer">
                <span class="sticky-author {note.createdBy === $activeUser ? 'opacity-50' : ''}">
                  {note.createdBy === $activeUser ? 'You' : getDisplayNameForUser(note.createdBy)}
                </span>
                <span class="sticky-time">{getRelativeTime(note.createdAt)}</span>
              </div>

              <!-- Hover action tray -->
              <div class="sticky-actions" role="none" onclick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  class="sticky-action-btn"
                  onclick={() => togglePin(note)}
                  aria-label={note.pinned ? 'Unpin' : 'Pin'}
                  title={note.pinned ? 'Unpin' : 'Pin to top'}
                >
                  <Pin size={13} class={note.pinned ? 'text-accent' : ''} />
                </button>
                <button
                  type="button"
                  class="sticky-action-btn"
                  onclick={() => toggleArchive(note)}
                  aria-label={note.archived ? 'Unarchive' : 'Archive'}
                  title="Archive"
                >
                  <Archive size={13} />
                </button>
                {#if note.createdBy === $activeUser}
                  <button
                    type="button"
                    class="sticky-action-btn"
                    onclick={() => startEditing(note)}
                    aria-label="Edit"
                    title="Edit"
                  >
                    <Pencil size={13} />
                  </button>
                {/if}
                <button
                  type="button"
                  class="sticky-action-btn hover:text-red-500"
                  onclick={() => note.id && removeNote(note.id)}
                  aria-label="Delete"
                  title="Delete"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

  {:else}
    <!-- Archive view -->
    <div class="archive-view">
      <div class="flex items-center gap-2 mb-4 px-1">
        <Archive size={16} class="text-slate-400" />
        <span class="text-sm text-slate-500">{archivedNotes.length} archived note{archivedNotes.length === 1 ? '' : 's'}</span>
      </div>

      {#if archivedNotes.length === 0}
        <EmptyState
          icon={Archive}
          title="Archive is empty"
          description="Archived notes will appear here"
        />
      {:else}
        <div class="flex flex-col gap-3">
          {#each archivedNotes as note (note.id)}
            <div
              class="card p-4 cursor-pointer hover:border-accent/50 transition-colors"
              onclick={() => openNoteDetail(note)}
              role="button"
              tabindex="0"
              onkeydown={(e) => e.key === 'Enter' && openNoteDetail(note)}
            >
              <div class="flex items-start justify-between gap-3">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1">
                    <div class="w-2 h-2 rounded-full note-dot-{note.color ?? 'yellow'}"></div>
                    {#if note.title}
                      <h3 class="font-medium truncate">{note.title}</h3>
                    {:else}
                      <h3 class="font-medium truncate opacity-40">Untitled</h3>
                    {/if}
                  </div>
                  {#if note.content}
                    <p class="text-sm text-slate-500 dark:text-slate-400 line-clamp-2">{note.content}</p>
                  {/if}
                  <p class="text-xs text-slate-400 mt-1">{getDisplayNameForUser(note.createdBy)} · {getRelativeTime(note.createdAt)}</p>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    class="btn-icon-sm"
                    onclick={(e) => { e.stopPropagation(); toggleArchive(note); }}
                    aria-label="Return to board"
                    title="Return to board"
                  >
                    <ArchiveRestore size={16} />
                  </button>
                  <button
                    type="button"
                    class="btn-icon-sm hover:text-red-500"
                    onclick={(e) => { e.stopPropagation(); note.id && removeNote(note.id); }}
                    aria-label="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<!-- Note Detail Modal -->
<Modal open={!!selectedNote} onclose={closeNoteDetail} title={selectedNote?.title || 'Note'}>
  {#snippet header()}
    {#if selectedNote}
      {@const noteColor = selectedNote.color ?? 'yellow'}
      <div class="relative modal-note-header note-header-{noteColor} p-6 shrink-0">
        <button
          class="absolute top-2 right-2 w-11 h-11 rounded-full bg-black/10 flex items-center justify-center hover:bg-black/20 transition-colors touch-manipulation"
          onclick={closeNoteDetail}
        >
          <X size={20} />
        </button>

        <div class="flex items-center gap-4">
          <div class="w-14 h-14 rounded-2xl bg-white/40 flex items-center justify-center shrink-0">
            <StickyNote size={28} class="opacity-70" />
          </div>
          <div class="flex-1 min-w-0">
            {#if selectedNote.title}
              <h2 class="text-xl font-bold truncate">{selectedNote.title}</h2>
            {:else}
              <h2 class="text-xl font-bold opacity-40">Note</h2>
            {/if}
            <div class="flex items-center gap-2 text-sm opacity-70">
              <span class="font-medium">
                {selectedNote.createdBy === $activeUser ? 'You' : getDisplayNameForUser(selectedNote.createdBy)}
              </span>
              <span>·</span>
              <span>{formatDate(selectedNote.createdAt)}</span>
              {#if selectedNote.read && selectedNote.readAt && selectedNote.createdBy === $activeUser}
                <span>·</span>
                <span class="flex items-center gap-0.5"><Check size={12} /> Read</span>
              {/if}
            </div>
          </div>
        </div>
      </div>
    {/if}
  {/snippet}

  {#if selectedNote}
    <div class="space-y-5">
      {#if selectedNote.content}
        <p class="whitespace-pre-wrap text-slate-700 dark:text-slate-300 leading-relaxed">{selectedNote.content}</p>
      {/if}

      <!-- Photos -->
      {#if selectedNote.id}
        <div>
          <span class="block text-xs text-slate-500 dark:text-slate-400 mb-2">Photos</span>
          <PhotoGallery
            photos={selectedNote.photos}
            folderPath={['notes']}
            onUpdate={async (photos) => {
              if (selectedNote?.id) {
                await updatePhotos(selectedNote.id, photos)
              }
            }}
            maxPhotos={20}
          />
        </div>
      {/if}

      <!-- Actions row -->
      <div class="flex items-center gap-2 pt-2 border-t border-[var(--color-border)]">
        <button
          type="button"
          class="btn-secondary text-sm flex-1"
          onclick={() => { toggleArchive(selectedNote!); closeNoteDetail(); }}
        >
          {#if selectedNote.archived}
            <ArchiveRestore size={16} />
            Return to board
          {:else}
            <Archive size={16} />
            Archive
          {/if}
        </button>
        {#if selectedNote.createdBy === $activeUser}
          <button
            type="button"
            class="btn-secondary text-sm flex-1"
            onclick={() => startEditing(selectedNote!)}
          >
            <Pencil size={16} />
            Edit
          </button>
        {/if}
        <button
          type="button"
          class="btn-danger text-sm"
          onclick={() => { selectedNote?.id && removeNote(selectedNote.id); closeNoteDetail(); }}
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div class="text-xs text-slate-400">
        {getDisplayNameForUser(selectedNote.createdBy)} · {formatDate(selectedNote.createdAt)}
        {#if selectedNote.read && selectedNote.readAt}
          · Read {formatDate(selectedNote.readAt)}
        {/if}
      </div>
    </div>
  {/if}
</Modal>

<!-- Edit Note Modal -->
<Modal open={!!editingNote} onclose={() => editingNote = null} title="Edit note">
  {#if editingNote}
    <div class="space-y-4">
      <input
        type="text"
        placeholder="Title (optional)"
        class="input"
        bind:value={editingNote.title}
      />
      <textarea
        placeholder="Write something..."
        rows="5"
        class="input resize-y"
        bind:value={editingNote.content}
      ></textarea>

      <!-- Color picker -->
      <div class="flex items-center gap-3">
        <span class="text-sm text-slate-500">Color:</span>
        <div class="flex gap-2">
          {#each NOTE_COLORS as color}
            <button
              type="button"
              class="touch-sm color-swatch-lg note-{color} {editingNote.color === color ? 'ring-2 ring-slate-600 ring-offset-2' : ''}"
              onclick={() => { if (editingNote) editingNote.color = color }}
              aria-label="Color {color}"
            ></button>
          {/each}
        </div>
      </div>

      <div class="flex gap-2 pt-2">
        <button type="button" class="btn-primary flex-1" onclick={saveEditedNote}>
          <Check size={16} />
          Save changes
        </button>
        <button type="button" class="btn-secondary" onclick={() => editingNote = null}>
          Cancel
        </button>
      </div>
    </div>
  {/if}
</Modal>

<ConfirmModal
  open={pendingConfirm !== null}
  message={pendingConfirm?.message ?? ''}
  danger={true}
  onConfirm={() => pendingConfirm?.onConfirm()}
  onCancel={() => pendingConfirm = null}
/>

<style>
  /* ===== CORKBOARD PAGE ===== */
  .corkboard-page {
    min-height: calc(100vh - 5rem);
    display: flex;
    flex-direction: column;
  }

  /* Header */
  .corkboard-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1rem 0.75rem;
    background: transparent;
  }

  .corkboard-pin-icon {
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 50%;
    background: var(--color-accent);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .unread-bubble {
    background: var(--color-accent);
    color: white;
    font-size: 0.7rem;
    font-weight: 600;
    padding: 0.2rem 0.55rem;
    border-radius: 999px;
    letter-spacing: 0.02em;
  }

  /* Cork surface */
  .cork-surface {
    flex: 1;
    padding: 1rem;
    background:
      /* Subtle noise texture via SVG data-uri */
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.08'/%3E%3C/svg%3E"),
      #c8a882;
    border-radius: 1rem;
    margin: 0 0.5rem 1rem;
    min-height: 24rem;
    box-shadow: inset 0 2px 8px rgba(0,0,0,0.18), 0 1px 0 rgba(255,255,255,0.3);
  }

  :global(.dark) .cork-surface {
    background:
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.12'/%3E%3C/svg%3E"),
      #7a5c3a;
    box-shadow: inset 0 2px 10px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.08);
  }

  .cork-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 20rem;
  }

  /* Notes masonry */
  .notes-masonry {
    columns: 2;
    column-gap: 0.75rem;
    /* On wider screens show 3 columns */
  }

  @media (min-width: 640px) {
    .notes-masonry {
      columns: 3;
    }
  }

  @media (min-width: 900px) {
    .notes-masonry {
      columns: 4;
    }
  }

  /* ===== STICKY NOTE ===== */
  .sticky-note {
    break-inside: avoid;
    position: relative;
    margin-bottom: 0.75rem;
    border-radius: 2px;
    padding: 0.875rem 0.875rem 0.6rem;
    cursor: pointer;
    transform: rotate(var(--rot, 0deg));
    transition: transform 150ms ease, box-shadow 150ms ease;
    box-shadow: 2px 3px 10px rgba(0,0,0,0.18), 0 1px 2px rgba(0,0,0,0.1);
  }

  .sticky-note:hover, .sticky-note:focus-visible {
    transform: rotate(0deg) scale(1.02);
    box-shadow: 4px 8px 20px rgba(0,0,0,0.25);
    outline: none;
    z-index: 10;
  }

  .sticky-note.is-pinned {
    box-shadow: 4px 6px 16px rgba(0,0,0,0.22), 0 1px 2px rgba(0,0,0,0.12);
  }

  .sticky-note.is-unread::after {
    content: '';
    position: absolute;
    top: 0.4rem;
    right: 0.4rem;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: var(--color-accent);
    box-shadow: 0 0 0 2px white;
  }

  /* Sticky note color variants */
  .note-yellow { background: #fef08a; }
  .note-pink   { background: #fbcfe8; }
  .note-blue   { background: #bae6fd; }
  .note-green  { background: #bbf7d0; }
  .note-purple { background: #e9d5ff; }
  .note-orange { background: #fed7aa; }

  :global(.dark) .note-yellow { background: #ca8a04; }
  :global(.dark) .note-pink   { background: #be185d; }
  :global(.dark) .note-blue   { background: #0369a1; }
  :global(.dark) .note-green  { background: #15803d; }
  :global(.dark) .note-purple { background: #7e22ce; }
  :global(.dark) .note-orange { background: #c2410c; }

  /* Thumbtack */
  .thumbtack {
    position: absolute;
    top: -6px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    z-index: 2;
  }

  .thumbtack-head {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, #e5e7eb, #6b7280);
    box-shadow: 0 1px 3px rgba(0,0,0,0.4);
  }

  .thumbtack-pinned .thumbtack-head {
    background: radial-gradient(circle at 35% 35%, rgba(255,255,255,0.7), var(--color-accent));
  }

  .thumbtack-stem {
    width: 2px;
    height: 5px;
    background: #9ca3af;
    border-radius: 0 0 1px 1px;
  }

  /* Sticky note body */
  .sticky-body {
    margin-top: 0.5rem;
    min-height: 2.5rem;
  }

  .sticky-title {
    font-weight: 700;
    font-size: 0.875rem;
    line-height: 1.3;
    color: rgba(0,0,0,0.75);
    margin-bottom: 0.3rem;
    word-break: break-word;
  }

  .sticky-content {
    font-size: 0.8rem;
    line-height: 1.45;
    color: rgba(0,0,0,0.65);
    white-space: pre-wrap;
    word-break: break-word;
    /* Clamp to 6 lines on card */
    display: -webkit-box;
    -webkit-line-clamp: 6;
    line-clamp: 6;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .sticky-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 0.6rem;
    padding-top: 0.4rem;
    border-top: 1px solid rgba(0,0,0,0.08);
  }

  .sticky-author {
    font-size: 0.65rem;
    font-weight: 600;
    color: rgba(0,0,0,0.5);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .sticky-time {
    font-size: 0.65rem;
    color: rgba(0,0,0,0.4);
  }

  /* Hover action tray */
  .sticky-actions {
    position: absolute;
    bottom: -2.2rem;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 0.25rem;
    background: white;
    border-radius: 999px;
    padding: 0.25rem 0.5rem;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    opacity: 0;
    pointer-events: none;
    transition: opacity 120ms;
    z-index: 20;
    white-space: nowrap;
  }

  .sticky-note:hover .sticky-actions,
  .sticky-note:focus-within .sticky-actions {
    opacity: 1;
    pointer-events: auto;
  }

  @media (hover: none) {
    /* On touch, keep actions hidden - use detail modal for actions */
    .sticky-actions {
      display: none;
    }
  }

  .sticky-action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 50%;
    color: #64748b;
    transition: color 100ms, background 100ms;
  }

  .sticky-action-btn:hover {
    color: #1e293b;
    background: #f1f5f9;
  }

  /* ===== COMPOSE STICKY ===== */
  .compose-sticky {
    position: relative;
    margin-bottom: 1rem;
    border-radius: 2px;
    box-shadow: 3px 4px 14px rgba(0,0,0,0.2);
    max-width: 24rem;
    margin-left: auto;
    margin-right: auto;
  }

  .sticky-top-tape {
    position: absolute;
    top: -0.6rem;
    left: 50%;
    transform: translateX(-50%);
    width: 3rem;
    height: 1rem;
    background: rgba(255,255,255,0.55);
    border-radius: 2px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
  }

  .sticky-input {
    width: 100%;
    background: transparent;
    border: none;
    outline: none;
    color: rgba(0,0,0,0.75);
    font-family: inherit;
  }

  .sticky-input::placeholder {
    color: rgba(0,0,0,0.35);
  }

  .pin-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.8rem;
    font-weight: 600;
    padding: 0.35rem 0.85rem;
    border-radius: 999px;
    background: rgba(0,0,0,0.12);
    color: rgba(0,0,0,0.65);
    transition: background 150ms;
  }

  .pin-btn:hover {
    background: rgba(0,0,0,0.2);
  }

  /* Color swatch (small, in compose form) */
  .color-swatch {
    width: 1.1rem;
    height: 1.1rem;
    border-radius: 50%;
    border: 1.5px solid rgba(0,0,0,0.15);
    cursor: pointer;
    transition: transform 100ms;
  }

  .color-swatch:hover {
    transform: scale(1.2);
  }

  /* Color swatch (larger, in edit modal) */
  .color-swatch-lg {
    width: 1.6rem;
    height: 1.6rem;
    border-radius: 50%;
    border: 1.5px solid rgba(0,0,0,0.12);
    cursor: pointer;
    transition: transform 100ms;
  }

  .color-swatch-lg:hover {
    transform: scale(1.15);
  }

  /* Archive view color dot */
  .note-dot-yellow { background: #ca8a04; }
  .note-dot-pink   { background: #be185d; }
  .note-dot-blue   { background: #0284c7; }
  .note-dot-green  { background: #16a34a; }
  .note-dot-purple { background: #7c3aed; }
  .note-dot-orange { background: #ea580c; }

  /* Modal note header color */
  .modal-note-header { color: rgba(0,0,0,0.8); }
  .note-header-yellow { background: #fef08a; }
  .note-header-pink   { background: #fbcfe8; }
  .note-header-blue   { background: #bae6fd; }
  .note-header-green  { background: #bbf7d0; }
  .note-header-purple { background: #e9d5ff; }
  .note-header-orange { background: #fed7aa; }

  /* Archive view */
  .archive-view {
    padding: 1rem;
    max-width: 42rem;
    margin: 0 auto;
  }

  /* Unread dot */
  .unread-dot {
    position: absolute;
    top: 0.45rem;
    right: 0.45rem;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: var(--color-accent);
    box-shadow: 0 0 0 1.5px white;
  }
</style>

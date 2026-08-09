<script lang="ts">
  import EmptyState from '$lib/components/ui/EmptyState.svelte'
  import PhotoGallery from '$lib/components/ui/PhotoGallery.svelte'
  import Modal from '$lib/components/ui/Modal.svelte'
  import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte'
  import { addDocument, deleteDocument, subscribeToCollection, updateDocument } from '$lib/firebase'
  import { hapticLight, hapticMedium, hapticSuccess } from '$lib/haptics'
  import { activeUser, currentPreferences, displayNames, userPreferences } from '$lib/stores/app'
  import { consumeQueryParam } from '$lib/stores/nav'
  import { getNotePalette, resolveNoteTone, resolveToneShift, NOTE_TONE_KEYS, type NoteTone } from '$lib/notePalette'
  import { DEFAULT_ACCENT } from '$lib/accents'
  import type { Note, NoteColor, UserId } from '$lib/types'
  import { Timestamp, type Timestamp as TimestampType } from 'firebase/firestore'
  import { Archive, ArchiveRestore, Check, Image as ImageIcon, Pencil, Pin, Search, SlidersHorizontal, ArrowUpDown, StickyNote, Trash2, X } from 'lucide-svelte'
  import { onMount } from 'svelte'
  import { toast } from 'svelte-sonner'

  let notes = $state<Note[]>([])
  let unsubscribe: (() => void) | undefined
  let selectedNote = $state<Note | null>(null)
  let editingNote = $state<Note | null>(null)

  // Compose form state
  let composing = $state(false)
  let newNote = $state({ title: '', content: '', color: 't0' as NoteColor })

  // View: 'corkboard' | 'archive'
  type ViewKey = 'corkboard' | 'archive'
  let activeView = $state<ViewKey>('corkboard')

  // Filter / sort state
  let showFilters = $state(false)
  let searchText = $state('')
  let authorFilter = $state<'all' | UserId>('all')
  let unreadOnly = $state(false)
  type SortMode = 'newest' | 'oldest' | 'author'
  let sortMode = $state<SortMode>('newest')

  // Cached timestamp for relative time calculations - updates every 60 seconds
  let now = $state(Date.now())

  // Get the other user's ID
  let otherUserId = $derived<UserId>($activeUser === 'Z' ? 'T' : 'Z')

  // ===== Per-identity note palettes =====
  // Each note is coloured from its author's accent so authorship reads at a
  // glance; when both accents collide, one family is auto hue-shifted.
  let toneShift = $derived(
    resolveToneShift($userPreferences, $currentPreferences?.noteAutoToneShift ?? true)
  )
  let isDark = $derived(($currentPreferences?.theme ?? 'dark') === 'dark')
  let myAccent = $derived($userPreferences[$activeUser]?.accentColor ?? DEFAULT_ACCENT)
  let myPalette = $derived(getNotePalette(myAccent, toneShift[$activeUser] ?? 0))
  let composeTone = $derived(
    myPalette[Math.max(0, (NOTE_TONE_KEYS as readonly string[]).indexOf(newNote.color))]
  )

  function toneOf(note: Note): NoteTone {
    return resolveNoteTone(note.createdBy, note.color, $userPreferences, toneShift)
  }

  function swatchBg(tone: NoteTone): string {
    return isDark ? tone.bgDark : tone.bgLight
  }

  function noteVars(tone: NoteTone): string {
    const bg = isDark ? tone.bgDark : tone.bgLight
    const ink = isDark ? tone.inkDark : tone.inkLight
    return `--note-bg:${bg};--note-ink:${ink};--note-tack:${tone.tack};`
  }

  function signatureFor(userId: UserId): string {
    return ($userPreferences[userId]?.noteSignature ?? '').trim()
  }

  // Deterministic rotation based on note id - slight tilt for realism
  function getNoteRotation(noteId: string | undefined): number {
    if (!noteId) return 0
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
      newNote = { title: '', content: '', color: 't0' }
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

  function resetFilters(): void {
    searchText = ''
    authorFilter = 'all'
    unreadOnly = false
    sortMode = 'newest'
  }

  let activeFilterCount = $derived(
    (authorFilter !== 'all' ? 1 : 0) + (unreadOnly ? 1 : 0) + (searchText.trim() ? 1 : 0) + (sortMode !== 'newest' ? 1 : 0)
  )

  // Board notes: filtered + sorted, pinned first
  let boardNotes = $derived.by(() => {
    const q = searchText.trim().toLowerCase()
    let list = notes.filter(n => !n.archived)
    if (authorFilter !== 'all') list = list.filter(n => n.createdBy === authorFilter)
    if (unreadOnly) list = list.filter(n => !n.read && n.createdBy !== $activeUser)
    if (q) list = list.filter(n =>
      (n.title ?? '').toLowerCase().includes(q) || (n.content ?? '').toLowerCase().includes(q)
    )
    return [...list].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      if (sortMode === 'author' && a.createdBy !== b.createdBy) {
        return a.createdBy < b.createdBy ? -1 : 1
      }
      const ta = a.createdAt?.toMillis?.() ?? 0
      const tb = b.createdAt?.toMillis?.() ?? 0
      return sortMode === 'oldest' ? ta - tb : tb - ta
    })
  })

  let totalBoardCount = $derived(notes.filter(n => !n.archived).length)
  let archivedNotes = $derived(notes.filter(n => n.archived))

  // Unread count from other user
  let unreadCount = $derived(
    notes.filter(n => n.createdBy === otherUserId && !n.read && !n.archived).length
  )

  const authorChips: Array<{ value: 'all' | UserId; label: string }> = [
    { value: 'all', label: 'Everyone' },
    { value: 'Z', label: 'Z' },
    { value: 'T', label: 'T' },
  ]
</script>

<!-- Full-bleed cork backdrop (fixed behind the page content) -->
<div class="cork-backdrop" aria-hidden="true"></div>

<div class="corkboard-page">
  <!-- Wooden control rail — the board's "tack & pen bin" -->
  <div class="cork-rail">
    <div class="flex items-center gap-2.5 min-w-0">
      <div class="corkboard-pin-icon">
        <Pin size={16} />
      </div>
      <div class="min-w-0">
        <h1 class="cork-title">Our Board</h1>
        <p class="cork-subtitle">
          {#if activeView === 'corkboard'}
            {boardNotes.length}{boardNotes.length !== totalBoardCount ? `/${totalBoardCount}` : ''} note{totalBoardCount === 1 ? '' : 's'}
          {:else}
            {archivedNotes.length} archived
          {/if}
        </p>
      </div>
    </div>

    <div class="flex items-center gap-1.5">
      {#if unreadCount > 0 && activeView === 'corkboard'}
        <span class="unread-bubble">{unreadCount} new</span>
      {/if}

      {#if activeView === 'corkboard'}
        <button
          type="button"
          class="rail-btn {showFilters || activeFilterCount > 0 ? 'is-active' : ''}"
          onclick={() => { showFilters = !showFilters; hapticLight(); }}
          aria-label="Filter and sort"
          aria-pressed={showFilters}
        >
          <SlidersHorizontal size={16} />
          {#if activeFilterCount > 0}<span class="rail-badge">{activeFilterCount}</span>{/if}
        </button>
      {/if}

      <button
        type="button"
        class="rail-btn {activeView === 'archive' ? 'is-active' : ''}"
        onclick={() => { activeView = activeView === 'corkboard' ? 'archive' : 'corkboard'; hapticLight(); }}
        aria-label={activeView === 'archive' ? 'Back to board' : 'Open archive'}
      >
        {#if activeView === 'archive'}
          <StickyNote size={16} />
        {:else}
          <Archive size={16} />
          {#if archivedNotes.length > 0}<span class="rail-badge">{archivedNotes.length}</span>{/if}
        {/if}
      </button>

      {#if activeView === 'corkboard'}
        <button
          type="button"
          class="rail-pen"
          onclick={() => { composing = !composing; hapticLight(); }}
          aria-label="Write a note"
        >
          <Pencil size={15} />
          <span class="hidden sm:inline">Write</span>
        </button>
      {/if}
    </div>
  </div>

  <!-- Filter / sort tray -->
  {#if activeView === 'corkboard' && showFilters}
    <div class="filter-tray">
      <div class="relative flex-1 min-w-[10rem]">
        <Search size={15} class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="search"
          placeholder="Search notes…"
          class="tray-input pl-9"
          bind:value={searchText}
        />
      </div>

      <div class="tray-chips" role="group" aria-label="Filter by author">
        {#each authorChips as chip}
          <button
            type="button"
            class="tray-chip {authorFilter === chip.value ? 'is-on' : ''}"
            onclick={() => { authorFilter = chip.value; hapticLight(); }}
          >{chip.label}</button>
        {/each}
      </div>

      <button
        type="button"
        class="tray-chip {unreadOnly ? 'is-on' : ''}"
        onclick={() => { unreadOnly = !unreadOnly; hapticLight(); }}
      >Unread</button>

      <label class="tray-sort">
        <ArrowUpDown size={14} class="text-slate-400" />
        <select bind:value={sortMode} aria-label="Sort notes">
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="author">By author</option>
        </select>
      </label>

      {#if activeFilterCount > 0}
        <button type="button" class="tray-clear" onclick={resetFilters}>Clear</button>
      {/if}
    </div>
  {/if}

  {#if activeView === 'corkboard'}
    <div class="notes-board">
      <!-- Compose sticky inline -->
      {#if composing}
        <div class="compose-sticky" style={noteVars(composeTone)}>
          <div class="sticky-top-tape"></div>
          <div class="p-4 pt-5 space-y-2">
            <div class="flex items-center justify-between mb-1">
              <span class="compose-eyebrow">New note · {$displayNames[$activeUser]}</span>
              <button
                type="button"
                class="compose-x"
                onclick={() => { composing = false; newNote = { title: '', content: '', color: 't0' }; }}
                aria-label="Discard"
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
              placeholder="Write something for {$displayNames[otherUserId]}…"
              rows="4"
              class="sticky-input resize-none text-sm leading-relaxed"
              bind:value={newNote.content}
            ></textarea>

            <!-- Tone picker (author's palette) -->
            <div class="flex items-center gap-2 pt-1">
              <span class="compose-eyebrow">Tone</span>
              <div class="flex gap-1.5">
                {#each NOTE_TONE_KEYS as key, i}
                  <button
                    type="button"
                    class="touch-sm color-swatch {newNote.color === key ? 'is-selected' : ''}"
                    style="background:{swatchBg(myPalette[i])}"
                    onclick={() => newNote.color = key}
                    aria-label="Tone {i + 1}"
                  ></button>
                {/each}
              </div>
            </div>

            <div class="flex justify-end pt-1">
              <button type="button" class="pin-btn" onclick={addNote}>
                <Pin size={14} />
                Pin it
              </button>
            </div>
          </div>
        </div>
      {/if}

      {#if boardNotes.length === 0 && !composing}
        <div class="cork-empty">
          <EmptyState
            icon={StickyNote}
            title={activeFilterCount > 0 ? 'No notes match' : 'The board is empty'}
            description={activeFilterCount > 0 ? 'Try clearing the filters.' : `Pin your first note for ${$displayNames[otherUserId]}`}
          />
        </div>
      {:else}
        <div class="notes-masonry">
          {#each boardNotes as note (note.id)}
            {@const isUnread = !note.read && note.createdBy !== $activeUser}
            {@const rot = getNoteRotation(note.id)}
            {@const sig = signatureFor(note.createdBy)}
            <div
              class="sticky-note {note.pinned ? 'is-pinned' : ''} {isUnread ? 'is-unread' : ''}"
              style="{noteVars(toneOf(note))}--rot:{rot}deg"
              onclick={() => openNoteDetail(note)}
              role="button"
              tabindex="0"
              onkeydown={(e) => e.key === 'Enter' && openNoteDetail(note)}
            >
              <div class="thumbtack {note.pinned ? 'thumbtack-pinned' : ''}">
                <div class="thumbtack-head"></div>
                <div class="thumbtack-stem"></div>
              </div>

              {#if isUnread}
                <div class="unread-dot"></div>
              {/if}

              <div class="sticky-body">
                {#if note.title}
                  <h3 class="sticky-title">{note.title}</h3>
                {/if}
                {#if note.content}
                  <p class="sticky-content">{note.content}</p>
                {/if}
                {#if note.photos?.length}
                  <div class="sticky-photos">
                    <ImageIcon size={12} />
                    <span>{note.photos.length} photo{note.photos.length === 1 ? '' : 's'}</span>
                  </div>
                {/if}
                {#if sig}
                  <p class="sticky-sign">{sig}</p>
                {/if}
              </div>

              <div class="sticky-footer">
                <span class="sticky-author">
                  {note.createdBy === $activeUser ? 'You' : getDisplayNameForUser(note.createdBy)}
                </span>
                <span class="sticky-time">{getRelativeTime(note.createdAt)}</span>
              </div>

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
      {#if archivedNotes.length === 0}
        <EmptyState
          icon={Archive}
          title="Archive is empty"
          description="Archived notes will appear here"
        />
      {:else}
        <div class="flex flex-col gap-3">
          {#each archivedNotes as note (note.id)}
            {@const tone = toneOf(note)}
            <div
              class="archive-card"
              onclick={() => openNoteDetail(note)}
              role="button"
              tabindex="0"
              onkeydown={(e) => e.key === 'Enter' && openNoteDetail(note)}
            >
              <div class="flex items-start justify-between gap-3">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1">
                    <div class="w-2.5 h-2.5 rounded-full shrink-0" style="background:{tone.tack}"></div>
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
      {@const tone = toneOf(selectedNote)}
      <div class="relative modal-note-header p-6 shrink-0" style={noteVars(tone)}>
        <button
          class="absolute top-2 right-2 w-11 h-11 rounded-full bg-black/10 flex items-center justify-center hover:bg-black/20 transition-colors touch-manipulation"
          onclick={closeNoteDetail}
          aria-label="Close"
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

      {#if signatureFor(selectedNote.createdBy)}
        <p class="detail-sign">{signatureFor(selectedNote.createdBy)}</p>
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
          aria-label="Delete note"
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

      <!-- Tone picker -->
      <div class="flex items-center gap-3">
        <span class="text-sm text-slate-500">Tone:</span>
        <div class="flex gap-2">
          {#each NOTE_TONE_KEYS as key, i}
            <button
              type="button"
              class="touch-sm color-swatch-lg {editingNote.color === key ? 'is-selected' : ''}"
              style="background:{swatchBg(myPalette[i])}"
              onclick={() => { if (editingNote) editingNote.color = key }}
              aria-label="Tone {i + 1}"
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
  /* ===== CORK BACKDROP (full-bleed page background) ===== */
  .cork-backdrop {
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    background:
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.09'/%3E%3C/svg%3E"),
      radial-gradient(120% 120% at 50% 0%, #d4b895 0%, #c8a882 55%, #b9986f 100%);
    box-shadow: inset 0 8px 24px rgba(0,0,0,0.18);
  }

  :global(.dark) .cork-backdrop {
    background:
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.13'/%3E%3C/svg%3E"),
      radial-gradient(120% 120% at 50% 0%, #8a6a44 0%, #7a5c3a 55%, #654b30 100%);
    box-shadow: inset 0 8px 30px rgba(0,0,0,0.4);
  }

  .corkboard-page {
    position: relative;
    z-index: 1;
    min-height: calc(100vh - 6rem);
  }

  /* ===== WOODEN CONTROL RAIL ===== */
  .cork-rail {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.6rem 0.85rem;
    border-radius: 0.9rem;
    background: linear-gradient(180deg, #9a7b4f 0%, #86683f 100%);
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,0.18),
      inset 0 -2px 4px rgba(0,0,0,0.25),
      0 3px 8px rgba(0,0,0,0.25);
    margin-bottom: 0.85rem;
  }

  .corkboard-pin-icon {
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    background: var(--color-accent);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 1px 3px rgba(0,0,0,0.4);
    flex-shrink: 0;
  }

  .cork-title {
    font-size: 1rem;
    font-weight: 800;
    line-height: 1.1;
    color: #fdf6e9;
    text-shadow: 0 1px 1px rgba(0,0,0,0.35);
  }

  .cork-subtitle {
    font-size: 0.7rem;
    color: rgba(253,246,233,0.75);
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

  /* Rail buttons (brass tacks in the bin) */
  .rail-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 2.2rem;
    height: 2.2rem;
    padding: 0 0.5rem;
    border-radius: 0.6rem;
    color: #fdf6e9;
    background: rgba(255,255,255,0.1);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.15);
    transition: background 120ms;
  }
  .rail-btn:hover { background: rgba(255,255,255,0.2); }
  .rail-btn.is-active { background: var(--color-accent); }

  .rail-badge {
    margin-left: 0.3rem;
    font-size: 0.65rem;
    font-weight: 700;
    background: rgba(0,0,0,0.25);
    padding: 0.05rem 0.35rem;
    border-radius: 999px;
  }

  .rail-pen {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    height: 2.2rem;
    padding: 0 0.75rem;
    border-radius: 0.6rem;
    font-size: 0.8rem;
    font-weight: 700;
    color: white;
    background: var(--color-accent);
    box-shadow: 0 2px 5px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.25);
    transition: filter 120ms;
  }
  .rail-pen:hover { filter: brightness(1.08); }

  /* ===== FILTER TRAY ===== */
  .filter-tray {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 0.7rem;
    margin-bottom: 0.85rem;
    border-radius: 0.85rem;
    background: rgba(255,255,255,0.82);
    backdrop-filter: blur(4px);
    box-shadow: 0 2px 8px rgba(0,0,0,0.12);
  }
  :global(.dark) .filter-tray {
    background: rgba(30,26,22,0.8);
  }

  .tray-input {
    width: 100%;
    height: 2.25rem;
    padding: 0 0.75rem;
    border-radius: 0.6rem;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text);
    font-size: 0.85rem;
    outline: none;
  }
  .tray-input:focus { border-color: var(--color-accent); }

  .tray-chips { display: inline-flex; gap: 0.25rem; }

  .tray-chip {
    height: 2.25rem;
    padding: 0 0.7rem;
    border-radius: 0.6rem;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--color-text-muted, #57534e);
    background: var(--color-surface-2);
    transition: background 120ms, color 120ms;
  }
  .tray-chip.is-on {
    background: var(--color-accent);
    color: white;
  }

  .tray-sort {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    height: 2.25rem;
    padding: 0 0.6rem;
    border-radius: 0.6rem;
    background: var(--color-surface-2);
  }
  .tray-sort select {
    background: transparent;
    border: none;
    outline: none;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--color-text);
  }

  .tray-clear {
    height: 2.25rem;
    padding: 0 0.6rem;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--color-accent);
  }

  /* ===== BOARD ===== */
  .notes-board {
    padding: 0.25rem 0.15rem 1rem;
    min-height: 20rem;
  }

  .cork-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 20rem;
    background: rgba(255,255,255,0.35);
    border-radius: 1rem;
  }
  :global(.dark) .cork-empty {
    background: rgba(0,0,0,0.2);
  }

  .notes-masonry {
    columns: 2;
    column-gap: 0.75rem;
  }
  @media (min-width: 640px) { .notes-masonry { columns: 3; } }
  @media (min-width: 900px) { .notes-masonry { columns: 4; } }

  /* ===== STICKY NOTE ===== */
  .sticky-note {
    break-inside: avoid;
    position: relative;
    margin-bottom: 0.75rem;
    border-radius: 2px;
    padding: 0.875rem 0.875rem 0.6rem;
    cursor: pointer;
    background: var(--note-bg, #fef08a);
    color: var(--note-ink, #1c1917);
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
    background: radial-gradient(circle at 35% 35%, rgba(255,255,255,0.75), var(--note-tack, #6366f1));
  }
  .thumbtack-stem {
    width: 2px;
    height: 5px;
    background: #9ca3af;
    border-radius: 0 0 1px 1px;
  }

  .sticky-body { margin-top: 0.5rem; min-height: 2.5rem; }

  .sticky-title {
    font-weight: 700;
    font-size: 0.875rem;
    line-height: 1.3;
    color: var(--note-ink);
    opacity: 0.92;
    margin-bottom: 0.3rem;
    word-break: break-word;
  }

  .sticky-content {
    font-size: 0.8rem;
    line-height: 1.45;
    color: var(--note-ink);
    opacity: 0.78;
    white-space: pre-wrap;
    word-break: break-word;
    display: -webkit-box;
    -webkit-line-clamp: 6;
    line-clamp: 6;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .sticky-photos {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    margin-top: 0.5rem;
    font-size: 0.7rem;
    color: var(--note-ink);
    opacity: 0.6;
  }

  .sticky-sign {
    margin-top: 0.5rem;
    font-style: italic;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--note-tack);
    opacity: 0.85;
    word-break: break-word;
  }

  .sticky-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 0.6rem;
    padding-top: 0.4rem;
    border-top: 1px solid rgba(120,110,90,0.22);
  }

  .sticky-author {
    font-size: 0.65rem;
    font-weight: 700;
    color: var(--note-ink);
    opacity: 0.55;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .sticky-time {
    font-size: 0.65rem;
    color: var(--note-ink);
    opacity: 0.42;
  }

  /* Hover action tray */
  .sticky-actions {
    position: absolute;
    bottom: -2.2rem;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 0.25rem;
    background: var(--color-surface);
    border-radius: 999px;
    padding: 0.25rem 0.5rem;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
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
    .sticky-actions { display: none; }
  }

  .sticky-action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.9rem;
    height: 1.9rem;
    border-radius: 50%;
    color: var(--color-text-muted, #64748b);
    transition: color 100ms, background 100ms;
  }
  .sticky-action-btn:hover {
    color: var(--color-text, #1e293b);
    background: var(--color-surface-2);
  }

  /* ===== COMPOSE STICKY ===== */
  .compose-sticky {
    position: relative;
    margin-bottom: 1rem;
    border-radius: 2px;
    background: var(--note-bg);
    color: var(--note-ink);
    box-shadow: 3px 4px 14px rgba(0,0,0,0.24);
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

  .compose-eyebrow {
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--note-ink);
    opacity: 0.55;
  }

  .compose-x {
    color: var(--note-ink);
    opacity: 0.5;
    transition: opacity 120ms;
  }
  .compose-x:hover { opacity: 0.85; }

  .sticky-input {
    width: 100%;
    background: transparent;
    border: none;
    outline: none;
    color: var(--note-ink);
    font-family: inherit;
  }
  .sticky-input::placeholder {
    color: var(--note-ink);
    opacity: 0.4;
  }

  .pin-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.8rem;
    font-weight: 700;
    padding: 0.4rem 0.9rem;
    border-radius: 999px;
    background: var(--note-tack);
    color: white;
    box-shadow: 0 1px 3px rgba(0,0,0,0.25);
    transition: filter 150ms;
  }
  .pin-btn:hover { filter: brightness(1.08); }

  .color-swatch {
    width: 1.2rem;
    height: 1.2rem;
    border-radius: 50%;
    border: 1.5px solid rgba(0,0,0,0.18);
    cursor: pointer;
    transition: transform 100ms;
  }
  .color-swatch:hover { transform: scale(1.2); }
  .color-swatch.is-selected {
    outline: 2px solid var(--note-ink);
    outline-offset: 1px;
  }

  .color-swatch-lg {
    width: 1.7rem;
    height: 1.7rem;
    border-radius: 50%;
    border: 1.5px solid rgba(0,0,0,0.14);
    cursor: pointer;
    transition: transform 100ms;
  }
  .color-swatch-lg:hover { transform: scale(1.15); }
  .color-swatch-lg.is-selected {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  /* Modal note header */
  .modal-note-header {
    background: var(--note-bg);
    color: var(--note-ink);
  }

  .detail-sign {
    font-style: italic;
    font-weight: 600;
    color: var(--color-accent);
    opacity: 0.9;
  }

  /* Archive view */
  .archive-view {
    padding: 0.25rem 0.15rem 1rem;
    max-width: 42rem;
    margin: 0 auto;
  }

  .archive-card {
    padding: 1rem;
    border-radius: 0.85rem;
    background: rgba(255,255,255,0.9);
    box-shadow: 0 2px 6px rgba(0,0,0,0.12);
    cursor: pointer;
    transition: box-shadow 150ms;
  }
  .archive-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.18); }
  :global(.dark) .archive-card {
    background: rgba(30,26,22,0.85);
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

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
  import { readableInk, ensureReadable } from '$lib/color'
  import { DEFAULT_ACCENT } from '$lib/accents'
  import type { Note, NoteColor, UserId } from '$lib/types'
  import { Timestamp, type Timestamp as TimestampType } from 'firebase/firestore'
  import { Archive, ArchiveRestore, Check, CheckCheck, Image as ImageIcon, Pencil, Pin, Reply, Search, SlidersHorizontal, ArrowUpDown, StickyNote, Trash2, X, Link2, Unlink, Layers } from 'lucide-svelte'
  import { onMount } from 'svelte'
  import { toast } from 'svelte-sonner'

  const REACTION_EMOJIS = ['❤️', '😂', '👍', '🔥', '😮', '🥰', '😢']
  type BoardView = 'new' | 'all'

  let notes = $state<Note[]>([])
  let unsubscribe: (() => void) | undefined
  let selectedNote = $state<Note | null>(null)
  let editingNote = $state<Note | null>(null)

  // Compose form state
  let composing = $state(false)
  let newNote = $state({ title: '', content: '', color: 't0' as NoteColor, customColor: '' })
  // When replying, the new note is linked into a thread.
  let replyContext = $state<{ threadId: string; replyTo: string; toName: string } | null>(null)

  // View: 'corkboard' | 'archive'
  type ViewKey = 'corkboard' | 'archive'
  let activeView = $state<ViewKey>('corkboard')

  // Board view: 'new' (only unread from the other user) vs 'all'. Persisted per
  // session; defaults to 'new' so you land on what's fresh.
  let boardView = $state<BoardView>('new')

  // Thread view (a stack expanded) + long-press context menu + multi-select
  let threadRootId = $state<string | null>(null)
  // A stack unstacked in-place on the board (yarn-linked linear view).
  let expandedStackKey = $state<string | null>(null)
  let contextFor = $state<Note | null>(null)
  // Screen rect of the long-pressed note, so the menu anchors to it and the
  // note can "pop out" above the dimmed backdrop.
  let contextRect = $state<{ left: number; top: number; width: number; height: number } | null>(null)
  let selectMode = $state(false)
  let selectedIds = $state<Set<string>>(new Set())

  // How notes are grouped into stacks on the board. "custom" honours the manual
  // reply-thread links; the others are non-destructive views over the same notes.
  type StackView = 'custom' | 'day' | 'week' | 'month' | 'year' | 'similar'
  let stackView = $state<StackView>('custom')
  const STACK_VIEWS: Array<{ key: StackView; label: string }> = [
    { key: 'custom', label: 'My stacks' },
    { key: 'day', label: 'Day' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
    { key: 'year', label: 'Year' },
    { key: 'similar', label: 'Similar' },
  ]

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

  function noteVars(tone: NoteTone, customColor?: string): string {
    const custom = customColor?.trim()
    const bg = custom || (isDark ? tone.bgDark : tone.bgLight)
    const ink = custom ? readableInk(custom) : (isDark ? tone.inkDark : tone.inkLight)
    const tack = custom || tone.tack
    // The signature is drawn in the tack colour, but a custom paper colour (or a
    // tone whose tack sits close to the paper) can make it illegible — so recolor
    // it to guarantee contrast against this note's background.
    const sign = ensureReadable(tack, bg, 3.2)
    return `--note-bg:${bg};--note-ink:${ink};--note-tack:${tack};--note-sign:${sign};`
  }

  // Full inline style for a board note: colour + tilt + horizontal/vertical
  // jitter (to break the rigid-column illusion of a masonry).
  function noteStyle(note: Note): string {
    return `${noteVars(toneOf(note), note.customColor)}`
      + `--rot:${getNoteRotation(note.id)}deg;`
      + `--jy:${getNoteJitter(note.id)}rem;`
      + `--jx:${getNoteJitterX(note.id)}rem`
  }

  // A small string hash used for deterministic jitter/sizing.
  function hashOf(noteId: string | undefined, seed: number): number {
    if (!noteId) return 0
    let hash = seed
    for (let i = 0; i < noteId.length; i++) hash = (hash * 31 + noteId.charCodeAt(i)) & 0xffffffff
    return hash >>> 0
  }

  // Deterministic small top margin so notes don't align across rows.
  function getNoteJitter(noteId: string | undefined): number {
    return (hashOf(noteId, 17) % 5) * 0.35 // 0 .. 1.4rem
  }

  // Deterministic small horizontal nudge (both directions).
  function getNoteJitterX(noteId: string | undefined): number {
    return ((hashOf(noteId, 23) % 7) - 3) * 0.18 // -0.54 .. 0.54rem
  }

  // Size a note to its content so the board reads as varied clippings rather
  // than a uniform grid. Photos and long text get more room.
  function noteSizeClass(note: Note): 'xs' | 's' | 'm' | 'l' {
    const len = (note.title?.trim().length ?? 0) + (note.content?.trim().length ?? 0)
    if (note.photos?.length || len > 240) return 'l'
    if (len > 110) return 'm'
    if (len > 36) return 's'
    return 'xs'
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

    // Restore the per-session board view (defaults to "new").
    try {
      const v = sessionStorage.getItem('notes-board-view')
      if (v === 'new' || v === 'all') boardView = v
      const sv = sessionStorage.getItem('notes-stack-view')
      if (sv && STACK_VIEWS.some(s => s.key === sv)) stackView = sv as StackView
    } catch { /* private mode */ }

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
      const doc: Partial<Note> = {
        type: 'note',
        title: newNote.title,
        content: newNote.content,
        tags: [],
        read: false,
        archived: false,
        color: newNote.color,
      }
      if (newNote.customColor.trim()) doc.customColor = newNote.customColor.trim()
      if (replyContext) {
        doc.threadId = replyContext.threadId
        doc.replyTo = replyContext.replyTo
      }
      await addDocument<Note>('notes', doc as Omit<Note, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>, $activeUser)
      const wasReply = !!replyContext
      newNote = { title: '', content: '', color: 't0', customColor: '' }
      composing = false
      replyContext = null
      hapticSuccess()
      toast.success(wasReply ? 'Reply added' : 'Note pinned to board')
    } catch (e) {
      console.error('Failed to pin note:', e)
      toast.error('Failed to pin note')
    }
  }

  function startReply(note: Note): void {
    if (!note.id) return
    replyContext = {
      threadId: note.threadId ?? note.id,
      replyTo: note.id,
      toName: note.createdBy === $activeUser ? 'yourself' : getDisplayNameForUser(note.createdBy),
    }
    newNote = { title: '', content: '', color: newNote.color, customColor: '' }
    composing = true
    selectedNote = null
    threadRootId = null
  }

  async function saveEditedNote(): Promise<void> {
    if (!editingNote?.id) return
    try {
      await updateDocument<Note>('notes', editingNote.id, {
        title: editingNote.title,
        content: editingNote.content,
        color: editingNote.color,
        customColor: editingNote.customColor?.trim() || ''
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

  // ===== Reactions =====
  async function toggleReaction(note: Note, emoji: string): Promise<void> {
    if (!note.id) return
    hapticLight()
    const reactions: Record<string, UserId[]> = { ...(note.reactions ?? {}) }
    const users = new Set(reactions[emoji] ?? [])
    if (users.has($activeUser)) users.delete($activeUser)
    else users.add($activeUser)
    if (users.size === 0) delete reactions[emoji]
    else reactions[emoji] = [...users]
    await updateDocument<Note>('notes', note.id, { reactions }, $activeUser)
  }
  function reactionEntries(note: Note): Array<[string, UserId[]]> {
    return Object.entries(note.reactions ?? {}).filter(([, u]) => u.length > 0)
  }

  // ===== Long-press → select mode + context menu (mobile home-screen style) =====
  let pressTimer: ReturnType<typeof setTimeout> | null = null
  let longPressed = false
  let pressStartX = 0
  let pressStartY = 0
  function onNotePointerDown(e: PointerEvent, note: Note): void {
    longPressed = false
    pressStartX = e.clientX
    pressStartY = e.clientY
    const el = e.currentTarget as HTMLElement
    if (pressTimer) clearTimeout(pressTimer)
    pressTimer = setTimeout(() => {
      pressTimer = null
      longPressed = true
      hapticMedium()
      // Enter selection (like holding a home-screen icon), select this note,
      // and surface a context menu anchored to the note itself.
      if (!selectMode) selectMode = true
      if (note.id && !selectedIds.has(note.id)) toggleSelected(note.id)
      const r = el.getBoundingClientRect()
      contextRect = { left: r.left, top: r.top, width: r.width, height: r.height }
      contextFor = note
    }, 450)
  }
  // Only cancel the long-press on a real move (finger jitter shouldn't count),
  // otherwise micro-movement lets the browser's own text-select/callout win.
  function onNotePointerMove(e: PointerEvent): void {
    if (pressTimer && Math.hypot(e.clientX - pressStartX, e.clientY - pressStartY) > 10) {
      clearTimeout(pressTimer); pressTimer = null
    }
  }
  function cancelPress(): void {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null }
  }
  function closeContext(): void { contextFor = null; contextRect = null }

  // Anchor the context menu to the pressed note: below it when there's room,
  // otherwise above; left-aligned to the note but clamped into the viewport.
  let contextMenuStyle = $derived.by(() => {
    const r = contextRect
    if (!r || typeof window === 'undefined') return 'left:50%;top:50%;transform:translate(-50%,-50%);width:min(20rem,calc(100vw - 2rem));'
    const vw = window.innerWidth
    const vh = window.innerHeight
    const menuW = Math.min(320, vw - 16)
    const gap = 12
    const left = Math.min(Math.max(8, r.left), vw - menuW - 8)
    const roomBelow = vh - (r.top + r.height)
    const vertical = roomBelow > vh * 0.42
      ? `top:${Math.round(r.top + r.height + gap)}px;`
      : `bottom:${Math.round(vh - r.top + gap)}px;`
    return `left:${Math.round(left)}px;width:${menuW}px;${vertical}`
  })

  // How many notes are in the tapped note's current stack (for "expand thread").
  function stackSizeOf(note: Note): number {
    return notes.filter(n => !n.archived && groupKeyOf(n) === groupKeyOf(note)).length
  }
  // "Expand stack": unstack the linked notes in a linear, yarn-threaded strip
  // laid out on the corkboard itself (not a modal).
  function expandFromContext(note: Note): void {
    contextFor = null
    selectMode = false
    selectedIds = new Set()
    expandedStackKey = groupKeyOf(note)
    markAsRead(note)
  }
  function collapseBoardStack(): void { expandedStackKey = null }

  // ===== Multi-select =====
  function toggleSelectMode(): void {
    selectMode = !selectMode
    selectedIds = new Set()
  }
  function toggleSelected(id: string | undefined): void {
    if (!id) return
    const s = new Set(selectedIds)
    if (s.has(id)) s.delete(id); else s.add(id)
    selectedIds = s
  }
  async function bulkArchive(): Promise<void> {
    hapticLight()
    for (const id of selectedIds) await updateDocument<Note>('notes', id, { archived: true }, $activeUser)
    toast.success(`Archived ${selectedIds.size} note${selectedIds.size === 1 ? '' : 's'}`)
    selectedIds = new Set(); selectMode = false
  }
  async function bulkMarkRead(): Promise<void> {
    for (const id of selectedIds) {
      const n = notes.find(x => x.id === id)
      if (n && !n.read && n.createdBy !== $activeUser) {
        await updateDocument<Note>('notes', id, { read: true, readAt: Timestamp.now() }, $activeUser)
      }
    }
    selectedIds = new Set(); selectMode = false
  }
  function bulkDelete(): void {
    const count = selectedIds.size
    pendingConfirm = {
      message: `Tear up ${count} note${count === 1 ? '' : 's'} permanently?`,
      onConfirm: async () => {
        pendingConfirm = null
        for (const id of selectedIds) await deleteDocument('notes', id)
        toast.success(`Tore up ${count} note${count === 1 ? '' : 's'}`)
        selectedIds = new Set(); selectMode = false
      }
    }
  }

  // ===== Linking / unlinking notes into threads =====
  // Link the selected notes (and every note already sharing their threads) into
  // one thread rooted at the earliest note.
  async function bulkLink(): Promise<void> {
    const faceIds = [...selectedIds]
    if (faceIds.length < 2) return
    const keys = new Set<string>()
    for (const id of faceIds) {
      const n = notes.find(x => x.id === id)
      if (n) keys.add(threadKeyOf(n))
    }
    if (keys.size < 2) { toast('Those notes are already linked'); return }
    const members = notes.filter(n => !n.archived && keys.has(threadKeyOf(n)))
    const root = [...members].sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0))[0]
    const rootKey = root.threadId ?? root.id ?? ''
    if (!rootKey) return
    hapticSuccess()
    for (const m of members) {
      if (m.id === rootKey) continue
      await updateDocument<Note>('notes', m.id!, { threadId: rootKey, replyTo: root.id! }, $activeUser)
    }
    toast.success(`Linked ${members.length} notes into a thread`)
    selectedIds = new Set(); selectMode = false
  }

  // Detach a single note from its thread; it becomes its own standalone note.
  async function unlinkNote(note: Note): Promise<void> {
    if (!note.id) return
    hapticMedium()
    await updateDocument<Note>('notes', note.id, { threadId: note.id, replyTo: '' }, $activeUser)
    toast.success('Note unlinked')
  }

  // Whether a note can be detached from the currently-open thread (not the root).
  // Only meaningful for manual stacks — date/similarity views are virtual.
  function canUnlink(note: Note): boolean {
    if (stackView !== 'custom') return false
    const root = threadNotes[0]
    return !!root && note.id !== root.id && threadNotes.length > 1
  }

  // ===== Board view (new/all) persisted per session =====
  $effect(() => {
    try { sessionStorage.setItem('notes-board-view', boardView) } catch { /* private mode */ }
  })
  $effect(() => {
    try { sessionStorage.setItem('notes-stack-view', stackView) } catch { /* private mode */ }
  })

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
    if (boardView === 'new') list = list.filter(n => !n.read && n.createdBy !== $activeUser)
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

  function threadKeyOf(n: Note): string {
    return n.threadId ?? n.id ?? ''
  }

  // ===== Stack grouping (view-dependent) =====
  function isoWeek(d: Date): number {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    const day = date.getUTCDay() || 7
    date.setUTCDate(date.getUTCDate() + 4 - day)
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
    return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  }
  function dateBucket(n: Note): string {
    const d = n.createdAt?.toDate?.() ?? new Date(0)
    const y = d.getFullYear()
    if (stackView === 'year') return `y:${y}`
    if (stackView === 'month') return `m:${y}-${d.getMonth()}`
    if (stackView === 'week') return `w:${y}-${isoWeek(d)}`
    return `d:${y}-${d.getMonth()}-${d.getDate()}`
  }
  function noteTokens(n: Note): Set<string> {
    const text = `${n.title ?? ''} ${n.content ?? ''}`.toLowerCase()
    return new Set(text.split(/[^a-z0-9]+/).filter(w => w.length > 3))
  }
  // Simplistic greedy similarity clustering: a note joins the first cluster it
  // shares enough significant words with, else it starts its own. Just for fun.
  let similarityKeys = $derived.by(() => {
    const map = new Map<string, string>()
    if (stackView !== 'similar') return map
    const sorted = [...notes.filter(n => !n.archived && n.id)]
      .sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0))
    const clusters: Array<{ key: string; tokens: Set<string> }> = []
    for (const n of sorted) {
      const toks = noteTokens(n)
      let best: { key: string; tokens: Set<string> } | null = null
      let bestScore = 0
      for (const c of clusters) {
        let score = 0
        for (const t of toks) if (c.tokens.has(t)) score++
        if (score > bestScore) { bestScore = score; best = c }
      }
      if (best && bestScore >= 2) {
        map.set(n.id!, best.key)
        for (const t of toks) best.tokens.add(t)
      } else {
        clusters.push({ key: n.id!, tokens: toks })
        map.set(n.id!, n.id!)
      }
    }
    return map
  })
  // The stack a note belongs to under the current view.
  function groupKeyOf(n: Note): string {
    if (stackView === 'custom') return threadKeyOf(n)
    if (stackView === 'similar') return similarityKeys.get(n.id ?? '') ?? n.id ?? ''
    return dateBucket(n)
  }

  // Group the filtered board into stacks; each renders with a face (most recent
  // note), sorted like the flat board.
  let boardThreads = $derived.by(() => {
    const groups = new Map<string, Note[]>()
    for (const n of boardNotes) {
      const key = groupKeyOf(n)
      const arr = groups.get(key)
      if (arr) arr.push(n); else groups.set(key, [n])
    }
    const fullCount = (key: string) => notes.filter(n => !n.archived && groupKeyOf(n) === key).length
    const list = [...groups.entries()].map(([key, ns]) => {
      const face = [...ns].sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))[0]
      return { key, face, count: fullCount(key) }
    })
    return list.sort((a, b) => {
      if (a.face.pinned && !b.face.pinned) return -1
      if (!a.face.pinned && b.face.pinned) return 1
      const ta = a.face.createdAt?.toMillis?.() ?? 0
      const tb = b.face.createdAt?.toMillis?.() ?? 0
      return sortMode === 'oldest' ? ta - tb : tb - ta
    })
  })

  // Notes belonging to the currently-open stack, oldest first.
  let threadNotes = $derived(
    threadRootId
      ? notes.filter(n => !n.archived && groupKeyOf(n) === threadRootId)
          .sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0))
      : []
  )

  // Notes of the stack unstacked on the board (oldest → newest, linear).
  let expandedNotes = $derived(
    expandedStackKey
      ? notes.filter(n => !n.archived && groupKeyOf(n) === expandedStackKey)
          .sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0))
      : []
  )

  let totalBoardCount = $derived(notes.filter(n => !n.archived).length)
  let archivedNotes = $derived(notes.filter(n => n.archived))

  // When a thread stack is tapped: open the thread modal if it has replies,
  // otherwise the single note's detail.
  function openThread(key: string, face: Note): void {
    if (selectMode) { toggleSelected(face.id); return }
    const count = notes.filter(n => !n.archived && groupKeyOf(n) === key).length
    if (count > 1) { threadRootId = key; markAsRead(face) }
    else openNoteDetail(face)
  }

  // Unread count from other user
  let unreadCount = $derived(
    notes.filter(n => n.createdBy === otherUserId && !n.read && !n.archived).length
  )

  const authorChips: Array<{ value: 'all' | UserId; label: string }> = [
    { value: 'all', label: 'Everyone' },
    { value: 'Z', label: 'Z' },
    { value: 'T', label: 'T' },
  ]

  // Optional manual override of the board background colour. When set, it tints
  // the backdrop AND the control surfaces (rail + filter tray) so the whole
  // board reads as one coloured object.
  let corkStyle = $derived.by(() => {
    const c = $currentPreferences?.corkboardColor?.trim()
    if (!c) return ''
    return [
      `--cork-a:${c}`,
      `--cork-b:color-mix(in srgb, ${c} 88%, #000)`,
      `--cork-c:color-mix(in srgb, ${c} 74%, #000)`,
      // Darker framed wood-substitute for the control rail.
      `--cork-rail:linear-gradient(180deg, color-mix(in srgb, ${c} 68%, #241a0e) 0%, color-mix(in srgb, ${c} 52%, #1c140a) 100%)`,
      // Softly tinted tray that still keeps inputs legible.
      `--cork-tray:color-mix(in srgb, ${c} 30%, var(--color-surface))`,
    ].join(';')
  })
</script>

<!-- Full-bleed cork backdrop (fixed behind the page content) -->
<div class="cork-backdrop" style={corkStyle} aria-hidden="true"></div>

<div class="corkboard-page" style={corkStyle}>
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
      {#if activeView === 'corkboard'}
        <div class="view-toggle" role="group" aria-label="Board view">
          <button type="button" class="view-seg {boardView === 'new' ? 'is-on' : ''}" onclick={() => { boardView = 'new'; hapticLight(); }}>
            New{#if unreadCount > 0}<span class="view-badge">{unreadCount}</span>{/if}
          </button>
          <button type="button" class="view-seg {boardView === 'all' ? 'is-on' : ''}" onclick={() => { boardView = 'all'; hapticLight(); }}>All</button>
        </div>

        <button
          type="button"
          class="rail-btn {selectMode ? 'is-active' : ''}"
          onclick={toggleSelectMode}
          aria-label="Select notes"
          aria-pressed={selectMode}
        >
          <CheckCheck size={16} />
        </button>

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

      <label class="tray-sort">
        <Layers size={14} class="text-slate-400" />
        <select bind:value={stackView} aria-label="Stack notes by">
          {#each STACK_VIEWS as sv}
            <option value={sv.key}>{sv.label}</option>
          {/each}
        </select>
      </label>

      {#if activeFilterCount > 0}
        <button type="button" class="tray-clear" onclick={resetFilters}>Clear</button>
      {/if}
    </div>
  {/if}

  {#if activeView === 'corkboard'}
    <div class="notes-board">
      {#if expandedStackKey && expandedNotes.length > 0}
        <!-- Unstacked thread: notes laid out linearly on the board, strung
             together with decorative yarn to show they're linked. -->
        <div class="thread-expanded">
          <div class="thread-expanded-head">
            <button type="button" class="thread-collapse" onclick={collapseBoardStack} aria-label="Collapse stack">
              <X size={16} /><span>Collapse</span>
            </button>
            <span class="thread-expanded-title"><Link2 size={14} /> Linked thread · {expandedNotes.length}</span>
          </div>
          <div class="thread-strip">
            {#each expandedNotes as n, i (n.id)}
              {@const tone = toneOf(n)}
              {@const sig = signatureFor(n.createdBy)}
              <div
                class="strip-note {i === 0 ? 'is-first' : ''} {i === expandedNotes.length - 1 ? 'is-last' : ''}"
                style={noteVars(tone, n.customColor)}
                role="button"
                tabindex="0"
                onclick={() => openNoteDetail(n)}
                onkeydown={(e) => e.key === 'Enter' && openNoteDetail(n)}
              >
                <span class="yarn-knot" aria-hidden="true"></span>
                <div class="strip-order">{i + 1}</div>
                {#if n.title}<h3 class="strip-title">{n.title}</h3>{/if}
                {#if n.content}<p class="strip-content">{n.content}</p>{/if}
                {#if sig}<p class="strip-sign">{sig}</p>{/if}
                <div class="strip-foot">
                  <span>{n.createdBy === $activeUser ? 'You' : getDisplayNameForUser(n.createdBy)}</span>
                  <span>{getRelativeTime(n.createdAt)}</span>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {:else}
      <!-- Compose sticky inline -->
      {#if composing}
        <div class="compose-sticky" style={noteVars(composeTone, newNote.customColor)}>
          <div class="sticky-top-tape"></div>
          <div class="p-4 pt-5 space-y-2">
            <div class="flex items-center justify-between mb-1">
              <span class="compose-eyebrow">
                {#if replyContext}Replying to {replyContext.toName}{:else}New note · {$displayNames[$activeUser]}{/if}
              </span>
              <button
                type="button"
                class="compose-x"
                onclick={() => { composing = false; replyContext = null; newNote = { title: '', content: '', color: 't0', customColor: '' }; }}
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

            <!-- Tone picker (author's palette) + custom color -->
            <div class="flex items-center gap-2 pt-1 flex-wrap">
              <span class="compose-eyebrow">Tone</span>
              <div class="flex gap-1.5 items-center">
                {#each NOTE_TONE_KEYS as key, i}
                  <button
                    type="button"
                    class="touch-sm color-swatch {newNote.color === key && !newNote.customColor ? 'is-selected' : ''}"
                    style="background:{swatchBg(myPalette[i])}"
                    onclick={() => { newNote.color = key; newNote.customColor = ''; }}
                    aria-label="Tone {i + 1}"
                  ></button>
                {/each}
                <label class="custom-swatch {newNote.customColor ? 'is-selected' : ''}" style={newNote.customColor ? `background:${newNote.customColor}` : ''} aria-label="Custom color">
                  <input type="color" class="sr-only" value={newNote.customColor || swatchBg(composeTone)} oninput={(e) => newNote.customColor = (e.currentTarget as HTMLInputElement).value} />
                  {#if !newNote.customColor}<Pencil size={11} />{/if}
                </label>
              </div>
            </div>

            <div class="flex justify-end pt-1">
              <button type="button" class="pin-btn" onclick={addNote}>
                {#if replyContext}<Reply size={14} />Reply{:else}<Pin size={14} />Pin it{/if}
              </button>
            </div>
          </div>
        </div>
      {/if}

      {#if boardThreads.length === 0 && !composing}
        <div class="cork-empty">
          {#if boardView === 'new'}
            <EmptyState
              icon={Check}
              title="All caught up"
              description="No new notes from {$displayNames[otherUserId]}."
              actionLabel="Show the whole board"
              onAction={() => { boardView = 'all'; hapticLight(); }}
            />
          {:else}
            <EmptyState
              icon={StickyNote}
              title={activeFilterCount > 0 ? 'No notes match' : 'The board is empty'}
              description={activeFilterCount > 0 ? 'Try clearing the filters.' : `Pin your first note for ${$displayNames[otherUserId]}`}
            />
          {/if}
        </div>
      {:else}
        <div class="notes-masonry">
          {#each boardThreads as thread (thread.key)}
            {@const note = thread.face}
            {@const isUnread = !note.read && note.createdBy !== $activeUser}
            {@const sig = signatureFor(note.createdBy)}
            {@const selected = selectMode && !!note.id && selectedIds.has(note.id)}
            {@const reacts = reactionEntries(note)}
            <div
              class="sticky-note note-{noteSizeClass(note)} {note.pinned ? 'is-pinned' : ''} {isUnread ? 'is-unread' : ''} {thread.count > 1 ? 'is-stack' : ''} {selected ? 'is-selected-note' : ''}"
              style={noteStyle(note)}
              onclick={() => { if (longPressed) { longPressed = false; return } openThread(thread.key, note) }}
              role="button"
              tabindex="0"
              onkeydown={(e) => e.key === 'Enter' && openThread(thread.key, note)}
              onpointerdown={(e) => onNotePointerDown(e, note)}
              onpointerup={cancelPress}
              onpointermove={onNotePointerMove}
              onpointerleave={cancelPress}
              oncontextmenu={(e) => e.preventDefault()}
            >
              {#if thread.count > 1}
                <div class="stack-layer stack-layer-2"></div>
                <div class="stack-layer stack-layer-1"></div>
              {/if}

              <div class="thumbtack {note.pinned ? 'thumbtack-pinned' : ''}">
                <div class="thumbtack-head"></div>
                <div class="thumbtack-stem"></div>
              </div>

              {#if selectMode}
                <div class="select-check {selected ? 'is-on' : ''}">
                  {#if selected}<Check size={13} />{/if}
                </div>
              {:else if isUnread}
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

              {#if reacts.length}
                <div class="note-reactions">
                  {#each reacts as [emoji, users] (emoji)}
                    <span class="react-chip {users.includes($activeUser) ? 'is-mine' : ''}">{emoji}{#if users.length > 1}<span class="react-n">{users.length}</span>{/if}</span>
                  {/each}
                </div>
              {/if}

              <div class="sticky-footer">
                <span class="sticky-author">
                  {#if thread.count > 1}<Reply size={11} /> {thread.count} · {/if}
                  {note.createdBy === $activeUser ? 'You' : getDisplayNameForUser(note.createdBy)}
                </span>
                <span class="sticky-time">{getRelativeTime(note.createdAt)}</span>
              </div>

              <div class="sticky-actions" role="none" onclick={(e) => e.stopPropagation()}>
                <button type="button" class="sticky-action-btn" onclick={() => startReply(note)} aria-label="Reply" title="Reply">
                  <Reply size={13} />
                </button>
                <button type="button" class="sticky-action-btn" onclick={() => togglePin(note)} aria-label={note.pinned ? 'Unpin' : 'Pin'} title={note.pinned ? 'Unpin' : 'Pin to top'}>
                  <Pin size={13} class={note.pinned ? 'text-accent' : ''} />
                </button>
                <button type="button" class="sticky-action-btn" onclick={() => toggleArchive(note)} aria-label="Archive" title="Archive">
                  <Archive size={13} />
                </button>
                {#if note.createdBy === $activeUser}
                  <button type="button" class="sticky-action-btn" onclick={() => startEditing(note)} aria-label="Edit" title="Edit">
                    <Pencil size={13} />
                  </button>
                {/if}
                <button type="button" class="sticky-action-btn hover:text-red-500" onclick={() => note.id && removeNote(note.id)} aria-label="Delete" title="Delete">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
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

<!-- Note Detail Modal — stacks above the thread modal when opened from a stack -->
<Modal open={!!selectedNote} onclose={closeNoteDetail} title={selectedNote?.title || 'Note'} zIndex={60}>
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

      <button type="button" class="btn-primary w-full text-sm" onclick={() => selectedNote && startReply(selectedNote)}>
        <Reply size={16} />
        Reply
      </button>

      <!-- Reactions -->
      <div class="flex flex-wrap items-center gap-1.5">
        {#each REACTION_EMOJIS as emoji (emoji)}
          {@const users = selectedNote.reactions?.[emoji] ?? []}
          <button
            type="button"
            class="react-pick {users.includes($activeUser) ? 'is-mine' : ''}"
            onclick={() => selectedNote && toggleReaction(selectedNote, emoji)}
          >{emoji}{#if users.length}<span class="react-n">{users.length}</span>{/if}</button>
        {/each}
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

      <!-- Tone picker + custom color -->
      <div class="flex items-center gap-3 flex-wrap">
        <span class="text-sm text-slate-500">Tone:</span>
        <div class="flex gap-2 items-center">
          {#each NOTE_TONE_KEYS as key, i}
            <button
              type="button"
              class="touch-sm color-swatch-lg {editingNote.color === key && !editingNote.customColor ? 'is-selected' : ''}"
              style="background:{swatchBg(myPalette[i])}"
              onclick={() => { if (editingNote) { editingNote.color = key; editingNote.customColor = '' } }}
              aria-label="Tone {i + 1}"
            ></button>
          {/each}
          <label class="custom-swatch-lg {editingNote.customColor ? 'is-selected' : ''}" style={editingNote.customColor ? `background:${editingNote.customColor}` : ''} aria-label="Custom color">
            <input type="color" class="sr-only" value={editingNote.customColor || '#e11d48'} oninput={(e) => { if (editingNote) editingNote.customColor = (e.currentTarget as HTMLInputElement).value }} />
            {#if !editingNote.customColor}<Pencil size={13} />{/if}
          </label>
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

<!-- Long-press reaction menu -->
{#if contextFor}
  {@const cf = contextFor}
  <button type="button" class="reaction-backdrop" onclick={closeContext} aria-label="Close menu"></button>
  {#if contextRect}
    <!-- The pressed note, lifted above the dim so the menu clearly belongs to it. -->
    <div
      class="context-lift"
      style="left:{contextRect.left}px;top:{contextRect.top}px;width:{contextRect.width}px;{noteVars(toneOf(cf), cf.customColor)}"
      aria-hidden="true"
    >
      {#if cf.title}<h3 class="lift-title">{cf.title}</h3>{/if}
      {#if cf.content}<p class="lift-content">{cf.content}</p>{/if}
    </div>
  {/if}
  <div class="context-menu" style={contextMenuStyle} role="menu">
    <!-- Reactions -->
    <div class="context-reacts">
      {#each REACTION_EMOJIS as emoji (emoji)}
        {@const mine = (cf.reactions?.[emoji] ?? []).includes($activeUser)}
        <button type="button" class="react-emoji {mine ? 'is-mine' : ''}" onclick={() => toggleReaction(cf, emoji)}>{emoji}</button>
      {/each}
    </div>
    <div class="context-actions">
      {#if stackSizeOf(cf) > 1}
        <button type="button" class="context-btn context-yarn" onclick={() => expandFromContext(cf)}>
          <Layers size={16} /><span>Expand stack</span><span class="yarn-badge">{stackSizeOf(cf)}</span>
        </button>
      {/if}
      <button type="button" class="context-btn" onclick={() => { closeContext(); selectMode = false; selectedIds = new Set(); startReply(cf) }}>
        <Reply size={16} /><span>Reply</span>
      </button>
      <button type="button" class="context-btn" onclick={() => { togglePin(cf); closeContext() }}>
        <Pin size={16} class={cf.pinned ? 'text-accent' : ''} /><span>{cf.pinned ? 'Unpin' : 'Pin'}</span>
      </button>
      <button type="button" class="context-btn" onclick={() => { toggleArchive(cf); closeContext() }}>
        <Archive size={16} /><span>Archive</span>
      </button>
      <button type="button" class="context-btn context-danger" onclick={() => { closeContext(); cf.id && removeNote(cf.id) }}>
        <Trash2 size={16} /><span>Delete</span>
      </button>
    </div>
    <p class="context-hint">Tap notes to select more · long-press for this menu</p>
  </div>
{/if}

<!-- Multi-select bulk action bar -->
{#if selectMode && selectedIds.size > 0}
  <div class="bulk-bar">
    <span class="bulk-count">{selectedIds.size} selected</span>
    <div class="flex items-center gap-1.5">
      <button type="button" class="bulk-btn" onclick={bulkLink} disabled={selectedIds.size < 2} title="Link into a thread"><Link2 size={16} /><span class="hidden sm:inline">Link</span></button>
      <button type="button" class="bulk-btn" onclick={bulkMarkRead}><Check size={16} /><span class="hidden sm:inline">Read</span></button>
      <button type="button" class="bulk-btn" onclick={bulkArchive}><Archive size={16} /><span class="hidden sm:inline">Archive</span></button>
      <button type="button" class="bulk-btn bulk-danger" onclick={bulkDelete}><Trash2 size={16} /><span class="hidden sm:inline">Delete</span></button>
    </div>
  </div>
{/if}

<!-- Thread modal (an expanded stack) — notes strung together like yarn -->
<Modal open={threadRootId !== null} onclose={() => threadRootId = null} title="Stack">
  {#if threadRootId}
    <div class="thread-list">
      {#each threadNotes as n (n.id)}
        {@const tone = toneOf(n)}
        <div
          class="thread-note"
          style={noteVars(tone, n.customColor)}
          role="button"
          tabindex="0"
          onclick={() => openNoteDetail(n)}
          onkeydown={(e) => e.key === 'Enter' && openNoteDetail(n)}
        >
          <div class="flex items-center justify-between mb-1">
            <span class="thread-author">{n.createdBy === $activeUser ? 'You' : getDisplayNameForUser(n.createdBy)}</span>
            <div class="flex items-center gap-1.5">
              <span class="thread-time">{getRelativeTime(n.createdAt)}</span>
              {#if canUnlink(n)}
                <button type="button" class="thread-unlink" onclick={(e) => { e.stopPropagation(); unlinkNote(n) }} aria-label="Unlink from thread" title="Unlink from thread">
                  <Unlink size={13} />
                </button>
              {/if}
            </div>
          </div>
          {#if n.title}<h4 class="font-bold text-sm mb-0.5" style="color:var(--note-ink)">{n.title}</h4>{/if}
          {#if n.content}<p class="text-sm whitespace-pre-wrap line-clamp-4" style="color:var(--note-ink);opacity:0.85">{n.content}</p>{/if}
          {#if reactionEntries(n).length}
            <div class="note-reactions" style="position:static;margin-top:0.4rem">
              {#each reactionEntries(n) as [emoji, users] (emoji)}
                <span class="react-chip {users.includes($activeUser) ? 'is-mine' : ''}">{emoji}{#if users.length > 1}<span class="react-n">{users.length}</span>{/if}</span>
              {/each}
            </div>
          {/if}
          <span class="thread-open-hint">Tap to open →</span>
        </div>
      {/each}
      {#if stackView === 'custom'}
        <button type="button" class="btn-primary w-full text-sm" onclick={() => { const root = threadNotes[0]; if (root) startReply(root) }}>
          <Reply size={16} />
          Reply to thread
        </button>
      {/if}
    </div>
  {/if}
</Modal>

<style>
  /* ===== CORK BACKDROP (full-bleed page background) ===== */
  .cork-backdrop {
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    --cork-a: #d4b895;
    --cork-b: #c8a882;
    --cork-c: #b9986f;
    background:
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.09'/%3E%3C/svg%3E"),
      radial-gradient(120% 120% at 50% 0%, var(--cork-a) 0%, var(--cork-b) 55%, var(--cork-c) 100%);
    box-shadow: inset 0 8px 24px rgba(0,0,0,0.18);
  }

  :global(.dark) .cork-backdrop {
    --cork-a: #8a6a44;
    --cork-b: #7a5c3a;
    --cork-c: #654b30;
    background:
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.13'/%3E%3C/svg%3E"),
      radial-gradient(120% 120% at 50% 0%, var(--cork-a) 0%, var(--cork-b) 55%, var(--cork-c) 100%);
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
    flex-wrap: wrap;
    gap: 0.5rem;
    row-gap: 0.5rem;
    padding: 0.6rem 0.85rem;
    border-radius: 0.9rem;
    background: var(--cork-rail, linear-gradient(180deg, #9a7b4f 0%, #86683f 100%));
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,0.18),
      inset 0 -2px 4px rgba(0,0,0,0.25),
      0 3px 8px rgba(0,0,0,0.25);
    margin-bottom: 0.85rem;
  }
  /* Title keeps a minimum footprint so the controls wrap to their own row on
     narrow screens instead of overlapping "Our Board". */
  .cork-rail > :first-child { flex: 1 1 auto; min-width: 8rem; }
  .cork-rail > :last-child { flex: 0 0 auto; flex-wrap: wrap; justify-content: flex-end; }

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
    background: var(--cork-tray, rgba(255,255,255,0.82));
    backdrop-filter: blur(4px);
    box-shadow: 0 2px 8px rgba(0,0,0,0.12);
  }
  :global(.dark) .filter-tray {
    background: var(--cork-tray, rgba(30,26,22,0.8));
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

  /* Organic wrapping flow. Notes are sized to their content (flex-basis below)
     for variety, but grow to fill the row so the board never bunches in the
     middle or leaves large empty chunks. Ragged bases + jitter keep it from
     reading as fixed columns. */
  .notes-masonry {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 0.5rem 0.6rem;
  }

  /* ===== STICKY NOTE ===== */
  .sticky-note {
    position: relative;
    flex: 1 1 12rem; /* grow to fill the row; basis set per size below */
    max-width: 16rem;
    border-radius: 2px;
    padding: 0.875rem 0.875rem 0.6rem;
    cursor: pointer;
    background: var(--note-bg, #fef08a);
    color: var(--note-ink, #1c1917);
    margin-top: var(--jy, 0);
    transform: translateX(var(--jx, 0)) rotate(var(--rot, 0deg));
    transition: transform 150ms ease, box-shadow 150ms ease;
    box-shadow: 2px 3px 10px rgba(0,0,0,0.18), 0 1px 2px rgba(0,0,0,0.1);
    /* Long-press should open our menu, not select text or the OS callout. */
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }

  /* Content-driven bases + growth caps: small clippings stay tighter, fuller
     notes are allowed to spread wider. */
  .sticky-note.note-xs { flex-basis: 8rem;  max-width: 11rem; }
  .sticky-note.note-s  { flex-basis: 10rem; max-width: 13rem; }
  .sticky-note.note-m  { flex-basis: 12rem; max-width: 15rem; }
  .sticky-note.note-l  { flex-basis: 14rem; max-width: 19rem; }

  .sticky-note:hover, .sticky-note:focus-visible {
    transform: translateX(var(--jx, 0)) rotate(0deg) scale(1.03);
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
  /* Collapse the visible text toward each note's size so short notes stay
     small and long ones earn their extra room. */
  .note-xs .sticky-content { -webkit-line-clamp: 3; line-clamp: 3; }
  .note-s  .sticky-content { -webkit-line-clamp: 4; line-clamp: 4; }
  .note-m  .sticky-content { -webkit-line-clamp: 7; line-clamp: 7; }
  .note-l  .sticky-content { -webkit-line-clamp: 12; line-clamp: 12; }
  .note-xs .sticky-title { font-size: 0.8rem; }
  .note-l  .sticky-title { font-size: 0.95rem; }

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
    color: var(--note-sign, var(--note-tack));
    opacity: 0.95;
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

  /* ===== New/All view toggle (rail) ===== */
  .view-toggle {
    display: inline-flex;
    background: rgba(0,0,0,0.18);
    border-radius: 0.6rem;
    padding: 0.15rem;
    gap: 0.1rem;
  }
  .view-seg {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    height: 1.9rem;
    padding: 0 0.6rem;
    border-radius: 0.5rem;
    font-size: 0.75rem;
    font-weight: 700;
    color: #fdf6e9;
  }
  .view-seg.is-on { background: var(--color-accent); }
  .view-badge {
    font-size: 0.6rem;
    font-weight: 800;
    background: rgba(255,255,255,0.28);
    border-radius: 999px;
    padding: 0.02rem 0.28rem;
  }

  /* ===== Stack layers (threads) ===== */
  .sticky-note.is-stack { position: relative; }
  .stack-layer {
    position: absolute;
    inset: 0;
    border-radius: 2px;
    background: var(--note-bg);
    box-shadow: 2px 3px 8px rgba(0,0,0,0.15);
    z-index: -1;
  }
  .stack-layer-1 { transform: rotate(2.5deg) translate(3px, 3px); filter: brightness(0.97); }
  .stack-layer-2 { transform: rotate(-3deg) translate(-2px, 5px); filter: brightness(0.94); }

  /* ===== Select mode ===== */
  .sticky-note.is-selected-note { outline: 3px solid var(--color-accent); outline-offset: 2px; }
  .select-check {
    position: absolute;
    top: 0.35rem;
    right: 0.35rem;
    width: 1.3rem;
    height: 1.3rem;
    border-radius: 50%;
    background: var(--color-surface);
    border: 2px solid var(--color-accent);
    display: grid;
    place-items: center;
    color: var(--color-accent);
    z-index: 3;
  }
  .select-check.is-on { background: var(--color-accent); color: #fff; }

  /* ===== Reactions ===== */
  .note-reactions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-top: 0.4rem;
  }
  .react-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.12rem;
    font-size: 0.72rem;
    line-height: 1;
    padding: 0.15rem 0.35rem;
    border-radius: 999px;
    background: rgba(255,255,255,0.6);
    box-shadow: 0 1px 2px rgba(0,0,0,0.12);
  }
  :global(.dark) .react-chip { background: rgba(0,0,0,0.3); }
  .react-chip.is-mine { outline: 1.5px solid var(--color-accent); }
  .react-n { font-size: 0.62rem; font-weight: 700; opacity: 0.7; }

  .react-pick {
    font-size: 1.05rem;
    line-height: 1;
    padding: 0.3rem 0.4rem;
    border-radius: 0.6rem;
    background: var(--color-surface-2);
    transition: transform 100ms, background 100ms;
  }
  .react-pick:hover { transform: scale(1.12); }
  .react-pick.is-mine { outline: 2px solid var(--color-accent); }

  /* ===== Custom color swatches ===== */
  .custom-swatch, .custom-swatch-lg {
    display: grid;
    place-items: center;
    border-radius: 50%;
    border: 1.5px dashed rgba(0,0,0,0.3);
    cursor: pointer;
    color: rgba(0,0,0,0.5);
    background: conic-gradient(from 0deg, #f43f5e, #f59e0b, #10b981, #3b82f6, #8b5cf6, #f43f5e);
  }
  .custom-swatch { width: 1.2rem; height: 1.2rem; }
  .custom-swatch-lg { width: 1.7rem; height: 1.7rem; }
  .custom-swatch.is-selected, .custom-swatch-lg.is-selected {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
    border-style: solid;
  }

  /* ===== Long-press reaction menu ===== */
  .reaction-backdrop {
    position: fixed;
    inset: 0;
    z-index: 60;
    background: rgba(0,0,0,0.25);
  }
  .react-emoji {
    font-size: 1.5rem;
    line-height: 1;
    padding: 0.35rem;
    border-radius: 50%;
    transition: transform 100ms;
  }
  .react-emoji:hover { transform: scale(1.25); }
  .react-emoji.is-mine { background: color-mix(in srgb, var(--color-accent) 22%, transparent); }

  /* ===== Long-press context menu (anchored to the pressed note) ===== */
  .context-menu {
    position: fixed;
    z-index: 62;
    padding: 0.6rem;
    border-radius: 1rem;
    background: var(--color-surface);
    box-shadow: 0 12px 40px rgba(0,0,0,0.35);
    animation: ctxpop 0.14s ease-out;
    transform-origin: top left;
  }
  @keyframes ctxpop { from { transform: scale(0.94); opacity: 0.4; } }

  /* The lifted note that pops out above the dim. */
  .context-lift {
    position: fixed;
    z-index: 61;
    border-radius: 2px;
    padding: 0.875rem 0.875rem 0.7rem;
    background: var(--note-bg);
    color: var(--note-ink);
    box-shadow: 0 18px 44px rgba(0,0,0,0.45);
    transform: scale(1.04);
    transform-origin: center;
    pointer-events: none;
    max-height: 40vh;
    overflow: hidden;
    animation: liftpop 0.14s ease-out;
  }
  @keyframes liftpop { from { transform: scale(1); } }
  .lift-title {
    font-weight: 700;
    font-size: 0.9rem;
    color: var(--note-ink);
    margin-bottom: 0.25rem;
    word-break: break-word;
  }
  .lift-content {
    font-size: 0.8rem;
    line-height: 1.45;
    color: var(--note-ink);
    opacity: 0.82;
    white-space: pre-wrap;
    word-break: break-word;
    display: -webkit-box;
    -webkit-line-clamp: 6;
    line-clamp: 6;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .context-reacts {
    display: flex;
    justify-content: space-between;
    gap: 0.15rem;
    padding-bottom: 0.5rem;
    margin-bottom: 0.4rem;
    border-bottom: 1px solid var(--color-border);
  }
  .context-reacts .react-emoji { font-size: 1.35rem; padding: 0.3rem; }
  .context-actions { display: flex; flex-direction: column; gap: 0.15rem; }
  .context-btn {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.6rem 0.7rem;
    border-radius: 0.6rem;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--color-text);
    text-align: left;
    transition: background 120ms;
  }
  .context-btn:hover { background: var(--color-surface-2); }
  .context-btn.context-danger { color: #ef4444; }
  .context-btn .yarn-badge {
    margin-left: auto;
    font-size: 0.7rem;
    font-weight: 800;
    background: var(--color-accent);
    color: #fff;
    padding: 0.05rem 0.45rem;
    border-radius: 999px;
  }
  /* "Expand stack" gets a little yarn-wrapped feel. */
  .context-yarn {
    background:
      repeating-linear-gradient(45deg,
        color-mix(in srgb, var(--color-accent) 12%, transparent) 0 6px,
        transparent 6px 12px);
  }
  .context-hint {
    margin-top: 0.4rem;
    padding: 0 0.3rem;
    font-size: 0.68rem;
    color: var(--color-text-muted, #78716c);
    text-align: center;
  }

  /* ===== Thread list (tap-to-open quick view — plain, no yarn) ===== */
  .thread-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .thread-note {
    position: relative;
    cursor: pointer;
    transition: transform 120ms ease, box-shadow 120ms ease;
  }
  .thread-note:hover, .thread-note:focus-visible {
    transform: translateX(2px);
    box-shadow: 0 3px 10px rgba(0,0,0,0.2);
    outline: none;
  }
  /* Yarn knot pinning each note to the string. */
  .yarn-knot {
    position: absolute;
    left: -0.55rem;
    top: 0.75rem;
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, color-mix(in srgb, var(--color-accent) 60%, #fff), var(--color-accent));
    box-shadow: 0 1px 2px rgba(0,0,0,0.35);
  }
  .thread-open-hint {
    display: block;
    margin-top: 0.4rem;
    font-size: 0.65rem;
    font-weight: 600;
    color: var(--note-ink);
    opacity: 0.45;
  }

  /* ===== On-board unstacked thread (yarn-linked strip) ===== */
  .thread-expanded { padding: 0.25rem 0.15rem 1rem; }
  .thread-expanded-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }
  .thread-collapse {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.4rem 0.7rem;
    border-radius: 999px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    font-size: 0.8rem;
    font-weight: 600;
  }
  .thread-expanded-title {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--color-text-muted, #78716c);
  }
  /* Vertical strip — reads and taps well on a portrait phone; the yarn runs
     straight down the left through a knot on each note. */
  .thread-strip {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
    max-width: 34rem;
    margin: 0 auto;
    padding: 0.5rem 0.5rem 1.5rem 1.4rem;
  }
  .thread-strip::before {
    content: "";
    position: absolute;
    left: 0.55rem;
    top: 1.4rem;
    bottom: 1.6rem;
    width: 2px;
    background:
      repeating-linear-gradient(to bottom,
        var(--color-accent) 0 5px,
        transparent 5px 9px);
    opacity: 0.55;
    border-radius: 2px;
  }
  .strip-note {
    position: relative;
    width: 100%;
    background: var(--note-bg);
    color: var(--note-ink);
    border-radius: 2px;
    padding: 0.9rem 0.9rem 0.7rem;
    box-shadow: 2px 3px 12px rgba(0,0,0,0.2);
    cursor: pointer;
    transform: rotate(-0.6deg);
    transition: transform 140ms ease, box-shadow 140ms ease;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }
  .strip-note:nth-child(even) { transform: rotate(0.7deg); }
  .strip-note:hover, .strip-note:focus-visible {
    transform: rotate(0deg) translateX(3px);
    box-shadow: 3px 8px 20px rgba(0,0,0,0.28);
    outline: none;
  }
  /* Knot pinning each note to the vertical yarn. */
  .strip-note .yarn-knot { left: -0.95rem; right: auto; top: 1.1rem; }
  .strip-order {
    position: absolute;
    top: -0.55rem;
    right: -0.55rem;
    width: 1.4rem;
    height: 1.4rem;
    border-radius: 50%;
    background: var(--color-accent);
    color: #fff;
    font-size: 0.7rem;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 1px 3px rgba(0,0,0,0.35);
    z-index: 2;
  }
  .strip-title {
    font-weight: 700;
    font-size: 0.9rem;
    color: var(--note-ink);
    margin-bottom: 0.3rem;
    word-break: break-word;
  }
  .strip-content {
    font-size: 0.8rem;
    line-height: 1.45;
    color: var(--note-ink);
    opacity: 0.8;
    white-space: pre-wrap;
    word-break: break-word;
    display: -webkit-box;
    -webkit-line-clamp: 8;
    line-clamp: 8;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .strip-sign {
    margin-top: 0.4rem;
    font-style: italic;
    font-weight: 600;
    font-size: 0.8rem;
    color: var(--note-sign, var(--note-tack));
    opacity: 0.95;
  }
  .strip-foot {
    display: flex;
    justify-content: space-between;
    margin-top: 0.6rem;
    padding-top: 0.4rem;
    border-top: 1px solid rgba(120,110,90,0.22);
    font-size: 0.65rem;
    color: var(--note-ink);
    opacity: 0.5;
  }

  /* ===== Bulk action bar ===== */
  .bulk-bar {
    position: fixed;
    z-index: 45;
    left: 50%;
    bottom: 5rem;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.5rem 0.6rem 0.5rem 1rem;
    border-radius: 999px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    box-shadow: 0 8px 26px rgba(0,0,0,0.25);
  }
  .bulk-count { font-size: 0.8rem; font-weight: 700; white-space: nowrap; }
  .bulk-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    height: 2.2rem;
    padding: 0 0.7rem;
    border-radius: 999px;
    font-size: 0.8rem;
    font-weight: 700;
    background: var(--color-surface-2);
  }
  .bulk-btn:disabled { opacity: 0.4; pointer-events: none; }
  .bulk-danger { color: #ef4444; }

  /* ===== Thread modal notes ===== */
  .thread-note {
    background: var(--note-bg);
    border-radius: 0.5rem;
    padding: 0.75rem 0.85rem;
    box-shadow: 0 1px 3px rgba(0,0,0,0.15);
  }
  .thread-author { font-size: 0.65rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; color: var(--note-ink); opacity: 0.6; }
  .thread-time { font-size: 0.65rem; color: var(--note-ink); opacity: 0.5; }
  .thread-unlink {
    display: inline-flex; align-items: center; justify-content: center;
    width: 1.5rem; height: 1.5rem; border-radius: 50%;
    color: var(--note-ink); opacity: 0.5;
    transition: opacity 120ms, background 120ms;
  }
  .thread-unlink:hover { opacity: 0.9; background: rgba(0,0,0,0.08); }
</style>

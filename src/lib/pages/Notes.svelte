<script lang="ts">
  import { addDocument, deleteDocument, subscribeToCollection, updateDocument } from '$lib/firebase'
  import { activeUser, displayNames } from '$lib/stores/app'
  import type { Note, UserId } from '$lib/types'
  import { toast } from 'svelte-sonner'
  import { Timestamp, type Timestamp as TimestampType } from 'firebase/firestore'
  import { onMount } from 'svelte'
  import { Mail, Send, Check, Archive, ArchiveRestore, MailOpen, Package, X, StickyNote } from 'lucide-svelte'
  import PageHeader from '$lib/components/ui/PageHeader.svelte'
  import Tabs from '$lib/components/ui/Tabs.svelte'
  import EmptyState from '$lib/components/ui/EmptyState.svelte'
  import { hapticLight, hapticSuccess } from '$lib/haptics'

  let notes = $state<Note[]>([])
  let newNote = $state({ title: '', content: '' })
  let unsubscribe: (() => void) | undefined

  type TabKey = 'inbox' | 'sent' | 'archive'
  let activeTab = $state<TabKey>('inbox')

  // Cached timestamp for relative time calculations - updates every 60 seconds
  let now = $state(Date.now())

  // Get the other user's ID
  let otherUserId = $derived<UserId>($activeUser === 'Z' ? 'T' : 'Z')

  onMount(() => {
    unsubscribe = subscribeToCollection<Note>('notes', (items) => {
      notes = items
    })

    // Update relative times every minute instead of every render
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
          archived: false
        },
        $activeUser
      )
      newNote = { title: '', content: '' }
      hapticSuccess()
      toast.success('Note sent')
    } catch (e) {
      console.error('Failed to send note:', e)
      toast.error('Failed to send note')
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
  }

  async function removeNote(id: string): Promise<void> {
    if (confirm('Delete this note permanently?')) {
      try {
        await deleteDocument('notes', id)
        toast.success('Note deleted')
      } catch (e) {
        console.error('Failed to delete:', e)
        toast.error('Failed to delete note')
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

  // Filter notes based on active tab
  let filteredNotes = $derived.by(() => {
    switch (activeTab) {
      case 'inbox':
        return notes.filter(n => n.createdBy === otherUserId && !n.archived)
      case 'sent':
        return notes.filter(n => n.createdBy === $activeUser && !n.archived)
      case 'archive':
        return notes.filter(n => n.archived)
      default:
        return notes
    }
  })

  // Count unread notes in inbox
  let unreadCount = $derived(
    notes.filter(n => n.createdBy === otherUserId && !n.read && !n.archived).length
  )

  let tabsData = $derived([
    { key: 'inbox' as TabKey, label: 'Inbox', badge: unreadCount },
    { key: 'sent' as TabKey, label: 'Sent' },
    { key: 'archive' as TabKey, label: 'Archive' }
  ])

  // Empty state config based on tab
  let emptyConfig = $derived.by(() => {
    switch (activeTab) {
      case 'inbox':
        return { icon: MailOpen, title: 'No messages in your inbox', desc: 'Notes from your partner will appear here' }
      case 'sent':
        return { icon: Mail, title: "You haven't sent any notes yet", desc: 'Send a note to your partner below' }
      case 'archive':
        return { icon: Package, title: 'Archive is empty', desc: 'Archived notes will appear here' }
      default:
        return { icon: StickyNote, title: 'No notes', desc: '' }
    }
  })
</script>

<div class="max-w-2xl mx-auto">
  <PageHeader
    title="Notes"
    icon={StickyNote}
    subtitle="{notes.length} note{notes.length === 1 ? '' : 's'}"
  />

  <!-- Compose new note -->
  <form
    class="card p-4 mb-6 space-y-3"
    onsubmit={(e) => { e.preventDefault(); addNote(); }}
  >
    <div class="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-1">
      <Mail size={16} />
      <span>Leave a note for {$displayNames[otherUserId]}</span>
    </div>
    <input
      type="text"
      placeholder="Subject (optional)"
      class="input"
      bind:value={newNote.title}
    />
    <textarea
      placeholder="Write your message..."
      rows="3"
      class="input resize-y"
      bind:value={newNote.content}
    ></textarea>
    <div class="flex justify-end">
      <button
        type="submit"
        class="btn-primary"
      >
        <span>Send</span>
        <Send size={16} />
      </button>
    </div>
  </form>

  <!-- Tabs -->
  <Tabs tabs={tabsData} active={activeTab} onchange={(t) => activeTab = t} />

  <!-- Notes list -->
  <div class="flex flex-col gap-3">
    {#each filteredNotes as note (note.id)}
      {@const isUnread = !note.read && note.createdBy !== $activeUser}
      <article
        class="group relative card p-4 transition-all cursor-pointer hover:border-accent {isUnread ? 'border-accent/50 bg-accent/5' : ''}"
        onclick={() => markAsRead(note)}
        role="button"
        tabindex="0"
        onkeydown={(e) => e.key === 'Enter' && markAsRead(note)}
      >
        <!-- Unread indicator -->
        {#if isUnread}
          <div class="absolute top-4 left-0 w-1 h-8 bg-accent rounded-r"></div>
        {/if}

        <header class="mb-2 flex items-start justify-between gap-3">
          <div class="flex-1 min-w-0">
            {#if note.title}
              <h2 class="text-lg font-semibold mb-1 truncate {isUnread ? 'font-bold' : ''}">{note.title}</h2>
            {/if}
            <div class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span class="font-medium {note.createdBy === $activeUser ? 'text-slate-400' : 'text-accent'}">
                {note.createdBy === $activeUser ? 'You' : getDisplayNameForUser(note.createdBy)}
              </span>
              <span>·</span>
              <span>{getRelativeTime(note.createdAt)}</span>
              {#if note.read && note.readAt && note.createdBy === $activeUser}
                <span>·</span>
                <span class="text-emerald-500 flex items-center gap-0.5"><Check size={12} /> Read</span>
              {/if}
            </div>
          </div>

          <!-- Actions -->
          <div class="actions-container flex items-center gap-1 shrink-0">
            <button
              type="button"
              class="btn-icon-sm"
              onclick={(e) => { e.stopPropagation(); toggleArchive(note); }}
              aria-label={note.archived ? 'Unarchive' : 'Archive'}
            >
              <span class="icon-wrapper">
                {#if note.archived}
                  <ArchiveRestore size={16} />
                {:else}
                  <Archive size={16} />
                {/if}
              </span>
            </button>
            <button
              type="button"
              class="btn-icon-sm hover:text-red-500"
              onclick={(e) => { e.stopPropagation(); note.id && removeNote(note.id); }}
              aria-label="Delete"
            >
              <span class="icon-wrapper"><X size={16} /></span>
            </button>
          </div>
        </header>

        {#if note.content}
          <p class="whitespace-pre-wrap text-slate-700 dark:text-slate-300 {isUnread ? '' : 'opacity-90'}">{note.content}</p>
        {/if}
      </article>
    {:else}
      <EmptyState
        icon={emptyConfig.icon}
        title={emptyConfig.title}
        description={emptyConfig.desc}
      />
    {/each}
  </div>
</div>

<style>
  /* Safari SVG rendering fix - force GPU layer for icons */
  .icon-wrapper {
    display: inline-flex;
    transform: translateZ(0);
    -webkit-transform: translateZ(0);
  }

  /* Actions visibility - use visibility + opacity for Safari compatibility */
  .actions-container {
    opacity: 0;
    visibility: hidden;
    transition: opacity 150ms, visibility 150ms;
  }

  .group:hover .actions-container,
  .group:focus-within .actions-container {
    opacity: 1;
    visibility: visible;
  }

  /* Touch devices - show on tap */
  @media (hover: none) {
    .group:active .actions-container {
      opacity: 1;
      visibility: visible;
    }

    /* Keep visible briefly after tap for touch interaction */
    .actions-container:focus-within {
      opacity: 1;
      visibility: visible;
    }
  }
</style>

<script lang="ts">
  import { addDocument, deleteDocument, subscribeToCollection, updateDocument } from '$lib/firebase'
  import { activeUser, displayNames } from '$lib/stores/app'
  import type { Note, UserId } from '$lib/types'
  import { toast } from 'svelte-sonner'
  import { Timestamp, type Timestamp as TimestampType } from 'firebase/firestore'
  import { onMount } from 'svelte'

  let notes = $state<Note[]>([]);
  let newNote = $state({ title: '', content: '' });
  let unsubscribe: (() => void) | undefined;
  let activeTab = $state<'inbox' | 'sent' | 'archive'>('inbox');

  // Get the other user's ID
  let otherUserId = $derived<UserId>($activeUser === 'Z' ? 'T' : 'Z');

  onMount(() => {
    unsubscribe = subscribeToCollection<Note>('notes', (items) => {
      notes = items;
    });

    return () => unsubscribe?.();
  });

  async function addNote(): Promise<void> {
    if (!newNote.title.trim() && !newNote.content.trim()) return;

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
      );
      newNote = { title: '', content: '' };
      toast.success('Note sent');
    } catch (e) {
      console.error('Failed to send note:', e);
      toast.error('Failed to send note');
    }
  }

  async function markAsRead(note: Note): Promise<void> {
    if (!note.id || note.read) return;
    await updateDocument<Note>('notes', note.id, { 
      read: true, 
      readAt: Timestamp.now() 
    }, $activeUser);
  }

  async function toggleArchive(note: Note): Promise<void> {
    if (!note.id) return;
    await updateDocument<Note>('notes', note.id, { 
      archived: !note.archived 
    }, $activeUser);
  }

  async function removeNote(id: string): Promise<void> {
    if (confirm('Delete this note permanently?')) {
      try {
        await deleteDocument('notes', id);
        toast.success('Note deleted');
      } catch (e) {
        console.error('Failed to delete:', e);
        toast.error('Failed to delete note');
      }
    }
  }

  function formatDate(timestamp: TimestampType | undefined): string {
    if (!timestamp) return '';
    const date = timestamp.toDate();
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  function getRelativeTime(timestamp: TimestampType | undefined): string {
    if (!timestamp) return '';
    const now = new Date();
    const date = timestamp.toDate();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDate(timestamp);
  }

  function getDisplayNameForUser(userId: UserId): string {
    return $displayNames[userId];
  }

  // Filter notes based on active tab
  let filteredNotes = $derived.by(() => {
    switch (activeTab) {
      case 'inbox':
        // Notes from the other person that aren't archived
        return notes.filter(n => n.createdBy === otherUserId && !n.archived);
      case 'sent':
        // Notes I created that aren't archived
        return notes.filter(n => n.createdBy === $activeUser && !n.archived);
      case 'archive':
        // All archived notes
        return notes.filter(n => n.archived);
      default:
        return notes;
    }
  });

  // Count unread notes in inbox
  let unreadCount = $derived.by(() => {
    return notes.filter(n => n.createdBy === otherUserId && !n.read && !n.archived).length;
  });
</script>

<div>
  <h1 class="text-2xl font-bold mb-6">Notes</h1>

  <!-- Compose new note (like writing a letter) -->
  <form
    class="flex flex-col gap-3 mb-6 p-4 bg-surface border border-slate-200 dark:border-slate-700 rounded-xl"
    onsubmit={(e) => { e.preventDefault(); addNote(); }}
  >
    <div class="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-1">
      <span>✉️</span>
      <span>Leave a note for {$displayNames[otherUserId]}</span>
    </div>
    <input
      type="text"
      placeholder="Subject (optional)"
      class="px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:border-accent"
      bind:value={newNote.title}
    />
    <textarea
      placeholder="Write your message..."
      rows="3"
      class="px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100 resize-y focus:outline-none focus:border-accent"
      bind:value={newNote.content}
    ></textarea>
    <button
      type="submit"
      class="self-end px-6 py-2 bg-accent text-white rounded-lg font-medium hover:opacity-90 flex items-center gap-2"
    >
      <span>Send</span>
      <span>📨</span>
    </button>
  </form>

  <!-- Tabs -->
  <div class="flex gap-2 mb-4 border-b border-slate-200 dark:border-slate-700">
    <button
      class="px-4 py-2 font-medium transition-colors relative {activeTab === 'inbox' ? 'text-accent border-b-2 border-accent -mb-px' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}"
      onclick={() => activeTab = 'inbox'}
    >
      Inbox
      {#if unreadCount > 0}
        <span class="absolute -top-1 -right-1 w-5 h-5 bg-accent text-white text-xs rounded-full flex items-center justify-center">
          {unreadCount}
        </span>
      {/if}
    </button>
    <button
      class="px-4 py-2 font-medium transition-colors {activeTab === 'sent' ? 'text-accent border-b-2 border-accent -mb-px' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}"
      onclick={() => activeTab = 'sent'}
    >
      Sent
    </button>
    <button
      class="px-4 py-2 font-medium transition-colors {activeTab === 'archive' ? 'text-accent border-b-2 border-accent -mb-px' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}"
      onclick={() => activeTab = 'archive'}
    >
      Archive
    </button>
  </div>

  <!-- Notes list -->
  <div class="flex flex-col gap-3">
    {#each filteredNotes as note (note.id)}
      <article
        class="relative p-4 bg-surface border rounded-xl group transition-all cursor-pointer {!note.read && note.createdBy !== $activeUser ? 'border-accent/50 bg-accent/5' : 'border-slate-200 dark:border-slate-700'}"
        onclick={() => markAsRead(note)}
        role="button"
        tabindex="0"
        onkeydown={(e) => e.key === 'Enter' && markAsRead(note)}
      >
        <!-- Unread indicator -->
        {#if !note.read && note.createdBy !== $activeUser}
          <div class="absolute top-4 left-0 w-1 h-8 bg-accent rounded-r"></div>
        {/if}
        
        <header class="mb-2 flex items-start justify-between">
          <div>
            {#if note.title}
              <h2 class="text-lg font-semibold mb-1 {!note.read && note.createdBy !== $activeUser ? 'font-bold' : ''}">{note.title}</h2>
            {/if}
            <div class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span class="font-medium {note.createdBy === $activeUser ? 'text-slate-400' : 'text-accent'}">
                {note.createdBy === $activeUser ? 'You' : getDisplayNameForUser(note.createdBy)}
              </span>
              <span>·</span>
              <span>{getRelativeTime(note.createdAt)}</span>
              {#if note.read && note.readAt && note.createdBy === $activeUser}
                <span>·</span>
                <span class="text-emerald-500">✓ Read</span>
              {/if}
            </div>
          </div>
          
          <!-- Actions -->
          <div class="flex gap-1 opacity-0 group-hover:opacity-100 md:opacity-100 transition-opacity">
            <button
              class="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300"
              onclick={(e) => { e.stopPropagation(); toggleArchive(note); }}
              title={note.archived ? 'Unarchive' : 'Archive'}
            >
              {note.archived ? '📤' : '📥'}
            </button>
            <button
              class="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500"
              onclick={(e) => { e.stopPropagation(); note.id && removeNote(note.id); }}
              title="Delete"
            >
              ×
            </button>
          </div>
        </header>
        
        {#if note.content}
          <p class="whitespace-pre-wrap text-slate-700 dark:text-slate-300 {!note.read && note.createdBy !== $activeUser ? '' : 'opacity-90'}">{note.content}</p>
        {/if}
      </article>
    {:else}
      <div class="text-center py-12">
        {#if activeTab === 'inbox'}
          <p class="text-4xl mb-3">📭</p>
          <p class="text-slate-500 dark:text-slate-400">No messages in your inbox</p>
        {:else if activeTab === 'sent'}
          <p class="text-4xl mb-3">✉️</p>
          <p class="text-slate-500 dark:text-slate-400">You haven't sent any notes yet</p>
        {:else}
          <p class="text-4xl mb-3">📦</p>
          <p class="text-slate-500 dark:text-slate-400">Archive is empty</p>
        {/if}
      </div>
    {/each}
  </div>
</div>

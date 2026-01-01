<script lang="ts">
  import { addDocument, deleteDocument, subscribeToCollection } from '$lib/firebase'
  import { activeUser } from '$lib/stores/app'
  import type { Note } from '$lib/types'
  import type { Timestamp } from 'firebase/firestore'
  import { onMount } from 'svelte'

  let notes = $state<Note[]>([]);
  let newNote = $state({ title: '', content: '' });
  let unsubscribe: (() => void) | undefined;

  onMount(() => {
    unsubscribe = subscribeToCollection<Note>('notes', (items) => {
      notes = items;
    });

    return () => unsubscribe?.();
  });

  async function addNote(): Promise<void> {
    if (!newNote.title.trim() && !newNote.content.trim()) return;

    await addDocument<Note>(
      'notes',
      {
        type: 'note',
        title: newNote.title,
        content: newNote.content,
        tags: []
      },
      $activeUser
    );

    newNote = { title: '', content: '' };
  }

  async function removeNote(id: string): Promise<void> {
    await deleteDocument('notes', id);
  }

  function formatDate(timestamp: Timestamp | undefined): string {
    if (!timestamp) return '';
    const date = timestamp.toDate();
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }
</script>

<div>
  <h1 class="text-2xl font-bold mb-6">Notes</h1>

  <form
    class="flex flex-col gap-3 mb-8 p-4 bg-surface border border-slate-200 dark:border-slate-700 rounded-xl"
    onsubmit={(e) => { e.preventDefault(); addNote(); }}
  >
    <input
      type="text"
      placeholder="Title (optional)"
      class="px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:border-accent"
      bind:value={newNote.title}
    />
    <textarea
      placeholder="Write something..."
      rows="3"
      class="px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100 resize-y focus:outline-none focus:border-accent"
      bind:value={newNote.content}
    ></textarea>
    <button
      type="submit"
      class="self-end px-6 py-2 bg-accent text-white rounded-lg font-medium hover:opacity-90"
    >
      Add Note
    </button>
  </form>

  <div class="flex flex-col gap-4">
    {#each notes as note (note.id)}
      <article
        class="relative p-4 bg-surface border border-slate-200 dark:border-slate-700 rounded-xl group"
      >
        <header class="mb-2">
          {#if note.title}
            <h2 class="text-lg font-semibold mb-1">{note.title}</h2>
          {/if}
          <span class="text-xs text-slate-500 dark:text-slate-400">
            {note.createdBy} · {formatDate(note.createdAt)}
          </span>
        </header>
        {#if note.content}
          <p class="whitespace-pre-wrap">{note.content}</p>
        {/if}
        <button
          class="absolute top-3 right-3 w-6 h-6 text-slate-400 text-xl opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-500"
          onclick={() => note.id && removeNote(note.id)}
        >
          ×
        </button>
      </article>
    {:else}
      <p class="text-center text-slate-500 dark:text-slate-400 py-12">
        No notes yet. Write something!
      </p>
    {/each}
  </div>
</div>

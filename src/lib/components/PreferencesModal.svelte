<script lang="ts">
  import { activeUser, userPreferences, currentPreferences } from '$lib/stores/app'
  import type { Theme } from '$lib/types'

  interface Props {
    open: boolean;
    onClose: () => void;
  }

  let { open, onClose }: Props = $props();

  let localTheme = $state<Theme>('dark');
  let localAccentColor = $state('#6366f1');
  let localName = $state('');

  const presetColors = [
    '#6366f1', // Indigo
    '#ec4899', // Pink
    '#8b5cf6', // Violet
    '#06b6d4', // Cyan
    '#10b981', // Emerald
    '#f59e0b', // Amber
    '#ef4444', // Red
    '#3b82f6', // Blue
  ];

  $effect(() => {
    if (open && $currentPreferences) {
      localTheme = $currentPreferences.theme;
      localAccentColor = $currentPreferences.accentColor;
      localName = $currentPreferences.name;
    }
  });

  function savePreferences(): void {
    userPreferences.update(prefs => ({
      ...prefs,
      [$activeUser]: {
        theme: localTheme,
        accentColor: localAccentColor,
        name: localName
      }
    }));
    onClose();
  }

  function handleBackdropClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    onclick={handleBackdropClick}
    role="dialog"
    aria-modal="true"
  >
    <div class="bg-surface rounded-xl max-w-md w-full shadow-2xl">
      <div class="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
        <h2 class="text-lg font-semibold">Preferences for {$activeUser}</h2>
        <button
          class="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500"
          onclick={onClose}
        >
          ×
        </button>
      </div>
      
      <div class="p-4 space-y-5">
        <!-- Display Name -->
        <div>
          <label class="block text-sm font-medium mb-2">Display Name</label>
          <input
            type="text"
            bind:value={localName}
            class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:border-accent"
            placeholder="Your name"
          />
        </div>
        
        <!-- Theme -->
        <div>
          <label class="block text-sm font-medium mb-2">Theme</label>
          <div class="flex gap-3">
            <button
              class="flex-1 py-3 px-4 rounded-lg border-2 transition-all flex items-center justify-center gap-2 {localTheme === 'light' ? 'border-accent bg-accent/10' : 'border-slate-200 dark:border-slate-700'}"
              onclick={() => localTheme = 'light'}
            >
              <span class="text-xl">☀️</span>
              <span>Light</span>
            </button>
            <button
              class="flex-1 py-3 px-4 rounded-lg border-2 transition-all flex items-center justify-center gap-2 {localTheme === 'dark' ? 'border-accent bg-accent/10' : 'border-slate-200 dark:border-slate-700'}"
              onclick={() => localTheme = 'dark'}
            >
              <span class="text-xl">🌙</span>
              <span>Dark</span>
            </button>
          </div>
        </div>
        
        <!-- Accent Color -->
        <div>
          <label class="block text-sm font-medium mb-2">Accent Color</label>
          <div class="flex flex-wrap gap-2 mb-3">
            {#each presetColors as color}
              <button
                class="w-10 h-10 rounded-full border-2 transition-transform hover:scale-110"
                style:background-color={color}
                class:border-white={localAccentColor === color}
                class:border-transparent={localAccentColor !== color}
                class:ring-2={localAccentColor === color}
                class:ring-offset-2={localAccentColor === color}
                class:ring-slate-400={localAccentColor === color}
                onclick={() => localAccentColor = color}
              />
            {/each}
          </div>
          <div class="flex items-center gap-3">
            <label class="text-sm text-slate-500 dark:text-slate-400">Custom:</label>
            <input
              type="color"
              bind:value={localAccentColor}
              class="w-10 h-10 rounded cursor-pointer border-0"
            />
            <input
              type="text"
              bind:value={localAccentColor}
              class="flex-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg font-mono"
              pattern="^#[0-9A-Fa-f]{6}$"
            />
          </div>
        </div>
        
        <!-- Preview -->
        <div class="p-3 rounded-lg border border-slate-200 dark:border-slate-700">
          <label class="block text-xs text-slate-500 dark:text-slate-400 mb-2">Preview</label>
          <div class="flex items-center gap-3">
            <div
              class="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold"
              style:background-color={localAccentColor}
            >
              {$activeUser}
            </div>
            <span class="font-medium">{localName || $activeUser}</span>
            <button
              class="ml-auto px-3 py-1 rounded text-white text-sm"
              style:background-color={localAccentColor}
            >
              Button
            </button>
          </div>
        </div>
      </div>
      
      <div class="flex gap-3 p-4 border-t border-slate-200 dark:border-slate-700">
        <button
          class="flex-1 py-2 px-4 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          onclick={onClose}
        >
          Cancel
        </button>
        <button
          class="flex-1 py-2 px-4 rounded-lg bg-accent text-white font-medium hover:opacity-90 transition-opacity"
          onclick={savePreferences}
        >
          Save
        </button>
      </div>
    </div>
  </div>
{/if}

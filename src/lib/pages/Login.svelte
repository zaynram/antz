<script lang="ts">
  import { signInWithGoogle } from '$lib/firebase'

  let error = $state<string | null>(null);
  let loading = $state(false);

  async function handleLogin(): Promise<void> {
    loading = true;
    error = null;
    try {
      await signInWithGoogle();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Sign in failed';
    } finally {
      loading = false;
    }
  }
</script>

<div class="flex items-center justify-center min-h-screen">
  <div class="bg-surface p-12 rounded-2xl text-center border border-slate-200 dark:border-slate-700">
    <h1 class="text-4xl font-bold mb-2 text-accent">Us</h1>
    <p class="text-slate-500 dark:text-slate-400 mb-8">Sign in to continue</p>

    <button
      class="bg-accent text-white px-8 py-3 rounded-lg font-medium transition-opacity hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
      onclick={handleLogin}
      disabled={loading}
    >
      {loading ? 'Signing in...' : 'Sign in with Google'}
    </button>

    {#if error}
      <p class="text-red-500 mt-4">{error}</p>
    {/if}
  </div>
</div>

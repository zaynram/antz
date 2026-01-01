import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      $lib: '/src/lib'
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
});

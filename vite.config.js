import { defineConfig } from 'vite';

// Relative base so the built assets resolve correctly regardless of the
// GitHub Pages repo name (works for both project pages and a custom domain).
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});

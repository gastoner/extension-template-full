import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';

export default defineConfig({
  plugins: [svelte(), svelteTesting()],
  resolve: {
    alias: {
      '/@/': new URL('./src/', import.meta.url).pathname,
      '/@shared/': new URL('../shared/', import.meta.url).pathname,
    },
  },
  test: {
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    globals: true,
    environment: 'jsdom',
    alias: [{ find: '@testing-library/svelte', replacement: '@testing-library/svelte/svelte5' }],
  },
});

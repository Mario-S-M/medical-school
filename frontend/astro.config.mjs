// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  integrations: [react()],
  server: { port: 4321, host: 'localhost' },
  vite: {
    plugins: [tailwindcss()],
    server: { strictPort: true },
  },
});

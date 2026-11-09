// @ts-check
import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

const { URL_API = 'http://127.0.0.1:8080' } = loadEnv(process.env.NODE_ENV ?? 'development', process.cwd(), '');

export default defineConfig({
  integrations: [react()],
  server: { port: 4321, host: 'localhost' },
  vite: {
    plugins: [tailwindcss()],
    server: {
      strictPort: true,
      proxy: { '/autenticacion': { target: URL_API } },
    },
  },
});

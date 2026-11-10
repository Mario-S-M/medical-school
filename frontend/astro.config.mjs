// @ts-check
import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

const { URL_API = 'http://127.0.0.1:8080', URL_ALMACEN = 'http://127.0.0.1:8000/storage/v1' } = loadEnv(process.env.NODE_ENV ?? 'development', process.cwd(), '');

export default defineConfig({
  integrations: [react()],
  server: { port: 4321, host: 'localhost' },
  vite: {
    plugins: [tailwindcss()],
    server: {
      strictPort: true,
      proxy: {
        '/autenticacion': { target: URL_API },
        '/escuela': { target: URL_API },
        // Subida y lectura de portadas: /almacen/x -> Supabase Storage por Kong (/storage/v1/x)
        '/almacen': { target: URL_ALMACEN, rewrite: (ruta) => ruta.replace(/^\/almacen/, '') },
      },
    },
  },
});

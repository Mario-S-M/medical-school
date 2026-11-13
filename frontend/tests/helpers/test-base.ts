import { expect, test as base } from '@playwright/test';

// La API limita a 120 peticiones por minuto y por IP (antes Caddy no limitaba) y el servidor de desarrollo de Astro
// reenvía todo desde la misma máquina. Cada prueba simula un cliente distinto con `X-Forwarded-For` (Astro lo
// agrega con `xfwd` y la API solo lo lee porque el pariente directo es de confianza).
export const test = base.extend({
  context: async ({ context }, use) => {
    const ip = `198.18.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;
    await context.route(/\/api\//, (ruta) => ruta.continue({ headers: { ...ruta.request().headers(), 'x-forwarded-for': ip } }));
    await use(context);
  },
});

export { expect };

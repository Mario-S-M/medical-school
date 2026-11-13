import type { FastifyInstance } from 'fastify';

// Fastify no devuelve 405: guardamos los métodos de cada ruta para poder distinguirlo de un 404.
const ROUTES_KEY = 'registeredRoutes';
type Routes = { url: string; methods: string[]; pattern: RegExp }[];

declare module 'fastify' {
  interface FastifyInstance {
    registeredRoutes: Routes;
    restrictedMethods: Record<string, string[]>;
  }
}

function toRegExp(url: string): RegExp {
  const escaped = url
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/:[A-Za-z0-9_]+/g, '[^/]+')
    .replace(/\*/g, '.*');
  return new RegExp(`^${escaped}/?$`);
}

// Debe llamarse antes de que Nest registre las rutas.
export function trackRoutes(fastify: FastifyInstance): void {
  fastify.decorate(ROUTES_KEY, [] as Routes);
  fastify.decorate('restrictedMethods', {} as Record<string, string[]>);
  fastify.addHook('onRoute', (route) => {
    const methods = (Array.isArray(route.method) ? route.method : [route.method]).map((m) => m.toUpperCase());
    fastify.registeredRoutes.push({ url: route.url, methods, pattern: toRegExp(route.url) });
  });
}

// Una librería puede registrar más métodos de los que la API acepta (Mercurius: GET y QUERY). Con esto el `Allow`
// del 405 solo anuncia los métodos que de verdad se aceptan en esa URL.
export function restrictMethods(fastify: FastifyInstance, url: string, methods: string[]): void {
  fastify.restrictedMethods[url] = methods.map((m) => m.toUpperCase());
}

export function allowedMethods(fastify: FastifyInstance, url: string): string[] {
  const path = url.split('?')[0];
  const methods = new Set<string>();
  for (const r of fastify.registeredRoutes ?? []) {
    if (!r.pattern.test(path)) continue;
    const limit = fastify.restrictedMethods?.[r.url];
    r.methods.filter((m) => !limit || limit.includes(m)).forEach((m) => methods.add(m));
  }
  return [...methods];
}

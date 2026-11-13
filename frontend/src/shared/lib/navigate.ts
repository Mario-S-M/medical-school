import { navigate } from 'astro:transitions/client';

// Navega con transición de vista (sin recargar la página completa).
export const goTo = (path: string, replace = false) => navigate(path, replace ? { history: 'replace' } : undefined);

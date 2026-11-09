import { navigate } from 'astro:transitions/client';

// Navega con transición de vista (sin recargar la página completa).
export const navegar = (ruta: string, reemplazar = false) =>
  navigate(ruta, reemplazar ? { history: 'replace' } : undefined);

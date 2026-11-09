// Parámetro de la URL actual (las páginas son estáticas: el curso se pide con ?id= o ?c=).
export const parametro = (nombre: string) => new URLSearchParams(window.location.search).get(nombre);

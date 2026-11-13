// Parámetro de la URL actual (las páginas son estáticas: el curso se pide con ?id= o ?c=).
export const getParam = (name: string) => new URLSearchParams(window.location.search).get(name);

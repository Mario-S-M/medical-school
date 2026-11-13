// Slug de una categoría: minúsculas, sin acentos, con letras y números separados por un guion. Igual que el workflow
// `guardar-categoria` (`escuela.sin_acentos` + `regexp_replace('[^a-zA-Z0-9]+', '-')` + recorte de guiones).
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Slug de un curso: minúsculas, sin acentos, letras y números separados por un guion; `curso` si el título no deja nada.
// Igual que el workflow `crear-curso` (`escuela.sin_acentos` + `regexp_replace('[^a-zA-Z0-9]+', '-')` + recorte de guiones).
const EXTRA_LETTERS: Record<string, string> = { ß: 'ss', æ: 'ae', œ: 'oe', ø: 'o', đ: 'd', ł: 'l', ð: 'd', þ: 'th' };

export function courseSlug(title: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[ßæœøđłðþ]/g, (letter) => EXTRA_LETTERS[letter])
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? 'curso' : slug;
}

// El primer slug libre: `base`, `base-2`, `base-3`... (hasta 1000 intentos, como el workflow). `null` si no queda ninguno.
export function firstFreeSlug(base: string, taken: ReadonlySet<string>): string | null {
  for (let attempt = 1; attempt <= 1000; attempt++) {
    const candidate = attempt === 1 ? base : `${base}-${attempt}`;
    if (!taken.has(candidate)) return candidate;
  }
  return null;
}

// Lectura de valores calculados de CSS que usa la vigilancia de la marca de agua.

// Alfa de un color calculado: `rgb(r, g, b)`, `rgba(r, g, b, a)` o la forma moderna `color(... / a)`. Sin alfa, 1.
export function alphaOf(color: string): number {
  const legacy = color.match(/^rgba\((?:[^,]+,){3}\s*([\d.]+%?)\s*\)$/);
  const modern = color.match(/\/\s*([\d.]+%?)\s*\)$/);
  const raw = (legacy ?? modern)?.[1];
  if (!raw) return 1;
  return raw.endsWith('%') ? parseFloat(raw) / 100 : parseFloat(raw);
}

// Valor numérico (0 a 1, o porcentaje) del argumento de una función de `filter`, por ejemplo `opacity(0.05)`.
export function filterAmount(filter: string, name: string): number | null {
  const found = filter.match(new RegExp(`${name}\\(\\s*([\\d.]+)(%|px)?\\s*\\)`));
  if (!found) return null;
  return found[2] === '%' ? parseFloat(found[1]) / 100 : parseFloat(found[1]);
}

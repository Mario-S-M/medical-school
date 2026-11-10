export const validarTituloTemario = (v: string) =>
  v.trim().length < 1 || v.trim().length > 120 ? ['El título debe tener entre 1 y 120 caracteres.'] : [];

export const validarDescripcionClase = (v: string) =>
  v.trim().length > 2000 ? ['La descripción admite como máximo 2000 caracteres.'] : [];

export function validarDuracion(v: string): string[] {
  if (!v.trim()) return [];
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 180 ? [] : ['La duración es un número entero de minutos, de 1 a 180.'];
}

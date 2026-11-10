export const lineas = (v: string) => v.split('\n').map((l) => l.trim()).filter(Boolean);

const limite = (max: number, nombre: string) => (v: string) =>
  v.trim().length > max ? [`${nombre} admite como máximo ${max} caracteres.`] : [];

export const validarTitulo = (v: string) =>
  v.trim().length < 5 || v.trim().length > 120 ? ['El título debe tener entre 5 y 120 caracteres.'] : [];
export const validarSubtitulo = limite(200, 'El subtítulo');
export const validarDescripcion = limite(5000, 'La descripción');
export const validarPrevios = limite(2000, 'Los conocimientos previos');

export function validarAprenderas(v: string): string[] {
  const l = lineas(v);
  if (l.length > 10) return ['Escribe como máximo 10 puntos.'];
  return l.some((x) => x.length > 150) ? ['Cada punto admite como máximo 150 caracteres.'] : [];
}

export function validarNombre(valor: string): string[] {
  const nombre = valor.trim();
  if (!nombre) return ['Escribe tu nombre.'];
  if (nombre.length > 80) return ['El nombre admite hasta 80 caracteres.'];
  return [];
}

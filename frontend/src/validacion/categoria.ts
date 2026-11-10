export function validarNombreCategoria(valor: string): string[] {
  const n = valor.trim();
  if (n.length < 2 || n.length > 60) return ['El nombre debe tener entre 2 y 60 caracteres.'];
  return /[\p{L}\p{N}]/u.test(n) ? [] : ['Incluye al menos una letra o un número.'];
}

export function validarPosicion(valor: string): string[] {
  const n = Number(valor);
  return Number.isInteger(n) && n >= 1 && n <= 1000 ? [] : ['La posición es un número entero de 1 a 1000.'];
}

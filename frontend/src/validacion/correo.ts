const FORMATO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validarCorreo(valor: string): string[] {
  const correo = valor.trim();
  if (!correo) return ['Escribe tu correo.'];
  if (correo.length > 254 || !FORMATO.test(correo)) return ['Escribe un correo válido.'];
  return [];
}

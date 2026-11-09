export function validarCodigo(valor: string): string[] {
  return /^\d{6}$/.test(valor) ? [] : ['El código tiene exactamente 6 dígitos.'];
}

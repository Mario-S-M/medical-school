import type { Regla } from '../componentes/ui/ListaReglas';

const bytes = (texto: string) => new TextEncoder().encode(texto).length;

export function reglasContrasena(contrasena: string, correo = ''): Regla[] {
  const minusculas = contrasena.toLowerCase();
  const parteLocal = correo.trim().toLowerCase().split('@')[0];
  const contieneCorreo = [correo.trim().toLowerCase(), parteLocal].some((c) => c && minusculas.includes(c));
  return [
    { mensaje: 'Al menos 12 caracteres', cumplida: bytes(contrasena) >= 12 },
    { mensaje: 'Como máximo 72 bytes', cumplida: bytes(contrasena) <= 72 },
    { mensaje: 'Una mayúscula', cumplida: /\p{Lu}/u.test(contrasena) },
    { mensaje: 'Una minúscula', cumplida: /\p{Ll}/u.test(contrasena) },
    { mensaje: 'Un número', cumplida: /\d/.test(contrasena) },
    { mensaje: 'Un símbolo', cumplida: /[^\p{L}\p{N}\s]/u.test(contrasena) },
    { mensaje: 'Sin espacios al inicio ni al final', cumplida: contrasena === contrasena.trim() },
    { mensaje: 'Sin tu correo ni su parte local', cumplida: !contieneCorreo },
  ];
}

export const contrasenaValida = (contrasena: string, correo = '') =>
  reglasContrasena(contrasena, correo).every((r) => r.cumplida);

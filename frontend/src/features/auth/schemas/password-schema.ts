import { z } from 'zod';
import type { Rule } from '../../../shared/components/ui/RuleList';

const bytes = (text: string) => new TextEncoder().encode(text).length;

const containsEmail = (password: string, email: string) => {
  const lower = email.trim().toLowerCase();
  const local = lower.split('@')[0];
  return [lower, local].some((part) => part && password.toLowerCase().includes(part));
};

// Reglas de contraseña en vivo (la lista de contraseñas comunes la comprueba solo la API).
const RULES: { message: string; test: (password: string, email: string) => boolean }[] = [
  { message: 'Al menos 12 caracteres', test: (p) => bytes(p) >= 12 },
  { message: 'Como máximo 72 bytes', test: (p) => bytes(p) <= 72 },
  { message: 'Una mayúscula', test: (p) => /\p{Lu}/u.test(p) },
  { message: 'Una minúscula', test: (p) => /\p{Ll}/u.test(p) },
  { message: 'Un número', test: (p) => /\d/.test(p) },
  { message: 'Un símbolo', test: (p) => /[^\p{L}\p{N}\s]/u.test(p) },
  { message: 'Sin espacios al inicio ni al final', test: (p) => p === p.trim() },
  { message: 'Sin tu correo ni su parte local', test: (p, email) => !containsEmail(p, email) },
];

export const passwordRules = (password: string, email = ''): Rule[] =>
  RULES.map((r) => ({ message: r.message, met: r.test(password, email) }));

export const passwordSchema = (email = '') =>
  z.string().superRefine((password, ctx) => {
    RULES.filter((r) => !r.test(password, email)).forEach((r) => ctx.addIssue({ code: 'custom', message: r.message }));
  });

export const isPasswordValid = (password: string, email = '') => passwordSchema(email).safeParse(password).success;

export const passwordRequiredSchema = z.string().min(1, 'Escribe tu contraseña.');

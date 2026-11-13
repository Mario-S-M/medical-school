import type { ZodType } from 'zod';

export type Validator = (value: string) => string[];

// Adapta un esquema de Zod al validador de los campos: devuelve solo el primer mensaje de error (como antes).
export const zodValidator =
  (schema: ZodType<unknown>): Validator =>
  (value) => {
    const result = schema.safeParse(value);
    return result.success ? [] : [result.error.issues[0].message];
  };

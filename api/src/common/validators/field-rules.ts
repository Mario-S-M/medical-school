import { Transform } from 'class-transformer';
import { ValidateBy } from 'class-validator';

// Reglas de campo de la API (mensajes en español y nombres de regla estables: `regla` de los
// `detalles` de VALIDACION_FALLIDA). Un valor vacío (`null`, `undefined` o `""`) cuenta como ausente: solo falla
// `obligatorio` si el campo es obligatorio, y el resto de reglas lo dejan pasar. Cada decorador ya incluye todas sus reglas.

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/; // eslint-disable-line no-control-regex -- precisamente se rechazan
const isMissing = (value: unknown): boolean => value === undefined || value === null || value === '';

function rule(name: string, message: string, check: (value: unknown) => boolean): PropertyDecorator {
  return ValidateBy({ name, validator: { validate: (value: unknown) => isMissing(value) || check(value), defaultMessage: () => message } });
}

const required = (): PropertyDecorator =>
  ValidateBy({ name: 'obligatorio', validator: { validate: (value: unknown) => !isMissing(value), defaultMessage: () => 'Este campo es obligatorio.' } });

function all(decorators: PropertyDecorator[]): PropertyDecorator {
  return (target, key) => decorators.forEach((decorator) => decorator(target, key));
}

// `""` equivale a "no enviado" y el resto de textos se recortan (el workflow los guarda recortados).
const normalizeText = ({ value }: { value: unknown }): unknown => (value === '' ? null : typeof value === 'string' ? value.trim() : value);

export interface TextOptions {
  required?: boolean;
  min?: number;
  max?: number;
  multiline?: boolean;
  alphanumeric?: boolean;
}

// Texto recortado con longitud mínima y máxima, sin caracteres de control (salvo `multiline`) y, si se pide, con al menos
// una letra o un número.
export function TextField(options: TextOptions): PropertyDecorator {
  const { min, max } = options;
  const decorators: PropertyDecorator[] = [Transform(normalizeText)];
  if (options.required) decorators.push(required());
  decorators.push(rule('tipo_texto', 'Debe ser un texto.', (v) => typeof v === 'string'));
  if (!options.multiline) decorators.push(rule('sin_caracteres_de_control', 'No puede tener caracteres de control.', (v) => typeof v !== 'string' || !CONTROL_CHARACTERS.test(v)));
  if (min) decorators.push(rule('minimo_caracteres', `Debe tener al menos ${min} caracteres.`, (v) => typeof v !== 'string' || v.length >= min));
  if (max) decorators.push(rule('maximo_caracteres', `Debe tener como máximo ${max} caracteres.`, (v) => typeof v !== 'string' || v.length <= max));
  if (options.alphanumeric) decorators.push(rule('requiere_letra_o_numero', 'Debe incluir al menos una letra o un número.', (v) => typeof v !== 'string' || /[\p{L}\p{N}]/u.test(v)));
  return all(decorators);
}

export interface IntegerOptions {
  required?: boolean;
  min?: number;
  max?: number;
}

// Entero (GraphQL ya garantiza el tipo): mínimo y máximo con los mensajes de los workflows.
export function IntegerField(options: IntegerOptions): PropertyDecorator {
  const { min, max } = options;
  const decorators: PropertyDecorator[] = [];
  if (options.required) decorators.push(required());
  decorators.push(rule('tipo_entero', 'Debe ser un número entero.', (v) => typeof v === 'number' && Number.isInteger(v)));
  if (min !== undefined) decorators.push(rule('valor_minimo', `Debe ser al menos ${min}.`, (v) => typeof v !== 'number' || v >= min));
  if (max !== undefined) decorators.push(rule('valor_maximo', `Debe ser como máximo ${max}.`, (v) => typeof v !== 'number' || v <= max));
  return all(decorators);
}

// Uno de los valores permitidos.
export function OptionField(values: readonly string[], isRequired = true): PropertyDecorator {
  const decorators: PropertyDecorator[] = [];
  if (isRequired) decorators.push(required());
  decorators.push(rule('valor_no_permitido', `Debe ser uno de: ${values.join(', ')}.`, (v) => typeof v === 'string' && values.includes(v)));
  return all(decorators);
}

export interface TextListOptions {
  maxItems: number;
  maxLength: number;
}

// Lista de textos recortados: como mucho `maxItems` elementos de 1 a `maxLength` caracteres.
export function TextListField(options: TextListOptions): PropertyDecorator {
  const trimItems = ({ value }: { value: unknown }): unknown => (Array.isArray(value) ? value.map((item) => (typeof item === 'string' ? item.trim() : item)) : value);
  return all([
    Transform(trimItems),
    rule('tipo_lista', 'Debe ser una lista de textos.', (v) => Array.isArray(v)),
    rule('maximo_elementos', `Puede tener como máximo ${options.maxItems} elementos.`, (v) => !Array.isArray(v) || v.length <= options.maxItems),
    rule(
      'elemento_invalido',
      `Cada elemento debe ser un texto de 1 a ${options.maxLength} caracteres.`,
      (v) => !Array.isArray(v) || v.every((item) => typeof item === 'string' && item.length >= 1 && item.length <= options.maxLength),
    ),
  ]);
}

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Correo recortado y en minúsculas (hasta 254 caracteres), como el tipo `correo` de `validar-campos`.
export function EmailField(): PropertyDecorator {
  const normalize = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim().toLowerCase() : value);
  return all([
    Transform(normalize),
    required(),
    rule('formato_correo', 'Debe ser un correo válido.', (v) => typeof v === 'string' && v.length <= 254 && EMAIL_FORMAT.test(v)),
  ]);
}

// Identificador UUID en minúsculas, como el tipo `uuid` de `validar-campos`.
export function UuidField(): PropertyDecorator {
  const lower = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.toLowerCase() : value);
  return all([Transform(lower), required(), rule('formato_uuid', 'Debe ser un identificador válido.', (v) => typeof v === 'string' && UUID_FORMAT.test(v))]);
}

import { ArgumentMetadata, ValidationError, ValidationPipe } from '@nestjs/common';
import { ApiException, ErrorDetail } from '../utils/api-exception';

// Regla (snake_case en español, contrato) y mensaje por defecto de cada restricción de class-validator.
// Un DTO puede dar su propio mensaje: solo se usa el de aquí si el DTO no lo cambió.
const RULES: Record<string, [string, string]> = {
  whitelistValidation: ['campo_no_permitido', 'Este campo no está permitido.'],
  isNotEmpty: ['obligatorio', 'Es obligatorio.'],
  isDefined: ['obligatorio', 'Es obligatorio.'],
  isString: ['debe_ser_texto', 'Debe ser un texto.'],
  isEmail: ['correo_invalido', 'Debe ser un correo válido.'],
  isInt: ['debe_ser_entero', 'Debe ser un número entero.'],
  isBoolean: ['debe_ser_booleano', 'Debe ser verdadero o falso.'],
  isUUID: ['uuid_invalido', 'Debe ser un identificador válido.'],
  minLength: ['longitud_minima', 'Es demasiado corto.'],
  maxLength: ['longitud_maxima', 'Es demasiado largo.'],
  matches: ['formato_invalido', 'El formato no es válido.'],
};

function flatten(errors: ValidationError[], prefix = ''): ErrorDetail[] {
  return errors.flatMap((e) => {
    const field = prefix ? `${prefix}.${e.property}` : e.property;
    const own = Object.entries(e.constraints ?? {}).map(([constraint, message]): ErrorDetail => {
      const [rule, fallback] = RULES[constraint] ?? [constraint.toLowerCase(), 'Valor no válido.'];
      // class-validator escribe en inglés cuando el DTO no define `message`: se sustituye por el español.
      const isEnglish = /^[a-z]/.test(message);
      return { campo: field, regla: rule, mensaje: isEnglish ? fallback : message };
    });
    return [...own, ...flatten(e.children ?? [], field)];
  });
}

const invalidData = (details: ErrorDetail[]): ApiException =>
  new ApiException(422, 'VALIDACION_FALLIDA', 'Revisa los datos enviados.', details);

// Pipe global para los DTO con decoradores de class-validator. Lista blanca: los campos que no están en el DTO se
// rechazan (no se descartan en silencio). Los cuerpos de autenticación usan `ValidatorPipe` con funciones puras.
export class AppValidationPipe extends ValidationPipe {
  constructor() {
    super({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      stopAtFirstError: false,
      exceptionFactory: (errors) => invalidData(flatten(errors)),
    });
  }

  async transform(value: unknown, metadata: ArgumentMetadata): Promise<unknown> {
    const isObject = typeof value === 'object' && value !== null && !Array.isArray(value);
    if (metadata.type === 'body' && metadata.metatype && metadata.metatype !== Object && !isObject) {
      throw invalidData([{ campo: 'cuerpo', regla: 'debe_ser_objeto', mensaje: 'El cuerpo debe ser un objeto JSON.' }]);
    }
    return super.transform(value, metadata);
  }
}

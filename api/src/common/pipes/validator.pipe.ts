import { PipeTransform } from '@nestjs/common';
import { ApiException, ERROR_MESSAGES, ErrorDetail } from '../utils/api-exception';

type Validator<T> = (value: unknown) => { ok: true; data: T } | { ok: false; details: ErrorDetail[] };

// Pipe de un parámetro que valida el cuerpo con una función pura y lanza `422 VALIDACION_FALLIDA` con `detalles`.
// Uso: `@Body(new ValidatorPipe(validateRegister, INVALID_REQUEST_MESSAGE)) dto: RegisterDto`.
export class ValidatorPipe<T> implements PipeTransform<unknown, T> {
  constructor(
    private readonly validate: Validator<T>,
    private readonly message: string = ERROR_MESSAGES.VALIDACION_FALLIDA,
  ) {}

  transform(value: unknown): T {
    const result = this.validate(value);
    if (!result.ok) throw new ApiException(422, 'VALIDACION_FALLIDA', this.message, result.details);
    return result.data;
  }
}

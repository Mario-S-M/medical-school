import { HttpException } from '@nestjs/common';

// Detalle de un error de validación. Va tal cual en el JSON de la respuesta (contrato): `campo`, `regla`, `mensaje`.
export interface ErrorDetail {
  campo: string;
  regla: string;
  mensaje: string;
}

// Mensajes fijos de los errores transversales (los mismos que daba Caddy en la SPEC 04). La clave es el código del contrato.
export const ERROR_MESSAGES: Record<string, string> = {
  JSON_INVALIDO: 'El cuerpo no es un JSON válido.',
  VALIDACION_FALLIDA: 'Revisa los datos enviados.',
  ORIGEN_NO_PERMITIDO: 'Origen no permitido.',
  NO_ENCONTRADO: 'Recurso no encontrado.',
  METODO_NO_PERMITIDO: 'Método no permitido.',
  TIPO_CONTENIDO_NO_SOPORTADO: 'El tipo de contenido debe ser application/json.',
  CUERPO_DEMASIADO_GRANDE: 'El cuerpo supera el tamaño máximo permitido.',
  DEMASIADAS_SOLICITUDES: 'Demasiadas solicitudes. Espera para volver a intentar.',
  SOLICITUD_INVALIDA: 'Solicitud inválida.',
  SIN_PERMISO: 'No tienes permiso para hacer esto.',
  CONSULTA_NO_PERMITIDA: 'Esta consulta no está permitida.',
  CONSULTA_DEMASIADO_COMPLEJA: 'La consulta es demasiado compleja (profundidad máxima 8, costo máximo 1000).',
  VIDEO_NO_DISPONIBLE: 'El video de esta clase todavía no está listo.',
  ERROR_INTERNO: 'Error interno del servidor.',
};

export interface ErrorBody {
  error: {
    codigo: string;
    mensaje: string;
    detalles?: ErrorDetail[];
    reintentar_en_segundos?: number;
  };
}

// Error de la API con el formato uniforme `{ "error": { codigo, mensaje, detalles? } }`.
export class ApiException extends HttpException {
  constructor(
    status: number,
    readonly code: string,
    readonly apiMessage: string = ERROR_MESSAGES[code] ?? ERROR_MESSAGES.ERROR_INTERNO,
    readonly details?: ErrorDetail[],
    readonly retryAfterSeconds?: number,
    readonly headers: Record<string, string> = {},
  ) {
    super(apiMessage, status);
  }

  body(): ErrorBody {
    const error: ErrorBody['error'] = { codigo: this.code, mensaje: this.apiMessage };
    if (this.details) error.detalles = this.details;
    if (this.retryAfterSeconds !== undefined) error.reintentar_en_segundos = this.retryAfterSeconds;
    return { error };
  }
}

export function uniformError(status: number, code: string): ApiException {
  return new ApiException(status, code);
}

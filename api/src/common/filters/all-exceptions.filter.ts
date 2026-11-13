import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { GraphQLError } from 'graphql';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ApiException, uniformError } from '../utils/api-exception';
import { translateFastifyError } from '../utils/fastify-errors';
import { allowedMethods } from '../utils/route-registry';

interface FastifyError extends Error {
  code?: string;
  statusCode?: number;
}

// Traduce cualquier error (de Nest, de Fastify o inesperado) al formato uniforme de la SPEC 04.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('AllExceptionsFilter');

  catch(error: unknown, host: ArgumentsHost): unknown {
    // En GraphQL no hay respuesta HTTP que escribir: el error vuelve como error de campo con `extensions.codigo`.
    if (host.getType<string>() === 'graphql') return this.forGraphql(error);
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    const api = this.translate(error, request);
    for (const [name, value] of Object.entries(api.headers)) reply.header(name, value);
    void reply
      .status(api.getStatus())
      .header('Content-Type', 'application/json; charset=utf-8')
      .send(api.body());
  }

  private forGraphql(error: unknown): GraphQLError {
    let api: ApiException;
    if (error instanceof ApiException) api = error;
    else if (error instanceof HttpException && error.getStatus() < 500) api = uniformError(error.getStatus(), 'SOLICITUD_INVALIDA');
    else api = this.internal(error);
    return new GraphQLError(api.apiMessage, { extensions: { codigo: api.code, ...(api.details ? { detalles: api.details } : {}) } });
  }

  private translate(error: unknown, request: FastifyRequest): ApiException {
    if (error instanceof ApiException) return error;
    const fromFastify = translateFastifyError(error);
    if (fromFastify) return fromFastify;
    if (error instanceof HttpException) {
      const status = error.getStatus();
      if (status === 404) return this.notFound(request);
      if (status >= 500) return this.internal(error);
      return uniformError(status, 'SOLICITUD_INVALIDA');
    }
    // Errores de Fastify con estado 4xx (URL mal formada, etc.)
    const e = error as FastifyError;
    if (typeof e?.statusCode === 'number' && e.statusCode >= 400 && e.statusCode < 500) {
      return uniformError(e.statusCode, 'SOLICITUD_INVALIDA');
    }
    return this.internal(error);
  }

  private notFound(request: FastifyRequest): ApiException {
    const allowed = allowedMethods(request.server, request.url);
    if (allowed.length > 0 && !allowed.includes(request.method)) {
      const e = uniformError(405, 'METODO_NO_PERMITIDO');
      return new ApiException(405, e.code, e.apiMessage, undefined, undefined, { Allow: allowed.join(', ') });
    }
    return uniformError(404, 'NO_ENCONTRADO');
  }

  // El detalle solo va al registro del servidor; al cliente nunca.
  private internal(error: unknown): ApiException {
    this.logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    return uniformError(500, 'ERROR_INTERNO');
  }
}

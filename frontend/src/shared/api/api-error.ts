export type ErrorDetail = { campo: string; regla: string; mensaje: string };

// Todo error de la API (HTTP, red, GraphQL o respuesta con contrato roto) llega a los componentes con esta forma.
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: ErrorDetail[] = [],
    public retryAfter?: number,
  ) {
    super(message);
  }
}

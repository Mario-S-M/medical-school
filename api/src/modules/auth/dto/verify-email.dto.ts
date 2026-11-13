// POST /api/v1/verificaciones-correo
export interface VerifyEmailDto {
  email: string;
  code: string;
}

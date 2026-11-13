// POST /api/v1/recuperaciones/restablecimiento
export interface ResetPasswordDto {
  email: string;
  code: string;
  newPassword: string;
}

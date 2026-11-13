// POST /api/v1/usuarios (cuerpo ya validado y normalizado por `validators/request.validators.ts`).
export interface RegisterDto {
  email: string;
  name: string;
  password: string;
}

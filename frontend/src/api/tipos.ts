export type Usuario = { id: string; correo: string; nombre: string };

export type RespuestaSesion = {
  token_acceso: string;
  tipo_token: 'Bearer';
  expira_en: number;
  usuario: Usuario;
};

export type Mensaje = { mensaje: string };

export type DetalleError = { campo: string; regla: string; mensaje: string };

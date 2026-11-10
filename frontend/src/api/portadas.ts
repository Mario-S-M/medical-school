import { solicitar } from './cliente';

const ESCUELA = { prefijo: 'escuela' };

export const TIPOS_PORTADA = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_BYTES_PORTADA = 2 * 1024 * 1024;

export const urlSubidaPortada = (token: string, cuerpo: { curso_id: number; tipo_contenido: string; tamano_bytes: number }) =>
  solicitar<{ url_subida: string; ruta: string }>('POST', 'url-subida-portada', { token, cuerpo, ...ESCUELA });

export const confirmarPortada = (token: string, cuerpo: { curso_id: number; ruta: string }) =>
  solicitar<{ portada_url: string }>('POST', 'confirmar-portada', { token, cuerpo, ...ESCUELA });

// El archivo va directo a Storage con la URL firmada: nunca pasa por n8n.
export const subirArchivo = (url: string, archivo: File) =>
  fetch(url, { method: 'PUT', headers: { 'Content-Type': archivo.type }, body: archivo });

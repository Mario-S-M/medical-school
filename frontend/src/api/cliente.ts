import { ErrorApi } from './errores';

type Opciones = { cuerpo?: unknown; token?: string; renovacion?: boolean };

async function leerJson(respuesta: Response) {
  try {
    return await respuesta.json();
  } catch {
    return null;
  }
}

export async function solicitar<T>(metodo: string, ruta: string, op: Opciones = {}): Promise<T> {
  const cabeceras: Record<string, string> = {};
  if (op.cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';
  if (op.token) cabeceras.Authorization = `Bearer ${op.token}`;
  if (op.renovacion) cabeceras['X-Solicitado-Con'] = 'front';

  let respuesta: Response;
  try {
    respuesta = await fetch(`/autenticacion/${ruta}`, {
      method: metodo,
      headers: cabeceras,
      credentials: 'same-origin',
      body: op.cuerpo === undefined ? undefined : JSON.stringify(op.cuerpo),
    });
  } catch {
    throw new ErrorApi(0, 'RED', 'Sin conexión con el servidor.');
  }
  if (respuesta.status === 204) return undefined as T;
  const datos = await leerJson(respuesta);
  if (respuesta.ok) return datos as T;

  const e = datos?.error ?? {};
  const cabecera = Number(respuesta.headers.get('Retry-After')) || undefined;
  throw new ErrorApi(respuesta.status, e.codigo ?? 'ERROR_INTERNO', e.mensaje ?? '', e.detalles, e.reintentar_en_segundos ?? cabecera);
}

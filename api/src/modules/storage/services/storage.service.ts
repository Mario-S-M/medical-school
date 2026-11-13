import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { uniformError } from '../../../common/utils/api-exception';
import { AppConfig } from '../../../config/configuration';

// Datos de un objeto guardado, tal como los informa Storage.
export interface StorageObjectInfo {
  contentType: string;
  size: number;
}

interface StorageResponse {
  status: number;
  body: unknown;
}

interface ListedEntry {
  name?: unknown;
  id?: unknown;
}

const LIST_PAGE = 1000;
const DELETE_BATCH = 100;

// Supabase Storage por la red interna (`http://storage:5000`) con la clave de servicio (`SERVICE_ROLE_KEY`, que nunca sale
// en una respuesta ni en el registro). Un fallo de red, un tiempo agotado o una respuesta inesperada dan 500 ERROR_INTERNO
// sin filtrar nada. Las rutas son siempre relativas al bucket (`cursos/12/portada-<uuid>.png`).
@Injectable()
export class StorageService {
  private readonly logger = new Logger('StorageService');
  private readonly storage: AppConfig['storage'];
  private readonly serviceKey: string;

  constructor(config: ConfigService) {
    this.storage = config.getOrThrow<AppConfig['storage']>('storage');
    this.serviceKey = config.getOrThrow<AppConfig['auth']>('auth').serviceKey;
  }

  // Firma una subida de un solo uso y devuelve la ruta que contesta Storage (`/object/upload/sign/<bucket>/<ruta>?token=...`),
  // sin prefijo: quien la entregue al navegador antepone el suyo (`/almacen`).
  async signUpload(bucket: string, path: string): Promise<string> {
    const response = await this.call('POST', `/object/upload/sign/${bucket}/${encodePath(path)}`);
    const url = (response.body as { url?: unknown } | null)?.url;
    if (response.status !== 200 || typeof url !== 'string' || !url.startsWith('/object/upload/sign/')) throw uniformError(500, 'ERROR_INTERNO');
    return url;
  }

  // `null` si el objeto no existe (Storage contesta 400 o 404 con `statusCode: "404"`); cualquier otro fallo es un 500.
  async getObjectInfo(bucket: string, path: string): Promise<StorageObjectInfo | null> {
    const response = await this.call('GET', `/object/info/${bucket}/${encodePath(path)}`);
    if (response.status === 404 || response.status === 400) return null;
    const body = response.body as { content_type?: unknown; size?: unknown; metadata?: { mimetype?: unknown; size?: unknown } | null } | null;
    if (response.status !== 200 || !body) throw uniformError(500, 'ERROR_INTERNO');
    const contentType = body.content_type ?? body.metadata?.mimetype ?? '';
    return { contentType: String(contentType), size: Number(body.size ?? body.metadata?.size ?? 0) };
  }

  // Borra un objeto. Un objeto que no existe no es un error (el borrado es de limpieza).
  async deleteObject(bucket: string, path: string): Promise<void> {
    const response = await this.call('DELETE', `/object/${bucket}/${encodePath(path)}`);
    if (response.status !== 200 && response.status !== 400 && response.status !== 404) throw uniformError(500, 'ERROR_INTERNO');
  }

  // Borra todos los objetos bajo un prefijo ("carpeta"), a cualquier profundidad. Sin objetos no hace nada. Devuelve cuántos borró.
  async deletePrefix(bucket: string, prefix: string): Promise<number> {
    const paths = await this.listAll(bucket, prefix.replace(/^\/+|\/+$/g, ''));
    for (let i = 0; i < paths.length; i += DELETE_BATCH) {
      const response = await this.call('DELETE', `/object/${bucket}`, { prefixes: paths.slice(i, i + DELETE_BATCH) });
      if (response.status !== 200) throw uniformError(500, 'ERROR_INTERNO');
    }
    return paths.length;
  }

  // Ruta pública de un objeto de un bucket público, relativa a Storage; el front la sirve bajo `/almacen`.
  publicUrl(bucket: string, path: string): string {
    return `/almacen/object/public/${bucket}/${path}`;
  }

  // Recorre el árbol bajo `prefix`: las entradas sin `id` son carpetas y se visitan; las demás son objetos.
  private async listAll(bucket: string, prefix: string): Promise<string[]> {
    const files: string[] = [];
    for (let offset = 0; ; offset += LIST_PAGE) {
      const response = await this.call('POST', `/object/list/${bucket}`, { prefix, limit: LIST_PAGE, offset, sortBy: { column: 'name', order: 'asc' } });
      if (response.status !== 200 || !Array.isArray(response.body)) throw uniformError(500, 'ERROR_INTERNO');
      const entries = response.body as ListedEntry[];
      for (const entry of entries) {
        if (typeof entry.name !== 'string' || entry.name === '') continue;
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.id === null || entry.id === undefined) files.push(...(await this.listAll(bucket, path)));
        else files.push(path);
      }
      if (entries.length < LIST_PAGE) return files;
    }
  }

  private async call(method: string, path: string, body?: unknown): Promise<StorageResponse> {
    try {
      const response = await fetch(`${this.storage.url}${path}`, {
        method,
        // `apikey` lo exige el gateway (Kong) cuando se llega por fuera de la red de Docker; Storage la ignora.
        headers: {
          Authorization: `Bearer ${this.serviceKey}`,
          apikey: this.serviceKey,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(this.storage.timeoutMs),
      });
      const text = await response.text();
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
      return { status: response.status, body: parsed };
    } catch (error) {
      this.logger.error(`Fallo al llamar a Supabase Storage (${error instanceof Error ? error.name : 'desconocido'})`);
      throw uniformError(500, 'ERROR_INTERNO');
    }
  }
}

// Codifica cada segmento de la ruta y conserva las barras.
export function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

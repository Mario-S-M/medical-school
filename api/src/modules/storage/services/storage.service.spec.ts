import { ConfigService } from '@nestjs/config';
import { encodePath, StorageService } from './storage.service';

const config = {
  getOrThrow: (key: string) => (key === 'storage' ? { url: 'http://storage:5000', timeoutMs: 1000 } : { url: 'x', timeoutMs: 1, serviceKey: 'clave-de-prueba' }),
} as unknown as ConfigService;

const reply = (status: number, body: unknown): Response => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });

describe('StorageService', () => {
  let fetchMock: jest.SpyInstance;
  let service: StorageService;
  beforeEach(() => {
    service = new StorageService(config);
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });
  afterEach(() => fetchMock.mockRestore());

  it('encodePath codifica cada segmento y conserva las barras', () => {
    expect(encodePath('cursos/1/a b#c.png')).toBe('cursos/1/a%20b%23c.png');
  });

  it('signUpload firma con la clave de servicio y devuelve la ruta sin prefijo', async () => {
    fetchMock.mockResolvedValue(reply(200, { url: '/object/upload/sign/portadas/cursos/1/x.png?token=t', token: 't' }));
    expect(await service.signUpload('portadas', 'cursos/1/x.png')).toBe('/object/upload/sign/portadas/cursos/1/x.png?token=t');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://storage:5000/object/upload/sign/portadas/cursos/1/x.png');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer clave-de-prueba', apikey: 'clave-de-prueba' });
  });

  it('signUpload da 500 ERROR_INTERNO si Storage falla o contesta algo inesperado, sin filtrar la clave', async () => {
    for (const response of [reply(500, { message: 'clave-de-prueba' }), reply(200, { url: 'http://otro/sitio' }), reply(200, 'no es json')]) {
      fetchMock.mockResolvedValueOnce(response);
      await expect(service.signUpload('portadas', 'a.png')).rejects.toMatchObject({ code: 'ERROR_INTERNO', apiMessage: 'Error interno del servidor.' });
    }
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED clave-de-prueba'));
    await expect(service.signUpload('portadas', 'a.png')).rejects.toMatchObject({ code: 'ERROR_INTERNO' });
  });

  it('getObjectInfo lee tipo y tamaño y devuelve null si el objeto no existe (400 o 404)', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { content_type: 'image/png', size: 70 }));
    expect(await service.getObjectInfo('portadas', 'a.png')).toEqual({ contentType: 'image/png', size: 70 });
    fetchMock.mockResolvedValueOnce(reply(200, { metadata: { mimetype: 'image/webp', size: 5 } }));
    expect(await service.getObjectInfo('portadas', 'a.webp')).toEqual({ contentType: 'image/webp', size: 5 });
    fetchMock.mockResolvedValueOnce(reply(400, { statusCode: '404', error: 'not_found' }));
    expect(await service.getObjectInfo('portadas', 'nada')).toBeNull();
    fetchMock.mockResolvedValueOnce(reply(404, {}));
    expect(await service.getObjectInfo('portadas', 'nada')).toBeNull();
    fetchMock.mockResolvedValueOnce(reply(503, {}));
    await expect(service.getObjectInfo('portadas', 'a.png')).rejects.toMatchObject({ code: 'ERROR_INTERNO' });
  });

  it('deleteObject tolera un objeto inexistente pero no un fallo del servidor', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { message: 'Successfully deleted' }));
    await expect(service.deleteObject('portadas', 'a.png')).resolves.toBeUndefined();
    fetchMock.mockResolvedValueOnce(reply(400, { statusCode: '404' }));
    await expect(service.deleteObject('portadas', 'a.png')).resolves.toBeUndefined();
    fetchMock.mockResolvedValueOnce(reply(500, {}));
    await expect(service.deleteObject('portadas', 'a.png')).rejects.toMatchObject({ code: 'ERROR_INTERNO' });
  });

  it('deletePrefix recorre las carpetas (entradas sin id) y borra los archivos por lotes', async () => {
    fetchMock.mockImplementation((url: string, init: RequestInit) => {
      const body = init.body ? (JSON.parse(String(init.body)) as { prefix?: string; prefixes?: string[] }) : {};
      if (init.method === 'DELETE') return Promise.resolve(reply(200, body.prefixes?.map((name) => ({ name })) ?? []));
      if (body.prefix === 'v') return Promise.resolve(reply(200, [{ name: 'a.ts', id: '1' }, { name: 'hls', id: null }]));
      if (body.prefix === 'v/hls') return Promise.resolve(reply(200, [{ name: 'b.ts', id: '2' }, { name: 'lista.m3u8', id: '3' }]));
      return Promise.resolve(reply(200, []));
    });
    expect(await service.deletePrefix('videos', '/v/')).toBe(3);
    const deletes = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit).method === 'DELETE');
    expect(deletes).toHaveLength(1);
    expect(JSON.parse(String((deletes[0][1] as RequestInit).body))).toEqual({ prefixes: ['v/a.ts', 'v/hls/b.ts', 'v/hls/lista.m3u8'] });
  });

  it('deletePrefix sin objetos no llama a borrar', async () => {
    fetchMock.mockResolvedValue(reply(200, []));
    expect(await service.deletePrefix('videos', 'vacio')).toBe(0);
    expect(fetchMock.mock.calls.every(([, init]) => (init as RequestInit).method === 'POST')).toBe(true);
  });

  it('signDownloads firma todas las rutas en UNA llamada por lotes y devuelve las URL en el orden pedido', async () => {
    fetchMock.mockResolvedValue(
      reply(200, [
        { error: null, path: 'v/hls/segmento_00002.ts', signedURL: '/object/sign/videos/v/hls/segmento_00002.ts?token=b' },
        { error: null, path: 'v/hls/segmento_00001.ts', signedURL: '/object/sign/videos/v/hls/segmento_00001.ts?token=a' },
      ]),
    );
    const urls = await service.signDownloads('videos', ['v/hls/segmento_00001.ts', 'v/hls/segmento_00002.ts'], 600);
    expect(urls).toEqual(['/object/sign/videos/v/hls/segmento_00001.ts?token=a', '/object/sign/videos/v/hls/segmento_00002.ts?token=b']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://storage:5000/object/sign/videos');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ expiresIn: 600, paths: ['v/hls/segmento_00001.ts', 'v/hls/segmento_00002.ts'] });
  });

  it('signDownloads da 500 si falta un objeto o Storage contesta algo inesperado, y sin rutas no llama', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, [{ error: 'no existe', path: 'a.ts', signedURL: null }]));
    await expect(service.signDownloads('videos', ['a.ts'], 60)).rejects.toMatchObject({ code: 'ERROR_INTERNO' });
    fetchMock.mockResolvedValueOnce(reply(200, [{ error: null, path: 'a.ts', signedURL: 'http://otro/a.ts?token=x' }]));
    await expect(service.signDownloads('videos', ['a.ts'], 60)).rejects.toMatchObject({ code: 'ERROR_INTERNO' });
    fetchMock.mockResolvedValueOnce(reply(500, {}));
    await expect(service.signDownloads('videos', ['a.ts'], 60)).rejects.toMatchObject({ code: 'ERROR_INTERNO' });
    fetchMock.mockClear();
    expect(await service.signDownloads('videos', [], 60)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('downloadText lee el texto, devuelve null si no existe y da 500 si falla o pesa de más', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, '#EXTM3U\n'));
    expect(await service.downloadText('videos', 'v/hls/lista.m3u8', 100)).toBe('#EXTM3U\n');
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe('http://storage:5000/object/authenticated/videos/v/hls/lista.m3u8');
    fetchMock.mockResolvedValueOnce(reply(400, { statusCode: '404' }));
    expect(await service.downloadText('videos', 'nada', 100)).toBeNull();
    fetchMock.mockResolvedValueOnce(reply(500, 'clave-de-prueba'));
    await expect(service.downloadText('videos', 'a', 100)).rejects.toMatchObject({ code: 'ERROR_INTERNO', apiMessage: 'Error interno del servidor.' });
    fetchMock.mockResolvedValueOnce(reply(200, 'x'.repeat(101)));
    await expect(service.downloadText('videos', 'a', 100)).rejects.toMatchObject({ code: 'ERROR_INTERNO' });
  });

  it('publicUrl devuelve la ruta pública bajo /almacen', () => {
    expect(service.publicUrl('portadas', 'cursos/1/x.png')).toBe('/almacen/object/public/portadas/cursos/1/x.png');
  });
});

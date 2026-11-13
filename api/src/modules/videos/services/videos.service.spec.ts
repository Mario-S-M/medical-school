import { ApiException } from '../../../common/utils/api-exception';
import type { StorageService } from '../../storage/services/storage.service';
import type { VideosRepository, QueueCandidate } from '../repositories/videos.repository';
import type { TranscoderClient } from './transcoder-client.service';
import type { VideoFilesCleaner } from './video-files-cleaner';
import { VideosService } from './videos.service';

const candidate = (status: QueueCandidate['status']): QueueCandidate => ({
  id: 7, status, contentType: 'video/mp4', sizeBytes: 100, basePath: 'cursos/1/secciones/2/clases/3/7', keyHex: 'a'.repeat(32),
});

function setup(options: { video?: QueueCandidate | null; info?: { contentType: string; size: number } | null; queued?: boolean; accepted?: boolean } = {}) {
  const repository = {
    findForQueue: jest.fn().mockResolvedValue(options.video === undefined ? candidate('esperando_archivo') : options.video),
    markQueued: jest.fn().mockResolvedValue(options.queued ?? true),
    markServiceError: jest.fn().mockResolvedValue(undefined),
    reserve: jest.fn().mockResolvedValue({ id: 7, lessonFolder: 'cursos/1/secciones/2/clases/3' }),
    register: jest.fn().mockResolvedValue(true),
    deleteByLesson: jest.fn(),
    applyResult: jest.fn(),
  };
  const storage = {
    getObjectInfo: jest.fn().mockResolvedValue(options.info === undefined ? { contentType: 'video/mp4', size: 100 } : options.info),
    signUpload: jest.fn().mockResolvedValue('/object/upload/sign/videos/x?token=t'),
    deleteObject: jest.fn().mockResolvedValue(undefined),
  };
  const transcoder = { requestJob: jest.fn().mockResolvedValue(options.accepted ?? true) };
  const files = { deleteFolders: jest.fn().mockResolvedValue(undefined) };
  const service = new VideosService(repository as unknown as VideosRepository, storage as unknown as StorageService, transcoder as unknown as TranscoderClient, files as unknown as VideoFilesCleaner);
  return { service, repository, storage, transcoder, files };
}

const rejection = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
  } catch (error) {
    return error instanceof ApiException ? `${error.getStatus()} ${error.code}` : 'otro';
  }
  return 'sin error';
};

describe('VideosService.sign', () => {
  it('guarda una clave de 16 bytes aleatoria y no la devuelve', async () => {
    const { service, repository } = setup();
    const result = await service.sign(3, 'clase.mp4', 'video/mp4', 100);
    expect(result).toEqual({ video_id: 7, url_subida: '/almacen/object/upload/sign/videos/x?token=t', ruta: 'cursos/1/secciones/2/clases/3/7/original.mp4' });
    const record = repository.register.mock.calls[0][0] as { key: Buffer; basePath: string };
    expect(record.key).toHaveLength(16);
    expect(record.basePath).toBe('cursos/1/secciones/2/clases/3/7');
    expect(JSON.stringify(result)).not.toContain(record.key.toString('hex'));
  });

  it('cada video recibe una clave distinta', async () => {
    const { service, repository } = setup();
    await service.sign(3, 'a.mp4', 'video/mp4', 1);
    await service.sign(3, 'a.mp4', 'video/mp4', 1);
    const [a, b] = repository.register.mock.calls.map((call) => (call[0] as { key: Buffer }).key.toString('hex'));
    expect(a).not.toBe(b);
  });

  it('con un video en proceso da 409 VIDEO_EN_PROCESO', async () => {
    const { service, repository } = setup();
    repository.register.mockResolvedValue(false);
    expect(await rejection(service.sign(3, 'a.mp4', 'video/mp4', 1))).toBe('409 VIDEO_EN_PROCESO');
  });

  it('un tipo inválido se rechaza antes de tocar la base o Storage', async () => {
    const { service, repository, storage } = setup();
    expect(await rejection(service.sign(3, 'a.avi', 'video/avi', 1))).toBe('422 VIDEO_INVALIDO');
    expect(repository.reserve).not.toHaveBeenCalled();
    expect(storage.signUpload).not.toHaveBeenCalled();
  });
});

describe('VideosService.confirm y retry', () => {
  it('confirma: comprueba el original, pasa a en_cola y pide el trabajo con la clave', async () => {
    const { service, repository, transcoder } = setup();
    await service.confirm(7);
    expect(repository.markQueued).toHaveBeenCalledWith(7, 'esperando_archivo');
    expect(transcoder.requestJob).toHaveBeenCalledWith({
      videoId: 7, originalPath: 'cursos/1/secciones/2/clases/3/7/original.mp4', basePath: 'cursos/1/secciones/2/clases/3/7', keyHex: 'a'.repeat(32),
    });
  });

  it('sin archivo da VIDEO_INVALIDO y no cambia el estado', async () => {
    const { service, repository, transcoder } = setup({ info: null });
    expect(await rejection(service.confirm(7))).toBe('422 VIDEO_INVALIDO');
    expect(repository.markQueued).not.toHaveBeenCalled();
    expect(transcoder.requestJob).not.toHaveBeenCalled();
  });

  it('si el transcodificador no acepta, el video queda en error y da 503', async () => {
    const { service, repository } = setup({ accepted: false });
    expect(await rejection(service.confirm(7))).toBe('503 SERVICIO_NO_DISPONIBLE');
    expect(repository.markServiceError).toHaveBeenCalledWith(7);
  });

  it('confirmar dos veces o perder la carrera da 409 ESTADO_INVALIDO sin pedir otro trabajo', async () => {
    const twice = setup({ video: candidate('en_cola') });
    expect(await rejection(twice.service.confirm(7))).toBe('409 ESTADO_INVALIDO');
    const race = setup({ queued: false });
    expect(await rejection(race.service.confirm(7))).toBe('409 ESTADO_INVALIDO');
    expect(race.transcoder.requestJob).not.toHaveBeenCalled();
  });

  it('reintentar solo vale desde error y avisa si el original ya no está', async () => {
    const wrong = setup();
    expect(await rejection(wrong.service.retry(7))).toBe('409 ESTADO_INVALIDO');
    const gone = setup({ video: candidate('error'), info: null });
    expect(await rejection(gone.service.retry(7))).toBe('422 VIDEO_INVALIDO');
    const ok = setup({ video: candidate('error') });
    await ok.service.retry(7);
    expect(ok.repository.markQueued).toHaveBeenCalledWith(7, 'error');
  });

  it('un video inexistente da 404', async () => {
    expect(await rejection(setup({ video: null }).service.confirm(7))).toBe('404 NO_ENCONTRADO');
  });
});

describe('VideosService.applyResult y remove', () => {
  it('listo: borra los archivos del anterior y el original', async () => {
    const { service, repository, files, storage } = setup();
    repository.applyResult.mockResolvedValue({ applied: true, basePath: 'cursos/1/secciones/2/clases/3/7', contentType: 'video/mp4', previousBasePaths: ['cursos/1/secciones/2/clases/3/6'] });
    expect(await service.applyResult({ video_id: 7, resultado: 'listo', duracion_segundos: 12 })).toEqual({ aplicado: true });
    expect(files.deleteFolders).toHaveBeenCalledWith(['cursos/1/secciones/2/clases/3/6']);
    expect(storage.deleteObject).toHaveBeenCalledWith('videos', 'cursos/1/secciones/2/clases/3/7/original.mp4');
  });

  it('un reintento del aviso (o un video borrado) no aplica nada ni borra archivos', async () => {
    const { service, repository, files, storage } = setup();
    repository.applyResult.mockResolvedValue({ applied: false, basePath: null, contentType: null, previousBasePaths: [] });
    expect(await service.applyResult({ video_id: 7, resultado: 'listo' })).toEqual({ aplicado: false });
    expect(files.deleteFolders).not.toHaveBeenCalled();
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it('error: conserva los archivos', async () => {
    const { service, repository, files, storage } = setup();
    repository.applyResult.mockResolvedValue({ applied: true, basePath: 'x', contentType: 'video/mp4', previousBasePaths: [] });
    await service.applyResult({ video_id: 7, resultado: 'error', mensaje: 'dañado' });
    expect(repository.applyResult).toHaveBeenCalledWith(7, 'error', null, 'dañado');
    expect(files.deleteFolders).not.toHaveBeenCalled();
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it('un fallo al borrar el original no hace fallar el aviso', async () => {
    const { service, repository, storage } = setup();
    repository.applyResult.mockResolvedValue({ applied: true, basePath: 'x', contentType: 'video/mp4', previousBasePaths: [] });
    storage.deleteObject.mockRejectedValue(new Error('caído'));
    expect(await service.applyResult({ video_id: 7, resultado: 'listo' })).toEqual({ aplicado: true });
  });

  it('borrar sin videos da 404; con videos borra sus carpetas', async () => {
    const empty = setup();
    empty.repository.deleteByLesson.mockResolvedValue([]);
    expect(await rejection(empty.service.remove(3))).toBe('404 NO_ENCONTRADO');
    const full = setup();
    full.repository.deleteByLesson.mockResolvedValue(['a', 'b']);
    await full.service.remove(3);
    expect(full.files.deleteFolders).toHaveBeenCalledWith(['a', 'b']);
  });
});

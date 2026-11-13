import type { StorageService } from '../../storage/services/storage.service';
import { StorageVideoFilesCleaner } from './storage-video-files-cleaner';

function setup(failing: string[] = []) {
  const deletePrefix = jest.fn((_bucket: string, prefix: string) => (failing.includes(prefix) ? Promise.reject(new Error('Storage caído: secreto')) : Promise.resolve(1)));
  return { cleaner: new StorageVideoFilesCleaner({ deletePrefix } as unknown as StorageService), deletePrefix };
}

describe('StorageVideoFilesCleaner', () => {
  it('borra el prefijo de cada ruta base en el bucket videos, sin repetir', async () => {
    const { cleaner, deletePrefix } = setup();
    await cleaner.deleteFolders(['cursos/1/a', 'cursos/1/b', 'cursos/1/a']);
    expect(deletePrefix.mock.calls).toEqual([['videos', 'cursos/1/a'], ['videos', 'cursos/1/b']]);
  });

  it('un fallo de Storage no se propaga y no impide borrar las demás carpetas', async () => {
    const { cleaner, deletePrefix } = setup(['cursos/1/a']);
    await expect(cleaner.deleteFolders(['cursos/1/a', 'cursos/1/b'])).resolves.toBeUndefined();
    expect(deletePrefix).toHaveBeenCalledTimes(2);
  });

  it('sin rutas no llama a Storage', async () => {
    const { cleaner, deletePrefix } = setup();
    await cleaner.deleteFolders([]);
    expect(deletePrefix).not.toHaveBeenCalled();
  });
});

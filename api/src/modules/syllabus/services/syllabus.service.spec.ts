import { SyllabusService } from './syllabus.service';
import type { SyllabusRepository } from '../repositories/syllabus.repository';
import type { VideoFilesCleaner } from '../../videos/services/video-files-cleaner';

function setup(paths: string[] | null, cleanerFails = false) {
  const repository = { deleteSection: jest.fn().mockResolvedValue(paths), deleteLesson: jest.fn().mockResolvedValue(paths) } as unknown as SyllabusRepository;
  const deleteFolders = jest.fn().mockImplementation(() => (cleanerFails ? Promise.reject(new Error('Storage caído')) : Promise.resolve()));
  const service = new SyllabusService(repository, { deleteFolders } as unknown as VideoFilesCleaner);
  return { service, deleteFolders };
}

describe('SyllabusService y el borrado de archivos de video', () => {
  it('al borrar una sección o una clase avisa al VideoFilesCleaner con las rutas base de sus videos', async () => {
    const { service, deleteFolders } = setup(['cursos/1/a', 'cursos/1/b']);
    await service.deleteSection(1, 2);
    await service.deleteLesson(1, 3);
    expect(deleteFolders).toHaveBeenNthCalledWith(1, ['cursos/1/a', 'cursos/1/b']);
    expect(deleteFolders).toHaveBeenCalledTimes(2);
  });

  it('sin videos no llama al cleaner', async () => {
    const { service, deleteFolders } = setup([]);
    await service.deleteSection(1, 2);
    expect(deleteFolders).not.toHaveBeenCalled();
  });

  it('si la fila ya no existe da NO_ENCONTRADO y no borra archivos', async () => {
    const { service, deleteFolders } = setup(null);
    await expect(service.deleteSection(1, 2)).rejects.toMatchObject({ code: 'NO_ENCONTRADO', apiMessage: 'La sección no existe en este curso.' });
    await expect(service.deleteLesson(1, 3)).rejects.toMatchObject({ code: 'NO_ENCONTRADO', apiMessage: 'La clase no existe en este curso.' });
    expect(deleteFolders).not.toHaveBeenCalled();
  });

  it('si el borrado de archivos falla, las filas ya se borraron y la operación termina bien', async () => {
    const { service } = setup(['cursos/1/a'], true);
    await expect(service.deleteSection(1, 2)).resolves.toBeUndefined();
  });
});

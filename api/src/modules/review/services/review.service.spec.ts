import { CatalogRepository } from '../../catalog/repositories/catalog.repository';
import { ReviewRepository } from '../repositories/review.repository';
import { ReviewService } from './review.service';

function service(repo: Partial<ReviewRepository>, catalog: Partial<CatalogRepository> = {}): ReviewService {
  return new ReviewService(repo as ReviewRepository, catalog as CatalogRepository);
}

describe('ReviewService.submit', () => {
  it('un curso completo en borrador pasa a en_revision', async () => {
    await expect(service({ submit: jest.fn().mockResolvedValue({ missing: [], status: 'borrador', submitted: true }) }).submit(1)).resolves.toEqual({ status: 'en_revision' });
  });

  it('si no estaba en borrador da ESTADO_INVALIDO 409 aunque falten datos', async () => {
    const repo = { submit: jest.fn().mockResolvedValue({ missing: ['falta_portada'], status: 'publicado', submitted: false }) };
    await expect(service(repo).submit(1)).rejects.toMatchObject({ status: 409, code: 'ESTADO_INVALIDO', apiMessage: 'Solo se pueden enviar a revisión los cursos en borrador.' });
  });

  it('con faltas da CURSO_INCOMPLETO 422 con una regla y mensaje por falta, en el orden recibido', async () => {
    const repo = { submit: jest.fn().mockResolvedValue({ missing: ['falta_portada', 'seccion_vacia', 'falta_video'], status: 'borrador', submitted: false }) };
    await expect(service(repo).submit(1)).rejects.toMatchObject({
      status: 422,
      code: 'CURSO_INCOMPLETO',
      apiMessage: 'Al curso le faltan datos para enviarlo a revisión.',
      details: [
        { campo: 'curso', regla: 'falta_portada', mensaje: 'Falta la portada.' },
        { campo: 'curso', regla: 'seccion_vacia', mensaje: 'Hay secciones sin ninguna clase.' },
        { campo: 'curso', regla: 'falta_video', mensaje: 'Hay clases sin video listo.' },
      ],
    });
  });
});

describe('ReviewService.resolve y retire', () => {
  it('aprobar da publicado y devolver da borrador', async () => {
    const repo = { resolve: jest.fn().mockResolvedValue('ok') };
    await expect(service(repo).resolve(1, true, null)).resolves.toEqual({ status: 'publicado' });
    await expect(service(repo).resolve(1, false, 'Corrige')).resolves.toEqual({ status: 'borrador' });
  });

  it('traduce cada resultado a su error del contrato', async () => {
    const run = (result: string) => service({ resolve: jest.fn().mockResolvedValue(result) }).resolve(1, false, null);
    await expect(run('not_found')).rejects.toMatchObject({ status: 404, code: 'NO_ENCONTRADO', apiMessage: 'El curso no existe.' });
    await expect(run('invalid_state')).rejects.toMatchObject({ status: 409, code: 'ESTADO_INVALIDO', apiMessage: 'Solo se pueden resolver cursos que están en revisión.' });
    await expect(run('missing_comment')).rejects.toMatchObject({
      status: 422,
      code: 'VALIDACION_FALLIDA',
      details: [{ campo: 'comentario', regla: 'obligatorio_si_se_devuelve', mensaje: 'Explica al instructor qué debe cambiar.' }],
    });
  });

  it('retirar: ok da borrador; inexistente 404; no publicado 409', async () => {
    const run = (result: string) => service({ retire: jest.fn().mockResolvedValue(result) }).retire(1, 'x');
    await expect(run('ok')).resolves.toEqual({ status: 'borrador' });
    await expect(run('not_found')).rejects.toMatchObject({ status: 404, code: 'NO_ENCONTRADO' });
    await expect(run('invalid_state')).rejects.toMatchObject({ status: 409, code: 'ESTADO_INVALIDO', apiMessage: 'Solo se pueden retirar los cursos publicados.' });
  });
});

describe('ReviewService.listPending', () => {
  it('une cada curso con su temario y da la fecha ISO', async () => {
    const date = new Date('2026-11-12T10:00:00.000Z');
    const row = { id: '5', slug: 's', titulo: 'T', subtitulo: null, descripcion: null, conocimientos_previos: null, lo_que_aprenderas: [], nivel: null, categoria: null, portada_ruta: null, instructor: 'I', actualizado_en: date };
    const sections = [{ id: 1, title: 'S', position: 1, lessons: [] }];
    const result = await service({ findPending: jest.fn().mockResolvedValue([row]) }, { findTrees: jest.fn().mockResolvedValue(new Map([[5, sections]])) }).listPending();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 5, updatedAt: '2026-11-12T10:00:00.000Z', sections });
  });
});

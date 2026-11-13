import { ApiException } from '../../../common/utils/api-exception';
import { CatalogRepository } from '../repositories/catalog.repository';
import { CatalogService } from './catalog.service';

const card = { slug: 'a', titulo: 'A', subtitulo: null, nivel: 'basico', categoria: 'Anatomía', categoria_slug: 'anatomia', instructor: 'I', portada_ruta: null, secciones: '2', clases: '5' };

function service(repo: Partial<CatalogRepository>): CatalogService {
  return new CatalogService(repo as CatalogRepository);
}

describe('CatalogService', () => {
  it('calcula las páginas con 12 por página y pasa los filtros con la página por omisión', async () => {
    const findPage = jest.fn().mockResolvedValue({ total: 13, cards: [card] });
    const result = await service({ findPage }).list({ q: 'anatomia' });
    expect(findPage).toHaveBeenCalledWith({ q: 'anatomia', category: null, level: null, page: 1 });
    expect(result).toMatchObject({ total: 13, page: 1, pages: 2 });
    expect(result.courses[0]).toEqual({
      slug: 'a', title: 'A', subtitle: null, level: 'basico', category: 'Anatomía', categorySlug: 'anatomia', instructor: 'I', coverPath: null, sectionCount: 2, lessonCount: 5,
    });
  });

  it('sin resultados da 0 páginas y conserva la página pedida', async () => {
    const result = await service({ findPage: jest.fn().mockResolvedValue({ total: 0, cards: [] }) }).list({ pagina: 3 });
    expect(result).toEqual({ courses: [], total: 0, page: 3, pages: 0 });
  });

  it('la ficha de un curso inexistente o no publicado da NO_ENCONTRADO 404', async () => {
    await expect(service({ findPublished: jest.fn().mockResolvedValue(null) }).detail('x')).rejects.toMatchObject({ code: 'NO_ENCONTRADO', status: 404 });
    await expect(service({ findPublished: jest.fn().mockResolvedValue(null) }).detail('x')).rejects.toBeInstanceOf(ApiException);
  });

  it('arma la ficha con categoría anidada, fecha ISO y sin campos internos', async () => {
    const row = {
      id: '7', slug: 's', titulo: 'T', subtitulo: null, descripcion: 'd', conocimientos_previos: null, lo_que_aprenderas: ['x'], nivel: null,
      categoria_nombre: 'Anatomía', categoria_slug: 'anatomia', portada_ruta: null, instructor: 'I', publicado_en: new Date('2026-11-12T10:00:00.000Z'),
    };
    const detail = await service({ findPublished: jest.fn().mockResolvedValue(row), findTrees: jest.fn().mockResolvedValue(new Map([[7, []]])) }).detail('s');
    expect(detail).toMatchObject({ id: 7, category: { name: 'Anatomía', slug: 'anatomia' }, publishedAt: '2026-11-12T10:00:00.000Z', sections: [] });
    expect(Object.keys(detail).join()).not.toMatch(/instructorId|reviewComment|status/);
  });
});

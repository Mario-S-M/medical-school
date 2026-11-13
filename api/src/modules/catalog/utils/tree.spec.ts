import { buildTrees } from './tree';

describe('buildTrees', () => {
  const sections = [
    { id: '1', curso_id: '5', titulo: 'S1', posicion: 1 },
    { id: '2', curso_id: '5', titulo: 'S2', posicion: 2 },
    { id: '3', curso_id: '6', titulo: 'S3', posicion: 1 },
  ];
  const lessons = [
    { id: '11', seccion_id: '1', titulo: 'L1', descripcion: null, duracion_estimada_minutos: 5, es_muestra: true, posicion: 1 },
    { id: '12', seccion_id: '1', titulo: 'L2', descripcion: 'd', duracion_estimada_minutos: null, es_muestra: false, posicion: 2 },
    { id: '13', seccion_id: '3', titulo: 'L3', descripcion: null, duracion_estimada_minutos: null, es_muestra: false, posicion: 1 },
  ];

  it('reparte secciones por curso y clases por sección, conservando el orden y con ids numéricos', () => {
    const trees = buildTrees([5, 6, 7], sections, lessons);
    expect(trees.get(5)?.map((s) => [s.id, s.lessons.map((l) => l.id)])).toEqual([[1, [11, 12]], [2, []]]);
    expect(trees.get(6)?.map((s) => [s.id, s.lessons.map((l) => l.id)])).toEqual([[3, [13]]]);
  });

  it('un curso sin secciones queda con lista vacía y la clase trae sus campos del contrato', () => {
    const trees = buildTrees([5, 7], sections, lessons);
    expect(trees.get(7)).toEqual([]);
    expect(trees.get(5)?.[0].lessons[0]).toEqual({ id: 11, title: 'L1', description: null, estimatedMinutes: 5, isSample: true, position: 1 });
  });
});

import { parse } from 'graphql';
import { LIST_SIZES, MAX_COST, MAX_DEPTH, checkComplexity, measureDocument } from './query-complexity';

const nested = (levels: number): string => `{ ${'a { '.repeat(levels - 1)}a${' }'.repeat(levels - 1)} }`;
const measure = (q: string) => measureDocument(parse(q))[0];
const attempt = (q: string, introspection = false) => () => checkComplexity(parse(q), { allowIntrospection: introspection });

describe('profundidad y costo de una consulta', () => {
  it('mide { yo { id } } como profundidad 2 y costo 2', () => {
    expect(measure('{ yo { id } }')).toEqual({ depth: 2, cost: 2 });
  });

  it('acepta la profundidad máxima (8) y rechaza la 9 con CONSULTA_DEMASIADO_COMPLEJA y 400', () => {
    expect(MAX_DEPTH).toBe(8);
    expect(attempt(nested(8))).not.toThrow();
    expect(attempt(nested(9))).toThrow(expect.objectContaining({ code: 'CONSULTA_DEMASIADO_COMPLEJA', status: 400 }));
  });

  it('una consulta muy anidada se rechaza al pasar el máximo, sin recorrerla entera', () => {
    expect(attempt(nested(300))).toThrow(expect.objectContaining({ code: 'CONSULTA_DEMASIADO_COMPLEJA' }));
  });

  it('los fragmentos no suman nivel y los fragmentos en línea tampoco', () => {
    expect(measure('fragment f on T { id } { yo { ...f } }').depth).toBe(2);
    expect(measure('{ yo { ... on Usuario { id } } }').depth).toBe(2);
  });

  it('cuenta el costo con cada alias y rechaza más de 1000 fields', () => {
    const fields = (n: number) => `{ ${Array.from({ length: n }, (_, i) => `c${i}: yo { id }`).join(' ')} }`;
    expect(MAX_COST).toBe(1000);
    expect(attempt(fields(500))).not.toThrow(); // 500 x 2 = 1000
    expect(attempt(fields(501))).toThrow(expect.objectContaining({ code: 'CONSULTA_DEMASIADO_COMPLEJA' }));
  });

  it('un fragmento usado muchas veces cuesta cada vez (no se esquiva con fragmentos)', () => {
    const q = `fragment f on T { a b c d e f g h i j } { ${'...f '.repeat(101)} }`; // 101 x 10 = 1010
    expect(measure(q).cost).toBe(1010);
    expect(attempt(q)).toThrow(expect.objectContaining({ code: 'CONSULTA_DEMASIADO_COMPLEJA' }));
  });

  it('una cadena de fragmentos que se duplican no hace explotar el cálculo', () => {
    let q = 'fragment f0 on T { a }\n';
    for (let i = 1; i < 60; i++) q += `fragment f${i} on T { ...f${i - 1} ...f${i - 1} }\n`;
    q += '{ ...f59 }';
    expect(attempt(q)).toThrow(expect.objectContaining({ code: 'CONSULTA_DEMASIADO_COMPLEJA' }));
  });

  it('rechaza los fragmentos que se llaman a sí mismos', () => {
    expect(attempt('fragment f on T { ...f } { ...f }')).toThrow(expect.objectContaining({ code: 'CONSULTA_DEMASIADO_COMPLEJA' }));
  });

  it('evalúa todas las operaciones del documento', () => {
    expect(attempt(`query A { a } query B ${nested(9)}`)).toThrow(expect.objectContaining({ code: 'CONSULTA_DEMASIADO_COMPLEJA' }));
  });

  it('la introspección propia de desarrollo no se bloquea, pero solo si se permite', () => {
    const intro = '{ __schema { types { fields { type { ofType { ofType { ofType { ofType { ofType { ofType { name } } } } } } } } } } }';
    expect(attempt(intro, true)).not.toThrow();
    expect(attempt(intro, false)).toThrow(expect.objectContaining({ code: 'CONSULTA_DEMASIADO_COMPLEJA' }));
    // mezclar un campo normal con __schema no la exime
    expect(attempt(`{ yo { id } __schema ${'{ a '.repeat(9)}${'}'.repeat(9)} }`.replace('__schema {', '__schema {'), true)).toThrow();
  });
});

// SPEC 10, paso 3: las listas multiplican por su tamaño máximo razonable (`LIST_SIZES`).
describe('costo de las listas', () => {
  const EDITING = `{ curso_edicion(id: 1) {
    id slug titulo subtitulo descripcion conocimientos_previos lo_que_aprenderas nivel categoria_id estado
    comentario_revision portada_ruta actualizado_en es_dueno
    secciones { id titulo posicion clases { id titulo descripcion duracion_estimada_minutos es_muestra posicion
      video { estado duracion_segundos } video_nuevo { id estado error } } } } }`;

  it('conoce el tamaño de las listas de la API', () => {
    expect(LIST_SIZES).toMatchObject({ cursos: 12, secciones: 20, clases: 30 });
  });

  it('una lista cuesta 1 más tamaño x (1 + el costo de sus listas anidadas): sus campos simples vienen en el elemento', () => {
    expect(measure('{ cursos { id titulo slug } }').cost).toBe(1 + 12 * 1);
    expect(measure('{ mis_cursos { id } }').cost).toBe(1 + 50 * 1);
    expect(measure('{ secciones { id clases { id titulo } } }').cost).toBe(1 + 20 * (1 + (1 + 30 * 1)));
  });

  it('los campos fuera de listas siguen costando 1 y un campo con otro nombre no es una lista', () => {
    expect(measure('{ yo { id correo nombre } }').cost).toBe(4);
    expect(measure('{ curso { id titulo } }').cost).toBe(3);
  });

  it('un curso completo del editor (10 secciones x 30 clases) queda por debajo de 1000, con profundidad 5', () => {
    const editing = measure(EDITING);
    expect(editing).toEqual({ depth: 5, cost: 1 + 14 + 1 + 20 * (1 + (1 + 30 * 1)) });
    expect(editing.cost).toBeLessThan(MAX_COST);
    expect(attempt(EDITING)).not.toThrow();
  });

  it('listas anidadas pedidas varias veces (alias) superan el costo máximo', () => {
    const twice = EDITING.replace('{ curso_edicion', '{ a: curso_edicion').replace(/\}\s*$/, '') + ' b: curso_edicion(id: 2) { id secciones { id clases { id } } } }';
    expect(measure(twice).cost).toBeGreaterThan(MAX_COST);
    expect(attempt(twice)).toThrow(expect.objectContaining({ code: 'CONSULTA_DEMASIADO_COMPLEJA', status: 400 }));
  });

  it('una consulta abusiva con listas anidadas profundas lo supera aunque pida un solo campo por nivel', () => {
    const q = '{ cursos { secciones { clases { id } } } }'; // 1 + 12 x (1 + (1 + 20 x (1 + (1 + 30))))
    expect(measure(q).cost).toBe(1 + 12 * (1 + (1 + 20 * (1 + (1 + 30)))));
    expect(attempt(q)).toThrow(expect.objectContaining({ code: 'CONSULTA_DEMASIADO_COMPLEJA' }));
  });

  it('un fragmento dentro de una lista se mide como parte del elemento y fuera de ella como campos sueltos', () => {
    const fragment = 'fragment f on T { id titulo estado }';
    expect(measure(`${fragment} { mis_cursos { ...f } }`).cost).toBe(1 + 50 * 1);
    expect(measure(`${fragment} { curso { ...f } }`).cost).toBe(1 + 3);
    expect(measure(`${fragment} { mis_cursos { ...f } curso { ...f } }`).cost).toBe(1 + 50 + 1 + 3);
  });

  it('la profundidad máxima sigue siendo 8, también con listas', () => {
    const deep = `{ cursos { ${'a { '.repeat(7)}id ${'}'.repeat(7)} } }`;
    expect(attempt(deep)).toThrow(expect.objectContaining({ code: 'CONSULTA_DEMASIADO_COMPLEJA' }));
  });
});

// SPEC 10, paso 4 y 5: el catálogo y la revisión caben en el costo máximo.
describe('costo del catálogo y la revisión', () => {
  const PAGE = '{ cursos { total pagina paginas cursos { slug titulo subtitulo nivel categoria categoria_slug instructor portada_ruta secciones clases } } }';
  const DETAIL = `{ curso(slug: "x") { id slug titulo subtitulo descripcion conocimientos_previos lo_que_aprenderas nivel categoria { nombre slug } portada_ruta instructor publicado_en
    secciones { id titulo posicion clases { id titulo descripcion duracion_estimada_minutos es_muestra posicion } } } }`;
  const REVIEW = `{ cursos_en_revision { id slug titulo subtitulo descripcion conocimientos_previos lo_que_aprenderas nivel categoria portada_ruta instructor actualizado_en
    secciones { id titulo posicion clases { id titulo descripcion duracion_estimada_minutos es_muestra posicion } } } }`;

  it('una página de 12 tarjetas (con sus contadores `secciones` y `clases`, que no son listas) cuesta mucho menos que 1000', () => {
    expect(measure(PAGE).cost).toBeLessThan(MAX_COST);
    expect(attempt(PAGE)).not.toThrow();
  });

  it('la ficha con secciones y clases cabe en el límite, y pedir dos fichas en una consulta no', () => {
    expect(measure(DETAIL).cost).toBeLessThan(MAX_COST);
    expect(attempt(DETAIL)).not.toThrow();
    expect(attempt(`{ a: ${DETAIL.slice(2, -2)} b: ${DETAIL.slice(2, -2)} }`)).toThrow(expect.objectContaining({ code: 'CONSULTA_DEMASIADO_COMPLEJA' }));
  });

  it('los cursos en revisión con su temario completo caben una vez, y no se pueden pedir dos veces con alias', () => {
    expect(measure(REVIEW).cost).toBeLessThan(MAX_COST);
    expect(attempt(REVIEW)).not.toThrow();
    expect(attempt(`{ a: ${REVIEW.slice(2, -2)} b: ${REVIEW.slice(2, -2)} }`)).toThrow(expect.objectContaining({ code: 'CONSULTA_DEMASIADO_COMPLEJA' }));
  });
});

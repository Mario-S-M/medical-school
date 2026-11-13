import { DocumentNode, FragmentDefinitionNode, Kind, OperationDefinitionNode, SelectionSetNode } from 'graphql';
import { ApiException } from '../../common/utils/api-exception';

export const MAX_DEPTH = 8;
export const MAX_COST = 1000;

// Mercurius trae `queryDepth` pero no un límite de costo, y su error no lleva nuestro código. Una sola pasada mide las dos
// cosas con las mismas reglas:
//  - profundidad: niveles de campos anidados (`{ yo { id } }` vale 2). Los fragmentos no suman nivel.
//  - costo: 1 por cada campo pedido, con los fragmentos expandidos tantas veces como se usen (así un alias repetido o un
//    fragmento usado muchas veces también cuesta).
//  - listas (SPEC 10): un campo de `LIST_SIZES` es una lista y se cuenta con su tamaño máximo razonable. Cuesta 1 más
//    `tamaño x (1 + lo que cuesta cada elemento)`. Dentro de una lista cada elemento cuesta 1 (sus campos simples y objetos
//    uno a uno vienen incluidos) y solo suman aparte las listas anidadas, que multiplican otra vez: `secciones[].clases[]`
//    cuesta 20 x (1 + 30 x 1). Fuera de las listas cada campo sigue costando 1.
// El multiplicador es una estimación fija por nombre de campo (la regla no conoce el esquema), no el tamaño real de la
// respuesta: un curso con más secciones que `LIST_SIZES.secciones` se sigue devolviendo completo.
// Los fragmentos se miden una sola vez por contexto (memoria) para que ninguna cadena de fragmentos dispare el cálculo. Se
// corta al pasar la profundidad máxima, así que un documento hostil no hace recursión profunda.

// Tamaño máximo razonable de cada lista de la API, por nombre de campo del contrato.
export const LIST_SIZES: Readonly<Record<string, number>> = {
  categorias: 50,
  cursos: 12, // una página del catálogo
  mis_cursos: 50,
  // El administrador pide cada curso pendiente con su temario completo: con 50 x (20 x 30) no cabría en el costo máximo
  // ni una sola vez, así que se cuenta como máximo 1 curso con árbol completo (la cola real de revisión es corta).
  cursos_en_revision: 1,
  secciones: 20,
  clases: 30,
};

export interface Measure {
  depth: number;
  cost: number;
}

type Fragments = Map<string, FragmentDefinitionNode>;
type Memo = Map<string, Measure | 'in_progress'>;

// `inRow`: la selección es el contenido de un elemento de lista (o de un objeto dentro de él).
function measureSelectionSet(selectionSet: SelectionSetNode, level: number, fragments: Fragments, memo: Memo, inRow: boolean): Measure {
  // Con `nivel` campos ya anidados, un solo campo más ya pasa del máximo: no hace falta seguir bajando.
  if (level >= MAX_DEPTH && selectionSet.selections.length > 0) return { depth: 1, cost: 1 };
  let depth = 0;
  let cost = 0;
  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.FIELD) {
      const size = Object.hasOwn(LIST_SIZES, selection.name.value) ? LIST_SIZES[selection.name.value] : undefined;
      const child = selection.selectionSet ? measureSelectionSet(selection.selectionSet, level + 1, fragments, memo, inRow || size !== undefined) : null;
      depth = Math.max(depth, 1 + (child?.depth ?? 0));
      if (child && size !== undefined) cost += 1 + size * (1 + child.cost);
      else cost += (inRow ? 0 : 1) + (child?.cost ?? 0);
    } else if (selection.kind === Kind.INLINE_FRAGMENT) {
      const inner = measureSelectionSet(selection.selectionSet, level, fragments, memo, inRow);
      depth = Math.max(depth, inner.depth);
      cost += inner.cost;
    } else {
      const name = selection.name.value;
      const definition = fragments.get(name);
      if (!definition) continue; // la validación de GraphQL lo rechaza después
      const key = `${name}|${inRow}`;
      let measure = memo.get(key);
      if (measure === 'in_progress') return { depth: Infinity, cost: Infinity }; // ciclo de fragmentos
      if (measure === undefined) {
        memo.set(key, 'in_progress');
        measure = measureSelectionSet(definition.selectionSet, 0, fragments, memo, inRow);
        memo.set(key, measure);
      }
      depth = Math.max(depth, measure.depth);
      cost += measure.cost;
    }
  }
  return { depth, cost };
}

function operations(document: DocumentNode): OperationDefinitionNode[] {
  return document.definitions.filter((d): d is OperationDefinitionNode => d.kind === Kind.OPERATION_DEFINITION);
}

export function measureDocument(document: DocumentNode): Measure[] {
  const fragments: Fragments = new Map();
  for (const d of document.definitions) if (d.kind === Kind.FRAGMENT_DEFINITION) fragments.set(d.name.value, d);
  const memo: Memo = new Map();
  return operations(document).map((o) => measureSelectionSet(o.selectionSet, 0, fragments, memo, false));
}

// Introspección propia de desarrollo (GraphiQL, codegen): operaciones cuyos campos de primer nivel son todos `__*`.
// Es profunda por naturaleza y no debe bloquearse; en producción no se aplica esta excepción.
function isIntrospection(operation: OperationDefinitionNode): boolean {
  const { selections } = operation.selectionSet;
  return selections.length > 0 && selections.every((s) => s.kind === Kind.FIELD && s.name.value.startsWith('__'));
}

// Lanza `400 CONSULTA_DEMASIADO_COMPLEJA` si alguna operación pasa la profundidad o el costo máximos.
export function checkComplexity(document: DocumentNode, options: { allowIntrospection: boolean }): void {
  const ops = operations(document);
  const measures = measureDocument(document);
  measures.forEach((m, i) => {
    if (options.allowIntrospection && isIntrospection(ops[i])) return;
    if (m.depth > MAX_DEPTH || m.cost > MAX_COST) {
      throw new ApiException(400, 'CONSULTA_DEMASIADO_COMPLEJA');
    }
  });
}

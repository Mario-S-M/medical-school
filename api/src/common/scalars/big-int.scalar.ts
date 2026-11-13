import { GraphQLError, GraphQLScalarType, Kind, ValueNode } from 'graphql';

// Los ids de curso, sección, clase y video son `bigint` y el contrato admite hasta 9007199254740 (el `Int` de GraphQL
// llega solo a 2^31). Se aceptan solo enteros seguros de JavaScript; los límites del contrato (1 a 9007199254740) los
// valida `class-validator` y dan `VALIDACION_FALLIDA` con `detalles`, como los workflows.
function toSafeInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new GraphQLError('Debe ser un número entero.');
  return value;
}

export const BigIntScalar = new GraphQLScalarType<number, number>({
  name: 'EnteroGrande',
  description: 'Entero de hasta 2^53 - 1 para los identificadores bigint.',
  serialize: (value) => toSafeInteger(typeof value === 'string' ? Number(value) : value),
  parseValue: (value) => toSafeInteger(value),
  parseLiteral: (ast: ValueNode) => {
    if (ast.kind !== Kind.INT) throw new GraphQLError('Debe ser un número entero.');
    return toSafeInteger(Number(ast.value));
  },
});

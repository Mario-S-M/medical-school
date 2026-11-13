import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { z, type ZodType } from 'zod';
import { GRAPHQL, request } from './client';
import { parseResponse } from './parse';

// Respuesta de las mutaciones que solo confirman (`{ ok: true }`).
export const confirmationSchema = z.object({ ok: z.boolean() });

type Persisted = { __meta__: { hash: string }; definitions: readonly { name?: { value: string } }[] };

// Ejecuta una operación de GraphQL enviando solo el hash persistido (`extensions.persistedQuery`), nunca el texto.
// El nombre de la operación es el del campo raíz (`mis_roles`, `crear_curso`...), y Zod valida ese campo de `data`.
export async function runGraphql<D, V, T>(
  document: TypedDocumentNode<D, V>,
  variables: V,
  schema: ZodType<T>,
  options: { skipAuth?: boolean } = {},
): Promise<T> {
  const { __meta__, definitions } = document as unknown as Persisted;
  const operationName = definitions[0]?.name?.value ?? '';
  const body = { operationName, variables, extensions: { persistedQuery: { version: 1, sha256Hash: __meta__.hash } } };
  const response = await request<{ data?: Record<string, unknown> | null }>({ method: 'POST', url: GRAPHQL, data: body, skipAuth: options.skipAuth });
  return parseResponse(schema, response.data?.[operationName]);
}

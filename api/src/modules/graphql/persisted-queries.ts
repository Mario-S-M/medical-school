import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'graphql';

// Manifiesto de consultas persistidas: `{ "<sha256>": "<consulta>" }`. Lo escribe el codegen del front
// (`@graphql-codegen/client-preset`, `persistedDocuments`) y se versiona aquí. La clave que escribe el codegen actual lleva el
// prefijo `sha256:` (hash hexadecimal del documento impreso); se aceptan las dos formas.
export const MANIFEST_PATH = resolve(__dirname, '../../../graphql/persisted-queries.json');
const HASH_FORMAT = /^(?:sha256:)?([a-f0-9]{64})$/;

export type Manifest = Record<string, string>; // sin prototipo; clave = 64 hex sin prefijo

export function normalizeHash(hash: unknown): string | null {
  if (typeof hash !== 'string') return null;
  return HASH_FORMAT.exec(hash)?.[1] ?? null;
}

export function hashOfQuery(query: string): string {
  return createHash('sha256').update(query, 'utf8').digest('hex');
}

// Lista de problemas del manifiesto (vacía si está bien): la clave debe ser el sha256 de su consulta y esta debe parsear.
export function verifyManifest(data: unknown): string[] {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return ['El manifiesto debe ser un objeto { hash: consulta }.'];
  const problems: string[] = [];
  for (const [key, query] of Object.entries(data)) {
    const hash = normalizeHash(key);
    if (!hash) problems.push(`La clave "${key}" no es un sha256 hexadecimal.`);
    else if (typeof query !== 'string') problems.push(`${key}: la consulta debe ser un texto.`);
    else if (hashOfQuery(query) !== hash) problems.push(`${key}: el hash no corresponde a su consulta.`);
    else {
      try {
        parse(query);
      } catch {
        problems.push(`${key}: la consulta no es GraphQL válido.`);
      }
    }
  }
  return problems;
}

export function loadManifest(path = MANIFEST_PATH): Manifest {
  if (!existsSync(path)) throw new Error(`Falta el manifiesto de consultas persistidas: ${path}`);
  const data: unknown = JSON.parse(readFileSync(path, 'utf8'));
  const problems = verifyManifest(data);
  if (problems.length > 0) throw new Error(`Manifiesto de consultas persistidas inválido: ${problems.join(' ')}`);
  const manifest: Manifest = Object.create(null) as Manifest;
  for (const [key, query] of Object.entries(data as Record<string, string>)) manifest[normalizeHash(key) as string] = query;
  return manifest;
}

export type GraphqlRequest =
  | { kind: 'full' } // trae el texto de la consulta
  | { kind: 'persisted'; hash: string | null }; // `hash` es null si no tiene forma de sha256

// Formas con las que un cliente pide una consulta persistida:
//  1. `{ "documentId": "<hash>" }`                                  (graphql-over-http, Appendix A)
//  2. `{ "extensions": { "persistedQuery": { "version": 1, "sha256Hash": "<hash>" } } }`   (urql `persistedExchange`,
//     que es lo que usa el front con el codegen; sin `query`)
//  3. `{ "query": "<hash>", "persisted": true }`                    (forma nativa de Mercurius)
// Cualquier otra cosa con `query` es una consulta completa.
export function classifyRequest(body: Record<string, unknown>): GraphqlRequest {
  const { query, persisted, documentId, extensions } = body;
  if (query !== undefined) {
    return persisted === true && typeof query === 'string' && documentId === undefined
      ? { kind: 'persisted', hash: normalizeHash(query) }
      : { kind: 'full' };
  }
  if (documentId !== undefined) return { kind: 'persisted', hash: normalizeHash(documentId) };
  const apq = typeof extensions === 'object' && extensions !== null ? (extensions as { persistedQuery?: { version?: unknown; sha256Hash?: unknown } }).persistedQuery : undefined;
  if (apq && apq.version === 1) return { kind: 'persisted', hash: normalizeHash(apq.sha256Hash) };
  return { kind: 'persisted', hash: null }; // sin consulta ni hash
}

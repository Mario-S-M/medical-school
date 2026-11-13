import { readFileSync } from 'node:fs';
import { MANIFEST_PATH } from '../../src/modules/graphql/persisted-queries';

// Consultas persistidas por NOMBRE de operación (el manifiesto tiene decenas de entradas y su orden no es contrato).
const MANIFEST = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Record<string, string>;

export function persistedHash(operationName: string): string {
  const found = Object.entries(MANIFEST).find(([, text]) => new RegExp(`^(?:query|mutation)\\s+${operationName}\\b`).test(text));
  if (!found) throw new Error(`La operación ${operationName} no está en el manifiesto`);
  return found[0];
}

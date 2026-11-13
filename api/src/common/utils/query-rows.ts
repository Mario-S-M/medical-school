// TypeORM devuelve `[filas, cantidad]` en los UPDATE y DELETE con RETURNING (en los INSERT y SELECT, solo las filas).
export function rowsOf<T>(result: unknown): T[] {
  return Array.isArray(result) && result.length === 2 && Array.isArray(result[0]) && typeof result[1] === 'number' ? (result[0] as T[]) : (result as T[]);
}

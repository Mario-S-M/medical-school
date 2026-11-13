// Reordena una lista de ids un lugar hacia arriba (`subir`) o hacia abajo (`bajar`). Devuelve el nuevo orden y si cambió:
// subir el primero o bajar el último no cambia nada, y un id que no está en la lista da `null`.
export type Direction = 'subir' | 'bajar';

export function moveItem(ids: readonly string[], id: string, direction: Direction): { order: string[]; changed: boolean } | null {
  const index = ids.indexOf(id);
  if (index === -1) return null;
  const target = direction === 'subir' ? index - 1 : index + 1;
  const order = [...ids];
  if (target < 0 || target >= order.length) return { order, changed: false };
  [order[index], order[target]] = [order[target], order[index]];
  return { order, changed: true };
}

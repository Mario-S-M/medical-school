import { hiddenByAncestors } from './watermark-ancestors';
import { isCovered } from './watermark-covered';
import { hasHiddenStyle } from './watermark-style';

const TOLERANCE_PX = 1;
const MIN_SIZE_PX = 8;

// ¿El rectángulo del texto de la marca cae dentro del contenedor y tiene un tamaño legible?
function textInside(container: HTMLElement, mark: HTMLElement): boolean {
  const range = document.createRange();
  range.selectNodeContents(mark);
  const text = range.getBoundingClientRect();
  const box = mark.getBoundingClientRect();
  const area = container.getBoundingClientRect();
  if (box.height < MIN_SIZE_PX || text.width < MIN_SIZE_PX || text.height < MIN_SIZE_PX) return false;
  if (mark.scrollWidth > mark.clientWidth + TOLERANCE_PX || mark.scrollHeight > mark.clientHeight + TOLERANCE_PX) return false; // recortada
  return (
    text.left >= area.left - TOLERANCE_PX && text.top >= area.top - TOLERANCE_PX &&
    text.right <= area.right + TOLERANCE_PX && text.bottom <= area.bottom + TOLERANCE_PX
  );
}

// La marca es íntegra si es hija directa del contenedor, dice el correo, se ve (color, opacidad efectiva, visibilidad, filtros,
// recortes), cae dentro del contenedor y nada la tapa.
export function isIntact(container: HTMLElement, mark: HTMLElement | null, text: string): boolean {
  if (!mark || !mark.isConnected || mark.parentElement !== container) return false;
  if (mark.textContent?.trim() !== text) return false;
  if (getComputedStyle(mark).visibility !== 'visible' || hiddenByAncestors(mark) || hasHiddenStyle(mark)) return false;
  return textInside(container, mark) && !isCovered(container, mark);
}

// Devuelve la marca a su sitio (si la movieron) para que React pueda reemplazarla sin fallar.
export function reattach(container: HTMLElement, mark: HTMLElement | null) {
  if (mark && mark.parentElement !== container) container.appendChild(mark);
}

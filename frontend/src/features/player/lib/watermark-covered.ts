// ¿Otro elemento tapa por completo la marca? Se mira qué recibe el clic en el centro del texto (la marca tiene `pointer-events: none`,
// así que `elementFromPoint` devuelve lo que está debajo). Es legítimo que lo reciban:
//  - el `<video>` (y su barra de controles), el propio contenedor y sus ancestros;
//  - los controles propios del reproductor (`data-player-ui`: botón de pantalla completa y aviso);
//  - la cabecera fija del sitio (`<header>` sticky), que tapa el video al hacer scroll.
// Si el centro queda fuera de la ventana (scroll) no se puede saber y no se considera tapada.
// Límite: un elemento tapador con `pointer-events: none` no se detecta por este método.
export function isCovered(container: HTMLElement, mark: HTMLElement): boolean {
  const range = document.createRange();
  range.selectNodeContents(mark);
  const box = range.getBoundingClientRect();
  const x = box.left + box.width / 2;
  const y = box.top + box.height / 2;
  if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return false;
  const top = document.elementFromPoint(x, y);
  if (!top || top === mark) return false;
  if (top.tagName === 'VIDEO' && container.contains(top)) return false;
  if (top.contains(container)) return false;
  if (container.contains(top) && top.closest('[data-player-ui]')) return false;
  return !top.closest('header');
}

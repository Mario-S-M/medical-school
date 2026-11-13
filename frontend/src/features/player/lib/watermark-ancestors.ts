import { MIN_OPACITY } from './watermark-style';

// Lo que un ancestro (el contenedor y todo lo que lo envuelve hasta la raíz) hace a la marca: `display: none` y la opacidad
// efectiva (el producto de la opacidad de la marca y de todos sus ancestros). `visibility` ya llega heredado en el estilo calculado
// de la marca, así que se revisa allí.
export function hiddenByAncestors(mark: HTMLElement): boolean {
  let opacity = 1;
  for (let node: HTMLElement | null = mark; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.display === 'none') return true;
    opacity *= Number(style.opacity);
  }
  return opacity < MIN_OPACITY;
}

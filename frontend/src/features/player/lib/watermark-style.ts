import { alphaOf, filterAmount } from './css-values';

export const MIN_OPACITY = 0.1;
const MIN_FONT_PX = 8;
const MAX_BLUR_PX = 3;

// Estilos propios que dejan la marca sin verse aunque siga en el DOM, con su opacidad y visibilidad normales.
// Nuestra marca no usa `filter`, `clip-path`, `mask` ni `mix-blend-mode`: cualquiera de ellos es una manipulación.
export function hasHiddenStyle(mark: HTMLElement): boolean {
  const style = getComputedStyle(mark);
  if (alphaOf(style.color) < MIN_OPACITY) return true; // `color: transparent` o alfa 0
  if (alphaOf(style.getPropertyValue('-webkit-text-fill-color')) < MIN_OPACITY) return true;
  if (parseFloat(style.fontSize) < MIN_FONT_PX) return true;
  if (style.mixBlendMode !== 'normal') return true;
  if (style.clipPath !== 'none' || (style.maskImage && style.maskImage !== 'none')) return true;
  const filter = style.filter;
  if (filter === 'none') return false;
  return (filterAmount(filter, 'opacity') ?? 1) < MIN_OPACITY || (filterAmount(filter, 'brightness') ?? 1) < MIN_OPACITY || (filterAmount(filter, 'blur') ?? 0) > MAX_BLUR_PX;
}

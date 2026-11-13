import type { RefObject } from 'react';
import useFullscreen from '../hooks/use-fullscreen';

export default function FullscreenButton({ containerRef }: { containerRef: RefObject<HTMLElement | null> }) {
  const { active, toggle } = useFullscreen(containerRef);
  return (
    <button
      type="button"
      data-player-ui
      onClick={toggle}
      className="absolute right-2 top-2 z-20 rounded-md bg-black/60 px-3 py-1 text-sm font-medium text-white hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
    >
      {active ? 'Salir' : 'Pantalla completa'}
    </button>
  );
}

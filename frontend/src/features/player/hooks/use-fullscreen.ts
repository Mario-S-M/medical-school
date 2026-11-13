import { useEffect, useState, type RefObject } from 'react';

// Pantalla completa del contenedor (video y marca de agua juntos), no del <video>.
export default function useFullscreen(containerRef: RefObject<HTMLElement | null>) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const sync = () => setActive(document.fullscreenElement === containerRef.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  const toggle = () => {
    const task = active ? document.exitFullscreen() : containerRef.current?.requestFullscreen();
    task?.catch(() => undefined);
  };
  return { active, toggle };
}

import { useEffect, useRef, useState, type RefObject } from 'react';
import { isIntact, reattach } from '../lib/watermark-integrity';

const RESTORE_EVERY_MS = 1000;

type Params = {
  containerRef: RefObject<HTMLDivElement | null>;
  markRef: RefObject<HTMLDivElement | null>;
  videoRef: RefObject<HTMLVideoElement | null>;
  text: string;
};

// Vigila la marca (cambios del DOM + cada 1 s). Si falla: pausa, avisa, la restaura y bloquea el `play`.
export default function useWatermarkGuard({ containerRef, markRef, videoRef, text }: Params) {
  const [tampered, setTampered] = useState(false);
  const [epoch, setEpoch] = useState(0); // cambia la `key` de la marca para que React la vuelva a crear limpia
  const blocked = useRef(false);
  const lastRestore = useRef(0);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const check = () => {
      if (isIntact(container, markRef.current, text)) return;
      blocked.current = true;
      videoRef.current?.pause();
      setTampered(true);
      // La restauración se limita a una por segundo: si algo no se puede arreglar (un elemento fijo que la tapa) no se entra en un
      // bucle de renderizados, y el video sigue pausado.
      if (Date.now() - lastRestore.current < RESTORE_EVERY_MS) return;
      lastRestore.current = Date.now();
      reattach(container, markRef.current);
      setEpoch((value) => value + 1);
    };
    const onPlay = (event: Event) => event.target === videoRef.current && (check(), blocked.current && videoRef.current?.pause());
    const observer = new MutationObserver(check);
    observer.observe(container, { childList: true, attributes: true, subtree: true, characterData: true });
    const timer = setInterval(check, 1000);
    container.addEventListener('play', onPlay, true);
    return () => (observer.disconnect(), clearInterval(timer), container.removeEventListener('play', onPlay, true));
  }, [text]);
  return { tampered, epoch };
}

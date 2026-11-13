import type { RefObject } from 'react';
import useWatermarkPosition from '../hooks/use-watermark-position';

const CLASSES =
  'pointer-events-none absolute z-10 w-max max-w-full select-none break-all text-sm font-semibold text-white opacity-35 ' +
  'transition-[left,top,transform] duration-[1500ms] ease-in-out [text-shadow:0_0_3px_#000,0_0_8px_#000]';

// Correo de quien mira, flotando sobre el video. No recibe clics y cambia de lugar cada pocos segundos.
export default function Watermark({ markRef, text }: { markRef: RefObject<HTMLDivElement | null>; text: string }) {
  const { x, y } = useWatermarkPosition();
  return (
    <div ref={markRef} aria-hidden="true" className={CLASSES} style={{ left: `${x}%`, top: `${y}%`, transform: `translate(-${x}%, -${y}%)` }}>
      {text}
    </div>
  );
}

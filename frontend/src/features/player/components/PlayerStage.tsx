import { useRef, type RefObject } from 'react';
import useWatermarkGuard from '../hooks/use-watermark-guard';
import FullscreenButton from './FullscreenButton';
import TamperNotice from './TamperNotice';
import Watermark from './Watermark';

type Props = { email: string; containerRef: RefObject<HTMLDivElement | null>; videoRef: RefObject<HTMLVideoElement | null> };

const CONTAINER = 'relative aspect-video w-full overflow-hidden rounded-xl bg-black [&:fullscreen]:aspect-auto [&:fullscreen]:h-screen [&:fullscreen]:rounded-none';

// Contenedor único: el video, la marca de agua y el aviso viven juntos, así la pantalla completa no pierde la marca.
export default function PlayerStage({ email, containerRef, videoRef }: Props) {
  const markRef = useRef<HTMLDivElement>(null);
  const { tampered, epoch } = useWatermarkGuard({ containerRef, markRef, videoRef, text: email });
  return (
    <div ref={containerRef} role="group" aria-label="Reproductor de la clase" className={CONTAINER}>
      <video
        ref={videoRef}
        className="h-full w-full object-contain"
        controls
        controlsList="nodownload nofullscreen noremoteplayback"
        disablePictureInPicture
        disableRemotePlayback
        playsInline
        onContextMenu={(event) => event.preventDefault()}
      />
      <Watermark key={epoch} markRef={markRef} text={email} />
      <FullscreenButton containerRef={containerRef} />
      {tampered && <TamperNotice />}
    </div>
  );
}

import { useRef } from 'react';
import useHls from '../hooks/use-hls';
import usePlayback from '../hooks/use-playback';
import { formatDuration } from '../lib/format-duration';
import PlayerStage from './PlayerStage';

export default function ClassPlayback({ lessonId }: { lessonId: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { auth, error, renewError, tokenRef, renew } = usePlayback(lessonId, videoRef);
  const { failed } = useHls({ videoRef, auth, tokenRef, renew });
  if (error) return <p role="alert" className="mx-auto rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">{error}</p>;
  if (!auth) return <p role="status" className="text-center text-slate-500">Cargando…</p>;
  return (
    <section className="mx-auto w-full max-w-3xl space-y-3">
      <PlayerStage email={auth.marca_agua} containerRef={containerRef} videoRef={videoRef} />
      {renewError && <p role="alert" className="text-red-700">{renewError} Recarga la página para seguir viendo la clase.</p>}
      {failed && <p role="alert" className="text-red-700">No se pudo reproducir el video. Recarga la página para intentarlo de nuevo.</p>}
      {auth.duracion_segundos != null && <p className="text-sm text-slate-500">Duración: {formatDuration(auth.duracion_segundos)}</p>}
    </section>
  );
}

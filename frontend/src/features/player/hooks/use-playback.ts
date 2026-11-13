import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { authorizePlayback } from '../api/authorize-playback.mutation';
import { playbackMessage } from '../lib/playback-messages';
import type { PlaybackAuthorization } from '../schemas/playback-schema';

const RENEW_AT = 0.8; // se renueva al 80 % de la vida de la autorización

// Pide la autorización y la renueva. El token vive solo en memoria (ref), nunca en almacenamiento ni en la URL.
export default function usePlayback(lessonId: number, videoRef: RefObject<HTMLVideoElement | null>) {
  const [auth, setAuth] = useState<PlaybackAuthorization | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renewError, setRenewError] = useState<string | null>(null); // la renovación falló: el video sigue hasta que venza
  const tokenRef = useRef('');
  const lease = useRef({ issuedAt: 0, lifeMs: 0 });
  const busy = useRef(false);
  const mutation = useMutation({
    mutationFn: () => authorizePlayback(lessonId),
    onMutate: () => (busy.current = true),
    onSettled: () => (busy.current = false),
    onSuccess: (data) => {
      tokenRef.current = data.token;
      lease.current = { issuedAt: Date.now(), lifeMs: data.expira_en * 1000 };
      setRenewError(null);
      setAuth(data);
    },
    onError: (e) => (lease.current.issuedAt === 0 ? setError(playbackMessage(e)) : setRenewError(playbackMessage(e))),
  });
  const renew = () => busy.current || mutation.mutate();
  const dueForRenewal = () => Date.now() - lease.current.issuedAt >= lease.current.lifeMs * RENEW_AT;

  useEffect(() => mutation.mutate(), [lessonId]);
  useEffect(() => {
    if (!auth) return;
    const timer = setTimeout(() => !videoRef.current?.paused && renew(), auth.expira_en * 1000 * RENEW_AT);
    const onPlay = (event: Event) => event.target === videoRef.current && dueForRenewal() && renew(); // en pausa: renueva al reanudar
    document.addEventListener('play', onPlay, true);
    return () => (clearTimeout(timer), document.removeEventListener('play', onPlay, true));
  }, [auth]);
  return { auth, error, renewError, tokenRef, renew };
}

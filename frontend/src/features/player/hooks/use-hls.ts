import type Hls from 'hls.js';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { createHls } from '../lib/create-hls';
import { reloadSource } from '../lib/reload-source';
import type { PlaybackAuthorization } from '../schemas/playback-schema';

type Params = { videoRef: RefObject<HTMLVideoElement | null>; auth: PlaybackAuthorization | null; tokenRef: RefObject<string>; renew: () => void };

// Crea `Hls` con la primera autorización y, en cada renovación, recarga la lista con el token nuevo.
export default function useHls({ videoRef, auth, tokenRef, renew }: Params) {
  const hlsRef = useRef<Hls | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => () => (hlsRef.current?.destroy(), void (hlsRef.current = null)), []);
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !auth) return;
    if (hlsRef.current) return reloadSource(hlsRef.current, video, auth.lista_url);
    hlsRef.current = createHls(video, tokenRef, { renew, onFatal: () => setFailed(true) });
    hlsRef.current.loadSource(auth.lista_url);
  }, [auth]);
  return { failed };
}

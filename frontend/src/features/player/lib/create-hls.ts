import Hls from 'hls.js';
import type { RefObject } from 'react';

const PROTECTED_PATH = '/api/v1/reproducciones/';

// El token solo viaja hacia la API de reproducción (mismo origen), nunca hacia Storage (/almacen).
const needsToken = (url: string) => {
  const target = new URL(url, window.location.href);
  return target.origin === window.location.origin && target.pathname.startsWith(PROTECTED_PATH);
};

type Callbacks = { renew: () => void; onFatal: () => void };

export function createHls(video: HTMLVideoElement, tokenRef: RefObject<string>, { renew, onFatal }: Callbacks): Hls {
  const hls = new Hls({
    xhrSetup: (xhr, url) => {
      if (needsToken(url)) xhr.setRequestHeader('Authorization', `Bearer ${tokenRef.current}`);
    },
  });
  let retried = false;
  hls.on(Hls.Events.FRAG_LOADED, () => (retried = false));
  hls.on(Hls.Events.ERROR, (_event, data) => {
    // Un 401/403 (URL firmada o token vencidos) no se arregla reintentando la misma petición, y hls.js reintentaría unos 30 s
    // con espera creciente antes de rendirse: se renueva en cuanto aparece, aunque el error todavía no sea fatal.
    const denied = data.type === Hls.ErrorTypes.NETWORK_ERROR && [401, 403].includes(data.response?.code ?? 0);
    if (!data.fatal && !denied) return;
    if (data.type === Hls.ErrorTypes.NETWORK_ERROR && !retried) {
      retried = true;
      return renew(); // la URL firmada o el token pudieron vencer: se renueva y se reintenta una vez
    }
    if (data.fatal) onFatal();
  });
  hls.attachMedia(video);
  return hls;
}

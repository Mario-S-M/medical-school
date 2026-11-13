import type Hls from 'hls.js';

// Vuelve a pedir la lista (con el token nuevo) y sigue en el mismo segundo, conservando reproduciendo o pausado.
export function reloadSource(hls: Hls, video: HTMLVideoElement, url: string) {
  const time = video.currentTime;
  const wasPlaying = !video.paused;
  hls.config.startPosition = time;
  hls.loadSource(url);
  hls.startLoad(time);
  if (wasPlaying) void video.play().catch(() => undefined);
}

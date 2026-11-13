// Lee la duración (en minutos) de un archivo de video con un elemento <video> en memoria; null si el navegador no puede.
export default function useVideoDuration() {
  const read = (file: File) =>
    new Promise<number | null>((resolve) => {
      const video = document.createElement('video');
      const url = URL.createObjectURL(file);
      const finish = (minutes: number | null) => (URL.revokeObjectURL(url), resolve(minutes));
      const timeout = setTimeout(() => finish(null), 5000);
      video.preload = 'metadata';
      video.onloadedmetadata = () => (clearTimeout(timeout), finish(Number.isFinite(video.duration) ? video.duration / 60 : null));
      video.onerror = () => (clearTimeout(timeout), finish(null));
      video.src = url;
    });
  return { read };
}

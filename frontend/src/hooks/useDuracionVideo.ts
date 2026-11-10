// Lee la duración (en minutos) de un archivo de video con un elemento <video> en memoria; null si el navegador no puede.
export default function useDuracionVideo() {
  const leer = (archivo: File) =>
    new Promise<number | null>((resolver) => {
      const video = document.createElement('video');
      const url = URL.createObjectURL(archivo);
      const terminar = (minutos: number | null) => (URL.revokeObjectURL(url), resolver(minutos));
      const espera = setTimeout(() => terminar(null), 5000);
      video.preload = 'metadata';
      video.onloadedmetadata = () => (clearTimeout(espera), terminar(Number.isFinite(video.duration) ? video.duration / 60 : null));
      video.onerror = () => (clearTimeout(espera), terminar(null));
      video.src = url;
    });
  return { leer };
}

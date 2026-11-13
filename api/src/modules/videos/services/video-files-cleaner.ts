// Punto de extensión del borrado de archivos de video. Al borrar una clase, una sección o un video, el temario borra las
// filas y avisa a quien implemente esta clase para que borre los archivos de Storage (la carpeta `<ruta_base>` de cada
// video, que incluye `hls/` y, si sigue ahí, el original). La implementación real es `StorageVideoFilesCleaner`.
export abstract class VideoFilesCleaner {
  abstract deleteFolders(basePaths: string[]): Promise<void>;
}

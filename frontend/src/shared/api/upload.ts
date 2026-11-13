import axios from 'axios';

export class UploadError extends Error {}

// Instancia aparte, sin interceptores: el archivo va directo a Storage con la URL firmada (sin token de la API).
const storage = axios.create();

export async function uploadFile(url: string, file: File, onProgress?: (percent: number) => void) {
  try {
    await storage.put(url, file, {
      headers: { 'Content-Type': file.type },
      onUploadProgress: (e) => e.total && onProgress?.(Math.round((e.loaded / e.total) * 100)),
    });
  } catch {
    throw new UploadError('subida');
  }
}

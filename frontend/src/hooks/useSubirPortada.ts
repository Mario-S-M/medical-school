import { useState } from 'react';
import { conSesion } from '../api/con_sesion';
import { mensajeDeError } from '../api/errores';
import { MAX_BYTES_PORTADA, TIPOS_PORTADA, confirmarPortada, subirArchivo, urlSubidaPortada } from '../api/portadas';

class ErrorSubida extends Error {}

// Pide la URL firmada, sube el archivo a Storage y confirma la portada en el curso.
export default function useSubirPortada(cursoId: number, alTerminar: () => void) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function subir(archivo: File) {
    setError(null);
    if (!TIPOS_PORTADA.includes(archivo.type)) return setError('La portada debe ser una imagen JPG, PNG o WebP.');
    if (archivo.size > MAX_BYTES_PORTADA) return setError('La portada no puede pesar más de 2 MB.');
    setSubiendo(true);
    try {
      const firma = await conSesion((t) => urlSubidaPortada(t, { curso_id: cursoId, tipo_contenido: archivo.type, tamano_bytes: archivo.size }));
      if (!(await subirArchivo(firma.url_subida, archivo)).ok) throw new ErrorSubida();
      await conSesion((t) => confirmarPortada(t, { curso_id: cursoId, ruta: firma.ruta }));
      alTerminar();
    } catch (e) {
      setError(e instanceof ErrorSubida ? 'No se pudo subir la imagen. Inténtalo de nuevo.' : mensajeDeError(e));
    } finally {
      setSubiendo(false);
    }
  }
  return { subir, subiendo, error };
}
